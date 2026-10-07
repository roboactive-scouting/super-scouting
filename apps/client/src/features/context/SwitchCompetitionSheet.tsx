import { useEffect, useState } from 'react';
import { LIST_EVENTS_MAX_LIMIT, LIST_SEASONS_MAX_LIMIT } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { typedCall as defaultCall, type Rpc } from '@/data/rpc';
import { useOnline } from '@/lib/useOnline';
import { cn } from '@/lib/utils';
import { sessionOverride, useSessionOverride } from './sessionOverride';
import {
  type EventCard,
  latestSettings,
  listAll,
  readCompetitionCache,
  type SeasonCard,
} from './competitions';

export const OFFLINE_CONTEXT_LINE = 'Only the default competition is available offline.';
export const SERVER_SILENT_LINE =
  'The server did not answer, so only the default competition is shown.';

const CHIP =
  "motion-safe:transition relative inline-flex min-h-[34px] items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[0.84375rem] font-semibold after:absolute after:inset-x-0 after:-inset-y-[7px] after:content-[''] disabled:opacity-50";
const CARD =
  'tap-target hover-veil motion-safe:transition flex min-h-14 w-full flex-col items-start justify-center gap-1 rounded-card border border-line bg-surface px-4 py-3 text-start disabled:cursor-not-allowed disabled:opacity-50';

/**
 * SPEC-FINAL 6.3, 17.9; Home README "States": the deliberate way to look at another season
 * or event — a bottom sheet on a phone, a dialog on a computer. Season chips, then that
 * season's events. The cache first (it is all there is offline); the server's lists are
 * asked for only while the sheet is open. Choosing an event sets the session-only override;
 * choosing the default clears it. Offline, only the default can be chosen.
 */
export function SwitchCompetitionSheet({
  open,
  onClose,
  rpc = { call: defaultCall },
}: {
  open: boolean;
  onClose: () => void;
  rpc?: Rpc;
}) {
  const online = useOnline();
  const override = useSessionOverride();
  const [settings, setSettings] = useState<{ season: string | null; event: string | null }>({
    season: null,
    event: null,
  });
  const [seasons, setSeasons] = useState<SeasonCard[]>([]);
  const [events, setEvents] = useState<Record<string, EventCard[]>>({});
  const [chosen, setChosen] = useState<string | null>(null);
  const [silent, setSilent] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void readCompetitionCache().then((cache) => {
      if (!live) return;
      setSettings({ season: cache.seasonId, event: cache.eventId });
      setSeasons((known) => (known.length > 0 ? known : cache.seasons));
      setEvents((known) => ({ ...cache.events, ...known }));
      setChosen((c) => c ?? cache.seasonId);
    });
    return () => {
      live = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !online) return;
    let live = true;
    listAll<SeasonCard>(rpc, 'listSeasons', { limit: LIST_SEASONS_MAX_LIMIT }).then(
      (items) => {
        if (!live) return;
        setSeasons([...items].sort((a, b) => b.year - a.year));
        setSilent(false);
      },
      () => live && setSilent(true),
    );
    return () => {
      live = false;
    };
    // rpc is an injected dependency held stable by the caller; a reconnect re-asks.
  }, [open, online]);

  useEffect(() => {
    if (!open || !online || chosen === null) return;
    let live = true;
    const seasonId = chosen;
    listAll<EventCard>(rpc, 'listEvents', {
      season_id: seasonId,
      limit: LIST_EVENTS_MAX_LIMIT,
    }).then(
      (items) => live && setEvents((known) => ({ ...known, [seasonId]: items })),
      () => live && setSilent(true),
    );
    return () => {
      live = false;
    };
  }, [open, online, chosen]);

  const defaultName =
    Object.values(events)
      .flat()
      .find((e) => e.id === settings.event)?.name ?? 'the default competition';
  const workingOn = override?.eventId ?? settings.event;
  const shown = [...(chosen ? (events[chosen] ?? []) : [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  /** The default is read again at the moment of choosing: an admin may have moved it. */
  async function choose(event: EventCard) {
    const latest = await latestSettings();
    setSettings({ season: latest.seasonId, event: latest.eventId });
    if (event.id === latest.eventId) sessionOverride.clear();
    else sessionOverride.set(event.id, event.name);
    onClose();
  }

  return (
    <ResponsiveDialog
      open={open}
      title="Switch competition"
      onClose={onClose}
      footer={
        <Button className="w-full lg:w-auto" onClick={onClose}>
          Close
        </Button>
      }
    >
      <p dir="auto" className="-mt-2 text-[0.8125rem] text-muted">
        Only for this session. Reopening the app returns to {defaultName}.
      </p>
      {!online ? (
        <p className="text-[0.8125rem] text-muted">{OFFLINE_CONTEXT_LINE}</p>
      ) : (
        silent && <p className="text-[0.8125rem] text-muted">{SERVER_SILENT_LINE}</p>
      )}
      <div role="group" aria-label="Seasons" className="flex flex-wrap gap-1.5">
        {seasons.map((s) => {
          const on = s.id === chosen;
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              disabled={!online && s.id !== settings.season}
              onClick={() => setChosen(s.id)}
              className={cn(
                CHIP,
                on
                  ? 'border-ink bg-ink text-surface'
                  : 'border-control-border bg-surface text-ink-2',
              )}
            >
              <span className="num">{s.year}</span>
              <span dir="auto">
                {s.game_name}
                {s.id === settings.season ? ' · default' : ''}
              </span>
            </button>
          );
        })}
      </div>
      {chosen !== null && shown.length === 0 && (
        <p className="text-muted">
          {online
            ? 'This season has no events yet.'
            : 'This season’s events need a connection to the server.'}
        </p>
      )}
      <ul aria-label="Events" className="flex flex-col gap-2.5">
        {shown.map((e) => {
          const isDefault = e.id === settings.event;
          const current = e.id === workingOn;
          const marker = current
            ? override
              ? 'Current, this session only'
              : 'Current · default'
            : isDefault
              ? 'Default'
              : null;
          return (
            <li key={e.id}>
              <button
                type="button"
                aria-pressed={current}
                disabled={!online && !isDefault}
                onClick={() => void choose(e)}
                className={cn(
                  CARD,
                  current && 'border-2 border-accent bg-accent-tint px-[15px] py-[11px]',
                )}
              >
                <span dir="auto" className="text-[0.9375rem] font-[650]">
                  {e.name}
                </span>
                {marker && (
                  <span
                    className={cn('text-xs font-bold', current ? 'text-accent-ink' : 'text-muted')}
                  >
                    {marker}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </ResponsiveDialog>
  );
}
