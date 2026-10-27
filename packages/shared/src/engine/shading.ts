import type { FieldDirection } from '../forms/types';
import { aggregationValue } from './versions';

/**
 * Value shading (SPEC-FINAL 12.6; THEME "Value shading", v1.40 — task 1.59's piece, pulled
 * forward into task 1.53 by the user). Pure and browser-safe: it returns NUMBERS — where a value
 * sits worst → best, how much accent the cell mixes in, whether it is flat — never CSS. The client
 * turns `mix` into `color-mix(in srgb, var(--accent) <mix>%, var(--surface))`; a flat shade is
 * `--line-2`; no value (null) is a bare `--muted` "—".
 */

/** The accent's share of the cell at the worst end of the ramp, in percent. */
export const SHADE_MIX_WORST = 6;
/** The accent's share of the cell at the best end of the ramp, in percent. */
export const SHADE_MIX_BEST = 52;

/**
 * The colour domain of one column or metric (12.6):
 * - `range`: a declared `expected_range`, or the observed min–max of the values shown;
 * - `rate`: fixed 0–1 (a 0–1 fraction; absolute level matters, not rank within the set);
 * - `ordinal`: the option values in builder list order (top of the list = the lowest rank).
 */
export type ShadeDomain =
  | { kind: 'range'; min: number; max: number }
  | { kind: 'rate' }
  | { kind: 'ordinal'; options: readonly string[] };

export type Shade = {
  /** Worst (0) → best (1), with `lower_is_better` already reversed; 0.5 when flat. */
  position: number;
  /** The accent's share of the cell in percent: 6 (worst) → 52 (best); 0 when flat. */
  mix: number;
  /** Neutral, or min = max: one flat colour (`--line-2`), no ramp. */
  flat: boolean;
  /**
   * The surface's share of the cell, 0–1: it falls as `position` rises, so the ramp is a
   * monotonic light → dark scale that survives colour blindness and greyscale.
   */
  lightness: number;
};

const FLAT: Shade = { position: 0.5, mix: 0, flat: true, lightness: 1 };

/**
 * Where `value` sits in `domain`, 0–1 and clamped, WITHOUT the direction (a meter's raw fill);
 * null when there is no value or it cannot be placed; 0.5 when the domain is a single point.
 * An ordinal option is placed by its rank (`aggregationValue`, the engine's one rank).
 */
export function domainPosition(value: unknown, domain: ShadeDomain | null): number | null {
  if (value === null || value === undefined || domain === null) return null;
  let at: number;
  let min: number;
  let max: number;
  if (domain.kind === 'ordinal') {
    const rank =
      typeof value === 'number'
        ? value
        : aggregationValue(
            {
              type: 'single_select',
              is_ordinal: true,
              config: { options: domain.options.map((v) => ({ value: v, label: v })) },
            },
            value,
          );
    if (typeof rank !== 'number') return null;
    at = rank;
    min = 0;
    max = domain.options.length - 1;
  } else if (domain.kind === 'rate') {
    if (typeof value !== 'number') return null;
    at = value;
    min = 0;
    max = 1;
  } else {
    if (typeof value !== 'number') return null;
    at = value;
    min = domain.min;
    max = domain.max;
  }
  if (!Number.isFinite(at) || !Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (max <= min) return 0.5;
  return Math.min(1, Math.max(0, (at - min) / (max - min)));
}

/**
 * The shade of one value (12.6): null for no value — the caller prints a distinct "—", and that
 * cell was never part of the domain — a FLAT shade for `neutral` and for a domain whose min equals
 * its max (inferring "best" from one data point would be dishonest), otherwise the ramp position
 * with `lower_is_better` reversed. The numeric value is always printed by the caller.
 */
export function shadeFor(
  value: unknown,
  domain: ShadeDomain | null,
  direction: FieldDirection,
): Shade | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (direction === 'neutral' || domain === null) return FLAT;
  if (domain.kind === 'range' && !(domain.max > domain.min)) return FLAT;
  if (domain.kind === 'ordinal' && domain.options.length < 2) return FLAT;
  const raw = domainPosition(value, domain);
  if (raw === null) return null;
  const position = direction === 'lower_is_better' ? 1 - raw : raw;
  const mix = Math.round(SHADE_MIX_WORST + position * (SHADE_MIX_BEST - SHADE_MIX_WORST));
  return { position, mix, flat: false, lightness: 1 - mix / 100 };
}
