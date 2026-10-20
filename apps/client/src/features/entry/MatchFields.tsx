import { useId } from 'react';
import type { MatchType } from '@frc/shared';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { MATCH_TYPE_PREFIX } from '@/lib/matchLabel';
import { cn } from '@/lib/utils';

/**
 * The match type and the typed match number, with its "Q" prefix (Scout README 2). Side by side
 * while both fit; stacked once the row is under 19 rem of its own width (a phone at 115 % text
 * and up, task 1.38), where "Qualification" was cut to "Quali".
 */
export function MatchFields({
  matchType,
  onMatchType,
  number,
  onNumber,
}: {
  matchType: string;
  onMatchType: (type: string) => void;
  number: string;
  onNumber: (number: string) => void;
}) {
  const typeId = useId();
  const numberId = useId();
  return (
    <div className="@container mt-3 lg:mt-4 lg:max-w-[calc(50%-0.5rem)]">
      <div className="grid grid-cols-[1fr_1.2fr] gap-2 @max-[19rem]:grid-cols-1">
        <div>
          <label htmlFor={typeId} className="mb-2 block text-xs font-semibold text-muted">
            Match type
          </label>
          <Select
            id={typeId}
            size="lg"
            value={matchType}
            onChange={(e) => onMatchType(e.target.value)}
          >
            <option value="qualification">Qualification</option>
            <option value="practice">Practice</option>
            <option value="playoff">Playoff</option>
          </Select>
        </div>
        <div>
          <label htmlFor={numberId} className="mb-2 block text-xs font-semibold text-muted">
            Match number
          </label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 font-num text-[1.375rem] font-semibold text-muted"
            >
              {MATCH_TYPE_PREFIX[matchType as MatchType]}
            </span>
            <Input
              id={numberId}
              type="number"
              min={1}
              inputMode="numeric"
              size="lg"
              mono
              className={cn(
                '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none',
                matchType === 'playoff' ? 'ps-14' : 'ps-10',
              )}
              value={number}
              onChange={(e) => onNumber(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
