import { createContext, useContext } from 'react';
import type { Station } from '@/data/station';

/**
 * What a field needs from the entry around it rather than from its own definition: the
 * scout's alliance (the map turns to put it at the bottom, and blue taps are mirrored, SPEC-FINAL
 * 5.6), the station for the map's tag, and the season's game image path (16.7). `EntryPage`
 * provides it; the builder's Try it provides the red alliance and the season's image.
 */
export type EntryContextValue = {
  alliance: 'red' | 'blue';
  station: Station | null;
  /** The season's `field_image_path`, or null when this device does not know it. */
  fieldImagePath: string | null;
};

export const EntryContext = createContext<EntryContextValue>({
  alliance: 'red',
  station: null,
  fieldImagePath: null,
});

export function useEntryContext(): EntryContextValue {
  return useContext(EntryContext);
}
