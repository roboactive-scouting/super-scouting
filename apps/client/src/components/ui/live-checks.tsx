import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type LiveCheck = { label: string; state: 'idle' | 'ok' | 'no' };

/**
 * A list of rules under a field (THEME "Live checks": an 18 px circle, then a 13 px / 600
 * rule). Not yet checked: an empty control-border circle, muted text. Met: a filled accent
 * circle with a ✓. Not met: a warn circle with ✕. Never colour alone — the state is also
 * said in words for a screen reader, and the region is polite so a change is announced.
 */
export function LiveChecks({ checks }: { checks: readonly LiveCheck[] }) {
  return (
    <div aria-live="polite">
      <ul className="mt-2.5 flex flex-col gap-1.5">
        {checks.map((check) => (
          <li
            key={check.label}
            data-state={check.state}
            className={cn(
              'flex items-center gap-2 text-[0.8125rem] font-semibold',
              check.state === 'ok' && 'text-accent-ink',
              check.state === 'no' && 'text-warn',
              check.state === 'idle' && 'text-muted',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border-[1.5px]',
                check.state === 'ok' && 'border-accent bg-accent text-on-accent',
                check.state === 'no' && 'border-warn text-warn',
                check.state === 'idle' && 'border-control-border',
              )}
            >
              {check.state === 'ok' && <Check className="size-[0.6875rem]" strokeWidth={3} />}
              {check.state === 'no' && <X className="size-[0.6875rem]" strokeWidth={3} />}
            </span>
            <span dir="auto">{check.label}</span>
            {check.state !== 'idle' && (
              <span className="sr-only">{check.state === 'ok' ? ': met' : ': not met'}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
