import { useState, type FormEvent } from 'react';
import { MATCH_BULK_MAX, MATCH_NUMBER_MAX, type MatchRow, type MatchType } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { MATCH_TYPE_LABEL, MATCH_TYPE_OPTIONS, nextNumber } from './matchOps';
import type { MatchEditing } from './useMatchEditing';

/**
 * The Matches tab's one toolbar (README "One toolbar"): the match type, which drives both
 * create actions (as today), a count with Create matches, and a number with Create match
 * (left empty, the next free number — the field's placeholder).
 */
export function MatchesToolbar({
  matches,
  editing,
}: {
  matches: readonly MatchRow[];
  editing: MatchEditing;
}) {
  const [type, setType] = useState<MatchType>('qualification');
  const [count, setCount] = useState('');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState<'many' | 'one' | null>(null);
  const typeWord = MATCH_TYPE_LABEL[type].toLowerCase();

  async function submit(e: FormEvent, which: 'many' | 'one') {
    e.preventDefault();
    setBusy(which);
    // An empty number field means the next free one, which its placeholder shows.
    const ok =
      which === 'many'
        ? await editing.createMany(type, count)
        : await editing.createOne(type, number.trim() || String(nextNumber(matches, type)));
    setBusy(null);
    if (ok && which === 'one') setNumber('');
  }

  const field = 'w-20 font-num';
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-line-2 px-3.5 py-3">
      <Select
        aria-label="Match type"
        value={type}
        wrapperClassName="w-40"
        onChange={(e) => setType(e.target.value as MatchType)}
      >
        {MATCH_TYPE_OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </Select>
      <form
        aria-label={`Bulk create ${typeWord} matches`}
        noValidate
        onSubmit={(e) => void submit(e, 'many')}
        className="flex items-center gap-2"
      >
        <Input
          aria-label={`How many ${typeWord} matches?`}
          type="number"
          inputMode="numeric"
          min={1}
          max={MATCH_BULK_MAX}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          className={field}
        />
        <Button type="submit" variant="primary" busy={busy === 'many'} busyLabel="Creating…">
          Create matches
        </Button>
      </form>
      <form
        aria-label="Create one match"
        noValidate
        onSubmit={(e) => void submit(e, 'one')}
        className="flex items-center gap-2"
      >
        <Input
          aria-label="Match number"
          type="number"
          inputMode="numeric"
          min={1}
          max={MATCH_NUMBER_MAX}
          placeholder={String(nextNumber(matches, type))}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className={field}
        />
        <Button type="submit" busy={busy === 'one'} busyLabel="Creating…">
          Create match
        </Button>
      </form>
    </div>
  );
}
