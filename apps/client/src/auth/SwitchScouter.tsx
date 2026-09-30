import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
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
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';

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
      navigate(PATHS.scout, { replace: true });
    } catch (err) {
      setError(signInErrorLine(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  if (users === null) return null; // IndexedDB is being read; a few milliseconds

  return (
    <main className="mx-auto w-full max-w-md px-4 py-8">
      <PageHeader
        title="Switch scouter"
        description={
          users.length > 0
            ? 'Entries already on this device keep the scouter who made them.'
            : undefined
        }
      />
      {users.length === 0 ? (
        <Notice still className="mt-6">
          {NO_CACHED_ACCOUNTS_LINE}
        </Notice>
      ) : (
        <form noValidate className="mt-6" onSubmit={(e) => void submit(e)}>
          <Label htmlFor={pickerId}>Scouter</Label>
          <NativeSelect
            id={pickerId}
            dir="auto"
            value={chosenId}
            wrapperClassName="mt-1.5"
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
          </NativeSelect>
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
      )}
      <Link
        className={cn(buttonVariants({ variant: 'ghost', size: 'block' }), 'mt-2')}
        to={PATHS.home}
      >
        Cancel
      </Link>
    </main>
  );
}
