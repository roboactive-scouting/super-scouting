import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/Skeleton';
import { adminRpc, type Rpc } from '@/data/rpc';
import { useIsDesktop } from '@/lib/useMediaQuery';

const ManagePage = lazy(() => import('./ManagePage').then((m) => ({ default: m.ManagePage })));
const ManagePhone = lazy(() => import('./ManagePhone').then((m) => ({ default: m.ManagePhone })));

/**
 * `/admin/manage` at any width (README "Phone (< 1024 px): matches only"; SPEC-FINAL 17.2's
 * third any-width exception): the whole management page from 1024 px, the matches view
 * below. The width decides, never the user agent (17.3). Each page checks the role itself.
 */
export function ManageRoute({ rpc = adminRpc }: { rpc?: Rpc }) {
  const desktop = useIsDesktop();
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <Skeleton rows={4} label="Loading" />
        </div>
      }
    >
      {desktop ? <ManagePage rpc={rpc} /> : <ManagePhone rpc={rpc} />}
    </Suspense>
  );
}
