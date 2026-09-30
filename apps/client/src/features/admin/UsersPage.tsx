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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/Skeleton';
import { StateMessage } from '@/components/StateMessage';
import { call } from '@/data/rpc';
import { PATHS } from '@/lib/paths';
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
    <main className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8">
      <PageHeader
        title="Users"
        description="Open an account to change its role, reset its password or disable it."
      />
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card as="section" aria-label="All accounts" className="min-w-0 p-0">
          <div className="flex flex-wrap items-center justify-between gap-x-4 border-b border-border px-5 py-1">
            <Checkbox
              label="Show disabled accounts"
              checked={showDisabled}
              onChange={setShowDisabled}
            />
            {load.status === 'ready' && (
              <p className="text-sm text-text-muted">
                {formatCount(load.users.length)} {load.users.length === 1 ? 'account' : 'accounts'}
              </p>
            )}
          </div>
          {load.status === 'loading' ? (
            <div className="p-5">
              <Skeleton rows={6} rowHeight="3rem" label="Loading the users" />
            </div>
          ) : (
            <>
              {load.truncated && (
                <p className="px-5 pt-3 text-sm text-text-muted">
                  Showing the first {formatCount(MAX_LISTED_USERS)} accounts. The rest are on the
                  server but not listed here.
                </p>
              )}
              <UsersTable users={load.users} />
            </>
          )}
        </Card>
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
    navigate(`${PATHS.users}/${encodeURIComponent(id)}`);
  };
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="ps-5">Full name</TableHead>
          <TableHead>Username</TableHead>
          <TableHead>Role</TableHead>
          <TableHead className="pe-5">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id} onClick={open(user.id)} className="cursor-pointer">
            <TableCell className="py-0 ps-5">
              <Link
                to={`${PATHS.users}/${encodeURIComponent(user.id)}`}
                dir="auto"
                className="tap-target flex items-center font-medium"
              >
                {user.full_name}
              </Link>
            </TableCell>
            <TableCell dir="auto">{user.username}</TableCell>
            <TableCell>
              <Badge>{ROLE_LABEL[user.role]}</Badge>
            </TableCell>
            <TableCell className="pe-5">
              <Badge tone={user.disabled_at ? 'neutral' : 'success'}>{statusText(user)}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
};

/**
 * One small form (SPEC-FINAL 17.9). `createUser` takes `must_change` directly (spec §5.4
 * item 3), so ticking the box just sets it on the create call — no follow-up reset.
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
      user = await call('createUser', {
        username,
        full_name: fullName,
        role,
        password,
        must_change: mustChange,
      });
    } catch (err) {
      setProblem({ field: null, line: adminErrorLine(err) });
      setBusy(false);
      return;
    }
    onCreated(user);
    setCreated({ user, password, mustChange });
    setUsername('');
    setFullName('');
    setRole('scouter');
    setPassword('');
    setMustChange(true);
    setBusy(false);
  }

  const invalid = (field: FieldKey) => problem?.field === field;

  return (
    <Card as="section" aria-labelledby={titleId}>
      <CardTitle id={titleId} className="text-lg">
        Add a user
      </CardTitle>
      {created && (
        <div
          role="status"
          aria-labelledby={createdId}
          className="enter-rise mt-4 rounded-lg border border-s-4 border-border border-s-status-played bg-bg p-3"
        >
          <p id={createdId} className="font-medium">
            Created <span dir="auto">{created.user.full_name}</span>.
          </p>
          <p className="mt-2 text-sm text-text-muted">Their password</p>
          <p className="font-mono text-lg" dir="ltr">
            {created.password}
          </p>
          <p className="mt-2 text-sm text-text-muted">
            Hand it over now. It is shown once and kept nowhere
            {created.mustChange ? '; they choose their own at next sign-in.' : '.'}
          </p>
          <Button className="mt-3" onClick={() => setCreated(null)}>
            Done
          </Button>
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
          label="Ask them to change it at next sign-in"
          checked={mustChange}
          onChange={setMustChange}
        />
        <FormError id={errorId} message={problem?.line ?? null} />
        <Button type="submit" variant="primary" size="block" disabled={busy} className="mt-6">
          {busy ? 'Adding…' : 'Add user'}
        </Button>
      </form>
    </Card>
  );
}
