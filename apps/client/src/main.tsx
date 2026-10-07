import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import { syncSessionAcrossTabs } from '@/auth/session';
import { browserAdapter, registerServiceWorker, updateReady } from '@/pwa';
import '@/styles/index.css';

// UF.2: a sign-out, sign-in or expiry in one tab shows in every other tab at once.
syncSessionAcrossTabs();

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// SPEC-FINAL 9.1: registers the service worker so the shell works offline — once, here,
// never from a component that remounts. Never auto-reloads: the callback only sets
// `updateReady`, which AppShell turns into one quiet footer line (task 1.22); the new
// version activates on the next cold start.
// A device needs one successful load *with signal* before this cache exists at
// all — confirmed by hand (see DEVIATIONS.md, the service-worker-never-called
// entry): a fresh install taken offline before precaching finishes has nothing
// to serve. Operationally, every device needs to be opened once online before
// it's trusted to work at a venue.
void registerServiceWorker(() => updateReady.set(), browserAdapter());
