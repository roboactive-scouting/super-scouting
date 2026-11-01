import {
  act,
  cleanup as cleanupRender,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scoreBreakdown, type GetEntryOutput, type Role } from '@frc/shared';
import type * as Shared from '@frc/shared';
import { db } from '@/data/db';
import { pending } from '@/data/outbox';
import { RpcError, type Rpc } from '@/data/rpc';
import { CREATED, IDS, NOW, PREVIEW_ROWS } from '@/test/entryPreviewFixtures';
import { EntryPreviewPage } from './EntryPreviewPage';

/** The one DeleteDialog is a lazy chunk (task 1.61): its first load can pass a second. */
const LAZY = { timeout: 5000 };

// The real shared breakdown, watched: the preview never scores on its own (task 1.52).
vi.mock('@frc/shared', async (original) => {
  const actual = await original<typeof Shared>();
  return { ...actual, scoreBreakdown: vi.fn(actual.scoreBreakdown) };
});

const LEAD = { id: 'u-noa', role: 'lead' as Role };
const OMER = { id: 'u-omer', role: 'scouter' as Role };
const YAEL = { id: 'u-yael', role: 'scouter' as Role };
const DANA = { id: 'u-dana', role: 'scouter' as Role };
const ADMIN = { id: 'u-tamar', role: 'admin' as Role };

const noRpc = (): Rpc => ({
  call: vi.fn(async () => {
    throw new Error('no server in this test');
  }),
});

function Page({ viewer, rpc }: { viewer: { id: string; role: Role }; rpc: Rpc }) {
  return (
    <EntryPreviewPage entryId={useParams().id ?? ''} eventId="ev-1" viewer={viewer} rpc={rpc} />
  );
}

function open(
  id: string,
  viewer: { id: string; role: Role } = LEAD,
  rpc: Rpc = noRpc(),
  state?: unknown,
) {
  render(
    <MemoryRouter initialEntries={[{ pathname: `/entries/${id}`, state }]}>
      <Routes>
        <Route path="/entries/:id" element={<Page viewer={viewer} rpc={rpc} />} />
      </Routes>
    </MemoryRouter>,
  );
  return rpc;
}

/** The faked clock: 25 minutes after the played entry was created, unless a test says so. */
function clockAt(ms: number) {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    shouldAdvanceTime: true,
    now: ms,
  });
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.rows.bulkPut(PREVIEW_ROWS);
  clockAt(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('EntryPreviewPage (SPEC-FINAL 13.4; 25-entry-preview final)', () => {
  it('lays a played match entry out by phase, with the header, the band, subtotals and points', async () => {
    open(IDS.played);
    const h1 = await screen.findByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Q371690Orbit');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Autonomous14 pts', 'Teleop22 pts', 'Endgame11 pts', 'Post-match']);
    // Header: status, station, kind, Read only; the score over "scouted points".
    for (const word of ['Played', 'Blue 3', 'Match entry', 'Read only', 'scouted points']) {
      expect(screen.getByText(word)).toBeInTheDocument();
    }
    expect(screen.getByText('47')).toBeInTheDocument();
    // Who and when: the entry's OWN form version (v1), 24-hour local time.
    expect(screen.getByText('Omer Katz')).toBeInTheDocument();
    expect(screen.getByText(/^14\/11\/2026 \d{2}:05$/)).toBeInTheDocument();
    expect(screen.getByText('form v1')).toBeInTheDocument();
    // The band: where the points came from, against the team's average ((47 + 30) / 2).
    const band = screen.getByRole('region', { name: 'Score breakdown' });
    expect(band).toHaveTextContent('Where the 47 points came from');
    expect(band).toHaveTextContent('avg 38.5');
    expect(within(band).getByRole('img')).toHaveAccessibleName('Auto 14, Teleop 22, Endgame 11');
  });

  it('shows each scored row’s points, a faint 0, labels for selects, and no cell for an unscored row', async () => {
    open(IDS.played);
    const row = async (label: string) => (await screen.findAllByText(label))[0]!.closest('div')!;
    expect(await row('Left the start zone')).toHaveTextContent(/Yes\+4/);
    expect(await row('Climb')).toHaveTextContent(/Deep\+11/);
    const missed = await row('Missed shots');
    expect(missed).toHaveTextContent(/^Missed shots10/);
    expect(within(missed).getByText('0').parentElement).toHaveClass('text-faint');
    expect(await row('Played defense')).toHaveTextContent(/No0/);
    // Unscored: the value and nothing after it.
    const skill = await row('Driver skill');
    expect(skill.textContent).toBe('Driver skillGood');
    // The map field: its spots, opening the map view only.
    expect(screen.getByRole('button', { name: 'Shooting spots: 6 spots' })).toBeInTheDocument();
  });

  it('scores with the shared breakdown, on the form’s ACTIVE version, never its own sums', async () => {
    vi.mocked(scoreBreakdown).mockClear();
    open(IDS.played);
    await screen.findByText('47');
    const call = vi.mocked(scoreBreakdown).mock.calls.at(-1)!;
    expect(call[0]).toMatchObject({ form_kind: 'match', robot_status: 'played' });
    expect(call[1].map((f) => f.key)).not.toContain('old_field');
    expect(call[1].map((f) => f.key)).toContain('climb');
    expect(call[2]).toHaveLength(8);
  });

  it('renders Hebrew notes with dir=auto so they read right to left', async () => {
    open(IDS.played);
    expect(await screen.findByText('נהג מעולה, לא נתקע אף פעם.')).toHaveAttribute('dir', 'auto');
    expect(screen.getByText('הערות נוספות')).toHaveAttribute('dir', 'auto');
  });

  it.each([
    [IDS.noShow, 'The robot did not show up.', /no show/i],
    [IDS.disabled, 'The robot was disabled for the match.', /^disabled$/i],
  ])(
    'shows %s with its note and no field rows at all: no band, no zeros',
    async (id, lead, tag) => {
      open(id, YAEL);
      expect(await screen.findByText(lead)).toBeInTheDocument();
      expect(screen.getByText(tag)).toBeInTheDocument();
      expect(screen.queryByRole('definition')).not.toBeInTheDocument();
      expect(screen.queryByRole('term')).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Score breakdown' })).not.toBeInTheDocument();
      expect(screen.getByText('not counted').previousElementSibling).toHaveTextContent(/^—$/);
      expect(document.querySelector('main')!.textContent).not.toMatch(/(^|\D)0(\D|$)/);
    },
  );

  it('a super entry: the SUPER tag, "Whole event", no score, no band, no points', async () => {
    open(IDS.super, DANA);
    expect(await screen.findByText('Whole event')).toBeInTheDocument();
    expect(screen.getByText('SUPER')).toBeInTheDocument();
    expect(screen.getByText('form v3')).toBeInTheDocument();
    expect(screen.queryByText('scouted points')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Score breakdown' })).not.toBeInTheDocument();
    expect(screen.queryByText(/pts$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
    expect(screen.getByText('Auto reliability').closest('div')!.textContent).toBe(
      'Auto reliabilityGood',
    );
  });

  it('links Team page to the team, and on a phone draws the ‹ Entries back', async () => {
    open(IDS.played);
    expect(await screen.findByRole('link', { name: 'Team page' })).toHaveAttribute(
      'href',
      '/teams/t-1690',
    );
  });
});

describe('Edit only for who may edit now (SPEC-FINAL 7.6, 13.4)', () => {
  it('renders for a lead, always, opening the entry form on the right alliance', async () => {
    open(IDS.played, LEAD);
    expect(await screen.findByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/entry/m-37/t-1690?alliance=blue',
    );
  });

  it('never renders for the scouter past 5 minutes: Team page alone', async () => {
    open(IDS.played, OMER);
    await screen.findByRole('link', { name: 'Team page' });
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('renders for the scouter inside the window, and goes when the 5:00 mark passes', async () => {
    vi.useRealTimers();
    clockAt(Date.parse(CREATED) + 4 * 60_000 + 50_000);
    open(IDS.played, OMER);
    expect(await screen.findByRole('link', { name: 'Edit' })).toBeInTheDocument();
    await act(async () => void (await vi.advanceTimersByTimeAsync(11_000)));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull());
  });

  it('never renders on another scouter’s match entry, even inside its window', async () => {
    vi.useRealTimers();
    clockAt(Date.parse(CREATED) + 60_000);
    open(IDS.played, YAEL);
    await screen.findByRole('link', { name: 'Team page' });
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('renders on the scouter’s own super entry an hour later, opening the super form', async () => {
    vi.useRealTimers();
    clockAt(Date.parse('2026-11-14T10:12:00.000Z'));
    open(IDS.super, DANA);
    expect(await screen.findByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/super/t-1690',
    );
  });

  it('never renders on another scouter’s super entry', async () => {
    open(IDS.super, YAEL);
    await screen.findByRole('link', { name: 'Team page' });
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });
});

describe('what is never shown, and where the entry comes from', () => {
  it('a soft-deleted entry is not shown, and the server is not asked', async () => {
    const rpc = open(IDS.deleted);
    expect(await screen.findByRole('heading', { name: 'This entry is not here' })).toBeVisible();
    expect(screen.queryByText('Orbit')).not.toBeInTheDocument();
    expect(rpc.call).not.toHaveBeenCalled();
  });

  it('another event’s entry is not shown', async () => {
    open(IDS.otherEvent);
    expect(await screen.findByRole('heading', { name: 'This entry is not here' })).toBeVisible();
  });

  it('asks the server only for an entry the device does not hold, and draws its answer', async () => {
    const wire: GetEntryOutput = {
      id: 'e-srv',
      event_id: 'ev-1',
      form_kind: 'match',
      match_id: 'm-9',
      match_type: 'qualification',
      match_number: 9,
      match_label: 'Q9',
      team_id: 't-1690',
      team_number: 1690,
      team_name: 'Orbit',
      alliance: 'red',
      scouter_id: 'u-yael',
      scouter_name: 'Yael Shapira',
      robot_status: 'played',
      scouted_points: 6,
      client_created_at: CREATED,
      client_updated_at: CREATED,
      form_id: 'f-match',
      form_version_id: 'fv-2',
      form_version: 2,
      phases: [
        {
          phase: 'endgame',
          subtotal: 6,
          fields: [
            { key: 'climb', label: 'Climb', type: 'single_select', value: 'Shallow', points: 6 },
          ],
        },
      ],
      team_average: 12.25,
      can_edit: true,
    };
    const rpc: Rpc = { call: vi.fn(async () => wire) };
    open('e-srv', YAEL, rpc);
    expect(await screen.findByText('Q9')).toBeInTheDocument();
    expect(rpc.call).toHaveBeenCalledWith('getEntry', { entry_id: 'e-srv' });
    expect(screen.getByText('Climb').closest('div')).toHaveTextContent(/Shallow\+6/);
    expect(screen.getByText('avg 12.3')).toBeInTheDocument();
    // can_edit came from the server's clock; the device's rule decides: 25 minutes on, no Edit.
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('says plainly that the entry is not on this device when the server cannot be reached', async () => {
    const rpc: Rpc = {
      call: vi.fn(async () => {
        throw new RpcError('offline', 'could not reach the server', 0);
      }),
    };
    open('e-missing', LEAD, rpc);
    expect(
      await screen.findByRole('heading', { name: 'This entry is not on this device' }),
    ).toBeVisible();
  });

  it('says it is not here when the server has no such entry', async () => {
    const rpc: Rpc = {
      call: vi.fn(async () => {
        throw new RpcError('not-found', 'that entry does not exist', 404, true);
      }),
    };
    open('e-missing', LEAD, rpc);
    expect(await screen.findByRole('heading', { name: 'This entry is not here' })).toBeVisible();
  });
});

describe('Delete only for a lead or admin (SPEC-FINAL 3.9, 7.6; task 1.61)', () => {
  /** The preview with Entries behind it, where a delete lands. */
  function openWithList(id: string, viewer: { id: string; role: Role }, rpc: Rpc = noRpc()) {
    render(
      <MemoryRouter initialEntries={[`/entries/${id}`]}>
        <Routes>
          <Route path="/entries" element={<h1>Entries list</h1>} />
          <Route path="/entries/:id" element={<Page viewer={viewer} rpc={rpc} />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('a scouter never sees Delete, even on their own entry inside its 5 minutes', async () => {
    vi.useRealTimers();
    clockAt(Date.parse(CREATED) + 60_000);
    open(IDS.played, OMER);
    // Their own entry, still editable: Edit is there, Delete is not.
    expect(await screen.findByRole('link', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('a scouter never sees Delete on their own super entry either', async () => {
    open(IDS.super, DANA);
    expect(await screen.findByRole('link', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('a lead and an admin get Delete after Team page and Edit', async () => {
    open(IDS.played, LEAD);
    await screen.findByRole('link', { name: 'Edit' });
    const actions = screen.getByRole('button', { name: 'Delete' }).parentElement!;
    expect([...actions.children].map((c) => c.textContent)).toEqual([
      'Team page',
      'Edit',
      'Delete',
    ]);
    cleanupRender();
    open(IDS.played, ADMIN);
    expect(await screen.findByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('a lead’s Delete asks "Are you sure?", then queues the soft delete and goes back to Entries', async () => {
    await db.rows.put({ entity: 'users', id: LEAD.id, role: 'lead', full_name: 'Noa Levi' });
    openWithList(IDS.played, LEAD);
    const remove = await screen.findByRole('button', { name: 'Delete' });
    act(() => remove.click());
    const sure = await screen.findByRole('dialog', { name: 'Are you sure?' }, LAZY);
    expect(sure).toHaveTextContent('Q37 · 1690');
    expect(sure).toHaveTextContent('Orbit · Omer Katz');
    expect(sure).toHaveTextContent('This deletes 1 entry.');
    expect(within(sure).queryByRole('textbox')).toBeNull();
    // First focus lands as the lazily loaded dialog mounts.
    await waitFor(() => expect(within(sure).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    act(() => within(sure).getByRole('button', { name: 'Delete entry' }).click());
    expect(await screen.findByRole('heading', { name: 'Entries list' }, LAZY)).toBeInTheDocument();
    const [op] = await pending(10);
    expect(op).toMatchObject({
      row_id: IDS.played,
      action: 'delete',
      author_user_id: LEAD.id,
      payload: {},
    });
    expect((await db.rows.get(['scouting_entries', IDS.played]))?.deleted_at).not.toBeNull();
  });

  it('an entry read from the server is deleted on the server, by deleteEntry', async () => {
    const wire = {
      id: 'e-srv',
      event_id: 'ev-1',
      form_kind: 'match',
      match_id: 'm-9',
      match_type: 'qualification',
      match_number: 9,
      match_label: 'Q9',
      team_id: 't-1690',
      team_number: 1690,
      team_name: 'Orbit',
      alliance: 'red',
      scouter_id: 'u-yael',
      scouter_name: 'Yael Shapira',
      robot_status: 'played',
      scouted_points: 6,
      client_created_at: CREATED,
      client_updated_at: CREATED,
      form_id: 'f-match',
      form_version_id: 'fv-2',
      form_version: 2,
      phases: [],
      team_average: null,
      can_edit: true,
    };
    const call = vi.fn(async (name: string) =>
      name === 'getEntry' ? wire : { id: 'e-srv', deleted: true, version: 2 },
    );
    openWithList('e-srv', ADMIN, { call });
    const remove = await screen.findByRole('button', { name: 'Delete' });
    act(() => remove.click());
    const sure = await screen.findByRole('dialog', { name: 'Are you sure?' }, LAZY);
    act(() => within(sure).getByRole('button', { name: 'Delete entry' }).click());
    expect(await screen.findByRole('heading', { name: 'Entries list' }, LAZY)).toBeInTheDocument();
    expect(call).toHaveBeenLastCalledWith('deleteEntry', { entry_id: 'e-srv' });
    expect(await pending(10)).toHaveLength(0);
  });
});

describe('the 5-minute mark lands here (SPEC-FINAL 7.6 v1.45)', () => {
  it('shows the Success banner and each "Not kept" line at the top, with focus on it', async () => {
    open(IDS.played, OMER, noRpc(), {
      windowClosed: { notKept: ['Not kept: High goal 40 is over 20.'], failed: null },
    });
    const banner = (await screen.findByText('Saved — the 5 minutes are up.')).closest(
      '[role=status]',
    ) as HTMLElement;
    expect(within(banner).getByRole('listitem')).toHaveTextContent(
      'Not kept: High goal 40 is over 20.',
    );
    await waitFor(() => expect(banner.parentElement).toHaveFocus());
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('says so when nothing could be saved', async () => {
    open(IDS.played, OMER, noRpc(), { windowClosed: { notKept: [], failed: 'could not save' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Not saved — the 5 minutes are up. A lead can save it for you.',
    );
  });
});
