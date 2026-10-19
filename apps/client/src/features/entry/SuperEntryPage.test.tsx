import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CachedRow } from '@/data/db';
import { db } from '@/data/db';
import { pending } from '@/data/outbox';
import { loadTimedParts } from './lazyParts';
import { SelectRobotPage } from './SelectRobotPage';
import { SuperEntryPage } from './SuperEntryPage';

const field = (over: Record<string, unknown>) =>
  ({
    entity: 'form_fields' as const,
    form_version_id: 'sv-1',
    required: false,
    deprecated: false,
    config: {},
    help_text: null,
    visibility_condition: null,
    expected_range: null,
    direction: 'neutral',
    ...over,
  }) as unknown as CachedRow;

const matchEntry = (id: string, matchId: string, teamId: string, scouter = 'u-1') =>
  ({
    entity: 'scouting_entries',
    id,
    event_id: 'ev-1',
    form_kind: 'match',
    form_version_id: 'fv-1',
    match_id: matchId,
    team_id: teamId,
    alliance: 'red',
    scouter_id: scouter,
    robot_status: 'played',
    breakdown_seconds: null,
    data: {},
    client_created_at: '2026-10-10T08:00:00.000Z',
    client_updated_at: '2026-10-10T08:00:00.000Z',
    deleted_at: null,
  }) as unknown as CachedRow;

/** This device's super entry for 1690, `createdMsAgo` ago. */
const superEntry = (createdMsAgo: number) => {
  const at = new Date(Date.now() - createdMsAgo).toISOString();
  return {
    entity: 'scouting_entries' as const,
    id: 's-1',
    event_id: 'ev-1',
    form_kind: 'super',
    form_version_id: 'sv-1',
    match_id: null,
    team_id: 't-1690',
    alliance: null,
    scouter_id: 'u-1',
    robot_status: null,
    breakdown_seconds: null,
    data: { defence: 'some', strengths: 'fast cycles' },
    version: 2,
    client_created_at: at,
    client_updated_at: at,
    deleted_at: null,
  } as unknown as CachedRow;
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.rows.bulkPut([
    { entity: 'app_settings', id: 'singleton', active_season_id: 'se-1' },
    { entity: 'events', id: 'ev-1', season_id: 'se-1', name: 'Israel District #1' },
    { entity: 'forms', id: 'f-1', kind: 'match', season_id: 'se-1', active_version_id: 'fv-1' },
    { entity: 'forms', id: 'f-2', kind: 'super', season_id: 'se-1', active_version_id: 'sv-1' },
    { entity: 'teams', id: 't-1690', number: 1690, name: 'Orbit' },
    { entity: 'teams', id: 't-2096', number: 2096, name: 'RoboActive' },
    { entity: 'teams', id: 't-1657', number: 1657, name: 'Hamosad' },
    { entity: 'teams', id: 't-9999', number: 9999, name: 'Elsewhere' },
    ...['t-1690', 't-2096', 't-1657'].map((team_id) => ({
      entity: 'event_teams' as const,
      id: `et-${team_id}`,
      event_id: 'ev-1',
      team_id,
      deleted_at: null,
    })),
    { entity: 'matches', id: 'm-12', event_id: 'ev-1', match_type: 'qualification', number: 12 },
    { entity: 'matches', id: 'm-19', event_id: 'ev-1', match_type: 'qualification', number: 19 },
    { entity: 'matches', id: 'm-27', event_id: 'ev-1', match_type: 'qualification', number: 27 },
    // This scout saw 1657 in two matches and 2096 in one; 1690's match was another scout's.
    matchEntry('me-1', 'm-19', 't-1657'),
    matchEntry('me-2', 'm-12', 't-1657'),
    matchEntry('me-3', 'm-27', 't-2096'),
    matchEntry('me-4', 'm-12', 't-1690', 'u-other'),
    field({
      id: 'sf-1',
      key: 'defence',
      label: 'Defence',
      type: 'single_select',
      display_order: 1,
      phase: 'teleop',
      unit: 'enum',
      config: {
        options: [
          { value: 'none', label: 'None' },
          { value: 'some', label: 'Some' },
          { value: 'lots', label: 'Lots' },
        ],
      },
    }),
    field({
      id: 'sf-2',
      key: 'strengths',
      label: 'Strengths',
      type: 'long_text',
      display_order: 2,
      phase: 'post_match',
      unit: 'text',
    }),
  ]);
});

const scouter = { id: 'u-1', role: 'scouter' as const };

function renderAt(
  path: string,
  author: { id: string; role: 'scouter' | 'lead' | 'admin' } = scouter,
) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/scout" element={<SelectRobotPage eventId="ev-1" author={author} />} />
        <Route path="/super" element={<SuperEntryPage eventId="ev-1" author={author} />} />
        <Route path="/super/:teamId" element={<SuperEntryPage eventId="ev-1" author={author} />} />
      </Routes>
    </MemoryRouter>,
  );
}

const rows = () =>
  within(screen.getByRole('list', { name: 'Teams' }))
    .getAllByRole('link')
    .map((row) => row.textContent);

describe('SuperEntryPage (SPEC-FINAL 8.1, task 1.36)', () => {
  it('is reached from the Super scouting card at the foot of Scout', async () => {
    const user = userEvent.setup();
    renderAt('/scout');
    await user.click(await screen.findByRole('link', { name: /Super scouting/ }));
    expect(
      await screen.findByRole('heading', { name: 'Super scouting', level: 1 }),
    ).toBeInTheDocument();
  });

  it('lists the event roster, to do first, ordered by the matches this device saw each team in', async () => {
    renderAt('/super');
    await screen.findByRole('list', { name: 'Teams' });
    expect(
      screen.getByText('Israel District #1 · one entry per team for the whole event'),
    ).toBeInTheDocument();
    expect(rows()).toEqual([
      expect.stringMatching(/^1657Hamosadseen in 2 matches hereTo do$/),
      expect.stringMatching(/^2096RoboActiveseen in 1 match hereTo do$/),
      expect.stringMatching(/^1690Orbitnot seen here yetTo do$/),
    ]);
    // Not on the roster: never offered.
    expect(screen.queryByText('Elsewhere')).not.toBeInTheDocument();
    expect(screen.getByText('Super-scouted on this device').nextSibling).toHaveTextContent(
      '0 of 3',
    );
    const chips = screen.getByRole('group', { name: 'Show' });
    expect(within(chips).getByRole('button', { name: /To do\s*3/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('finds a team by number or name', async () => {
    const user = userEvent.setup();
    renderAt('/super');
    await user.type(await screen.findByRole('searchbox', { name: 'Find a team' }), 'orb');
    expect(rows()).toEqual([expect.stringContaining('1690Orbit')]);
    await user.clear(screen.getByRole('searchbox', { name: 'Find a team' }));
    await user.type(screen.getByRole('searchbox', { name: 'Find a team' }), '20');
    expect(rows()).toEqual([expect.stringContaining('2096RoboActive')]);
  });

  it('renders no match, alliance, robot-status or match-timer control anywhere on the page', async () => {
    renderAt('/super/t-1657');
    expect(await screen.findByRole('heading', { name: '1657 Hamosad' })).toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: 'Some' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /robot status/i })).not.toBeInTheDocument();
    for (const name of [/played/i, /no show/i, /broke down/i, /disabled/i])
      expect(screen.queryByRole('radio', { name })).not.toBeInTheDocument();
    expect(screen.queryByText(/alliance/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/match number/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/match type/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start match/i })).not.toBeInTheDocument();
    // The header: the SUPER tag, the event, and the matches this device scouted the team in.
    expect(screen.getByText('SUPER')).toBeInTheDocument();
    expect(screen.getByText(/Israel District #1 · the whole event/)).toBeInTheDocument();
    const seen = screen.getByText('Seen here in').parentElement!;
    expect(seen).toHaveTextContent(/Seen here in\s*Q12\s*Q19$/);
    // Only the phases the super form has fields in, as phase tabs.
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Teleop', 'Notes']);
  });

  it('submits one operation carrying form_kind super with match, alliance, robot status and breakdown all null', async () => {
    const user = userEvent.setup();
    renderAt('/super/t-1657');
    await user.click(await screen.findByRole('radio', { name: 'Lots' }));
    await user.click(screen.getByRole('tab', { name: 'Notes' }));
    await user.type(screen.getByLabelText('Strengths'), 'Strong defence');
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));
    await waitFor(async () => expect(await pending(10)).toHaveLength(1));
    const [op] = await pending(10);
    expect(op).toMatchObject({ action: 'create', entity: 'scouting_entry', author_user_id: 'u-1' });
    expect(op!.payload).toMatchObject({
      form_kind: 'super',
      form_version_id: 'sv-1',
      event_id: 'ev-1',
      team_id: 't-1657',
      match_id: null,
      alliance: null,
      robot_status: null,
      breakdown_seconds: null,
      data: { defence: 'lots', strengths: 'Strong defence' },
    });
    // Back on the picker, which says so and counts the team done.
    expect(await screen.findByRole('status', { name: 'Super entry saved' })).toHaveTextContent(
      'Super entry saved on this device · 1657 Hamosad',
    );
    await waitFor(() =>
      expect(screen.getByText('Super-scouted on this device').nextSibling).toHaveTextContent(
        '1 of 3',
      ),
    );
  });

  it('names the team and the event on the confirmation, and no match', async () => {
    const user = userEvent.setup();
    renderAt('/super/t-1657');
    await user.click(await screen.findByRole('radio', { name: 'Some' }));
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Submit the super entry?' });
    expect(dialog).toHaveTextContent(
      '1657 Hamosad · Israel District #1 · the whole event. No match is recorded.',
    );
    expect(dialog).not.toHaveTextContent(/\bQ\d+/);
    expect(within(dialog).queryByText('Status')).not.toBeInTheDocument();
    // The answers by phase.
    for (const phase of ['Teleop', 'Notes'])
      expect(within(dialog).getByRole('heading', { name: phase })).toBeInTheDocument();
    expect(
      within(dialog).getByText('Defence', { selector: 'dt' }).nextElementSibling,
    ).toHaveTextContent('Some');
    expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toBeInTheDocument();
  });

  it('opens the entry this device already holds for a team, and updates that row rather than creating a second', async () => {
    await db.rows.put(superEntry(60_000));
    const user = userEvent.setup();
    renderAt('/super');
    await user.click(await screen.findByRole('button', { name: /Done\s*1/ }));
    expect(rows()).toEqual([expect.stringMatching(/^1690Orbit.*✓ Done \d\d:\d\d$/)]);
    await user.click(screen.getByRole('link', { name: /1690/ }));
    expect(
      await screen.findByText(/Editing your entry from \d\d:\d\d — your changes update it/),
    ).toBeInTheDocument();
    // Its saved values are loaded.
    expect(await screen.findByRole('radio', { name: 'Some' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'None' }));
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));
    await waitFor(async () => expect(await pending(10)).toHaveLength(1));
    const [op] = await pending(10);
    expect(op).toMatchObject({ action: 'update', row_id: 's-1', base_version: 2 });
    expect(op!.payload).toMatchObject({
      id: 's-1',
      data: { defence: 'none', strengths: 'fast cycles' },
    });
    const supers = (await db.rows.where('entity').equals('scouting_entries').toArray()).filter(
      (r) => r.form_kind === 'super',
    );
    expect(supers).toHaveLength(1);
  });

  it('opens a draft begun on an older super form version on that version, and its submit clears it (UF.23)', async () => {
    // The super form moved on to sv-2 (one field, Driver skill) after the draft was begun on sv-1.
    await db.rows.bulkPut([
      { entity: 'forms', id: 'f-2', kind: 'super', season_id: 'se-1', active_version_id: 'sv-2' },
      field({
        id: 'sf-v2',
        form_version_id: 'sv-2',
        key: 'driver',
        label: 'Driver skill',
        type: 'short_text',
        display_order: 1,
        phase: 'post_match',
        unit: 'text',
      }),
    ]);
    await db.drafts.put({
      key: 'sv-1:super:t-1690',
      row_id: '',
      payload: { form_kind: 'super', team_id: 't-1690', data: { defence: 'lots' } },
      updated_at: new Date(Date.now() - 60_000).toISOString(),
    });
    const user = userEvent.setup();
    renderAt('/super/t-1690');
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Lots' })).toBeChecked());
    expect(screen.queryByText('Driver skill')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));
    await waitFor(async () => expect(await pending(10)).toHaveLength(1));
    expect((await pending(10))[0]!.payload).toMatchObject({ form_version_id: 'sv-1' });
    expect(await db.drafts.count()).toBe(0);
  });

  it('shows a scouter their own super entry locked once its five-minute window has closed', async () => {
    await db.rows.put(superEntry(10 * 60_000));
    renderAt('/super/t-1690');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The super entry for 1690 Orbit is locked — ask a lead to change it.',
    );
    expect(screen.queryByRole('button', { name: /review entry/i })).not.toBeInTheDocument();
  });

  it('lets a lead reopen and change it at any time (SPEC-FINAL 7.6)', async () => {
    await db.rows.put(superEntry(10 * 60_000));
    renderAt('/super/t-1690', { id: 'u-2', role: 'lead' });
    expect(await screen.findByText(/Editing your entry from/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review entry/i })).toBeInTheDocument();
  });

  it('holds Review entry on a missed required field, with Go to, as the match entry does', async () => {
    await db.rows.put(
      field({
        id: 'sf-3',
        key: 'reliability',
        label: 'Auto reliability',
        type: 'rating',
        display_order: 0,
        phase: 'auto',
        unit: 'count',
        required: true,
        config: { max: 5, style: 'stars' },
      }),
    );
    const user = userEvent.setup();
    renderAt('/super/t-2096');
    await screen.findByRole('tab', { name: 'Auto' });
    await user.click(screen.getByRole('tab', { name: 'Teleop' }));
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    const dialog = await screen.findByRole('dialog', { name: '1 thing to fix first' });
    expect(dialog).toHaveTextContent(/Auto reliability\s*Autonomous · required, not answered/);
    await user.click(within(dialog).getByRole('button', { name: 'Go to Auto reliability' }));
    expect(screen.getByRole('tab', { name: 'Auto' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Required — pick one')).toBeInTheDocument();
    expect(await pending(10)).toHaveLength(0);
  });

  it('says when the season has no super form published', async () => {
    // The only super form on the device is another season's.
    await db.rows.put({
      entity: 'forms',
      id: 'f-2',
      kind: 'super',
      season_id: 'se-0',
      active_version_id: 'sv-0',
    });
    renderAt('/super');
    expect(
      await screen.findByRole('heading', {
        name: 'No super scouting form is published for this season yet',
      }),
    ).toBeInTheDocument();
  });
});

describe('map fields on the super confirmation (UF.24)', () => {
  it('shows a cycle path as a compact row that opens the map view only; Close keeps the sheet', async () => {
    await loadTimedParts();
    const routes = [
      [
        { x: 0.2, y: 0.3 },
        { x: 0.4, y: 0.35 },
      ],
      [
        { x: 0.3, y: 0.6 },
        { x: 0.5, y: 0.55 },
        { x: 0.7, y: 0.5 },
      ],
    ];
    await db.rows.bulkPut([
      field({
        id: 'sf-3',
        key: 'routes',
        label: 'Usual routes',
        type: 'cycle_path',
        display_order: 3,
        phase: 'teleop',
        unit: 'coordinate',
      }),
      field({
        id: 'sf-4',
        key: 'stands',
        label: 'Where it stands',
        type: 'position',
        display_order: 4,
        phase: 'teleop',
        unit: 'coordinate',
      }),
      { ...superEntry(60_000), data: { defence: 'some', routes } } as unknown as CachedRow,
    ]);
    const user = userEvent.setup();
    renderAt('/super/t-1690');
    await screen.findByText(/Editing your entry from/);
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Some' })).toBeChecked());
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Submit the super entry?' });
    const row = within(dialog).getByRole('button', { name: 'Usual routes: 2 paths · 5 spots' });
    expect(row).toHaveAccessibleDescription('Click to view');
    // Nothing marked: a plain row with "—".
    expect(
      within(dialog).getByText('Where it stands', { selector: 'dt' }).nextElementSibling,
    ).toHaveTextContent(/^—$/);
    await user.click(row);
    const map = await screen.findByRole('dialog', { name: 'Usual routes' });
    expect(within(map).getByText('View only')).toBeInTheDocument();
    expect(within(map).queryByRole('button', { name: /Undo|New path|Finish|Done/ })).toBeNull();
    await user.click(within(map).getAllByRole('button', { name: 'Close' }).at(-1)!);
    expect(screen.queryByRole('dialog', { name: 'Usual routes' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Submit the super entry?' })).toBe(dialog);
    expect(row).toHaveFocus();
    expect(
      within(dialog).getByText('Defence', { selector: 'dt' }).nextElementSibling,
    ).toHaveTextContent('Some');
    expect(await pending(10)).toHaveLength(0);
  });
});
