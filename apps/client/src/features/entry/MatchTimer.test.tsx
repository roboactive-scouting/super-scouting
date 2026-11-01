import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimerConfig } from '@frc/shared';
import type { CachedRow } from '@/data/db';
import { db } from '@/data/db';
import { pending } from '@/data/outbox';
import { EntryPage } from './EntryPage';
import { loadTimedParts } from './lazyParts';
import { matchClock } from './matchClock';
import { MatchTimer } from './MatchTimer';

const CONFIG: TimerConfig = {
  phases: [
    { phase: 'auto', seconds: 15 },
    { phase: 'teleop', seconds: 135 },
    { phase: 'endgame', seconds: 30 },
  ],
};

/** Moves the wall clock only: the timer reads timestamps, and its own tick re-draws it. */
function later(ms: number) {
  act(() => {
    vi.setSystemTime(Date.now() + ms);
  });
}

// EntryPage draws the timer and the timed fields from their own chunk (lazyParts).
beforeAll(async () => {
  await loadTimedParts();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  matchClock.reset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('MatchTimer (SPEC-FINAL 8.4; entry parts "Sticky match timer")', () => {
  it('is not rendered at all when the form has no timer phases', () => {
    const { container } = render(<MatchTimer config={{ phases: [] }} layout="phone" />);
    expect(container).toBeEmptyDOMElement();
    const none = render(<MatchTimer config={null} layout="desktop" />);
    expect(none.container).toBeEmptyDOMElement();
  });

  it('is pinned to the top: position sticky under the top bar (phone) or crumb bar (desktop)', () => {
    render(<MatchTimer config={CONFIG} layout="phone" />);
    const bar = screen.getByRole('region', { name: 'Match timer' });
    expect(bar.className).toMatch(/(^|\s)sticky(\s|$)/);
    expect(bar.className).toContain('top-[var(--top-bar,0px)]');
    // Phase 1 I side task 2: the shell's --top-bar, never a copy of the bar's height.
    expect(bar.className).not.toMatch(/top-\[[^\]]*rem/);
    render(<MatchTimer config={CONFIG} layout="desktop" />);
    const desk = screen.getAllByRole('region', { name: 'Match timer' })[1]!;
    expect(desk.className).toContain('top-[var(--top-bar,0px)]');
  });

  it('starts ready: Start match and the match length; pressing it starts the clock', async () => {
    render(<MatchTimer config={CONFIG} layout="phone" />);
    expect(screen.getByText('3:00 match')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    expect(matchClock.isRunning()).toBe(true);
    // The button becomes the reset (↺), named so (THEME: "a 32 px ↺").
    expect(screen.queryByRole('button', { name: 'Start match' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reset match timer' })).toBeInTheDocument();
  });

  it('shows the current phase and the countdown within it, and the total', async () => {
    render(<MatchTimer config={CONFIG} layout="desktop" />);
    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    later(6_000);
    await waitFor(() => expect(screen.getByTestId('match-countdown')).toHaveTextContent('0:09'));
    expect(screen.getByText('AUTO')).toBeInTheDocument();
    later(42_000); // 48 s: Teleop, 102 s left of its 135
    await waitFor(() =>
      expect(screen.getByTestId('match-countdown')).toHaveTextContent('1:42left in teleop'),
    );
    expect(screen.getByText('TELEOP')).toBeInTheDocument();
    expect(screen.getByText('0:48 / 3:00')).toBeInTheDocument();
    const segments = [...document.querySelectorAll('[data-segment]')].map((s) =>
      s.getAttribute('data-segment'),
    );
    expect(segments).toEqual(['done', 'current', 'rest']);
  });

  it('marks a phase’s last 10 s (amber, a token) and says MATCH OVER at the end', async () => {
    render(<MatchTimer config={CONFIG} layout="phone" />);
    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    later(172_000); // Endgame, 8 s left
    await waitFor(() => expect(screen.getByTestId('match-countdown')).toHaveTextContent('0:08'));
    expect(screen.getByText('ENDGAME')).toBeInTheDocument();
    const countdown = screen.getByTestId('match-countdown');
    expect(countdown).toHaveAttribute('data-warn', 'true');
    expect(countdown.className).toContain('text-timer-warn');
    later(9_000);
    expect(await screen.findByText('MATCH OVER')).toBeInTheDocument();
    expect(screen.getByText('keep entering')).toBeInTheDocument();
  });

  it('reset is undoable from the "Match timer reset · Undo" toast', async () => {
    render(<MatchTimer config={CONFIG} layout="phone" />);
    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    later(30_000);
    fireEvent.click(await screen.findByRole('button', { name: 'Reset match timer' }));
    expect(matchClock.isRunning()).toBe(false);
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Match timer reset');
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(matchClock.isRunning()).toBe(true);
    expect(matchClock.elapsed()).toBeCloseTo(30, 0);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

const field = (over: Record<string, unknown>) =>
  ({
    entity: 'form_fields' as const,
    form_version_id: 'fv-1',
    required: false,
    deprecated: false,
    config: {},
    help_text: null,
    ...over,
  }) as unknown as CachedRow;

describe('MatchTimer: what must never happen (SPEC-FINAL 8.4)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.rows.bulkPut([
      field({
        id: 'f1',
        key: 'auto_high',
        label: 'Pieces scored high',
        type: 'counter',
        display_order: 1,
        phase: 'auto',
        unit: 'count',
        direction: 'higher_is_better',
        config: { min: 0, step: 1 },
      }),
      field({
        id: 'f2',
        key: 'tele_shots',
        label: 'Shots',
        type: 'event_log',
        display_order: 2,
        phase: 'auto',
        unit: 'count',
        direction: 'higher_is_better',
        config: { event_types: [{ value: 'high', label: 'High goal' }] },
      }),
      field({
        id: 'f3',
        key: 'auto_climb_time',
        label: 'Climb time',
        type: 'timer',
        display_order: 3,
        phase: 'auto',
        unit: 'seconds',
        direction: 'lower_is_better',
        config: { allow_unsure: true },
      }),
      field({
        id: 'f4',
        key: 'notes',
        label: 'Notes',
        type: 'long_text',
        display_order: 4,
        phase: 'post_match',
        unit: 'text',
        direction: 'neutral',
      }),
    ]);
  });

  it('never disables a field, never opens or closes a phase and never submits, past t_end', async () => {
    render(
      <MemoryRouter>
        <EntryPage
          eventId="ev-1"
          formVersionId="fv-1"
          matchId="m-1"
          teamId="t-1"
          alliance="red"
          author={{ id: 'u-1', role: 'scouter' }}
          teamLabel="2096 ROBACTIVE"
          matchLabel="Q12"
          timerConfig={CONFIG}
          fieldImagePath="seasons/2026/field.webp"
        />
      </MemoryRouter>,
    );
    await screen.findByRole('group', { name: /robot status/i });
    await userEvent.click(screen.getByRole('radio', { name: 'Played' }));
    const autoTab = () => screen.getByRole('tab', { name: /Auto/ });
    expect(autoTab()).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Start match' }));
    // Through Teleop and Endgame, then past the end of the match.
    later(20_000);
    expect(await screen.findByText('TELEOP')).toBeInTheDocument();
    later(170_000);
    expect(await screen.findByText('MATCH OVER')).toBeInTheDocument();

    // The phase on screen is still the one the scout chose; no phase was opened or closed.
    expect(autoTab()).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    // Every input is still enabled, and still works.
    const controls = [
      ...screen.getAllByRole('button'),
      ...screen.queryAllByRole('switch'),
      ...screen.queryAllByRole('radio'),
    ];
    expect(controls.length).toBeGreaterThan(5);
    for (const control of controls) {
      expect(control).toBeEnabled();
      expect(control).not.toHaveAttribute('aria-disabled', 'true');
    }
    await userEvent.click(screen.getByRole('button', { name: 'Pieces scored high plus one' }));
    expect(screen.getByLabelText('Pieces scored high value')).toHaveTextContent('1');
    await userEvent.click(screen.getByRole('button', { name: /^High goal, 0 taps$/ }));
    expect(screen.getByRole('button', { name: /^High goal, 1 tap$/ })).toBeInTheDocument();
    // Nothing was submitted: no confirm opened and nothing queued to send.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await pending(100)).toHaveLength(0);
    await userEvent.click(screen.getByRole('tab', { name: /Notes/ }));
    expect(screen.getByRole('textbox', { name: 'Notes' })).toBeEnabled();
  });
});
