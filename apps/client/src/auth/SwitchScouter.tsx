import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '@/data/db';
import { AuthError, AuthField, AuthSubmit } from './AuthFrame';
import {
  cachedSignInUsers,
  NO_CACHED_ACCOUNTS_LINE,
  signInErrorLine,
  signInWithFallback,
  type CachedUser,
  type SignInResult,
} from './offlineLogin';
import { useSession } from './useSession';

/**
 * SPEC-FINAL 7.3, 7.5: hand a shared device to another scouter without a sign-out. The
 * same path as signing in — the server first, the cached hash when there is no
 * definitive answer — so it works at a venue with no signal.
 *
 * It never touches the outbox, the dataset or entry drafts: the previous scouter's
 * unsynced operations keep THEIR `author_user_id` and still push under whichever bearer
 * the device holds next (the server authorizes per operation). Only the session-scoped
 * practice drafts go, exactly as on sign-out. The held password is replaced (offline) or
 * dropped (a token came back).
 */
export async function switchScouter(username: string, password: string): Promise<SignInResult> {
  const result = await signInWithFallback(username, password);
  await db.practiceDrafts.clear();
  return result;
}

/**
 * "Name · username". Not "Name (username)": in a right-to-left option (a Hebrew name,
 * `dir="auto"`) the brackets around the Latin username are mirrored into ")seed_lead(".
 * A middle dot is direction-neutral and reads correctly both ways.
 */
function optionText(user: CachedUser, signedIn: boolean): string {
  return `${user.full_name} · ${user.username}${signedIn ? ' · signed in now' : ''}`;
}

export function SwitchScouter() {
  const navigate = useNavigate();
  const current = useSession();
  const pickerId = useId();
  const [users, setUsers] = useState<CachedUser[] | null>(null);
  const [chosenId, setChosenId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void cachedSignInUsers().then((list) => {
      if (!cancelled) setUsers(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const chosen = users?.find((u) => u.id === chosenId) ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!chosen) {
      setError('Choose who is scouting.');
      return;
    }
    if (password === '') {
      setError('Enter the password.');
      return;
    }
    setBusy(true);
    try {
      await switchScouter(chosen.username, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(signInErrorLine(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  if (users === null) return null; // IndexedDB is being read; a few milliseconds

  return (
    <main className="mx-auto w-full max-w-sm px-4 py-6">
      <h1 className="text-xl font-semibold">Switch scouter</h1>
      {users.length === 0 ? (
        <p dir="auto" className="mt-3 rounded-lg border border-[var(--border)] p-3">
          {NO_CACHED_ACCOUNTS_LINE}
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Entries already on this device keep the scouter who made them.
          </p>
          <form noValidate onSubmit={(e) => void submit(e)}>
            <div className="mt-4">
              <label htmlFor={pickerId} className="block text-sm font-medium">
                Scouter
              </label>
              <select
                id={pickerId}
                dir="auto"
                value={chosenId}
                className="tap-target mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3"
                onChange={(e) => {
                  setChosenId(e.target.value);
                  setPassword('');
                  setError(null);
                }}
              >
                <option value="" disabled>
                  Choose who is scouting
                </option>
                {users.map((u) => (
                  <option key={u.id} value={u.id} dir="auto">
                    {optionText(u, u.id === current?.user.id)}
                  </option>
                ))}
              </select>
            </div>
            {chosen && (
              <AuthField
                key={chosen.id}
                label={
                  <>
                    Password for <span dir="auto">{chosen.full_name}</span>
                  </>
                }
                type="password"
                value={password}
                autoComplete="current-password"
                autoFocus
                onChange={setPassword}
              />
            )}
            <AuthError message={error} />
            <AuthSubmit busy={busy} label="Switch scouter" busyLabel="Switching…" />
          </form>
        </>
      )}
      <div className="mt-2 flex justify-center">
        <Link className="tap-target inline-flex items-center px-3" to="/">
          Cancel
        </Link>
      </div>
    </main>
  );
}
