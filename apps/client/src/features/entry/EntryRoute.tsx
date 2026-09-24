import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { formatCount } from '@frc/shared';
import { cachedRows } from '@/data/cache';
import { EntryPage } from './EntryPage';
import { canSelfEdit, findLocalEntry, type Editor, type LocalEntry } from './localEntries';
import type { SavedNotice } from './SelectRobotPage';

type MatchRow = { id: string; match_type: string; number: number };
type TeamRow = { id: string; number: number; name: string };
type FormRow = { id: string; kind: string; season_id: string; active_version_id: string | null };
type AppSettingsRow = { active_season_id: string | null };

/**
 * SEED.season from packages/db/src/seed/fixtures.ts — the dev seed's deterministic
 * season id. Used only as a fallback for the same reason App.tsx falls back to
 * SEED.event: nothing has synced into `app_settings` yet.
 */
const FALLBACK_SEASON_ID = '00000000-0000-4000-8000-000000000001';

const MATCH_TYPE_PREFIX: Record<string, string> = {
  qualification: 'Q',
  practice: 'P',
  playoff: 'PO',
};

function matchLabel(match: MatchRow): string {
  const prefix = MATCH_TYPE_PREFIX[match.match_type] ?? match.match_type;
  return `${prefix}${formatCount(match.number)}`;
}

type Resolved = {
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
      const [matches, teams, forms, appSettings] = await Promise.all([
        cachedRows<MatchRow>('matches'),
        cachedRows<TeamRow>('teams'),
        cachedRows<FormRow>('forms'),
        cachedRows<AppSettingsRow>('app_settings'),
      ]);
      const match = matches.find((m) => m.id === matchId);
      const team = teams.find((t) => t.id === teamId);
      const seasonId = appSettings[0]?.active_season_id ?? FALLBACK_SEASON_ID;
      const form = forms.find((f) => f.kind === 'match' && f.season_id === seasonId);
      if (!match || !team || !form?.active_version_id) return;
      const existing = await findLocalEntry({ eventId, formKind: 'match', matchId, teamId });
      setResolved({
        // An existing entry is edited under the form version it was recorded with.
        formVersionId: existing?.form_version_id ?? form.active_version_id,
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

  return (
    <EntryPage
      eventId={eventId}
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
}
