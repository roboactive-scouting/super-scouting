import { Ban, Check, Copy, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  formatCount,
  formatTime,
  type DeleteBlockedReason,
  type DeleteImpactStation,
  type DeleteKind,
  type GetDeleteImpactOutput,
} from '@frc/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ErrorLine } from '@/components/ui/notice';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { SurfaceActions } from '@/components/ui/surface-actions';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';

/**
 * The two lines of `docs/ops/SETUP.md` › Backup, exactly: the schema, then the rows. Never the
 * bare `supabase db dump`, which saves no rows (SPEC-FINAL 3.9; DEVIATIONS, task 0.7). A test
 * reads SETUP.md and fails when either line moves there without moving here.
 */
export const BACKUP_LINES = [
  'pnpm --filter @frc/db exec supabase db dump -f ~/frc-backups/prod-schema-$(date +%Y-%m-%d).backup.sql',
  'pnpm --filter @frc/db exec supabase db dump --data-only --use-copy -f ~/frc-backups/prod-data-$(date +%Y-%m-%d).backup.sql',
] as const;

/** The footer note of every hard delete (28-delete final). */
export const HARD_DELETE_NOTE = 'Admins only · Online, so the delete runs on the server at once.';

/** The counts the dialog reads: `getDeleteImpact`'s, any of them (0 where absent). */
export type DeleteCounts = Partial<
  Pick<
    GetDeleteImpactOutput,
    | 'events'
    | 'event_names'
    | 'matches'
    | 'entries'
    | 'match_entries'
    | 'super_entries'
    | 'forms'
    | 'form_versions'
    | 'metrics'
    | 'dashboards'
    | 'weight_presets'
    | 'stations'
    | 'last_saved_at'
  >
>;

/** The record of an "Are you sure?", as a card (28-delete final, phone 1). */
export type DeleteSubject = {
  /** "Q12 · 2096": match and team, in mono. */
  title: string;
  /** The station tag. */
  tag?: ReactNode;
  /** "RoboActive · Yael Shapira". */
  meta?: string;
  /** "11:02". */
  time?: string | null;
  /** The scouted points; nothing for a super entry or a robot not counted. */
  points?: string | null;
};

/** One row of the bill's right column: a number, its noun, a line under it. */
export type DeleteFact = { num: string; label: string; note?: string };

/** A way forward on the Blocked face: a card with one button (THEME "Blocked tag and ways forward"). */
export type BlockedWay = { title: string; body: string; label: string; onSelect: () => void };

export type DeleteDialogProps = {
  kind: DeleteKind;
  /** The object as the server names it: "2025", the event's or form's name, "v1", "Q41". */
  name: string;
  /** What must be typed back exactly; the name unless given (`getDeleteImpact.confirm_name`). */
  confirmName?: string | null;
  impact: DeleteCounts;
  /** The one-line reason no text overrides it: the Blocked face. */
  blocked?: string | null;
  blockedReason?: DeleteBlockedReason | null;
  /** Ways forward after "Keep …" (a version's "Delete the whole form…"). */
  ways?: BlockedWay[];
  /** Who owns it: the form a version belongs to ("Match form 2026"), the event of a match. */
  context?: string;
  /** The record on an "Are you sure?" card. */
  subject?: DeleteSubject;
  /** The bill's right column, in place of the counts (a blocked version's dates). */
  facts?: DeleteFact[];
  /** The delete waits although nothing is in flight (offline): this line says why. */
  held?: string | null;
  /** The footer note of a bill; the hard delete's unless given. */
  note?: string;
  busy?: boolean;
  /** The server's refusal, said in the dialog. */
  error?: string | null;
  /** A match with entries: "Correct the match number". */
  onCorrectMatch?: () => void;
  /** With exactly what was typed (the server checks it too); nothing for "Are you sure?". */
  onConfirm: (typed?: string) => void;
  onCancel: () => void;
};

const n = (v: number | undefined) => v ?? 0;
const noun = (count: number, one: string, many: string) => (count === 1 ? one : many);
const counted = (count: number, one: string, many: string) =>
  `${formatCount(count)} ${noun(count, one, many)}`;
/** "v2" → "version 2"; anything else as it is. */
const versionWords = (name: string) => (/^v\d+$/.test(name) ? `version ${name.slice(1)}` : name);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The object in words: "Season 2025", "version 1 of Match form 2026", "Q41". */
function objectWords(kind: DeleteKind, name: string, context?: string): string {
  switch (kind) {
    case 'season':
      return `Season ${name}`;
    case 'form_version':
      return context ? `${versionWords(name)} of ${context}` : versionWords(name);
    default:
      return name;
  }
}

/** The destructive verb and its object, never "OK" (SPEC-FINAL 17.8). */
export function deleteLabel(kind: DeleteKind, name: string): string {
  switch (kind) {
    case 'season':
      return `Delete season ${name}`;
    case 'event':
      return `Delete event ${name}`;
    case 'form':
      return `Delete form ${name}`;
    case 'form_version':
      return `Delete ${versionWords(name)}`;
    case 'entry':
      return 'Delete entry';
    case 'match':
      return `Delete ${name}`;
  }
}

/** What the type step asks for (28-delete final: "Type the season's name"; "Type Q41"). */
function typeHeading(kind: DeleteKind, name: string): string {
  const of: Partial<Record<DeleteKind, string>> = {
    season: "Type the season's name",
    event: "Type the event's name",
    form: "Type the form's name",
    form_version: "Type the version's name",
  };
  return of[kind] ?? `Type ${name}`;
}

/** "Red 1–3 and Blue 1–3": the stations that hold entries. */
export function stationsLine(stations: DeleteImpactStation[]): string {
  const side = (alliance: 'red' | 'blue', word: string) => {
    const held = stations.filter((s) => s.alliance === alliance && s.entries > 0);
    if (held.length === 0) return null;
    const nums = held.map((s) => s.station);
    const run = nums.length > 1 && nums.every((v, i) => i === 0 || v === nums[i - 1]! + 1);
    return `${word} ${run ? `${nums[0]}–${nums[nums.length - 1]}` : nums.join(', ')}`;
  };
  return [side('red', 'Red'), side('blue', 'Blue')].filter(Boolean).join(' and ');
}

/**
 * The one destructive pattern for every delete (SPEC-FINAL 3.9, 17.8; design
 * `docs/design/pages/28-delete/final/`, variant A; task 1.61). The kind decides the face:
 *
 * - **Bill + type** — a season, an event, a form, a form version and a match with its entries:
 *   the `--ink` band with the damage as the biggest count and every count itemised, then the
 *   title as a question, 1 · Back up first (the two SETUP.md lines, Copy both), 2 · Type the
 *   name (exact, case included; "No match yet" until it matches), and the footer note with
 *   Cancel (first focus) and the filled-ink delete, disabled until the name matches.
 * - **Are you sure?** — one entry, or a match with no entries: a small centred pop-up at every
 *   width, the record as a card, one line, Cancel (first focus) and the delete. Nothing typed.
 * - **Blocked** — `blocked` set: the band with the white Blocked tag, the reason as the title,
 *   the line, and the ways forward as cards. No delete button and nothing to type; no text
 *   overrides it.
 * - A match with entries opens the **Choice** first (the six station tiles; Correct the match
 *   number · Delete Q41 and its N entries… · Close, first focus), and the second opens its bill.
 *
 * A centred dialog on a computer (940 px; 860 blocked or choosing), a bottom sheet on a phone;
 * Are you sure? is centred on both. It only draws and asks: the caller (`DeleteFlow`) counts,
 * deletes and reports the server's refusal through `error`.
 */
export function DeleteDialog(props: DeleteDialogProps) {
  const { kind, impact, blocked } = props;
  const entries = n(impact.entries);
  const plain = kind === 'entry' || (kind === 'match' && entries === 0);
  const [choosing, setChoosing] = useState(kind === 'match' && entries > 0);
  if (blocked) return <BlockedFace {...props} blocked={blocked} />;
  if (plain) return <SureFace {...props} />;
  if (choosing) return <ChoiceFace {...props} onDeleteAll={() => setChoosing(false)} />;
  return <BillFace {...props} />;
}

/* ---------------------------------------------------------------- the band ---------------- */

/** The kicker line: 13 px / 650 uppercase `--rail-ink`, with an aside at the right. */
function Kicker({
  lead,
  children,
  aside,
}: {
  lead?: ReactNode;
  children: ReactNode;
  aside?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {lead}
      <p
        className="text-[0.8125rem] font-[650] tracking-[0.06em] text-rail-ink uppercase"
        dir="auto"
      >
        {children}
      </p>
      {aside && <p className="ms-auto text-[0.78125rem] font-medium text-rail-muted">{aside}</p>}
    </div>
  );
}

/** The biggest count, mono 64 px (52 on a phone), its noun beside it, one sentence under. */
function BigCount({ num, label, sub }: { num: string; label: string; sub?: ReactNode }) {
  return (
    <div>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-3.5">
        <span className="num text-[3.25rem] leading-none font-semibold tracking-[-0.04em] lg:text-[4rem]">
          {num}
        </span>{' '}
        <span className="text-lg font-[650] lg:text-[1.375rem]" dir="auto">
          {label}
        </span>
      </p>
      {sub && (
        <p className="mt-2 text-sm leading-[1.45] text-rail-ink lg:text-[0.9375rem] [&_b]:text-surface">
          {sub}
        </p>
      )}
    </div>
  );
}

/** The counts as rows split by `--rail-line`, two columns when they are many. */
function Facts({ facts }: { facts: DeleteFact[] }) {
  const two = facts.length > 3;
  return (
    <ul
      className={cn(
        'border-rail-line max-lg:mt-4 max-lg:border-t max-lg:pt-1 lg:border-s lg:ps-7',
        two && 'grid grid-cols-2 gap-x-5',
      )}
    >
      {facts.map((f, i) => (
        <li
          key={`${f.label}-${i}`}
          className={cn(
            'grid grid-cols-[3rem_1fr] items-baseline gap-x-3 gap-y-1 border-b border-rail-line py-1.5 last:border-b-0',
            two && i === facts.length - 2 && facts.length % 2 === 0 && 'border-b-0',
          )}
        >
          <span className="num text-end text-[1.0625rem] font-semibold">{f.num}</span>{' '}
          <b className="text-[0.90625rem] font-[650]" dir="auto">
            {f.label}
          </b>
          {f.note && (
            <small className="col-start-2 text-[0.78125rem] leading-[1.4] text-rail-ink" dir="auto">
              {f.note}
            </small>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The big count beside its facts (one column on a phone). */
function BandBody({ big, facts }: { big: ReactNode; facts: DeleteFact[] }) {
  if (facts.length === 0) return big;
  return (
    <div
      className={cn(
        'lg:grid lg:gap-7',
        facts.length > 3 ? 'lg:grid-cols-[1fr_470px]' : 'lg:grid-cols-[1fr_280px]',
      )}
    >
      {big}
      <Facts facts={facts} />
    </div>
  );
}

/** The bill's counts for each kind; a count that is 0 and not the point is left out. */
function countFacts(kind: DeleteKind, impact: DeleteCounts): DeleteFact[] {
  const out: DeleteFact[] = [];
  const entries = n(impact.entries);
  const split =
    n(impact.super_entries) > 0
      ? `${formatCount(n(impact.match_entries))} match · ${formatCount(n(impact.super_entries))} super`
      : undefined;
  const entryFact = {
    num: formatCount(entries),
    label: noun(entries, 'entry', 'entries'),
    note: split,
  };
  if (kind === 'season') {
    const events = n(impact.events);
    out.push({
      num: formatCount(events),
      label: noun(events, 'event', 'events'),
      note: impact.event_names?.length ? impact.event_names.join(' · ') : undefined,
    });
    out.push({
      num: formatCount(n(impact.matches)),
      label: noun(n(impact.matches), 'match', 'matches'),
    });
    out.push(entryFact);
    const forms = n(impact.forms);
    const versions = n(impact.form_versions);
    out.push({
      num: formatCount(forms),
      label: noun(forms, 'form', 'forms'),
      note: versions > 0 ? `${counted(versions, 'version', 'versions')} in all` : undefined,
    });
  } else if (kind === 'event') {
    out.push({
      num: formatCount(n(impact.matches)),
      label: noun(n(impact.matches), 'match', 'matches'),
    });
    out.push(entryFact);
  } else if (kind === 'form') {
    const versions = n(impact.form_versions);
    out.push({ num: formatCount(versions), label: noun(versions, 'version', 'versions') });
    out.push(entryFact);
  }
  if (kind === 'season' || kind === 'form') {
    const optional: Array<[number, string, string]> = [
      [n(impact.dashboards), 'dashboard', 'dashboards'],
      [n(impact.weight_presets), 'weight preset', 'weight presets'],
      [n(impact.metrics), 'metric', 'metrics'],
    ];
    for (const [count, one, many] of optional) {
      if (count > 0) out.push({ num: formatCount(count), label: noun(count, one, many) });
    }
  }
  return out;
}

/* ---------------------------------------------------------------- Bill + type ------------- */

function BillFace({
  kind,
  name,
  confirmName,
  impact,
  context,
  held,
  note = HARD_DELETE_NOTE,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: DeleteDialogProps) {
  const desktop = useIsDesktop();
  const id = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState('');
  const target = confirmName ?? name;
  const matches = typed === target;
  const entries = n(impact.entries);
  const object = objectWords(kind, name, context);
  const match = kind === 'match';
  // The kind changed under it (a match's Choice became its bill): first focus is Cancel again.
  useFirstFocus(cancel);

  // The phone final keeps the kicker bare and says "Counted…" at the end of the sentence.
  const big = bigOfBill(kind, name, impact, context, !desktop);
  const facts = match || kind === 'form_version' ? [] : countFacts(kind, impact);
  const band = (
    <>
      <Kicker
        lead={
          desktop && (
            <TriangleAlert aria-hidden="true" className="size-[18px] shrink-0 text-rail-ink" />
          )
        }
        aside={desktop ? 'Counted on the server just now' : undefined}
      >
        {match
          ? `Delete ${name} and its entries · cannot be undone`
          : `Delete ${object} · hard delete · cannot be undone`}
      </Kicker>
      <BandBody big={big} facts={facts} />
    </>
  );

  return (
    <ResponsiveDialog
      open
      title={
        match
          ? `Delete ${name} and its ${counted(entries, 'entry', 'entries')}?`
          : `Delete ${object}?`
      }
      onClose={onCancel}
      dismissible={!busy}
      showClose={false}
      initialFocus={cancel}
      describedBy={`${id}-line`}
      width={940}
      band={band}
    >
      <p
        id={`${id}-line`}
        className={cn('-mt-1.5 text-[0.90625rem] leading-normal text-ink-2', !desktop && 'sr-only')}
      >
        The rows are removed from the database for good. Only a backup you take now can bring them
        back.
      </p>
      <div className="flex flex-col gap-2.5">
        <Step num={1} title="Back up first">
          {desktop && (
            <p className="mt-1 text-[0.8125rem] leading-[1.45] text-muted">
              Run both lines in a terminal on your computer, in the scouting repo. The app can't run
              them for you.
            </p>
          )}
          <BackupBox desktop={desktop} />
        </Step>
        <Step
          num={2}
          title={
            match ? (
              <>
                Type <span className="num ms-1">{target}</span>
              </>
            ) : (
              typeHeading(kind, name)
            )
          }
        >
          <div className="mt-2 lg:grid lg:grid-cols-[300px_1fr] lg:items-center lg:gap-[18px]">
            <TypeField id={id} value={typed} matches={matches} onChange={setTyped} />
            <p
              id={`${id}-hint`}
              className={cn('text-[0.78125rem] text-muted', !desktop && 'sr-only')}
            >
              Type{' '}
              <b dir="auto" className="font-num font-semibold whitespace-pre-wrap text-ink">
                {target}
              </b>{' '}
              exactly, including case. The delete button stays off until it matches.
            </p>
          </div>
        </Step>
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
      <div className="mt-1 flex flex-col gap-3 border-t border-line-2 pt-3.5 lg:flex-row lg:items-center">
        {/* The phone final keeps only the buttons; the note is still read out there. */}
        <p className={cn('text-[0.8125rem] text-muted lg:flex-1', !desktop && !held && 'sr-only')}>
          {held ?? note}
        </p>
        <SurfaceActions>
          <Button
            ref={cancel}
            variant="secondary"
            aria-disabled={busy || undefined}
            onClick={busy ? undefined : onCancel}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!matches || !!held}
            busy={busy}
            busyLabel="Deleting…"
            onClick={() => onConfirm(typed)}
          >
            <span dir="auto">{deleteLabel(kind, name)}</span>
          </Button>
        </SurfaceActions>
      </div>
    </ResponsiveDialog>
  );
}

/** The bill's biggest count: the entries that go, else the next thing that goes. */
function bigOfBill(
  kind: DeleteKind,
  name: string,
  impact: DeleteCounts,
  context: string | undefined,
  countedLast: boolean,
) {
  const countedNote = countedLast ? ' Counted on the server just now.' : '';
  const entries = n(impact.entries);
  const matches = n(impact.matches);
  const events = n(impact.events);
  const versions = n(impact.form_versions);
  if (kind === 'match') {
    const where = [stationsLine(impact.stations ?? []), context].filter(Boolean).join(', ');
    return (
      <BigCount
        num={formatCount(entries)}
        label={`${noun(entries, 'entry goes', 'entries go')}, with ${name}`}
        sub={`${where ? `${where}.` : ''}${countedNote}`.trim() || undefined}
      />
    );
  }
  let num = entries;
  let label = noun(entries, 'entry goes', 'entries go');
  if (entries === 0 && (kind === 'form' || kind === 'form_version') && versions > 0) {
    num = versions;
    label = noun(versions, 'version goes', 'versions go');
  } else if (entries === 0 && kind !== 'form' && kind !== 'form_version' && matches > 0) {
    num = matches;
    label = noun(matches, 'match goes', 'matches go');
  }
  const object = objectWords(kind, name, context);
  let sub: ReactNode;
  if (kind === 'season') {
    sub = (
      <>
        with <b>{counted(matches, 'match', 'matches')}</b> at{' '}
        <b>{counted(events, 'event', 'events')}</b>, and every form, dashboard, preset and metric{' '}
        {object} holds.
      </>
    );
  } else if (kind === 'event') {
    sub = (
      <>
        with <b>{counted(matches, 'match', 'matches')}</b>, and everything else {name} holds: its
        roster, pick lists and alliance bracket.
      </>
    );
  } else if (kind === 'form') {
    sub = (
      <>
        with <b>{counted(versions, 'version', 'versions')}</b> of {name}, their fields and their
        scoring.
      </>
    );
  } else if (kind === 'form_version') {
    sub = <>with the fields and the scoring of {object}.</>;
  }
  return (
    <BigCount
      num={formatCount(num)}
      label={label}
      sub={
        <>
          {sub}
          {countedNote}
        </>
      }
    />
  );
}

/** THEME "Delete bill": a numbered step (24 px ringed number) in a `--line` card. */
function Step({ num, title, children }: { num: number; title: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line px-3.5 py-3 lg:px-[18px] lg:py-3.5">
      <h3 className="flex items-center gap-2.5 text-[0.9375rem] font-[650]">
        <span
          aria-hidden="true"
          className="grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] border-ink text-[0.78125rem] font-bold"
        >
          {num}
        </span>
        <span className="sr-only">Step {num}: </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** THEME "Backup command box": the two SETUP.md lines, one Copy both. */
function BackupBox({ desktop }: { desktop: boolean }) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(BACKUP_LINES.join('\n'));
      setCopied('yes');
    } catch {
      setCopied('no');
    }
  }
  return (
    <div className="mt-2 overflow-hidden rounded-control border border-control-border bg-bg">
      <div className="flex min-h-10 items-center gap-2.5 border-b border-line ps-3.5">
        <p className="flex-1 py-1.5 text-[0.78125rem] font-semibold text-muted">
          {desktop
            ? 'Terminal · two lines: the tables, then the rows (SETUP.md › Backup)'
            : 'On your computer · SETUP.md › Backup'}
        </p>
        <button
          type="button"
          onClick={() => void copy()}
          className="tap-target hover-veil inline-flex min-h-10 shrink-0 items-center gap-1.5 self-stretch border-s border-control-border bg-surface px-3.5 text-[0.8125rem] font-semibold text-ink [&_svg]:size-[15px]"
        >
          {copied === 'yes' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied === 'yes' ? 'Copied' : 'Copy both'}
        </button>
      </div>
      <pre className="m-0 px-3.5 pt-2 pb-2.5 font-num text-[0.65625rem] leading-[1.6] break-all whitespace-pre-wrap text-ink lg:text-[0.6875rem] lg:leading-[1.65]">
        {BACKUP_LINES.join('\n')}
      </pre>
      {copied === 'no' && (
        <p
          role="status"
          className="border-t border-line px-3.5 py-1.5 text-[0.78125rem] text-muted"
        >
          This browser did not allow copying. Select the two lines and copy them.
        </p>
      )}
    </div>
  );
}

/** The name field: 48 px, a 2 px `--ink` edge, mono 17 px, its state at the right. */
function TypeField({
  id,
  value,
  matches,
  onChange,
}: {
  id: string;
  value: string;
  matches: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex min-h-12 items-center rounded-control border-2 border-ink bg-surface pe-3.5 focus-within:border-accent">
      <input
        id={`${id}-type`}
        type="text"
        aria-label="Type the name to confirm"
        aria-describedby={`${id}-hint ${id}-state`}
        value={value}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        dir="auto"
        onChange={(e) => onChange(e.target.value)}
        className="own-focus min-h-11 min-w-0 flex-1 bg-transparent ps-3.5 font-num text-[1.0625rem] font-medium text-ink outline-none"
      />
      <span
        id={`${id}-state`}
        aria-live="polite"
        className={cn(
          'ms-2 shrink-0 text-[0.78125rem] font-semibold',
          matches ? 'text-accent-ink' : 'text-muted',
        )}
      >
        {matches ? 'Matches' : 'No match yet'}
      </span>
    </div>
  );
}

/** Puts focus on `ref` when the face mounts (the dialog's own first focus runs once per surface). */
function useFirstFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    ref.current?.focus();
  }, [ref]);
}

/* ---------------------------------------------------------------- Are you sure? ----------- */

function SureFace({
  kind,
  name,
  subject,
  context,
  busy = false,
  error,
  held,
  onConfirm,
  onCancel,
}: DeleteDialogProps) {
  const id = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const card = subject ?? { title: name, meta: context };
  return (
    <Dialog
      open
      title="Are you sure?"
      onClose={onCancel}
      dismissible={!busy}
      showClose={false}
      initialFocus={cancel}
      describedBy={`${id}-line`}
      width={420}
      footer={
        <>
          <Button
            ref={cancel}
            variant="secondary"
            aria-disabled={busy || undefined}
            onClick={busy ? undefined : onCancel}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!!held}
            busy={busy}
            busyLabel="Deleting…"
            onClick={() => onConfirm()}
          >
            <span dir="auto">{deleteLabel(kind, name)}</span>
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-card border border-line px-3.5 py-3 text-[0.84375rem] text-ink-2">
        <b className="num text-base font-semibold text-ink" dir="auto">
          {card.title}
        </b>
        {card.points != null ? (
          <span className="num row-span-2 self-center text-end text-lg text-ink">
            {card.points}
            <small className="block font-sans text-[0.6875rem] text-muted">points</small>
          </span>
        ) : (
          <span className="row-span-2" />
        )}
        {(card.tag || card.meta || card.time) && (
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {card.tag}
            {card.meta && <span dir="auto">{card.meta}</span>}
            {card.time && <span className="num">· {card.time}</span>}
          </span>
        )}
      </div>
      <p id={`${id}-line`} className="text-sm leading-[1.45] text-ink-2">
        {kind === 'entry' ? (
          <>
            This deletes <b className="text-ink">1 entry</b>. It stops counting in statistics, lists
            and ranking once it syncs. There is no restore.
          </>
        ) : (
          <>
            This deletes <b className="text-ink">{name}</b>. No entries are saved to it, so nothing
            else goes. There is no restore.
          </>
        )}
      </p>
      {held && <p className="text-sm text-muted">{held}</p>}
      {error && <ErrorLine>{error}</ErrorLine>}
    </Dialog>
  );
}

/* ---------------------------------------------------------------- Choice (a match) -------- */

/** THEME "Station tiles": six 44 px tiles, Red 1–3 then Blue 1–3, each in its alliance tint. */
function StationTiles({ stations }: { stations: DeleteImpactStation[] }) {
  return (
    <ul aria-label="The entries by station" className="mt-3.5 grid grid-cols-3 gap-1.5">
      {stations.map((s) => (
        <li
          key={`${s.alliance}${s.station}`}
          className={cn(
            'flex min-h-11 flex-col items-center justify-center gap-px rounded-control text-[0.78125rem] font-[650]',
            s.alliance === 'red'
              ? 'bg-alliance-red-tint text-alliance-red'
              : 'bg-alliance-blue-tint text-alliance-blue',
          )}
        >
          <span>
            {s.alliance === 'red' ? 'Red' : 'Blue'} {s.station}
          </span>
          <small className="num text-[0.6875rem] font-medium">
            {s.entries === 0 ? 'no entry' : s.entries === 1 ? 'saved' : `${s.entries} saved`}
          </small>
        </li>
      ))}
    </ul>
  );
}

function ChoiceFace({
  name,
  impact,
  onCorrectMatch,
  onCancel,
  onDeleteAll,
}: DeleteDialogProps & { onDeleteAll: () => void }) {
  const desktop = useIsDesktop();
  const id = useId();
  const close = useRef<HTMLButtonElement>(null);
  const entries = n(impact.entries);
  const all = `Delete ${name} and its ${counted(entries, 'entry', 'entries')}…`;
  const band = (
    <>
      <Kicker>{`Delete match ${name}`}</Kicker>
      <BigCount
        num={formatCount(entries)}
        label={`${noun(entries, 'entry is', 'entries are')} saved to ${name}`}
        sub={
          <>
            The match can't go on its own: it would leave them with no match.
            {impact.last_saved_at && (
              <>
                {' '}
                Last saved <b className="num">{formatTime(impact.last_saved_at)}</b>.
              </>
            )}
          </>
        }
      />
      {impact.stations && <StationTiles stations={impact.stations} />}
    </>
  );
  const correct = onCorrectMatch && (
    <Button variant="primary" size={desktop ? undefined : 'block'} onClick={onCorrectMatch}>
      Correct the match number
    </Button>
  );
  const remove = (
    <Button size={desktop ? undefined : 'block'} onClick={onDeleteAll}>
      {all}
    </Button>
  );
  const closeButton = (
    <Button ref={close} size={desktop ? undefined : 'block'} onClick={onCancel}>
      Close
    </Button>
  );
  return (
    <ResponsiveDialog
      open
      title={`${name} has entries`}
      onClose={onCancel}
      showClose={false}
      initialFocus={close}
      describedBy={`${id}-line`}
      width={860}
      band={band}
    >
      <p id={`${id}-line`} className="-mt-1.5 text-sm leading-[1.45] text-ink-2">
        Correct its number, or delete it together with its entries.
      </p>
      {desktop ? (
        <SurfaceActions className="mt-2">
          {closeButton}
          {remove}
          {correct}
        </SurfaceActions>
      ) : (
        // THEME "Blocked tag and ways forward": on a phone the ways are full-width 52 px
        // buttons, the fix first as primary, the safe way (Close) last and focused.
        <div className="mt-2 flex flex-col gap-3">
          {correct}
          {remove}
          {closeButton}
        </div>
      )}
    </ResponsiveDialog>
  );
}

/* ---------------------------------------------------------------- Blocked ----------------- */

/** The band's biggest line and sentence for each reason no text overrides. */
function bigOfBlocked(
  reason: DeleteBlockedReason,
  name: string,
  impact: DeleteCounts,
): { num: string; label: string; sub: string } {
  const entries = n(impact.entries);
  switch (reason) {
    case 'version_has_entries':
      return {
        num: formatCount(entries),
        label: `${noun(entries, 'entry is', 'entries are')} bound to it`,
        sub: 'Deleting the version would leave them with no form to read them by.',
      };
    case 'version_published':
      // The user's rule (2026-10-29): a published version goes on its own once a newer
      // published version replaces it.
      return {
        num: name,
        label: 'is the newest published version',
        sub: 'A published version can be deleted on its own once a newer one replaces it.',
      };
    case 'version_active':
      return {
        num: name,
        label: 'is the active version',
        sub: 'Scouts open it for every new entry.',
      };
    case 'active_season':
      return {
        num: formatCount(entries),
        label: `${noun(entries, 'entry is', 'entries are')} scouted in it`,
        sub: 'It is the active season: every device scouts in it.',
      };
    case 'default_event':
      return {
        num: formatCount(entries),
        label: `${noun(entries, 'entry is', 'entries are')} scouted in it`,
        sub: 'It is the default event: every device scouts in it.',
      };
  }
}

/** The reason when the caller gave only the line: from the kind and the counts. */
function inferredReason(kind: DeleteKind, impact: DeleteCounts): DeleteBlockedReason {
  if (kind === 'season') return 'active_season';
  if (kind === 'event') return 'default_event';
  return n(impact.entries) > 0 ? 'version_has_entries' : 'version_published';
}

function BlockedFace({
  kind,
  name,
  impact,
  blocked,
  blockedReason,
  ways = [],
  context,
  facts,
  onCancel,
}: DeleteDialogProps & { blocked: string }) {
  const desktop = useIsDesktop();
  const keep = useRef<HTMLButtonElement>(null);
  const reason = blockedReason ?? inferredReason(kind, impact);
  const big = bigOfBlocked(reason, name, impact);
  const object = objectWords(kind, name, context);
  const short =
    kind === 'season' ? `season ${name}` : kind === 'form_version' ? versionWords(name) : name;
  const entries = n(impact.entries);
  const allWays: Array<BlockedWay & { safe?: boolean }> = [
    {
      title: `Keep ${short}`,
      body:
        reason === 'version_has_entries'
          ? `Nothing changes. The ${counted(entries, 'entry keeps its', 'entries keep their')} version.`
          : 'Nothing changes.',
      label: `Keep ${short}`,
      onSelect: onCancel,
      safe: true,
    },
    ...ways,
  ];
  const band = (
    <>
      <Kicker
        lead={
          <span className="inline-flex h-[26px] items-center gap-1.5 rounded-tag bg-surface px-2.5 text-[0.78125rem] font-bold tracking-[0.02em] text-ink">
            <Ban aria-hidden="true" className="size-[15px]" />
            Blocked
          </span>
        }
      >
        {`Delete ${object}`}
      </Kicker>
      <BandBody
        big={<BigCount num={big.num} label={big.label} sub={big.sub} />}
        facts={facts ?? countFacts(kind, impact)}
      />
    </>
  );
  return (
    <ResponsiveDialog
      open
      title={`${capital(short)} can't be deleted`}
      onClose={onCancel}
      showClose={false}
      initialFocus={keep}
      width={860}
      band={band}
    >
      <p className="-mt-1.5 text-[0.90625rem] leading-normal text-ink-2">{blocked}</p>
      <ul
        className={cn(
          'mt-1 grid gap-4',
          !desktop || allWays.length < 2
            ? 'grid-cols-1'
            : allWays.length > 2
              ? 'grid-cols-3'
              : 'grid-cols-2',
        )}
      >
        {allWays.map((way) => (
          <li
            key={way.title}
            className="flex flex-col gap-2 rounded-card border border-line p-[18px]"
          >
            <h3 className="text-[0.96875rem] font-[650]" dir="auto">
              {way.title}
            </h3>
            <p className="flex-1 text-[0.8125rem] leading-[1.45] text-muted" dir="auto">
              {way.body}
            </p>
            <Button
              ref={way.safe ? keep : undefined}
              size={desktop ? undefined : 'block'}
              className="mt-1.5 self-start max-lg:self-stretch"
              onClick={way.onSelect}
            >
              <span dir="auto">{way.label}</span>
            </Button>
          </li>
        ))}
      </ul>
    </ResponsiveDialog>
  );
}
