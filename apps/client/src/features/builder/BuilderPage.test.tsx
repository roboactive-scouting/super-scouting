import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIELD_TYPES, type Role, type ScoredFieldRow, type VersionSummary } from '@frc/shared';
import { session } from '@/auth/session';
import { db } from '@/data/db';
import { RpcError, type Rpc } from '@/data/rpc';
import type * as SyncModule from '@/data/sync';
import { routeTree } from '@/routes';
import {
  draftFields,
  field,
  FORM_ID,
  formOut,
  SEASONS,
  V,
  versionOut,
  VERSIONS,
} from '@/test/formFixtures';
import { BuilderPage } from './BuilderPage';

const hydrate = vi.fn();
vi.mock('@/data/sync', async (original) => ({
  ...(await original<typeof SyncModule>()),
  hydrate: (deps: unknown) => hydrate(deps),
  syncNow: vi.fn(),
}));
vi.mock('@/config', () => ({
  clientConfig: () => ({ apiBaseUrl: 'https://api.test', deviceWipeCode: 'w', appVersion: 't' }),
}));

const admin = {
  id: 'u-admin',
  username: 'seed_admin',
  full_name: 'Seed Admin',
  role: 'admin' as Role,
  must_change_password: false,
};

type Call = { name: string; input: Record<string, unknown> };
type Handler = (input: Record<string, unknown>) => unknown;

/** The v3 the draft was made from: the draft adds Climb level and Notes. */
const v3Fields = () => draftFields().slice(0, 5);

function server(over: Record<string, Handler> = {}, versions: VersionSummary[] = VERSIONS) {
  const calls: Call[] = [];
  const handlers: Record<string, Handler> = {
    getForm: () => formOut(versions),
    getFormVersion: (input) => {
      const row = versions.find((v) => v.id === input.form_version_id)!;
      return versionOut(row, row.version_no === 4 ? draftFields() : v3Fields());
    },
    listSeasons: () => ({ items: SEASONS, next_cursor: null }),
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

function renderBuilder(path: string, rpc: Rpc) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Outlet context={{ user: admin, expired: false, eventId: null, gate: 'fresh' }} />,
        children: [
          { path: 'admin/forms', element: <h1>The forms list</h1> },
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
async function open(path: string, rpc: Rpc) {
  const router = renderBuilder(path, rpc);
  await screen.findByRole('region', { name: 'Form' });
  return router;
}

function setWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: px });
  window.matchMedia = ((query: string) => ({
    matches: px >= 1024,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

function goOffline() {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  window.dispatchEvent(new Event('offline'));
}

afterEach(() => {
  // jsdom has no matchMedia: the shell's desktop layout is the default under test.
  delete (window as { matchMedia?: unknown }).matchMedia;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
});

const draftPath = `/admin/forms/${FORM_ID}?version=4`;
const canvas = () => screen.getByRole('region', { name: 'Form' });
const settings = () => screen.getByRole('region', { name: 'Field settings' });
/**
 * The settings pane's Label box. A saved, complete field's Field group starts folded to one line
 * (task 1.30), so it is unfolded first.
 */
async function labelBox(u: ReturnType<typeof userEvent.setup>) {
  const fold = within(settings()).queryByRole('button', { name: 'Field', expanded: false });
  if (fold) await u.click(fold);
  return within(settings()).getByLabelText('Label');
}
/** The top bar's saved / unsaved line (dnd-kit adds a live region of its own). */
const saveState = () => document.querySelector<HTMLElement>('[data-save-state]')!;
/** dnd-kit's keyboard sensor listens for the next key only after a tick. */
const tick = () => act(() => new Promise((done) => setTimeout(done, 20)));

describe('BuilderPage: the three panes (task 1.29)', () => {
  it('shows the palette, the canvas and the settings pane at 1280 px', async () => {
    setWidth(1280);
    await open(draftPath, server().rpc);
    expect(await screen.findByRole('heading', { level: 1, name: /Match form/ })).toHaveTextContent(
      'Match form2026',
    );
    expect(screen.getByRole('region', { name: 'Fields' })).toBeInTheDocument();
    expect(canvas()).toBeInTheDocument();
    expect(settings()).toBeInTheDocument();
  });

  it('lists all fourteen field types in the palette, and no Photo', async () => {
    await open(draftPath, server().rpc);
    const palette = await screen.findByRole('region', { name: 'Fields' });
    const rows = within(palette).getAllByRole('button');
    expect(rows).toHaveLength(14);
    expect(FIELD_TYPES).toHaveLength(14);
    for (const name of ['Counter', 'Event log', 'Field position', 'Cycle path', 'Section']) {
      expect(
        within(palette).getByRole('button', { name: new RegExp(`^Add ${name}:`) }),
      ).toBeVisible();
    }
    expect(within(palette).queryByText(/photo/i)).toBeNull();
  });

  it('shows one phase at a time under the phase tabs, its fields under their section headings', async () => {
    await open(draftPath, server().rpc);
    const tabs = await within(canvas()).findByRole('tablist', { name: 'Phases' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['Auto2', 'Teleop3', 'Endgame1', 'Notes1']);
    // The first phase with fields opens: Auto, and only Auto's fields.
    expect(within(canvas()).getByRole('heading', { name: 'Autonomous' })).toBeInTheDocument();
    expect(within(canvas()).getByText('Phase 1 of 4')).toBeInTheDocument();
    expect(
      within(canvas()).getByRole('button', { name: 'Left the start zone, Toggle' }),
    ).toBeVisible();
    expect(within(canvas()).queryByText('tele_high')).toBeNull();

    await userEvent.setup().click(within(tabs).getByRole('tab', { name: /Teleop/ }));
    expect(within(canvas()).getByText('Phase 2 of 4')).toBeInTheDocument();
    expect(within(canvas()).getByText('tele_high')).toBeInTheDocument();
    expect(within(canvas()).queryByText('auto_high')).toBeNull();
    // Played defence sits under its section heading.
    const heading = within(canvas()).getByRole('heading', { name: 'Defence' });
    const defence = within(canvas()).getByText('tele_defence');
    expect(
      heading.compareDocumentPosition(defence) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // A type the phone cannot draw yet is a neutral placeholder, never a status colour.
    expect(
      within(canvas()).getByText('Shown on the phone once tasks 1.33–1.35 land'),
    ).toBeVisible();
    // The key and the points sit at the item's top right.
    expect(within(canvas()).getByText('4/ea pts')).toBeInTheDocument();
  });

  it('changes phase with ← and → on the canvas, and the foot names the phases either side', async () => {
    await open(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(await within(canvas()).findByRole('button', { name: 'Next phase: Teleop' }));
    expect(within(canvas()).getByText('Phase 2 of 4')).toBeInTheDocument();
    within(canvas()).getByRole('button', { name: 'Previous phase: Auto' }).focus();
    await u.keyboard('{ArrowRight}');
    expect(within(canvas()).getByText('Phase 3 of 4')).toBeInTheDocument();
    expect(within(canvas()).getByText('end_climb')).toBeInTheDocument();
    expect(within(canvas()).getByText('0–12 pts')).toBeInTheDocument();
  });

  it('clicking a canvas item selects it in the settings pane', async () => {
    await open(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(
      await within(canvas()).findByRole('button', { name: 'Pieces scored high, Counter' }),
    );
    expect(within(settings()).getByRole('heading', { name: 'Pieces scored high' })).toBeVisible();
    expect(within(settings()).getByText('auto_high')).toBeVisible();
    expect(within(settings()).getByText('· permanent, never changes')).toBeVisible();
    expect(
      within(canvas()).getByRole('button', { name: 'Pieces scored high, Counter' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders the desktop-only panel at 640 px, for the builder and the forms page', async () => {
    await db.delete();
    await db.open();
    await session.signIn(admin, 'token-abc');
    setWidth(640);
    for (const [path, what] of [
      [draftPath, 'the form builder'],
      ['/admin/forms', 'the forms page'],
    ] as const) {
      const router = createMemoryRouter(routeTree(), { initialEntries: [path] });
      const { unmount } = render(<RouterProvider router={router} />);
      expect(await screen.findByRole('heading', { name: 'This needs a computer' })).toBeVisible();
      expect(screen.getByText(new RegExp(`Open ${what} on a screen`))).toBeVisible();
      expect(screen.queryByRole('region', { name: 'Fields' })).toBeNull();
      unmount();
    }
    await session.signOut();
  });
});

describe('BuilderPage: the published version (task 1.29)', () => {
  // No draft: v3 is the newest, active and locked with 214 entries.
  const noDraft = VERSIONS.slice(1);

  it('shows a banner while the version is locked: a structural edit starts a new version, an in-place one does not', async () => {
    await open(`/admin/forms/${FORM_ID}?version=3`, server({}, noDraft).rpc);
    const banner = await screen.findByText(/v3 is locked: 214 entries were scouted with it\./);
    const note = banner.closest('div')!.parentElement!;
    expect(note).toHaveTextContent(
      'Labels, help, ranges, meaning and scoring change in place. Adding or removing a field, or changing a type, starts draft v4.',
    );
    expect(screen.getByRole('button', { name: /v3 · Published · Locked/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Publish v/ })).toBeNull();
  });

  it('warns that a structural change will start draft v4, and an in-place label edit will not', async () => {
    await open(`/admin/forms/${FORM_ID}?version=3`, server({}, noDraft).rpc);
    const u = userEvent.setup();
    await u.click(
      await within(canvas()).findByRole('button', { name: 'Left the start zone, Toggle' }),
    );
    await u.type(await labelBox(u), '!');
    expect(saveState()).toHaveTextContent('● Unsaved changes');
    expect(saveState()).not.toHaveTextContent('draft v4');
    await u.click(screen.getByRole('button', { name: /^Add Toggle:/ }));
    expect(saveState()).toHaveTextContent('● Unsaved changes · saving starts draft v4');
  });

  it('a structural save forks: the editor is held until the new draft is read, then shows it', async () => {
    let forked = false;
    let release!: () => void;
    const v4Read = new Promise<void>((resolve) => (release = resolve));
    const { rpc, calls } = server(
      {
        // After the fork the server has draft v4 over v3.
        getForm: () => formOut(forked ? VERSIONS : noDraft),
        getFormVersion: async (input) => {
          const row = VERSIONS.find((v) => v.id === input.form_version_id)!;
          if (row.version_no !== 4) return versionOut(row, v3Fields());
          await v4Read;
          return versionOut(row, draftFields());
        },
        saveDraftFields: () => {
          forked = true;
          return {
            form_version_id: V.v4,
            new_version_id: V.v4,
            version_no: 4,
            updated_at: '2026-10-08T09:00:00.000Z',
            fields: [],
            incomplete: [],
          };
        },
      },
      noDraft,
    );
    const router = await open(`/admin/forms/${FORM_ID}?version=3`, rpc);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /^Add Counter:/ }));
    await u.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(router.state.location.search).toBe('?version=4'));
    expect(calls.find((c) => c.name === 'saveDraftFields')!.input.form_version_id).toBe(V.v3);

    // Until v4 is read, the old editor is held: Save busy, the panes inert.
    await waitFor(() =>
      expect(calls.filter((c) => c.name === 'getFormVersion')[1]?.input).toEqual({
        form_version_id: V.v4,
      }),
    );
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('region', { name: 'Fields' }).parentElement).toHaveAttribute('inert');

    release();
    expect(await screen.findByRole('button', { name: /Draft v4 · not published/ })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Fields' }).parentElement).not.toHaveAttribute(
      'inert',
    );
    expect(screen.getByRole('button', { name: 'Publish v4' })).toBeInTheDocument();
  });

  it('Restore is held in the version menu while there are unsaved changes, and says why', async () => {
    await open(`/admin/forms/${FORM_ID}?version=3`, server({}, noDraft).rpc);
    const u = userEvent.setup();
    const chip = await screen.findByRole('button', { name: /v3 · Published · Locked/ });
    await u.click(chip);
    expect(screen.getByRole('menuitem', { name: 'Restore v2' })).toBeEnabled();
    expect(screen.queryByText('Save or undo your changes first')).toBeNull();
    await u.keyboard('{Escape}');

    await u.click(within(canvas()).getByRole('button', { name: 'Left the start zone, Toggle' }));
    await u.type(await labelBox(u), '!');
    expect(saveState()).toHaveTextContent('● Unsaved changes');
    await u.click(chip);
    const restore = screen.getByRole('menuitem', { name: 'Restore v2' });
    expect(restore).toBeDisabled();
    expect(restore).toHaveAccessibleDescription('Save or undo your changes first');
    expect(screen.getByText('Save or undo your changes first')).toBeVisible();
  });

  it('on the active version while a draft exists, the palette is held: new fields go in the draft', async () => {
    // VERSIONS: draft v4 exists over the active v3.
    await open(`/admin/forms/${FORM_ID}?version=3`, server().rpc);
    const palette = await screen.findByRole('region', { name: 'Fields' });
    expect(within(palette).getByText('New fields go in draft v4')).toBeVisible();
    for (const row of within(palette).getAllByRole('button')) expect(row).toBeDisabled();
    // In-place edits still work here.
    const u = userEvent.setup();
    await u.click(within(canvas()).getByRole('button', { name: 'Left the start zone, Toggle' }));
    await u.type(await labelBox(u), '!');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    expect(saveState()).not.toHaveTextContent('draft v');
  });

  it('an older version opens read-only, with Restore', async () => {
    const { rpc, calls } = server({ restoreFormVersion: () => ({ active_version_id: V.v2 }) });
    await open(`/admin/forms/${FORM_ID}?version=2`, rpc);
    expect(
      await screen.findByText(/v2 is an older version, so it opens read-only\./),
    ).toBeVisible();
    const palette = screen.getByRole('region', { name: 'Fields' });
    for (const row of within(palette).getAllByRole('button')) expect(row).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Move / })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Restore v2' }));
    await waitFor(() =>
      expect(calls.find((c) => c.name === 'restoreFormVersion')?.input).toEqual({
        form_version_id: V.v2,
      }),
    );
  });
});

describe('BuilderPage: the draft — save, publish, incomplete fields (task 1.29)', () => {
  it('opens the draft by default, says what it was made from, and when it was saved', async () => {
    const router = await open(`/admin/forms/${FORM_ID}`, server().rpc);
    expect(await screen.findByRole('button', { name: /Draft v4 · not published/ })).toBeVisible();
    expect(screen.getByText('made from v3 · 2 fields added')).toBeVisible();
    expect(saveState()).toHaveTextContent(/✓?Saved \d\d:\d\d/);
    expect(router.state.location.search).toBe('');
    expect(screen.getByRole('button', { name: 'Publish v4' })).toBeEnabled();
  });

  it('names no source after a restore: the active version is not the newest published one', async () => {
    // v2 was restored over v3: draft v4 may have been made from either.
    const restored = VERSIONS.map((v) => ({ ...v, is_active: v.version_no === 2 }));
    const { rpc, calls } = server({}, restored);
    await open(`/admin/forms/${FORM_ID}`, rpc);
    expect(await screen.findByRole('button', { name: /Draft v4 · not published/ })).toBeVisible();
    expect(screen.queryByText(/made from/)).toBeNull();
    // Only the draft is read: no predecessor is guessed.
    expect(calls.filter((c) => c.name === 'getFormVersion')).toHaveLength(1);
  });

  it('a new field from the palette is incomplete: Publish is held, the line names it, Next incomplete finds it', async () => {
    await open(draftPath, server().rpc);
    const u = userEvent.setup();
    // The keyboard path: Enter on a palette row adds it to the phase on screen.
    await u.click(await within(canvas()).findByRole('tab', { name: /Teleop/ }));
    screen.getByRole('button', { name: /^Add Counter:/ }).focus();
    await u.keyboard('{Enter}');
    await u.clear(await labelBox(u));
    await u.type(await labelBox(u), 'Pieces dropped');
    expect(within(settings()).getByText('tele_pieces_dropped')).toBeVisible();
    expect(
      within(settings()).getByText('follows the label until the first save, then it is permanent'),
    ).toBeVisible();

    expect(screen.getByRole('button', { name: 'Publish v4' })).toBeDisabled();
    expect(
      screen.getByText('“Pieces dropped” needs its meaning before v4 can be published ·'),
    ).toBeVisible();
    // The canvas marks it in the warning colour, never red, with "incomplete" for a screen reader.
    const item = within(canvas()).getByText('tele_pieces_dropped').closest('[data-field-key]')!;
    expect(item).toHaveClass('border-s-warn');
    expect(within(item as HTMLElement).getByText('incomplete')).toHaveClass('sr-only');
    expect(within(canvas()).getByRole('tab', { name: /Teleop 4 incomplete/ })).toBeInTheDocument();

    // Away to another phase and field, then Next incomplete brings it back.
    await u.click(within(canvas()).getByRole('tab', { name: /Notes/ }));
    await u.click(within(canvas()).getByRole('button', { name: 'Notes, Long text' }));
    await u.click(screen.getByRole('button', { name: /Next incomplete/ }));
    expect(within(canvas()).getByText('Phase 2 of 4')).toBeInTheDocument();
    expect(within(settings()).getByRole('heading', { name: 'Pieces dropped' })).toBeVisible();
    // Typing a label re-renders the whole settings pane per key: slow in jsdom under a full run.
  }, 15_000);

  it('several incomplete fields: the count and the first label', async () => {
    await open(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /^Add Toggle:/ }));
    await u.click(screen.getByRole('button', { name: /^Add Rating:/ }));
    expect(
      screen.getByText(
        '2 fields need their meaning before v4 can be published, starting with “Toggle” ·',
      ),
    ).toBeVisible();
  });

  it('Save draft sends the whole live set with ids, nulls and base_updated_at, and keeps a new key from then on', async () => {
    let saved: Record<string, unknown>[] = [];
    const { rpc, calls } = server({
      saveDraftFields: (input) => {
        const fields = input.fields as Record<string, unknown>[];
        saved = fields.map((f, i) => ({
          ...f,
          id: f.id ?? `00000000-0000-4000-8000-00000000c00${i}`,
          form_version_id: V.v4,
          deprecated: false,
        }));
        return {
          form_version_id: V.v4,
          new_version_id: null,
          version_no: 4,
          updated_at: '2026-10-08T09:30:00.000Z',
          fields: saved,
          incomplete: [{ field_key: 'auto_counter', path: 'description', message: 'x' }],
        };
      },
    });
    await open(draftPath, rpc);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /^Add Counter:/ }));
    await u.click(screen.getByRole('button', { name: 'Save draft' }));
    // The time the server stamped: 09:30Z in the device's zone.
    const at = new Date('2026-10-08T09:30:00.000Z');
    const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    await waitFor(() => expect(saveState()).toHaveTextContent(`Saved ${hhmm}`));
    const input = calls.find((c) => c.name === 'saveDraftFields')!.input;
    expect(input.form_version_id).toBe(V.v4);
    expect(input.base_updated_at).toBe(VERSIONS[0]!.updated_at);
    const fields = input.fields as Record<string, unknown>[];
    expect(fields).toHaveLength(8);
    // Added in Auto, it goes after Auto's two fields; every other field carries its id.
    const added = fields[2]!;
    expect(fields.filter((f) => f !== added).every((f) => typeof f.id === 'string')).toBe(true);
    expect(fields.map((f) => f.display_order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(added).not.toHaveProperty('id');
    expect(added).toMatchObject({
      key: 'auto_counter',
      unit: null,
      direction: null,
      description: null,
    });
    for (const f of fields) {
      expect(f).not.toHaveProperty('points');
      expect(f).not.toHaveProperty('deprecated');
      expect(f).not.toHaveProperty('form_version_id');
    }
    // Saved: its key is permanent now, so the label no longer moves it.
    expect(within(settings()).getByText('· permanent, never changes')).toBeVisible();
    await u.type(await labelBox(u), 's');
    expect(within(settings()).getByText('auto_counter')).toBeVisible();
    expect(saveState()).toHaveTextContent('● Unsaved changes');

    // The next save is based on the time the last one returned.
    await u.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.name === 'saveDraftFields')[1]?.input.base_updated_at).toBe(
        '2026-10-08T09:30:00.000Z',
      ),
    );
  });

  it('Publish publishes the draft and reads the form again', async () => {
    const { rpc, calls } = server({
      publishFormVersion: () => ({
        form_version_id: V.v4,
        published_at: '2026-10-08T10:00:00.000Z',
        active_version_id: V.v4,
      }),
    });
    await open(draftPath, rpc);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Publish v4' }));
    await waitFor(() =>
      expect(calls.find((c) => c.name === 'publishFormVersion')?.input).toEqual({
        form_version_id: V.v4,
      }),
    );
    await waitFor(() => expect(calls.filter((c) => c.name === 'getForm')).toHaveLength(2));
  });

  it('a refused save says why in a sentence, and a stale one offers Reload', async () => {
    const { rpc } = server({
      saveDraftFields: () => {
        throw new RpcError('conflict', 'someone else saved this version; reload it', 409, true, {
          reason: 'stale-version',
          updated_at: '2026-10-08T09:40:00.000Z',
        });
      },
    });
    await open(draftPath, rpc);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /^Add Counter:/ }));
    await u.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Someone else saved this version after you opened it.',
    );
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
    // Nothing was lost: the new field is still on the canvas, unsaved.
    expect(saveState()).toHaveTextContent('● Unsaved changes');
  });

  it("a saved field's key cannot be edited: the label changes, the key stays", async () => {
    await open(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(
      await within(canvas()).findByRole('button', { name: 'Pieces scored high, Counter' }),
    );
    const label = await labelBox(u);
    await u.clear(label);
    await u.type(label, 'Balls high');
    expect(within(settings()).getByRole('heading', { name: 'Balls high' })).toBeVisible();
    expect(within(settings()).getByText('auto_high')).toBeVisible();
    expect(within(canvas()).getByText('auto_high')).toBeVisible();
    expect(within(settings()).queryByRole('textbox', { name: /key/i })).toBeNull();
  });
});

describe('BuilderPage: offline pauses editing (task 1.29)', () => {
  it('holds Save and Publish, dims the panes, and keeps unsaved changes on screen', async () => {
    await open(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /^Add Toggle:/ }));
    goOffline();
    expect(await screen.findByText("You're offline.")).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publish v4' })).toBeDisabled();
    expect(screen.getByText('Offline')).toBeVisible();
    const panes = screen.getByRole('region', { name: 'Fields' }).parentElement!;
    expect(panes).toHaveAttribute('inert');
    expect(panes).toHaveClass('opacity-55');
    expect(saveState()).toHaveTextContent('● Unsaved changes');
    expect(within(canvas()).getByText('auto_toggle')).toBeInTheDocument();
  });
});

describe('BuilderPage: leaving with unsaved changes asks first (task 1.29)', () => {
  it('asks before another page, and Stay keeps the changes', async () => {
    const router = await open(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /^Add Toggle:/ }));
    void router.navigate('/admin/forms');
    // The settings pane makes the page's DOM larger, so a role query takes longer under a full run.
    const dialog = await screen.findByRole(
      'dialog',
      { name: 'Leave without saving?' },
      { timeout: 5_000 },
    );
    await u.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(router.state.location.pathname).toBe(`/admin/forms/${FORM_ID}`);
    expect(saveState()).toHaveTextContent('● Unsaved changes');
  });
});

/** saveDraftFields as the server answers it: every field back with an id. */
const savesFields = (input: Record<string, unknown>) => {
  const fields = (input.fields as Record<string, unknown>[]).map((f, i) => ({
    ...f,
    id: f.id ?? `00000000-0000-4000-8000-00000000c0${String(i).padStart(2, '0')}`,
    form_version_id: input.form_version_id,
    deprecated: false,
  }));
  return {
    form_version_id: input.form_version_id,
    new_version_id: null,
    version_no: 4,
    updated_at: '2026-10-08T09:30:00.000Z',
    fields,
    incomplete: [],
  };
};

describe('BuilderPage: the settings pane and scoring (task 1.30)', () => {
  it('a new field’s points are sent after the field save, as the form’s whole rule set', async () => {
    const { rpc, calls } = server({
      saveDraftFields: savesFields,
      setScoringRules: () => ({ rules: [] }),
    });
    await open(draftPath, rpc);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /^Add Counter:/ }));
    // Added on the Auto page, it scores in the Auto column.
    const box = within(settings()).getByLabelText('Points per unit');
    await u.clear(box);
    await u.type(box, '5');
    expect(within(canvas()).getByText('5/ea pts')).toBeVisible();
    expect(saveState()).toHaveTextContent('● Unsaved changes');
    await u.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(calls.some((c) => c.name === 'setScoringRules')).toBe(true));
    const names = calls.map((c) => c.name);
    expect(names.indexOf('saveDraftFields')).toBeLessThan(names.indexOf('setScoringRules'));
    // The other version (the active v3) was read to keep the rules of keys it has.
    expect(calls.filter((c) => c.name === 'getFormVersion').at(-1)!.input).toEqual({
      form_version_id: V.v3,
    });
    expect(calls.find((c) => c.name === 'setScoringRules')!.input).toEqual({
      form_id: FORM_ID,
      rules: [
        { field_key: 'auto_leave', points: 3 },
        { field_key: 'auto_high', points: 6 },
        { field_key: 'auto_counter', points: 5 },
        { field_key: 'tele_high', points: 4 },
        { field_key: 'end_climb', points: 0, option_points: { none: 0, high: 12 } },
      ],
    });
    await waitFor(() => expect(saveState()).toHaveTextContent('Saved'));
    expect(saveState()).not.toHaveTextContent('Unsaved');
  });

  it('an in-place points edit on the active version sends only the rules, keeping the draft’s', async () => {
    // VERSIONS: draft v4 (which adds Climb level) over the active v3.
    const { rpc, calls } = server({ setScoringRules: () => ({ rules: [] }) });
    await open(`/admin/forms/${FORM_ID}?version=3`, rpc);
    const u = userEvent.setup();
    await u.click(
      await within(canvas()).findByRole('button', { name: 'Pieces scored high, Counter' }),
    );
    expect(within(settings()).getByText('in place · no new version')).toBeVisible();
    const box = within(settings()).getByLabelText('Points per unit');
    await u.clear(box);
    await u.type(box, '8');
    expect(within(canvas()).getByText('8/ea pts')).toBeVisible();
    await u.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(calls.some((c) => c.name === 'setScoringRules')).toBe(true));
    expect(calls.some((c) => c.name === 'saveDraftFields')).toBe(false);
    const rules = calls.find((c) => c.name === 'setScoringRules')!.input.rules as {
      field_key: string;
    }[];
    expect(rules).toContainEqual({ field_key: 'auto_high', points: 8 });
    // end_climb is only in draft v4; replacing the rule set must not drop its points.
    expect(rules).toContainEqual({
      field_key: 'end_climb',
      points: 0,
      option_points: { none: 0, high: 12 },
    });
  });

  it('a points save that fails after the fields saved says the fields were saved and the points were not', async () => {
    const { rpc } = server({
      saveDraftFields: savesFields,
      setScoringRules: () => {
        throw new RpcError('unavailable', 'down', 503, true);
      },
    });
    await open(draftPath, rpc);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /^Add Counter:/ }));
    await u.type(within(settings()).getByLabelText('Points per unit'), '5');
    await u.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The fields were saved; the points were not.',
    );
    // The points are still to send: the page keeps them as unsaved.
    expect(saveState()).toHaveTextContent('● Unsaved changes');
  });

  it('a blank required meaning control holds Publish, and the held line names the field', async () => {
    await open(draftPath, server().rpc);
    const u = userEvent.setup();
    expect(await screen.findByRole('button', { name: 'Publish v4' })).toBeEnabled();
    await u.click(within(canvas()).getByRole('button', { name: 'Pieces scored high, Counter' }));
    await u.click(within(settings()).getByRole('button', { name: 'Meaning' }));
    await u.clear(within(settings()).getByLabelText('Description'));
    expect(within(settings()).getByText('Needed to publish')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Publish v4' })).toBeDisabled();
    expect(
      screen.getByText('“Pieces scored high” needs its meaning before v4 can be published ·'),
    ).toBeVisible();
  });

  it('removing a field on the active version while a draft exists holds Save changes: it belongs in the draft', async () => {
    await open(`/admin/forms/${FORM_ID}?version=3`, server().rpc);
    const u = userEvent.setup();
    await u.click(
      await within(canvas()).findByRole('button', { name: 'Left the start zone, Toggle' }),
    );
    await u.click(
      within(settings()).getByRole('button', { name: 'Field actions: Left the start zone' }),
    );
    const item = screen.getByRole('menuitem', { name: /Remove field/ });
    expect(item).toHaveTextContent('removing it belongs in draft v4');
    await u.click(item);
    expect(within(canvas()).queryByText('auto_leave')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByText('This change belongs in draft v4 ·')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open draft v4' })).toHaveAttribute(
      'href',
      `/admin/forms/${FORM_ID}?version=4`,
    );
  });

  it('on a published version, adding, removing or reordering an option forks; relabelling does not', async () => {
    const noDraft = VERSIONS.slice(1);
    const { rpc } = server(
      {
        getFormVersion: (input) => versionOut(noDraft.find((v) => v.id === input.form_version_id)!),
      },
      noDraft,
    );
    await open(`/admin/forms/${FORM_ID}?version=3`, rpc);
    const u = userEvent.setup();
    await u.click(within(canvas()).getByRole('tab', { name: /Endgame/ }));
    await u.click(within(canvas()).getByRole('button', { name: 'Climb level, Single select' }));
    expect(within(settings()).getByText('Adding an option starts draft v4')).toBeVisible();

    await u.type(within(settings()).getByLabelText('Option 2 label'), ' (top)');
    expect(saveState()).toHaveTextContent('● Unsaved changes');
    expect(saveState()).not.toHaveTextContent('draft v4');

    await u.click(within(settings()).getByRole('button', { name: 'Add an option' }));
    expect(saveState()).toHaveTextContent('saving starts draft v4');
    await u.click(within(settings()).getByRole('button', { name: 'Remove Option 3' }));
    expect(saveState()).not.toHaveTextContent('draft v4');

    // Reordered by its 6-dot grip from the keyboard (final review, U1): Space picks the option
    // up, ↑ moves it a place, Space drops it.
    expect(within(settings()).queryByRole('button', { name: /^Move .* up$/ })).toBeNull();
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const row = this.closest<HTMLElement>('[data-choice-row]');
        const top = row ? Number(row.dataset.choiceRow) * 48 : 0;
        return DOMRect.fromRect({ x: 0, y: top, width: 380, height: 48 });
      });
    const grip = within(settings()).getByRole('button', { name: 'Move High bar (top)' });
    grip.focus();
    fireEvent.keyDown(grip, { code: 'Space', key: ' ' });
    await tick();
    fireEvent.keyDown(document, { code: 'ArrowUp', key: 'ArrowUp' });
    await tick();
    fireEvent.keyDown(document, { code: 'Space', key: ' ' });
    await tick();
    rect.mockRestore();
    await waitFor(() =>
      expect(within(settings()).getByLabelText('Option 1 label')).toHaveValue('High bar (top)'),
    );
    expect(within(settings()).getByLabelText('Option 2 label')).toHaveValue('None');
    expect(saveState()).toHaveTextContent('saving starts draft v4');
  });

  it('changing a phase in the meaning moves the canvas to that phase', async () => {
    await open(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /^Add Counter:/ }));
    await u.click(within(settings()).getByRole('radio', { name: 'Endgame' }));
    expect(within(canvas()).getByText('Phase 3 of 4')).toBeVisible();
    expect(within(canvas()).getByText('end_counter')).toBeVisible();
  });
});

describe('BuilderPage: review fixes (task 1.30, fix round 1)', () => {
  /** Teleop's "Pieces scored high" (tele_high, 4/ea in both v3 and the draft), Field unfolded. */
  async function openTeleHigh(u: ReturnType<typeof userEvent.setup>) {
    await u.click(within(canvas()).getByRole('tab', { name: /Teleop/ }));
    await u.click(within(canvas()).getByRole('button', { name: 'Pieces scored high, Counter' }));
    await labelBox(u);
  }

  it('a counter changed to a number keeps its 4/ea: nothing is removed from the rule set', async () => {
    const { rpc, calls } = server({
      saveDraftFields: savesFields,
      setScoringRules: () => ({ rules: [] }),
    });
    await open(draftPath, rpc);
    const u = userEvent.setup();
    await openTeleHigh(u);
    await u.selectOptions(within(settings()).getByLabelText('Type'), 'number');
    expect(within(canvas()).getByText('4/ea pts')).toBeVisible();
    expect(within(settings()).getByLabelText('Points per unit')).toHaveValue('4');
    expect(within(settings()).queryByText(/Its points are removed/)).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(saveState()).toHaveTextContent('Saved'));
    expect(calls.some((c) => c.name === 'saveDraftFields')).toBe(true);
    // The rule is untouched, so the form's rule set is not sent at all: v3 keeps scoring it.
    expect(calls.some((c) => c.name === 'setScoringRules')).toBe(false);
  });

  it('a counter changed to long text says its points go for every version, then sends the set without it', async () => {
    const { rpc, calls } = server({
      saveDraftFields: savesFields,
      setScoringRules: () => ({ rules: [] }),
    });
    await open(draftPath, rpc);
    const u = userEvent.setup();
    await openTeleHigh(u);
    await u.selectOptions(within(settings()).getByLabelText('Type'), 'long_text');
    expect(within(settings()).getByLabelText('Type')).toHaveAccessibleDescription(
      'Its points are removed for every version of this form.',
    );
    expect(within(canvas()).queryByText('4/ea pts')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(calls.some((c) => c.name === 'setScoringRules')).toBe(true));
    const rules = calls.find((c) => c.name === 'setScoringRules')!.input.rules as {
      field_key: string;
    }[];
    expect(rules.map((r) => r.field_key)).not.toContain('tele_high');
    expect(rules).toContainEqual({ field_key: 'auto_high', points: 6 });
    await waitFor(() => expect(saveState()).toHaveTextContent('Saved'));
    // Sent: the rule is gone here too, and the warning with it.
    expect(within(settings()).queryByText(/Its points are removed/)).toBeNull();
  });

  it('a save that forks and then fails to send the points says so on the new draft, once', async () => {
    const noDraft = VERSIONS.slice(1);
    let forked = false;
    const { rpc } = server(
      {
        getForm: () => formOut(forked ? VERSIONS : noDraft),
        getFormVersion: (input) => {
          const row = VERSIONS.find((v) => v.id === input.form_version_id)!;
          return versionOut(row, row.version_no === 4 ? draftFields() : v3Fields());
        },
        saveDraftFields: () => {
          forked = true;
          return {
            form_version_id: V.v4,
            new_version_id: V.v4,
            version_no: 4,
            updated_at: '2026-10-08T09:00:00.000Z',
            fields: [],
            incomplete: [],
          };
        },
        setScoringRules: () => {
          throw new RpcError('unavailable', 'down', 503, true);
        },
      },
      noDraft,
    );
    const router = await open(`/admin/forms/${FORM_ID}?version=3`, rpc);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /^Add Counter:/ }));
    await u.type(within(settings()).getByLabelText('Points per unit'), '5');
    await u.click(screen.getByRole('button', { name: 'Save changes' }));
    // The save, the fork and the new draft's read take a while under a full parallel run.
    expect(
      await screen.findByRole('button', { name: /Draft v4 · not published/ }, { timeout: 5_000 }),
    ).toBeVisible();
    expect(router.state.location.search).toBe('?version=4');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The fields were saved; the points were not.',
    );
    // Carried as navigation state, and cleared once shown: a reload does not say it again.
    await waitFor(() => expect(router.state.location.state).toBeNull());
    expect(router.state.location.search).toBe('?version=4');
  });
});

describe('BuilderPage: final review fixes', () => {
  const noDraft = VERSIONS.slice(1);
  /** The points box of the selected counter, set to `n`. */
  async function setPoints(u: ReturnType<typeof userEvent.setup>, n: string) {
    const box = within(settings()).getByLabelText('Points per unit');
    await u.clear(box);
    await u.type(box, n);
  }

  it('a palette field removed before saving takes its points with it (I1)', async () => {
    const { rpc } = server({
      saveDraftFields: savesFields,
      setScoringRules: () => ({ rules: [] }),
    });
    await open(draftPath, rpc);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /^Add Counter:/ }));
    await setPoints(u, '5');
    expect(within(canvas()).getByText('5/ea pts')).toBeVisible();
    await u.click(within(settings()).getByRole('button', { name: 'Field actions: Counter' }));
    await u.click(screen.getByRole('menuitem', { name: /Remove field/ }));
    // Nothing is left to save: the field and its points went together.
    expect(saveState()).not.toHaveTextContent('Unsaved');
    // Another field, saved; then a palette field again: it never shows the removed one's 5.
    await u.click(screen.getByRole('button', { name: /^Add Toggle:/ }));
    await u.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(saveState()).toHaveTextContent('Saved'));
    await u.click(screen.getByRole('button', { name: /^Add Counter:/ }));
    expect(within(canvas()).queryByText('5/ea pts')).toBeNull();
    expect(within(settings()).getByLabelText('Points per unit')).toHaveValue('0');
  });

  it('a draft someone opened after load keeps its draft-only points when the active version saves (I4)', async () => {
    let reads = 0;
    const { rpc, calls } = server(
      {
        // At load there is no draft; by the save, another admin has opened draft v4.
        getForm: () => formOut(reads++ === 0 ? noDraft : VERSIONS),
        getFormVersion: (input) => {
          const row = VERSIONS.find((v) => v.id === input.form_version_id)!;
          return versionOut(row, row.version_no === 4 ? draftFields() : v3Fields());
        },
        setScoringRules: () => ({ rules: [] }),
      },
      noDraft,
    );
    await open(`/admin/forms/${FORM_ID}?version=3`, rpc);
    const u = userEvent.setup();
    await u.click(within(canvas()).getByRole('button', { name: 'Pieces scored high, Counter' }));
    await setPoints(u, '8');
    await u.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(calls.some((c) => c.name === 'setScoringRules')).toBe(true));
    const rules = calls.find((c) => c.name === 'setScoringRules')!.input.rules;
    expect(rules).toContainEqual({ field_key: 'auto_high', points: 8 });
    // end_climb is only in the new draft: its points are kept.
    expect(rules).toContainEqual({
      field_key: 'end_climb',
      points: 0,
      option_points: { none: 0, high: 12 },
    });
  });

  it("another admin's points change since load is kept, not reverted (I4)", async () => {
    let fresh = false;
    // One set of rows per version, as the server keeps its field ids.
    const v4Rows = draftFields();
    const v3Rows = v3Fields();
    const theirs = (rows: ScoredFieldRow[]) =>
      rows.map((f) => (fresh && f.key === 'tele_high' ? { ...f, points: 9 } : f));
    const { rpc, calls } = server({
      getFormVersion: (input) => {
        const row = VERSIONS.find((v) => v.id === input.form_version_id)!;
        return versionOut(row, theirs(row.version_no === 4 ? v4Rows : v3Rows));
      },
      setScoringRules: () => ({ rules: [] }),
    });
    await open(`/admin/forms/${FORM_ID}?version=3`, rpc);
    fresh = true;
    const u = userEvent.setup();
    await u.click(within(canvas()).getByRole('button', { name: 'Pieces scored high, Counter' }));
    await setPoints(u, '8');
    await u.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(calls.some((c) => c.name === 'setScoringRules')).toBe(true));
    const rules = calls.find((c) => c.name === 'setScoringRules')!.input.rules;
    expect(rules).toContainEqual({ field_key: 'auto_high', points: 8 });
    expect(rules).toContainEqual({ field_key: 'tele_high', points: 9 });
    // The form and both versions were read again for the send.
    const names = calls.map((c) => c.name);
    const reads = calls.slice(names.lastIndexOf('getForm'));
    expect(reads.map((c) => c.name)).toEqual([
      'getForm',
      'getFormVersion',
      'getFormVersion',
      'setScoringRules',
    ]);
  });

  it('after Publish the editor stays held until the form is read again (M1)', async () => {
    let release!: () => void;
    const reread = new Promise<void>((resolve) => (release = resolve));
    let published = false;
    const { rpc } = server({
      getForm: async () => {
        if (published) await reread;
        return formOut(VERSIONS);
      },
      publishFormVersion: () => {
        published = true;
        return { form_version_id: V.v4, published_at: 'x', active_version_id: V.v4 };
      },
    });
    await open(draftPath, rpc);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Publish v4' }));
    await waitFor(() => expect(published).toBe(true));
    await tick();
    expect(screen.getByRole('button', { name: 'Publishing…' })).toBeDisabled();
    expect(screen.getByRole('region', { name: 'Fields' }).parentElement).toHaveAttribute('inert');
    release();
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Fields' }).parentElement).not.toHaveAttribute(
        'inert',
      ),
    );
  });

  it('opening another version holds the editor until that version is read (M1)', async () => {
    let release!: () => void;
    const v3Read = new Promise<void>((resolve) => (release = resolve));
    let held = false;
    const { rpc } = server({
      getFormVersion: async (input) => {
        const row = VERSIONS.find((v) => v.id === input.form_version_id)!;
        if (held && row.id === V.v3) await v3Read;
        return versionOut(row, row.version_no === 4 ? draftFields() : v3Fields());
      },
    });
    const router = await open(draftPath, rpc);
    held = true;
    await act(() => router.navigate(`/admin/forms/${FORM_ID}?version=3`));
    // The draft's editor is still on screen, held: no edit lands on the wrong version.
    expect(screen.getByRole('button', { name: /Draft v4 · not published/ })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Fields' }).parentElement).toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Publish v4' })).toBeDisabled();
    release();
    expect(await screen.findByRole('button', { name: /v3 · Published · Locked/ })).toBeVisible();
  });

  it('an in-place save on a published version with entries shows it locked (M5)', async () => {
    const unlocked = noDraft.map((v) => (v.version_no === 3 ? { ...v, is_locked: false } : v));
    const { rpc } = server({ saveDraftFields: savesFields }, unlocked);
    await open(`/admin/forms/${FORM_ID}?version=3`, rpc);
    expect(screen.getByText('v3 is published.')).toBeVisible();
    const u = userEvent.setup();
    await u.click(within(canvas()).getByRole('button', { name: 'Left the start zone, Toggle' }));
    await u.type(await labelBox(u), '!');
    await u.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText('v3 is locked: 214 entries were scouted with it.'),
    ).toBeVisible();
  });

  it('offline holds Save changes on the active version, and keeps the edit', async () => {
    await open(`/admin/forms/${FORM_ID}?version=3`, server({}, noDraft).rpc);
    const u = userEvent.setup();
    await u.click(within(canvas()).getByRole('button', { name: 'Left the start zone, Toggle' }));
    await u.type(await labelBox(u), '!');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    goOffline();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled(),
    );
    expect(saveState()).toHaveTextContent('● Unsaved changes');
  });

  it('just under 1024 px (1023) the builder is the desktop-only panel', async () => {
    await db.delete();
    await db.open();
    await session.signIn(admin, 'token-abc');
    setWidth(1023);
    const router = createMemoryRouter(routeTree(), { initialEntries: [draftPath] });
    const { unmount } = render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading', { name: 'This needs a computer' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Fields' })).toBeNull();
    unmount();
    await session.signOut();
  });
});

describe('pointsTag', () => {
  it('reads each, a flat score and a range of option points', async () => {
    const { pointsTag } = await import('./BuilderPage');
    const f = (over: Partial<ScoredFieldRow>) => field({ key: 'x', ...over });
    expect(pointsTag(f({ points: 4 }))).toBe('4/ea pts');
    expect(pointsTag(f({ type: 'toggle', points: 3 }))).toBe('3 pts');
    expect(pointsTag(f({ type: 'single_select', points: 0, option_points: { a: 0, b: 12 } }))).toBe(
      '0–12 pts',
    );
    expect(pointsTag(f({ points: null }))).toBeNull();
    expect(pointsTag(f({ points: 0 }))).toBeNull();
  });
});

beforeEach(() => {
  hydrate.mockReset();
});
