import { ChevronLeft } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatDate, type PublicUser } from '@frc/shared';
import { Skeleton } from '@/components/Skeleton';
import { StateMessage } from '@/components/StateMessage';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Initials } from '@/components/ui/initials';
import { ErrorLine } from '@/components/ui/notice';
import { adminRpc, type Rpc } from '@/data/rpc';
import { useSignedInUser } from '@/features/shell/shellContext';
import { PATHS } from '@/lib/paths';
import { usePageTitle } from '@/lib/pageTitle';
import { AdminOnly } from './AdminOnly';
import { adminErrorLine } from './adminMessages';
import { DisableSection } from './DisableSection';
import { RenameSection } from './RenameSection';
import { ResetPasswordSection } from './ResetPasswordSection';
import { RoleSection } from './RoleSection';
import { useAccount } from './useAccount';

export { DISABLE_BODY, SELF_DISABLE_LINE } from './DisableSection';

const TAG = 'inline-flex min-h-[22px] items-center rounded-tag px-2 text-xs font-bold';

/**
 * One account (SPEC-FINAL 17.9, Clerk): a 680 px column of sections. The server enforces
 * every rule — including "the last enabled admin stays one" — and its sentence is what the
 * page shows.
 */
export function UserDetailPage({ rpc = adminRpc }: { rpc?: Rpc }) {
  return (
    <AdminOnly>
      <UserDetail rpc={rpc} />
    </AdminOnly>
  );
}

function Column({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-[680px] flex-col gap-3.5 px-4 py-6 lg:px-0">
      {children}
    </main>
  );
}

function UserDetail({ rpc }: { rpc: Rpc }) {
  const { id = '' } = useParams();
  const { load, reload, put } = useAccount(rpc, id);

  if (load.status === 'loading') {
    return (
      <Column>
        <Skeleton rows={4} rowHeight="3rem" label="Loading the account" />
      </Column>
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
  if (!load.user) {
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
  return <Account key={load.user.id} user={load.user} rpc={rpc} onChanged={put} />;
}

function Account({
  user,
  rpc,
  onChanged,
}: {
  user: PublicUser;
  rpc: Rpc;
  onChanged: (u: PublicUser) => void;
}) {
  const me = useSignedInUser();
  const self = user.id === me.id;
  usePageTitle(user.full_name);
  return (
    <Column>
      <Link
        to={PATHS.users}
        className="hover-veil tap-target inline-flex w-fit items-center gap-1.5 rounded-control pe-2 text-[0.84375rem] font-semibold text-muted"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        All users
      </Link>
      <header className="flex items-center gap-3.5">
        <Initials name={user.full_name} size={52} />
        <div className="min-w-0">
          <h1 dir="auto" className="text-[1.625rem] font-bold leading-tight tracking-[-0.02em]">
            {user.full_name}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[0.84375rem] text-muted">
            <span dir="auto" className="num text-ink-2">
              {user.username}
            </span>
            <span aria-hidden="true">·</span>
            <span>created {formatDate(user.created_at)}</span>
            {self && (
              <span className={`${TAG} ms-1 bg-accent-tint text-accent-ink`}>This is you</span>
            )}
            {user.disabled_at && (
              <span className={`${TAG} ms-1 bg-line-2 text-muted`}>Disabled</span>
            )}
          </p>
        </div>
      </header>

      {user.disabled_at ? (
        <EnableSection user={user} disabledAt={user.disabled_at} rpc={rpc} onChanged={onChanged} />
      ) : (
        <>
          <RoleSection user={user} self={self} rpc={rpc} onChanged={onChanged} />
          <RenameSection user={user} self={self} rpc={rpc} onChanged={onChanged} />
          <ResetPasswordSection user={user} rpc={rpc} onChanged={onChanged} />
          <DisableSection user={user} self={self} rpc={rpc} onChanged={onChanged} />
        </>
      )}
    </Column>
  );
}

/**
 * spec §5.4 item 3: the counterpart to DisableSection. `enableUser` clears `disabled_at`
 * only — it never resets the password, so nothing here even offers one.
 */
function EnableSection({
  user,
  disabledAt,
  rpc,
  onChanged,
}: {
  user: PublicUser;
  disabledAt: string;
  rpc: Rpc;
  onChanged: (u: PublicUser) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      onChanged((await rpc.call('enableUser', { user_id: user.id })) as PublicUser);
    } catch (e) {
      setError(adminErrorLine(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="rounded-s-none border-s-[3px] border-s-warn bg-line-2 px-[18px] py-4">
      <p className="text-sm leading-normal">
        <b>This account is disabled since {formatDate(disabledAt)}.</b> Everything they scouted is
        kept, with their name on it.
      </p>
      <Button
        variant="primary"
        className="mt-3"
        busy={busy}
        busyLabel="Enabling…"
        onClick={() => void enable()}
      >
        Enable account
      </Button>
      {error && <ErrorLine className="mt-3">{error}</ErrorLine>}
    </Card>
  );
}
