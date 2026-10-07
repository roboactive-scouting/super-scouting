import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Clock } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Note, WarningNotice } from '@/components/ui/notice';
import { AuthError, AuthField, AuthFrame, AuthSubmit } from './AuthFrame';
import { OFFLINE_SIGN_IN_LINE } from './messages';
import {
  offlineLogin,
  signInErrorLine,
  signInWithFallback,
  type OfflineSignIn,
} from './offlineLogin';
import type { SessionUser } from './session';
import { useSession } from './useSession';
import { PATHS } from '@/lib/paths';
import { useOnline } from '@/lib/useOnline';

export const EXPIRED_LINE =
  'Your sign-in expired. Everything you entered is saved on this device and will sync after you sign in.';

export type { OfflineSignIn };

const home = (user: SessionUser) => (user.must_change_password ? PATHS.changePassword : PATHS.home);

/**
 * `offlineSignIn` is how the cached-hash path is reached (task 1.16): the server is tried
 * first, and on any outcome that is not its definitive answer — no connection, the
 * deadline (8 s, then one 12 s retry when the device says it is online), a 5xx, a captive
 * portal — the credentials are checked on the device
 * (`offlineLogin` by default; tests may inject their own).
 */
export function LoginPage({
  offlineSignIn = offlineLogin,
}: { offlineSignIn?: OfflineSignIn } = {}) {
  const navigate = useNavigate();
  const current = useSession();
  const online = useOnline();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const prefilled = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  // An expired session keeps its user: offer the same name back (SPEC-FINAL 7.5).
  useEffect(() => {
    if (prefilled.current || !current?.expired) return;
    prefilled.current = true;
    setUsername(current.user.username);
    passwordRef.current?.focus();
  }, [current]);

  if (current === undefined) return null;
  // Already signed in (or just signed in): straight on. Same target as the submit below.
  if (current && !current.expired) return <Navigate to={home(current.user)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const name = username.trim();
    if (name === '' || password === '') {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    try {
      const { user, offline } = await signInWithFallback(name, password, {
        offline: offlineSignIn,
      });
      // An offline session is never sent to the change-password screen: that needs the
      // server, and entering match data comes first (the shell says it is offline).
      navigate(offline ? PATHS.home : home(user), { replace: true });
    } catch (err) {
      setError(signInErrorLine(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Sign in" compact={Boolean(current?.expired) || !online}>
      {current?.expired && (
        <div role="status" className="mt-4">
          <WarningNotice icon={Clock}>{EXPIRED_LINE}</WarningNotice>
        </div>
      )}
      {!online && (
        <div role="status" className="mt-4">
          <Note icon="offline">{OFFLINE_SIGN_IN_LINE}</Note>
        </div>
      )}
      <form noValidate onSubmit={(e) => void submit(e)}>
        <AuthField
          label="Username"
          type="text"
          value={username}
          autoComplete="username"
          onChange={setUsername}
        />
        <AuthField
          label="Password"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={setPassword}
          hint="Forgot it? Ask an admin to reset it."
          inputRef={passwordRef}
        />
        <AuthError message={error} />
        <AuthSubmit busy={busy} label="Sign in" busyLabel="Signing in…" />
      </form>
    </AuthFrame>
  );
}
