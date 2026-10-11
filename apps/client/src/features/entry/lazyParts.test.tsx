import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormFieldDefinition } from '@frc/shared';
import {
  CyclePathInput,
  EventLogInput,
  loadTimedParts,
  MatchTimer,
  PositionInput,
  setTimedPartsImportForTests,
  TimerInput,
} from './lazyParts';

const field = (over: Partial<FormFieldDefinition>): FormFieldDefinition => ({
  id: 'f',
  key: 'tele_shots',
  label: 'Shots',
  help_text: null,
  type: 'event_log',
  section: null,
  display_order: 1,
  required: false,
  default_value: null,
  config: { event_types: [{ value: 'high', label: 'High goal' }] },
  visibility_condition: null,
  deprecated: false,
  description: 'x',
  unit: 'count',
  phase: 'teleop',
  direction: 'higher_is_better',
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
  ...over,
});

const realImport = () => import('./timedParts');
/** The chunk's import failing once (an interrupted load, a renamed chunk), then working. */
const failingOnce = () => {
  let calls = 0;
  return vi.fn(() => {
    calls += 1;
    return calls === 1
      ? Promise.reject(new TypeError('Failed to fetch dynamically imported module'))
      : realImport();
  });
};

const unhandled = vi.fn();
beforeEach(() => {
  unhandled.mockClear();
  process.on('unhandledRejection', unhandled);
});
afterEach(() => {
  process.off('unhandledRejection', unhandled);
});
afterAll(async () => {
  setTimedPartsImportForTests(null);
  await loadTimedParts();
});

describe('the timed parts chunk fails loudly and can be tried again (task 1.34, fix round 1)', () => {
  it('a failed load is not kept: the next call tries the import again', async () => {
    const load = failingOnce();
    setTimedPartsImportForTests(load);
    await expect(loadTimedParts()).rejects.toThrow('Failed to fetch');
    await expect(loadTimedParts()).resolves.toHaveProperty('EventLogInput');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('an event log whose chunk failed shows an alert in its place and records nothing; Try again draws it', async () => {
    setTimedPartsImportForTests(failingOnce());
    const onChange = vi.fn();
    render(
      <EventLogInput field={field({})} value={[{ type: 'high', t: 4 }]} onChange={onChange} />,
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("“Shots” didn't load.");
    expect(alert).toHaveTextContent('What is already entered is kept.');
    // A warning, never red (red is the red alliance).
    expect(alert.className).toContain('border-s-warn');
    expect(onChange).not.toHaveBeenCalled();
    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(retry.className).toContain('tap-target');
    fireEvent.click(retry);
    expect(await screen.findByRole('button', { name: 'High goal, 1 tap' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('a Timer field says so too, and comes back on Try again with its value untouched', async () => {
    setTimedPartsImportForTests(failingOnce());
    const onChange = vi.fn();
    render(
      <TimerInput
        field={field({ key: 'climb', label: 'Climb time', type: 'timer', config: {} })}
        value={8.2}
        onChange={onChange}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent("“Climb time” didn't load.");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Paused')).toBeInTheDocument();
    expect(screen.getByTestId('timer-face')).toHaveTextContent('8.2');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('the map fields say so too, and come back on Try again with their marks untouched (task 1.35)', async () => {
    setTimedPartsImportForTests(failingOnce());
    const onChange = vi.fn();
    render(
      <>
        <PositionInput
          field={field({
            key: 'auto_spots',
            label: 'Scoring spots',
            type: 'position',
            config: { multi_point: true, mirror_axis: 'none' },
          })}
          value={[{ x: 0.2, y: 0.3 }]}
          onChange={onChange}
        />
        <CyclePathInput
          field={field({
            key: 'tele_routes',
            label: 'Cycle routes',
            type: 'cycle_path',
            config: { max_points_per_cycle: 6, mirror_axis: 'none' },
          })}
          value={[[{ x: 0.2, y: 0.3 }], [{ x: 0.5, y: 0.5 }]]}
          onChange={onChange}
        />
      </>,
    );
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((a) => a.textContent)).toEqual([
      expect.stringContaining("“Scoring spots” didn't load."),
      expect.stringContaining("“Cycle routes” didn't load."),
    ]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0]!);
    expect(await screen.findByRole('button', { name: /^Scoring spots: / })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: /^Cycle routes: / })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('the sticky timer becomes one slim line in its place, and only for a form with a timer', async () => {
    setTimedPartsImportForTests(failingOnce());
    const config = { phases: [{ phase: 'auto' as const, seconds: 15 }] };
    render(<MatchTimer config={config} layout="phone" />);
    expect(await screen.findByRole('alert')).toHaveTextContent("The match timer didn't load.");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Start match' })).toBeInTheDocument();
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('a form with no timer shows nothing even when the chunk fails', async () => {
    const load = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    setTimedPartsImportForTests(load);
    const { container } = render(<MatchTimer config={{ phases: [] }} layout="phone" />);
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
    expect(unhandled).not.toHaveBeenCalled();
  });
});
