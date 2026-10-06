import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { createSeasonInput, SEASON_IMAGE_MANIFEST, type SeasonRow } from '@frc/shared';
import { FIELD, PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/buttonStyles';
import { StateMessage } from '@/components/StateMessage';
import { adminRpc, type Rpc } from '@/data/rpc';
import { useOnline } from '@/lib/useOnline';
import { FieldImage } from '@/season/FieldImage';
import { isKnownSeasonImage } from '@/season/images';
import { panelErrorLine, unreachable } from './adminMessages';
import { FormError, TextField } from './fields';
import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SectionHeader } from '@/components/ui/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * SPEC-FINAL 6.4: the seasons table (year, game name, image path, active marker, edit),
 * a "New season" form, and the switch to make one season the default everyone opens to.
 * `rpc` is injectable (the tests hand a `vi.fn`); it defaults to the typed client.
 */

export const OFFLINE_SWITCH_HINT = 'Changing the active season or event needs a connection.';
export const IMAGE_PATH_HINT =
  'The image must already be committed to apps/client/public and deployed.';

type Load =
  | { status: 'loading' }
  | { status: 'ready'; seasons: SeasonRow[]; activeSeasonId: string | null }
  | { status: 'unreachable' }
  | { status: 'failed'; line: string };

type FormState = { kind: 'none' } | { kind: 'create' } | { kind: 'edit'; season: SeasonRow };

async function loadSeasons(
  rpc: Rpc,
): Promise<{ seasons: SeasonRow[]; activeSeasonId: string | null }> {
  const [seasonsOut, contextOut] = await Promise.all([
    rpc.call('listSeasons', {}),
    rpc.call('getActiveContext', {}),
  ]);
  const items = (seasonsOut as { items: SeasonRow[] }).items;
  const activeSeasonId = (contextOut as { active_season_id: string | null }).active_season_id;
  // Newest year first (SPEC-FINAL 6.4) — sorted here rather than trusted from the wire, so
  // a page that reorders defensively still shows the right season on top.
  return { seasons: [...items].sort((a, b) => b.year - a.year), activeSeasonId };
}

export function SeasonsPanel({
  rpc = adminRpc,
  onChanged,
}: {
  rpc?: Rpc;
  /**
   * Called after a create, edit or "make active" succeeds (task 1.20 review): the parent
   * (`ManagePage`) re-reads seasons/context on this, so its Events tab picks up a
   * just-created season without a reload — the one flow this page exists for.
   */
  onChanged?: () => void;
}) {
  const online = useOnline();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [form, setForm] = useState<FormState>({ kind: 'none' });
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setLoad({ status: 'loading' });
    loadSeasons(rpc).then(
      (result) => {
        if (live) setLoad({ status: 'ready', ...result });
      },
      (e: unknown) => {
        if (!live) return;
        setLoad(
          unreachable(e)
            ? { status: 'unreachable' }
            : { status: 'failed', line: panelErrorLine(e) },
        );
      },
    );
    return () => {
      live = false;
    };
    // rpc is an injected dependency held stable by the caller; only a retry re-fetches.
  }, [attempt]);

  async function makeActive(season: SeasonRow) {
    setSwitchingId(season.id);
    setSwitchError(null);
    try {
      await rpc.call('setActiveSeason', { season_id: season.id });
      reload();
      onChanged?.();
    } catch (e) {
      setSwitchError(panelErrorLine(e));
    } finally {
      setSwitchingId(null);
    }
  }

  if (load.status === 'unreachable') {
    return (
      <StateMessage
        variant="offline-needs-server"
        headingLevel={2}
        detail="Seasons live on the server, and this device cannot reach it right now."
        action={{ label: 'Try again', onClick: reload }}
      />
    );
  }
  if (load.status === 'failed') {
    return (
      <StateMessage
        variant="failed"
        headingLevel={2}
        title="Seasons did not load"
        detail={load.line}
        action={{ label: 'Try again', onClick: reload }}
      />
    );
  }

  return (
    <section aria-label="Seasons">
      <SectionHeader
        title="Seasons"
        actions={
          <button
            type="button"
            className={SECONDARY_BUTTON}
            onClick={() =>
              setForm((f) => (f.kind === 'create' ? { kind: 'none' } : { kind: 'create' }))
            }
          >
            {form.kind === 'create' ? 'Cancel' : 'New season'}
          </button>
        }
      />
      {!online && <p className="mt-2 text-sm text-text-muted">{OFFLINE_SWITCH_HINT}</p>}
      {load.status === 'loading' ? (
        <p className="mt-4 text-text-muted">Loading the seasons…</p>
      ) : (
        <Table containerClassName="mt-4 rounded-xl border border-border bg-surface">
          <TableHeader>
            <TableRow>
              <TableHead numeric>Year</TableHead>
              <TableHead>Game</TableHead>
              <TableHead>Image path</TableHead>
              <TableHead>Default season</TableHead>
              <TableHead>Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {load.seasons.map((season) => (
              <TableRow key={season.id}>
                <TableCell numeric>{season.year}</TableCell>
                <TableCell dir="auto">{season.game_name}</TableCell>
                <TableCell className="font-mono text-sm">
                  {season.field_image_path}
                  {/* Task 1.23 (SPEC-FINAL 16.7): fail loudly, right where an admin will see
                        it, rather than a season silently pointing at nothing. */}
                  {!isKnownSeasonImage(season.field_image_path) && (
                    <div className="mt-1 font-sans">
                      <FieldImage
                        path={season.field_image_path}
                        alt={`${season.year} field image`}
                      />
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {season.id === load.activeSeasonId ? (
                    <Badge tone="success">Active</Badge>
                  ) : (
                    <button
                      type="button"
                      className={SECONDARY_BUTTON}
                      disabled={!online || switchingId !== null}
                      onClick={() => void makeActive(season)}
                    >
                      {switchingId === season.id ? 'Switching…' : `Make ${season.year} active`}
                    </button>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Edit"
                    title="Edit"
                    onClick={() => setForm({ kind: 'edit', season })}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <FormError message={switchError} />
      {form.kind !== 'none' && (
        <SeasonForm
          season={form.kind === 'edit' ? form.season : null}
          rpc={rpc}
          onDone={() => {
            setForm({ kind: 'none' });
            reload();
            onChanged?.();
          }}
          onCancel={() => setForm({ kind: 'none' })}
        />
      )}
    </section>
  );
}

function YearField({
  value,
  onChange,
  invalid,
  errorId,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  errorId?: string;
}) {
  const id = useId();
  return (
    <div className="mt-4">
      <Label htmlFor={id}>Year</Label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        className={`${FIELD} mt-1`}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ImagePathField({
  value,
  onChange,
  invalid,
  errorId,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  errorId?: string;
}) {
  const id = useId();
  const listId = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="mt-4">
      <Label htmlFor={id}>Game image path</Label>
      <input
        id={id}
        type="text"
        list={listId}
        value={value}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        aria-describedby={[hintId, invalid ? errorId : null].filter(Boolean).join(' ')}
        className={`${FIELD} mt-1 font-mono`}
        onChange={(e) => onChange(e.target.value)}
      />
      {/* Free text, not a fixed choice: SEASON_IMAGE_MANIFEST is the committed images, but
          this year's image may not be built and committed yet. The datalist just puts the
          paths that already resolve one click away. */}
      <datalist id={listId}>
        {SEASON_IMAGE_MANIFEST.map((path) => (
          <option key={path} value={path} />
        ))}
      </datalist>
      <p id={hintId} className="mt-1 text-sm text-text-muted">
        {IMAGE_PATH_HINT}
      </p>
    </div>
  );
}

/**
 * Create when `season` is null, edit otherwise. An edit sends only the fields that
 * changed (SPEC-FINAL 6.4): `field_image_path` may be refused once the season has
 * entries, and that refusal — like the manifest one — is the use case's own sentence.
 */
function SeasonForm({
  season,
  rpc,
  onDone,
  onCancel,
}: {
  season: SeasonRow | null;
  rpc: Rpc;
  onDone: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const errorId = useId();
  const [year, setYear] = useState(season ? String(season.year) : '');
  const [gameName, setGameName] = useState(season?.game_name ?? '');
  const [imagePath, setImagePath] = useState(season?.field_image_path ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsedYear = Number(year);
    let payload: unknown;
    if (season) {
      // Only the changed fields go out (SPEC-FINAL 6.4), each checked with the same rule
      // the create schema applies to it. `season.id` is an internal row id, not user
      // input, so it is sent as-is rather than run through the wire schema's uuid check
      // (which the default `call()` still applies, in full, before any real request).
      const patch: Record<string, unknown> = { season_id: season.id };
      if (parsedYear !== season.year) {
        const checked = createSeasonInput.shape.year.safeParse(parsedYear);
        if (!checked.success) {
          setError(checked.error.issues[0]?.message ?? 'that is not valid');
          return;
        }
        patch.year = checked.data;
      }
      if (gameName !== season.game_name) {
        const checked = createSeasonInput.shape.game_name.safeParse(gameName);
        if (!checked.success) {
          setError(checked.error.issues[0]?.message ?? 'that is not valid');
          return;
        }
        patch.game_name = checked.data;
      }
      if (imagePath !== season.field_image_path) {
        const checked = createSeasonInput.shape.field_image_path.safeParse(imagePath);
        if (!checked.success) {
          setError(checked.error.issues[0]?.message ?? 'that is not valid');
          return;
        }
        patch.field_image_path = checked.data;
      }
      if (Object.keys(patch).length === 1) {
        setError('Change something before saving.');
        return;
      }
      payload = patch;
    } else {
      const checked = createSeasonInput.safeParse({
        year: parsedYear,
        game_name: gameName,
        field_image_path: imagePath,
      });
      if (!checked.success) {
        setError(checked.error.issues[0]?.message ?? 'that is not valid');
        return;
      }
      payload = checked.data;
    }
    setBusy(true);
    try {
      await rpc.call(season ? 'updateSeason' : 'createSeason', payload);
      onDone();
    } catch (err) {
      setError(panelErrorLine(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4 max-w-sm">
      <form aria-labelledby={titleId} noValidate onSubmit={(e) => void submit(e)}>
        <CardTitle id={titleId} level={3}>
          {season ? `Edit ${season.year}` : 'New season'}
        </CardTitle>
        <YearField value={year} onChange={setYear} invalid={!!error} errorId={errorId} />
        <TextField
          label="Game name"
          value={gameName}
          onChange={setGameName}
          invalid={!!error}
          errorId={errorId}
        />
        <ImagePathField
          value={imagePath}
          onChange={setImagePath}
          invalid={!!error}
          errorId={errorId}
        />
        {/* Task 1.23: preview the path as typed, so a typo or an uncommitted image fails loudly
          before the admin saves, not after. Nothing to show until something is typed. */}
        {imagePath.trim() !== '' && (
          <div className="mt-2 max-w-[16rem]">
            <FieldImage
              path={imagePath}
              alt={`${gameName || 'season'} field preview`}
              className="h-auto w-full rounded"
            />
          </div>
        )}
        <FormError id={errorId} message={error} />
        <div className="tap-row mt-4 flex gap-2">
          <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
            {busy ? 'Saving…' : season ? 'Save changes' : 'Create season'}
          </button>
          <button type="button" disabled={busy} className={SECONDARY_BUTTON} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
