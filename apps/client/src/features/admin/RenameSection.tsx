import { Check } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { createUserInput, usernameSchema, type PublicUser } from '@frc/shared';
import { sentence } from '@/auth/messages';
import { session } from '@/auth/session';
import type { Rpc } from '@/data/rpc';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ErrorLine } from '@/components/ui/notice';
import { adminErrorLine } from './adminMessages';

type Field = 'username' | 'full_name';
/** `field` null: the server refused the whole form (a taken username, a 403…). */
type Problem = { field: Field | null; line: string };

const LABEL = 'block text-sm font-semibold text-ink';

/** The same rules the server applies (packages/shared), each with its field named. */
function checkRename(username: string, fullName: string): Problem | null {
  if (username.trim() === '') return { field: 'username', line: 'Enter a username.' };
  const name = usernameSchema.safeParse(username);
  if (!name.success) {
    return {
      field: 'username',
      line: sentence(`for the username, ${name.error.issues[0]?.message ?? 'that is not valid'}`),
    };
  }
  if (fullName.trim() === '') return { field: 'full_name', line: 'Enter their full name.' };
  if (!createUserInput.shape.full_name.safeParse(fullName).success) {
    return { field: 'full_name', line: 'That full name is too long. Shorten it.' };
  }
  return null;
}

/**
 * The server's answer is the truth; the signed-in admin's own header, sidebar and offline
 * sign-in name follow it now rather than at the next pull (task 1.17a). The rename is saved
 * either way: if this device cannot store it, the next pull brings it.
 */
async function followInSession(updated: PublicUser) {
  try {
    await session.updateUser({ username: updated.username, full_name: updated.full_name });
  } catch {
    // Saved on the server; the next pull refreshes this device.
  }
}

/**
 * spec §5.4 item 3: rename a username, a full name, or both. The id never changes, so a
 * device offline under the old name still keeps every past entry's authorship — it just
 * keeps signing in with that name until its next sync, which the hint says plainly.
 */
export function RenameSection({
  user,
  self,
  rpc,
  onChanged,
}: {
  user: PublicUser;
  self: boolean;
  rpc: Rpc;
  onChanged: (u: PublicUser) => void;
}) {
  const id = useId();
  const [username, setUsername] = useState(user.username);
  const [fullName, setFullName] = useState(user.full_name);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    const found = checkRename(username, fullName);
    if (found) {
      setProblem(found);
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      const updated = (await rpc.call('renameUser', {
        user_id: user.id,
        username,
        full_name: fullName,
      })) as PublicUser;
      onChanged(updated);
      setUsername(updated.username);
      setFullName(updated.full_name);
      setSaved(true);
      if (self) await followInSession(updated);
    } catch (err) {
      setProblem({ field: null, line: adminErrorLine(err) });
    } finally {
      setBusy(false);
    }
  }

  const invalid = (field: Field) => (problem?.field === field ? true : undefined);

  return (
    <Card as="section" className="px-[18px] py-4">
      <form aria-labelledby={`${id}-title`} noValidate onSubmit={(e) => void submit(e)}>
        <CardTitle id={`${id}-title`}>Rename</CardTitle>
        <div className="mt-3 flex items-end gap-2.5">
          <div className="min-w-0 flex-1">
            <label htmlFor={`${id}-username`} className={LABEL}>
              Username
            </label>
            <Input
              id={`${id}-username`}
              mono
              value={username}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              dir="auto"
              aria-invalid={invalid('username')}
              aria-describedby={`${id}-hint`}
              className="mt-1.5"
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor={`${id}-full`} className={LABEL}>
              Full name
            </label>
            <Input
              id={`${id}-full`}
              value={fullName}
              autoComplete="off"
              spellCheck={false}
              dir="auto"
              aria-invalid={invalid('full_name')}
              className="mt-1.5"
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <Button type="submit" busy={busy} busyLabel="Saving…">
            Save name
          </Button>
        </div>
        <p id={`${id}-hint`} className="mt-2.5 text-[0.8125rem] leading-snug text-muted">
          What they sign in with. A device that is offline under the old name keeps using it to sign
          in until its next sync.
        </p>
        {problem && <ErrorLine className="mt-3">{problem.line}</ErrorLine>}
        {saved && (
          <p
            role="status"
            className="mt-2.5 flex items-center gap-1.5 text-[0.8125rem] font-[650] text-accent-ink"
          >
            <Check aria-hidden="true" className="size-[15px] shrink-0" strokeWidth={2.6} />
            Saved.
          </p>
        )}
      </form>
    </Card>
  );
}
