/**
 * A yes / no field as a switch. The checkbox stays native (it is what the label names and
 * what the tests click); the track and knob beside it only show its state, and the knob's
 * slide is the state change itself.
 */
export function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="group tap-target flex cursor-pointer items-center justify-between gap-4 py-2">
      <span className="text-sm font-medium" dir="auto">
        {label}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className="motion-transition relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border border-border bg-surface-raised group-has-[:checked]:border-text group-has-[:checked]:bg-text group-has-[:focus-visible]:outline-2 group-has-[:focus-visible]:outline-offset-2 group-has-[:focus-visible]:outline-focus"
      >
        <span className="motion-transition absolute start-1 size-6 rounded-full bg-text-muted group-has-[:checked]:translate-x-6 group-has-[:checked]:bg-bg" />
      </span>
    </label>
  );
}
