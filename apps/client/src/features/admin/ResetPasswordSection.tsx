import { Dices } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { passwordSchema, type PublicUser } from '@frc/shared';
import { sentence } from '@/auth/messages';
import type { Rpc } from '@/data/rpc';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Handover } from '@/components/ui/handover';
import { Input } from '@/components/ui/input';
import { ErrorLine } from '@/components/ui/notice';
import { adminErrorLine } from './adminMessages';
import { generatePassword } from './password';

/**
 * There is no self-service reset: the admin sets a new password, hands it over once, and
 * it lives in this component's state only (never Dexie, storage or the URL).
 */
export function ResetPasswordSection({
  user,
  rpc,
  onChanged,
}: {
  user: PublicUser;
  rpc: Rpc;
  onChanged: (u: PublicUser) => void;
}) {
  const id = useId();
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<{ password: string; mustChange: boolean } | null>(null);

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
    setShown(null);
    try {
      const updated = (await rpc.call('resetPassword', {
        user_id: user.id,
        password,
        must_change: mustChange,
      })) as PublicUser;
      onChanged(updated);
      setShown({ password, mustChange });
      setPassword('');
      setMustChange(true);
    } catch (err) {
      setError(adminErrorLine(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card as="section" className="px-[18px] py-4">
      <form aria-labelledby={`${id}-title`} noValidate onSubmit={(e) => void submit(e)}>
        <CardTitle id={`${id}-title`}>Reset password</CardTitle>
        <CardDescription className="leading-[1.45]">
          There is no self-service reset: you set a new one and hand it over. It does not sign them
          out of devices already signed in — to cut access, disable the account.
        </CardDescription>
        {shown && (
          <div className="enter-rise mt-3">
            <Handover
              title={
                <>
                  New password for <span dir="auto">{user.full_name}</span>
                </>
              }
              secret={shown.password}
              note={`Hand it over now. It is shown once and kept nowhere${shown.mustChange ? '; they choose their own at next sign-in.' : '.'}`}
              actions={
                <Button size="sm" onClick={() => setShown(null)}>
                  Done
                </Button>
              }
            />
          </div>
        )}
        <label htmlFor={`${id}-password`} className="mt-3 block text-sm font-semibold text-ink">
          New password
        </label>
        <div className="mt-1.5 flex items-center gap-2.5">
          <Input
            id={`${id}-password`}
            mono
            value={password}
            placeholder="At least 8 characters"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            dir="ltr"
            aria-invalid={error !== null ? true : undefined}
            aria-describedby={error !== null ? `${id}-error` : undefined}
            className="flex-1"
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button onClick={() => setPassword(generatePassword())}>
            <Dices aria-hidden="true" />
            Generate
          </Button>
          <Button type="submit" variant="primary" busy={busy} busyLabel="Resetting…">
            Reset password
          </Button>
        </div>
        <label className="tap-target mt-1 flex cursor-pointer items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={mustChange}
            className="size-5 shrink-0 cursor-pointer accent-accent"
            onChange={(e) => setMustChange(e.target.checked)}
          />
          Ask them to change it at next sign-in
        </label>
        {error && (
          <ErrorLine id={`${id}-error`} className="mt-2">
            {error}
          </ErrorLine>
        )}
      </form>
    </Card>
  );
}
