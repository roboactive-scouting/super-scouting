import {
  Clock,
  Download,
  Equal,
  FileText,
  Minus,
  Plus,
  ArrowRightLeft,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  countDataFields,
  formatDate,
  formatTime,
  formDefinition,
  type ExportSummary,
  type FieldTypeName,
  type FormDefinition,
  type FormKind,
  type GetFormExportOutput,
  type GetFormVersionOutput,
  type ImportFormOutput,
  type ListFormExportsOutput,
  type VersionSummary,
} from '@frc/shared';
import { Skeleton } from '@/components/Skeleton';
import { Button } from '@/components/ui/button';
import { DescribedChoice } from '@/components/ui/described-choice';
import { Dialog } from '@/components/ui/dialog';
import { ErrorLine, Note, Notice, SuccessBanner, WarningNotice } from '@/components/ui/notice';
import { StatTile } from '@/components/ui/stat-tile';
import type { Rpc } from '@/data/rpc';
import { cn } from '@/lib/utils';
import { typeName } from './fieldTypes';
import { formErrorLine } from './formErrors';
import { jsonProblem, problemLine } from './jsonPosition';
import { MEANING_PATHS } from './useBuilderState';

/*
 * Export and Import (design 12-form-builder, "The remaining screens"; SPEC-FINAL 5.1, v1.22;
 * task 1.31). An export is saved into Exports for 24 hours first; a `.json` download is only
 * ever a copy of a saved export. An import picks a saved export or reads a file on this
 * computer, checks it here and shows what it would change before anything is sent.
 */

/** The form an export or an import is about, as the forms list and the builder both hold it. */
export type FormRef = {
  id: string;
  name: string;
  kind: FormKind;
  versions: readonly VersionSummary[];
};

const kindWord = (kind: FormKind) => (kind === 'match' ? 'match' : 'super');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Match form 2026 · draft v4": the label the server gives the saved export. */
export function exportLabel(name: string, year: number | null, version: VersionSummary): string {
  const named = year !== null ? `${name} ${year}` : name;
  return `${named} · ${version.status === 'draft' ? 'draft ' : ''}v${version.version_no}`;
}

/** `form-match-2026-v4.json`. */
export function exportFileName(kind: FormKind, year: number | null, versionNo: number): string {
  return `form-${kind}${year !== null ? `-${year}` : ''}-v${versionNo}.json`;
}

/** Hands the browser a file to save. */
function saveFile(name: string, json: unknown) {
  const blob = new Blob([`${JSON.stringify(json, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** A small section label over a list (the design's `.fs-lab`). */
function Label({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="text-[0.8125rem] font-bold text-ink-2">
      {children}
    </p>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-1.5 list-disc space-y-1 ps-5 text-[0.84375rem] text-ink-2">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** A file line on `--bg`: an icon, what it is, and an action at its end. */
function FileLine({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-control border border-line bg-bg px-3.5 py-2.5 text-[0.84375rem] text-ink">
      <Icon aria-hidden="true" className="size-[18px] shrink-0 text-ink-2" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2">{children}</div>
    </div>
  );
}

const offlineLine = (what: string) => (
  <span className="self-center text-[0.8125rem] text-muted">
    You're offline: {what} waits for the connection.
  </span>
);

// ---------------------------------------------------------------------------------------------
// Export.
// ---------------------------------------------------------------------------------------------

/**
 * Export (design `-export.png`): pick the version — the draft or the active one, starting on
 * the draft — see what is in the file and what is not, then **Save export** (kept 24 hours).
 * Once it is saved, **Also download a copy** saves the same definition as a `.json` file.
 */
export function ExportDialog({
  form,
  year,
  rpc,
  online,
  unsaved = false,
  onClose,
}: {
  form: FormRef;
  year: number | null;
  rpc: Rpc;
  online: boolean;
  /** The builder holds changes not saved yet: the export is of the saved version, so say so. */
  unsaved?: boolean;
  onClose: () => void;
}) {
  const draft = form.versions.find((v) => v.status === 'draft');
  const active = form.versions.find((v) => v.is_active);
  const choices = [draft, active].filter((v): v is VersionSummary => v !== undefined);
  const [versionId, setVersionId] = useState<string | null>(choices[0]?.id ?? null);
  const [busy, setBusy] = useState<'save' | 'download' | null>(null);
  const [saved, setSaved] = useState<ExportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const describe = useId();
  const version = choices.find((v) => v.id === versionId) ?? null;

  async function save() {
    if (!version) return;
    setBusy('save');
    setError(null);
    try {
      const out = (await rpc.call('saveFormExport', {
        form_id: form.id,
        form_version_id: version.id,
      })) as ExportSummary;
      setSaved(out);
    } catch (e) {
      setError(formErrorLine(e));
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    if (!version) return;
    setBusy('download');
    setError(null);
    try {
      const definition = await rpc.call('exportForm', {
        form_id: form.id,
        form_version_id: version.id,
      });
      saveFile(exportFileName(form.kind, year, version.version_no), definition);
    } catch (e) {
      setError(formErrorLine(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog
      open
      title={`Export the ${kindWord(form.kind)} form`}
      onClose={onClose}
      width={640}
      describedBy={describe}
      dismissible={busy === null}
      footer={
        saved ? (
          <>
            <Button
              variant="ghost"
              className="me-auto"
              disabled={!online}
              busy={busy === 'download'}
              busyLabel="Downloading…"
              onClick={() => void download()}
            >
              <Download aria-hidden="true" />
              Also download a copy
            </Button>
            {!online && offlineLine('the download')}
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </>
        ) : (
          <>
            {!online && offlineLine('saving')}
            <Button disabled={busy !== null} onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!online || !version}
              busy={busy === 'save'}
              busyLabel="Saving…"
              onClick={() => void save()}
            >
              Save export
            </Button>
          </>
        )
      }
    >
      <p id={describe} className="-mt-2 text-[0.84375rem] text-muted">
        Saves the form in Exports for 24 hours, so it can be imported into another form — for
        example to start next season's form from it.
      </p>
      {choices.length === 0 ? (
        <Notice tone="warning" still>
          This form has no draft and no active version, so there is nothing to export.
        </Notice>
      ) : saved ? (
        <SuccessBanner title={`Saved to Exports as “${saved.label}”`}>
          It is deleted 24 hours after it was saved, at {formatTime(saved.expires_at)} on{' '}
          {formatDate(saved.expires_at).slice(0, 5)}. Import it from another form's More menu, or
          from the Forms page.
        </SuccessBanner>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Label>Which version</Label>
            <DescribedChoice
              label="Which version"
              value={versionId ?? ''}
              onChange={setVersionId}
              options={choices.map((v) => ({
                key: v.id,
                label:
                  v.status === 'draft' ? `Draft v${v.version_no}` : `v${v.version_no} · active`,
                description:
                  v.status === 'draft'
                    ? `${plural(v.field_count, 'field')} · not published yet`
                    : `${plural(v.field_count, 'field')} · what scouts use now`,
              }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>In the file</Label>
              <Bullets
                items={[
                  'every field, its options and its meaning',
                  'the scoring of each field',
                  'the match timer',
                ]}
              />
            </div>
            <div>
              <Label>Not in the file</Label>
              <Bullets
                items={['entries (the scouted data)', 'other versions', 'users and events']}
              />
            </div>
          </div>
          {version && (
            <FileLine icon={Clock}>
              <span>
                Saved to <b>Exports</b> as{' '}
                <code className="font-num text-[0.8125rem]">
                  {exportLabel(form.name, year, version)}
                </code>{' '}
                · <b>deleted after 24 hours</b>. A download is offered once it is saved.
              </span>
            </FileLine>
          )}
          {unsaved && (
            <WarningNotice lead="Unsaved changes are not in the export.">
              Save first to include them.
            </WarningNotice>
          )}
        </>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Import.
// ---------------------------------------------------------------------------------------------

type Keyed = { key: string; label: string; type: FieldTypeName };

export type ImportDiff = {
  added: Keyed[];
  typeChanged: (Keyed & { from: FieldTypeName })[];
  removed: Keyed[];
  /** Same key, same type. */
  unchanged: Keyed[];
};

/** What an import does to a form's live fields, by key (design `-import.png`). */
export function importDiff(base: readonly Keyed[], incoming: readonly Keyed[]): ImportDiff {
  const was = new Map(base.map((f) => [f.key, f]));
  const now = new Set(incoming.map((f) => f.key));
  const diff: ImportDiff = { added: [], typeChanged: [], removed: [], unchanged: [] };
  for (const f of incoming) {
    const before = was.get(f.key);
    if (!before) diff.added.push(f);
    else if (before.type !== f.type) diff.typeChanged.push({ ...f, from: before.type });
    else diff.unchanged.push(f);
  }
  for (const f of base) if (!now.has(f.key)) diff.removed.push(f);
  return diff;
}

/** "2 hours ago", "yesterday 21:10": an export is at most a day old. */
export function savedWhen(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${plural(minutes, 'minute')} ago`;
  if (at.toDateString() === now.toDateString()) {
    return `${plural(Math.floor(minutes / 60), 'hour')} ago`;
  }
  return `yesterday ${formatTime(iso)}`;
}

/** "deleted in 22 h", "deleted in 40 min". */
export function deletedIn(seconds: number): string {
  if (seconds < 3600) return `deleted in ${Math.max(1, Math.ceil(seconds / 60))} min`;
  return `deleted in ${Math.floor(seconds / 3600)} h`;
}

/** m:ss of a timer's whole length, or null with no timer. */
function timerLength(definition: FormDefinition): string | null {
  const total = definition.timer_config.phases.reduce((sum, p) => sum + p.seconds, 0);
  if (total === 0) return null;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * A file read on this computer, checked here as `importForm` will check it: over HTTP a file
 * that is not a definition is a bare 400, so every problem is positioned before anything is
 * sent. `problems` empty means `definition` is set.
 */
export function readDefinition(text: string): {
  definition: FormDefinition | null;
  problems: string[];
} {
  const problem = jsonProblem(text);
  if (problem) return { definition: null, problems: [problemLine(problem)] };
  const raw = JSON.parse(text) as { fields?: unknown };
  const parsed = formDefinition.safeParse(raw);
  if (parsed.success) return { definition: parsed.data, problems: [] };
  const fields = Array.isArray(raw?.fields) ? (raw.fields as { key?: unknown }[]) : [];
  const problems = parsed.error.issues.map((issue) => {
    const [head, index, ...rest] = issue.path;
    if (head === 'fields' && typeof index === 'number') {
      const key = fields[index]?.key;
      const who = typeof key === 'string' ? `“${key}” (field ${index + 1})` : `Field ${index + 1}`;
      return `${who} · ${rest.join('.') || 'the field'}: ${issue.message}`;
    }
    return `${issue.path.join('.') || 'The file'}: ${issue.message}`;
  });
  return { definition: null, problems };
}

/** A picked file's text, read here: it never leaves this computer unless it is imported. */
function textOf(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('the file could not be read'));
    reader.readAsText(file);
  });
}

type Source = { from: 'export'; summary: ExportSummary } | { from: 'file'; name: string };

/** The form an import goes into: an existing form (its draft is replaced), or none yet. */
export type ImportTarget = {
  kind: FormKind;
  seasonId: string;
  year: number | null;
  form: FormRef | null;
};

const DIFF_MARK: Record<'add' | 'chg' | 'del' | 'same', { icon: LucideIcon; tone: string }> = {
  add: { icon: Plus, tone: 'bg-accent-tint text-accent-ink' },
  chg: { icon: ArrowRightLeft, tone: 'bg-warn-tint text-warn' },
  del: { icon: Minus, tone: 'bg-line-2 text-ink' },
  same: { icon: Equal, tone: 'bg-line-2 text-ink-2' },
};

function DiffRow({
  mark,
  label,
  fieldKey,
  right,
}: {
  mark: keyof typeof DIFF_MARK;
  label: string;
  fieldKey?: string;
  right: ReactNode;
}) {
  const { icon: Icon, tone } = DIFF_MARK[mark];
  return (
    <li className="flex min-h-11 items-center gap-2.5 border-t border-line-2 px-3.5 py-2 first:border-t-0">
      <span
        aria-hidden="true"
        className={cn('grid size-6 shrink-0 place-items-center rounded-md', tone)}
      >
        <Icon className="size-3.5" strokeWidth={2.5} />
      </span>
      <b className="text-[0.875rem] font-[650]" dir="auto">
        {label}
      </b>
      {fieldKey && <code className="font-num text-[0.8125rem] text-ink-2">{fieldKey}</code>}
      <span className="ms-auto text-[0.8125rem] text-muted">{right}</span>
    </li>
  );
}

/**
 * Import (design `-import.png` into an existing form, `-import-new-season.png` into an empty
 * one): the saved exports, or a file from this computer, then what it would change. Into an
 * existing form it replaces the draft (forking one when there is none) with the file's fields;
 * the file's timer and scoring are not used. Into an empty form it creates the form as draft v1.
 */
export function ImportDialog({
  target,
  rpc,
  online,
  onClose,
  onImported,
}: {
  target: ImportTarget;
  rpc: Rpc;
  online: boolean;
  onClose: () => void;
  /** The import went through: `draftNo` is the draft it wrote. */
  onImported: (out: ImportFormOutput, draftNo: number) => void;
}) {
  const { form } = target;
  const draft = form?.versions.find((v) => v.status === 'draft');
  const newest = form ? Math.max(0, ...form.versions.map((v) => v.version_no)) : 0;
  const draftNo = form ? (draft?.version_no ?? newest + 1) : 1;
  /** The version whose fields the import replaces, for the diff: the draft, else the newest. */
  const baseSummary = draft ?? form?.versions.find((v) => v.version_no === newest);

  const [exports, setExports] = useState<ExportSummary[] | 'loading' | { failed: string }>(
    'loading',
  );
  const [source, setSource] = useState<Source | null>(null);
  const [choosing, setChoosing] = useState(true);
  const [definition, setDefinition] = useState<FormDefinition | 'loading' | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [base, setBase] = useState<Keyed[] | 'loading' | { failed: string }>(
    baseSummary ? 'loading' : [],
  );
  const [showSame, setShowSame] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const describe = useId();
  const reads = useRef(0);

  async function pickExport(summary: ExportSummary) {
    setSource({ from: 'export', summary });
    setProblems([]);
    setError(null);
    // A newer pick wins over a read still in flight.
    const read = ++reads.current;
    if (summary.kind !== target.kind) {
      setDefinition(null);
      return;
    }
    setChoosing(false);
    setDefinition('loading');
    try {
      const out = (await rpc.call('getFormExport', {
        export_id: summary.id,
      })) as GetFormExportOutput;
      if (read === reads.current) setDefinition(out.definition);
    } catch (e) {
      if (read !== reads.current) return;
      setDefinition(null);
      setError(formErrorLine(e));
    }
  }

  useEffect(() => {
    let live = true;
    (rpc.call('listFormExports', {}) as Promise<ListFormExportsOutput>).then(
      (out) => {
        if (!live) return;
        setExports(out.exports);
        // The newest export of this kind is the likely one.
        const first = out.exports.find((x) => x.kind === target.kind);
        if (first) void pickExport(first);
      },
      (e: unknown) => {
        if (live) setExports({ failed: formErrorLine(e) });
      },
    );
    if (baseSummary) {
      (
        rpc.call('getFormVersion', {
          form_version_id: baseSummary.id,
        }) as Promise<GetFormVersionOutput>
      ).then(
        (out) => {
          if (live) setBase(out.fields.filter((f) => !f.deprecated));
        },
        (e: unknown) => {
          if (live) setBase({ failed: formErrorLine(e) });
        },
      );
    }
    return () => {
      live = false;
    };
    // Read once, when the dialog opens.
  }, []);

  async function readFile(picked: File | undefined) {
    if (!picked) return;
    setSource({ from: 'file', name: picked.name });
    setError(null);
    setChoosing(false);
    // Nothing from the previous pick is shown against this file.
    setDefinition(null);
    setProblems([]);
    const read = ++reads.current;
    let text: string;
    try {
      text = await textOf(picked);
    } catch {
      if (read !== reads.current) return;
      setError(
        `“${picked.name}” could not be read on this computer. Pick it again, or another file.`,
      );
      return;
    }
    if (read !== reads.current) return;
    const checked = readDefinition(text);
    if (checked.definition && checked.definition.kind !== target.kind) {
      setDefinition(null);
      setProblems([
        `This file is a ${kindWord(checked.definition.kind)} form. It imports only into the ${kindWord(checked.definition.kind)} form.`,
      ]);
      return;
    }
    setDefinition(checked.definition);
    setProblems(checked.problems);
  }

  async function importIt() {
    if (!definition || definition === 'loading') return;
    setBusy(true);
    setError(null);
    try {
      const out = (await rpc.call('importForm', {
        season_id: target.seasonId,
        definition,
        ...(form ? { form_id: form.id } : {}),
      })) as ImportFormOutput;
      onImported(out, out.created ? 1 : draftNo);
    } catch (e) {
      const labels = new Map(definition.fields.map((f) => [f.key, f.label]));
      setError(formErrorLine(e, { labelOf: (key) => labels.get(key) }));
      setBusy(false);
    }
  }

  const ready = definition !== null && definition !== 'loading' ? definition : null;
  const wrongKind =
    source?.from === 'export' && source.summary.kind !== target.kind ? source.summary.kind : null;
  // Like with like: both sides keep their sections (a section is a field with a key), so a
  // section added or removed is reported, and a form's own export reads as all unchanged.
  const diff = ready && Array.isArray(base) ? importDiff(base, ready.fields) : null;
  const yearWord = target.year !== null ? `${target.year} ` : '';
  const title = form ? 'Import a form' : `Import the ${yearWord}${kindWord(target.kind)} form`;
  const canImport =
    online && !busy && ready !== null && (form === null || Array.isArray(base)) && !wrongKind;

  const sourceLine =
    source &&
    (source.from === 'export' ? (
      <>
        <b dir="auto">{source.summary.label}</b>
        <span className="text-muted">
          · from Exports · {plural(source.summary.field_count, 'field')}
        </span>
      </>
    ) : (
      <>
        <b dir="auto">{source.name}</b>
        <span className="text-muted">
          · from your computer
          {ready ? ` · ${plural(countDataFields(ready.fields), 'field')}` : ''}
        </span>
      </>
    ));

  return (
    <Dialog
      open
      title={title}
      onClose={onClose}
      width={form ? 720 : 700}
      describedBy={describe}
      dismissible={!busy}
      footer={
        <>
          {!online && offlineLine('importing')}
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!canImport}
            busy={busy}
            busyLabel="Importing…"
            onClick={() => void importIt()}
          >
            Import as draft v{draftNo}
          </Button>
        </>
      }
    >
      <p id={describe} className="-mt-2 text-[0.84375rem] text-muted">
        {form
          ? 'Check what the file would change before anything is applied.'
          : 'Check what the file would create before anything is applied.'}
      </p>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-label="A form file from your computer"
        onChange={(e) => {
          void readFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {form && source && !choosing ? (
        <FileLine icon={FileText}>
          {sourceLine}
          <Button
            variant="ghost"
            size="sm"
            className="ms-auto text-accent-ink"
            onClick={() => setChoosing(true)}
          >
            {source.from === 'export' ? 'Choose another export' : 'Choose another'}
          </Button>
        </FileLine>
      ) : (
        <>
          <Label>Saved exports · each is deleted 24 hours after it was saved</Label>
          {exports === 'loading' ? (
            <Skeleton rows={2} rowHeight="3.5rem" label="Reading the saved exports" />
          ) : 'failed' in exports ? (
            <ErrorLine>{exports.failed}</ErrorLine>
          ) : exports.length === 0 ? (
            <p className="rounded-control border border-dashed border-control-border bg-bg px-3.5 py-3 text-[0.84375rem] text-muted">
              No saved exports. An export is kept 24 hours: export a form from its card or its
              builder first, or pick a file below.
            </p>
          ) : (
            <DescribedChoice
              label="Saved exports"
              stacked
              value={source?.from === 'export' ? source.summary.id : ''}
              onChange={(id) => {
                const picked = exports.find((x) => x.id === id);
                if (picked) void pickExport(picked);
              }}
              options={exports.map((x) => ({
                key: x.id,
                label: x.label,
                description: `${plural(x.field_count, 'field')} · saved by ${x.created_by.full_name}, ${savedWhen(x.created_at)}`,
                aside: deletedIn(x.expires_in_seconds),
              }))}
            />
          )}
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="-ms-2 text-accent-ink"
              onClick={() => file.current?.click()}
            >
              <Upload aria-hidden="true" />
              Or a file from your computer
            </Button>
          </div>
          {!form && source?.from === 'file' && <FileLine icon={FileText}>{sourceLine}</FileLine>}
        </>
      )}

      {wrongKind && (
        <Notice tone="danger" role="alert" still>
          That export is a {kindWord(wrongKind)} form. It imports only into the{' '}
          {kindWord(wrongKind)} form.
        </Notice>
      )}
      {problems.length > 0 && (
        <Notice tone="danger" role="alert" still>
          <b className="font-bold">This file is not a form export that can be imported.</b> Nothing
          was sent.
          <ul className="mt-1.5 list-disc space-y-0.5 ps-5 font-num text-[0.78125rem]">
            {problems.slice(0, 6).map((p) => (
              <li key={p}>{p}</li>
            ))}
            {problems.length > 6 && <li>and {problems.length - 6} more</li>}
          </ul>
        </Notice>
      )}
      {definition === 'loading' && (
        <Skeleton rows={1} rowHeight="4.5rem" label="Reading the export" />
      )}
      {form && typeof base === 'object' && !Array.isArray(base) && (
        <ErrorLine>{base.failed}</ErrorLine>
      )}

      {ready && form && diff && (
        <>
          <div className="grid grid-cols-4 gap-2.5">
            <StatTile label="Adds" value={diff.added.length} />
            <StatTile label="Changes type" value={diff.typeChanged.length} />
            <StatTile label="Removes" value={diff.removed.length} />
            <StatTile label="Unchanged" value={diff.unchanged.length} />
          </div>
          <ul
            aria-label="What the import changes"
            className="rounded-control border border-line bg-surface"
          >
            {diff.added.map((f) => (
              <DiffRow
                key={f.key}
                mark="add"
                label={f.label}
                fieldKey={f.key}
                right={`${typeName(f.type)} · new`}
              />
            ))}
            {diff.typeChanged.map((f) => (
              <DiffRow
                key={f.key}
                mark="chg"
                label={f.label}
                fieldKey={f.key}
                right={
                  <>
                    {typeName(f.from)} → <b className="font-[650] text-ink">{typeName(f.type)}</b>
                  </>
                }
              />
            ))}
            {diff.removed.map((f) => (
              <DiffRow
                key={f.key}
                mark="del"
                label={f.label}
                fieldKey={f.key}
                right={`${typeName(f.type)} · removed`}
              />
            ))}
            {diff.unchanged.length > 0 &&
              (showSame ? (
                diff.unchanged.map((f) => (
                  <DiffRow
                    key={f.key}
                    mark="same"
                    label={f.label}
                    fieldKey={f.key}
                    right={typeName(f.type)}
                  />
                ))
              ) : (
                <li className="flex min-h-11 items-center gap-2.5 border-t border-line-2 px-3.5 py-1 first:border-t-0">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-md',
                      DIFF_MARK.same.tone,
                    )}
                  >
                    <Equal className="size-3.5" strokeWidth={2.5} />
                  </span>
                  <b className="text-[0.875rem] font-[650]">
                    {plural(diff.unchanged.length, 'field')} unchanged
                  </b>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ms-auto"
                    onClick={() => setShowSame(true)}
                  >
                    Show
                  </Button>
                </li>
              ))}
          </ul>
          <Note icon="info">
            <b className="text-ink">An import is a structural change.</b>{' '}
            {draft
              ? `It replaces draft v${draftNo} with the file's fields`
              : `It starts draft v${draftNo} from the file's fields`}
            ; publish it to make it active. Published versions and their entries are untouched. The
            file's match timer and scoring are not imported: this form keeps its own.
          </Note>
        </>
      )}

      {ready && !form && (
        <>
          <div className="grid grid-cols-4 gap-2.5">
            <StatTile label="Fields" value={countDataFields(ready.fields)} />
            <StatTile
              label="With meaning"
              value={
                ready.fields.filter(
                  (f) =>
                    f.type !== 'section' &&
                    [...MEANING_PATHS].every((c) => {
                      const v = f[c as 'description' | 'unit' | 'phase' | 'direction'];
                      return v !== null && v !== '';
                    }),
                ).length
              }
            />
            <StatTile
              label="Scored"
              value={
                ready.scoring_rules.filter(
                  (r) => r.points > 0 || Object.values(r.option_points ?? {}).some((p) => p > 0),
                ).length
              }
            />
            <StatTile label="Match timer" value={timerLength(ready) ?? 'None'} />
          </div>
          <Note icon="info">
            <b className="text-ink">
              This creates the {yearWord}
              {kindWord(target.kind)} form as draft v1
            </b>{' '}
            with the file's fields, scoring and match timer. Edit it for the new game, then publish
            it to start scouting. No entries come with it.
          </Note>
        </>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
    </Dialog>
  );
}
