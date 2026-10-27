import { ChevronLeft, Pencil, User } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  formatDate,
  formatTime,
  mayEditEntryNow,
  NO_VALUE,
  SELF_EDIT_WINDOW_MS,
  type GetEntryOutput,
} from '@frc/shared';
import { Skeleton } from '@/components/Skeleton';
import { StateMessage } from '@/components/StateMessage';
import { buttonVariants } from '@/components/ui/button';
import { Initials } from '@/components/ui/initials';
import { ErrorLine, SuccessBanner } from '@/components/ui/notice';
import { AllianceTag, FormKindTag, RobotStatusTag, StationTag } from '@/components/ui/tag';
import { typedCall, RpcError, type Rpc } from '@/data/rpc';
import { useDeviceQuery } from '@/data/useDeviceQuery';
import { useMapView } from '@/features/entry/EntryAnswers';
import type { WindowOutcome } from '@/features/entry/EntryPage';
import { EntryContext } from '@/features/entry/entryContext';
import { MapFieldView } from '@/features/entry/lazyParts';
import type { Editor } from '@/features/entry/localEntries';
import { ReadOnlyTag } from '@/features/entry/SuperReadOnly';
import { usePageCrumb, usePageTitle } from '@/lib/pageTitle';
import { entryPath, PATHS, superTeamPath, teamPath } from '@/lib/paths';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';
import { formatPoints } from './EntryParts';
import { fromWire, loadDevicePreview, type EntryPreview } from './entryPreview';
import { DeadRobotNote, PreviewAnswers, ScoreBand, splitPhases } from './PreviewParts';

/** What the 5-minute mark hands the preview through the router (SPEC-FINAL 7.6 v1.45). */
export type PreviewLocationState = { windowClosed?: WindowOutcome } | null;

type Remote =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; entry: EntryPreview }
  | { status: 'not-found' }
  | { status: 'unreachable' };

/**
 * `/entries/:id` (SPEC-FINAL 13.4; 25-entry-preview final, variant B with D's buttons): one entry,
 * read only, as a full page — never a drawer. The device's copy first (the venue is offline, and
 * the 5-minute mark lands here offline); the server's `getEntry` only when the device does not
 * hold it, and a plain "not on this device" when the server cannot be reached either. A
 * soft-deleted entry, or another event's, is never shown.
 *
 * Header: the match, team, robot status, station, form kind and the scouted points ("—" over
 * "not counted" for a no-show or disabled robot; nothing for a super entry), then who scouted it,
 * when, and the form version. A match entry with a score: the score band. Then the answers by
 * phase with subtotals and per-row points; a no-show or disabled robot shows a note and NO field
 * rows. Team page, and Edit — only when SPEC-FINAL 7.6 lets THIS viewer edit it now, on this
 * device's clock (`mayEditEntryNow`, the server's rule too).
 */
export function EntryPreviewPage({
  entryId,
  eventId,
  viewer,
  rpc = { call: typedCall },
}: {
  entryId: string;
  eventId: string;
  viewer: Editor;
  rpc?: Rpc;
}) {
  const desktop = useIsDesktop();
  const location = useLocation();
  const navigate = useNavigate();
  const outcome = (location.state as PreviewLocationState)?.windowClosed ?? null;
  const device = useDeviceQuery(
    () => loadDevicePreview(entryId, eventId),
    [entryId, eventId],
    ['rows'],
  );
  const [remote, setRemote] = useState<Remote>({ status: 'idle' });
  const absent = device?.state === 'absent';

  useEffect(() => {
    if (!absent) return;
    let live = true;
    setRemote({ status: 'loading' });
    rpc.call('getEntry', { entry_id: entryId }).then(
      (out) => {
        if (!live) return;
        const wire = out as GetEntryOutput;
        // Never another event's entry, whichever way it came.
        setRemote(
          wire.event_id === eventId
            ? { status: 'ok', entry: fromWire(wire) }
            : { status: 'not-found' },
        );
      },
      (error: unknown) => {
        if (!live) return;
        setRemote({
          status:
            error instanceof RpcError && error.code === 'not-found' ? 'not-found' : 'unreachable',
        });
      },
    );
    return () => {
      live = false;
    };
    // rpc is an injected dependency held stable by the caller.
  }, [absent, entryId, eventId]);

  const entry =
    device?.state === 'held' ? device.entry : remote.status === 'ok' ? remote.entry : null;
  const gone = device?.state === 'gone' || (absent && remote.status === 'not-found');
  const unreachable = absent && remote.status === 'unreachable';

  const team = entry ? `${entry.teamNumber ?? ''}` : '';
  const short = entry ? `${entry.matchLabel ?? 'Super'} · ${team}` : null;
  usePageTitle(short);
  usePageCrumb(entry ? ['Entries', `${short} ${entry.teamName}`.trim()] : null);

  const back = () => {
    if (location.key !== 'default') void navigate(-1);
    else void navigate(PATHS.entries);
  };

  if (gone) {
    return (
      <StateMessage
        variant="no-results"
        headingLevel={1}
        title="This entry is not here"
        detail="It may have been removed by a lead, or it belongs to another competition."
        action={{ label: 'Back to Entries', to: PATHS.entries }}
      />
    );
  }
  if (unreachable) {
    return (
      <StateMessage
        variant="offline-needs-server"
        headingLevel={1}
        title="This entry is not on this device"
        detail="It has not reached this device yet, and the server cannot be reached to open it."
        action={{ label: 'Back to Entries', to: PATHS.entries }}
      />
    );
  }
  if (!entry) {
    return (
      <div className="p-4">
        <Skeleton rows={6} label="Loading the entry" />
      </div>
    );
  }
  return (
    <Preview entry={entry} viewer={viewer} outcome={outcome} desktop={desktop} onBack={back} />
  );
}

function Preview({
  entry,
  viewer,
  outcome,
  desktop,
  onBack,
}: {
  entry: EntryPreview;
  viewer: Editor;
  outcome: WindowOutcome | null;
  desktop: boolean;
  onBack: () => void;
}) {
  const map = useMapView();
  const bannerRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  // The mark that ends a scouter's five minutes passes while the page is open: Edit goes then.
  useEffect(() => {
    const wait = Date.parse(entry.clientCreatedAt) + SELF_EDIT_WINDOW_MS - Date.now();
    setNow(Date.now());
    if (!(wait > 0)) return;
    const timer = setTimeout(() => setNow(Date.now()), wait + 50);
    return () => clearTimeout(timer);
  }, [entry.clientCreatedAt]);
  // The form the scout was in is gone: focus goes to what replaced it, the banner.
  useEffect(() => {
    if (outcome) bannerRef.current?.focus();
  }, [outcome]);

  const canEdit = mayEditEntryNow(
    { kind: 'user', userId: viewer.id, role: viewer.role },
    {
      scouter_id: entry.scouterId,
      form_kind: entry.kind,
      client_created_at: entry.clientCreatedAt,
    },
    new Date(now),
  );
  const dead = entry.status === 'no_show' || entry.status === 'disabled';
  const band =
    entry.kind === 'match' && entry.total !== null ? (
      <ScoreBand total={entry.total} average={entry.teamAverage} phases={entry.phases} />
    ) : null;
  const editTo =
    entry.kind === 'super'
      ? superTeamPath(entry.teamId)
      : entry.matchId
        ? entryPath(entry.matchId, entry.teamId, entry.alliance ?? 'red')
        : null;
  const actions = (
    <div className="flex gap-2">
      <Link
        to={teamPath(entry.teamId)}
        className={cn(buttonVariants({ size: 'sm' }), 'min-h-10 flex-1 text-[0.84375rem]')}
      >
        <User aria-hidden="true" />
        Team page
      </Link>
      {canEdit && editTo ? (
        <Link
          to={editTo}
          className={cn(buttonVariants({ size: 'sm' }), 'min-h-10 flex-1 text-[0.84375rem]')}
        >
          <Pencil aria-hidden="true" />
          Edit
        </Link>
      ) : null}
    </div>
  );
  const banner = outcome ? (
    <div ref={bannerRef} tabIndex={-1} className="outline-none">
      <Outcome {...outcome} />
    </div>
  ) : null;
  const note =
    dead && (entry.status === 'no_show' || entry.status === 'disabled') ? (
      <DeadRobotNote status={entry.status} />
    ) : null;
  const { left, right } = splitPhases(entry);
  const answers = dead ? [] : entry.phases;

  let body: ReactNode;
  if (!desktop) {
    body = (
      <div className="flex flex-col gap-2.5 px-3.5 pt-3 pb-4">
        {banner}
        {band}
        {note}
        <PreviewAnswers phases={answers} kind={entry.kind} map={map} />
        {actions}
      </div>
    );
  } else if (band) {
    body = (
      <div className="flex flex-col gap-3.5 px-8 py-[18px]">
        {banner}
        <div className="grid grid-cols-2 items-start gap-3.5">
          {band}
          <div className="self-end">{actions}</div>
          <PreviewAnswers phases={left} kind={entry.kind} map={map} />
          <PreviewAnswers phases={right} kind={entry.kind} map={map} />
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-3.5 px-8 py-[18px]">
        {banner}
        <div className="grid grid-cols-2 items-start gap-3.5">
          <div className="flex flex-col gap-3.5">
            {note}
            <PreviewAnswers phases={dead ? [] : left} kind={entry.kind} map={map} />
          </div>
          <div className="flex flex-col gap-3.5">
            {actions}
            <PreviewAnswers phases={dead ? [] : right} kind={entry.kind} map={map} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <EntryContext
      value={{
        alliance: entry.alliance ?? 'red',
        station: entry.station,
        fieldImagePath: entry.fieldImagePath,
        caption: `${entry.matchLabel ?? 'Super'} · ${entry.teamNumber ?? ''}`,
      }}
    >
      <main className="flex flex-1 flex-col">
        <Header entry={entry} desktop={desktop} onBack={onBack} />
        {body}
        {map.viewing && (
          <MapFieldView
            field={map.viewing}
            value={entry.data[map.viewing.key]}
            onClose={map.close}
          />
        )}
      </main>
    </EntryContext>
  );
}

/** THEME "Entry header (read only)". */
function Header({
  entry,
  desktop,
  onBack,
}: {
  entry: EntryPreview;
  desktop: boolean;
  onBack: () => void;
}) {
  const dead = entry.status === 'no_show' || entry.status === 'disabled';
  const at = entry.clientCreatedAt
    ? `${formatDate(entry.clientCreatedAt)} ${formatTime(entry.clientCreatedAt)}`
    : NO_VALUE;
  const station = entry.station ? (
    <StationTag station={entry.station} />
  ) : entry.kind === 'match' && entry.alliance ? (
    <AllianceTag alliance={entry.alliance}>{entry.alliance === 'red' ? 'Red' : 'Blue'}</AllianceTag>
  ) : null;
  return (
    <header
      className={cn(
        'border-b border-line bg-surface',
        desktop ? 'px-8 py-[18px]' : 'px-4 pt-3 pb-3.5',
      )}
    >
      {desktop ? null : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="tap-target hover-veil -ms-1.5 inline-flex items-center gap-0.5 rounded-control pe-1.5 text-[0.8125rem] font-semibold text-ink-2"
          >
            <ChevronLeft aria-hidden="true" className="size-[18px]" />
            Entries
          </button>
          <span className="flex-1" />
          <ReadOnlyTag />
        </div>
      )}
      <div className="flex items-end gap-3">
        <div className="min-w-0">
          <h1
            className={cn(
              'flex flex-wrap items-baseline gap-x-2 font-bold',
              desktop ? 'text-[1.3125rem]' : 'mt-2 text-[1.0625rem]',
            )}
          >
            <span className="num text-[0.8125rem] font-semibold text-muted">
              {entry.matchLabel ?? 'Whole event'}
            </span>
            <span
              className={cn(
                'num font-semibold tracking-[-0.02em]',
                desktop ? 'text-[2.375rem]' : 'text-[1.75rem]',
              )}
            >
              {entry.teamNumber ?? NO_VALUE}
            </span>
            <span dir="auto" className="min-w-0 break-words">
              {entry.teamName}
            </span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {entry.status ? <RobotStatusTag status={entry.status} /> : null}
            {station}
            <FormKindTag kind={entry.kind} />
            {desktop ? <ReadOnlyTag /> : null}
          </div>
        </div>
        {entry.kind === 'match' ? (
          <div className="ms-auto shrink-0 text-end leading-none">
            {entry.total !== null ? (
              <b
                className={cn(
                  'num block font-semibold text-ink',
                  desktop ? 'text-[2.375rem]' : 'text-[1.875rem]',
                )}
              >
                {formatPoints(entry.total)}
              </b>
            ) : (
              <b
                aria-hidden="true"
                className={cn(
                  'num block font-medium text-muted',
                  desktop ? 'text-[2.375rem]' : 'text-[1.875rem]',
                )}
              >
                {NO_VALUE}
              </b>
            )}
            <small className="mt-[3px] block text-[0.71875rem] font-semibold text-muted">
              {entry.total !== null ? 'scouted points' : dead ? 'not counted' : 'no score'}
            </small>
          </div>
        ) : null}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.78125rem] text-muted">
        <Initials name={entry.scouterName ?? '?'} size={26} />
        <span>
          Scouted by{' '}
          <b dir="auto" className="font-[650] text-ink">
            {entry.scouterName ?? 'a scouter'}
          </b>
        </span>
        <span className="num text-ink-2">{at}</span>
        {entry.formVersion !== null ? <span>form v{entry.formVersion}</span> : null}
      </div>
    </header>
  );
}

/** The save at the mark, said: the Success banner, or the Error line when nothing was saved. */
function Outcome({ notKept, failed }: WindowOutcome) {
  if (failed !== null) {
    return (
      <ErrorLine>
        Not saved — the 5 minutes are up. A lead can save it for you.
        <span className="mt-0.5 block font-normal text-ink-2">{failed}</span>
      </ErrorLine>
    );
  }
  return (
    <div role="status">
      <SuccessBanner title="Saved — the 5 minutes are up.">
        {notKept.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5">
            {notKept.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </SuccessBanner>
    </div>
  );
}
