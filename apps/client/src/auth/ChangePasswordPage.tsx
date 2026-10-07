import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { passwordSchema } from '@frc/shared';
import { buttonVariants } from '@/components/ui/button';
import { LiveChecks, type LiveCheck } from '@/components/ui/live-checks';
import { Note } from '@/components/ui/notice';
import { call, RpcError } from '@/data/rpc';
import { AuthError, AuthField, AuthFrame, AuthSubmit } from './AuthFrame';
import { accountErrorLine, sentence } from './messages';
import { needsSignIn, session } from './session';
import { useSession } from './useSession';
import { PATHS } from '@/lib/paths';
import { useOnline } from '@/lib/useOnline';
import { cn } from '@/lib/utils';

export const OFFLINE_PASSWORD_LINE =
  'No connection. Changing your password needs the server — try again when this device is online.';

/** Idle until there is something to check; the length rule is the server's own (passwordSchema). */
export function passwordChecks(newPassword: string, confirm: string): LiveCheck[] {
  const long = passwordSchema.safeParse(newPassword).success;
  return [
    {
      label: 'At least 8 characters',
      state: newPassword === '' ? 'idle' : long ? 'ok' : 'no',
    },
    {
      label: 'Both new passwords match',
      state: confirm === '' ? 'idle' : confirm === newPassword ? 'ok' : 'no',
    },
  ];
}

/**
 * SPEC-FINAL 7.3: the one password action a non-admin has — changing their own, given the
 * current one. Reached from sign-in when an admin set `must_change_password`, or from the
 * footer. It needs the server; there is no offline path.
 */
export function ChangePasswordPage() {
  const navigate = useNavigate();
  const current = useSession();
  const online = useOnline();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (current === undefined) return null;
  if (current === null || needsSignIn(current)) return <Navigate to="/login" replace />;
  const forced = current.user.must_change_password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (currentPassword === '') {
      setError('Enter your current password.');
      return;
    }
    // The same rule and the same sentence the server uses (packages/shared passwordSchema).
    const checked = passwordSchema.safeParse(newPassword);
    if (!checked.success) {
      setError(sentence(checked.error.issues[0]?.message ?? ''));
      return;
    }
    if (newPassword !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const updated = await call('changeOwnPassword', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      await session.updateUser({
        must_change_password: updated.must_change_password,
        full_name: updated.full_name,
        role: updated.role,
      });
      navigate(PATHS.home, { replace: true });
    } catch (err) {
      // rpc has already expired the session on a 401; sign-in keeps the username.
      if (err instanceof RpcError && err.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      setError(accountErrorLine(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title={forced ? 'Choose a new password' : 'Change your password'} compact>
      {!online && (
        <div role="status" className="mt-4">
          <Note icon="offline">{OFFLINE_PASSWORD_LINE}</Note>
        </div>
      )}
      {forced && (
        <p className="mt-2 text-sm leading-[1.45] text-muted">
          An admin set a temporary password for this account. Choose your own to carry on.
        </p>
      )}
      <form noValidate onSubmit={(e) => void submit(e)}>
        <AuthField
          label="Current password"
          type="password"
          value={currentPassword}
          autoComplete="current-password"
          onChange={setCurrentPassword}
        />
        <AuthField
          label="New password"
          type="password"
          value={newPassword}
          autoComplete="new-password"
          onChange={setNewPassword}
        >
          <LiveChecks checks={passwordChecks(newPassword, confirm)} />
        </AuthField>
        <AuthField
          label="Confirm new password"
          type="password"
          value={confirm}
          autoComplete="new-password"
          onChange={setConfirm}
        />
        <AuthError message={error} />
        <AuthSubmit
          busy={busy}
          disabled={!online}
          label="Change password"
          busyLabel="Changing password…"
        />
      </form>
      {!forced && (
        <Link
          to={PATHS.scout}
          className={cn(buttonVariants({ variant: 'ghost', size: 'block' }), 'mt-2.5 min-h-12')}
        >
          Back to scouting
        </Link>
      )}
    </AuthFrame>
  );
}
