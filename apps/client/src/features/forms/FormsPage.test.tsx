import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FormListItem, Role } from '@frc/shared';
import { RpcError, type Rpc } from '@/data/rpc';
import { FORM_ID, MATCH_FORM, SEASON_2026, SEASON_2027, SEASONS, V } from '@/test/formFixtures';
import { FormsPage } from './FormsPage';
import { statsOf, timelineOf } from './formsView';

type Call = { name: string; input: Record<string, unknown> };

function server(over: Record<string, (input: Record<string, unknown>) => unknown> = {}) {
  const calls: Call[] = [];
  let forms: Record<string, FormListItem[]> = { [SEASON_2026]: [MATCH_FORM], [SEASON_2027]: [] };
  const handlers: Record<string, (input: Record<string, unknown>) => unknown> = {
    listSeasons: () => ({ items: SEASONS, next_cursor: null }),
    getActiveContext: () => ({ active_season_id: SEASON_2026, active_event_id: null }),
    listForms: (input) => ({
      season_id: input.season_id,
      forms: forms[input.season_id as string] ?? [],
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
  return { rpc, calls, setForms: (next: typeof forms) => (forms = next) };
}

function renderForms(rpc: Rpc, role: Role = 'admin') {
  const user = { id: 'u-1', username: 'a', full_name: 'A', role, must_change_password: false };
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Outlet context={{ user, expired: false, eventId: null, gate: 'fresh' }} />,
        children: [
          { path: 'admin/forms', element: <FormsPage rpc={rpc} /> },
          { path: 'admin/forms/:formId', element: <h1>The builder</h1> },
          { path: 'scout', element: <h1>Scout</h1> },
        ],
      },
    ],
    { initialEntries: ['/admin/forms'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
});

const matchCard = () => screen.getByRole('region', { name: 'Match form' });

/** The match form once v1 is restored over v3. */
const restoredV1: FormListItem = {
  ...MATCH_FORM,
  active_version_id: V.v1,
  versions: MATCH_FORM.versions.map((v) => ({ ...v, is_active: v.id === V.v1 })),
};

describe('the forms list (/admin/forms, task 1.29)', () => {
  it('preselects the active season; each chip says active or no forms yet', async () => {
    renderForms(server().rpc);
    expect(await screen.findByRole('heading', { level: 1, name: 'Forms' })).toBeVisible();
    const chips = await screen.findByRole('group', { name: 'Season' });
    expect(within(chips).getByRole('button', { name: '2026 active' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(chips).getByRole('button', { name: '2027 no forms yet' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    // A season with a published match form gives no warning.
    expect(screen.queryByText(/No match form is published/)).toBeNull();
  });

  it('a form card: status, counts, last edited · who, and the version timeline', async () => {
    renderForms(server().rpc);
    const card = await screen.findByRole('region', { name: 'Match form' });
    expect(within(card).getByText('v3 · Published · Locked')).toBeVisible();
    expect(within(card).getByText('One entry per robot per match')).toBeVisible();
    expect(within(card).getByText('Fields').nextSibling).toHaveTextContent('15');
    expect(within(card).getByText('Entries').nextSibling).toHaveTextContent('214');
    expect(within(card).getByText('Versions', { selector: 'dt' }).nextSibling).toHaveTextContent(
      '3',
    );
    expect(within(card).getByText('Last edited').nextSibling).toHaveTextContent('08/10 · Noa Levi');

    const rows = within(card).getAllByRole('listitem');
    expect(rows.map((r) => r.querySelector('p')?.textContent)).toEqual([
      'Draft v4',
      'v3 · active',
      'v2',
      'v1',
    ]);
    expect(rows[0]).toHaveTextContent('not published yet · 17 fields');
    expect(rows[1]).toHaveTextContent('Published 02/10 · locked · 15 fields');
    expect(rows[1]).toHaveTextContent('214 entries');
    expect(within(card).getByRole('link', { name: 'Continue Draft v4' })).toHaveAttribute(
      'href',
      `/admin/forms/${FORM_ID}?version=4`,
    );
    expect(within(card).getByRole('link', { name: 'Open v3 · active' })).toHaveAttribute(
      'href',
      `/admin/forms/${FORM_ID}?version=3`,
    );
    expect(within(card).getByRole('link', { name: 'View v2' })).toHaveAttribute(
      'href',
      `/admin/forms/${FORM_ID}?version=2`,
    );
    expect(within(card).getByRole('button', { name: 'Restore v1' })).toBeEnabled();
    expect(within(card).queryByRole('button', { name: /Restore v3|Restore v4/ })).toBeNull();
    // Open builder opens the draft if there is one: no version in its path.
    expect(within(card).getByRole('link', { name: 'Open builder' })).toHaveAttribute(
      'href',
      `/admin/forms/${FORM_ID}`,
    );
    // Export and ⋯ Delete form arrive with task 1.31: no dead buttons now.
    expect(within(card).queryByRole('button', { name: /Export|Delete|More/ })).toBeNull();
  });

  it('a missing super form is a dashed card with Create, and Create opens the builder on the new draft', async () => {
    const { rpc, calls } = server({
      createForm: () => ({ id: '00000000-0000-4000-8000-0000000000f2', draft_version_id: V.v1 }),
    });
    const router = renderForms(rpc);
    const card = await screen.findByRole('region', { name: 'Super form (not created)' });
    expect(within(card).getByText('Not created')).toBeVisible();
    expect(within(card).getByText(/No super form for 2026 yet\./)).toBeVisible();
    expect(within(card).queryByRole('button', { name: /Import/ })).toBeNull();
    await userEvent.setup().click(within(card).getByRole('button', { name: 'Create super form' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/admin/forms/00000000-0000-4000-8000-0000000000f2',
      ),
    );
    expect(router.state.location.search).toBe('?version=1');
    expect(calls.find((c) => c.name === 'createForm')?.input).toEqual({
      season_id: SEASON_2026,
      kind: 'super',
      name: 'Super form',
    });
  });

  it('a season with no published match form warns, and shows both forms to create', async () => {
    renderForms(server().rpc);
    await userEvent.setup().click(await screen.findByRole('button', { name: '2027 no forms yet' }));
    expect(screen.getByText('No match form is published for 2027.')).toBeVisible();
    expect(screen.getByText("Scouts can't open an entry until one is.")).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create match form' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create super form' })).toBeVisible();
  });

  it('Restore makes an older version active and reads the season again', async () => {
    const srv = server({ restoreFormVersion: () => ({ active_version_id: V.v1 }) });
    renderForms(srv.rpc);
    await screen.findByRole('region', { name: 'Match form' });
    srv.setForms({
      [SEASON_2026]: [
        {
          ...MATCH_FORM,
          active_version_id: V.v1,
          versions: MATCH_FORM.versions.map((v) => ({ ...v, is_active: v.id === V.v1 })),
        },
      ],
      [SEASON_2027]: [],
    });
    await userEvent.setup().click(within(matchCard()).getByRole('button', { name: 'Restore v1' }));
    await waitFor(() =>
      expect(within(matchCard()).getByText('v1 · Published · Locked')).toBeVisible(),
    );
    expect(srv.calls.find((c) => c.name === 'restoreFormVersion')?.input).toEqual({
      form_version_id: V.v1,
    });
  });

  it('a restore that went through but whose list did not read again says so, with Try again', async () => {
    let stage: 'before' | 'failing' | 'after' = 'before';
    const srv = server({
      restoreFormVersion: () => {
        stage = 'failing';
        return { active_version_id: V.v1 };
      },
      listForms: (input) => {
        if (stage === 'failing') throw new RpcError('server-error', 'boom', 500, true);
        const match = stage === 'before' ? MATCH_FORM : restoredV1;
        return {
          season_id: input.season_id,
          forms: input.season_id === SEASON_2026 ? [match] : [],
        };
      },
    });
    renderForms(srv.rpc);
    const u = userEvent.setup();
    await u.click(
      await within(await screen.findByRole('region', { name: 'Match form' })).findByRole('button', {
        name: 'Restore v1',
      }),
    );
    const alert = await within(matchCard()).findByRole('alert');
    expect(alert).toHaveTextContent('v1 is restored.');
    expect(alert).toHaveTextContent('The list did not read again, so it may be out of date.');
    expect(alert).not.toHaveTextContent('did not work');

    stage = 'after';
    await u.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(within(matchCard()).queryByRole('alert')).toBeNull());
    expect(within(matchCard()).getByText('v1 · Published · Locked')).toBeVisible();
  });

  it('a refused restore says why on the card', async () => {
    const { rpc } = server({
      restoreFormVersion: () => {
        throw new RpcError('invalid', 'a draft cannot be restored', 400, true, {
          reason: 'not-published',
        });
      },
    });
    renderForms(rpc);
    await userEvent
      .setup()
      .click(
        await within(await screen.findByRole('region', { name: 'Match form' })).findByRole(
          'button',
          { name: 'Restore v2' },
        ),
      );
    expect(await within(matchCard()).findByRole('alert')).toHaveTextContent(
      'A draft cannot be restored. Publish it instead.',
    );
  });

  it('offline: Create and Restore wait for a connection', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    renderForms(server().rpc);
    const card = await screen.findByRole('region', { name: 'Match form' });
    expect(within(card).getByRole('button', { name: 'Restore v2' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create super form' })).toBeDisabled();
    expect(screen.getByText('Creating a form needs a connection.')).toBeVisible();
  });

  it('cannot reach the server: says so, with Try again', async () => {
    const { rpc } = server({
      listSeasons: () => {
        throw new RpcError('offline', 'could not reach the server', 0);
      },
    });
    renderForms(rpc);
    expect(await screen.findByRole('heading', { name: 'This needs the server' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('a non-admin gets the not-permitted state, and nothing is requested', async () => {
    const { rpc, calls } = server();
    renderForms(rpc, 'lead');
    expect(
      await screen.findByRole('heading', { name: 'Only an admin can edit forms' }),
    ).toBeVisible();
    expect(calls).toEqual([]);
  });
});

describe('formsView', () => {
  it('counts published versions, and the active version’s fields and entries', () => {
    expect(statsOf(MATCH_FORM)).toEqual({
      fields: 15,
      entries: 214,
      versions: 3,
      lastEdited: '08/10 · Noa Levi',
    });
    expect(timelineOf(MATCH_FORM).map((r) => r.kind)).toEqual([
      'draft',
      'active',
      'older',
      'older',
    ]);
  });
});
