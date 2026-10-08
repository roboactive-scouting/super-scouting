import {
  isScorable,
  isSelectType,
  selectOptions,
  type FieldPhase,
  type FieldTypeName,
} from '@frc/shared';
import { ErrorLine, Note } from '@/components/ui/notice';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PHASE_TAB } from '@/features/entry/phases';
import { cn } from '@/lib/utils';
import { NumberInput, PaneGroup } from './paneParts';
import type { PaneField, PanePatch } from './SettingsPane';

/** Why a type holds no points (SPEC-FINAL 4.1), said instead of hiding the group. */
export const NOT_SCORED: Partial<Record<FieldTypeName, string>> = {
  rating: "Ratings are not scored. They are a scout's judgement, not game points.",
  timer: 'Timers are not scored. They give times, not game points.',
  short_text: 'Short text fields are not scored.',
  long_text: 'Long text fields are not scored.',
  event_log:
    'Event logs are not scored. Their taps give counts and cycle times; score the goals with a counter if they earn points.',
  position: 'Field positions are not scored. They feed the heat maps and scatter charts.',
  cycle_path: 'Cycle paths are not scored. They draw route maps on the team page.',
  computed: 'Computed fields are not scored. Score the fields they are worked out from.',
};

/**
 * The matrix is the data table (BUILD-CONTEXT 12.1) drawn as the design's points grid: no row
 * dividers or hover, compact 3 px rows, 11.5 px headers (fix round 1, I5).
 */
const ROW = 'border-0 hover:bg-transparent';
const CELL = 'h-auto px-0 py-[3px]';

/** The matrix's phase columns: a field scores in its own phase only (SPEC-FINAL 4.1, rule 2). */
const PLAY_PHASES: readonly FieldPhase[] = ['auto', 'teleop', 'endgame'];

/** A cell of another phase: greyed, holding nothing, and said so to assistive tech. */
function OtherPhase() {
  return (
    <span className="num flex h-12 items-center justify-end rounded-control border border-line bg-bg px-3 text-[0.8125rem] text-faint">
      <span aria-hidden="true">0</span>
      <span className="sr-only">not this field's phase</span>
    </span>
  );
}

/**
 * The Scoring group (SPEC-FINAL 4; design "Scoring"): a phase × value matrix whose column for
 * the field's own phase holds the points — one row for a counter or number ("Each piece", points
 * per unit), one for a toggle, one per option for a select — and whose other phase columns are
 * greyed, since a field scores in one phase. A field with no phase yet, or in Notes, has one
 * "Points" column. A type that is not scored says why. A 0 cell is greyed; 0 everywhere means
 * recorded, not scored. Scoring changes in place and never starts a version.
 */
export function ScoringFields({
  field,
  onChange,
  editable,
  published,
  issues,
}: {
  field: PaneField;
  onChange: (patch: PanePatch) => void;
  editable: boolean;
  published: boolean;
  issues: readonly string[];
}) {
  if (!isScorable(field.type)) {
    return (
      <PaneGroup title="Scoring">
        <Note icon="info">{NOT_SCORED[field.type] ?? 'This field is not scored.'}</Note>
      </PaneGroup>
    );
  }
  const select = isSelectType(field.type);
  const own = field.phase && PLAY_PHASES.includes(field.phase) ? field.phase : null;
  const columns: (FieldPhase | null)[] = own ? [...PLAY_PHASES] : [null];
  const points = field.points ?? 0;
  const optionPoints = field.option_points ?? {};

  const rows: {
    id: string;
    label: string;
    input: string;
    value: number;
    set: (n: number) => void;
  }[] = select
    ? selectOptions(field).map((o) => ({
        id: o.value,
        label: o.label,
        input: `Points for ${o.label}`,
        value: optionPoints[o.value] ?? 0,
        set: (n) => onChange({ points: 0, option_points: { ...optionPoints, [o.value]: n } }),
      }))
    : [
        {
          id: 'points',
          label: field.type === 'toggle' ? 'Yes' : 'Each piece',
          input: field.type === 'toggle' ? 'Points for yes' : 'Points per unit',
          value: points,
          set: (n) => onChange({ points: n, option_points: null }),
        },
      ];
  const per = select
    ? 'points per option'
    : field.type === 'toggle'
      ? 'points for yes'
      : 'points per piece';

  return (
    <PaneGroup
      title="Scoring"
      sub={own ? `${per}, by phase` : per}
      aside={
        published ? <span className="text-xs text-muted">in place · no new version</span> : null
      }
      disabled={!editable}
    >
      <Table className="text-[0.8125rem]">
        <TableHeader className="[&_tr]:border-0">
          <TableRow className={ROW}>
            <TableCell className={CELL} />
            {columns.map((phase) => (
              <TableHead
                key={phase ?? 'points'}
                numeric
                className="h-auto px-0 pb-1 text-[0.71875rem] font-bold"
              >
                {phase ? PHASE_TAB[phase] : 'Points'}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className={ROW}>
              <TableHead
                scope="row"
                className={`${CELL} whitespace-normal pe-2 text-[0.8125rem] font-normal text-ink`}
                dir="auto"
              >
                {row.label}
              </TableHead>
              {columns.map((phase) => (
                <TableCell key={phase ?? 'points'} className={`${CELL} w-[24%] ps-1.5`}>
                  {phase === own ? (
                    <NumberInput
                      aria-label={row.input}
                      min={0}
                      selectOnFocus
                      value={row.value}
                      onValue={(n) => row.set(n ?? 0)}
                      className={cn(
                        'text-end text-[0.8125rem]',
                        row.value === 0 && 'border-line bg-bg text-muted',
                      )}
                    />
                  ) : (
                    <OtherPhase />
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs leading-snug text-muted">
        0 everywhere means it is recorded but not scored.
        {field.phase === null
          ? ' Once its meaning names a phase, the points sit in that column.'
          : ''}
      </p>
      {issues.length > 0 && (
        <ErrorLine>
          {issues.map((m) => (
            <span key={m} className="block">
              {m}
            </span>
          ))}
        </ErrorLine>
      )}
    </PaneGroup>
  );
}
