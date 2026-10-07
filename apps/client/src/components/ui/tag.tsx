import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDate, type Role } from '@frc/shared';
import type { Station } from '@/data/station';
import { cn } from '@/lib/utils';

/*
 * Tags (THEME "Locked components"): 24 px, 12.5 px / 650, `--radius-tag`. Colour is never the
 * only signal: every status carries a word and a shape. None is red; red is the red alliance.
 */

const TAG =
  'inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-tag px-[9px] text-[12.5px] font-[650]';

const ALLIANCE = {
  red: 'bg-alliance-red-tint text-alliance-red',
  blue: 'bg-alliance-blue-tint text-alliance-blue',
} as const;

/** "Red 1", "Blue 3": the words for a station key. */
export function stationLabel(station: Station): string {
  return `${station[0] === 'R' ? 'Red' : 'Blue'} ${station[1]}`;
}

/** A side of the field: alliance tint, alliance colour text. */
export function AllianceTag({
  alliance,
  children,
}: {
  alliance: 'red' | 'blue';
  children: ReactNode;
}) {
  return <span className={cn(TAG, ALLIANCE[alliance])}>{children}</span>;
}

/** One of the six driver stations, in words: "Red 1". 22 px, in the alliance tint. */
export function StationTag({ station }: { station: Station }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center whitespace-nowrap rounded-tag px-[7px] text-xs font-[650]',
        ALLIANCE[station[0] === 'R' ? 'red' : 'blue'],
      )}
    >
      {stationLabel(station)}
    </span>
  );
}

type RobotStatus = 'played' | 'broke_down' | 'disabled' | 'no_show';

const STATUS: Record<RobotStatus, { label: string; tag: string; mark: ReactNode }> = {
  played: {
    label: 'Played',
    tag: 'bg-line-2 text-ink-2',
    mark: <span className="size-[7px] rounded-full bg-accent" />,
  },
  broke_down: {
    label: 'Broke down',
    tag: 'bg-warn-tint text-warn',
    mark: <span className="size-[7px] rotate-45 bg-warn" />,
  },
  disabled: {
    label: 'Disabled',
    tag: 'bg-surface text-warn ring-1 ring-inset ring-warn',
    mark: <span className="size-1.5 border-[1.5px] border-warn" />,
  },
  no_show: {
    label: 'No show',
    tag: 'bg-surface text-ink-2 ring-1 ring-inset ring-control-border',
    mark: <span className="font-extrabold leading-none text-muted">—</span>,
  },
};

/** What the robot did: a word and a shape (dot, diamond, hollow square, dash). */
export function RobotStatusTag({ status }: { status: RobotStatus }) {
  const { label, tag, mark } = STATUS[status];
  return (
    <span className={cn(TAG, tag)}>
      <span aria-hidden="true" className="inline-flex shrink-0 items-center">
        {mark}
      </span>
      {label}
    </span>
  );
}

const ROLE: Record<Role, { label: string; tag: string }> = {
  admin: { label: 'Admin', tag: 'bg-rail text-white' },
  lead: { label: 'Scout lead', tag: 'bg-surface text-ink ring-1 ring-inset ring-control-border' },
  scouter: { label: 'Scouter', tag: 'bg-line-2 text-ink-2' },
};

export function RoleTag({ role }: { role: Role }) {
  const { label, tag } = ROLE[role];
  return <span className={cn(TAG, tag)}>{label}</span>;
}

/** "Active", or "Disabled since 04/03/2026" once an admin has disabled the account. */
export function AccountStatusTag({ disabledAt }: { disabledAt: string | null }) {
  return disabledAt === null ? (
    <span className={cn(TAG, 'bg-accent-tint text-accent-ink')}>Active</span>
  ) : (
    <span className={cn(TAG, 'bg-line-2 text-muted')}>Disabled since {formatDate(disabledAt)}</span>
  );
}

/** A flag on a record that needs a look, e.g. "Not in line-up": `--warn-tint` on `--warn`. */
export function WarningFlag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-tag bg-warn-tint px-[7px] text-xs font-[650] text-warn">
      <TriangleAlert aria-hidden="true" className="size-[13px]" />
      {children}
    </span>
  );
}
