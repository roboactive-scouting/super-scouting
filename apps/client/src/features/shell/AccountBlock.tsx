import { ArrowRightLeft, Lock, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Initials } from '@/components/ui/initials';
import { roleLabel } from '@/components/ui/tag';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';
import type { Account } from './account';

const ACTION =
  'flex min-h-12 w-full items-center gap-3 rounded-lg px-2.5 text-start text-[0.90625rem] font-[550] text-rail-ink hover:bg-rail-raised hover:text-white';
const ICON = 'size-[1.1875rem] shrink-0';

/**
 * The phone menu's foot (THEME "Phone menu"): who is signed in, the three account actions
 * under the same conditions as the desktop account menu, then the version and the team.
 */
export function AccountBlock({
  account,
  version,
  onNavigate,
}: {
  account: Account;
  version: string;
  onNavigate: () => void;
}) {
  return (
    <div className="mt-auto border-t border-rail-line pt-3">
      <div className="flex items-center gap-2.5 px-2.5 pt-1 pb-2">
        <Initials name={account.name} tone="dark" size={40} />
        <div className="min-w-0 leading-tight">
          <p dir="auto" className="truncate text-sm font-[650] text-white">
            {account.name}
          </p>
          <p className="truncate text-xs text-rail-muted">{roleLabel(account.role)}</p>
        </div>
      </div>
      {account.canSwitch && (
        <Link to={PATHS.switchScouter} className={ACTION} onClick={onNavigate}>
          <ArrowRightLeft aria-hidden="true" strokeWidth={1.8} className={ICON} />
          Switch scouter
        </Link>
      )}
      {account.canChangePassword && (
        <Link to={PATHS.changePassword} className={ACTION} onClick={onNavigate}>
          <Lock aria-hidden="true" strokeWidth={1.8} className={ICON} />
          Change password
        </Link>
      )}
      <button type="button" className={ACTION} onClick={account.onSignOut}>
        <LogOut aria-hidden="true" strokeWidth={1.8} className={cn(ICON, '-scale-x-100')} />
        Sign out
      </button>
      <p className="flex justify-between px-2.5 pt-2 text-[0.71875rem] text-rail-muted">
        <span>version {version}</span>
        <span>Team 2096</span>
      </p>
    </div>
  );
}
