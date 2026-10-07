import { Dices } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { PublicUser, Role } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { DescribedChoice } from '@/components/ui/described-choice';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ErrorLine } from '@/components/ui/notice';
import { adminRpc, type Rpc } from '@/data/rpc';
import { adminErrorLine } from './adminMessages';
import { checkNewUser, type NewUserField, type NewUserProblem } from './checkNewUser';
import { CreatedActions, CreatedHandover, type Created } from './CreatedHandover';
import { generatePassword, suggestUsername } from './password';

const ROLES: readonly { key: Role; label: string; description: string }[] = [
  { key: 'scouter', label: 'Scouter', description: 'Enters match data' },
  { key: 'lead', label: 'Scout lead', description: 'Fixes any entry, pick list' },
  { key: 'admin', label: 'Admin', description: 'Everything, incl. users' },
];

const LABEL = 'block text-sm font-semibold text-ink';
const HINT = 'mt-1.5 text-xs text-muted';
const TEXT = {
  autoComplete: 'off',
  autoCapitalize: 'none',
  autoCorrect: 'off',
  spellCheck: false,
} as const;

/**
 * "Add a user" (design 08-users, variant B's dialog). After the create it becomes the
 * one-time handover; the password lives in this component's state only and is dropped
 * when the dialog closes (SPEC-FINAL 7.3). `createUser` takes `must_change` directly.
 */
export function AddUserDialog(props: {
  open: boolean;
  onClose: () => void;
  /** Every existing username, lowercase: the suggestion never offers one of them. */
  taken: Set<string>;
  onCreated: (user: PublicUser) => void;
  rpc?: Rpc;
}) {
  if (!props.open) return null;
  return <OpenAddUser {...props} />;
}

function OpenAddUser({
  onClose,
  taken,
  onCreated,
  rpc = adminRpc,
}: {
  onClose: () => void;
  taken: Set<string>;
  onCreated: (user: PublicUser) => void;
  rpc?: Rpc;
}) {
  const id = useId();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [suggested, setSuggested] = useState(true);
  const [role, setRole] = useState<Role>('scouter');
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [problem, setProblem] = useState<NewUserProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  function nameChanged(next: string) {
    setFullName(next);
    if (suggested) setUsername(suggestUsername(next, taken));
  }

  function reset() {
    setFullName('');
    setUsername('');
    setSuggested(true);
    setRole('scouter');
    setPassword('');
    setMustChange(true);
    setProblem(null);
    setCreated(null);
  }

  // The form and the handover replace each other: focus follows to Done, or back to the
  // first field after "Add another".
  const done = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    (created ? done : first).current?.focus();
  }, [created]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    const found = checkNewUser(fullName, username, password, taken);
    if (found) {
      setProblem(found);
      return;
    }
    setBusy(true);
    try {
      const input = { full_name: fullName, username, role, password, must_change: mustChange };
      const user = (await rpc.call('createUser', input)) as PublicUser;
      onCreated(user);
      setCreated({ user, password, mustChange });
    } catch (err) {
      setProblem({ field: null, line: adminErrorLine(err) });
    } finally {
      setBusy(false);
    }
  }

  const invalid = (field: NewUserField) => problem?.field === field || undefined;
  const describe = (field: NewUserField, hint?: string) =>
    [hint, problem?.field === field ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;

  if (created) {
    return (
      <Dialog
        open
        title="Add a user"
        onClose={onClose}
        footer={<CreatedActions onAddAnother={reset} onClose={onClose} done={done} />}
      >
        <CreatedHandover created={created} />
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      title="Add a user"
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={`${id}-form`}
            variant="primary"
            busy={busy}
            busyLabel="Adding…"
          >
            Add user
          </Button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        aria-label="Add a user"
        noValidate
        onSubmit={(e) => void submit(e)}
        className="flex flex-col gap-3"
      >
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label htmlFor={`${id}-full`} className={LABEL}>
              Full name
            </label>
            <Input
              ref={first}
              id={`${id}-full`}
              value={fullName}
              dir="auto"
              {...TEXT}
              aria-invalid={invalid('full_name')}
              aria-describedby={describe('full_name')}
              className="mt-1.5"
              onChange={(e) => nameChanged(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`${id}-user`} className={LABEL}>
              Username
            </label>
            <Input
              id={`${id}-user`}
              mono
              value={username}
              dir="auto"
              {...TEXT}
              aria-invalid={invalid('username')}
              aria-describedby={describe('username', `${id}-user-hint`)}
              className="mt-1.5"
              onChange={(e) => {
                setSuggested(false);
                setUsername(e.target.value);
              }}
            />
            <p id={`${id}-user-hint`} className={HINT}>
              {suggested && username
                ? 'Suggested from the name'
                : 'What they sign in with. Letters, digits, dots, underscores or hyphens.'}
            </p>
          </div>
        </div>
        <div>
          <p className={`${LABEL} mb-1.5`} aria-hidden="true">
            Role
          </p>
          <DescribedChoice label="Role" options={ROLES} value={role} onChange={setRole} />
        </div>
        <div>
          <label htmlFor={`${id}-pw`} className={LABEL}>
            Initial password
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <Input
              id={`${id}-pw`}
              mono
              value={password}
              dir="ltr"
              {...TEXT}
              aria-invalid={invalid('password')}
              aria-describedby={describe('password', `${id}-pw-hint`)}
              className="flex-1 tracking-[0.02em]"
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button size="sm" onClick={() => setPassword(generatePassword())}>
              <Dices aria-hidden="true" />
              Generate
            </Button>
          </div>
          <p id={`${id}-pw-hint`} className={HINT}>
            At least 8 characters. Shown in clear so you can hand it over.
          </p>
        </div>
        <label className="tap-target flex cursor-pointer items-center gap-3 text-[0.90625rem] font-semibold text-ink-2">
          <input
            type="checkbox"
            checked={mustChange}
            className="size-5 shrink-0 cursor-pointer accent-accent"
            onChange={(e) => setMustChange(e.target.checked)}
          />
          Ask them to change it at next sign-in
        </label>
        {problem && <ErrorLine id={`${id}-error`}>{problem.line}</ErrorLine>}
      </form>
    </Dialog>
  );
}
