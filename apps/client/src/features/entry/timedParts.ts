/*
 * The entry's timed and map parts, in one chunk of their own (task 1.34; DEVIATIONS "the timed
 * parts load beside the initial bundle"): the sticky match timer, the Timer field and the
 * Event-log field, and since task 1.35 the position picker and the cycle path (their map button).
 * Since UF.24 it also holds the view-only map the confirmation opens, which imports MapSheet, so
 * the map comes in this chunk too (the inputs' `lazy` import of it resolves here). `lazyParts.tsx`
 * starts loading it as the app starts, and the service worker precaches it, so it is in memory
 * long before a scout opens an entry, offline too.
 */
export { MatchTimer } from './MatchTimer';
export { CyclePathInput } from './inputs/CyclePathInput';
export { EventLogInput } from './inputs/EventLogInput';
export { PositionInput } from './inputs/PositionInput';
export { TimerInput } from './inputs/TimerInput';
// UF.24: a map field opened view only from the confirmation; it brings MapSheet into this chunk.
export { MapFieldView } from './map/MapFieldView';
