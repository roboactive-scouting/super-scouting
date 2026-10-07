import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { inputClass } from './input';

/**
 * THEME "Search field": white, `--control-border`, a `--muted` magnifier. A real
 * `<input type="search">` (role searchbox) so a phone shows its search keyboard. 48 px, the
 * accessibility floor, rather than the mock-up's 46 px.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute start-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        dir="auto"
        className={cn(inputClass, 'ps-10')}
      />
    </div>
  );
}
