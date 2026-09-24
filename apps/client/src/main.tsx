import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import { browserAdapter, registerServiceWorker } from '@/pwa';
import '@/styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// SPEC-FINAL 9.1: registers the service worker so the shell works offline.
// Never auto-reloads — the real "update ready" UI hint arrives with the app
// shell; until then this is the only signal that a new version is waiting.
// A device needs one successful load *with signal* before this cache exists at
// all — confirmed by hand (see DEVIATIONS.md, the service-worker-never-called
// entry): a fresh install taken offline before precaching finishes has nothing
// to serve. Operationally, every device needs to be opened once online before
// it's trusted to work at a venue.
void registerServiceWorker(() => {
  console.warn('an update is ready — it will apply on the next cold start');
}, browserAdapter());
