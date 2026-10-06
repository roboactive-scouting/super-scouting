import { ArrowLeftRight, KeyRound, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Role } from '@frc/shared';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { ROLE_LABEL } from '@/features/admin/fields';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';

const ACTION = cn(
  buttonVariants({ variant: 'ghost', size: 'block' }),
  'justify-start gap-3 text-sm text-text-muted hover:text-text',
);

/**
 * Who is signed in, and the three things they can do about it. Moved from the old footer
 * (SPEC-FINAL 7.3, 7.5): Switch scouter only while the session is live, Change password
 * only with a token (it needs the server), Sign out always.
 */
export function AccountBlock({
  name,
  role,
  canSwitch,
  canChangePassword,
  onSignOut,
  collapsed = false,
}: {
  name: string;
  role: Role;
  canSwitch: boolean;
  canChangePassword: boolean;
  onSignOut: () => void;
  collapsed?: boolean;
}) {
  const label = (text: string) => (collapsed ? <span className="sr-only">{text}</span> : text);
  return (
    <div className="flex flex-col gap-0.5">
      <p
        className={cn(
          'flex flex-wrap items-center gap-2 px-3 pb-2 text-sm text-text-muted',
          collapsed && 'sr-only',
        )}
      >
        <span>
          Signed in as{' '}
          <span dir="auto" className="font-medium text-text">
            {name}
          </span>
        </span>
        <Badge>{ROLE_LABEL[role]}</Badge>
      </p>
      {canSwitch && (
        <Link
          to={PATHS.switchScouter}
          className={ACTION}
          title={collapsed ? 'Switch scouter' : undefined}
        >
          <ArrowLeftRight aria-hidden="true" />
          {label('Switch scouter')}
        </Link>
      )}
      {canChangePassword && (
        <Link
          to={PATHS.changePassword}
          className={ACTION}
          title={collapsed ? 'Change password' : undefined}
        >
          <KeyRound aria-hidden="true" />
          {label('Change password')}
        </Link>
      )}
      <button
        type="button"
        className={ACTION}
        title={collapsed ? 'Sign out' : undefined}
        onClick={onSignOut}
      >
        <LogOut aria-hidden="true" />
        {label('Sign out')}
      </button>
    </div>
  );
}
