import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
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

export const EXPIRED_LINE =
  'Your sign-in expired. Everything you entered is saved on this device and will sync after you sign in.';

export type { OfflineSignIn };

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

const home = (user: SessionUser) => (user.must_change_password ? '/change-password' : '/');

/**
 * `offlineSignIn` is how the cached-hash path is reached (task 1.16): the server is tried
 * first, and on any outcome that is not its definitive answer — no connection, the
 * 8-second deadline, a 5xx, a captive portal — the credentials are checked on the device
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

  // An expired session keeps its user: offer the same name back (SPEC-FINAL 7.5).
  useEffect(() => {
    if (prefilled.current || !current?.expired) return;
    prefilled.current = true;
    setUsername(current.user.username);
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
      navigate(offline ? '/' : home(user), { replace: true });
    } catch (err) {
      setError(signInErrorLine(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Sign in">
      {current?.expired && (
        <p role="status" className="mt-3 rounded-lg border border-[var(--warning)] p-3 text-sm">
          {EXPIRED_LINE}
        </p>
      )}
      {!online && (
        <p role="status" className="mt-3 rounded-lg border border-[var(--border)] p-3 text-sm">
          {OFFLINE_SIGN_IN_LINE}
        </p>
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
        />
        <AuthError message={error} />
        <AuthSubmit busy={busy} label="Sign in" busyLabel="Signing in…" />
      </form>
    </AuthFrame>
  );
}
