import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { passwordSchema } from '@frc/shared';
import { call, RpcError } from '@/data/rpc';
import { AuthError, AuthField, AuthFrame, AuthSubmit } from './AuthFrame';
import { accountErrorLine, sentence } from './messages';
import { needsSignIn, session } from './session';
import { useSession } from './useSession';

/**
 * SPEC-FINAL 7.3: the one password action a non-admin has — changing their own, given the
 * current one. Reached from sign-in when an admin set `must_change_password`, or from the
 * footer. It needs the server; there is no offline path.
 */
export function ChangePasswordPage() {
  const navigate = useNavigate();
  const current = useSession();
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
      navigate('/', { replace: true });
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
    <AuthFrame title={forced ? 'Choose a new password' : 'Change your password'}>
      {forced && (
        <p className="mt-2 text-sm text-[var(--text-muted)]">
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
          hint="At least 8 characters."
        />
        <AuthField
          label="Confirm new password"
          type="password"
          value={confirm}
          autoComplete="new-password"
          onChange={setConfirm}
        />
        <AuthError message={error} />
        <AuthSubmit busy={busy} label="Change password" busyLabel="Changing password…" />
      </form>
      {!forced && (
        <Link
          to="/"
          className="tap-target mt-2 flex w-full items-center justify-center rounded-lg border border-[var(--border)]"
        >
          Back to scouting
        </Link>
      )}
    </AuthFrame>
  );
}
