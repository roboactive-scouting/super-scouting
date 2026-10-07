import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createTeamInput, type RosterRow, type TeamRow } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SuggestInput } from '@/components/ui/suggest-input';
import type { Rpc } from '@/data/rpc';

/** How long typing must pause before the registry is asked (brief: 200 ms). */
export const SUGGEST_DEBOUNCE_MS = 200;

/**
 * "Add a team to the roster" (07-manage final): one field. Typing asks the registry
 * (`listTeams` with the typed text) and suggests the teams not on the roster yet; a number
 * the registry does not know offers "+ New team {n} — enter its name", which asks for the
 * name and then creates the team and adds it to the roster in one step.
 */
export function RosterAdd({
  rpc,
  roster,
  registry,
  busy,
  onAdd,
  onCreate,
}: {
  rpc: Rpc;
  roster: readonly RosterRow[];
  registry: readonly TeamRow[] | null;
  busy: boolean;
  onAdd: (team: TeamRow) => void;
  /** Resolves true once the team is created and on the roster; false keeps the form. */
  onCreate: (number: number, name: string) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const [found, setFound] = useState<{ query: string; items: TeamRow[] } | null>(null);
  const [newNumber, setNewNumber] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const query = text.trim();

  useEffect(() => {
    if (!query) return;
    let live = true;
    const timer = setTimeout(() => {
      (rpc.call('listTeams', { query }) as Promise<{ items?: TeamRow[] } | undefined>).then(
        (out) => live && setFound({ query, items: out?.items ?? [] }),
        // No suggestions this time; the field still takes a number.
        () => live && setFound({ query, items: [] }),
      );
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, rpc]);

  useEffect(() => {
    if (newNumber !== null) nameRef.current?.focus();
  }, [newNumber]);

  const onRoster = new Set(roster.map((r) => r.team_id));
  const answered = found !== null && found.query === query;
  const suggestions = answered ? found.items.filter((t) => !onRoster.has(t.id)) : [];
  const typed = /^\d{1,5}$/.test(query) ? Number(query) : null;
  const known =
    typed !== null &&
    ((answered && found.items.some((t) => t.number === typed)) ||
      roster.some((r) => r.number === typed) ||
      (registry ?? []).some((t) => t.number === typed));
  const offerNew = answered && typed !== null && typed > 0 && !known;

  function pick(team: TeamRow) {
    if (busy) return; // a save is in flight: a second one would be dropped on revert
    onAdd(team);
    setText('');
  }

  async function submitNew(e: FormEvent) {
    e.preventDefault();
    if (newNumber === null) return;
    const checked = createTeamInput.safeParse({ number: newNumber, name });
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? 'that is not valid');
      return;
    }
    setError(null);
    if (await onCreate(checked.data.number, checked.data.name)) {
      setNewNumber(null);
      setName('');
      setText('');
    }
  }

  return (
    <div className="w-full sm:w-[360px]">
      <SuggestInput<TeamRow>
        label="Add a team to the roster"
        value={text}
        onChange={(value) => {
          setText(value);
          setNewNumber(null);
        }}
        inputMode="numeric"
        placeholder="Team number"
        suggestions={suggestions}
        render={(team) => (
          <>
            <b className="num font-semibold">{team.number}</b>
            <span dir="auto">{team.name}</span>
            <small className="ms-auto text-xs text-muted">in the registry · add</small>
          </>
        )}
        onPick={pick}
        createRow={
          offerNew
            ? {
                label: `+ New team ${typed} — enter its name`,
                onPick: () => !busy && setNewNumber(typed),
              }
            : undefined
        }
      />
      {newNumber !== null && (
        <form
          noValidate
          aria-label={`New team ${newNumber}`}
          onSubmit={(e) => void submitNew(e)}
          className="mt-2 flex flex-wrap items-end gap-2"
        >
          <div className="min-w-0 flex-1">
            <label htmlFor={nameId} className="text-sm font-semibold">
              Team name
            </label>
            <Input
              ref={nameRef}
              id={nameId}
              value={name}
              dir="auto"
              autoComplete="off"
              aria-invalid={!!error || undefined}
              aria-describedby={error ? `${nameId}-error` : undefined}
              className="mt-1.5"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" busy={busy} busyLabel="Adding…">
            Add team
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setNewNumber(null)}>
            Cancel
          </Button>
          {error && (
            <p id={`${nameId}-error`} role="alert" className="w-full text-[0.8125rem] text-warn">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
