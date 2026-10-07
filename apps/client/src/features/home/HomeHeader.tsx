import { ClipboardCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, buttonVariants } from '@/components/ui/button';
import { WarningNotice } from '@/components/ui/notice';
import { sessionOverride, type SessionOverrideState } from '@/features/context/sessionOverride';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';

/**
 * The top of Home (README): "This device is working on" and the event, then Scout a match
 * (primary) and Switch competition (secondary) — beside the name on a computer, full width
 * under it on a phone. Under a session override the other event is named, a warning banner
 * offers the way back, and Scout is withheld: no new entry then (SPEC-FINAL 6.3).
 */
export function HomeHeader({
  name,
  override,
  desktop,
  onSwitch,
}: {
  name: string;
  override: SessionOverrideState;
  desktop: boolean;
  onSwitch: () => void;
}) {
  const lookingAt = override?.eventName ?? 'another competition';
  const scout = !override && (
    <Link
      to={PATHS.scout}
      className={buttonVariants({
        variant: 'primary',
        size: desktop ? 'md' : 'block',
        className: desktop ? 'px-[22px]' : 'mt-3',
      })}
    >
      <ClipboardCheck aria-hidden="true" />
      Scout a match
    </Link>
  );
  const switchButton = (
    <Button
      variant="secondary"
      className={desktop ? undefined : cn('w-full min-h-[46px]', override ? 'mt-3' : 'mt-2')}
      onClick={onSwitch}
    >
      Switch competition
    </Button>
  );

  return (
    <>
      <div className={cn(desktop && 'flex items-end gap-3')}>
        <div className="min-w-0 flex-1">
          <p className="text-[0.78125rem] font-medium text-muted">
            {override ? 'For this session, you are looking at' : 'This device is working on'}
          </p>
          <h1
            id="home-title"
            dir="auto"
            className={cn(
              'font-[750] tracking-[-0.02em]',
              desktop
                ? 'mt-1 text-[1.75rem] leading-[1.15]'
                : 'mt-[3px] text-[1.375rem] leading-[1.2]',
            )}
          >
            {override ? lookingAt : name}
          </h1>
        </div>
        {desktop ? (
          <>
            {switchButton}
            {scout}
          </>
        ) : (
          <>
            {scout}
            {switchButton}
          </>
        )}
      </div>
      {override && (
        <WarningNotice className="mt-4" lead={`Looking at ${lookingAt} for this session.`}>
          <Button
            variant="secondary"
            className="mt-2.5 w-full"
            onClick={() => sessionOverride.clear()}
          >
            <span dir="auto">Back to {name}</span>
          </Button>
        </WarningNotice>
      )}
    </>
  );
}
