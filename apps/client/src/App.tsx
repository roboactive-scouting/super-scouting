import { clientConfig } from '@/config';

export function App() {
  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold">ROBACTIVE Scouting</h1>
      <p className="text-[var(--text-muted)]">version {clientConfig().appVersion}</p>
    </main>
  );
}
