/**
 * A yes / no field as a switch (THEME "Switch": 52 × 32, off = white with a control-border
 * edge and a muted knob, on = accent with a white knob). A NAMED group (group/toggle): a
 * bare `group-has-` would match any .group ancestor — a phase card — and draw every switch
 * in it as on. The input stays a native checkbox (role="switch") (it is what the label names and what the tests
 * click); the track and knob beside it only show its state, and the knob's slide is the
 * state change itself.
 */
export function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="group/toggle tap-target flex cursor-pointer items-center justify-between gap-4 py-2">
      <span className="text-sm font-medium" dir="auto">
        {label}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className="motion-transition relative inline-flex h-8 w-13 shrink-0 items-center rounded-full border border-control-border bg-surface group-has-[:checked]/toggle:border-accent group-has-[:checked]/toggle:bg-accent group-has-[:focus-visible]/toggle:outline-2 group-has-[:focus-visible]/toggle:outline-offset-2 group-has-[:focus-visible]/toggle:outline-accent"
      >
        <span className="motion-transition absolute start-[0.1875rem] size-6 rounded-full bg-muted group-has-[:checked]/toggle:translate-x-5 group-has-[:checked]/toggle:bg-on-accent rtl:group-has-[:checked]/toggle:-translate-x-5" />
      </span>
    </label>
  );
}
