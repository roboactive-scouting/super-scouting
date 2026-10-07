import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Tabs } from './tabs';

const TABS = [
  { key: 'seasons', label: 'Seasons' },
  { key: 'events', label: 'Events' },
  { key: 'matches', label: 'Matches' },
] as const;

function Harness() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('seasons');
  return <Tabs label="Manage" tabs={TABS} value={tab} onChange={setTab} />;
}

describe('Tabs (WAI-ARIA tabs pattern)', () => {
  it('is a labelled tablist with the chosen tab selected and alone in the Tab order', () => {
    render(<Harness />);
    expect(screen.getByRole('tablist', { name: 'Manage' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Seasons' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('tabindex', '-1');
  });

  it('chooses on click', async () => {
    render(<Harness />);
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Events' }));
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('aria-selected', 'true');
  });

  it('moves focus with the arrow keys, Home and End, wrapping, and never switches the panel on its own', async () => {
    render(<Harness />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('tab', { name: 'Seasons' }));
    await u.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Seasons' })).toHaveAttribute('aria-selected', 'true');
    await u.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Matches' })).toHaveFocus();
    await u.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Seasons' })).toHaveFocus();
    await u.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Matches' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Seasons' })).toHaveAttribute('aria-selected', 'true');
  });

  it('chooses the focused tab on Enter (manual activation: a half-filled form is never dropped by an arrow)', async () => {
    render(<Harness />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('tab', { name: 'Seasons' }));
    await u.keyboard('{ArrowRight}{Enter}');
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Tabs (RB.3: done and count)', () => {
  it('ticks the done tabs and shows a count beside the label', () => {
    const { container } = render(
      <Tabs
        label="Phases"
        value="auto"
        onChange={() => {}}
        done={new Set(['auto'] as const)}
        tabs={[
          { key: 'auto', label: 'Auto' },
          { key: 'tele', label: 'Teleop', count: 3 },
        ]}
      />,
    );
    expect(container.querySelectorAll('[data-done-mark]')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Auto' })).toHaveAccessibleDescription('Done');
    expect(screen.getByRole('tab', { name: /Teleop/ })).toHaveTextContent('3');
    expect(screen.getByRole('tab', { name: /Teleop/ })).not.toHaveAttribute('aria-describedby');
  });
});
