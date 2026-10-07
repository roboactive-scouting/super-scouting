import { useState } from 'react';
import { clientConfig } from '@/config';
import type { Rpc } from '@/data/rpc';
import { getStation } from '@/data/station';
import { useDeviceQuery } from '@/data/useDeviceQuery';
import { useSyncStatus } from '@/data/syncStatus';
import { canManageEvents } from '@/features/admin/AdminOnly';
import { SwitchCompetitionSheet } from '@/features/context/SwitchCompetitionSheet';
import { useSessionOverride } from '@/features/context/sessionOverride';
import { useEventName } from '@/features/context/useEventName';
import { useShellContext } from '@/features/shell/shellContext';
import { usePageCrumb } from '@/lib/pageTitle';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';
import { CoverageCard } from './CoverageCard';
import { GoToTiles } from './GoToTiles';
import { HomeHeader } from './HomeHeader';
import { HomeNotReady, notReady } from './HomeNotReady';
import { loadHome, versionLine } from './homeData';
import { PhoneTiles, StatTiles } from './StatTiles';

/**
 * `/` (Home README, "B3"): what this device works on, the one thing to do next, what it
 * holds — station, waiting to send, last entry, schedule coverage — and where to go. All
 * from the device: nothing here waits for the network. Only the Switch-competition sheet
 * asks the server, and only once it is opened (through the injectable `rpc`).
 *
 * A NO_HYDRATION route: it says the shell's gate states itself. The Our-team card and Top
 * teams come with ranking (README "What's built when"); until then coverage is full width.
 */
export function HomePage({ rpc }: { rpc?: Rpc }) {
  const { user, expired, eventId, gate } = useShellContext();
  const desktop = useIsDesktop();
  const sync = useSyncStatus();
  const override = useSessionOverride();
  const eventName = useEventName(eventId, gate);
  const [switching, setSwitching] = useState(false);
  const ready = !notReady(gate) && eventId !== null;
  const data = useDeviceQuery(
    () => (ready ? loadHome(eventId, user.id) : Promise.resolve(null)),
    [ready, eventId, user.id],
    ['rows'],
  );
  const station = useDeviceQuery(getStation, [], ['meta']) ?? null;

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
  // Coverage is the default competition's; under an override it would describe the wrong one.
  const cover = !override && <CoverageCard cells={tiles.cells} desktop={desktop} />;

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
          <StatTiles station={station} lastEntry={tiles.lastEntry} sync={sync} />
          {goTo}
          {cover}
        </>
      ) : (
        <>
          <PhoneTiles station={station} lastEntry={tiles.lastEntry} sync={sync} />
          {cover}
          {goTo}
        </>
      )}
      {version}
      <SwitchCompetitionSheet open={switching} onClose={() => setSwitching(false)} rpc={rpc} />
    </main>
  );
}
