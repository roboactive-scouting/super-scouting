import { Eye, RotateCcw } from 'lucide-react';
import { isVisible, selectOptions, type FormFieldDefinition } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Note } from '@/components/ui/notice';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { FieldInput } from '@/features/entry/FieldInput';
import { PHASE_TAB } from '@/features/entry/phases';
import { DRAWN_TYPES, FieldPreview } from './FieldPreview';

/*
 * Try it (design 12-form-builder, "Try it"; task 1.31): the canvas's own 410 px column with the
 * scouter's real controls working, and a pane saying what the entry would save. Nothing typed
 * here is submitted, drafted, written to this device or sent: the values live in the builder's
 * memory only, and this module imports nothing that stores or sends.
 */

/**
 * The fields of one phase page, filled as a scouter would. A field hidden by its condition is
 * not drawn, judged on `data` (the would-be-saved values), so what is drawn and what is saved
 * always agree.
 */
export function LivePreviewColumn({
  page,
  values,
  data,
  onChange,
}: {
  page: readonly FormFieldDefinition[];
  values: Record<string, unknown>;
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const shown = page.filter((field) => isVisible(field, data));
  if (shown.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-control-border bg-surface px-4 py-6 text-center text-[0.84375rem] text-muted">
        Nothing to fill on this page{page.length > 0 ? ' until another answer shows it' : ''}.
      </p>
    );
  }
  return (
    <ul aria-label="Try it" className="flex flex-col gap-2">
      {shown.map((field, i) => {
        const before = shown[i - 1];
        const heading = field.section && field.section !== before?.section ? field.section : null;
        return (
          <li key={field.id} data-field-key={field.key} className="flex flex-col gap-2">
            {heading && (
              <h4 className="px-0.5 pt-1.5 text-base font-[750]" dir="auto">
                {heading}
              </h4>
            )}
            <div className="rounded-[10px] border border-line bg-surface px-3.5 py-1.5">
              {DRAWN_TYPES.has(field.type) ? (
                <FieldInput
                  field={field}
                  value={values[field.key]}
                  onChange={(value) => onChange(field.key, value)}
                />
              ) : (
                <div className="py-1.5">
                  <FieldPreview field={field} />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** What the analysis reads from one value, in words. */
function analysisValue(field: FormFieldDefinition, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (field.type === 'single_select' && typeof value === 'string') {
    return selectOptions(field).find((o) => o.value === value)?.label ?? value;
  }
  if (field.type === 'multi_select' && Array.isArray(value)) {
    const options = selectOptions(field);
    return value.map((v) => options.find((o) => o.value === v)?.label ?? String(v)).join(', ');
  }
  if (typeof value === 'number') return String(Math.round(value * 100) / 100);
  if (typeof value === 'string') {
    if (value === '') return 'empty';
    return `“${value.length > 40 ? `${value.slice(0, 40)}…` : value}”`;
  }
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'item' : 'items'}`;
  return JSON.stringify(value);
}

/** The types whose analysis (taps, cycle times, routes) needs controls tasks 1.34–1.35 add. */
const LATER = new Set(['event_log', 'cycle_path', 'position', 'timer']);

/**
 * The settings pane in Try it: "What this entry would save" — the Note that nothing is saved
 * or sent, the entry's data as it would sync, and what the analysis gets from it.
 */
export function TryItPane({
  fields,
  data,
  onStartOver,
}: {
  fields: readonly FormFieldDefinition[];
  /** The entry's data as it would sync (`previewData`), worked out once by the page. */
  data: Record<string, unknown>;
  onStartOver: () => void;
}) {
  const rows = fields.filter((f) => f.type !== 'section' && f.key in data);
  const later = fields.some((f) => LATER.has(f.type));
  // Two fields may share a label across phases ("Pieces scored high"): the phase tells them apart.
  const shared = new Set(
    rows.map((f) => f.label).filter((label, i, all) => all.indexOf(label) !== i),
  );
  return (
    <Card
      as="section"
      aria-label="What this entry would save"
      className="flex min-h-0 flex-col overflow-hidden p-0"
    >
      <div className="flex flex-none items-center gap-2.5 border-b border-line-2 px-4 py-3">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-line-2 text-ink-2"
        >
          <Eye className="size-[17px]" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted">Try it</p>
          <h2 className="text-base font-[750]">What this entry would save</h2>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3.5">
        <Note icon="info">
          You are filling the form as a scouter would.{' '}
          <b className="text-ink">Nothing is saved or sent.</b> Use it to check that each field
          records what you meant.
        </Note>
        <section aria-labelledby="try-saved" className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <h3 id="try-saved" className="text-sm font-bold">
              Saved data
            </h3>
            <span className="text-xs text-muted">as it would sync</span>
            <Button variant="ghost" size="sm" className="ms-auto" onClick={onStartOver}>
              <RotateCcw aria-hidden="true" />
              Start over
            </Button>
          </div>
          <pre
            data-testid="try-saved-data"
            className="overflow-x-auto rounded-control border border-line bg-bg px-3 py-2.5 font-num text-[0.75rem] leading-5 text-ink"
          >
            {JSON.stringify(data, null, 2)}
          </pre>
        </section>
        <section aria-labelledby="try-analysis" className="flex flex-col gap-2">
          <h3 id="try-analysis" className="text-sm font-bold">
            What the analysis gets
          </h3>
          {rows.length > 0 ? (
            <Table aria-labelledby="try-analysis" className="rounded-control border border-line">
              <TableBody>
                {rows.map((field) => (
                  <TableRow key={field.key}>
                    <TableCell className="text-[0.8125rem] text-ink-2" dir="auto">
                      {field.label}
                      {shared.has(field.label) && field.phase && (
                        <span className="text-muted"> · {PHASE_TAB[field.phase]}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-end font-num text-[0.8125rem] font-semibold">
                      {analysisValue(field, data[field.key])}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-[0.8125rem] text-muted">No values yet.</p>
          )}
          {later && (
            <p className="text-xs text-muted">
              Taps, time to first, cycle times and route counts appear here once event logs and map
              fields can be filled in Try it (tasks 1.34–1.35).
            </p>
          )}
        </section>
      </div>
    </Card>
  );
}
