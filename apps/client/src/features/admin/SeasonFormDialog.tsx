import { useId, useState, type FormEvent } from 'react';
import { createSeasonInput, SEASON_IMAGE_MANIFEST, type SeasonRow } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ErrorLine } from '@/components/ui/notice';
import type { Rpc } from '@/data/rpc';
import { FieldImage } from '@/season/FieldImage';
import { DeleteCompetition } from './DeleteCompetition';
import { TextField } from './fields';
import { panelErrorLine } from './adminMessages';

export const IMAGE_PATH_HINT =
  'The image must already be committed to apps/client/public and deployed.';

/**
 * Today's season form (year, game name, image path with the committed-image list and its
 * hint, and a live preview), in a dialog: "+ New season" creates, "Edit season" edits. An
 * edit sends only the fields that changed (SPEC-FINAL 6.4); `field_image_path` may be
 * refused once the season has entries, and that refusal is the use case's own sentence.
 * Editing also offers "Delete …" (RB.20) when the page passes `onDeleted`.
 */
export function SeasonFormDialog({
  open,
  season,
  rpc,
  onSaved,
  onClose,
  active = false,
  onDeleted,
}: {
  open: boolean;
  /** `null` creates a season. */
  season: SeasonRow | null;
  rpc: Rpc;
  onSaved: (row: SeasonRow) => void;
  onClose: () => void;
  /** The season being edited is the active one: it cannot be deleted. */
  active?: boolean;
  onDeleted?: (seasonId: string) => void;
}) {
  return (
    <Dialog open={open} title={season ? `Edit ${season.year}` : 'New season'} onClose={onClose}>
      <SeasonForm
        key={season?.id ?? 'new'}
        season={season}
        rpc={rpc}
        onSaved={onSaved}
        onClose={onClose}
      />
      {season && onDeleted && (
        <DeleteCompetition
          key={season.id}
          target={{
            kind: 'season',
            id: season.id,
            name: String(season.year),
            label: `${season.year} — ${season.game_name}`,
            active,
          }}
          rpc={rpc}
          onDeleted={onDeleted}
        />
      )}
    </Dialog>
  );
}

function check<T>(
  parsed: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } },
) {
  return parsed.success
    ? { ok: true as const, data: parsed.data }
    : { ok: false as const, line: parsed.error.issues[0]?.message ?? 'that is not valid' };
}

function SeasonForm({
  season,
  rpc,
  onSaved,
  onClose,
}: {
  season: SeasonRow | null;
  rpc: Rpc;
  onSaved: (row: SeasonRow) => void;
  onClose: () => void;
}) {
  const errorId = useId();
  const yearId = useId();
  const pathId = useId();
  const listId = useId();
  const [year, setYear] = useState(season ? String(season.year) : '');
  const [gameName, setGameName] = useState(season?.game_name ?? '');
  const [imagePath, setImagePath] = useState(season?.field_image_path ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function payload(): { ok: true; data: unknown } | { ok: false; line: string } {
    const shape = createSeasonInput.shape;
    if (!season) {
      return check(
        createSeasonInput.safeParse({
          year: Number(year),
          game_name: gameName,
          field_image_path: imagePath,
        }),
      );
    }
    // Only the changed fields go out, each checked with the create schema's own rule.
    // `season.id` is an internal row id, checked in full by the default `call()`.
    const patch: Record<string, unknown> = { season_id: season.id };
    const changes: Array<[string, boolean, () => ReturnType<typeof check>]> = [
      ['year', Number(year) !== season.year, () => check(shape.year.safeParse(Number(year)))],
      [
        'game_name',
        gameName !== season.game_name,
        () => check(shape.game_name.safeParse(gameName)),
      ],
      [
        'field_image_path',
        imagePath !== season.field_image_path,
        () => check(shape.field_image_path.safeParse(imagePath)),
      ],
    ];
    for (const [key, changed, run] of changes) {
      if (!changed) continue;
      const checked = run();
      if (!checked.ok) return checked;
      patch[key] = checked.data;
    }
    if (Object.keys(patch).length === 1)
      return { ok: false, line: 'Change something before saving.' };
    return { ok: true, data: patch };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const checked = payload();
    if (!checked.ok) {
      setError(checked.line);
      return;
    }
    setBusy(true);
    try {
      const row = (await rpc.call(
        season ? 'updateSeason' : 'createSeason',
        checked.data,
      )) as SeasonRow;
      onSaved(row);
    } catch (err) {
      setError(panelErrorLine(err));
    } finally {
      setBusy(false);
    }
  }

  const invalid = error ? errorId : undefined;
  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col">
      <label htmlFor={yearId} className="block text-sm font-semibold">
        Year
      </label>
      <Input
        id={yearId}
        mono
        type="number"
        inputMode="numeric"
        value={year}
        aria-invalid={!!error || undefined}
        aria-describedby={invalid}
        className="mt-1.5"
        onChange={(e) => setYear(e.target.value)}
      />
      <TextField
        label="Game name"
        value={gameName}
        onChange={setGameName}
        invalid={!!error}
        errorId={errorId}
      />
      <label htmlFor={pathId} className="mt-4 block text-sm font-semibold">
        Game image path
      </label>
      <Input
        id={pathId}
        mono
        type="text"
        list={listId}
        value={imagePath}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-invalid={!!error || undefined}
        aria-describedby={[`${pathId}-hint`, invalid].filter(Boolean).join(' ')}
        className="mt-1.5"
        onChange={(e) => setImagePath(e.target.value)}
      />
      {/* Free text: this year's image may not be committed yet; the list just puts the
          paths that already resolve one click away. */}
      <datalist id={listId}>
        {SEASON_IMAGE_MANIFEST.map((path) => (
          <option key={path} value={path} />
        ))}
      </datalist>
      <p id={`${pathId}-hint`} className="mt-1.5 text-[13px] text-muted">
        {IMAGE_PATH_HINT}
      </p>
      {/* Task 1.23: preview the path as typed, so a typo fails loudly before saving. */}
      {imagePath.trim() !== '' && (
        <div className="mt-3 max-w-[16rem]">
          <FieldImage
            path={imagePath}
            alt={`${gameName || 'season'} field preview`}
            className="h-auto w-full rounded-control"
          />
        </div>
      )}
      {error && (
        <ErrorLine id={errorId} className="mt-4">
          {error}
        </ErrorLine>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" busy={busy} busyLabel="Saving…">
          {season ? 'Save changes' : 'Create season'}
        </Button>
      </div>
    </form>
  );
}
