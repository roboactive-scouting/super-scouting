import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import { syncSessionAcrossTabs } from '@/auth/session';
import { practiceMode } from '@/features/entry/practice';
import { applyDeviceLook } from '@/features/settings/theme';
import { browserAdapter, registerServiceWorker, updateReady } from '@/pwa';
import '@/styles/index.css';

// SPEC-FINAL 8.6, 17.4 (task 1.38): this device's theme and text size, before the first paint, so
// the app never flashes in the wrong look.
applyDeviceLook();

// UF.2: a sign-out, sign-in or expiry in one tab shows in every other tab at once.
syncSessionAcrossTabs();

// SPEC-FINAL 8.5: the app always starts out of practice, with no practice draft left over from a
// crash or a closed tab (task 1.37).
void practiceMode.clearOnStart();

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
