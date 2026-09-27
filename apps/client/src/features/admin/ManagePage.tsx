import { useCallback, useEffect, useId, useState } from 'react';
import type { SeasonRow } from '@frc/shared';
import { FIELD } from '@/components/buttonStyles';
import { StateMessage } from '@/components/StateMessage';
import { typedCall as defaultCall, type Rpc } from '@/data/rpc';
import { useSignedInUser } from '@/features/shell/shellContext';
import { canManageEvents } from './AdminOnly';
import { EventsPanel } from './EventsPanel';
import { SeasonsPanel } from './SeasonsPanel';

/**
 * SPEC-FINAL 6.2–6.4 (task 1.20): season and event management, at `/admin/manage`.
 * Desktop-only and `NO_HYDRATION` are the route's job (routes.tsx, matching the Users
 * routes) — this page only checks the role, exactly as `AdminOnly` does for Users, but
 * against `manage_events` rather than `manage_users`, so it does not reuse that component.
 *
 * Two tabs ship with this task; task 1.21 adds "Teams & roster" and "Matches" beside them.
 */
type TabKey = 'seasons' | 'events';

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'seasons', label: 'Seasons' },
  { key: 'events', label: 'Events' },
  // Task 1.21 adds: { key: 'roster', label: 'Teams & roster' },
  // Task 1.21 adds: { key: 'matches', label: 'Matches' },
];

export function ManagePage({ rpc = { call: defaultCall } }: { rpc?: Rpc }) {
  const user = useSignedInUser();
  const allowed = canManageEvents(user);
  const [tab, setTab] = useState<TabKey>('seasons');
  const [seasons, setSeasons] = useState<SeasonRow[] | null>(null);
  // The season the Events tab manages: the active season if one is set, else the newest,
  // else none. Chosen once seasons are known, then left to the admin's own selection.
  const [managedSeasonId, setManagedSeasonId] = useState<string | null>(null);

  // Re-run after a create, edit or "make active" on the Seasons tab, and once on mount
  // (task 1.20 review): otherwise an admin who creates a season on an empty install and
  // switches to Events still sees "Create a season first" until a reload.
  const refreshSeasons = useCallback(
    (live: () => boolean) => {
      Promise.all([rpc.call('listSeasons', {}), rpc.call('getActiveContext', {})]).then(
        ([seasonsOut, contextOut]) => {
          if (!live()) return;
          const items = (seasonsOut as { items: SeasonRow[] }).items;
          const sorted = [...items].sort((a, b) => b.year - a.year);
          const activeSeasonId = (contextOut as { active_season_id: string | null })
            .active_season_id;
          setSeasons(sorted);
          setManagedSeasonId((prev) => prev ?? activeSeasonId ?? sorted[0]?.id ?? null);
        },
        () => {
          if (live()) setSeasons([]);
        },
      );
    },
    // rpc is an injected dependency held stable by the caller.
    [],
  );

  useEffect(() => {
    // A non-admin makes no request at all (common.md): nothing to gate here either.
    if (!allowed) return;
    let live = true;
    refreshSeasons(() => live);
    return () => {
      live = false;
    };
  }, [allowed, refreshSeasons]);

  if (!allowed) {
    return (
      <StateMessage
        variant="not-permitted"
        headingLevel={1}
        title="Only an admin can manage seasons and events"
        detail="Seasons, events, rosters and matches are managed by an admin. Ask one if something needs to change."
        action={{ label: 'Back to scouting', to: '/' }}
      />
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-6">
      <h1 className="text-xl font-semibold">Season and event management</h1>
      <div
        role="tablist"
        aria-label="Manage"
        className="tap-row mt-4 flex flex-wrap gap-1 border-b border-[var(--border)]"
      >
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`tap-target px-4 ${
              tab === key
                ? 'border-b-2 border-[var(--brand-plate)] font-semibold'
                : 'text-[var(--text-muted)]'
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === 'seasons' && (
          <SeasonsPanel rpc={rpc} onChanged={() => refreshSeasons(() => true)} />
        )}
        {tab === 'events' &&
          (managedSeasonId ? (
            <>
              {seasons && seasons.length > 1 && (
                <SeasonSelect
                  seasons={seasons}
                  value={managedSeasonId}
                  onChange={setManagedSeasonId}
                />
              )}
              <EventsPanel seasonId={managedSeasonId} rpc={rpc} />
            </>
          ) : (
            <StateMessage
              variant="no-data"
              title="Create a season first"
              detail="Events belong to a season. Add one on the Seasons tab, then come back here."
              action={{ label: 'Seasons', onClick: () => setTab('seasons') }}
            />
          ))}
      </div>
    </main>
  );
}

/**
 * Which season's events this screen manages — a plain management selector, not the
 * context switcher (SPEC-FINAL 6.3's no-dropdown rule is for the context page). Choosing
 * a season here changes nothing on the server.
 */
function SeasonSelect({
  seasons,
  value,
  onChange,
}: {
  seasons: SeasonRow[];
  value: string;
  onChange: (seasonId: string) => void;
}) {
  const id = useId();
  return (
    <div className="mb-4 max-w-xs">
      <label htmlFor={id} className="block text-sm font-medium">
        Season
      </label>
      <select
        id={id}
        value={value}
        className={`${FIELD} mt-1`}
        onChange={(e) => onChange(e.target.value)}
      >
        {seasons.map((season) => (
          <option key={season.id} value={season.id} dir="auto">
            {season.year} — {season.game_name}
          </option>
        ))}
      </select>
    </div>
  );
}
