import { Eye, Lock } from 'lucide-react';
import { formatTime } from '@frc/shared';
import { Card } from '@/components/ui/card';
import { Initials } from '@/components/ui/initials';
import { cn } from '@/lib/utils';
import { EntryAnswers, useMapView } from './EntryAnswers';
import { MapFieldView } from './lazyParts';
import type { LocalEntry } from './localEntries';
import type { Phase } from './phases';
import { firstName } from './SuperPicker';

/**
 * THEME "Read only chip": a 22 px `--line-2` tag, 11.5 px / 700 `--ink-2`, a 13 px eye icon, in
 * the super form's header before the SUPER tag. Never a warning: reading is not an error.
 */
export function ReadOnlyTag() {
  return (
    <span className="inline-flex h-[22px] items-center gap-[5px] whitespace-nowrap rounded-tag bg-line-2 px-2 text-[0.71875rem] font-bold text-ink-2">
      <Eye aria-hidden="true" className="size-[13px]" />
      Read only
    </span>
  );
}

/** "Started 10:40 · last changed 11:12 · seen in 5 matches": each part only when it says something. */
export function authorLine(entry: LocalEntry, seen: number): string {
  const started = formatTime(entry.client_created_at);
  const changed = entry.client_updated_at ? formatTime(entry.client_updated_at) : null;
  return [
    `Started ${started}`,
    changed && entry.client_updated_at !== entry.client_created_at
      ? `last changed ${changed}`
      : null,
    seen > 0 ? `seen in ${seen} ${seen === 1 ? 'match' : 'matches'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Another scouter's super entry, read only (SPEC-FINAL 7.6 v1.32/v1.35; 22-super-readonly final,
 * variant B), under the form's header: whose entry it is (THEME "Author card") with who can
 * change it, then its answers by phase as the confirmation draws them (`EntryAnswers`); a map
 * field's row opens the map view only (UF.24). Nothing here edits: no field control, no phase
 * tabs, no Review entry, no bottom bar.
 */
export function SuperReadOnly({
  entry,
  author,
  authorSeen,
  phases,
  data,
  desktop,
}: {
  entry: LocalEntry;
  /** The author's full name from the cached users; null when the device does not hold them. */
  author: string | null;
  /** The matches the author scouted this team in, on this device. */
  authorSeen: number;
  phases: readonly Phase[];
  data: Record<string, unknown>;
  desktop: boolean;
}) {
  const map = useMapView();
  const who = author ? firstName(author) : 'its author';
  return (
    <div className={cn('flex flex-col gap-3', desktop ? 'px-7 pt-1' : 'px-4 pt-3 pb-5')}>
      <Card className="flex items-center gap-2.5 px-3 py-2.5">
        <Initials name={author ?? '?'} size={34} />
        <span className="min-w-0">
          <b className="block text-[0.90625rem] font-[650] text-ink" dir="auto">
            {author ? `${author}’s entry` : 'Another scouter’s entry'}
          </b>
          <span className="block text-xs text-muted">{authorLine(entry, authorSeen)}</span>
        </span>
      </Card>
      <p className="-mt-1 mx-0.5 flex items-center gap-1.5 text-[0.78125rem] text-muted">
        <Lock aria-hidden="true" className="size-3.5 shrink-0" />
        <span>
          Only <span dir="auto">{who}</span>, a lead or an admin can change it.
        </span>
      </p>
      <EntryAnswers phases={phases} data={data} map={map} stackLong />
      {map.viewing && (
        <MapFieldView field={map.viewing} value={data[map.viewing.key]} onClose={map.close} />
      )}
    </div>
  );
}
