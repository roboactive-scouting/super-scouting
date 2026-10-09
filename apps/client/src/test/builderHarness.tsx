import { render, screen } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';
import type { Role, ScoredFieldRow, VersionSummary } from '@frc/shared';
import { RpcError, type Rpc } from '@/data/rpc';
import { BuilderPage } from '@/features/builder/BuilderPage';
import { FormsPage } from '@/features/forms/FormsPage';
import {
  field,
  formOut,
  SEASON_2026,
  SEASON_2027,
  SEASONS,
  V,
  versionOut,
  VERSIONS,
} from './formFixtures';

/*
 * The builder and the forms list under test for task 1.31's suites (Try it, Edit as JSON,
 * export / import / delete): a scripted server recording every call, and a router with both
 * pages. Wire shapes only, from `formFixtures`.
 */

export const admin = {
  id: 'u-admin',
  username: 'seed_admin',
  full_name: 'Seed Admin',
  role: 'admin' as Role,
  must_change_password: false,
};

export type Call = { name: string; input: Record<string, unknown> };
export type Handler = (input: Record<string, unknown>) => unknown;

/**
 * The four types `FieldInput` draws today (task 1.31's scope note), with one condition: the
 * Auto counter shows only once "Left the start zone" is on. A computed total of the two
 * counters is drawn as the placeholder and saved as its value.
 */
export function fourTypeFields(): ScoredFieldRow[] {
  return [
    field({
      key: 'auto_leave',
      label: 'Left the start zone',
      type: 'toggle',
      config: {},
      unit: 'boolean',
      phase: 'auto',
      points: 3,
    }),
    field({
      key: 'auto_high',
      label: 'Pieces scored high',
      help_text: 'Upper goal',
      phase: 'auto',
      points: 6,
      visibility_condition: { field_key: 'auto_leave', op: '=', value: true },
    }),
    field({ key: 'tele_high', label: 'Teleop high', phase: 'teleop', points: 4 }),
    field({
      key: 'end_climb',
      label: 'Climb level',
      type: 'single_select',
      unit: 'enum',
      phase: 'endgame',
      config: {
        options: [
          { value: 'none', label: 'None' },
          { value: 'high', label: 'High bar' },
        ],
      },
      option_points: { none: 0, high: 12 },
    }),
    field({
      key: 'post_total',
      label: 'Total high',
      type: 'computed',
      unit: 'count',
      phase: 'post_match',
      config: {
        expression: {
          kind: 'op',
          op: '+',
          left: { kind: 'field', key: 'auto_high' },
          right: { kind: 'field', key: 'tele_high' },
        },
        result_type: 'float',
      },
    }),
    field({
      key: 'post_notes',
      label: 'Notes',
      type: 'long_text',
      config: {},
      unit: 'text',
      direction: 'neutral',
      phase: 'post_match',
    }),
  ];
}

export function server(
  over: Record<string, Handler> = {},
  opts: { versions?: VersionSummary[]; fields?: () => ScoredFieldRow[] } = {},
) {
  const versions = opts.versions ?? VERSIONS;
  const fields = opts.fields ?? fourTypeFields;
  const calls: Call[] = [];
  const handlers: Record<string, Handler> = {
    getForm: () => formOut(versions),
    getFormVersion: (input) => {
      const row = versions.find((v) => v.id === input.form_version_id)!;
      return versionOut(row, fields());
    },
    listSeasons: () => ({ items: SEASONS, next_cursor: null }),
    getActiveContext: () => ({ active_season_id: SEASON_2026, active_event_id: null }),
    listForms: (input) => ({
      season_id: input.season_id,
      forms:
        input.season_id === SEASON_2027
          ? []
          : [
              {
                id: formOut(versions).id,
                kind: 'match',
                name: 'Match form',
                active_version_id: V.v3,
                updated_at: '2026-10-08T08:48:00.000Z',
                versions,
              },
            ],
    }),
    ...over,
  };
  const rpc: Rpc = {
    call: vi.fn(async (name: string, input: unknown = {}) => {
      calls.push({ name, input: input as Record<string, unknown> });
      const handler = handlers[name];
      if (!handler) throw new RpcError('not-found', `no ${name}`, 404, true);
      return handler(input as Record<string, unknown>);
    }),
  };
  return { rpc, calls };
}

export function renderPages(path: string, rpc: Rpc) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Outlet context={{ user: admin, expired: false, eventId: null, gate: 'fresh' }} />,
        children: [
          { path: 'admin/forms', element: <FormsPage rpc={rpc} /> },
          { path: 'admin/forms/:formId', element: <BuilderPage rpc={rpc} /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

/** The builder, once its data is in. */
export async function openBuilder(path: string, rpc: Rpc) {
  const router = renderPages(path, rpc);
  await screen.findByRole('region', { name: 'Form' });
  return router;
}

export function goOffline() {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  window.dispatchEvent(new Event('offline'));
}

export function goOnline() {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  window.dispatchEvent(new Event('online'));
}
