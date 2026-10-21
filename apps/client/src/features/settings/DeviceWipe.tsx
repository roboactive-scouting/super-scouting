import { useId, useState } from 'react';
import { DestructiveConfirm } from '@/components/ui/destructive-confirm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorLine, Notice } from '@/components/ui/notice';
import { useDeviceQuery } from '@/data/useDeviceQuery';
import { wipeDevice } from '@/data/wipe';
import { heldLines, isHeld, readWipeHold, type WipeHold } from './wipeHold';

/** What the lead types back to confirm (SPEC-FINAL 17.8: a multi-record irreversible). */
export const WIPE_PHRASE = 'wipe this device';

export const WRONG_CODE_LINE = 'That is not the lead’s code. Nothing was wiped.';

/**
 * Wipe this device (SPEC-FINAL 9.9, 17.8; 16-settings final; task 1.49), opened from Settings
 * only. The one destructive pattern with **Keep this device** first. While anything would be lost
 * (`readWipeHold`, read live) it is held: the final's warning line, and the wipe button off. With
 * nothing waiting it asks for the lead's code and the typed phrase before the filled-ink button
 * enables; a wrong code says so here and wipes nothing. A wipe signs out, so the app leaves for
 * sign-in on its own.
 */
export function DeviceWipe({ onClose }: { onClose: () => void }) {
  const id = useId();
  const hold = useDeviceQuery<WipeHold>(readWipeHold, [], ['outbox']);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = hold !== undefined && !isHeld(hold);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const result = await wipeDevice(code);
      if (result.ok) return; // signed out: the shell leaves for sign-in
      setBusy(false);
      if (result.reason === 'wrong-code') {
        setCodeError(true);
        return;
      }
      setError(
        `${result.unacked} ${result.unacked === 1 ? 'record has' : 'records have'} not reached the cloud. Nothing was wiped.`,
      );
    } catch {
      setBusy(false);
      setError('The wipe did not finish. Try again.');
    }
  }

  return (
    <DestructiveConfirm
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
          <Held hold={hold} />
        )
      }
      busy={busy}
      error={error}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    >
      {open && (
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
      )}
    </DestructiveConfirm>
  );
}

/** The final's held line: a warning edge, what holds it in bold, then what lets it go. */
function Held({ hold }: { hold: WipeHold }) {
  const { what, until } = heldLines(hold);
  return (
    <Notice tone="warning" still role="status">
      <b className="font-bold">{what}</b> {until}
    </Notice>
  );
}
