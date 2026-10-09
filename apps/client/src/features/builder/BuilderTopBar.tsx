import { ArrowRight, Check, ChevronDown, RotateCcw, TriangleAlert, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatTime, type GetFormOutput, type VersionSummary } from '@frc/shared';
import { ActionMenu, type ActionItem } from '@/components/ui/action-menu';
import { Button } from '@/components/ui/button';
import { formBuilderPath } from '@/lib/paths';
import { MEANING_PATHS, type IncompleteField } from './useBuilderState';
import { VersionMenu } from './VersionMenu';

/** The top bar's 36 px buttons (THEME "Builder top bar"), with the 48 px hit area. */
const BAR_BUTTON = 'min-h-9 px-3 text-[0.8125rem] after:-inset-y-1.5';

/** A held action's `--warn` line under the buttons, and the link or button that follows it. */
const HELD_LINE = 'mt-1 flex items-center gap-1.5 text-xs font-[650] whitespace-nowrap text-warn';
const HELD_ACTION =
  'inline-flex min-h-6 items-center gap-1 rounded-sm text-accent-ink underline-offset-2 hover:underline';

/** Why the version menu holds Restore: a restore reloads the builder, dropping unsaved edits. */
export const RESTORE_HELD = 'Save or undo your changes first';

/**
 * Why Publish is held, in one line (DEVIATIONS 1.29): one incomplete field is named by its
 * label; several give the count and the first label; a form with no data field says so.
 */
export function heldLine(
  incomplete: readonly IncompleteField[],
  hasDataField: boolean,
  versionNo: number,
): string | null {
  const v = `v${versionNo}`;
  if (incomplete.length === 0) {
    return hasDataField ? null : `Add a field before ${v} can be published`;
  }
  const meaning = incomplete.every((f) => f.issues.some((i) => MEANING_PATHS.has(i.path)));
  const first = `“${incomplete[0]!.label}”`;
  if (incomplete.length === 1) {
    return meaning
      ? `${first} needs its meaning before ${v} can be published`
      : `${first} needs a fix before ${v} can be published`;
  }
  return meaning
    ? `${incomplete.length} fields need their meaning before ${v} can be published, starting with ${first}`
    : `${incomplete.length} fields need a fix before ${v} can be published, starting with ${first}`;
}

/**
 * THEME "Builder top bar": the form's name with the season in mono; under it the version chip
 * (its chevron opens the version list), the change line, and "● Unsaved changes" or
 * "✓ Saved hh:mm". At the right: Save draft + Publish vN on a draft, Save changes on the active
 * version, Restore on an older one. A held Publish gets a `--warn` line with "Next incomplete →".
 * **More ▾** (task 1.31: Edit as JSON · Export · Import · Delete form) sits before them, held
 * offline and while anything is in flight. Match timer (task 1.32) joins the actions later.
 */
export function BuilderTopBar({
  form,
  version,
  year,
  editable,
  online,
  busy,
  dirty,
  changeLine,
  forkLine,
  belongsIn = null,
  savedAt,
  held,
  onSave,
  onPublish,
  onRestore,
  onOpenVersion,
  onNextIncomplete,
  more,
}: {
  form: GetFormOutput;
  version: VersionSummary;
  year: number | null;
  editable: boolean;
  online: boolean;
  busy: 'save' | 'publish' | 'restore' | null;
  dirty: boolean;
  changeLine: string | null;
  /** On a published version, when the unsaved change is structural: where it will go. */
  forkLine: string | null;
  /**
   * On the active version while a draft exists, a structural change the server would refuse
   * (`draft-exists`): that draft's number. Save changes is held, with a link to the draft.
   */
  belongsIn?: number | null;
  savedAt: string | null;
  held: string | null;
  onSave: () => void;
  onPublish: () => void;
  onRestore: (version: VersionSummary) => void;
  onOpenVersion: (versionNo: number) => void;
  onNextIncomplete: () => void;
  /** The More menu's rows; no More without them. */
  more?: readonly ActionItem[];
}) {
  const draft = version.status === 'draft';
  const off = !online || busy !== null;
  return (
    <header className="flex flex-none items-center gap-3.5 border-b border-line bg-surface px-6 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-[1.3125rem] font-[750] tracking-[-0.02em] whitespace-nowrap" dir="auto">
          {form.name}
          {year !== null && (
            <span className="num ms-1.5 text-[1.0625rem] font-medium text-muted">{year}</span>
          )}
        </h1>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.78125rem] text-muted">
          <VersionMenu
            current={version}
            versions={form.versions}
            canRestore={online && busy === null}
            restoreHeld={dirty ? RESTORE_HELD : null}
            onOpen={onOpenVersion}
            onRestore={onRestore}
          />
          {!online && (
            <span className="inline-flex items-center gap-1 font-[650] text-ink-2">
              <WifiOff aria-hidden="true" className="size-[13px]" />
              Offline
            </span>
          )}
          {changeLine && <span>{changeLine}</span>}
          {dirty ? (
            <span role="status" data-save-state="" className="font-[650] text-warn">
              ● Unsaved changes{forkLine ? ` · ${forkLine}` : ''}
            </span>
          ) : savedAt ? (
            <span
              role="status"
              data-save-state=""
              className="inline-flex items-center gap-1 font-[650] text-accent-ink"
            >
              <Check aria-hidden="true" className="size-[13px]" />
              Saved {formatTime(savedAt)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="ms-auto flex flex-col items-end">
        <div className="flex items-center gap-1.5">
          {more && (
            <>
              <ActionMenu label="More" items={more} disabled={off} className={BAR_BUTTON}>
                More
                <ChevronDown aria-hidden="true" />
              </ActionMenu>
              <span aria-hidden="true" className="mx-1.5 h-7 w-px bg-line" />
            </>
          )}
          {!editable ? (
            <Button
              variant="primary"
              className={BAR_BUTTON}
              disabled={off}
              busy={busy === 'restore'}
              busyLabel="Restoring…"
              onClick={() => onRestore(version)}
            >
              <RotateCcw aria-hidden="true" />
              Restore v{version.version_no}
            </Button>
          ) : draft ? (
            <>
              <Button
                className={BAR_BUTTON}
                disabled={off || !dirty}
                busy={busy === 'save'}
                busyLabel="Saving…"
                onClick={onSave}
              >
                Save draft
              </Button>
              <Button
                variant="primary"
                className={BAR_BUTTON}
                disabled={off || held !== null}
                busy={busy === 'publish'}
                busyLabel="Publishing…"
                onClick={onPublish}
              >
                Publish v{version.version_no}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              className={BAR_BUTTON}
              disabled={off || !dirty || belongsIn !== null}
              busy={busy === 'save'}
              busyLabel="Saving…"
              onClick={onSave}
            >
              Save changes
            </Button>
          )}
        </div>
        {editable && draft && held && (
          <p className={HELD_LINE}>
            <TriangleAlert aria-hidden="true" className="size-[13px]" />
            <span>{held} ·</span>
            <button type="button" onClick={onNextIncomplete} className={HELD_ACTION}>
              Next incomplete
              <ArrowRight aria-hidden="true" className="size-[13px]" />
            </button>
          </p>
        )}
        {editable && !draft && belongsIn !== null && (
          <p className={HELD_LINE}>
            <TriangleAlert aria-hidden="true" className="size-[13px]" />
            <span>This change belongs in draft v{belongsIn} ·</span>
            <Link to={formBuilderPath(form.id, belongsIn)} className={HELD_ACTION}>
              Open draft v{belongsIn}
              <ArrowRight aria-hidden="true" className="size-[13px]" />
            </Link>
          </p>
        )}
      </div>
    </header>
  );
}
