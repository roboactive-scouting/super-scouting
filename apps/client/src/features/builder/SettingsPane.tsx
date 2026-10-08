import { Ellipsis, Lock, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { type FieldTypeName, type FormFieldDefinition, type FormIssue } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Note } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { PHASE_TAB } from '@/features/entry/phases';
import { ConfigFields } from './ConfigFields';
import { defaultConfig, FIELD_TYPE_INFO, typeInfo, typeName } from './fieldTypes';
import { MetadataFields, missingMeaning } from './MetadataFields';
import { CompleteMark, PaneGroup, PaneRow } from './paneParts';
import { ruleLost } from './scoringRules';
import { ScoringFields } from './ScoringFields';
import { ShowWhenFields } from './ShowWhenFields';
import type { FieldPatch } from './useBuilderState';

/** The selected field as the pane shows it: its definition and its points (a ScoredFieldRow). */
export type PaneField = FormFieldDefinition & {
  points?: number | null;
  option_points?: Record<string, number> | null;
};

/**
 * One change from the pane: columns of the field (never its id or key), and — for the form's
 * scoring, which is not part of the version — `points` / `option_points`.
 */
export type PanePatch = FieldPatch & {
  points?: number;
  option_points?: Record<string, number> | null;
};

/** The types a field may change to: every data type (a section holds no data). */
const DATA_TYPES = FIELD_TYPE_INFO.map((info) => info.type).filter((t) => t !== 'section');

/** "Endgame section · required · no help text" / "Teleop · not required · help: “…”". */
function fieldSummary(field: FormFieldDefinition): string {
  return [
    field.section ? `${field.section} section` : field.phase ? PHASE_TAB[field.phase] : null,
    field.required ? 'required' : 'not required',
    field.help_text ? `help: “${field.help_text}”` : 'no help text',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The head's ⋯ menu: Remove field, and what removing it does here. Tab or Escape closes it. */
function FieldMenu({
  label,
  detail,
  onRemove,
}: {
  label: string;
  detail: string;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    item.current?.focus();
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  return (
    <div
      ref={root}
      className="relative ms-auto"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
          button.current?.focus();
        } else if (e.key === 'Tab' && open) {
          // Focus moves on as Tab says; the menu does not stay open behind it.
          setOpen(false);
        }
      }}
    >
      <Button
        ref={button}
        size="icon-sm"
        aria-label={`Field actions: ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="border-line text-ink-2"
      >
        <Ellipsis aria-hidden="true" />
      </Button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={`Field actions: ${label}`}
          className="absolute end-0 top-10 z-20 w-64 rounded-card border border-line bg-surface p-1 shadow-[var(--shadow-float)]"
        >
          <button
            ref={item}
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
            className="hover-veil flex w-full items-start gap-2.5 rounded-control px-2.5 py-2 text-start"
          >
            <Trash2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-2" />
            <span>
              <b className="block text-[0.84375rem] font-[650]">Remove field</b>
              <small className="block text-xs text-muted">{detail}</small>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

/** The pane is a Card (BUILD-CONTEXT 12.1) that scrolls inside: no padding of its own. */
const PANE = 'flex min-h-0 flex-col overflow-hidden p-0';

/**
 * The settings pane (design 12-form-builder, "Settings pane"; SPEC-FINAL 5.4, 4.2, 17.9): the
 * selected field's configuration, semantic metadata and scoring together, so the meaning is
 * filled while the field is created. A Card: the head (type, label, ⋯), the key line, then the
 * groups Field · Configuration · Meaning · Scoring · Show when; Field and Meaning fold to one
 * line once complete. Pure: every change goes up through `onChange`.
 */
export function SettingsPane({
  field,
  allFields,
  onChange,
  seasonImagePath = null,
  editable = true,
  saved = true,
  published = false,
  forkNote = null,
  savedOptionValues,
  issues = [],
  scoringIssues = [],
  onRemove,
}: {
  field: PaneField | null;
  /** The form's live fields, for conditions, computed operands and section names. */
  allFields: readonly FormFieldDefinition[];
  onChange: (patch: PanePatch) => void;
  /** The season's game image, for the mirroring preview. */
  seasonImagePath?: string | null;
  /** False on an older published version: every control is held. */
  editable?: boolean;
  /** The server knows the field: its key is permanent. */
  saved?: boolean;
  /** The version is published: scoring says it changes in place. */
  published?: boolean;
  /** Where a structural change goes on a published version: "starts draft v4". */
  forkNote?: string | null;
  savedOptionValues?: readonly string[];
  /** The field's definition problems (`issuesFor`), placed under their groups. */
  issues?: readonly FormIssue[];
  scoringIssues?: readonly string[];
  onRemove?: () => void;
}) {
  if (!field) {
    return (
      <Card as="section" aria-label="Field settings" className={PANE}>
        <p className="px-4 py-6 text-[0.84375rem] text-muted">
          Select a field on the form to see its settings.
        </p>
      </Card>
    );
  }
  return (
    <FieldSettings
      // A new selection starts with its own folds and drafts.
      key={field.id}
      field={field}
      allFields={allFields}
      onChange={onChange}
      seasonImagePath={seasonImagePath}
      editable={editable}
      saved={saved}
      published={published}
      forkNote={forkNote}
      savedOptionValues={savedOptionValues}
      issues={issues}
      scoringIssues={scoringIssues}
      onRemove={onRemove}
    />
  );
}

function FieldSettings({
  field,
  allFields,
  onChange,
  seasonImagePath,
  editable,
  saved,
  published,
  forkNote,
  savedOptionValues,
  issues,
  scoringIssues,
  onRemove,
}: {
  field: PaneField;
  allFields: readonly FormFieldDefinition[];
  onChange: (patch: PanePatch) => void;
  seasonImagePath: string | null;
  editable: boolean;
  saved: boolean;
  published: boolean;
  forkNote: string | null;
  savedOptionValues?: readonly string[];
  issues: readonly FormIssue[];
  scoringIssues: readonly string[];
  onRemove?: () => void;
}) {
  const id = useId();
  const { name, icon: Icon } = typeInfo(field.type);
  const isSection = field.type === 'section';
  const labelBlank = field.label.trim() === '';
  // A blank label still names the pane: by its type.
  const title = labelBlank ? name : field.label;
  // A rule the new type cannot carry is dropped for every version when this is saved.
  const losesPoints = ruleLost(field.type, {
    points: field.points ?? 0,
    option_points: field.option_points ?? null,
  });
  // A saved, complete group starts folded; a new field shows everything, to be filled now.
  const [open, setOpen] = useState(() => ({
    field: !saved || labelBlank,
    meaning: !saved || missingMeaning(field) > 0,
  }));
  const sections = [...new Set(allFields.map((f) => f.section).filter((s): s is string => !!s))];

  // The points are not touched: a rule the new type can carry keeps scoring every version's
  // entries, and one it cannot is dropped by the save, as the Type hint says (fix round 1, I1).
  // `is_ordinal` is null, as a palette field starts and as the server stores an unset one.
  function changeType(type: FieldTypeName) {
    if (type === field.type) return;
    onChange({
      type,
      config: defaultConfig(type),
      default_value: null,
      unit: null,
      is_ordinal: null,
    });
  }
  const typeHint = [
    losesPoints ? 'Its points are removed for every version of this form.' : null,
    forkNote ? `Changing the type ${forkNote}.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const removeDetail = published
    ? `Retired in the next version: removing it ${forkNote ?? 'is structural'}. Its data stays.`
    : saved
      ? 'Retired from this draft. Data already collected under its key stays.'
      : 'It was never saved, so it simply goes.';

  return (
    <Card as="section" aria-label="Field settings" className={PANE}>
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
            {title}
          </h2>
        </div>
        {editable && onRemove && (
          <FieldMenu label={title} detail={removeDetail} onRemove={onRemove} />
        )}
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
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 pt-1 pb-3.5">
        <PaneGroup
          title="Field"
          aside={labelBlank ? null : <CompleteMark />}
          fold={
            labelBlank
              ? undefined
              : {
                  open: open.field,
                  onToggle: () => setOpen((o) => ({ ...o, field: !o.field })),
                  summary: fieldSummary(field),
                }
          }
          disabled={!editable}
        >
          <PaneRow label="Label" htmlFor={`${id}-label`}>
            <Input
              id={`${id}-label`}
              dir="auto"
              value={field.label}
              onChange={(e) => onChange({ label: e.target.value })}
            />
          </PaneRow>
          {!isSection && (
            <>
              <PaneRow label="Help text" htmlFor={`${id}-help`}>
                <Input
                  id={`${id}-help`}
                  dir="auto"
                  value={field.help_text ?? ''}
                  onChange={(e) =>
                    onChange({ help_text: e.target.value === '' ? null : e.target.value })
                  }
                />
              </PaneRow>
              <PaneRow
                label="Type"
                htmlFor={`${id}-type`}
                hint={typeHint || undefined}
                hintId={`${id}-type-hint`}
              >
                <Select
                  id={`${id}-type`}
                  aria-describedby={typeHint ? `${id}-type-hint` : undefined}
                  value={field.type}
                  onChange={(e) => changeType(e.target.value as FieldTypeName)}
                >
                  {DATA_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {typeName(t)}
                    </option>
                  ))}
                </Select>
              </PaneRow>
              <div className="grid grid-cols-2 items-end gap-2">
                <PaneRow label="Section" htmlFor={`${id}-section`}>
                  <Input
                    id={`${id}-section`}
                    dir="auto"
                    list={`${id}-sections`}
                    autoComplete="off"
                    value={field.section ?? ''}
                    onChange={(e) =>
                      onChange({ section: e.target.value === '' ? null : e.target.value })
                    }
                  />
                  <datalist id={`${id}-sections`}>
                    {sections.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </PaneRow>
                <Switch
                  lead
                  label={<b className="font-[650] text-ink">Required</b>}
                  checked={field.required}
                  onChange={(required) => onChange({ required })}
                />
              </div>
            </>
          )}
        </PaneGroup>
        {isSection ? (
          <div className="pt-3">
            <Note icon="info">
              A section is a heading on the scouter's form. It holds no data, so it has no meaning,
              scoring or condition.
            </Note>
          </div>
        ) : (
          <>
            <ConfigFields
              field={field}
              allFields={allFields}
              onChange={onChange}
              editable={editable}
              forkNote={forkNote}
              savedOptionValues={savedOptionValues}
              seasonImagePath={seasonImagePath}
              issues={issues}
            />
            <MetadataFields
              field={field}
              allFields={allFields}
              onChange={onChange}
              editable={editable}
              open={open.meaning}
              onToggle={() => setOpen((o) => ({ ...o, meaning: !o.meaning }))}
            />
            <ScoringFields
              field={field}
              onChange={onChange}
              editable={editable}
              published={published}
              issues={scoringIssues}
            />
            <ShowWhenFields
              field={field}
              allFields={allFields}
              onChange={onChange}
              editable={editable}
              issues={issues}
            />
          </>
        )}
      </div>
    </Card>
  );
}
