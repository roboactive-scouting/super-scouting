import { lazy, Suspense, type ComponentProps } from 'react';
import type { DeleteFlow as Flow } from './DeleteFlow';

export type { DeleteRequest } from './DeleteFlow';

/*
 * The delete dialog loads when a delete opens (task 1.61), the way the ranking keeps its engine
 * out of the first chunk: nobody deletes on the way in. It is its own chunk, which the service
 * worker precaches with the rest, so an entry's delete (through the outbox) still opens offline.
 */
const DeleteFlow = lazy(() => import('./DeleteFlow').then((m) => ({ default: m.DeleteFlow })));

/** `DeleteFlow`, fetched on first open; nothing is drawn for the moment the chunk takes. */
export function LazyDeleteFlow(props: ComponentProps<typeof Flow>) {
  return (
    <Suspense fallback={null}>
      <DeleteFlow {...props} />
    </Suspense>
  );
}
