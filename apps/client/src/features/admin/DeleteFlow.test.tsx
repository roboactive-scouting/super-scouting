import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SWITCH_EVENT_FIRST, SWITCH_SEASON_FIRST, TYPE_NAME_EXACTLY } from '@frc/shared';
import { RpcError } from '@/data/rpc';
import { deleteImpact } from './deleteFixtures';
import { DeleteFlow, type DeleteRequest } from './DeleteFlow';

const ID = '11111111-1111-4111-8111-111111111111';
const FORM = '22222222-2222-4222-8222-222222222222';

const impact = deleteImpact;

type Answers = Record<string, unknown | ((input: Record<string, unknown>) => unknown)>;

function flow(request: DeleteRequest, answers: Answers) {
  const call = vi.fn(async (name: string, input?: unknown) => {
    const answer = answers[name];
    if (answer === undefined) throw new Error(`no answer for ${name}`);
    const value =
      typeof answer === 'function'
        ? (answer as (i: Record<string, unknown>) => unknown)(input as Record<string, unknown>)
        : answer;
    if (value instanceof Error) throw value;
    return value;
  });
  const onDeleted = vi.fn();
  const onClose = vi.fn();
  render(<DeleteFlow request={request} rpc={{ call }} onDeleted={onDeleted} onClose={onClose} />);
  return { call, onDeleted, onClose };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DeleteFlow (task 1.61): the server counts, picks the face, and is the gate', () => {
  it('counts a season on the server, then deletes it with exactly what was typed', async () => {
    const user = userEvent.setup();
    const { call, onDeleted } = flow(
      { kind: 'season', id: ID, label: '2025' },
      {
        getDeleteImpact: impact({ events: 3, matches: 246, entries: 1912 }),
        deleteSeason: { deleted: true, events: 3, matches: 246, entries: 1912, forms: 2 },
      },
    );
    expect(call).toHaveBeenCalledWith('getDeleteImpact', { kind: 'season', id: ID });
    await screen.findByRole('dialog', { name: 'Delete Season 2025?' });
    await user.type(screen.getByLabelText(/type the name to confirm/i), '2025');
    await user.click(screen.getByRole('button', { name: 'Delete season 2025' }));
    expect(call).toHaveBeenLastCalledWith('deleteSeason', { season_id: ID, confirm_name: '2025' });
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith({ kind: 'season', id: ID }));
  });

  it("shows the server's refusal and keeps the dialog open, deleting nothing", async () => {
    const user = userEvent.setup();
    const { onDeleted } = flow(
      { kind: 'event', id: ID, label: 'Week 1' },
      {
        getDeleteImpact: impact({ kind: 'event', name: 'Week 1', confirm_name: 'Week 1' }),
        deleteEvent: new RpcError('invalid', TYPE_NAME_EXACTLY, 400, true),
      },
    );
    await user.type(await screen.findByLabelText(/type the name to confirm/i), 'Week 1');
    await user.click(screen.getByRole('button', { name: 'Delete event Week 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(TYPE_NAME_EXACTLY);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('the active season is Blocked with the exact text, whatever is typed: nothing to type into', async () => {
    const { call } = flow(
      { kind: 'season', id: ID, label: '2026' },
      {
        getDeleteImpact: impact({
          name: '2026',
          confirm_name: null,
          blocked_reason: 'active_season',
          blocked_message: SWITCH_SEASON_FIRST,
          entries: 214,
        }),
      },
    );
    const dialog = await screen.findByRole('dialog', { name: "Season 2026 can't be deleted" });
    expect(dialog).toHaveTextContent('Blocked');
    expect(screen.getByText(SWITCH_SEASON_FIRST)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('the default event is Blocked with the exact text', async () => {
    flow(
      { kind: 'event', id: ID, label: 'Week 1' },
      {
        getDeleteImpact: impact({
          kind: 'event',
          name: 'Week 1',
          confirm_name: null,
          blocked_reason: 'default_event',
          blocked_message: SWITCH_EVENT_FIRST,
        }),
      },
    );
    await screen.findByRole('dialog', { name: "Week 1 can't be deleted" });
    expect(screen.getByText(SWITCH_EVENT_FIRST)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it("the newest published version is Blocked; publish a newer one, or the whole form's own bill", async () => {
    const user = userEvent.setup();
    const onPublishNewer = vi.fn();
    const { call, onDeleted } = flow(
      {
        kind: 'form_version',
        id: ID,
        label: 'v2',
        formName: 'Match form 2026',
        formId: FORM,
        onPublishNewer,
      },
      {
        getDeleteImpact: (input: Record<string, unknown>) =>
          input.kind === 'form'
            ? impact({
                kind: 'form',
                id: FORM,
                name: 'Match form',
                confirm_name: 'Match form',
                forms: 1,
                form_versions: 3,
                entries: 264,
              })
            : impact({
                kind: 'form_version',
                name: 'v2',
                confirm_name: null,
                blocked_reason: 'version_published',
                blocked_message: 'v2 is the newest published version…',
                form_versions: 1,
                entries: 0,
              }),
        deleteForm: { versions: 3, entries: 264, deleted: true },
      },
    );
    await screen.findByRole('dialog', { name: "Version 2 can't be deleted" });
    expect(
      screen.getByText(
        'Publish a newer version first, then this one can be deleted. Or delete the whole form.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep version 2' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open the builder' }));
    expect(onPublishNewer).toHaveBeenCalledTimes(1);
    expect(call).not.toHaveBeenCalledWith('deleteFormVersion', expect.anything());
    await user.click(screen.getByRole('button', { name: 'Delete the whole form…' }));
    expect(call).toHaveBeenLastCalledWith('getDeleteImpact', { kind: 'form', id: FORM });
    await screen.findByRole('dialog', { name: 'Delete Match form?' });
    const field = screen.getByLabelText(/type the name to confirm/i);
    expect(field).toHaveValue('');
    await user.type(field, 'Match form');
    await user.click(screen.getByRole('button', { name: 'Delete form Match form' }));
    expect(call).toHaveBeenLastCalledWith('deleteForm', {
      form_id: FORM,
      confirm_name: 'Match form',
    });
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith({ kind: 'form', id: FORM }));
  });

  it('a version with entries offers no "Publish a newer version", only the whole form', async () => {
    flow(
      {
        kind: 'form_version',
        id: ID,
        label: 'v1',
        formName: 'Match form 2026',
        formId: FORM,
        onPublishNewer: vi.fn(),
      },
      {
        getDeleteImpact: impact({
          kind: 'form_version',
          name: 'v1',
          confirm_name: null,
          blocked_reason: 'version_has_entries',
          blocked_message: 'this version has 12 entries…',
          form_versions: 1,
          entries: 12,
        }),
      },
    );
    await screen.findByRole('dialog', { name: "Version 1 can't be deleted" });
    expect(screen.queryByRole('button', { name: 'Open the builder' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete the whole form…' })).toBeInTheDocument();
  });

  it('a superseded published version with no entries is the bill, typed "v2" (the user, 2026-10-29)', async () => {
    const user = userEvent.setup();
    const { call } = flow(
      { kind: 'form_version', id: ID, label: 'v2', formName: 'Match form 2026', formId: FORM },
      {
        getDeleteImpact: impact({
          kind: 'form_version',
          name: 'v2',
          confirm_name: 'v2',
          form_versions: 1,
        }),
        deleteFormVersion: { deleted: true },
      },
    );
    await screen.findByRole('dialog', { name: 'Delete version 2 of Match form 2026?' });
    const go = screen.getByRole('button', { name: 'Delete version 2' });
    await user.type(screen.getByLabelText(/type the name to confirm/i), 'V2');
    expect(go).toBeDisabled();
    await user.clear(screen.getByLabelText(/type the name to confirm/i));
    await user.type(screen.getByLabelText(/type the name to confirm/i), 'v2');
    await user.click(go);
    expect(call).toHaveBeenLastCalledWith('deleteFormVersion', {
      form_version_id: ID,
      confirm_name: 'v2',
    });
  });

  it('a draft version with no entries is the bill, typed "v4"', async () => {
    const user = userEvent.setup();
    const { call } = flow(
      { kind: 'form_version', id: ID, label: 'v4', formName: 'Match form 2026', formId: FORM },
      {
        getDeleteImpact: impact({
          kind: 'form_version',
          name: 'v4',
          confirm_name: 'v4',
          form_versions: 1,
        }),
        deleteFormVersion: { deleted: true },
      },
    );
    await screen.findByRole('dialog', { name: 'Delete version 4 of Match form 2026?' });
    await user.type(screen.getByLabelText(/type the name to confirm/i), 'v4');
    await user.click(screen.getByRole('button', { name: 'Delete version 4' }));
    expect(call).toHaveBeenLastCalledWith('deleteFormVersion', {
      form_version_id: ID,
      confirm_name: 'v4',
    });
  });

  it('a match with entries: the Choice, Correct the match number, or the cascade typed Q41', async () => {
    const user = userEvent.setup();
    const onCorrect = vi.fn();
    const stations = (['red', 'blue'] as const).flatMap((alliance) =>
      ([1, 2, 3] as const).map((station) => ({ alliance, station, team_number: 1690, entries: 1 })),
    );
    const { call, onDeleted } = flow(
      { kind: 'match', id: ID, label: 'Q41', eventName: 'District #3', onCorrect },
      {
        getDeleteImpact: impact({
          kind: 'match',
          name: 'Q41',
          confirm_name: 'Q41',
          matches: 1,
          entries: 6,
          match_entries: 6,
          stations,
          last_saved_at: '2026-03-17T11:18:00.000Z',
        }),
        deleteMatch: { id: ID, deleted: true, entries: 6 },
      },
    );
    await screen.findByRole('dialog', { name: 'Q41 has entries' });
    await user.click(screen.getByRole('button', { name: 'Correct the match number' }));
    expect(onCorrect).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Delete Q41 and its 6 entries…' }));
    await user.type(screen.getByLabelText(/type the name to confirm/i), 'Q41');
    await user.click(screen.getByRole('button', { name: 'Delete Q41' }));
    expect(call).toHaveBeenLastCalledWith('deleteMatch', {
      match_id: ID,
      with_entries: true,
      confirm_name: 'Q41',
    });
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it('a match with no entries: "Are you sure?" and the plain delete', async () => {
    const user = userEvent.setup();
    const { call } = flow(
      { kind: 'match', id: ID, label: 'Q42' },
      {
        getDeleteImpact: impact({ kind: 'match', name: 'Q42', confirm_name: null, matches: 1 }),
        deleteMatch: { id: ID, deleted: true },
      },
    );
    await screen.findByRole('dialog', { name: 'Are you sure?' });
    await user.click(screen.getByRole('button', { name: 'Delete Q42' }));
    expect(call).toHaveBeenLastCalledWith('deleteMatch', { match_id: ID });
  });

  it('an entry the device does not hold goes to the server, uncounted', async () => {
    const user = userEvent.setup();
    const { call, onDeleted } = flow(
      {
        kind: 'entry',
        id: ID,
        label: 'Q12 · 2096',
        onDevice: false,
        authorUserId: FORM,
        subject: { title: 'Q12 · 2096' },
      },
      { deleteEntry: { id: ID, deleted: true, version: 2 } },
    );
    await user.click(screen.getByRole('button', { name: 'Delete entry' }));
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith('deleteEntry', { entry_id: ID });
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith({ kind: 'entry', id: ID }));
  });

  it('offline, a count that failed says so and Try again waits for the connection', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    flow(
      { kind: 'season', id: ID, label: '2025' },
      { getDeleteImpact: new RpcError('network', 'offline', 0, false) },
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The server could not be reached, so nothing was deleted.',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });
});
