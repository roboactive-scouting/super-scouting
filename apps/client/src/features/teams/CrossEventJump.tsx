import { ArrowRightLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LIST_TEAM_EVENTS_MAX_LIMIT, type ListTeamEventsOutput } from '@frc/shared';
import { Skeleton } from '@/components/Skeleton';
import { Button } from '@/components/ui/button';
import { ErrorLine } from '@/components/ui/notice';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import type { Rpc } from '@/data/rpc';
import { sessionOverride } from '@/features/context/sessionOverride';
import { plural } from '@/lib/plural';
import { cn } from '@/lib/utils';
import { monthYear, shortEventName, type TeamItem } from './teamSearch';

/*
 * SPEC-FINAL 13.2's cross-event jump (task 1.51; 23-team-search final): a team that is not at the
 * active event → the dashed "Other event" button → pick from the events we hold entries for it at
 * → "Switch to another event?" → on yes, a session-only override (6.3) and the team's page. The
 * whole path is a server read (`listTeamEvents`), so it is held offline (9.6 "any cross-event
 * view") through `useCapability('cross_event_view')`, never its own online check.
 */

type TeamEvent = ListTeamEventsOutput['items'][number];

/**
 * THEME "Other-event button": 36 px, dashed `--control-border` on `--bg`, ⇄ + 13 px / 600
 * `--ink-2` "Other event"; disabled at 45 % offline. Its name says whose events it opens.
 */
export function OtherEventButton({
  team,
  disabled,
  onClick,
}: {
  team: Pick<TeamItem, 'number' | 'name'>;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`${team.number} ${team.name}: other event`}
      className="tap-target hover-veil motion-safe:transition relative inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control border border-dashed border-control-border bg-bg px-3 text-[0.8125rem] font-semibold text-ink-2 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] disabled:opacity-45"
    >
      <ArrowRightLeft aria-hidden="true" className="size-[15px]" />
      Other event
    </button>
  );
}

/** Every page of the team's events, at most a few pages (a season has a handful). */
async function teamEvents(rpc: Rpc, teamId: string): Promise<TeamEvent[]> {
  const items: TeamEvent[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const out = (await rpc.call('listTeamEvents', {
      team_id: teamId,
      limit: LIST_TEAM_EVENTS_MAX_LIMIT,
      ...(cursor ? { cursor } : {}),
    })) as ListTeamEventsOutput;
    items.push(...out.items);
    if (!out.next_cursor) break;
    cursor = out.next_cursor;
  }
  return items;
}

/**
 * The two steps after the button: the event picker (radio rows; THEME "Event picker"), then the
 * are-you-sure. Mounted while `team` is set; `onClose` ends it either way. On yes it sets the
 * session override (or clears it, when the pick is the admin default) and calls `onSwitched`.
 */
export function CrossEventJump({
  team,
  rpc,
  currentEventName,
  defaultEventId,
  defaultEventName,
  onClose,
  onSwitched,
}: {
  team: TeamItem;
  rpc: Rpc;
  /** The event the page ranks from now ("District #3 · Tel Aviv"). */
  currentEventName: string;
  /** The admin default, where scouting still saves. */
  defaultEventId: string;
  defaultEventName: string;
  onClose: () => void;
  onSwitched: (team: TeamItem) => void;
}) {
  const [events, setEvents] = useState<TeamEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [step, setStep] = useState<'pick' | 'confirm'>('pick');

  useEffect(() => {
    let live = true;
    setFailed(false);
    teamEvents(rpc, team.id).then(
      (items) => {
        if (!live) return;
        setEvents(items);
        setPicked((p) => p ?? items[0]?.id ?? null);
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
    // rpc is an injected dependency held stable by the caller.
  }, [team.id]);

  const here = shortEventName(currentEventName);
  const teamName = `${team.number} ${team.name}`;
  const choice = events?.find((e) => e.id === picked) ?? null;

  function switchAndOpen() {
    if (!choice) return;
    if (choice.id === defaultEventId) sessionOverride.clear();
    else sessionOverride.set(choice.id, choice.name);
    onSwitched(team);
  }

  if (step === 'confirm' && choice) {
    return (
      <ResponsiveDialog
        open
        title="Switch to another event?"
        onClose={onClose}
        showClose={false}
        width={440}
        footer={
          <>
            <Button onClick={onClose}>Keep {here}</Button>
            <Button variant="primary" onClick={switchAndOpen}>
              Switch and open
            </Button>
          </>
        }
      >
        <p dir="auto" className="text-[0.875rem] leading-[1.45] text-ink-2">
          Switch this session to <b className="font-bold text-ink">{choice.name}</b> and open{' '}
          <b className="font-bold text-ink">{teamName}</b>?
        </p>
        <p dir="auto" className="text-[0.8125rem] leading-[1.45] text-muted">
          Only on this device until you go back or sign out. Scouting still saves to{' '}
          {defaultEventName}.
        </p>
      </ResponsiveDialog>
    );
  }

  return (
    <ResponsiveDialog
      open
      title={`${teamName} wasn’t at ${here}`}
      onClose={onClose}
      showClose={false}
      width={460}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!choice} onClick={() => setStep('confirm')}>
            Continue
          </Button>
        </>
      }
    >
      <p className="-mt-1 text-[0.84375rem] text-ink-2">Pick an event we scouted them at.</p>
      {failed ? (
        <ErrorLine>The events did not load. Close this and try again.</ErrorLine>
      ) : events === null ? (
        <Skeleton rows={2} label="Loading the events" />
      ) : events.length === 0 ? (
        <p className="text-[0.84375rem] text-muted">
          We hold no entries for {teamName} at another event.
        </p>
      ) : (
        <div role="radiogroup" aria-label="Events" className="flex flex-col gap-2">
          {events.map((e) => {
            const on = e.id === picked;
            return (
              <button
                key={e.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPicked(e.id)}
                className={cn(
                  'hover-veil motion-safe:transition flex min-h-[58px] w-full items-center gap-2.5 rounded-[10px] border bg-surface px-3 py-2 text-start',
                  on
                    ? 'border-2 border-accent bg-accent-tint px-[11px] py-[7px]'
                    : 'border-control-border',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-5 shrink-0 rounded-full border-2',
                    on ? 'border-[6px] border-accent bg-surface' : 'border-control-border',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <b dir="auto" className="block text-[0.90625rem] font-[650] text-ink">
                    {e.name}
                  </b>
                  <small className="text-xs text-muted">
                    {plural(e.entry_count, 'entry', 'entries')}
                    {e.last_entry_at ? ` · ${monthYear(e.last_entry_at)}` : ''}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </ResponsiveDialog>
  );
}
