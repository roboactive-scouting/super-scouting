import type { StatsNote } from '@frc/shared';
import { noteTime } from './teamView';

/*
 * The team's notes (SPEC-FINAL 13.1; THEME "Note quote"): the values of its Long-text fields
 * across its entries at the event, NEWEST first (as `buildTeamStats` orders them), each labelled
 * with its match (mono), its field label (bold) and its scouter, the time at the right in mono;
 * then the text as a quote — white, a 3 px `--ink` start edge, `dir="auto"` so Hebrew runs right
 * to left.
 */
export function NotesList({
  notes,
  now = new Date(),
  limit,
}: {
  notes: readonly StatsNote[];
  now?: Date;
  /** Only the newest few (the computer's Stats tab shows the latest notes). */
  limit?: number;
}) {
  const shown = limit === undefined ? notes : notes.slice(0, limit);
  return (
    <ul aria-label="Notes" className="flex flex-col gap-3">
      {shown.map((n) => {
        const match = n.match_label ?? 'Super';
        return (
          <li
            key={`${n.entry_id}:${n.field_key}`}
            aria-label={`Note, ${match}, ${n.field_label}${n.scouter_name ? `, ${n.scouter_name}` : ''}`}
          >
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="num font-semibold text-ink-2">{match}</span>
              <span dir="auto" className="font-[650] text-ink-2">
                {n.field_label}
              </span>
              {n.scouter_name ? <span dir="auto">· {n.scouter_name}</span> : null}
              <span className="flex-1" />
              <span className="num">{noteTime(n.client_updated_at, now)}</span>
            </div>
            <p
              dir="auto"
              className="mt-1.5 whitespace-pre-line rounded-e-[10px] border border-s-[3px] border-line border-s-ink bg-surface px-3 py-[9px] text-sm leading-[1.45] text-ink"
            >
              {n.value}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
