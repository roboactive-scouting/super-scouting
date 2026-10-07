import { Dices } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { passwordSchema, type PublicUser } from '@frc/shared';
import { sentence } from '@/auth/messages';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Handover } from '@/components/ui/handover';
import { Input } from '@/components/ui/input';
import { ErrorLine } from '@/components/ui/notice';
import type { Rpc } from '@/data/rpc';
import { adminErrorLine } from './adminMessages';
import { generatePassword } from './password';

/**
 * The row's "Reset password" (design 08-users): a small dialog with a generated password,
 * the must-change box, then the one-time handover. The password lives in this component's
 * state only and is dropped when the dialog closes.
 */
export function ResetPasswordDialog({
  user,
  rpc,
  onClose,
  onChanged,
}: {
  user: PublicUser;
  rpc: Rpc;
  onClose: () => void;
  onChanged: (user: PublicUser) => void;
}) {
  const id = useId();
  const [password, setPassword] = useState(() => generatePassword());
  const [mustChange, setMustChange] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<{ password: string; mustChange: boolean } | null>(null);

  // The form is gone once the handover shows: focus moves to its Done button.
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (shown) done.current?.focus();
  }, [shown]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const checked = passwordSchema.safeParse(password);
    if (!checked.success) {
      setError(
        sentence(`for the password, ${checked.error.issues[0]?.message ?? 'that is not valid'}`),
      );
      return;
    }
    setBusy(true);
    try {
      const input = { user_id: user.id, password, must_change: mustChange };
      onChanged((await rpc.call('resetPassword', input)) as PublicUser);
      setShown({ password, mustChange });
    } catch (err) {
      setError(adminErrorLine(err));
    } finally {
      setBusy(false);
    }
  }

  if (shown) {
    return (
      <Dialog
        open
        title="Reset password"
        width={460}
        onClose={onClose}
        footer={
          <Button ref={done} variant="primary" onClick={onClose}>
            Done
          </Button>
        }
      >
        <Handover
          title={<span dir="auto">{`New password for ${user.full_name}`}</span>}
          secret={shown.password}
          note={`Hand it over now. It is shown once and kept nowhere${shown.mustChange ? '; they choose their own at next sign-in.' : '.'}`}
        />
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      title="Reset password"
      width={460}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={`${id}-form`}
            variant="primary"
            busy={busy}
            busyLabel="Resetting…"
          >
            Reset password
          </Button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        aria-label="Reset password"
        noValidate
        onSubmit={(e) => void submit(e)}
        className="flex flex-col gap-3"
      >
        <p className="font-bold" dir="auto">
          {user.full_name}
        </p>
        <p className="text-sm text-ink-2">
          There is no self-service reset: you set a new one and hand it over. It does not sign them
          out of devices already signed in — to cut access, disable the account.
        </p>
        <div>
          <label htmlFor={`${id}-pw`} className="block text-sm font-semibold text-ink">
            New password
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <Input
              id={`${id}-pw`}
              mono
              value={password}
              dir="ltr"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={error !== null || undefined}
              aria-describedby={error !== null ? `${id}-error` : undefined}
              className="flex-1"
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button onClick={() => setPassword(generatePassword())}>
              <Dices aria-hidden="true" />
              Generate
            </Button>
          </div>
        </div>
        <label className="tap-target flex cursor-pointer items-center gap-3 text-sm font-semibold text-ink-2">
          <input
            type="checkbox"
            checked={mustChange}
            className="size-5 shrink-0 cursor-pointer accent-accent"
            onChange={(e) => setMustChange(e.target.checked)}
          />
          Ask them to change it at next sign-in
        </label>
        {error && <ErrorLine id={`${id}-error`}>{error}</ErrorLine>}
      </form>
    </Dialog>
  );
}
