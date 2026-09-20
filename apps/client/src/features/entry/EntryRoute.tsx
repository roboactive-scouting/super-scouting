import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { formatCount } from '@frc/shared';
import { cachedRows } from '@/data/cache';
import { EntryPage } from './EntryPage';

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

type Resolved = { formVersionId: string; matchLabel: string; teamLabel: string };

export function EntryRoute({ eventId, authorUserId }: { eventId: string; authorUserId: string }) {
  const { matchId, teamId } = useParams<{ matchId: string; teamId: string }>();
  const [searchParams] = useSearchParams();
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
      setResolved({
        formVersionId: form.active_version_id,
        matchLabel: matchLabel(match),
        teamLabel: `${formatCount(team.number)} ${team.name}`,
      });
    })();
  }, [matchId, teamId]);

  if (!matchId || !teamId) {
    return <p className="p-4 text-[var(--text-muted)]">No match selected.</p>;
  }
  if (resolved === null) return <p className="p-4 text-[var(--text-muted)]">Loading…</p>;

  return (
    <EntryPage
      eventId={eventId}
      formVersionId={resolved.formVersionId}
      matchId={matchId}
      teamId={teamId}
      alliance={alliance}
      authorUserId={authorUserId}
      teamLabel={resolved.teamLabel}
      matchLabel={resolved.matchLabel}
    />
  );
}
