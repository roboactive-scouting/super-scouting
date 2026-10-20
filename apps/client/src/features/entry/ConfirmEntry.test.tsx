import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FormFieldDefinition } from '@frc/shared';
import { ConfirmEntry } from './ConfirmEntry';
import { EntryContext } from './entryContext';
import { loadTimedParts } from './lazyParts';
import { phasesOf } from './phases';

// The view-only map comes in the timed parts' chunk (lazyParts): in before any test opens it.
beforeAll(async () => {
  await loadTimedParts();
});

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

/** A phone: every media query answers no (jsdom has no matchMedia, so the default is desktop). */
function asPhone() {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

let order = 0;
const f = (over: Partial<FormFieldDefinition>): FormFieldDefinition => ({
  id: `f-${over.key}`,
  key: 'k',
  label: 'Label',
  help_text: null,
  type: 'counter',
  section: null,
  display_order: ++order,
  required: false,
  default_value: null,
  config: {},
  visibility_condition: null,
  deprecated: false,
  description: 'x',
  unit: 'count',
  phase: 'auto',
  direction: 'neutral',
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
  ...over,
});

const MIRROR = { mirror_axis: 'horizontal' };

const FIELDS = [
  f({ key: 'start', label: 'Starting position', type: 'position', config: { ...MIRROR } }),
  f({ key: 'auto_path', label: 'Auto path', type: 'cycle_path', config: { ...MIRROR } }),
  f({
    key: 'shots',
    label: 'Shooting position',
    type: 'position',
    config: { multi_point: true, ...MIRROR },
  }),
  f({
    key: 'tele_events',
    label: 'Teleop events',
    type: 'event_log',
    phase: 'teleop',
    config: {
      ask_position: true,
      ...MIRROR,
      event_types: [
        { value: 'high', label: 'Scored high' },
        { value: 'low', label: 'Scored low' },
        { value: 'miss', label: 'Missed' },
        { value: 'def', label: 'Defended' },
      ],
    },
  }),
  f({
    key: 'fouls',
    label: 'Fouls',
    type: 'event_log',
    phase: 'teleop',
    config: { event_types: [{ value: 'foul', label: 'Foul' }] },
  }),
  f({ key: 'tele_high', label: 'Pieces high', type: 'counter', phase: 'teleop' }),
];

const DATA: Record<string, unknown> = {
  start: { x: 0.27, y: 0.3 },
  auto_path: [
    [
      { x: 0.27, y: 0.3 },
      { x: 0.3, y: 0.4 },
      { x: 0.45, y: 0.33 },
      { x: 0.41, y: 0.45 },
      { x: 0.37, y: 0.46 },
    ],
    [
      { x: 0.37, y: 0.53 },
      { x: 0.46, y: 0.68 },
      { x: 0.41, y: 0.6 },
      { x: 0.37, y: 0.54 },
    ],
  ],
  shots: [],
  tele_events: [
    { type: 'high', t: 12, x: 0.26, y: 0.4 },
    { type: 'high', t: 31, x: 0.24, y: 0.62 },
    { type: 'miss', t: 40, x: 0.4, y: 0.7 },
    { type: 'def', t: 65 },
    { type: 'low', t: 82, x: 0.3, y: 0.56 },
  ],
  fouls: [
    { type: 'foul', t: 20 },
    { type: 'foul', t: 90 },
  ],
  tele_high: 4,
};

function Confirm({
  data = DATA,
  onBack = vi.fn(),
}: {
  data?: Record<string, unknown>;
  onBack?: () => void;
}) {
  return (
    <EntryContext
      value={{
        alliance: 'red',
        station: 'R1',
        fieldImagePath: 'seasons/2026/field.webp',
        caption: 'Q39 · 2630',
      }}
    >
      <ConfirmEntry
        open
        matchLabel="Q39"
        teamLabel="2630 Thunderbolts"
        status="played"
        phases={phasesOf(FIELDS)}
        data={data}
        windowApplies
        error={null}
        errorRef={createRef()}
        onBack={onBack}
        onSubmit={vi.fn()}
      />
    </EntryContext>
  );
}

const confirmation = () => screen.getByRole('dialog', { name: 'Confirm this entry' });
const valueOf = (label: string) =>
  within(confirmation()).getByText(label, { selector: 'dt' }).nextElementSibling;

describe('ConfirmEntry: map fields as compact rows (UF.24)', () => {
  it('words each map field as its map button does, with Click to view, the whole row a button', () => {
    render(<Confirm />);
    const dialog = confirmation();
    const rows: [string, string][] = [
      ['Starting position', '1 spot'],
      ['Auto path', '2 paths · 9 spots'],
      ['Teleop events', '5 events · 4 on the map'],
    ];
    for (const [label, words] of rows) {
      const row = within(dialog).getByRole('button', { name: `${label}: ${words}` });
      expect(row).toHaveAccessibleDescription('Click to view');
      expect(row).toHaveTextContent(`${label}${words}Click to view`);
      expect(row).toHaveClass('tap-target', 'w-full');
      // The name stays the list's term.
      expect(within(dialog).getByText(label, { selector: 'dt' })).toBeInTheDocument();
    }
    // No picture of the field in the confirmation.
    expect(within(dialog).queryByRole('img')).not.toBeInTheDocument();
    expect(dialog.querySelector('img')).toBeNull();
  });

  it('says Tap to view on a phone', () => {
    asPhone();
    render(<Confirm />);
    expect(
      within(confirmation()).getByRole('button', {
        name: 'Teleop events: 5 events · 4 on the map',
      }),
    ).toHaveAccessibleDescription('Tap to view');
  });

  it('an empty map field is a plain row with "—", not a button', () => {
    render(<Confirm />);
    expect(valueOf('Shooting position')).toHaveTextContent(/^—$/);
    expect(
      within(confirmation()).queryByRole('button', { name: /^Shooting position/ }),
    ).not.toBeInTheDocument();
  });

  it('an event log that never asks where reads its count, a plain row', () => {
    render(<Confirm />);
    expect(valueOf('Fouls')).toHaveTextContent(/^2 events$/);
    expect(
      within(confirmation()).queryByRole('button', { name: /^Fouls/ }),
    ).not.toBeInTheDocument();
    // Every other row is as it was.
    expect(valueOf('Pieces high')).toHaveTextContent('4');
  });
});

describe('ConfirmEntry: the map, view only (UF.24)', () => {
  const NO_TOOLS = /^(Undo|Clear|Clear all|Clear path|Remove|New path|Finish|Done|Save tap|Skip)/;

  it('opens the event log view only: no tools, a View only tag, the station, numbered spots', async () => {
    const user = userEvent.setup();
    render(<Confirm />);
    await user.click(
      screen.getByRole('button', { name: 'Teleop events: 5 events · 4 on the map' }),
    );
    const map = screen.getByRole('dialog', { name: 'Teleop events' });
    expect(map).toHaveTextContent('Q39 · 2630 · Teleop');
    expect(within(map).getByText('View only')).toBeInTheDocument();
    expect(within(map).getByText('Red 1')).toBeInTheDocument();
    expect(within(map).queryAllByRole('button', { name: NO_TOOLS })).toEqual([]);
    // The header's ✕ (named Close) and the secondary Close at the foot.
    expect(within(map).getAllByRole('button', { name: 'Close' })).toHaveLength(2);
    // The spots, numbered in event order: the 4th event has no place, so 1 2 3 5.
    const spots = map.querySelectorAll('[data-mark="own"]');
    expect([...spots].map((s) => s.textContent)).toEqual(['1', '2', '3', '5']);
    expect(within(map).getByTestId('map-status')).toHaveTextContent('5 events · 4 on the map');
    expect(within(map).getByText('Numbers follow the order of the events below')).toBeVisible();
  });

  it('lists the events as chips in order, with their times and "no place"', async () => {
    const user = userEvent.setup();
    render(<Confirm />);
    await user.click(screen.getByRole('button', { name: /^Teleop events: / }));
    const list = screen.getByRole('list', { name: 'Teleop events, in order' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      '1Scored high0:12',
      '2Scored high0:31',
      '3Missed0:40',
      '–Defended1:05no place',
      '5Scored low1:22',
    ]);
    // No ✕ on a chip: nothing can be removed here.
    expect(within(list).queryByRole('button')).not.toBeInTheDocument();
  });

  it('a tap on the field adds nothing, and nothing on it can be picked', async () => {
    const user = userEvent.setup();
    render(<Confirm />);
    await user.click(screen.getByRole('button', { name: /^Starting position: / }));
    const map = screen.getByRole('dialog', { name: 'Starting position' });
    const drawing = within(map).getByTestId('map-drawing');
    expect(drawing).toHaveAccessibleName('The field, view only');
    expect(map.querySelectorAll('[data-mark]')).toHaveLength(1);
    await user.click(drawing);
    await user.click(drawing);
    expect(map.querySelectorAll('[data-mark]')).toHaveLength(1);
    // The spot is drawn, not a button: no select, no ✕ Remove.
    expect(within(map).queryByRole('button', { name: /^Spot/ })).not.toBeInTheDocument();
    expect(within(map).queryAllByRole('button', { name: NO_TOOLS })).toEqual([]);
    expect(within(map).getByTestId('map-status')).toHaveTextContent('1 spot');
  });

  it('a cycle path shows its routes and the count, with nothing to select', async () => {
    const user = userEvent.setup();
    render(<Confirm />);
    await user.click(screen.getByRole('button', { name: /^Auto path: / }));
    const map = screen.getByRole('dialog', { name: 'Auto path' });
    expect(map.querySelectorAll('[data-path="done"]')).toHaveLength(2);
    expect(map.querySelectorAll('[data-path-point]')).toHaveLength(9);
    expect(within(map).queryByRole('button', { name: /^Path \d/ })).not.toBeInTheDocument();
    expect(within(map).queryAllByRole('button', { name: NO_TOOLS })).toEqual([]);
    expect(within(map).getByTestId('map-status')).toHaveTextContent('2 paths · 9 spots');
  });

  it('a phone draws it full screen, the own end at the bottom, as editing does', async () => {
    asPhone();
    const user = userEvent.setup();
    render(<Confirm />);
    await user.click(screen.getByRole('button', { name: /^Teleop events: / }));
    const map = screen.getByRole('dialog', { name: 'Teleop events' });
    expect(map).toHaveAttribute('data-surface', 'map');
    expect(within(map).getByTestId('map-drawing')).toHaveAttribute('data-rotation', '270');
    expect(within(map).getByText('View only')).toBeInTheDocument();
    expect(within(map).getAllByRole('button', { name: 'Close' }).at(-1)).toHaveTextContent('Close');
  });

  it('Close keeps the confirmation open with every value, and focus goes back to the row', async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<Confirm onBack={onBack} />);
    const row = screen.getByRole('button', { name: 'Auto path: 2 paths · 9 spots' });
    await user.click(row);
    const map = screen.getByRole('dialog', { name: 'Auto path' });
    // The desktop dialog's × and the Close at the foot both close it; Close is the foot's.
    const closes = within(map).getAllByRole('button', { name: 'Close' });
    await user.click(closes.at(-1)!);
    expect(screen.queryByRole('dialog', { name: 'Auto path' })).not.toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    expect(confirmation()).toBeInTheDocument();
    expect(row).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Auto path: 2 paths · 9 spots' })).toBe(row);
    expect(valueOf('Pieces high')).toHaveTextContent('4');
    expect(screen.getByRole('button', { name: 'Starting position: 1 spot' })).toBeInTheDocument();
  });

  it('Escape closes only the map; the confirmation stays', async () => {
    asPhone();
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<Confirm onBack={onBack} />);
    const row = screen.getByRole('button', { name: /^Teleop events: / });
    await user.click(row);
    expect(screen.getByRole('dialog', { name: 'Teleop events' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Teleop events' })).not.toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    expect(confirmation()).toBeInTheDocument();
    expect(row).toHaveFocus();
  });

  it('opens from the keyboard', async () => {
    const user = userEvent.setup();
    render(<Confirm />);
    screen.getByRole('button', { name: /^Starting position: / }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: 'Starting position' })).toBeInTheDocument();
  });
});
