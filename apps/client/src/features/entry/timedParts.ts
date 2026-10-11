/*
 * The entry's timed parts, in one chunk of their own (task 1.34; DEVIATIONS "the timed parts
 * load beside the initial bundle"): the sticky match timer, the Timer field and the Event-log
 * field. `lazyParts.tsx` starts loading it as the app starts, and the service worker precaches
 * it, so it is in memory long before a scout opens an entry, offline too.
 */
export { MatchTimer } from './MatchTimer';
export { EventLogInput } from './inputs/EventLogInput';
export { TimerInput } from './inputs/TimerInput';
