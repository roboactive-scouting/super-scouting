import { useId, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function Hint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 text-sm text-muted">
      {children}
    </p>
  );
}

/** A labelled field at the 48 px floor; `dir="auto"` because names may be Hebrew (17.1). */
export function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  invalid?: boolean;
  errorId?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const describedBy = [props.hint ? hintId : null, props.invalid ? props.errorId : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="mt-4">
      <Label htmlFor={id}>{props.label}</Label>
      <Input
        id={id}
        type="text"
        value={props.value}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        dir="auto"
        aria-invalid={props.invalid || undefined}
        aria-describedby={describedBy || undefined}
        className="mt-1.5"
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.hint && <Hint id={hintId}>{props.hint}</Hint>}
    </div>
  );
}
