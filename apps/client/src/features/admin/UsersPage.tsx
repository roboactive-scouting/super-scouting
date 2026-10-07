import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatCount, type PublicUser } from '@frc/shared';
import { Skeleton } from '@/components/Skeleton';
import { StateMessage } from '@/components/StateMessage';
import { Button } from '@/components/ui/button';
import { FilterChips } from '@/components/ui/filter-chips';
import { SearchField } from '@/components/ui/search-field';
import { adminRpc, type Rpc } from '@/data/rpc';
import { useSignedInUser } from '@/features/shell/shellContext';
import { AddUserDialog } from './AddUserDialog';
import { AdminOnly } from './AdminOnly';
import { DisableUserConfirm } from './DisableUserConfirm';
import { ResetPasswordDialog } from './ResetPasswordDialog';
import { UsersTable } from './UsersTable';
import { MAX_LISTED_USERS, useUsers } from './useUsers';
import { countByFilter, USERS_FILTERS, visibleUsers, type UsersFilter } from './usersView';

/**
 * `/admin/users` (design 08-users, variant C): one table of every account with search,
 * filter chips, entries this season and row quick actions; "Add a user" is a dialog.
 * Admin only, desktop only (the route's DesktopOnly), online only (SPEC-FINAL 7.3, 17.9).
 */
export function UsersPage({ rpc = adminRpc }: { rpc?: Rpc }) {
  return (
    <AdminOnly>
      <UsersScreen rpc={rpc} />
    </AdminOnly>
  );
}

type RowAction = { kind: 'reset' | 'disable'; user: PublicUser } | null;

function UsersScreen({ rpc }: { rpc: Rpc }) {
  const me = useSignedInUser().id;
  const { load, reload, put } = useUsers(rpc);
  const [filter, setFilter] = useState<UsersFilter>('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [action, setAction] = useState<RowAction>(null);

  const users = useMemo(() => (load.status === 'ready' ? load.users : []), [load]);
  const counts = load.status === 'ready' ? load.counts : null;
  const taken = useMemo(() => new Set(users.map((u) => u.username.toLowerCase())), [users]);
  const perFilter = countByFilter(users);
  const rows = visibleUsers(users, filter, query, counts);

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
    <main className="w-full px-8 pb-8 pt-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.625rem] font-bold tracking-tight">Users</h1>
          <p className="mt-1 text-[0.84375rem] text-muted">
            Open an account to change its role, reset its password or disable it.
          </p>
        </div>
        <Button variant="primary" className="mt-1" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" />
          Add a user
        </Button>
      </header>

      <div className="mb-3 mt-[18px] flex items-center gap-2.5">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search"
          label="Search name or username"
          className="w-[260px] shrink-0"
        />
        <FilterChips
          label="Show accounts"
          options={USERS_FILTERS.map((f) => ({ ...f, count: perFilter[f.key] }))}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {load.status === 'loading' ? (
        <Skeleton rows={6} rowHeight="3rem" label="Loading the users" />
      ) : (
        <>
          {load.truncated && (
            <p className="mb-3 text-sm text-muted">
              Showing the first {formatCount(MAX_LISTED_USERS)} accounts. The rest are on the server
              but not listed here.
            </p>
          )}
          {rows.length === 0 ? (
            <StateMessage
              variant="no-results"
              action={{
                label: 'Show all',
                onClick: () => {
                  setQuery('');
                  setFilter('all');
                },
              }}
            />
          ) : (
            <UsersTable
              users={rows}
              counts={counts}
              onReset={(user) => setAction({ kind: 'reset', user })}
              onDisable={(user) => setAction({ kind: 'disable', user })}
            />
          )}
        </>
      )}

      <AddUserDialog
        open={adding}
        onClose={() => setAdding(false)}
        taken={taken}
        onCreated={put}
        rpc={rpc}
      />
      {action?.kind === 'reset' && (
        <ResetPasswordDialog
          user={action.user}
          rpc={rpc}
          onClose={() => setAction(null)}
          onChanged={put}
        />
      )}
      {action?.kind === 'disable' && (
        <DisableUserConfirm
          user={action.user}
          self={action.user.id === me}
          rpc={rpc}
          onClose={() => setAction(null)}
          onChanged={put}
        />
      )}
    </main>
  );
}
