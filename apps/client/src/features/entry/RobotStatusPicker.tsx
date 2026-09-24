import type { RobotStatus } from '@frc/shared';

const OPTIONS: { value: RobotStatus; label: string; token: string }[] = [
  { value: 'played', label: 'Played', token: 'var(--status-played)' },
  { value: 'broke_down', label: 'Broke down', token: 'var(--status-broke-down)' },
  { value: 'disabled', label: 'Disabled', token: 'var(--status-disabled)' },
  { value: 'no_show', label: 'No show', token: 'var(--status-no-show)' },
];

export function RobotStatusPicker({
  value,
  onChange,
}: {
  value: RobotStatus | null;
  onChange: (status: RobotStatus) => void;
}) {
  return (
    <fieldset role="group" aria-label="Robot status" className="py-2">
      <legend className="text-sm font-medium">Robot status</legend>
      <div className="tap-row mt-2 grid grid-cols-2 gap-2">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className="tap-target flex items-center gap-2 rounded-lg border px-3"
            style={{ borderColor: value === option.value ? option.token : 'var(--border)' }}
          >
            <input
              type="radio"
              name="robot_status"
              aria-label={option.label}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
