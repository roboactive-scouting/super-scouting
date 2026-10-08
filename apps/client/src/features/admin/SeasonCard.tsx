import { Pencil } from 'lucide-react';
import type { SeasonRow } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { FieldImage } from '@/season/FieldImage';
import { isKnownSeasonImage } from '@/season/images';

/** The tag THEME draws for a state ("Active season", "Default event"): accent tint, 24 px. */
export const STATE_TAG =
  'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-tag bg-accent-tint px-2.5 text-[0.78125rem] font-[650] text-accent-ink';

const PLACEHOLDER =
  'h-16 w-[120px] shrink-0 rounded-control bg-[repeating-linear-gradient(45deg,var(--line-2)_0_8px,var(--bg)_8px_16px)]';

/**
 * The chosen season (07-manage final, Competitions): its field image, "2026 — REBUILT", the
 * image path in mono, "Active season" or "Make 2026 active", and "Edit season". An image
 * that is not in this build fails loudly under the card (SPEC-FINAL 16.7, task 1.23).
 */
export function SeasonCard({
  season,
  active,
  switching,
  canSwitch,
  onMakeActive,
  onEdit,
}: {
  season: SeasonRow;
  active: boolean;
  /** This season's "make active" is in flight. */
  switching: boolean;
  /** Online and no other switch in flight. */
  canSwitch: boolean;
  onMakeActive: () => void;
  onEdit: () => void;
}) {
  const known = isKnownSeasonImage(season.field_image_path);
  return (
    <section aria-label={`${season.year} season`} className="mt-3">
      <div className="flex flex-wrap items-center gap-[18px] rounded-card border border-line bg-surface px-4 py-3.5">
        {known ? (
          <FieldImage
            path={season.field_image_path}
            alt={`${season.year} field image`}
            className="h-16 w-[120px] shrink-0 rounded-control object-cover"
          />
        ) : (
          <div aria-hidden="true" className={PLACEHOLDER} />
        )}
        <div className="min-w-0">
          <h2 className="text-base font-bold" dir="auto">
            <span className="num">{season.year}</span> — {season.game_name}
          </h2>
          <p className="num mt-[3px] truncate text-[0.8125rem] text-muted">
            {season.field_image_path}
          </p>
        </div>
        {active ? (
          <span className={STATE_TAG}>Active season</span>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            disabled={!canSwitch}
            busy={switching}
            busyLabel="Switching…"
            onClick={onMakeActive}
          >
            {`Make ${season.year} active`}
          </Button>
        )}
        <span className="flex-1" />
        <Button size="sm" variant="secondary" onClick={onEdit}>
          <Pencil aria-hidden="true" />
          Edit season
        </Button>
      </div>
      {!known && (
        <div className="mt-2">
          <FieldImage path={season.field_image_path} alt={`${season.year} field image`} />
        </div>
      )}
    </section>
  );
}
