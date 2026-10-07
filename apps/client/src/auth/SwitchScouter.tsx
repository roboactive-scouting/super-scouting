import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, buttonVariants } from '@/components/ui/button';
import { Initials } from '@/components/ui/initials';
import { ErrorLine, Note } from '@/components/ui/notice';
import { PasswordInput } from '@/components/ui/password-input';
import { Select } from '@/components/ui/select';
import { stationLabel } from '@/components/ui/tag';
import { db } from '@/data/db';
import { getStation, type Station } from '@/data/station';
import { useSyncStatus } from '@/data/syncStatus';
import { useDeviceQuery } from '@/data/useDeviceQuery';
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

/**
 * "Stays on this device" (06-switch README): what the hand-over leaves behind, by name and
 * never by pronoun. Nothing waiting and no station: no note.
 */
function StaysNote({
  name,
  waiting,
  station,
}: {
  name: string;
  waiting: number;
  station: Station | null;
}) {
  if (waiting === 0 && station === null) return null;
  const who = <bdi>{name}</bdi>;
  return (
    <Note icon="info" className="mt-4">
      <b className="font-semibold text-ink">Stays on this device:</b>{' '}
      {waiting > 0 && (
        <>
          {who}&apos;s {waiting} {waiting === 1 ? 'entry' : 'entries'} waiting to send, which still
          send as {who}&apos;s{station ? ', and ' : '.'}
        </>
      )}
      {station && (
        <>
          {waiting > 0 ? 'station' : 'Station'}{' '}
          <b className="font-semibold text-ink">{stationLabel(station)}</b>.
        </>
      )}
    </Note>
  );
}

export function SwitchScouter() {
  const navigate = useNavigate();
  const current = useSession();
  const sync = useSyncStatus();
  const station = useDeviceQuery(getStation, [], ['meta']);
  const pickerId = useId();
  const passwordId = useId();
  const errorId = useId();
  const passwordRef = useRef<HTMLInputElement>(null);
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
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await switchScouter(chosen.username, password);
      navigate(PATHS.scout, { replace: true });
    } catch (err) {
      setError(signInErrorLine(err));
      setPassword('');
      // Cleared, not disabled: the field keeps the focus for the next try.
      passwordRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  if (users === null) return null; // IndexedDB is being read; a few milliseconds

  return (
    <main className="mx-auto w-full max-w-[460px] px-4 py-5 md:py-8">
      <h1 className="text-[22px] font-bold tracking-tight md:text-[26px]">Switch scouter</h1>
      {users.length > 0 && (
        <p className="mt-1.5 text-sm leading-snug text-muted">
          Entries already on this device keep the scouter who made them.
        </p>
      )}
      {users.length === 0 ? (
        <Note icon="offline" className="mt-5">
          {NO_CACHED_ACCOUNTS_LINE}
        </Note>
      ) : (
        <form noValidate className="mt-[18px]" onSubmit={(e) => void submit(e)}>
          {current && (
            <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-3">
              <Initials name={current.user.full_name} size={40} />
              <div className="min-w-0">
                <small className="block text-xs font-semibold text-muted">Scouting now</small>
                <b dir="auto" className="block truncate text-[15.5px] font-semibold text-ink">
                  {current.user.full_name}
                </b>
              </div>
            </div>
          )}
          <label htmlFor={pickerId} className="mt-5 block text-sm font-semibold text-ink">
            Who&apos;s scouting next?
          </label>
          <Select
            id={pickerId}
            size="lg"
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
          </Select>
          {chosen && (
            <div key={chosen.id} className="mt-5">
              <label htmlFor={passwordId} className="block text-sm font-semibold text-ink">
                Password for <span dir="auto">{chosen.full_name}</span>
              </label>
              <PasswordInput
                id={passwordId}
                ref={passwordRef}
                value={password}
                autoComplete="current-password"
                autoFocus
                dir="auto"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className="mt-1.5"
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          {error && (
            <ErrorLine id={errorId} className="mt-4">
              {error}
            </ErrorLine>
          )}
          {chosen && current && chosen.id !== current.user.id && (
            <StaysNote
              name={current.user.full_name}
              waiting={sync.byAuthor[current.user.id] ?? 0}
              station={station ?? null}
            />
          )}
          <Button
            type="submit"
            variant="primary"
            size="block"
            busy={busy}
            busyLabel="Switching…"
            className="mt-5"
          >
            Switch scouter
          </Button>
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
