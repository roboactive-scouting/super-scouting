#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED = {
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
