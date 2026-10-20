import { Eye } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Skeleton } from '@/components/Skeleton';
import { StateMessage } from '@/components/StateMessage';
import { EmptyState } from '@/components/ui/empty-state';
import { SuccessBanner } from '@/components/ui/notice';
import { useDeviceQuery } from '@/data/useDeviceQuery';
import { usePageCrumb, usePageTitle } from '@/lib/pageTitle';
import { PATHS } from '@/lib/paths';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';
import type { Editor } from './localEntries';
import { usePracticeMode } from './practice';
import { loadSuper } from './superData';
import { SuperForm } from './SuperForm';
import { SuperPicker } from './SuperPicker';

/** What a submit hands back to the picker through router state. */
type SuperSaved = { teamLabel: string; edited: boolean };

/**
 * Super scouting (SPEC-FINAL 8.1; 15-super final, variant A), at `/super` and `/super/:teamId`.
 * Reached from the Super scouting card on Scout, never a nav row. A phone shows the picker, then
 * one team's form; a computer shows the picker on the left and the form on the right. Everything
 * comes from what the device holds (`loadSuper`); nothing new is asked of the server.
 */
export function SuperEntryPage({ eventId, author }: { eventId: string; author: Editor }) {
  const { teamId } = useParams<{ teamId?: string }>();
  const desktop = useIsDesktop();
  const practice = usePracticeMode();
  const navigate = useNavigate();
  const saved = (useLocation().state as { superSaved?: SuperSaved } | null)?.superSaved;
  const data = useDeviceQuery(() => loadSuper(eventId, author.id), [eventId, author.id], ['rows']);
  const team = teamId ? data?.teams.find((t) => t.id === teamId) : undefined;
  usePageTitle(!desktop && team ? `Super · ${team.number}` : null);
  usePageCrumb(
    team ? ['Scout', 'Super scouting', `${team.number} ${team.name}`] : ['Scout', 'Super scouting'],
  );

  if (data === undefined) {
    return (
      <div className="px-4 pt-4 lg:px-8 lg:pt-6">
        <Skeleton rows={6} rowHeight="3.5rem" label="Loading the roster" />
      </div>
    );
  }
  if (data.formVersionId === null) {
    return (
      <StateMessage
        variant="form-not-published"
        headingLevel={1}
        title="No super scouting form is published for this season yet"
        detail="An admin publishes one in the form builder. Nothing can be super-scouted until then."
        action={{ label: 'Back to scouting', to: PATHS.scout }}
      />
    );
  }
  if (teamId && !team) {
    return (
      <StateMessage
        variant="no-results"
        headingLevel={1}
        title="This team is not on this competition's roster on this device"
        detail="Pick the team from the list again. If it is still missing, this device may need to sync."
        action={{ label: 'Back to super scouting', to: PATHS.super }}
      />
    );
  }

  const banner = saved && !team && (
    <div role="status" aria-label="Super entry saved" className="mb-4">
      <SuccessBanner
        title={
          <>
            {saved.edited ? 'Changes saved on this device' : 'Super entry saved on this device'}
            <span className="font-normal text-ink-2">
              {' · '}
              <span dir="auto">{saved.teamLabel}</span>
            </span>
          </>
        }
      >
        It is queued to send and stays safe here with no network.
      </SuccessBanner>
    </div>
  );

  const form = team && (
    <SuperForm
      // A new team is a new entry: nothing of the last one's state carries over.
      key={team.id}
      eventId={eventId}
      eventName={data.eventName}
      author={author}
      team={team}
      // The entry's own version; else an unfinished draft's (UF.23); else the published one.
      formVersionId={
        team.entry?.form_version_id ??
        (practice ? undefined : team.draftVersionId) ??
        data.formVersionId
      }
      desktop={desktop}
      onSubmitted={() => {
        const state: { superSaved: SuperSaved } = {
          superSaved: {
            teamLabel: `${team.number} ${team.name}`,
            edited: team.entry !== undefined,
          },
        };
        // Replace, so Back does not reopen a form that has already been saved.
        navigate(PATHS.super, { replace: true, state });
      }}
    />
  );

  // One tree at both widths, the form always in the same place: crossing 1024 px (a tablet
  // turned) redraws the layout but never remounts the form, so its phase and an open sheet stay.
  return (
    <main
      data-pinned-foot={desktop ? undefined : ''}
      className={cn(
        desktop
          ? 'grid max-w-[1320px] grid-cols-[minmax(0,520px)_minmax(0,1fr)] items-start gap-7 px-8 py-6'
          : 'flex flex-1 flex-col',
      )}
    >
      {(desktop || !form) && (
        <div className={desktop ? 'min-w-0' : 'mx-auto w-full max-w-xl px-4 pt-3.5 pb-6'}>
          {banner}
          <SuperPicker
            eventName={data.eventName}
            teams={data.teams}
            selectedId={desktop ? team?.id : undefined}
          />
        </div>
      )}
      {form ??
        (desktop && (
          <EmptyState
            icon={Eye}
            title="Choose a team"
            detail="Pick a team from the list to open its super entry. A team marked Done opens the entry this device already holds."
          />
        ))}
    </main>
  );
}
