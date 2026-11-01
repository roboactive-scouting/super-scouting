import { matchLabel } from '@frc/shared';

/**
 * The entry search's matching rules (SPEC-FINAL 13.3, task 1.50), ONE copy for both stores: the
 * Supabase store resolves a query to the team, match and scouter ids it names among the event's
 * entries and filters by them in SQL; the in-memory store applies the same predicates to its
 * rows. Every comparison is case-insensitive and literal — no character is a wildcard.
 */
export type EntrySearch = { text: string };

/** A trimmed, lower-cased query; null when blank (no filter at all). */
export function entrySearch(query: string | undefined): EntrySearch | null {
  const text = query?.trim().toLowerCase();
  return text ? { text } : null;
}

/** A team whose name holds the query, or whose number starts with it (as listTeams). */
export function teamMatches(team: { number: number; name: string }, q: EntrySearch): boolean {
  return (
    team.name.toLowerCase().includes(q.text) ||
    (/^\d+$/.test(q.text) && String(team.number).startsWith(q.text))
  );
}

/**
 * A match whose number IS the query ("3" is match 3 of any type, never 13 or 30), or whose
 * label is it ("q3", "po1" — the label the device shows, `matchLabel`).
 */
export function matchMatches(
  match: { match_type: string; number: number },
  q: EntrySearch,
): boolean {
  if (/^\d+$/.test(q.text)) return match.number === Number(q.text);
  return matchLabel(match).toLowerCase() === q.text;
}

/** A scouter whose full name holds the query. */
export function scouterMatches(fullName: string | null | undefined, q: EntrySearch): boolean {
  return typeof fullName === 'string' && fullName.toLowerCase().includes(q.text);
}
