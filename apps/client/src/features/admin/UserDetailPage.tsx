import { ArrowLeft } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatDate, passwordSchema, type PublicUser, type Role } from '@frc/shared';
import { sentence } from '@/auth/messages';
import { session } from '@/auth/session';
import { DESTRUCTIVE_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/buttonStyles';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Skeleton } from '@/components/Skeleton';
import { StateMessage } from '@/components/StateMessage';
import { call } from '@/data/rpc';
import { useSignedInUser } from '@/features/shell/shellContext';
import { AdminOnly } from './AdminOnly';
import { adminErrorLine } from './adminMessages';
import { Checkbox, FormError, PasswordField, RoleSelect } from './fields';
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
        action={{ label: 'All users', to: '/admin/users' }}
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
    <main className="mx-auto max-w-3xl px-6 py-6">
      <Link
        to="/admin/users"
        className="tap-target -ml-2 inline-flex items-center gap-2 px-2 text-[var(--text-muted)]"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        All users
      </Link>
      <h1 className="mt-2 text-xl font-semibold" dir="auto">
        {user.full_name}
      </h1>
      <p className="mt-1 text-[var(--text-muted)]">
        <span dir="auto">{user.username}</span> · created {formatDate(user.created_at)}
        {self && ' · this is you'}
      </p>

      {user.disabled_at ? (
        <p className="mt-6 rounded-lg border-2 border-[var(--warning)] p-3">
          This account is disabled since {formatDate(user.disabled_at)}. Everything they scouted is
          kept, with their name on it. Re-enabling an account is not available yet.
        </p>
      ) : (
        <>
          <RoleSection user={user} self={self} onChanged={onChanged} />
          <ResetSection user={user} onChanged={onChanged} />
          <DisableSection user={user} self={self} onChanged={onChanged} />
        </>
      )}
    </main>
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
    <section className="mt-8 border-t border-[var(--border)] pt-6">
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
    </section>
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
    <section className="mt-8 border-t border-[var(--border)] pt-6">
      <form aria-labelledby={titleId} noValidate onSubmit={(e) => void submit(e)}>
        <h2 id={titleId} className="text-lg font-semibold">
          Reset password
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          There is no self-service reset: you set a new one and hand it over. It does not sign them
          out of devices already signed in — to cut access, disable the account.
        </p>
        {shown && (
          <div
            role="status"
            aria-labelledby={shownId}
            className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
          >
            <p id={shownId} className="font-medium">
              New password for <span dir="auto">{user.full_name}</span>
            </p>
            <p className="mt-1 font-mono text-lg" dir="ltr">
              {shown.password}
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
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
    </section>
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
    <section className="mt-8 border-t border-[var(--border)] pt-6">
      <h2 className="text-lg font-semibold">Disable account</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
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
            {self && <p className="mt-2 font-medium text-[var(--text)]">{SELF_DISABLE_LINE}</p>}
          </>
        }
        confirmLabel={`Disable ${user.full_name}`}
        busy={busy}
        error={error}
        onConfirm={() => void confirm()}
        onCancel={() => setOpen(false)}
      />
    </section>
  );
}
