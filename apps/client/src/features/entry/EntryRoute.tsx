import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { formatCount } from '@frc/shared';
import { StateMessage } from '@/components/StateMessage';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { cachedRows } from '@/data/cache';
import { db } from '@/data/db';
import { matchLabel } from '@/lib/matchLabel';
import { EntryPage } from './EntryPage';
import { canSelfEdit, findLocalEntry, type Editor, type LocalEntry } from './localEntries';
import type { SavedNotice } from './SelectRobotPage';
import { PATHS } from '@/lib/paths';

type MatchRow = { id: string; event_id?: string; match_type: string; number: number };
type TeamRow = { id: string; number: number; name: string };
type FormRow = { id: string; kind: string; season_id: string; active_version_id: string | null };
type AppSettingsRow = { active_season_id: string | null };
type EventRow = { id: string; season_id: string; name: string };

type Resolved = {
  /**
   * The entry's event: its MATCH's event, which is not always the shell's (task 1.22). A
   * PWA restores its URL on reload, so after the default moves, an entry begun for a
   * match of the old event can reopen under the new one.
   */
  entryEventId: string;
  /** The match's event's name when it is not the shell's event; null when it is. */
  foreignEventName: string | null;
  /** Set when the match is another event's and nothing was begun for it: refuse. */
  refused: { defaultName: string } | null;
  formVersionId: string;
  match: Pick<MatchRow, 'match_type' | 'number'>;
  matchLabel: string;
  teamLabel: string;
  /** This device's entry for the same (event, match, team), if it has one. */
  existing: LocalEntry | undefined;
};

export function EntryRoute({ eventId, author }: { eventId: string; author: Editor }) {
  const { matchId, teamId } = useParams<{ matchId: string; teamId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const alliance: 'red' | 'blue' = searchParams.get('alliance') === 'blue' ? 'blue' : 'red';
  const [resolved, setResolved] = useState<Resolved | null>(null);
  // Set instead of `resolved` when the resolve effect finds nothing to resolve, so
  // "Loading…" never becomes the permanent state (branch review, phase 1C follow-up).
  const [blocked, setBlocked] = useState<'not-cached' | 'no-form' | null>(null);

  useEffect(() => {
    if (!matchId || !teamId) return;
    setResolved(null);
    setBlocked(null);
    void (async () => {
      const [matches, teams, forms, appSettings, events] = await Promise.all([
        cachedRows<MatchRow>('matches'),
        cachedRows<TeamRow>('teams'),
        cachedRows<FormRow>('forms'),
        cachedRows<AppSettingsRow>('app_settings'),
        cachedRows<EventRow>('events'),
      ]);
      const match = matches.find((m) => m.id === matchId);
      const team = teams.find((t) => t.id === teamId);
      if (!match || !team) {
        setBlocked('not-cached');
        return;
      }
      // SPEC-FINAL 6.3 (task 1.22): an entry belongs to its match's event, and its form to
      // that event's season, read from the cached `events` row (which survives an event
      // wipe). `app_settings` names the CURRENT default's season — after a changed default
      // not this entry's — so it is only the fallback when the device holds no row for the
      // event. No seed-season fallback (task 1.17b).
      const entryEventId = match.event_id ?? eventId;
      const entryEvent = events.find((e) => e.id === entryEventId);
      const seasonId = entryEvent?.season_id ?? appSettings[0]?.active_season_id ?? null;
      const form = forms.find((f) => f.kind === 'match' && f.season_id === seasonId);
      if (!form?.active_version_id) {
        setBlocked('no-form');
        return;
      }
      const existing = await findLocalEntry({
        eventId: entryEventId,
        formKind: 'match',
        matchId,
        teamId,
      });
      // An existing entry is edited under the form version it was recorded with.
      const formVersionId = existing?.form_version_id ?? form.active_version_id;
      const foreign = entryEventId !== eventId;
      // Outside the default, only an entry this device already began is finished: a draft
      // (keyed as EntryPage keys it) or a local entry. Nothing new is ever started there.
      const begun =
        !foreign ||
        existing !== undefined ||
        (await db.drafts.get(`${formVersionId}:${matchId}:${teamId}`)) !== undefined;
      setResolved({
        entryEventId,
        foreignEventName: foreign ? (entryEvent?.name ?? 'another competition') : null,
        refused: begun
          ? null
          : {
              defaultName: events.find((e) => e.id === eventId)?.name ?? 'the default competition',
            },
        formVersionId,
        match,
        matchLabel: matchLabel(match),
        teamLabel: `${formatCount(team.number)} ${team.name}`,
        existing,
      });
    })();
  }, [eventId, matchId, teamId]);

  if (!matchId || !teamId) {
    return <p className="p-4 text-muted">No match selected.</p>;
  }
  if (blocked === 'not-cached') {
    return (
      <StateMessage
        variant="no-results"
        headingLevel={1}
        title="This match or team is not on this device"
        detail="Go back and pick the robot again. If it is still missing, this device may need to sync."
        action={{ label: 'Back to scouting', to: PATHS.scout }}
      />
    );
  }
  if (blocked === 'no-form') {
    return (
      <StateMessage
        variant="form-not-published"
        headingLevel={1}
        title="No scouting form is published for this season yet"
        detail="An admin publishes one in the form builder. Nothing can be recorded for this competition until then."
        action={{ label: 'Back to scouting', to: PATHS.scout }}
      />
    );
  }
  // Plain text, not a Skeleton: a role="status" here would be the first status the
  // other-event notice test finds (EntryRoute.test.tsx), and this lasts milliseconds.
  if (resolved === null) {
    return <p className="mx-auto w-full max-w-xl px-4 pt-6 text-muted">Loading…</p>;
  }

  // SPEC-FINAL 6.3: no new entry outside the default competition, whatever URL got here.
  if (resolved.refused) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 pt-6">
        <h1 className="text-xl font-semibold">
          {resolved.matchLabel} · <span dir="auto">{resolved.teamLabel}</span>
        </h1>
        <Notice role="alert" tone="warning" still className="mt-4">
          This match belongs to {resolved.foreignEventName}, which is not the default competition.
          New entries can only be made in {resolved.refused.defaultName}.
        </Notice>
        <Button
          variant="secondary"
          size="block"
          className="mt-4"
          onClick={() => navigate(PATHS.scout)}
        >
          Back to scouting
        </Button>
      </main>
    );
  }

  // The picker never offers this, but a stale screen or a typed URL can still get here.
  if (resolved.existing && !canSelfEdit(resolved.existing, author, new Date())) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 pt-6">
        <h1 className="text-xl font-semibold">
          {resolved.matchLabel} · <span dir="auto">{resolved.teamLabel}</span>
        </h1>
        <Notice role="alert" tone="warning" still className="mt-4">
          This robot is already scouted in this match on this device, and the entry is locked — ask
          a lead to change it.
        </Notice>
        <Button
          variant="secondary"
          size="block"
          className="mt-4"
          onClick={() => navigate(PATHS.scout)}
        >
          Back to scouting
        </Button>
      </main>
    );
  }

  const page = (
    <EntryPage
      eventId={resolved.entryEventId}
      formVersionId={resolved.formVersionId}
      matchId={matchId}
      teamId={teamId}
      alliance={alliance}
      author={author}
      teamLabel={resolved.teamLabel}
      matchLabel={resolved.matchLabel}
      existing={resolved.existing}
      onSubmitted={() => {
        // SPEC-FINAL 8.1: submit returns to a fresh manual selection, offering the next match
        // after a new entry. Replace, so Back does not reopen a form that has already been saved.
        const saved: SavedNotice = {
          matchType: resolved.match.match_type,
          number: resolved.match.number,
          matchLabel: resolved.matchLabel,
          teamLabel: resolved.teamLabel,
          edited: resolved.existing !== undefined,
        };
        navigate(PATHS.scout, { replace: true, state: { saved } });
      }}
    />
  );
  if (resolved.foreignEventName === null) return page;
  // The entry finishes against the event it started in (task 1.22), and says so.
  return (
    <>
      <Notice
        role="status"
        tone="warning"
        still
        className="rounded-none border-0 border-b border-s-4 px-4"
      >
        This entry belongs to {resolved.foreignEventName}, which is no longer the default
        competition. It is saved there when you submit.
      </Notice>
      {page}
    </>
  );
}
