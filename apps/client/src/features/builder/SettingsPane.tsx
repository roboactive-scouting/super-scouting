import { Lock } from 'lucide-react';
import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { typeInfo } from './fieldTypes';
import type { BuilderState } from './useBuilderState';

/**
 * The settings pane's head and key line, and the field's label (design 12-form-builder,
 * "Settings pane"). Task 1.30 builds the whole pane — Field, Configuration, Meaning, Scoring,
 * Show when — over this; 1.29 shows what is selected and lets the label (and with it a new
 * field's key) change.
 */
export function SettingsPane({ state, editable }: { state: BuilderState; editable: boolean }) {
  const field = state.selectedField;
  const labelId = useId();
  if (!field) {
    return (
      <section
        aria-label="Field settings"
        className="flex min-h-0 flex-col overflow-hidden rounded-card border border-line bg-surface"
      >
        <p className="px-4 py-6 text-[0.84375rem] text-muted">
          Select a field on the form to see its settings.
        </p>
      </section>
    );
  }
  const { name, icon: Icon } = typeInfo(field.type);
  const saved = state.isSaved(field);
  return (
    <section
      aria-label="Field settings"
      className="flex min-h-0 flex-col overflow-hidden rounded-card border border-line bg-surface"
    >
      <div className="flex flex-none items-center gap-2.5 border-b border-line-2 px-3.5 py-3">
        <span
          aria-hidden="true"
          className="grid size-[30px] shrink-0 place-items-center rounded-[7px] bg-line-2 text-ink-2"
        >
          <Icon className="size-4" strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted">{name}</p>
          <h2 className="truncate text-base font-[750]" dir="auto">
            {field.label}
          </h2>
        </div>
      </div>
      <p className="flex flex-none flex-wrap items-center gap-2 border-b border-line-2 bg-bg px-3.5 py-2 text-xs text-muted">
        {saved && <Lock aria-hidden="true" className="size-[13px]" />}
        <span>Key</span>
        <code className="font-num text-[0.78125rem] font-semibold text-ink">{field.key}</code>
        <span>
          {saved
            ? '· permanent, never changes'
            : 'follows the label until the first save, then it is permanent'}
        </span>
      </p>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3.5 pt-3 pb-3.5">
        <h3 className="text-[0.84375rem] font-[750]">Field</h3>
        <label htmlFor={labelId} className="mt-1 text-xs font-[650] text-ink-2">
          Label
        </label>
        <Input
          id={labelId}
          dir="auto"
          value={field.label}
          readOnly={!editable}
          onChange={(e) => state.updateField(field.key, { label: e.target.value })}
        />
      </div>
    </section>
  );
}
