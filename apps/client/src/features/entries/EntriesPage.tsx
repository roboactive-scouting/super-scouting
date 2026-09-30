import { Fragment, useEffect, useState } from 'react';
import { formatCount, formatDate, formatTime } from '@frc/shared';
import { cachedRows } from '@/data/cache';
import { rejectedRows } from '@/data/outbox';
import { rejectionMessage } from '@/data/rejections';
import { Skeleton } from '@/components/Skeleton';
import { StateMessage } from '@/components/StateMessage';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PATHS } from '@/lib/paths';

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

const STATUS_TONE: Record<string, BadgeTone> = {
  played: 'played',
  broke_down: 'broke_down',
  disabled: 'disabled',
  no_show: 'no_show',
};

const TITLE = 'Entries';
const DESCRIPTION = 'Everything this device holds for the current competition, by match.';

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

  if (rows === null) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <div className="mt-6">
          <Skeleton rows={6} label="Loading the entries" />
        </div>
      </main>
    );
  }

  if (rows.length === 0) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <StateMessage
          variant="no-data"
          title="No entries yet"
          detail="Entries appear here as soon as a device syncs. Nothing is lost while a device is offline."
          action={{ label: 'Scout a match', to: PATHS.scout }}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8">
      <PageHeader title={TITLE} description={DESCRIPTION} />
      <Table containerClassName="mt-6 max-h-[70vh] overflow-auto rounded-xl border border-border bg-surface">
        <TableHeader sticky>
          <TableRow>
            <TableHead numeric>Match</TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Scouter</TableHead>
            <TableHead>Recorded</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <Fragment key={row.id}>
              <TableRow className={row.rejection ? 'border-b-0' : undefined}>
                <TableCell numeric>{row.match}</TableCell>
                <TableCell dir="auto">{row.team}</TableCell>
                <TableCell>
                  {row.status && (
                    <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>{row.status}</Badge>
                  )}
                </TableCell>
                <TableCell dir="auto">{row.scouter}</TableCell>
                <TableCell className="tabular-nums">{row.when}</TableCell>
              </TableRow>
              {row.rejection && (
                <TableRow>
                  <TableCell colSpan={5} className="pt-0">
                    <Notice tone="warning" still>
                      <span className="font-semibold">Not synced: </span>
                      {row.rejection}
                    </Notice>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </main>
  );
}
