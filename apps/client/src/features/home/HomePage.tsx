import { ContextPage } from '@/features/context/ContextPage';
import { HomeSummary } from './HomeSummary';

/** `/` (redesign R.8): what this device works on, then the competitions to look at. */
export function HomePage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 lg:px-10 lg:py-12">
      <HomeSummary />
      <ContextPage />
    </main>
  );
}
