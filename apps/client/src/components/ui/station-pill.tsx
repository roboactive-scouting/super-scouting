import { MapPin } from 'lucide-react';
import type { Station } from '@/data/station';
import { cn } from '@/lib/utils';
import { stationLabel } from './tag';

/** THEME "Station pill": 32 px, in the alliance tint, with a location pin: "Blue 2". */
export function StationPill({ station }: { station: Station }) {
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center gap-[7px] whitespace-nowrap rounded-full px-3 text-[0.84375rem] font-bold',
        station[0] === 'R'
          ? 'bg-alliance-red-tint text-alliance-red'
          : 'bg-alliance-blue-tint text-alliance-blue',
      )}
    >
      <MapPin aria-hidden="true" className="size-3.5" strokeWidth={2.4} />
      {stationLabel(station)}
    </span>
  );
}
