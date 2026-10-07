import { ArrowRightLeft, Calendar, List, Users } from 'lucide-react';
import type { Role } from '@frc/shared';
import { GoToTile } from '@/components/ui/goto-tile';
import { canManageEvents, canManageUsers } from '@/features/admin/AdminOnly';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';

/**
 * Home's "Go to" tiles (README): Entries and Switch scouter for everyone; for an admin,
 * Manage and Users on a computer. On a phone the admin tile is "Matches" (the phone's
 * matches-only Manage), and Users is never offered: it needs a computer. No Scout tile:
 * Scout is the primary button. The pages check the role again, and so does the server.
 */
export function GoToTiles({
  user,
  expired,
  desktop,
}: {
  user: { id: string; role: Role };
  expired: boolean;
  desktop: boolean;
}) {
  const manage = !expired && canManageEvents(user);
  const users = !expired && desktop && canManageUsers(user);
  return (
    <section aria-labelledby="home-goto">
      <h2
        id="home-goto"
        className={cn('font-bold', desktop ? 'mt-[22px] mb-2.5 text-[0.96875rem]' : 'mt-4 mb-2')}
      >
        Go to
      </h2>
      <div
        className={cn(
          'grid',
          desktop
            ? 'grid-cols-4 gap-2.5'
            : // The phone design: 96 px tiles, 12 px padding, a 32 px icon square.
              'grid-cols-2 gap-2 [&_a]:min-h-24 [&_a]:p-3 [&_a>span:first-child]:mb-1 [&_a>span:first-child]:size-8',
        )}
      >
        <GoToTile
          icon={List}
          title="Entries"
          description="Review and fix what you entered"
          to={PATHS.entries}
        />
        {!expired && (
          <GoToTile
            icon={ArrowRightLeft}
            title="Switch scouter"
            description="Hand this device to someone else"
            to={PATHS.switchScouter}
          />
        )}
        {manage &&
          (desktop ? (
            <GoToTile
              icon={Calendar}
              title="Manage"
              description="Seasons, events, teams and matches"
              to={PATHS.manage}
              admin
            />
          ) : (
            <GoToTile
              icon={Calendar}
              title="Matches"
              description="Create matches and line-ups"
              to={PATHS.manage}
              admin
            />
          ))}
        {users && (
          <GoToTile
            icon={Users}
            title="Users"
            description="Accounts and roles"
            to={PATHS.users}
            admin
          />
        )}
      </div>
    </section>
  );
}
