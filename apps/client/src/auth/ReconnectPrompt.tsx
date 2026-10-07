import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
      className="motion-safe:animate-rise-in border-b border-s-4 border-line border-s-warn bg-surface px-4 py-3"
    >
      <h2 id={`${id}-title`} className="text-sm font-semibold">
        {RECONNECT_TITLE}
      </h2>
      <p className="mt-1 text-sm text-muted">
        Enter the password for <span dir="auto">{name}</span> once to upload this device&apos;s
        entries. They are safe on this device until then.
      </p>
      <form noValidate className="mt-3" onSubmit={(e) => void submit(e)}>
        <Label htmlFor={`${id}-password`}>Password</Label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Input
            id={`${id}-password`}
            type="password"
            value={password}
            autoComplete="current-password"
            dir="auto"
            className="flex-1"
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
        </div>
        <AuthError message={error} />
      </form>
    </section>
  );
}
