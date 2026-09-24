import { Fragment, useEffect, useState } from 'react';
import { formatCount, formatDate, formatTime } from '@frc/shared';
import { cachedRows } from '@/data/cache';
import { rejectedRows } from '@/data/outbox';
import { rejectionMessage } from '@/data/rejections';

type Row = {
  id: string;
  match: string;
  team: string;
  status: string;
  scouter: string;
  when: string;
  /** Why the server refused this entry's last push; it is still queued and retried. */
  rejection: string | null;
};

export function EntriesPage({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    void (async () => {
      const [entries, matches, teams, users, rejected] = await Promise.all([
        cachedRows('scouting_entries'),
        cachedRows('matches'),
        cachedRows('teams'),
        cachedRows('users'),
        rejectedRows(),
      ]);
      const rejectionById = new Map(
        rejected.flatMap((s) => (s.rejection ? [[s.row_id, rejectionMessage(s.rejection)]] : [])),
      );
      const matchById = new Map(matches.map((m) => [String(m.id), m]));
      const teamById = new Map(teams.map((t) => [String(t.id), t]));
      const userById = new Map(users.map((u) => [String(u.id), u]));

      setRows(
        entries
          .filter((e) => e.event_id === eventId && e.deleted_at == null)
          .map((e) => ({
            id: String(e.id),
            match: formatCount(Number(matchById.get(String(e.match_id))?.number ?? NaN)),
            team: `${formatCount(Number(teamById.get(String(e.team_id))?.number ?? NaN))} ${
              teamById.get(String(e.team_id))?.name ?? ''
            }`,
            status: String(e.robot_status ?? ''),
            scouter: String(userById.get(String(e.scouter_id))?.full_name ?? ''),
            when: `${formatDate(String(e.client_updated_at))} ${formatTime(String(e.client_updated_at))}`,
            rejection: rejectionById.get(String(e.id)) ?? null,
          }))
          .sort((a, b) => Number(a.match) - Number(b.match)),
      );
    })();
  }, [eventId]);

  if (rows === null) return <p className="p-4 text-[var(--text-muted)]">Loading…</p>;

  if (rows.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-lg font-semibold">No entries yet</p>
        <p className="text-[var(--text-muted)]">
          Entries appear here as soon as a device syncs. Nothing is lost while a device is offline.
        </p>
      </div>
    );
  }

  return (
    <div className="max-h-[70vh] overflow-auto p-4">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[var(--surface)]">
          <tr>
            <th className="p-2 text-right">Match</th>
            <th className="p-2 text-left">Team</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Scouter</th>
            <th className="p-2 text-left">Recorded</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.id}>
              <tr className="border-t border-[var(--border)]">
                <td className="p-2 text-right tabular-nums">{row.match}</td>
                <td className="p-2" dir="auto">
                  {row.team}
                </td>
                <td className="p-2">{row.status}</td>
                <td className="p-2" dir="auto">
                  {row.scouter}
                </td>
                <td className="p-2 tabular-nums">{row.when}</td>
              </tr>
              {row.rejection && (
                <tr>
                  <td colSpan={5} className="px-2 pb-2 text-sm">
                    <span
                      dir="auto"
                      className="block rounded-md border-l-4 border-[var(--warning)] py-1 pl-2"
                    >
                      <span className="font-semibold">Not synced: </span>
                      {row.rejection}
                    </span>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
