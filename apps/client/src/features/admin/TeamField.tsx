import {
  useImperativeHandle,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type Ref,
} from 'react';
import type { RosterRow } from '@frc/shared';
import { SuggestInput } from '@/components/ui/suggest-input';
import { cn } from '@/lib/utils';
import { resolveTyped, rosterSuggestions, type Typed } from './matchOps';
import type { TeamLookup } from './useOffRosterTeams';

/** Lets a parent commit what is typed without waiting for a blur (phone Save changes). */
export type TeamFieldHandle = { commit: () => void };

/** The most roster teams a station lists under what was typed. */
const SHOWN = 6;

/**
 * One typed alliance station (README "Typing in a cell"): the team number in mono with its
 * name under it, roster suggestions while typing, Enter or leaving the field commits. An
 * empty station is dashed; a team that left the roster is a `--warn-tint` cell reading
 * "Not on roster". The parent decides what a commit does (the grid saves it at once; the
 * phone sheet holds it until Save changes).
 *
 * Leaving the field (Tab, a tap elsewhere) with a partial number takes the highlighted
 * suggestion, or the only one. A number that is still unknown is reported as such; with
 * `holdUnknown` (the phone sheet) the field keeps that text, flagged, until it is fixed or
 * Escape puts back the team that was there.
 */
export function TeamField({
  label,
  hideLabel = false,
  teamId,
  teams,
  roster,
  offRoster,
  countLine,
  onCommit,
  onEnter,
  alliance,
  holdUnknown = false,
  handle,
}: {
  label: string;
  hideLabel?: boolean;
  teamId: string | null;
  teams: TeamLookup;
  roster: readonly RosterRow[];
  offRoster: boolean;
  /** Under the typing: "2 matches" (grid) or "2 on the roster" (phone). */
  countLine: (n: number) => string;
  onCommit: (typed: Typed) => void;
  /** Enter committed the field: move on. */
  onEnter?: () => void;
  /** The phone sheet colours the label by alliance. */
  alliance?: 'red' | 'blue';
  /** Keep an unknown number in the field (flagged) instead of putting the team back. */
  holdUnknown?: boolean;
  handle?: Ref<TeamFieldHandle>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const current = teamId ? teams.get(teamId) : undefined;
  const shown = current ? String(current.number) : '';
  const [draft, setDraftState] = useState<string | null>(null);
  // Mirrors `draft` for the blur that a move-on focus() fires before the next render.
  const draftRef = useRef<string | null>(null);
  const setDraft = (next: string | null) => {
    draftRef.current = next;
    setDraftState(next);
  };
  const [rejected, setRejected] = useState(false);
  const suggestions = draft === null ? [] : rosterSuggestions(roster, draft).slice(0, SHOWN);

  function commit(typed: Typed) {
    setRejected(false);
    setDraft(null);
    onCommit(typed);
  }
  /** The suggestion the list highlights (the combobox's active descendant), if any. */
  function highlighted(): RosterRow | undefined {
    const active = box.current
      ?.querySelector('[role="combobox"]')
      ?.getAttribute('aria-activedescendant');
    if (!active || !box.current) return undefined;
    const options = [...box.current.querySelectorAll('[role="option"]')];
    return suggestions[options.findIndex((o) => o.id === active)];
  }
  function commitText() {
    const text = draftRef.current;
    if (text === null) return;
    const picked = highlighted();
    if (picked) return commit({ kind: 'team', teamId: picked.team_id });
    const typed = resolveTyped(text, roster, teamId ? { teamId, number: current?.number } : null);
    if (typed.kind !== 'unknown') return commit(typed);
    const only = rosterSuggestions(roster, text);
    if (only.length === 1 && only[0]) return commit({ kind: 'team', teamId: only[0].team_id });
    if (!holdUnknown) return commit(typed);
    setRejected(true);
    onCommit(typed);
  }

  useImperativeHandle(handle, () => ({ commit: commitText }));

  function onFocus(e: FocusEvent<HTMLDivElement>) {
    if (draftRef.current !== null) return;
    setDraft(shown);
    if (e.target instanceof HTMLInputElement) e.target.select();
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter') {
      // A highlighted suggestion was already picked (and committed) by the input.
      if (!e.defaultPrevented) commitText();
      e.preventDefault();
      onEnter?.();
    } else if (e.key === 'Escape' && !e.defaultPrevented && draftRef.current !== null) {
      setRejected(false);
      setDraft(null);
      // A held unknown number is dropped: the team that was there stands again.
      if (holdUnknown) onCommit(teamId ? { kind: 'team', teamId } : { kind: 'empty' });
    }
  }

  const typing = draft !== null && draft !== shown;
  const empty = !typing && !teamId;
  const warn = rejected || (offRoster && !typing);
  const sub = rejected
    ? 'Not on roster'
    : typing
      ? countLine(suggestions.length)
      : offRoster
        ? 'Not on roster'
        : (current?.name ?? '');

  return (
    <div
      ref={box}
      onFocus={onFocus}
      onBlur={commitText}
      onKeyDown={onKeyDown}
      className={cn(
        'relative [&_input]:pb-3.5 [&_input]:leading-tight [&_input]:font-semibold',
        // The phone sheet's fields are 16 px: iOS Safari zooms the page into a smaller field
        // on focus, and the zoomed sheet is wider than the screen (UF.9).
        alliance ? '[&_input]:text-base' : '[&_input]:text-[0.9375rem]',
        // The desktop grid draws an empty cell dashed on --bg; the phone sheet (alliance-labelled
        // fields) keeps a white solid field showing "—" (07-manage phone final).
        empty && '[&_input]:placeholder:text-muted',
        empty && !alliance && '[&_input:not(:focus)]:border-dashed [&_input:not(:focus)]:bg-bg',
        warn && '[&_input:not(:focus)]:border-2 [&_input]:border-warn [&_input]:bg-warn-tint',
        alliance &&
          '[&_label]:text-[0.6875rem] [&_label]:font-[750] [&_label]:tracking-[0.04em] [&_label]:uppercase',
        alliance === 'red' && '[&_label]:text-alliance-red',
        alliance === 'blue' && '[&_label]:text-alliance-blue',
      )}
    >
      <SuggestInput
        label={label}
        hideLabel={hideLabel}
        value={draft ?? shown}
        onChange={(text) => {
          setRejected(false);
          setDraft(text);
        }}
        suggestions={suggestions}
        inputMode="numeric"
        placeholder={alliance ? '—' : undefined}
        render={(r) => (
          <>
            <b className="num font-semibold">{r.number}</b>
            <span dir="auto">{r.name}</span>
          </>
        )}
        onPick={(r) => commit({ kind: 'team', teamId: r.team_id })}
      />
      {sub && (
        <span
          dir="auto"
          className={cn(
            'pointer-events-none absolute start-3 end-2 bottom-1 truncate text-[0.6875rem] leading-tight',
            warn ? 'font-[650] text-warn' : 'text-muted',
          )}
        >
          {sub}
        </span>
      )}
    </div>
  );
}
