import { useId, useState, type FormEvent } from 'react';
import { RpcError } from '@/data/rpc';
import { AuthError } from './AuthFrame';
import { DISABLED } from './messages';
import { OfflineLoginError, signInErrorLine } from './offlineLogin';
import { signInAgain } from './reconnect';

export const RECONNECT_TITLE = 'Finish signing in to sync';
export const PASSWORD_CHANGED_LINE =
  'The password for this account has changed. Enter the new one to sync.';

function promptErrorLine(e: unknown): string {
  if (e instanceof RpcError && e.status === 401) return 'That password does not match.';
  if (e instanceof RpcError && e.status === 403) return DISABLED;
  if (e instanceof OfflineLoginError && e.reason === 'mismatch') {
    return 'That password does not match.';
  }
  return signInErrorLine(e);
}

/**
 * SPEC-FINAL 7.5: "If the app was closed since the offline login, the user is prompted
 * for the password once when connectivity returns; the outbox holds the data safely
 * meanwhile and nothing is lost."
 *
 * One field, in the page flow under the header — never a dialog, never over the entry
 * screen's inputs, never grabbing focus — and dismissible.
 */
export function ReconnectPrompt({
  name,
  error: initialError,
  onClose,
}: {
  name: string;
  error: string | null;
  onClose: () => void;
}) {
  const id = useId();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password === '') {
      setError('Enter the password.');
      return;
    }
    setBusy(true);
    try {
      // `exchanged`: a token is held and sync starts. `held`: the cached hash accepts it
      // and it waits in memory for the connection to hold. Either way, done here.
      await signInAgain(password);
      onClose();
    } catch (err) {
      setError(promptErrorLine(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="border-b-2 border-[var(--warning)] bg-[var(--surface)] p-3"
    >
      <h2 id={`${id}-title`} className="font-semibold">
        {RECONNECT_TITLE}
      </h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Enter the password for <span dir="auto">{name}</span> once to upload this device&apos;s
        entries. They are safe on this device until then.
      </p>
      <form noValidate className="mt-2" onSubmit={(e) => void submit(e)}>
        <label htmlFor={`${id}-password`} className="block text-sm font-medium">
          Password
        </label>
        <div className="tap-row mt-1 flex flex-wrap items-center gap-y-2">
          <input
            id={`${id}-password`}
            type="password"
            value={password}
            autoComplete="current-password"
            dir="auto"
            className="tap-target min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3"
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy}
            className="tap-target rounded-lg bg-[var(--brand-plate)] px-4 font-semibold text-[var(--brand)] disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <button type="button" className="tap-target px-3" onClick={onClose}>
            Not now
          </button>
        </div>
        <AuthError message={error} />
      </form>
    </section>
  );
}
