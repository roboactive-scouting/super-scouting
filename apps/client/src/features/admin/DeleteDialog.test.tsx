import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BACKUP_LINES, DeleteDialog, stationsLine } from './DeleteDialog';

const impact = { events: 2, matches: 4, entries: 12, forms: 1, form_versions: 2 };

/** Q41's six stations, each with one entry (28-delete final, phone 2). */
const SIX = (['red', 'blue'] as const).flatMap((alliance) =>
  ([1, 2, 3] as const).map((station) => ({
    alliance,
    station,
    team_number: 1000 + station,
    entries: 1,
  })),
);
const Q41 = { matches: 1, entries: 6, match_entries: 6, stations: SIX };

describe('DeleteDialog (SPEC-FINAL 17.8)', () => {
  it('names the object and the exact counts it will destroy', async () => {
    render(
      <DeleteDialog
        kind="season"
        name="CRESCENDO 2026"
        impact={impact}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('CRESCENDO 2026');
    expect(dialog).toHaveTextContent('12 entries');
    expect(dialog).toHaveTextContent('4 matches');
  });

  it('requires the name to be typed for a season, a form and a form version', async () => {
    for (const kind of ['season', 'form', 'form_version'] as const) {
      const { unmount } = render(
        <DeleteDialog
          kind={kind}
          name="X"
          impact={impact}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByLabelText(/type the name to confirm/i)).toBeInTheDocument();
      unmount();
    }
  });

  it('uses a plain confirm with no typing for a single entry', () => {
    render(
      <DeleteDialog
        kind="entry"
        name="Qualification 12 · 2096"
        impact={{ entries: 1 }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/type the name/i)).not.toBeInTheDocument();
  });

  it('puts the destructive verb on the primary button, not "OK"', () => {
    render(
      <DeleteDialog
        kind="season"
        name="X"
        impact={impact}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /delete season/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^ok$/i })).not.toBeInTheDocument();
  });

  it('tells the admin to run supabase db dump first', () => {
    render(
      <DeleteDialog
        kind="season"
        name="X"
        impact={impact}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/supabase db dump/)).toBeInTheDocument();
  });

  it('shows a blocked panel with no confirm control when the delete would orphan data', () => {
    render(
      <DeleteDialog
        kind="form_version"
        name="v1"
        impact={impact}
        blocked="this version has 4 entries bound to it"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/4 entries bound to it/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/type the name/i)).not.toBeInTheDocument();
  });

  it('disables the confirm button until the typed name matches exactly, including case', async () => {
    const user = userEvent.setup();
    render(
      <DeleteDialog
        kind="season"
        name="CRESCENDO"
        impact={impact}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const button = screen.getByRole('button', { name: /delete season/i });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/type the name to confirm/i), 'crescendo');
    expect(button).toBeDisabled();
    await user.clear(screen.getByLabelText(/type the name to confirm/i));
    await user.type(screen.getByLabelText(/type the name to confirm/i), 'CRESCENDO');
    expect(button).toBeEnabled();
  });

  it('closes without deleting when cancelled, and calls nothing', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <DeleteDialog
        kind="season"
        name="X"
        impact={impact}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('DeleteDialog — the backup step (SPEC-FINAL 3.9; SETUP.md › Backup)', () => {
  const setup = readFileSync(join(import.meta.dirname, '../../../../../docs/ops/SETUP.md'), 'utf8');

  it('shows both SETUP.md lines, the schema then the rows, and never the bare dump', () => {
    render(
      <DeleteDialog
        kind="event"
        name="District #1"
        impact={impact}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const box = screen.getByText(/supabase db dump/);
    expect(box.textContent).toBe(BACKUP_LINES.join('\n'));
    expect(BACKUP_LINES[0]).toMatch(/supabase db dump -f .*prod-schema/);
    expect(BACKUP_LINES[1]).toMatch(/supabase db dump --data-only --use-copy -f .*prod-data/);
    for (const line of box.textContent!.split('\n')) expect(line).not.toMatch(/db dump\s*$/);
    expect(screen.getByRole('button', { name: 'Copy both' })).toBeInTheDocument();
  });

  it('is word for word what SETUP.md › Backup says to run', () => {
    for (const line of BACKUP_LINES) expect(setup).toContain(`\n${line}\n`);
  });

  it('copies both lines with one Copy both', async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(
      <DeleteDialog
        kind="season"
        name="2025"
        impact={impact}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Copy both' }));
    expect(write).toHaveBeenCalledWith(BACKUP_LINES.join('\n'));
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
});

describe('DeleteDialog — the faces (28-delete final)', () => {
  it('opens on the bill: the kicker, "Counted on the server just now", and Cancel focused', async () => {
    render(
      <DeleteDialog
        kind="season"
        name="2025"
        impact={{ ...impact, event_names: ['ISR District #1', 'ISR District #4'] }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Delete Season 2025?' });
    expect(dialog).toHaveTextContent('Delete Season 2025 · hard delete · cannot be undone');
    expect(dialog).toHaveTextContent('Counted on the server just now');
    expect(dialog).toHaveTextContent('ISR District #1 · ISR District #4');
    expect(dialog).toHaveTextContent(
      'Admins only · Online, so the delete runs on the server at once.',
    );
    expect(within(dialog).getByText('No match yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('sends exactly what was typed once it matches, and says "Matches"', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <DeleteDialog
        kind="season"
        name="2025"
        impact={impact}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText(/type the name to confirm/i), '2025');
    expect(screen.getByText('Matches')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete season 2025' }));
    expect(onConfirm).toHaveBeenCalledWith('2025');
  });

  it("types the server's confirm name, not the label: a form by its stored name", async () => {
    const user = userEvent.setup();
    render(
      <DeleteDialog
        kind="form"
        name="Match form"
        confirmName="Match form"
        impact={{ forms: 1, form_versions: 3, entries: 214 }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const go = screen.getByRole('button', { name: 'Delete form Match form' });
    await user.type(screen.getByLabelText(/type the name to confirm/i), 'match form');
    expect(go).toBeDisabled();
    await user.clear(screen.getByLabelText(/type the name to confirm/i));
    await user.type(screen.getByLabelText(/type the name to confirm/i), 'Match form');
    expect(go).toBeEnabled();
  });

  it('holds the delete offline, with the line that says the data is safe', async () => {
    const user = userEvent.setup();
    render(
      <DeleteDialog
        kind="event"
        name="Week 1"
        impact={impact}
        held="This needs a connection."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText(/type the name to confirm/i), 'Week 1');
    expect(screen.getByRole('button', { name: 'Delete event Week 1' })).toBeDisabled();
    expect(screen.getByText('This needs a connection.')).toBeInTheDocument();
  });

  it("says the server's refusal in the dialog", () => {
    render(
      <DeleteDialog
        kind="season"
        name="2025"
        impact={impact}
        error="Type the name exactly to delete."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Type the name exactly to delete.');
  });

  it('one entry is "Are you sure?": the record as a card, one line, Cancel focused', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <DeleteDialog
        kind="entry"
        name="Q12 · 2096"
        impact={{ entries: 1 }}
        subject={{
          title: 'Q12 · 2096',
          meta: 'RoboActive · Yael Shapira',
          time: '11:02',
          points: '47',
        }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Are you sure?' });
    expect(dialog).toHaveTextContent('Q12 · 2096');
    expect(dialog).toHaveTextContent('RoboActive · Yael Shapira');
    expect(dialog).toHaveTextContent(
      'This deletes 1 entry. It stops counting in statistics, lists and ranking once it syncs. There is no restore.',
    );
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/supabase db dump/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Delete entry' }));
    expect(onConfirm).toHaveBeenCalledWith();
  });

  it('a match with no entries is "Are you sure?" too, with nothing typed', () => {
    render(
      <DeleteDialog
        kind="match"
        name="Q41"
        impact={{ matches: 1, entries: 0 }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Are you sure?' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Q41' })).toBeEnabled();
  });

  it('a match with entries opens the Choice, then its own bill typed "Q41"', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCorrectMatch = vi.fn();
    render(
      <DeleteDialog
        kind="match"
        name="Q41"
        confirmName="Q41"
        impact={Q41}
        context="ISR District Event #3"
        onCorrectMatch={onCorrectMatch}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const choice = screen.getByRole('dialog', { name: 'Q41 has entries' });
    expect(choice).toHaveTextContent('6 entries are saved to Q41');
    const tiles = within(choice).getByRole('list', { name: 'The entries by station' });
    expect(
      within(tiles)
        .getAllByRole('listitem')
        .map((t) => t.textContent),
    ).toEqual([
      'Red 1saved',
      'Red 2saved',
      'Red 3saved',
      'Blue 1saved',
      'Blue 2saved',
      'Blue 3saved',
    ]);
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Correct the match number' }));
    expect(onCorrectMatch).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Delete Q41 and its 6 entries…' }));
    const bill = screen.getByRole('dialog', { name: 'Delete Q41 and its 6 entries?' });
    expect(bill).toHaveTextContent('6 entries go, with Q41');
    expect(bill).toHaveTextContent('Red 1–3 and Blue 1–3, ISR District Event #3.');
    expect(within(bill).getByText(/supabase db dump/)).toBeInTheDocument();
    const go = screen.getByRole('button', { name: 'Delete Q41' });
    const field = screen.getByLabelText(/type the name to confirm/i);
    await user.type(field, 'Q4');
    expect(go).toBeDisabled();
    await user.clear(field);
    await user.type(field, 'q41');
    expect(go).toBeDisabled();
    await user.clear(field);
    await user.type(field, 'Q41');
    expect(go).toBeEnabled();
    await user.click(go);
    expect(onConfirm).toHaveBeenCalledWith('Q41');
  });

  it('a form version with entries is Blocked: no delete button, no name field, nothing to type into', () => {
    const onConfirm = vi.fn();
    render(
      <DeleteDialog
        kind="form_version"
        name="v1"
        context="Match form 2026"
        impact={{ form_versions: 1, entries: 312 }}
        blocked="It still holds collected data, so there is nothing to confirm here. Pick a way forward."
        blockedReason="version_has_entries"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', {
      name: "Version 1 can't be deleted",
    });
    expect(dialog).toHaveTextContent('Blocked');
    expect(dialog).toHaveTextContent('312 entries are bound to it');
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/supabase db dump/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep version 1' })).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('a blocked delete offers the ways forward it is given, each as a card with one button', async () => {
    const user = userEvent.setup();
    const whole = vi.fn();
    const onCancel = vi.fn();
    render(
      <DeleteDialog
        kind="form_version"
        name="v2"
        context="Match form 2026"
        impact={{ form_versions: 1, entries: 0 }}
        blocked="Only a draft can be deleted on its own."
        blockedReason="version_published"
        ways={[
          {
            title: 'Delete the whole form instead',
            body: 'Takes it all.',
            label: 'Delete the whole form…',
            onSelect: whole,
          },
        ]}
        facts={[
          { num: 'v2', label: 'Match form' },
          { num: '20/09', label: 'published', note: '2026' },
        ]}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('v2 is published');
    expect(screen.getByRole('dialog')).toHaveTextContent('20/09 published2026');
    await user.click(screen.getByRole('button', { name: 'Delete the whole form…' }));
    expect(whole).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Keep version 2' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('names the stations that hold entries', () => {
    expect(stationsLine(SIX)).toBe('Red 1–3 and Blue 1–3');
    expect(stationsLine(SIX.map((s) => ({ ...s, entries: s.station === 2 ? 0 : 1 })))).toBe(
      'Red 1, 3 and Blue 1, 3',
    );
    expect(stationsLine(SIX.map((s) => ({ ...s, entries: s.alliance === 'red' ? 1 : 0 })))).toBe(
      'Red 1–3',
    );
  });
});
