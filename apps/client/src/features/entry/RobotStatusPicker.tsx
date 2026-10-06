import type { RobotStatus } from '@frc/shared';
import { ChoiceGroup, type Choice } from '@/components/entry/ChoiceGroup';

const OPTIONS: readonly Choice<RobotStatus>[] = [
  { value: 'played', label: 'Played', accent: 'var(--status-played)' },
  { value: 'broke_down', label: 'Broke down', accent: 'var(--status-broke-down)' },
  { value: 'disabled', label: 'Disabled', accent: 'var(--status-disabled)' },
  { value: 'no_show', label: 'No show', accent: 'var(--status-no-show)' },
];

export function RobotStatusPicker({
  value,
  onChange,
}: {
  value: RobotStatus | null;
  onChange: (status: RobotStatus) => void;
}) {
  return (
    <ChoiceGroup
      legend="Robot status"
      name="robot_status"
      value={value}
      options={OPTIONS}
      onChange={onChange}
    />
  );
}
