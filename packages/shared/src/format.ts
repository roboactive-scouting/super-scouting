export const NO_VALUE = '—';

/**
 * Computed metrics, averages and standard deviations: one decimal place, a whole number bare
 * ("38.4", "41"; SPEC-FINAL 17.8, v1.46 — was two places).
 */
export function formatMetric(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE;
  const one = Math.round(value * 10) / 10;
  // `|| 0` turns a rounded −0 into 0, so −0.04 prints "0", never "-0".
  return Number.isInteger(one) ? String(one || 0) : one.toFixed(1);
}

/**
 * A standard deviation as the ranking prints it: always one decimal, "±6.1", "±9.0"
 * (SPEC-FINAL 17.8; user, 2026-10-29 — a whole number is not printed bare here); none is "—".
 */
export function formatStdDev(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE;
  // `|| 0` turns a rounded −0 into 0, as `formatMetric` does.
  return `±${(Math.round(value * 10) / 10 || 0).toFixed(1)}`;
}

/** Integer counts, match numbers, team numbers: no decimals, no thousands separator. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE;
  return String(Math.round(value));
}

/**
 * The compact match label prefix (Q12, P3, PO1 — SPEC-FINAL 6.4). Moved here from the client's
 * `lib/matchLabel.ts` by task 1.50, so the server's entry search writes the same label the
 * device shows (`match_label`); the client re-exports it, unchanged.
 */
export const MATCH_TYPE_PREFIX: Record<'qualification' | 'practice' | 'playoff', string> = {
  qualification: 'Q',
  practice: 'P',
  playoff: 'PO',
};

/**
 * `match_type` is typed loosely (`string`) so this also accepts the entry flow's own local
 * `MatchRow` (cached rows read back as plain JSON, not the shared zod type).
 */
export function matchLabel(match: { match_type: string; number: number }): string {
  const prefix =
    MATCH_TYPE_PREFIX[match.match_type as keyof typeof MATCH_TYPE_PREFIX] ?? match.match_type;
  return `${prefix}${formatCount(match.number)}`;
}

/** Rates: a 0–1 fraction rendered as a whole-number percentage. */
export function formatPercent(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return NO_VALUE;
  return `${Math.round(fraction * 100)}%`;
}

function parts(iso: string, timeZone: string | undefined): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
}

function part(list: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return list.find((p) => p.type === type)?.value ?? '';
}

/** DD/MM/YYYY, in the device's local zone unless a zone is given (SPEC-FINAL 17.8). */
export function formatDate(iso: string, timeZone?: string): string {
  const p = parts(iso, timeZone);
  return `${part(p, 'day')}/${part(p, 'month')}/${part(p, 'year')}`;
}

/** 24-hour HH:MM, in the device's local zone unless a zone is given. */
export function formatTime(iso: string, timeZone?: string): string {
  const p = parts(iso, timeZone);
  return `${part(p, 'hour')}:${part(p, 'minute')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function weekday(iso: string, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short' }).format(new Date(iso));
}

/**
 * "Sun 12 Oct, 08:02": a day in words with a 24-hour time (the discarded-records log,
 * 19-discarded final), in the device's local zone unless a zone is given. The month is from
 * a fixed list, so it never depends on the locale data ("Sep", never "Sept").
 */
export function formatDayTime(iso: string, timeZone?: string): string {
  const p = parts(iso, timeZone);
  const month = MONTHS[Number(part(p, 'month')) - 1] ?? '';
  return `${weekday(iso, timeZone)} ${Number(part(p, 'day'))} ${month}, ${formatTime(iso, timeZone)}`;
}

/** "Fri 14:20": the weekday and a 24-hour time (the Sync page's discarded notice). */
export function formatWeekdayTime(iso: string, timeZone?: string): string {
  return `${weekday(iso, timeZone)} ${formatTime(iso, timeZone)}`;
}
