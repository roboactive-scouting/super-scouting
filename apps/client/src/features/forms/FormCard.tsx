import {
  Download,
  Ellipsis,
  Eye,
  FileText,
  Plus,
  Star,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { FormKind, FormListItem, VersionSummary } from '@frc/shared';
import { ActionMenu } from '@/components/ui/action-menu';
import { Button, buttonVariants } from '@/components/ui/button';
import { ErrorLine } from '@/components/ui/notice';
import { NotCreatedTag, VersionTag } from '@/components/ui/version-tag';
import { formBuilderPath } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { KIND_MEANING, KIND_NAME, statsOf, statusOf } from './formsView';
import { VersionTimeline } from './VersionTimeline';

const ICON: Record<FormKind, LucideIcon> = { match: FileText, super: Star };

/** A 40 px icon square: dark (`--rail`) for a form that exists, `--line-2` for a missing one. */
function KindIcon({ kind, dim }: { kind: FormKind; dim: boolean }) {
  const Icon = ICON[kind];
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-[10px]',
        dim ? 'bg-line-2 text-ink-2' : 'bg-rail text-surface',
      )}
    >
      <Icon className="size-5" strokeWidth={1.9} />
    </span>
  );
}

function CardHead({
  kind,
  name,
  dim,
  tag,
}: {
  kind: FormKind;
  name: string;
  dim: boolean;
  tag: ReactNode;
}) {
  // The head wraps: when the card is too narrow for the name, its meaning and the tag on one
  // line (1024 px), the tag and ⋯ move under them, so the name never breaks word by word
  // (final review, D1). The name's box asks for its one-line width before anything wraps.
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-[1_1_auto] items-start gap-3">
        <KindIcon kind={kind} dim={dim} />
        <div className="min-w-0">
          <h2 className="text-lg font-[750]" dir="auto">
            {name}
          </h2>
          <p className="mt-0.5 text-[0.78125rem] text-muted">{KIND_MEANING[kind]}</p>
        </div>
      </div>
      <div className="ms-auto flex items-center gap-1.5">{tag}</div>
    </div>
  );
}

function Stat({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        'border-e border-line-2 px-3 py-2.5 last:border-e-0',
        wide ? 'flex-[1.6]' : 'flex-1',
      )}
    >
      <dt className="text-[0.71875rem] font-[650] text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

/**
 * THEME "Form card" (Forms list, 2026-10-08): the head (dark icon square, the name over its
 * meaning, the status tag), the stat row (Fields · Entries · Versions · Last edited), the version
 * timeline, then Open builder and Export (task 1.31). The head's ⋯ holds Delete form.
 */
export function FormCard({
  form,
  restoring,
  online,
  error,
  onRetry,
  onRestore,
  onExport,
  onDelete,
}: {
  form: FormListItem;
  restoring: string | null;
  online: boolean;
  error: string | null;
  /** The error line's Try again: read the list again (after a restore whose re-read failed). */
  onRetry?: () => void;
  onRestore: (version: VersionSummary) => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const status = statusOf(form);
  const stats = statsOf(form);
  return (
    <section
      aria-label={form.name}
      className="flex flex-col gap-3.5 rounded-card border border-line bg-surface px-5 py-[18px]"
    >
      <CardHead
        kind={form.kind}
        name={form.name}
        dim={false}
        tag={
          <>
            <VersionTag tone={status.tone} locked={status.locked}>
              {status.text}
            </VersionTag>
            <ActionMenu
              label={`Form actions: ${form.name}`}
              size="icon-sm"
              className="border-line text-ink-2"
              disabled={!online}
              items={[
                {
                  key: 'delete',
                  icon: Trash2,
                  title: 'Delete form',
                  detail: 'Removes every version and its entries. Asks first.',
                  onSelect: onDelete,
                },
              ]}
            >
              <Ellipsis aria-hidden="true" />
            </ActionMenu>
          </>
        }
      />
      <dl className="flex rounded-control border border-line">
        <Stat label="Fields">
          <span className="num text-xl font-semibold">{stats.fields}</span>
        </Stat>
        <Stat label="Entries">
          <span className="num text-xl font-semibold">{stats.entries}</span>
        </Stat>
        <Stat label="Versions">
          <span className="num text-xl font-semibold">{stats.versions}</span>
        </Stat>
        <Stat label="Last edited" wide>
          <span className="mt-1 block text-sm font-[650]">{stats.lastEdited ?? '—'}</span>
        </Stat>
      </dl>
      {error && (
        <ErrorLine>
          <span>{error}</span>
          {onRetry && (
            <Button size="sm" className="ms-3 align-middle" disabled={!online} onClick={onRetry}>
              Try again
            </Button>
          )}
        </ErrorLine>
      )}
      <VersionTimeline
        form={form}
        restoring={restoring}
        canRestore={online}
        onRestore={onRestore}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={formBuilderPath(form.id)}
          className={cn(
            buttonVariants({ variant: 'primary' }),
            'min-h-10 px-3.5 text-[0.84375rem]',
          )}
        >
          <Eye aria-hidden="true" />
          Open builder
        </Link>
        <Button className="min-h-10 px-3.5 text-[0.84375rem]" disabled={!online} onClick={onExport}>
          <Download aria-hidden="true" />
          Export
        </Button>
        <span className="ms-auto text-[0.78125rem] text-muted">
          Open builder opens the draft if there is one
        </span>
      </div>
    </section>
  );
}

/**
 * A missing form (13-forms README): a dashed card on `--bg` with Create and Import (a saved
 * export or a file, task 1.31).
 */
export function MissingFormCard({
  kind,
  year,
  previousYear,
  online,
  creating,
  error,
  onCreate,
  onImport,
}: {
  kind: FormKind;
  year: number;
  /** The newest earlier season that has a match form, to export from; null when none has. */
  previousYear: number | null;
  online: boolean;
  creating: boolean;
  error: string | null;
  onCreate: () => void;
  onImport: () => void;
}) {
  return (
    <section
      aria-label={`${KIND_NAME[kind]} (not created)`}
      className="flex flex-col gap-3 rounded-card border border-dashed border-control-border bg-bg px-5 py-[22px]"
    >
      <CardHead kind={kind} name={KIND_NAME[kind]} dim tag={<NotCreatedTag />} />
      <p className="text-[0.84375rem] leading-normal text-muted">
        {kind === 'match' ? (
          previousYear !== null ? (
            <>
              Every entry needs a match form. Create it here, or <b className="text-ink">import</b>{' '}
              {previousYear === year - 1 ? "last season's" : "an earlier season's"}: export it from{' '}
              {previousYear}, then pick it under Import.
            </>
          ) : (
            <>
              Every entry needs a match form. Create it here, or <b className="text-ink">import</b>{' '}
              one: export it from another season, then import the file.
            </>
          )
        ) : (
          `No super form for ${year} yet. Super scouting is optional; the match form is enough to scout.`
        )}
      </p>
      {error && <ErrorLine>{error}</ErrorLine>}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          className="min-h-10 px-3.5 text-[0.84375rem]"
          disabled={!online}
          busy={creating}
          busyLabel="Creating…"
          onClick={onCreate}
        >
          <Plus aria-hidden="true" />
          Create {KIND_NAME[kind].toLowerCase()}
        </Button>
        <Button
          className="min-h-10 px-3.5 text-[0.84375rem]"
          disabled={!online || creating}
          onClick={onImport}
        >
          <Upload aria-hidden="true" />
          Import
        </Button>
        {!online && (
          <span className="text-[0.78125rem] text-muted">Creating a form needs a connection.</span>
        )}
      </div>
    </section>
  );
}
