import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { call, RpcError } from '@/data/rpc';
import { AuthError, AuthField, AuthFrame, AuthSubmit } from './AuthFrame';
import { loginErrorLine, OFFLINE_SIGN_IN_LINE } from './messages';
import { session, type SessionUser } from './session';
import { useSession } from './useSession';

export const EXPIRED_LINE =
  'Your sign-in expired. Everything you entered is saved on this device and will sync after you sign in.';

/**
 * THE TASK 1.16 SEAM for offline sign-in: given the typed credentials, verify them
 * against the cached bcrypt hash and return the user (then `session.signIn(user, null,
 * true)`), or null when they do not match. Unset in 1.15, so a network failure shows
 * the offline line and signs no one in.
 */
export type OfflineSignIn = (username: string, password: string) => Promise<SessionUser | null>;

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

export function LoginPage({ offlineSignIn }: { offlineSignIn?: OfflineSignIn } = {}) {
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
      const { token, user } = await call('login', { username: name, password });
      await session.signIn(user, token);
      navigate(home(user), { replace: true });
    } catch (err) {
      if (err instanceof RpcError && err.status === 0 && offlineSignIn) {
        const user = await offlineSignIn(name, password);
        if (user) {
          await session.signIn(user, null, true);
          navigate(home(user), { replace: true });
          return;
        }
        setError('That username and password do not match.');
      } else {
        setError(loginErrorLine(err));
      }
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
