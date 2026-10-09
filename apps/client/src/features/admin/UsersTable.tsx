import { Ban, KeyRound } from 'lucide-react';
import type { MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PublicUser } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { Initials } from '@/components/ui/initials';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AccountStatusTag, RoleTag } from '@/components/ui/tag';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';
import type { EntryCounts } from './useUsers';
import { entriesOf } from './usersView';

const ACTION = 'min-h-8 px-2.5 text-[0.78125rem] after:-inset-y-2 [&_svg]:size-[15px]';

/**
 * THEME "Data table" over the accounts (design 08-users, variant C). A row opens the account
 * page; Reset password and Disable sit at the row's end, shown on hover and whenever focus
 * is inside the row, so a keyboard always reaches them.
 */
export function UsersTable({
  users,
  counts,
  onReset,
  onDisable,
}: {
  users: PublicUser[];
  counts: EntryCounts;
  onReset: (user: PublicUser) => void;
  onDisable: (user: PublicUser) => void;
}) {
  const navigate = useNavigate();
  const pathOf = (user: PublicUser) => `${PATHS.users}/${encodeURIComponent(user.id)}`;
  const open = (user: PublicUser) => (e: MouseEvent<HTMLTableRowElement>) => {
    // The name's link and the row's buttons do their own thing.
    if ((e.target as HTMLElement).closest('a, button')) return;
    navigate(pathOf(user));
  };

  return (
    <Table containerClassName="rounded-card border border-line bg-surface">
      <TableHeader>
        <TableRow>
          <TableHead className="ps-4">Full name</TableHead>
          <TableHead>Username</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead numeric>Entries this season</TableHead>
          <TableHead numeric className="pe-4">
            Quick actions
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => {
          const off = user.disabled_at !== null;
          const entries = entriesOf(counts, user.id);
          return (
            <TableRow
              key={user.id}
              onClick={open(user)}
              className={cn('group cursor-pointer', off && 'text-muted')}
            >
              <TableCell className="py-0 ps-4">
                <Link
                  to={pathOf(user)}
                  className="tap-target flex items-center gap-2.5 font-semibold text-ink"
                >
                  <span className={cn('inline-flex', off && 'opacity-60')}>
                    <Initials name={user.full_name} />
                  </span>
                  <span dir="auto" className={cn(off && 'text-muted')}>
                    {user.full_name}
                  </span>
                </Link>
              </TableCell>
              <TableCell className="num font-medium" dir="auto">
                {user.username}
              </TableCell>
              <TableCell>
                <RoleTag role={user.role} />
              </TableCell>
              <TableCell>
                <AccountStatusTag disabledAt={user.disabled_at} />
              </TableCell>
              <TableCell numeric className={cn(entries === 0 && 'text-warn')}>
                {entries ?? '–'}
              </TableCell>
              <TableCell className="py-0 pe-4">
                {!off && (
                  <div className="flex justify-end gap-1.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                    <Button size="sm" className={ACTION} onClick={() => onReset(user)}>
                      <KeyRound aria-hidden="true" />
                      Reset password
                    </Button>
                    <Button size="sm" className={ACTION} onClick={() => onDisable(user)}>
                      <Ban aria-hidden="true" />
                      Disable
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
