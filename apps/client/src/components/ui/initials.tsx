import { cn } from '@/lib/utils';

const SIZE = { 32: 'size-8 text-xs', 40: 'size-10 text-sm', 52: 'size-[52px] text-base' } as const;

const TONE = {
  neutral: 'bg-line-2 text-ink-2',
  accent: 'bg-accent text-on-accent',
  dark: 'bg-rail-raised text-surface ring-1 ring-rail-muted',
} as const;

/** The first letter of up to two words. Counts code points, so Hebrew and emoji are whole. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]!.toLocaleUpperCase())
    .join('');
}

/** A person's initials in a circle (THEME "Initials circle"). Decorative: the name is beside it. */
export function Initials({
  name,
  size = 32,
  tone = 'neutral',
}: {
  name: string;
  size?: 32 | 40 | 52;
  tone?: 'neutral' | 'accent' | 'dark';
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full font-bold',
        SIZE[size],
        TONE[tone],
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
