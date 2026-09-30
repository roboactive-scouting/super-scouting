import { ArrowLeft } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  createUserInput,
  formatDate,
  passwordSchema,
  usernameSchema,
  type PublicUser,
  type Role,
} from '@frc/shared';
import { sentence } from '@/auth/messages';
import { session } from '@/auth/session';
import { DESTRUCTIVE_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/buttonStyles';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Skeleton } from '@/components/Skeleton';
import { StateMessage } from '@/components/StateMessage';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { call } from '@/data/rpc';
import { useSignedInUser } from '@/features/shell/shellContext';
import { AdminOnly } from './AdminOnly';
import { adminErrorLine } from './adminMessages';
import { Checkbox, FormError, PasswordField, RoleSelect, TextField } from './fields';
import { useUsers } from './useUsers';

/** The confirm body, word for word (task 1.17). */
export const DISABLE_BODY =
  'Disabling keeps everything they scouted, with their name on it. It is not a delete.';

export const SELF_DISABLE_LINE =
  'This is your own account. You will be signed out on your next request.';

/**
 * One account (SPEC-FINAL 17.9, Clerk): role as a select that saves on change, password
 * reset, and disable behind the single destructive pattern. The server enforces every rule
 * — including "the last enabled admin stays one" — and its sentence is what the page shows.
 */
export function UserDetailPage() {
  return (
    <AdminOnly>
      <UserDetail />
    </AdminOnly>
  );
}

function UserDetail() {
  const { id = '' } = useParams();
  // Disabled accounts included: an admin may open one from the list with them shown.
  const { load, reload, put } = useUsers(true);

  if (load.status === 'loading') {
    return (
      <main className="mx-auto max-w-3xl px-6 py-6">
        <Skeleton rows={4} rowHeight="3rem" label="Loading the account" />
      </main>
    );
  }
  if (load.status === 'unreachable') {
    return (
      <StateMessage
        variant="offline-needs-server"
        headingLevel={1}
        detail="Accounts live on the server, and this device cannot reach it right now."
        action={{ label: 'Try again', onClick: reload }}
      />
    );
  }
  if (load.status === 'failed') {
    return (
      <StateMessage
        variant="failed"
        headingLevel={1}
        title="This account did not load"
        detail={load.line}
        action={{ label: 'Try again', onClick: reload }}
      />
    );
  }
  const user = load.users.find((u) => u.id === id);
  if (!user) {
    return (
      <StateMessage
        variant="no-results"
        headingLevel={1}
        title="No user at this address"
        detail="The link may be out of date. The list shows every account there is."
        action={{ label: 'All users', to: PATHS.users }}
      />
    );
  }
  // Keyed by id: moving to another account starts with empty forms, never a password
  // left over from the last one.
  return <Account key={user.id} user={user} onChanged={put} />;
}

function Account({ user, onChanged }: { user: PublicUser; onChanged: (u: PublicUser) => void }) {
  const me = useSignedInUser();
  const self = user.id === me.id;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 lg:px-8">
      <Link
        to={PATHS.users}
        className={cn(buttonVariants({ variant: 'ghost' }), '-ms-3 text-text-muted')}
      >
        <ArrowLeft aria-hidden="true" />
        All users
      </Link>
      <div className="mt-2">
        <PageHeader
          titleDir="auto"
          title={user.full_name}
          description={
            <>
              <span dir="auto">{user.username}</span> · created {formatDate(user.created_at)}
              {self && ' · this is you'}
            </>
          }
        />
      </div>

      {user.disabled_at ? (
        <EnableSection user={user} disabledAt={user.disabled_at} onChanged={onChanged} />
      ) : (
        <>
          <RoleSection user={user} self={self} onChanged={onChanged} />
          <RenameSection user={user} self={self} onChanged={onChanged} />
          <ResetSection user={user} onChanged={onChanged} />
          <DisableSection user={user} self={self} onChanged={onChanged} />
        </>
      )}
    </main>
  );
}

/**
 * spec §5.4 item 3: the counterpart to DisableSection. `enableUser` clears `disabled_at`
 * only — it never resets the password, so nothing here even offers one.
 */
function EnableSection({
  user,
  disabledAt,
  onChanged,
}: {
  user: PublicUser;
  disabledAt: string;
  onChanged: (u: PublicUser) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const updated = await call('enableUser', { user_id: user.id });
      onChanged(updated);
    } catch (e) {
      setError(adminErrorLine(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6 border-s-4 border-s-warning">
      <p>
        This account is disabled since {formatDate(disabledAt)}. Everything they scouted is kept,
        with their name on it.
      </p>
      <button
        type="button"
        disabled={busy}
        className={`${PRIMARY_BUTTON} mt-3`}
        onClick={() => void enable()}
      >
        {busy ? 'Enabling…' : 'Enable account'}
      </button>
      <FormError message={error} />
    </Card>
  );
}

const ARTICLE: Record<Role, string> = { scouter: 'a scouter', lead: 'a lead', admin: 'an admin' };

function RoleSection({
  user,
  self,
  onChanged,
}: {
  user: PublicUser;
  self: boolean;
  onChanged: (u: PublicUser) => void;
}) {
  const [saving, setSaving] = useState<Role | null>(null);
  const [line, setLine] = useState<{ ok: boolean; text: string } | null>(null);

  async function change(role: Role) {
    setSaving(role);
    setLine(null);
    try {
      const updated = await call('setUserRole', { user_id: user.id, role });
      onChanged(updated);
      setLine({ ok: true, text: ARTICLE[updated.role] });
      // The server's answer is the truth; the signed-in admin's own gate follows it now
      // rather than at the next pull.
      if (self) await session.updateUser({ role: updated.role });
    } catch (e) {
      setLine({ ok: false, text: adminErrorLine(e) });
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card as="section" className="mt-6">
      <RoleSelect
        label="Role"
        value={saving ?? user.role}
        disabled={saving !== null}
        onChange={(role) => void change(role)}
        hint={
          self
            ? 'This is your own account. Another role takes away your access to this page.'
            : 'Scouters enter data. Leads also fix entries and resolve conflicts. Admins manage everything, users included.'
        }
      />
      {line?.ok && (
        <p role="status" className="mt-2 text-sm">
          Saved. <span dir="auto">{user.full_name}</span> is now {line.text}. It applies from their
          next request.
        </p>
      )}
      {line && !line.ok && <FormError message={line.text} />}
    </Card>
  );
}

type RenameField = 'username' | 'full_name';
type RenameProblem = { field: RenameField; line: string };

/** The same rules the server applies (packages/shared), each with its field named. */
function checkRename(username: string, fullName: string): RenameProblem | null {
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
 * spec §5.4 item 3: rename a username, a full name, or both. The id never changes, so a
 * device offline under the old name still keeps every past entry's authorship — it just
 * keeps signing in with that name until its next sync, which the hint below says plainly.
 */
function RenameSection({
  user,
  self,
  onChanged,
}: {
  user: PublicUser;
  self: boolean;
  onChanged: (u: PublicUser) => void;
}) {
  const titleId = useId();
  const errorId = useId();
  const [username, setUsername] = useState(user.username);
  const [fullName, setFullName] = useState(user.full_name);
  const [problem, setProblem] = useState<RenameProblem | null>(null);
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
      const updated = await call('renameUser', {
        user_id: user.id,
        username,
        full_name: fullName,
      });
      onChanged(updated);
      setUsername(updated.username);
      setFullName(updated.full_name);
      // The server's answer is the truth; the signed-in admin's own header, footer and
      // offline sign-in name follow it now rather than at the next pull (task 1.17a).
      if (self)
        await session.updateUser({ username: updated.username, full_name: updated.full_name });
      setSaved(true);
    } catch (err) {
      setProblem({ field: 'username', line: adminErrorLine(err) });
    } finally {
      setBusy(false);
    }
  }

  const invalid = (field: RenameField) => problem?.field === field;

  return (
    <Card as="section" className="mt-6">
      <form aria-labelledby={titleId} noValidate onSubmit={(e) => void submit(e)}>
        <h2 id={titleId} className="text-lg font-semibold">
          Rename
        </h2>
        <TextField
          label="Username"
          value={username}
          onChange={setUsername}
          hint="What they sign in with. A device that is offline under the old name keeps using it to sign in until its next sync."
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
        <FormError id={errorId} message={problem?.line ?? null} />
        {saved && (
          <p role="status" className="mt-2 text-sm">
            Saved.
          </p>
        )}
        <button type="submit" disabled={busy} className={`${PRIMARY_BUTTON} mt-4`}>
          {busy ? 'Saving…' : 'Save name'}
        </button>
      </form>
    </Card>
  );
}

function ResetSection({
  user,
  onChanged,
}: {
  user: PublicUser;
  onChanged: (u: PublicUser) => void;
}) {
  const titleId = useId();
  const errorId = useId();
  const shownId = useId();
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The new password, shown once. Component state only: gone when the page is left. */
  const [shown, setShown] = useState<{ password: string; mustChange: boolean } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const checked = passwordSchema.safeParse(password);
    if (!checked.success) {
      setError(
        sentence(`for the password, ${checked.error.issues[0]?.message ?? 'that is not valid'}`),
      );
      return;
    }
    setBusy(true);
    setShown(null);
    try {
      const updated = await call('resetPassword', {
        user_id: user.id,
        password,
        must_change: mustChange,
      });
      onChanged(updated);
      setShown({ password, mustChange });
      setPassword('');
      setMustChange(true);
    } catch (err) {
      setError(adminErrorLine(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card as="section" className="mt-6">
      <form aria-labelledby={titleId} noValidate onSubmit={(e) => void submit(e)}>
        <h2 id={titleId} className="text-lg font-semibold">
          Reset password
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          There is no self-service reset: you set a new one and hand it over. It does not sign them
          out of devices already signed in — to cut access, disable the account.
        </p>
        {shown && (
          <div
            role="status"
            aria-labelledby={shownId}
            className="enter-rise mt-4 rounded-lg border border-s-4 border-border border-s-status-played bg-bg p-3"
          >
            <p id={shownId} className="font-medium">
              New password for <span dir="auto">{user.full_name}</span>
            </p>
            <p className="mt-1 font-mono text-lg" dir="ltr">
              {shown.password}
            </p>
            <p className="mt-2 text-sm text-text-muted">
              Hand it over now. It is shown once and kept nowhere
              {shown.mustChange ? '; they choose their own at next sign-in.' : '.'}
            </p>
            <button
              type="button"
              className={`${SECONDARY_BUTTON} mt-3`}
              onClick={() => setShown(null)}
            >
              Done
            </button>
          </div>
        )}
        <PasswordField
          label="New password"
          value={password}
          onChange={setPassword}
          hint="At least 8 characters. Shown in clear so you can hand it over."
          invalid={error !== null}
          errorId={errorId}
        />
        <Checkbox
          label="Ask them to change it at next sign-in"
          checked={mustChange}
          onChange={setMustChange}
        />
        <FormError id={errorId} message={error} />
        <button type="submit" disabled={busy} className={`${PRIMARY_BUTTON} mt-4`}>
          {busy ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </Card>
  );
}

function DisableSection({
  user,
  self,
  onChanged,
}: {
  user: PublicUser;
  self: boolean;
  onChanged: (u: PublicUser) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const updated = await call('disableUser', { user_id: user.id });
      setOpen(false);
      onChanged(updated);
    } catch (e) {
      setError(adminErrorLine(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card as="section" tone="danger" className="mt-6">
      <h2 className="text-lg font-semibold">Disable account</h2>
      <p className="mt-1 text-sm text-text-muted">
        They can no longer sign in or sync. A device that is offline keeps them signed in until its
        next sync.
      </p>
      <button
        type="button"
        className={`${DESTRUCTIVE_BUTTON} mt-4`}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Disable account
      </button>
      <ConfirmDialog
        open={open}
        title="Disable this account?"
        objectName={user.full_name}
        body={
          <>
            <p>{DISABLE_BODY}</p>
            {self && <p className="mt-2 font-medium text-text">{SELF_DISABLE_LINE}</p>}
          </>
        }
        confirmLabel={`Disable ${user.full_name}`}
        busy={busy}
        error={error}
        onConfirm={() => void confirm()}
        onCancel={() => setOpen(false)}
      />
    </Card>
  );
}
