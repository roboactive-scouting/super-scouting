import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, buttonVariants } from '@/components/ui/button';
import { DestructiveConfirm } from '@/components/ui/destructive-confirm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorLine, Notice } from '@/components/ui/notice';
import { useDeviceQuery } from '@/data/useDeviceQuery';
import { wipeDevice, type WipeAnyway } from '@/data/wipe';
import { PATHS } from '@/lib/paths';
import { heldCount, heldLines, isHeld, readWipeHold, type WipeHold } from './wipeHold';

/** What the lead types back to confirm (SPEC-FINAL 17.8: a multi-record irreversible). */
export const WIPE_PHRASE = 'wipe this device';

export const WRONG_CODE_LINE = 'That is not the lead’s code. Nothing was wiped.';

/**
 * Wipe anyway's loss line (SPEC-FINAL 9.9, v1.39): "3 records have not reached the cloud. Wiping
 * now deletes them for good."
 */
export function lostLine(n: number): string {
  return n === 1
    ? '1 record has not reached the cloud. Wiping now deletes it for good.'
    : `${n} records have not reached the cloud. Wiping now deletes them for good.`;
}

/** Wipe anyway refused because a record was saved after the count was read. */
export function countChangedLine(n: number): string {
  return `The count changed: ${n} ${n === 1 ? 'record has' : 'records have'} not reached the cloud now. Nothing was wiped.`;
}

/**
 * Wipe this device (SPEC-FINAL 9.9, 17.8; 16-settings final; task 1.49), opened from Settings
 * only. The one destructive pattern with **Keep this device** first. While anything would be lost
 * (`readWipeHold`, read live) it is held: the final's warning line, and the wipe button off. With
 * nothing waiting it asks for the lead's code and the typed phrase before the filled-ink button
 * enables; a wrong code says so here and wipes nothing. A wipe signs out, so the app leaves for
 * sign-in on its own.
 *
 * **Wipe anyway** (v1.39; Phase 1 H side task 2): under the held line, **Send by QR first** opens
 * the sender (`/sync/qr/send`) so the unsent records can be copied to another device, and the
 * destructive **Wipe anyway…** turns this same confirmation into the second, harder one: the loss
 * as a count, the lead's code, and that count typed before the filled-ink **Wipe anyway**
 * enables. The count is read live; the wipe itself checks it again in its own transaction.
 */
export function DeviceWipe({ onClose }: { onClose: () => void }) {
  const id = useId();
  const hold = useDeviceQuery<WipeHold>(readWipeHold, [], ['outbox']);
  const [anyway, setAnyway] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const held = hold !== undefined && isHeld(hold);
  const open = hold !== undefined && !held;
  // The count the confirm was sent with: while it runs (and after, until sign-out takes the app
  // to sign-in) the sheet keeps it rather than flipping to the emptied device's 0.
  const [sent, setSent] = useState<number | null>(null);
  // Everything sent while the second confirmation was up: back to the normal wipe.
  const forcing = anyway && (held || (busy && sent !== null));
  const lost = busy && sent !== null ? sent : hold === undefined ? 0 : heldCount(hold);

  function startAnyway() {
    setAnyway(true);
    setCode('');
    setCodeError(false);
    setError(null);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const force: WipeAnyway | undefined = forcing ? { force: true, expected: lost } : undefined;
      setSent(force ? lost : null);
      const result = await wipeDevice(code, force);
      if (result.ok) return; // signed out: the shell leaves for sign-in
      setBusy(false);
      setSent(null);
      if (result.reason === 'wrong-code') {
        setCodeError(true);
        return;
      }
      if (result.reason === 'wrong-count') {
        setError(countChangedLine(result.unacked));
        return;
      }
      setError(
        `${result.unacked} ${result.unacked === 1 ? 'record has' : 'records have'} not reached the cloud. Nothing was wiped.`,
      );
    } catch {
      setBusy(false);
      setSent(null);
      setError('The wipe did not finish. Try again.');
    }
  }

  const codeField = (
    <div>
      <Label htmlFor={`${id}-code`} className="font-semibold">
        Lead’s code
      </Label>
      <Input
        id={`${id}-code`}
        mono
        value={code}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={codeError || undefined}
        aria-describedby={codeError ? `${id}-wrong` : undefined}
        onChange={(e) => {
          setCode(e.target.value);
          setCodeError(false);
        }}
        className="mt-1.5"
      />
      {codeError && (
        <ErrorLine id={`${id}-wrong`} className="mt-2">
          {WRONG_CODE_LINE}
        </ErrorLine>
      )}
    </div>
  );

  if (forcing) {
    return (
      <DestructiveConfirm
        key="anyway"
        open
        title="Wipe anyway?"
        objectName="Everything this app keeps on this device"
        body="Each one is listed in Discarded records, without its values. Then the device is wiped and signs out."
        loss={lostLine(lost)}
        cancelLabel="Keep this device"
        confirmLabel="Wipe anyway"
        icon={null}
        typeToConfirm={String(lost)}
        ready={code.trim() !== ''}
        busy={busy}
        error={error}
        onConfirm={() => void confirm()}
        onCancel={onClose}
      >
        {codeField}
      </DestructiveConfirm>
    );
  }

  return (
    <DestructiveConfirm
      key="wipe"
      open
      title="Wipe this device?"
      objectName="Everything this app keeps on this device"
      body="Removes it all and signs out. For a phone you are handing on."
      cancelLabel="Keep this device"
      confirmLabel="Wipe this device"
      icon={null}
      typeToConfirm={open ? WIPE_PHRASE : undefined}
      ready={code.trim() !== ''}
      held={
        hold === undefined ? (
          'Checking what is waiting to send.'
        ) : open ? null : (
          <Held hold={hold} onAnyway={startAnyway} />
        )
      }
      busy={busy}
      error={error}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    >
      {open && codeField}
    </DestructiveConfirm>
  );
}

/**
 * The final's held line: a warning edge, what holds it in bold, then what lets it go. Under it
 * (v1.39) the two ways out: Send by QR first, and the destructive Wipe anyway….
 */
function Held({ hold, onAnyway }: { hold: WipeHold; onAnyway: () => void }) {
  const { what, until } = heldLines(hold);
  return (
    <div className="grid gap-3">
      <Notice tone="warning" still role="status">
        <b className="font-bold">{what}</b> {until}
      </Notice>
      <div className="flex flex-wrap gap-2">
        <Link to={PATHS.syncQrSend} className={buttonVariants({ variant: 'secondary' })}>
          Send by QR first
        </Link>
        <Button variant="destructive" onClick={onAnyway}>
          Wipe anyway…
        </Button>
      </div>
    </div>
  );
}
