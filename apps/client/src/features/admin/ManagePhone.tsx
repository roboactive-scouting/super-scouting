import { StateMessage } from '@/components/StateMessage';
import { adminRpc, type Rpc } from '@/data/rpc';
import { useSignedInUser } from '@/features/shell/shellContext';
import { PATHS } from '@/lib/paths';
import { useOnline } from '@/lib/useOnline';
import { canManageEvents } from './AdminOnly';
import { COMPUTER_LINE } from './matchOps';
import { PhoneMatchList } from './PhoneMatchList';
import { usePhoneMatches } from './usePhoneMatches';

/**
 * Manage on a phone (README "Phone (< 1024 px): matches only"; SPEC-FINAL 17.2's third
 * any-width exception): the default event's match list, editing one match, adding matches,
 * and the delete confirmation. The role gate and the offline states are ManagePage's.
 */
export function ManagePhone({ rpc = adminRpc }: { rpc?: Rpc }) {
  const allowed = canManageEvents(useSignedInUser());
  const online = useOnline();
  const data = usePhoneMatches(rpc, allowed && online);

  if (!allowed) {
    return (
      <StateMessage
        variant="not-permitted"
        headingLevel={1}
        title="Only an admin can manage seasons and events"
        detail="Seasons, events, rosters and matches are managed by an admin. Ask one if something needs to change."
        action={{ label: 'Back to scouting', to: PATHS.scout }}
      />
    );
  }
  const { load } = data;
  if (load.status === 'unreachable' || (!online && load.status !== 'ready')) {
    return (
      <StateMessage
        variant="offline-needs-server"
        headingLevel={1}
        detail="Managing seasons, events, rosters and matches needs a connection. This page loads by itself when the connection returns."
        action={
          online
            ? { label: 'Try again', onClick: data.retry }
            : { label: 'Back to scouting', to: PATHS.scout }
        }
      />
    );
  }
  if (load.status === 'failed') {
    return (
      <StateMessage
        variant="failed"
        headingLevel={1}
        title="Matches did not load"
        detail={load.line}
        action={{ label: 'Try again', onClick: data.retry }}
      />
    );
  }
  if (load.status === 'no-event') {
    return (
      <StateMessage
        variant="no-data"
        headingLevel={1}
        title="Create an event first"
        detail={COMPUTER_LINE}
        action={{ label: 'Back to scouting', to: PATHS.scout }}
      />
    );
  }
  if (load.status === 'loading') {
    return <p className="px-4 py-6 text-muted">Loading the matches…</p>;
  }
  return (
    <PhoneMatchList
      rpc={rpc}
      eventId={load.eventId}
      eventName={load.eventName}
      online={online}
      data={data}
    />
  );
}
