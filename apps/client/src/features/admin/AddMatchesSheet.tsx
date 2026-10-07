import { useId, useState, type FormEvent } from 'react';
import { MATCH_BULK_MAX, MATCH_NUMBER_MAX, type MatchRow, type MatchType } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorLine } from '@/components/ui/notice';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { MATCH_TYPE_LABEL, MATCH_TYPE_OPTIONS, nextNumber } from './matchOps';

const SECTION = 'mt-3 mb-1.5 block text-xs font-[650] text-muted';

/**
 * The phone's "Add matches" sheet (README): the type, then either how many with
 * "Create N matches", or one match by number with "Create match" (left empty, the next
 * free number — the field's placeholder, as on the desktop toolbar).
 */
export function AddMatchesSheet({
  matches,
  initialType,
  error,
  onCreateMany,
  onCreateOne,
  onClose,
}: {
  matches: readonly MatchRow[];
  initialType: MatchType;
  error: string | null;
  /** Each resolves true when created; the sheet then closes. */
  onCreateMany: (type: MatchType, count: string) => Promise<boolean>;
  onCreateOne: (type: MatchType, number: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const id = useId();
  const [type, setType] = useState<MatchType>(initialType);
  const [count, setCount] = useState('');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState<'many' | 'one' | null>(null);
  const typeWord = MATCH_TYPE_LABEL[type].toLowerCase();
  const next = String(nextNumber(matches, type));
  const n = Number(count);
  const createLabel =
    count && Number.isInteger(n) && n > 0
      ? `Create ${n} ${n === 1 ? 'match' : 'matches'}`
      : 'Create matches';

  async function submit(e: FormEvent, which: 'many' | 'one') {
    e.preventDefault();
    setBusy(which);
    const ok =
      which === 'many'
        ? await onCreateMany(type, count)
        : await onCreateOne(type, number.trim() || next);
    setBusy(null);
    if (ok) onClose();
  }

  return (
    <Sheet open side="bottom" title="Add matches" onClose={onClose} dismissible={busy === null}>
      <span className={SECTION}>Match type</span>
      <Segmented label="Match type" options={MATCH_TYPE_OPTIONS} value={type} onChange={setType} />
      <form noValidate onSubmit={(e) => void submit(e, 'many')}>
        <label htmlFor={`${id}-count`} className={SECTION}>
          {`How many ${typeWord} matches?`}
        </label>
        <Input
          id={`${id}-count`}
          type="number"
          inputMode="numeric"
          min={1}
          max={MATCH_BULK_MAX}
          mono
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
        <Button
          type="submit"
          variant="primary"
          size="block"
          className="mt-3.5"
          busy={busy === 'many'}
          busyLabel="Creating…"
        >
          {createLabel}
        </Button>
      </form>
      <p className="mt-3.5 flex items-center gap-2.5 text-xs text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
        or one match
      </p>
      <form noValidate onSubmit={(e) => void submit(e, 'one')} className="mt-2.5 mb-4 flex gap-2">
        <Input
          aria-label="Match number"
          placeholder={next}
          type="number"
          inputMode="numeric"
          min={1}
          max={MATCH_NUMBER_MAX}
          mono
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" busy={busy === 'one'} busyLabel="Creating…">
          Create match
        </Button>
      </form>
      {error && <ErrorLine className="mb-4">{error}</ErrorLine>}
    </Sheet>
  );
}
