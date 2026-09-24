#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED = {
  // Binding for every build chat. Guarded here so a section cannot quietly vanish:
  // each one records something that cost real time to learn.
  'docs/ops/BUILD-CONTEXT.md': [
    '1. The machine',
    '2. Identifiers — all non-secret',
    '3. Secrets',
    '4. Environments and the production boundary',
    '5. Vercel — things that will waste a day if you do not know them',
    '6. The server function is bundled, not transpiled',
    '7. Architecture rules that a task can silently break',
    '8. Dev database',
    '9. How a build chat runs',
    '10. Verification standard',
    '11. `DEVIATIONS.md`',
  ],
  'docs/ops/SETUP.md': [
    'Accounts to create',
    'Supabase — dev project',
    'Supabase — production project',
    'Migrations by CLI',
    'Vercel — client project',
    'Vercel — server project',
    'GitHub Actions secrets',
    'Backup: `supabase db dump`',
    'New-season checklist',
    'Maintenance and handover checklist',
    'Account transfer checklist',
  ],
  'docs/ops/RUNBOOK.md': [
    'Site will not load',
    'Sync is failing',
    'A tablet is dead or misbehaving',
    'Conflicts are piling up',
    'Pre-event checklist',
    'Daily at an event',
  ],
};

export function missingHeadings(text, required) {
  const headings = text
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3).trim());
  return required.filter((h) => !headings.includes(h));
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function main() {
  let failed = false;
  for (const [path, required] of Object.entries(REQUIRED)) {
    const missing = missingHeadings(readFileSync(join(ROOT, path), 'utf8'), required);
    if (missing.length > 0) {
      failed = true;
      console.error(`${path} is missing sections: ${missing.join(', ')}`);
    }
  }
  if (failed) process.exit(1);
  console.warn('ops documentation complete');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
