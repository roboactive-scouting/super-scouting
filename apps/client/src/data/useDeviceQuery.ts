import { useEffect, useState } from 'react';
import { onChanged, type ChangeKind } from './changes';

/**
 * Read from IndexedDB once, then again only when one of `kinds` changes. No polling, no
 * network. A stale answer from an older run is dropped, and when `deps` change the value
 * resets to undefined so a page keyed by an id never shows the previous key's data. A failed
 * read keeps the last good value.
 */
export function useDeviceQuery<T>(
  load: () => Promise<T>,
  deps: unknown[],
  kinds: ChangeKind[],
): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    let run = 0;
    const read = () => {
      const mine = ++run;
      Promise.resolve()
        .then(load)
        .then((v) => {
          if (mine === run) setValue(v);
        })
        .catch(() => {});
    };
    setValue(undefined);
    read();
    const off = onChanged((kind) => {
      if (kinds.includes(kind)) read();
    });
    return () => {
      run = -1;
      off();
    };
  }, deps);
  return value;
}
