import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OFFLINE_CAPABILITY } from './offlineCapability';

/*
 * SPEC-FINAL 9.6 is one table (offlineCapability.ts), and every gate reads it (task 1.45).
 * These rules are over the source, where a type checker cannot see them.
 */
const SRC = join(import.meta.dirname, '..');
const FILES = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => ({ path: f.replaceAll('\\', '/'), source: readFileSync(join(SRC, f), 'utf8') }));

const GATE = /\buseCapability\(|<OfflineGate\b/;

describe('the offline gates (SPEC-FINAL 9.6, task 1.45)', () => {
  it('never gates the scouting path: entry creation, the self-edit and bare match creation', () => {
    // Not scouting: Entries under a session override (6.3) lists ANOTHER event's entries, a
    // server read held as a cross-event view (9.6). The device's own list is never gated.
    const notScouting = new Set(['features/entries/serverEntries.ts']);
    const scouting = FILES.filter(
      (f) =>
        (f.path.startsWith('features/entry/') ||
          f.path.startsWith('features/entries/') ||
          f.path === 'data/outbox.ts') &&
        !notScouting.has(f.path),
    );
    expect(scouting.length).toBeGreaterThan(0);
    for (const file of scouting) {
      expect(file.source, file.path).not.toMatch(GATE);
      expect(file.source, file.path).not.toMatch(/\buseOnline\(/);
    }
  });

  it('every gate names a row of the matrix', () => {
    const rows = new Set(Object.keys(OFFLINE_CAPABILITY));
    const named = FILES.flatMap((f) =>
      [...f.source.matchAll(/useCapability\('(\w+)'\)|<OfflineGate capability="(\w+)"/g)].map(
        (m) => ({ path: f.path, capability: m[1] ?? m[2]! }),
      ),
    );
    expect(named.length).toBeGreaterThan(20);
    for (const { path, capability } of named) expect(rows.has(capability), path).toBe(true);
  });

  it('a server-only screen holds its actions through the matrix, not its own online check', () => {
    // Where the online signal is still read directly, it is for loading or reading, never to
    // hold an action: each is named here with what it does.
    const reads: Record<string, string> = {
      'features/admin/ManagePage.tsx': 'loads the lists only while online',
      'features/admin/ManagePhone.tsx': 'loads the match list only while online',
      'features/admin/useOffRosterTeams.ts': 'reads missing team names again on reconnect',
      'features/context/SwitchCompetitionSheet.tsx': "asks for the server's lists while online",
      'features/sync/ConflictsPage.tsx': 'reads the queue from the server or the cache',
    };
    const serverOnly = FILES.filter(
      (f) =>
        f.path.startsWith('features/admin/') ||
        f.path.startsWith('features/forms/') ||
        f.path.startsWith('features/builder/') ||
        f.path === 'features/context/SwitchCompetitionSheet.tsx' ||
        f.path === 'features/sync/ConflictsPage.tsx',
    );
    const online = serverOnly.filter((f) => /\buseOnline\(\)|navigator\.onLine/.test(f.source));
    expect(online.map((f) => f.path).sort()).toEqual(Object.keys(reads).sort());
  });
});
