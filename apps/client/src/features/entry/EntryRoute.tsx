import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { formatCount } from '@frc/shared';
import { cachedRows } from '@/data/cache';
import { db } from '@/data/db';
import { matchLabel } from '@/lib/matchLabel';
import { EntryPage } from './EntryPage';
import { canSelfEdit, findLocalEntry, type Editor, type LocalEntry } from './localEntries';
import type { SavedNotice } from './SelectRobotPage';

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

  useEffect(() => {
    if (!matchId || !teamId) return;
    setResolved(null);
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
      if (!match || !team) return;
      // SPEC-FINAL 6.3 (task 1.22): an entry belongs to its match's event, and its form to
      // that event's season, read from the cached `events` row (which survives an event
      // wipe). `app_settings` names the CURRENT default's season — after a changed default
      // not this entry's — so it is only the fallback when the device holds no row for the
      // event. No seed-season fallback (task 1.17b).
      const entryEventId = match.event_id ?? eventId;
      const entryEvent = events.find((e) => e.id === entryEventId);
      const seasonId = entryEvent?.season_id ?? appSettings[0]?.active_season_id ?? null;
      const form = forms.find((f) => f.kind === 'match' && f.season_id === seasonId);
      if (!form?.active_version_id) return;
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
        matchLabel: matchLabel(match),
        teamLabel: `${formatCount(team.number)} ${team.name}`,
        existing,
      });
    })();
  }, [eventId, matchId, teamId]);

  if (!matchId || !teamId) {
    return <p className="p-4 text-[var(--text-muted)]">No match selected.</p>;
  }
  if (resolved === null) return <p className="p-4 text-[var(--text-muted)]">Loading…</p>;

  // SPEC-FINAL 6.3: no new entry outside the default competition, whatever URL got here.
  if (resolved.refused) {
    return (
      <main className="mx-auto max-w-xl p-4">
        <h1 className="text-lg font-semibold">
          {resolved.matchLabel} · <span dir="auto">{resolved.teamLabel}</span>
        </h1>
        <p role="alert" dir="auto" className="mt-3 rounded-lg border border-[var(--border)] p-3">
          This match belongs to {resolved.foreignEventName}, which is not the default competition.
          New entries can only be made in {resolved.refused.defaultName}.
        </p>
        <button
          type="button"
          className="tap-target mt-4 w-full rounded-lg border border-[var(--border)]"
          onClick={() => navigate('/')}
        >
          Back to scouting
        </button>
      </main>
    );
  }

  // The picker never offers this, but a stale screen or a typed URL can still get here.
  if (resolved.existing && !canSelfEdit(resolved.existing, author, new Date())) {
    return (
      <main className="mx-auto max-w-xl p-4">
        <h1 className="text-lg font-semibold">
          {resolved.matchLabel} · <span dir="auto">{resolved.teamLabel}</span>
        </h1>
        <p role="alert" className="mt-3 rounded-lg border border-[var(--border)] p-3">
          This robot is already scouted in this match on this device, and the entry is locked — ask
          a lead to change it.
        </p>
        <button
          type="button"
          className="tap-target mt-4 w-full rounded-lg border border-[var(--border)]"
          onClick={() => navigate('/')}
        >
          Back to scouting
        </button>
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
        // SPEC-FINAL 8.1: submit returns to a fresh manual selection. Replace, so Back
        // does not reopen a form that has already been saved.
        const saved: SavedNotice = {
          matchLabel: resolved.matchLabel,
          teamLabel: resolved.teamLabel,
          edited: resolved.existing !== undefined,
        };
        navigate('/', { replace: true, state: { saved } });
      }}
    />
  );
  if (resolved.foreignEventName === null) return page;
  // The entry finishes against the event it started in (task 1.22), and says so.
  return (
    <>
      <p role="status" dir="auto" className="border-b-2 border-[var(--warning)] p-2 text-sm">
        This entry belongs to {resolved.foreignEventName}, which is no longer the default
        competition. It is saved there when you submit.
      </p>
      {page}
    </>
  );
}
