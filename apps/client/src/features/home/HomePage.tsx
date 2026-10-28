import { useState } from 'react';
import { clientConfig } from '@/config';
import type { Rpc } from '@/data/rpc';
import { getStation, setStation } from '@/data/station';
import { useDeviceQuery } from '@/data/useDeviceQuery';
import { useSyncStatus } from '@/data/syncStatus';
import { canManageEvents } from '@/features/admin/AdminOnly';
import { SwitchCompetitionSheet } from '@/features/context/SwitchCompetitionSheet';
import { StationSheet } from '@/features/entry/StationSheet';
import { useSessionOverride } from '@/features/context/sessionOverride';
import { useEventName } from '@/features/context/useEventName';
import { useRanking, useRankingBefore } from '@/features/ranking/useRanking';
import { useShellContext } from '@/features/shell/shellContext';
import { OUR_TEAM_NUMBER } from '@/lib/ourTeam';
import { usePageCrumb } from '@/lib/pageTitle';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';
import { CoverageCard } from './CoverageCard';
import { GoToTiles } from './GoToTiles';
import { HomeHeader } from './HomeHeader';
import { HomeNotReady, notReady } from './HomeNotReady';
import { loadHome, moveMatchOf, ourTeamOf, topTeamsOf, versionLine } from './homeData';
import { OurTeamCard } from './OurTeamCard';
import { PhoneTiles, StatTiles } from './StatTiles';
import { TopTeamsCard } from './TopTeamsCard';

/**
 * `/` (Home README, "B3"): what this device works on, the one thing to do next, what it
 * holds — station, waiting to send, last entry, schedule coverage — and where to go. All
 * from the device: nothing here waits for the network. Only the Switch-competition sheet
 * asks the server, and only once it is opened (through the injectable `rpc`).
 *
 * A NO_HYDRATION route: it says the shell's gate states itself. The Our-team card and Top teams
 * (task 1.58b) read the ranking page's own source (`useRanking`: `rankTeams` online, the device's
 * `buildRankTable` offline), and the move reads the same source's ranking before our last match
 * (`useRankingBefore`), so Home and /ranking never disagree. Each is hidden while there is
 * nothing to show (our team not ranked / nothing ranked): then the desktop row keeps three tiles
 * and coverage the full width, as before ranking.
 */
export function HomePage({ rpc }: { rpc?: Rpc }) {
  const { user, expired, eventId, gate } = useShellContext();
  const desktop = useIsDesktop();
  const sync = useSyncStatus();
  const override = useSessionOverride();
  const eventName = useEventName(eventId, gate);
  const [switching, setSwitching] = useState(false);
  const [picking, setPicking] = useState(false);
  const ready = !notReady(gate) && eventId !== null;
  const data = useDeviceQuery(
    () => (ready ? loadHome(eventId, user.id) : Promise.resolve(null)),
    [ready, eventId, user.id],
    ['rows'],
  );
  const station = useDeviceQuery(getStation, [], ['meta']) ?? null;
  // The ranking hooks run before the event is ready too (hooks stay unconditional); their rows
  // are only read once it is.
  const ranking = useRanking(eventId, rpc);
  const rows = ready && ranking.status === 'ready' ? ranking.rows : [];
  const ourRow = rows.find((r) => r.number === OUR_TEAM_NUMBER);
  const before = useRankingBefore(ranking, ready ? moveMatchOf(ourRow) : null, rpc);

  // The desktop crumb: "2026 / District #3 · Tel Aviv". The phone title is unaffected.
  const crumb =
    !override && data?.seasonYear != null && eventName
      ? [String(data.seasonYear), eventName]
      : null;
  usePageCrumb(crumb);

  const version = (
    <footer className="pt-[18px] pb-2 text-center text-xs text-muted">
      {versionLine(clientConfig().appVersion, clientConfig().builtAt ?? '', desktop)}
    </footer>
  );
  const page = cn('w-full', desktop ? 'max-w-[70rem] px-8 pt-[22px] pb-6' : 'px-4 py-3.5');

  if (!ready) {
    return (
      <main className={page}>
        <HomeNotReady
          gate={notReady(gate) ? gate : 'resolving'}
          admin={!expired && canManageEvents(user)}
        />
        {version}
      </main>
    );
  }

  const tiles = data ?? { lastEntry: null, cells: [], seasonYear: null };
  const name = eventName ?? 'this competition';
  const goTo = <GoToTiles user={user} expired={expired} desktop={desktop} />;
  const pick = () => setPicking(true);
  // Coverage is the default competition's; under an override it would describe the wrong one.
  const cover = !override && <CoverageCard cells={tiles.cells} desktop={desktop} />;
  const us = ourTeamOf(rows, OUR_TEAM_NUMBER, before);
  const ourCard = us && <OurTeamCard team={us} desktop={desktop} />;
  const top = topTeamsOf(rows);
  const topCard = top.length > 0 && (
    <TopTeamsCard rows={top} ourTeam={OUR_TEAM_NUMBER} desktop={desktop} />
  );

  return (
    <main aria-labelledby="home-title" className={cn(page, 'motion-safe:animate-rise-in')}>
      <HomeHeader
        name={name}
        override={override}
        desktop={desktop}
        onSwitch={() => setSwitching(true)}
      />
      {desktop ? (
        <>
          <StatTiles
            station={station}
            onStation={pick}
            lastEntry={tiles.lastEntry}
            sync={sync}
            ourTeam={ourCard}
          />
          {goTo}
          {cover && topCard ? (
            // 03-home final: coverage 1.3fr beside Top teams 1fr. Coverage keeps its own top
            // margin when alone; side by side the row carries it.
            <div className="mt-4 grid grid-cols-[1.3fr_1fr] items-stretch gap-4 [&>section]:mt-0">
              {cover}
              {topCard}
            </div>
          ) : (
            cover || (topCard && <div className="mt-4">{topCard}</div>)
          )}
        </>
      ) : (
        <>
          <PhoneTiles station={station} onStation={pick} lastEntry={tiles.lastEntry} sync={sync} />
          {ourCard}
          {cover}
          {topCard}
          {goTo}
        </>
      )}
      {version}
      <SwitchCompetitionSheet open={switching} onClose={() => setSwitching(false)} rpc={rpc} />
      {/* Scout's own picker, saved the same way (SPEC-FINAL v1.17 17.9). */}
      <StationSheet
        open={picking}
        current={station}
        onClose={() => setPicking(false)}
        onUse={(s) => {
          setPicking(false);
          void setStation(s);
        }}
      />
    </main>
  );
}
