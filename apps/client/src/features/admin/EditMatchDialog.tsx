import { useId, useState, type FormEvent } from 'react';
import { MATCH_NUMBER_MAX, type MatchRow, type MatchType } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorLine } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { matchLabel } from '@/lib/matchLabel';
import { MATCH_TYPE_OPTIONS, matchPatch, type MatchPatch } from './matchOps';

/** ✎ on the desktop grid: correct a match's type and number (today's form, in a Dialog). */
export function EditMatchDialog({
  match,
  error,
  onSave,
  onClose,
}: {
  match: MatchRow;
  error: string | null;
  /** Resolves true when saved. */
  onSave: (patch: MatchPatch) => Promise<boolean>;
  onClose: () => void;
}) {
  const id = useId();
  const [type, setType] = useState<MatchType>(match.match_type);
  const [number, setNumber] = useState(String(match.number));
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const checked = matchPatch(match, type, number);
    if ('error' in checked) return setLocalError(checked.error);
    if (Object.keys(checked.patch).length === 0) {
      return setLocalError('Change something before saving.');
    }
    setBusy(true);
    const saved = await onSave(checked.patch);
    setBusy(false);
    if (saved) onClose();
  }

  const line = localError ?? error;
  return (
    <Dialog
      open
      title={`Edit ${matchLabel(match)}`}
      onClose={onClose}
      dismissible={!busy}
      width={420}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={id} variant="primary" busy={busy} busyLabel="Saving…">
            Save changes
          </Button>
        </>
      }
    >
      <form id={id} noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <div>
          <Label htmlFor={`${id}-type`}>Match type</Label>
          <Select
            id={`${id}-type`}
            value={type}
            wrapperClassName="mt-1.5"
            onChange={(e) => setType(e.target.value as MatchType)}
          >
            {MATCH_TYPE_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`${id}-number`}>Match number</Label>
          <Input
            id={`${id}-number`}
            type="number"
            inputMode="numeric"
            min={1}
            max={MATCH_NUMBER_MAX}
            mono
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className="mt-1.5"
          />
        </div>
        {line && <ErrorLine>{line}</ErrorLine>}
      </form>
    </Dialog>
  );
}
