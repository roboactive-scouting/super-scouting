import { useId } from 'react';
import type { RobotStatus } from '@frc/shared';
import { Input } from '@/components/ui/input';
import { Note } from '@/components/ui/notice';
import { Segmented } from '@/components/ui/segmented';
import { STATUS_LABEL, STATUS_ORDER } from './phases';

const OPTIONS = STATUS_ORDER.map((key) => ({ key, label: STATUS_LABEL[key] }));

/**
 * Robot status, a 4-way segmented control (Entry README). Nothing is chosen until the scout
 * chooses: the fields stay hidden till then, so a dead robot never starts as "played".
 * Broke down adds the breakdown time; No show and Disabled say that only the status is kept.
 */
export function RobotStatusPicker({
  value,
  onChange,
  breakdownSeconds,
  onBreakdownSeconds,
}: {
  value: RobotStatus | null;
  onChange: (status: RobotStatus) => void;
  breakdownSeconds: number;
  onBreakdownSeconds: (seconds: number) => void;
}) {
  const label = useId();
  const breakdownId = useId();
  return (
    <>
      <div role="group" aria-labelledby={label}>
        <p id={label} className="mb-2 text-xs font-semibold text-muted">
          Robot status
        </p>
        <Segmented<RobotStatus | ''>
          label="Robot status"
          options={OPTIONS}
          value={value ?? ''}
          onChange={(key) => {
            if (key !== '') onChange(key);
          }}
        />
      </div>
      {value === 'broke_down' && (
        <div className="mt-3.5">
          <label htmlFor={breakdownId} className="mb-2 block text-xs font-semibold text-muted">
            Breakdown time (seconds from match start)
          </label>
          <div className="relative">
            <Input
              id={breakdownId}
              type="number"
              min={0}
              inputMode="numeric"
              mono
              className="pe-8 text-lg font-semibold"
              value={breakdownSeconds}
              onChange={(e) => onBreakdownSeconds(Number(e.target.value))}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-[0.8125rem] text-muted"
            >
              s
            </span>
          </div>
        </div>
      )}
      {(value === 'no_show' || value === 'disabled') && (
        <Note className="mt-3.5">
          <b className="font-bold text-ink">Status only.</b> No fields are recorded for a{' '}
          {value === 'no_show' ? 'no-show' : 'disabled'} robot, so its averages are never pulled
          down by zeros.
        </Note>
      )}
    </>
  );
}
