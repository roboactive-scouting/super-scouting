import { TriangleAlert } from 'lucide-react';
import { useId, useState } from 'react';
import type { FieldDirection, FieldPhase, FieldUnit, FormFieldDefinition } from '@frc/shared';
import { Note } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { WarningFlag } from '@/components/ui/tag';
import { Textarea } from '@/components/ui/textarea';
import { PHASE_ORDER, PHASE_TAB } from '@/features/entry/phases';
import { cn } from '@/lib/utils';
import {
  CompleteMark,
  NEED_EDGE,
  NumberInput,
  PANE_PAIR,
  PaneGroup,
  PaneRow,
  PaneSegmented,
} from './paneParts';
import type { PanePatch } from './SettingsPane';

/*
 * The Meaning group (SPEC-FINAL 5.4; design "Meaning"): the semantic metadata, filled while the
 * field is created because it cannot be backfilled. Description, unit, phase and direction are
 * required on every data field; category and the expected range are optional.
 */

const UNITS: readonly FieldUnit[] = [
  'count',
  'seconds',
  'points',
  'boolean',
  'enum',
  'text',
  'coordinate',
];

/** SPEC-FINAL 5.4's examples; a category the form already holds is offered too. */
const CATEGORIES = ['scoring', 'defence', 'reliability', 'movement', 'driver skill'];

const DIRECTION_NAME: Record<FieldDirection, string> = {
  higher_is_better: 'Higher is better',
  lower_is_better: 'Lower is better',
  neutral: 'Neutral',
};

const PHASES = PHASE_ORDER.map((key) => ({ key, label: PHASE_TAB[key] }));
const DIRECTIONS = (Object.keys(DIRECTION_NAME) as FieldDirection[]).map((key) => ({
  key,
  label: DIRECTION_NAME[key],
}));

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** A required meaning column with nothing in it (as `validateFieldDefinition` judges it). */
export const blank = (value: unknown) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

/** The four required columns still blank on a data field. */
export function missingMeaning(field: FormFieldDefinition): number {
  if (field.type === 'section') return 0;
  return [field.description, field.unit, field.phase, field.direction].filter(blank).length;
}

/** The folded line: "count · Teleop · higher is better · Scoring". */
function meaningSummary(field: FormFieldDefinition): string {
  return [
    field.unit,
    field.phase ? PHASE_TAB[field.phase] : null,
    field.direction ? DIRECTION_NAME[field.direction].toLowerCase() : null,
    field.category ? capital(field.category) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Types whose value the entry form holds to `expected_range` (SPEC-FINAL 15.1). */
const RANGED = new Set(['counter', 'number']);

function ExpectedRange({
  field,
  onChange,
}: {
  field: FormFieldDefinition;
  onChange: (patch: PanePatch) => void;
}) {
  const id = useId();
  const [ends, setEnds] = useState<{ min: number | null; max: number | null }>(() => ({
    min: field.expected_range?.min ?? null,
    max: field.expected_range?.max ?? null,
  }));
  const set = (next: { min: number | null; max: number | null }) => {
    setEnds(next);
    const whole = next.min !== null && next.max !== null && next.min <= next.max;
    onChange({ expected_range: whole ? { min: next.min!, max: next.max! } : null });
  };
  const half = (ends.min === null) !== (ends.max === null);
  const upsideDown = ends.min !== null && ends.max !== null && ends.min > ends.max;
  return (
    <PaneRow
      label="Expected range"
      hintId={`${id}-hint`}
      hint={
        half ? (
          <span className="font-[650] text-warn">Give both ends of the range, or neither.</span>
        ) : upsideDown ? (
          <span className="font-[650] text-warn">The lowest must not be above the highest.</span>
        ) : (
          'A value outside it is blocked when the scouter enters it.'
        )
      }
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <NumberInput
          aria-label="Expected range, lowest"
          aria-describedby={`${id}-hint`}
          value={ends.min}
          onValue={(min) => set({ ...ends, min })}
        />
        <span aria-hidden="true" className="text-muted">
          –
        </span>
        <NumberInput
          aria-label="Expected range, highest"
          aria-describedby={`${id}-hint`}
          value={ends.max}
          onValue={(max) => set({ ...ends, max })}
        />
      </div>
    </PaneRow>
  );
}

/**
 * The Meaning group: "4 required" and how many are missing (or "✓ Complete"), the Note that it
 * cannot be added later, then the controls. A blank required control has the 2 px `--warn`
 * edge and "Needed to publish". Complete, it folds to one line (the pane decides `open`).
 */
export function MetadataFields({
  field,
  allFields,
  onChange,
  editable,
  open,
  onToggle,
  revision = 0,
}: {
  field: FormFieldDefinition;
  allFields: readonly FormFieldDefinition[];
  onChange: (patch: PanePatch) => void;
  editable: boolean;
  open: boolean;
  onToggle: () => void;
  /** Moves on every undo and redo: the expected range starts again from the field (UF.14). */
  revision?: number;
}) {
  const id = useId();
  const missing = missingMeaning(field);
  const need = (column: 'description' | 'unit' | 'phase' | 'direction') =>
    blank(field[column]) ? `${id}-need-${column}` : undefined;
  const categories = [
    ...new Set([
      ...CATEGORIES,
      ...allFields.map((f) => f.category).filter((c): c is string => !!c),
      ...(field.category ? [field.category] : []),
    ]),
  ];
  const disabled = !editable;

  return (
    <PaneGroup
      title="Meaning"
      sub="4 required"
      aside={
        missing > 0 ? (
          <WarningFlag icon={TriangleAlert}>{missing} missing</WarningFlag>
        ) : (
          <CompleteMark />
        )
      }
      fold={missing === 0 ? { open, onToggle, summary: meaningSummary(field) } : undefined}
      disabled={disabled}
    >
      <Note icon="info">
        <b className="text-ink">This cannot be added later.</b> Nobody goes back and describes 80
        fields.
      </Note>
      <PaneRow
        label="Description"
        htmlFor={`${id}-description`}
        required
        needId={need('description')}
      >
        <Textarea
          id={`${id}-description`}
          dir="auto"
          required
          rows={2}
          value={field.description ?? ''}
          aria-describedby={need('description')}
          onChange={(e) => onChange({ description: e.target.value === '' ? null : e.target.value })}
          className={cn('min-h-16', need('description') && NEED_EDGE)}
        />
      </PaneRow>
      <div className={`${PANE_PAIR} grid-cols-2`}>
        <PaneRow label="Unit" htmlFor={`${id}-unit`} required needId={need('unit')}>
          <Select
            id={`${id}-unit`}
            required
            value={field.unit ?? ''}
            aria-describedby={need('unit')}
            onChange={(e) =>
              onChange({ unit: e.target.value === '' ? null : (e.target.value as FieldUnit) })
            }
            className={cn(need('unit') && NEED_EDGE)}
          >
            <option value="">—</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </PaneRow>
        <PaneRow label="Category" htmlFor={`${id}-category`}>
          <Select
            id={`${id}-category`}
            value={field.category ?? ''}
            onChange={(e) => onChange({ category: e.target.value === '' ? null : e.target.value })}
          >
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {capital(c)}
              </option>
            ))}
          </Select>
        </PaneRow>
      </div>
      <PaneRow label="Phase" required needId={need('phase')}>
        <PaneSegmented<FieldPhase>
          label="Phase"
          options={PHASES}
          value={field.phase}
          onChange={(phase) => onChange({ phase })}
          aria-required
          aria-invalid={need('phase') ? true : undefined}
          aria-describedby={need('phase')}
          need={!!need('phase')}
        />
      </PaneRow>
      <PaneRow label="Direction" required needId={need('direction')}>
        <PaneSegmented<FieldDirection>
          label="Direction"
          options={DIRECTIONS}
          value={field.direction}
          onChange={(direction) => onChange({ direction })}
          aria-required
          aria-invalid={need('direction') ? true : undefined}
          aria-describedby={need('direction')}
          need={!!need('direction')}
        />
      </PaneRow>
      {RANGED.has(field.type) && <ExpectedRange key={revision} field={field} onChange={onChange} />}
    </PaneGroup>
  );
}
