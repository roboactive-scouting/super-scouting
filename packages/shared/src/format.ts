export const NO_VALUE = '—';

/** Computed metrics and standard deviations: 2 decimal places (SPEC-FINAL 17.8). */
export function formatMetric(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE;
  return value.toFixed(2);
}

/** Integer counts, match numbers, team numbers: no decimals, no thousands separator. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE;
  return String(Math.round(value));
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
