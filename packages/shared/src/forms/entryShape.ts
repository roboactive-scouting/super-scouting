import type { RobotStatus } from './types';

export type EntryShape = {
  form_kind: 'match' | 'super';
  match_id: string | null;
  alliance: 'red' | 'blue' | null;
  robot_status: RobotStatus | null;
  breakdown_seconds: number | null;
};

/**
 * The three SPEC-FINAL 3.5 constraints that span form kinds and therefore cannot be
 * database check constraints. Both sides call this: the client before submit, and the
 * server on every pushed operation — a QR-relayed copy never passed through a client.
 */
export function validateEntryShape(row: EntryShape): string[] {
  const issues: string[] = [];

  if (row.form_kind === 'match') {
    if (row.match_id === null) issues.push('a match entry needs a match');
    if (row.alliance === null) issues.push('a match entry needs an alliance');
    if (row.robot_status === null) issues.push('a match entry needs a robot status');
  } else {
    if (row.match_id !== null) issues.push('a super entry has no match');
    if (row.alliance !== null) issues.push('a super entry has no alliance');
    if (row.robot_status !== null) issues.push('a super entry has no robot status');
    if (row.breakdown_seconds !== null) issues.push('a super entry has no breakdown time');
  }

  const brokeDown = row.robot_status === 'broke_down';
  if (brokeDown && row.breakdown_seconds === null) {
    issues.push('a robot that broke down needs its breakdown time in seconds');
  }
  if (!brokeDown && row.breakdown_seconds !== null) {
    issues.push('breakdown time is recorded only when the robot broke down');
  }

  return issues;
}
