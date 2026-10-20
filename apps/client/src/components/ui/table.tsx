import { createContext, useContext, type ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Rows that open nothing do not change on hover (UF.17): a read-only table says so once, on
 * `Table`, and every row in it drops the hover tint. A header row never takes it. A clickable
 * table (Users) keeps it.
 */
const ReadOnlyRows = createContext(false);

/*
 * THEME "Data table": header 12 px / 650 `--muted`, 46 px rows, `--line-2` dividers, numbers
 * in mono and end-aligned. The card (white, `--line` border) is the caller's, through
 * `containerClassName`, so a table already inside a card does not draw a second border.
 */
export function Table({
  className,
  containerClassName,
  readOnly = false,
  ...props
}: ComponentProps<'table'> & {
  containerClassName?: string;
  /** Its rows open nothing: none of them changes on hover. */
  readOnly?: boolean;
}) {
  return (
    <ReadOnlyRows.Provider value={readOnly}>
      <div className={cn('relative w-full overflow-x-auto', containerClassName)}>
        <table className={cn('w-full border-collapse text-start text-sm', className)} {...props} />
      </div>
    </ReadOnlyRows.Provider>
  );
}

export function TableHeader({
  className,
  sticky = false,
  ...props
}: ComponentProps<'thead'> & { sticky?: boolean }) {
  return (
    <ReadOnlyRows.Provider value>
      <thead
        className={cn(
          '[&_tr]:border-b [&_tr]:border-line',
          sticky && 'sticky top-0 z-10 bg-surface',
          className,
        )}
        {...props}
      />
    </ReadOnlyRows.Provider>
  );
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

/**
 * A row: the `--bg` hover tint, unless its table is read-only (or the row says so itself) —
 * a row that opens nothing never looks as if it would.
 */
export function TableRow({
  className,
  readOnly,
  ...props
}: ComponentProps<'tr'> & { readOnly?: boolean }) {
  const inReadOnly = useContext(ReadOnlyRows);
  const still = readOnly ?? inReadOnly;
  return (
    <tr
      className={cn(
        'border-b border-line-2',
        !still && 'motion-safe:transition hover:bg-bg',
        className,
      )}
      {...props}
    />
  );
}

/** A column header. `numeric` end-aligns it over its numbers. */
export function TableHead({
  className,
  numeric = false,
  scope = 'col',
  ...props
}: ComponentProps<'th'> & { numeric?: boolean }) {
  return (
    <th
      scope={scope}
      className={cn(
        'h-[38px] whitespace-nowrap px-3 align-middle text-xs font-[650] text-muted',
        numeric ? 'text-end' : 'text-start',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  numeric = false,
  ...props
}: ComponentProps<'td'> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        'h-[46px] px-3 align-middle',
        numeric && 'num text-end font-semibold',
        className,
      )}
      {...props}
    />
  );
}
