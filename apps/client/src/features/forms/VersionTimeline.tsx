import { Eye, RotateCcw, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { FormListItem, VersionSummary } from '@frc/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { formBuilderPath } from '@/lib/paths';
import { plural } from '@/lib/plural';
import { cn } from '@/lib/utils';
import { timelineOf } from './formsView';

/** The timeline's 32 px buttons, with the 48 px hit area grown by ::after. */
const SMALL = 'min-h-8 gap-1.5 px-2.5 text-[0.78125rem] after:-inset-y-2 [&_svg]:size-[13px]';

const OPEN_LABEL = { draft: 'Continue', active: 'Open', older: 'View' } as const;

/**
 * THEME "Version timeline" (Forms list, 2026-10-08): rows joined by a 2 px `--line` rail, an
 * 18 px dot (draft dashed, active filled `--accent` with a 4 px `--accent-tint` halo, older
 * hollow), the title over a `--muted` dates line, then the entries in mono and the buttons:
 * Continue (draft) · Open (active) · View + Restore (older). Each opens the builder on it.
 * Task 1.61 (28-delete final, `delete-triggers-forms-desktop.png`): a row ends with a 36 px
 * filled-ink trash button, "Delete version v2", which opens the one DeleteDialog. Every row but
 * the active version has one, the draft included (the user, 2026-10-29: a draft and a version
 * a newer published one replaced are deleted on their own); the dialog's face is the server's
 * answer, so the newest published version or one with entries opens Blocked.
 */
export function VersionTimeline({
  form,
  restoring,
  canRestore,
  onRestore,
  canDelete = false,
  onDelete,
}: {
  form: FormListItem;
  /** The version a Restore is in flight for. */
  restoring: string | null;
  canRestore: boolean;
  onRestore: (version: VersionSummary) => void;
  /** False while every delete is held offline: `useCapability('delete_objects')`. */
  canDelete?: boolean;
  /** A version's trash button (every row but the active one); none is drawn without it. */
  onDelete?: (version: VersionSummary) => void;
}) {
  const rows = timelineOf(form);
  return (
    <div>
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-bold tracking-[0.05em] text-muted uppercase">Versions</h3>
        <span className="ms-auto text-xs text-muted">
          Open a version to work on it in the builder
        </span>
      </div>
      <ol className="mt-2.5 flex flex-col ps-1">
        {rows.map(({ version, kind, title, sub }, i) => (
          <li key={version.id} className="relative flex items-start gap-3.5 pb-3">
            {i < rows.length - 1 && (
              <span aria-hidden="true" className="absolute start-3 top-5 bottom-0 w-0.5 bg-line" />
            )}
            <span
              aria-hidden="true"
              className={cn(
                'relative z-[1] mt-0.5 size-[18px] shrink-0 rounded-full border-2 bg-surface',
                kind === 'active'
                  ? 'border-accent bg-accent shadow-[0_0_0_4px_var(--accent-tint)]'
                  : 'border-control-border',
                kind === 'draft' && 'border-dashed',
              )}
            />
            {/* Wraps like the card head: at 1024 px the count and buttons go under the line
                rather than squeeze it to a word a line (final review, D1). */}
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <div className="min-w-0 flex-[1_1_auto]">
                <p className="text-[0.90625rem] font-bold">{title}</p>
                <p className="mt-0.5 text-[0.78125rem] text-muted">{sub}</p>
              </div>
              <div className="ms-auto flex shrink-0 items-center gap-2">
                {kind !== 'draft' && (
                  <span className="num text-[0.8125rem] text-ink-2">
                    {plural(version.entry_count, 'entry', 'entries')}
                  </span>
                )}
                <Link
                  to={formBuilderPath(form.id, version.version_no)}
                  aria-label={`${OPEN_LABEL[kind]} ${title}`}
                  className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), SMALL)}
                >
                  <Eye aria-hidden="true" />
                  {OPEN_LABEL[kind]}
                </Link>
                {kind === 'older' && (
                  <Button
                    size="sm"
                    className={SMALL}
                    aria-label={`Restore v${version.version_no}`}
                    disabled={!canRestore || restoring !== null}
                    busy={restoring === version.id}
                    busyLabel="Restoring…"
                    onClick={() => onRestore(version)}
                  >
                    <RotateCcw aria-hidden="true" />
                    Restore
                  </Button>
                )}
                {kind !== 'active' && onDelete && (
                  <Button
                    variant="destructive"
                    size="icon-sm"
                    className="size-9 min-h-9 min-w-9 after:-inset-1.5 [&_svg]:size-[15px]"
                    aria-label={`Delete version v${version.version_no}`}
                    title={`Delete version v${version.version_no}`}
                    disabled={!canDelete}
                    onClick={() => onDelete(version)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
