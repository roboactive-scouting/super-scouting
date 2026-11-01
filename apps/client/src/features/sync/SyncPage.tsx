import {
  Archive,
  ChevronRight,
  Ellipsis,
  Eye,
  GitMerge,
  Monitor,
  Plus,
  QrCode,
  RefreshCw,
  ScanLine,
  Smartphone,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { Fragment, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { can, formatCount, formatTime, type Role } from '@frc/shared';
import { Skeleton } from '@/components/Skeleton';
import { ActionMenu } from '@/components/ui/action-menu';
import { Button, buttonVariants } from '@/components/ui/button';
import { DestructiveConfirm } from '@/components/ui/destructive-confirm';
import { EmptyState } from '@/components/ui/empty-state';
import { Initials } from '@/components/ui/initials';
import { ErrorLine, Notice } from '@/components/ui/notice';
import { Sheet } from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { listDiscarded, undismissedDiscarded } from '@/data/discarded';
import {
  discardReceivedQrData,
  dismissQrDisposal,
  qrDisposal,
  readReceivedByQr,
  receivedQrState,
  type DiscardResult,
  type ReceivedByQr,
} from '@/data/qrReceive';
import { useSyncProgress, useSyncStatus } from '@/data/syncStatus';
import {
  groupByEvent,
  lastSyncLabel,
  notSentLine,
  openConflictCount,
  readSyncList,
  reasonInWords,
  savedLabel,
  type SyncGroup,
  type SyncRecord,
} from '@/data/syncList';
import { useDeviceQuery } from '@/data/useDeviceQuery';
import { entryPath, PATHS, superTeamPath } from '@/lib/paths';
import { plural } from '@/lib/plural';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';
import { DiscardedNotice } from './DiscardedNotice';
import { DiscardedStation, DiscardedStatus, DiscardedTeam } from './DiscardedParts';

type TabKey = 'waiting' | 'sent' | 'problems';

/** A row of More: a link to one of Sync's tools, or an action (Discard received QR data). */
type MoreItem = {
  key: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  /** Why the action waits: the row is disabled and says this instead of its detail. */
  held?: string | null;
  /** A rule above the row. */
  separated?: boolean;
} & ({ to: string; state?: { fromSync: true } } | { onSelect: () => void });

/** How a record's row looks: waiting, ticked off by the running sync, in flight, or sent. */
type Mark = 'waiting' | 'sending' | 'ticked' | 'sent';

export type SyncPageProps = {
  /** The event this device works on (the shell's); null when none is loaded. */
  eventId: string | null;
  /** Who is looking: leads and admins see the conflicts link (SPEC-FINAL 9.10). */
  viewer: { id: string; role: Role };
  /** One push-then-pull through the shell's queue (Sync now). */
  syncNow: () => Promise<unknown>;
};

/**
 * `/sync` (17-sync final, variant B; SPEC-FINAL 9.10, 17.9): what this device has sent and what
 * still waits. A status strip with Sync now (the one primary action) and, while it runs, the
 * progress "Sent · 2 of 5"; the conflicts link for leads and admins; Waiting · Sent · Problems.
 * Waiting holds EVERY unsynced record on the device whatever its event, grouped by competition,
 * exactly as many as the indicator counts. A refused record offers only Open entry, from which a
 * lead clears it by re-saving it (Q7.8, SPEC-FINAL 9.3.1); this page never discards anything.
 */
export function SyncPage({ eventId, viewer, syncNow }: SyncPageProps) {
  const desktop = useIsDesktop();
  const navigate = useNavigate();
  const status = useSyncStatus();
  const progress = useSyncProgress();
  const list = useDeviceQuery(readSyncList, [], ['outbox', 'rows', 'discarded']);
  const conflicts = useDeviceQuery(() => openConflictCount(eventId), [eventId], ['rows']);
  const discarded = useDeviceQuery(listDiscarded, [], ['discarded']);
  const notice = useDeviceQuery(undismissedDiscarded, [], ['discarded']);
  // SPEC-FINAL 9.8 (task 1.48): received QR copies — the Received by QR block, the escape hatch
  // in More and the success notice when the cloud has acked some.
  const received = useDeviceQuery(readReceivedByQr, [], ['outbox', 'rows']);
  const receivedState = useDeviceQuery(receivedQrState, [], ['outbox', 'rows']);
  const disposal = useDeviceQuery(qrDisposal, [], ['outbox', 'meta']);
  const [tab, setTab] = useState<TabKey>('waiting');
  const [busy, setBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardResult, setDiscardResult] = useState<DiscardResult | null>(null);
  const [discardFailed, setDiscardFailed] = useState(false);

  // A phone holding received copies, waiting or acked, is the collector tablet (17-sync final,
  // image 6).
  const holdsReceived = (receivedState?.held ?? 0) + (receivedState?.discardable ?? 0) > 0;
  const noun = desktop ? 'this device' : holdsReceived ? 'this tablet' : 'this phone';
  const sending = busy || (status.syncing && status.online);
  const canReview = can({ kind: 'user', userId: viewer.id, role: viewer.role }, 'resolve_conflict');

  const runSync = () => {
    if (sending) return;
    setBusy(true);
    void syncNow()
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };

  const removed = discarded?.length ?? 0;
  const heldCopies = receivedState?.held ?? 0;
  const discardable = receivedState?.discardable ?? 0;
  const discard = () => {
    setDiscarding(true);
    void discardReceivedQrData()
      .then((result) => setDiscardResult(result))
      // One transaction: a Discard that failed removed nothing, and says so.
      .catch(() => {
        setDiscardResult(null);
        setDiscardFailed(true);
      })
      .finally(() => {
        setDiscarding(false);
        setConfirmDiscard(false);
      });
  };
  // More (17-sync final): Send by QR (task 1.47), Receive by QR (task 1.48), the discarded-records
  // log (task 1.42), then, after a rule, Discard received QR data (task 1.48): held while any
  // received copy has not reached the cloud (SPEC-FINAL 9.8).
  const more: MoreItem[] = [
    {
      key: 'qr-send',
      icon: QrCode,
      title: 'Send by QR',
      detail: 'To the collector tablet. No internet needed.',
      to: PATHS.syncQrSend,
      state: { fromSync: true },
    },
    {
      key: 'qr-receive',
      icon: ScanLine,
      title: 'Receive by QR',
      detail: 'On the collector tablet: scan another phone.',
      to: PATHS.syncQrReceive,
      state: { fromSync: true },
    },
    {
      key: 'discarded',
      icon: Archive,
      title: 'Discarded records',
      detail:
        removed === 0
          ? 'Nothing has been removed.'
          : `${formatCount(removed)} removed because their event was deleted.`,
      to: PATHS.syncDiscarded,
    },
    {
      key: 'qr-discard',
      icon: Trash2,
      title: 'Discard received QR data',
      detail: `Removes ${plural(discardable, 'received copy', 'received copies')} already in the cloud.`,
      held:
        heldCopies > 0
          ? `Held: ${plural(heldCopies, 'received copy hasn’t', 'received copies haven’t')} reached the cloud.`
          : discardable === 0
            ? `Nothing received by QR is on ${noun}.`
            : null,
      separated: true,
      onSelect: () => {
        setMoreOpen(false);
        setDiscardResult(null);
        setDiscardFailed(false);
        setConfirmDiscard(true);
      },
    },
  ];

  const waiting = list?.waiting ?? [];
  const refused = list?.refused ?? [];
  const sent = list?.sent ?? [];
  // While a sync runs, the records it has already acked stay in Waiting, ticked off (17-sync
  // final, image 2); once it ends they are only under Sent.
  const ticked = new Set(sending ? (progress?.acked ?? []) : []);
  // In place, by when each was saved, so a row ticks off where it stands.
  const shown = [...waiting, ...sent.filter((r) => ticked.has(r.row_id))].sort((a, b) =>
    b.summary.client_updated_at.localeCompare(a.summary.client_updated_at),
  );
  const markOf = (record: SyncRecord): Mark =>
    record.acked_at !== null
      ? ticked.has(record.row_id)
        ? 'ticked'
        : 'sent'
      : sending && record.rejection === null
        ? 'sending'
        : 'waiting';
  const problems = refused.length > 0 || (notice?.length ?? 0) > 0;

  return (
    <main className="flex w-full max-w-[90rem] flex-col gap-3.5 px-4 pt-3.5 pb-8 lg:px-8 lg:pt-6">
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.375rem] font-bold tracking-tight lg:text-[1.625rem]">Sync</h1>
          <p className="mt-0.5 text-[0.8125rem] text-muted lg:text-[0.875rem]">
            What {noun} has sent, and what is still waiting.
          </p>
        </div>
        {desktop && (
          <ActionMenu
            label="More"
            items={more.map((item) => ({
              key: item.key,
              icon: item.icon,
              title: item.title,
              detail: item.detail,
              held: item.held,
              separated: item.separated,
              onSelect:
                'to' in item ? () => void navigate(item.to, { state: item.state }) : item.onSelect,
            }))}
          >
            <Ellipsis aria-hidden="true" />
            More
          </ActionMenu>
        )}
      </header>

      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,33rem)]">
        <StatusStrip
          online={status.online}
          sending={sending}
          lastSyncAt={status.lastSyncAt}
          progress={sending ? progress : null}
          onSync={runSync}
          more={
            desktop ? null : (
              <Button
                size="icon"
                className="size-11 min-h-11"
                aria-label="More"
                aria-haspopup="dialog"
                onClick={() => setMoreOpen(true)}
              >
                <Ellipsis aria-hidden="true" />
              </Button>
            )
          }
        />
        {canReview && (conflicts ?? 0) > 0 && <ConflictsLink count={conflicts ?? 0} />}
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-surface lg:w-[45rem]">
        <Tabs<TabKey>
          label="What to show"
          flush
          value={tab}
          onChange={setTab}
          dotted={problems ? new Set<TabKey>(['problems']) : undefined}
          flagLabel="needs a look"
          tabs={[
            { key: 'waiting', label: 'Waiting', count: waiting.length },
            { key: 'sent', label: 'Sent', count: sent.length },
            { key: 'problems', label: 'Problems', count: refused.length },
          ]}
        />
      </div>

      {discardResult && <DiscardResultLine result={discardResult} noun={noun} />}
      {discardFailed && (
        <ErrorLine className="lg:w-[45rem]">Discard did not finish. Nothing was removed.</ErrorLine>
      )}

      <section role="tabpanel" aria-label={TAB_NAME[tab]} className="flex flex-col gap-3.5">
        {tab === 'waiting' && disposal && (
          <Notice
            tone="success"
            role="status"
            className="lg:w-[45rem]"
            action={
              <Button size="sm" onClick={() => void dismissQrDisposal()}>
                Dismiss
              </Button>
            }
          >
            <b className="font-bold">
              {plural(disposal.count, 'received copy', 'received copies')} reached the cloud.
            </b>{' '}
            {disposal.count === 1 ? 'It no longer waits' : 'They no longer wait'} here; the records
            stay on {noun}.
          </Notice>
        )}
        {tab === 'waiting' && received && received.total > 0 && (
          <ReceivedBlock received={received} />
        )}
        {list === undefined ? (
          <Skeleton rows={4} label="Loading what waits to send" />
        ) : tab === 'waiting' ? (
          shown.length === 0 ? (
            <EmptyState
              icon={RefreshCw}
              title="Nothing waiting"
              detail={`Everything on ${noun} has reached the cloud.`}
              className="lg:max-w-md"
            />
          ) : (
            <RecordList
              groups={groupByEvent(shown, eventId)}
              desktop={desktop}
              markOf={markOf}
              full={desktop}
            />
          )
        ) : tab === 'sent' ? (
          sent.length === 0 ? (
            <EmptyState
              icon={RefreshCw}
              title="Nothing sent yet"
              detail={`What ${noun} sends to the cloud is listed here, newest first.`}
              className="lg:max-w-md"
            />
          ) : (
            <RecordList groups={[{ flat: sent }]} desktop={desktop} markOf={markOf} full />
          )
        ) : (
          <>
            {refused.length > 0 && (
              <RecordList groups={[{ flat: refused }]} desktop={desktop} markOf={markOf} full />
            )}
            <DiscardedNotice deviceNoun={noun} />
            {!problems && (
              <EmptyState
                icon={RefreshCw}
                title="No problems"
                detail="The server has refused nothing, and nothing has been removed."
                className="lg:max-w-md"
              />
            )}
          </>
        )}
      </section>

      {!desktop && (
        <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More" side="bottom">
          <ul className="px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {more.map((item) => (
              <li
                key={item.key}
                className={cn(item.separated && 'mt-1 border-t border-line-2 pt-1')}
              >
                {'to' in item ? (
                  <Link to={item.to} state={item.state} className={MORE_ROW}>
                    <MoreRow item={item} />
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={item.held != null}
                    onClick={item.onSelect}
                    className={cn(MORE_ROW, 'w-full text-start disabled:opacity-50')}
                  >
                    <MoreRow item={item} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      <DestructiveConfirm
        open={confirmDiscard}
        title="Discard received QR data?"
        objectName={plural(discardable, 'received copy', 'received copies')}
        body={`Removes the records other phones sent to ${noun} by QR. Each one has already reached the cloud. Records made on ${noun} stay.`}
        loss={`This removes ${plural(discardable, 'record')} from ${noun}.`}
        confirmLabel={`Discard ${plural(discardable, 'received copy', 'received copies')}`}
        icon={Trash2}
        busy={discarding}
        onConfirm={discard}
        onCancel={() => setConfirmDiscard(false)}
      />
    </main>
  );
}

const MORE_ROW = 'hover-veil flex min-h-14 items-start gap-3 rounded-lg px-2.5 py-2.5';

/** A More row's face: the icon, the bold title, and its line (or why it is held). */
function MoreRow({ item }: { item: MoreItem }) {
  return (
    <>
      <item.icon aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-ink-2" />
      <span className="min-w-0">
        <b className="block text-[0.90625rem] font-[650]">{item.title}</b>
        <small className="block text-[0.78125rem] text-muted">{item.held ?? item.detail}</small>
      </span>
    </>
  );
}

/** What Discard received QR data did: removed, or (a copy came in meanwhile) refused whole. */
function DiscardResultLine({ result, noun }: { result: DiscardResult; noun: string }) {
  if (result.refused > 0) {
    return (
      <ErrorLine className="lg:w-[45rem]">
        Nothing was removed:{' '}
        {plural(result.refused, 'received copy hasn’t', 'received copies haven’t')} reached the
        cloud.
      </ErrorLine>
    );
  }
  return (
    <Notice tone="success" role="status" className="lg:w-[45rem]">
      {result.discarded === 0
        ? `Nothing received by QR was on ${noun}.`
        : `Removed ${plural(result.discarded, 'received copy', 'received copies')} from ${noun}.`}
    </Notice>
  );
}

/**
 * "Received by QR" (17-sync final, phone image 6; SPEC-FINAL 9.10): the received copies still
 * waiting for the cloud, "12 from 3 scouters", one row per author with their last scan.
 */
function ReceivedBlock({ received }: { received: ReceivedByQr }) {
  return (
    <section
      aria-label="Received by QR"
      className="overflow-hidden rounded-card border border-line bg-surface lg:w-[45rem]"
    >
      <h2 className="flex gap-2 border-b border-line-2 bg-bg px-3.5 py-2 text-xs font-bold text-muted">
        Received by QR
        <span className="ms-auto font-semibold">
          {formatCount(received.total)} from {plural(received.authors.length, 'scouter')}
        </span>
      </h2>
      <ul>
        {received.authors.map((author) => (
          <li
            key={author.author_user_id}
            className="flex items-center gap-2.5 border-b border-line-2 px-3.5 py-2.5 last:border-b-0"
          >
            <Initials name={author.name ?? '?'} />
            <span className="min-w-0 flex-1">
              <b dir="auto" className="block truncate text-[0.875rem] font-[650]">
                {author.name ?? 'a scouter'}
              </b>
              {author.last_scan_at && (
                <small className="block text-xs text-muted">
                  last scan <span className="num">{savedLabel(author.last_scan_at)}</span>
                </small>
              )}
            </span>
            <span className="num text-lg font-semibold">{formatCount(author.count)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const TAB_NAME: Record<TabKey, string> = {
  waiting: 'Waiting',
  sent: 'Sent',
  problems: 'Problems',
};

/** THEME "Sync status strip": the state in words, the last sync, Sync now, and ⋯ on a phone. */
function StatusStrip({
  online,
  sending,
  lastSyncAt,
  progress,
  onSync,
  more,
}: {
  online: boolean;
  sending: boolean;
  lastSyncAt: string | null;
  progress: { sent: number; total: number } | null;
  onSync: () => void;
  more: ReactNode;
}) {
  const state = sending ? 'Sending…' : online ? 'Online' : 'Offline';
  const last = lastSyncAt ? `last sync ${lastSyncLabel(lastSyncAt)}` : 'not synced yet';
  return (
    <section
      aria-label="Sync status"
      className="flex items-center gap-2.5 rounded-card border border-line bg-surface px-3.5 py-3 lg:px-4"
    >
      <div className="min-w-0 flex-1">
        <p role="status" className="flex items-center gap-2 text-[0.9375rem] font-bold">
          {sending ? (
            <Spinner />
          ) : (
            <span
              aria-hidden="true"
              className={cn('size-[7px] shrink-0 rounded-full', online ? 'bg-accent' : 'bg-faint')}
            />
          )}
          {state}
        </p>
        {sending && progress ? (
          <div className="mt-1">
            <p className="flex items-baseline justify-between gap-3 text-[0.78125rem] text-ink-2">
              <span>Sent</span>
              <span className="num font-semibold text-ink">
                {formatCount(progress.sent)} of {formatCount(progress.total)}
              </span>
            </p>
            <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${progress.total ? (progress.sent / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="mt-0.5 text-xs text-muted">
            {last}
            {!online && ' · sends by itself'}
          </p>
        )}
      </div>
      <Button variant="primary" onClick={onSync} disabled={sending} className="shrink-0">
        <RefreshCw aria-hidden="true" />
        {sending ? 'Sending…' : 'Sync now'}
      </Button>
      {more}
    </section>
  );
}

/** The 14 px spinner (THEME "Sync status strip"): still under reduced motion. */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-3.5 shrink-0 rounded-full border-2 border-line border-t-accent motion-safe:animate-spin"
    />
  );
}

/** THEME "Conflicts link": leads and admins, only while the current event has open conflicts. */
function ConflictsLink({ count }: { count: number }) {
  return (
    <Link
      to={PATHS.conflicts}
      className="hover-veil flex items-center gap-3 rounded-card border border-warn/30 bg-warn-tint px-3.5 py-3 text-warn"
    >
      <span
        aria-hidden="true"
        className="grid size-[1.875rem] shrink-0 place-items-center rounded-lg bg-surface"
      >
        <GitMerge className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-ink">
        <b className="block text-[0.875rem] font-bold">
          {formatCount(count)} {count === 1 ? 'conflict' : 'conflicts'} to review
        </b>
        <span className="block text-xs text-ink-2">
          Two copies of the same entry. A lead picks.
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center text-[0.875rem] font-[650]">
        Review
        <ChevronRight aria-hidden="true" className="size-4" />
      </span>
    </Link>
  );
}

/** A competition's records (Waiting), or one flat list (Sent, Problems). */
type ListGroups = (SyncGroup | { flat: SyncRecord[] })[];

function RecordList({
  groups,
  desktop,
  markOf,
  full,
}: {
  groups: ListGroups;
  desktop: boolean;
  markOf: (record: SyncRecord) => Mark;
  /** Show a refused record's reason in words and its Open entry (the phone's Waiting doesn't). */
  full: boolean;
}) {
  return desktop ? (
    <RecordTable groups={groups} markOf={markOf} />
  ) : (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      {groups.map((group) =>
        'flat' in group ? (
          <ul key="flat">
            {group.flat.map((record) => (
              <RecordCard key={record.row_id} record={record} mark={markOf(record)} full={full} />
            ))}
          </ul>
        ) : (
          <section key={group.event_id ?? ''} aria-label={groupName(group)}>
            <GroupHeading group={group} />
            <ul>
              {group.records.map((record) => (
                <RecordCard key={record.row_id} record={record} mark={markOf(record)} full={full} />
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}

const groupName = (group: SyncGroup) => group.event_name ?? 'Earlier event';
/** "this event · 4": what still waits there (a row this sync has ticked off is not counted). */
const groupCount = (group: SyncGroup) =>
  `${group.current ? 'this event' : 'earlier event'} · ${formatCount(
    group.records.filter((r) => r.acked_at === null).length,
  )}`;

/** THEME "List group heading": a `--bg` band, the competition at the left, the count at the right. */
function GroupHeading({ group }: { group: SyncGroup }) {
  return (
    <h2 className="flex gap-2 border-b border-line-2 bg-bg px-3.5 py-2 text-xs font-bold text-muted">
      <span dir="auto" className="min-w-0 truncate">
        {groupName(group)}
      </span>
      <span className="ms-auto shrink-0 font-semibold">{groupCount(group)}</span>
    </h2>
  );
}

/** THEME "Origin badge": "This phone" / "This device", or "QR · from Yael". */
function OriginBadge({ record, desktop }: { record: SyncRecord; desktop: boolean }) {
  const qr = record.origin === 'qr';
  const Icon: LucideIcon = qr ? QrCode : desktop ? Monitor : Smartphone;
  return (
    <span className="inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-tag bg-line-2 px-1.5 text-[0.71875rem] font-[650] text-ink-2">
      <Icon aria-hidden="true" className="size-3" />
      {qr ? `QR · from ${record.from ?? 'another device'}` : desktop ? 'This device' : 'This phone'}
    </span>
  );
}

/**
 * A sent row's team, dimmed (THEME "Sync record card"): in `--muted`, never by opacity, which
 * would take its text under the contrast floor.
 */
const DIM = '**:text-muted';

/** "✓ 11:49" (ticked off by this sync) or "✓ sent 11:49" (the Sent tab). */
function Tick({ record, mark }: { record: SyncRecord; mark: Mark }) {
  if (record.acked_at === null) return null;
  return (
    <span className="num inline-flex items-center gap-1 text-[0.78125rem] font-semibold whitespace-nowrap text-accent-ink">
      ✓ {mark === 'sent' && 'sent '}
      {formatTime(record.acked_at)}
    </span>
  );
}

/** Where Open entry goes: the record's own entry route (the entry preview is task 1.52). */
function openPath(record: SyncRecord): string | null {
  if (record.team_id === null) return null;
  if (record.summary.form_kind === 'super') return superTeamPath(record.team_id);
  if (record.match_id === null) return null;
  return entryPath(record.match_id, record.team_id, record.summary.alliance ?? 'red');
}

/** THEME "Error line" for a refused record: the server's words, and with `full` why and Open entry. */
function NotSent({ record, full }: { record: SyncRecord; full: boolean }) {
  if (!record.rejection) return null;
  const to = openPath(record);
  const why = full && reasonInWords(record.rejection.code);
  return (
    <ErrorLine announce={false} className="py-2 text-[0.8125rem] font-normal">
      <p>
        <b className="font-bold">Not sent:</b> {notSentLine(record.rejection)}
        {why && <span className="text-ink-2"> {why}</span>}
      </p>
      {full && to && (
        <Link
          to={to}
          className={cn(
            buttonVariants({ variant: 'secondary', size: 'sm' }),
            'mt-2 min-h-8 gap-1.5 px-3 text-[0.8125rem] [&_svg]:size-4',
          )}
        >
          <Eye aria-hidden="true" />
          Open entry
        </Link>
      )}
    </ErrorLine>
  );
}

/**
 * "shown by QR 11:44" (17-sync final; SPEC-FINAL 9.10): the last time this record's batch was on
 * the QR sender's screen. A display, not a receipt: the record still waits for the cloud.
 */
function ShownByQr({ record }: { record: SyncRecord }) {
  if (!record.qr_shown_at) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap text-ink-2">
      <QrCode aria-hidden="true" className="size-3.5" />
      shown by QR <span className="num">{savedLabel(record.qr_shown_at)}</span>
    </span>
  );
}

function NewMatchLine() {
  return (
    <p className="flex items-center gap-1.5 text-[0.78125rem] text-ink-2">
      <Plus aria-hidden="true" className="size-3.5 text-muted" />
      New match — sends with this entry
    </p>
  );
}

/** THEME "Sync record card" (phone). */
function RecordCard({ record, mark, full }: { record: SyncRecord; mark: Mark; full: boolean }) {
  const s = record.summary;
  const dim = mark === 'sent';
  return (
    <li
      data-record={record.row_id}
      className={cn(
        'grid gap-1.5 border-b border-line-2 px-3.5 py-3 last:border-b-0',
        mark === 'sending' && 'bg-bg',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {s.match && <span className="num shrink-0 text-[0.8125rem] text-muted">{s.match}</span>}
        <span className={cn('min-w-0 flex-1 truncate', dim && DIM)}>
          <DiscardedTeam summary={s} big />
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {mark === 'sending' && <Spinner />}
          {mark === 'ticked' && <Tick record={record} mark={mark} />}
          <DiscardedStatus summary={s} />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.78125rem] text-muted">
        <DiscardedStation summary={s} />
        <span>
          saved <span className="num">{savedLabel(s.client_updated_at)}</span>
        </span>
        <OriginBadge record={record} desktop={false} />
        {mark === 'waiting' && <ShownByQr record={record} />}
        {/* Sent: the tick on the second line, so the team's name keeps its room on a phone. */}
        {mark === 'sent' && <Tick record={record} mark={mark} />}
      </div>
      {record.new_match && <NewMatchLine />}
      <NotSent record={record} full={full} />
    </li>
  );
}

/** Computer: THEME "Data table", a `--bg` row heading each competition. */
function RecordTable({
  groups,
  markOf,
}: {
  groups: ListGroups;
  markOf: (record: SyncRecord) => Mark;
}) {
  const rows = (records: SyncRecord[]) =>
    records.map((record) => {
      const s = record.summary;
      const mark = markOf(record);
      return (
        <Fragment key={record.row_id}>
          <TableRow data-record={record.row_id} className={cn(mark === 'sending' && 'bg-bg')}>
            <TableCell className="num ps-4 font-semibold">{s.match}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <DiscardedStation summary={s} />
                <span className={cn('min-w-0', mark === 'sent' && DIM)}>
                  <DiscardedTeam summary={s} big />
                </span>
              </div>
            </TableCell>
            <TableCell>
              <DiscardedStatus summary={s} />
            </TableCell>
            <TableCell className="num text-muted">{savedLabel(s.client_updated_at)}</TableCell>
            <TableCell>
              <OriginBadge record={record} desktop />
            </TableCell>
            <TableCell className="pe-4">
              <div className="flex items-center gap-2.5 text-[0.84375rem]">
                {mark === 'sending' && <Spinner />}
                <Tick record={record} mark={mark} />
                {mark === 'waiting' && <ShownByQr record={record} />}
                {record.new_match && <NewMatchLine />}
                {record.rejection && (
                  <span className="inline-flex items-center gap-1.5 font-[650] text-warn">
                    <TriangleAlert aria-hidden="true" className="size-4" />
                    Not sent
                  </span>
                )}
              </div>
            </TableCell>
          </TableRow>
          {record.rejection && (
            <TableRow>
              <TableCell />
              <TableCell colSpan={5} className="pe-4 pt-0">
                <NotSent record={record} full />
              </TableCell>
            </TableRow>
          )}
        </Fragment>
      );
    });

  return (
    <Table readOnly containerClassName="rounded-card border border-line bg-surface">
      <TableHeader>
        <TableRow>
          <TableHead className="w-24 ps-4">Match</TableHead>
          <TableHead>Team</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Saved</TableHead>
          <TableHead>Made on</TableHead>
          <TableHead className="pe-4">
            <span className="sr-only">Notes</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) =>
          'flat' in group ? (
            <Fragment key="flat">{rows(group.flat)}</Fragment>
          ) : (
            <Fragment key={group.event_id ?? ''}>
              <TableRow className="bg-bg">
                <TableCell colSpan={6} className="h-8 px-4 text-xs font-bold text-muted">
                  <span className="flex gap-2">
                    <span dir="auto">{groupName(group)}</span>
                    <span className="ms-auto font-semibold">{groupCount(group)}</span>
                  </span>
                </TableCell>
              </TableRow>
              {rows(group.records)}
            </Fragment>
          ),
        )}
      </TableBody>
    </Table>
  );
}
