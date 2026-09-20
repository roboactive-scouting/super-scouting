import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CachedRow } from '@/data/db';
import { db } from '@/data/db';
import { pending } from '@/data/outbox';
import { EntryPage } from './EntryPage';

const field = (over: Record<string, unknown>) =>
  ({
    entity: 'form_fields' as const,
    form_version_id: 'fv-1',
    required: false,
    deprecated: false,
    config: {},
    ...over,
  }) as unknown as CachedRow;

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.rows.bulkPut([
    field({
      id: 'f1',
      key: 'auto_notes',
      label: 'Auto notes',
      type: 'counter',
      display_order: 1,
      phase: 'auto',
      unit: 'count',
      direction: 'higher_is_better',
      config: { min: 0, max: 10, step: 1 },
      expected_range: { min: 0, max: 10 },
    }),
    field({
      id: 'f2',
      key: 'notes',
      label: 'Notes',
      type: 'long_text',
      display_order: 2,
      phase: 'post_match',
      unit: 'text',
      direction: 'neutral',
    }),
  ]);
});

const props = {
  eventId: 'ev-1',
  formVersionId: 'fv-1',
  matchId: 'm-1',
  teamId: 't-1',
  alliance: 'red' as const,
  authorUserId: 'u-1',
  teamLabel: '2096 ROBACTIVE',
  matchLabel: 'Q12',
};

describe('EntryPage', () => {
  it('asks for robot status before it shows any scoring field', async () => {
    render(<EntryPage {...props} />);
    expect(await screen.findByRole('group', { name: /robot status/i })).toBeInTheDocument();
    expect(screen.queryByText('Auto notes')).not.toBeInTheDocument();
  });

  it('shows the fields once the robot is marked as played', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    expect(await screen.findByText('Auto notes')).toBeInTheDocument();
  });

  it('hides every field for a no-show, and records no values', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /no show/i }));
    expect(screen.queryByText('Auto notes')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));
    await waitFor(async () => expect((await pending(10))[0]?.payload.data).toEqual({}));
  });

  it('increments a counter by tapping plus, and never renders a text input for it', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    const plus = await screen.findByRole('button', { name: 'Auto notes plus one' });
    await user.click(plus);
    await user.click(plus);
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('2');
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('undoes the last counter tap', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    await user.click(await screen.findByRole('button', { name: 'Auto notes plus one' }));
    await user.click(screen.getByRole('button', { name: 'Auto notes minus one' }));
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('0');
  });

  it('writes a draft on every interaction and recovers it on remount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    await user.click(await screen.findByRole('button', { name: 'Auto notes plus one' }));
    await waitFor(async () => expect(await db.drafts.count()).toBe(1));
    unmount();

    render(<EntryPage {...props} />);
    expect(await screen.findByLabelText('Auto notes value')).toHaveTextContent('1');
  });

  it('shows a confirmation summary of the whole entry before it commits', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    await user.click(await screen.findByRole('button', { name: 'Auto notes plus one' }));
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('2096 ROBACTIVE');
    expect(dialog).toHaveTextContent('Auto notes');
    expect(await pending(10)).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /submit entry/i }));
    await waitFor(async () => expect(await pending(10)).toHaveLength(1));
  });

  it('blocks submission and names the field when a value is outside its expected range', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    const plus = await screen.findByRole('button', { name: 'Auto notes plus one' });
    for (let i = 0; i < 11; i += 1) await user.click(plus);
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Auto notes/);
    expect(await pending(10)).toHaveLength(0);
  });
});
