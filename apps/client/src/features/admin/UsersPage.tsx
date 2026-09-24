import { useId, useState, type FormEvent, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createUserInput,
  formatCount,
  formatDate,
  passwordSchema,
  usernameSchema,
  type PublicUser,
  type Role,
} from '@frc/shared';
import { sentence } from '@/auth/messages';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/buttonStyles';
import { Skeleton } from '@/components/Skeleton';
import { StateMessage } from '@/components/StateMessage';
import { call } from '@/data/rpc';
import { AdminOnly } from './AdminOnly';
import { adminErrorLine } from './adminMessages';
import { Checkbox, FormError, PasswordField, ROLE_LABEL, RoleSelect, TextField } from './fields';
import { MAX_LISTED_USERS, useUsers } from './useUsers';

/**
 * SPEC-FINAL 7.3 / 17.9 (Clerk): the users table — a row opens the detail page — and one
 * small creation form beside it. Admin only, desktop only, online only.
 */
export function UsersPage() {
  return (
    <AdminOnly>
      <UsersScreen />
    </AdminOnly>
  );
}

function statusText(user: PublicUser): string {
  return user.disabled_at ? `Disabled since ${formatDate(user.disabled_at)}` : 'Active';
}

function UsersScreen() {
  const [showDisabled, setShowDisabled] = useState(false);
  const { load, reload, put } = useUsers(showDisabled);

  if (load.status === 'unreachable') {
    return (
      <StateMessage
        variant="offline-needs-server"
        headingLevel={1}
        detail="The user list lives on the server, and this device cannot reach it right now."
        action={{ label: 'Try again', onClick: reload }}
      />
    );
  }
  if (load.status === 'failed') {
    return (
      <StateMessage
        variant="failed"
        headingLevel={1}
        title="The user list did not load"
        detail={load.line}
        action={{ label: 'Try again', onClick: reload }}
      />
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-6">
      <h1 className="text-xl font-semibold">Users</h1>
      <p className="mt-1 text-[var(--text-muted)]">
        Open an account to change its role, reset its password or disable it.
      </p>
      <div className="mt-6 flex flex-wrap items-start gap-8">
        <section aria-label="All accounts" className="min-w-0 flex-[1_1_36rem]">
          <div className="flex flex-wrap items-center justify-between gap-x-4">
            <Checkbox
              label="Show disabled accounts"
              checked={showDisabled}
              onChange={setShowDisabled}
            />
            {load.status === 'ready' && (
              <p className="text-sm text-[var(--text-muted)]">
                {formatCount(load.users.length)} {load.users.length === 1 ? 'account' : 'accounts'}
              </p>
            )}
          </div>
          {load.status === 'loading' ? (
            <div className="mt-4">
              <Skeleton rows={6} rowHeight="3rem" label="Loading the users" />
            </div>
          ) : (
            <>
              {load.truncated && (
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Showing the first {formatCount(MAX_LISTED_USERS)} accounts. The rest are on the
                  server but not listed here.
                </p>
              )}
              <UsersTable users={load.users} />
            </>
          )}
        </section>
        <CreateUser onCreated={put} />
      </div>
    </main>
  );
}

function UsersTable({ users }: { users: PublicUser[] }) {
  const navigate = useNavigate();
  const open = (id: string) => (e: MouseEvent<HTMLTableRowElement>) => {
    // The name's own link already navigates; the row makes the rest of it a target too.
    if ((e.target as HTMLElement).closest('a')) return;
    navigate(`/admin/users/${encodeURIComponent(id)}`);
  };
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--border)] text-sm text-[var(--text-muted)]">
            <th scope="col" className="py-2 pr-4 font-medium">
              Full name
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Username
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Role
            </th>
            <th scope="col" className="py-2 font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user.id}
              onClick={open(user.id)}
              className="cursor-pointer border-b border-[var(--border)] hover:bg-[var(--surface)]"
            >
              <td className="pr-4">
                <Link
                  to={`/admin/users/${encodeURIComponent(user.id)}`}
                  dir="auto"
                  className="tap-target flex items-center font-medium"
                >
                  {user.full_name}
                </Link>
              </td>
              <td className="pr-4" dir="auto">
                {user.username}
              </td>
              <td className="pr-4">{ROLE_LABEL[user.role]}</td>
              <td className={user.disabled_at ? 'text-[var(--text-muted)]' : undefined}>
                {statusText(user)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type FieldKey = 'username' | 'full_name' | 'password';
type Problem = { field: FieldKey | null; line: string };

/** The same rules the server applies (packages/shared), each with its field named. */
function checkCreate(username: string, fullName: string, password: string): Problem | null {
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
  const pass = passwordSchema.safeParse(password);
  if (!pass.success) {
    return {
      field: 'password',
      line: sentence(`for the password, ${pass.error.issues[0]?.message ?? 'that is not valid'}`),
    };
  }
  return null;
}

type Created = {
  user: PublicUser;
  /** Shown once, here, and dropped with this component. Never written anywhere. */
  password: string;
  mustChange: boolean;
  resetFailed: string | null;
};

/**
 * One small form (SPEC-FINAL 17.9). `createUser` cannot set `must_change_password`
 * (spec §5.4 item 3), so when the box is ticked the client resets the password to the same
 * value with `must_change: true` straight after — the workaround §5.4 names.
 */
function CreateUser({ onCreated }: { onCreated: (user: PublicUser) => void }) {
  const titleId = useId();
  const errorId = useId();
  const createdId = useId();
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('scouter');
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    const found = checkCreate(username, fullName, password);
    if (found) {
      setProblem(found);
      return;
    }
    setBusy(true);
    setCreated(null);
    let user: PublicUser;
    try {
      user = await call('createUser', { username, full_name: fullName, role, password });
    } catch (err) {
      setProblem({ field: null, line: adminErrorLine(err) });
      setBusy(false);
      return;
    }
    onCreated(user);
    let resetFailed: string | null = null;
    if (mustChange) {
      try {
        user = await call('resetPassword', { user_id: user.id, password, must_change: true });
        onCreated(user);
      } catch (err) {
        resetFailed = adminErrorLine(err);
      }
    }
    setCreated({ user, password, mustChange: mustChange && resetFailed === null, resetFailed });
    setUsername('');
    setFullName('');
    setRole('scouter');
    setPassword('');
    setMustChange(true);
    setBusy(false);
  }

  const invalid = (field: FieldKey) => problem?.field === field;

  return (
    <section
      aria-labelledby={titleId}
      className="flex-[0_1_24rem] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
    >
      <h2 id={titleId} className="text-lg font-semibold">
        Add a user
      </h2>
      {created && (
        <div
          role="status"
          aria-labelledby={createdId}
          className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3"
        >
          <p id={createdId} className="font-medium">
            Created <span dir="auto">{created.user.full_name}</span>.
          </p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Their password</p>
          <p className="font-mono text-lg" dir="ltr">
            {created.password}
          </p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Hand it over now. It is shown once and kept nowhere
            {created.mustChange ? '; they choose their own at first sign-in.' : '.'}
          </p>
          {created.resetFailed && (
            <p
              role="alert"
              dir="auto"
              className="mt-3 rounded-lg border-2 border-[var(--danger)] p-3 text-sm"
            >
              Account created, but the first-sign-in change could not be set. {created.resetFailed}{' '}
              Reset their password from their page to try again.
            </p>
          )}
          <button
            type="button"
            className={`${SECONDARY_BUTTON} mt-3`}
            onClick={() => setCreated(null)}
          >
            Done
          </button>
        </div>
      )}
      <form aria-labelledby={titleId} noValidate onSubmit={(e) => void submit(e)}>
        <TextField
          label="Username"
          value={username}
          onChange={setUsername}
          hint="What they sign in with. Letters, digits, dots, underscores or hyphens."
          invalid={invalid('username')}
          errorId={errorId}
        />
        <TextField
          label="Full name"
          value={fullName}
          onChange={setFullName}
          invalid={invalid('full_name')}
          errorId={errorId}
        />
        <RoleSelect label="Role" value={role} onChange={setRole} />
        <PasswordField
          label="Initial password"
          value={password}
          onChange={setPassword}
          hint="At least 8 characters. Shown in clear so you can hand it over."
          invalid={invalid('password')}
          errorId={errorId}
        />
        <Checkbox
          label="Ask them to change it at first sign-in"
          checked={mustChange}
          onChange={setMustChange}
        />
        <FormError id={errorId} message={problem?.line ?? null} />
        <button type="submit" disabled={busy} className={`${PRIMARY_BUTTON} mt-6 w-full`}>
          {busy ? 'Adding…' : 'Add user'}
        </button>
      </form>
    </section>
  );
}
