import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OptionButtons } from './option-buttons';
import { Counter } from './counter';
import toggleSource from './switch.tsx?raw';
import { Switch } from './switch';

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
  // @ts-expect-error jsdom has no animate; a test may have stubbed it
  delete HTMLElement.prototype.animate;
});

function CountingHarness() {
  const [value, setValue] = useState(0);
  return <Counter label="Auto notes" value={value} onChange={setValue} />;
}

describe('OptionButtons', () => {
  it('is a labelled group of native radios, named by aria-label or by their card', async () => {
    const onChange = vi.fn();
    render(
      <OptionButtons
        legend="Alliance"
        name="alliance"
        value={null}
        onChange={onChange}
        options={[
          { value: 'red', label: 'Red', ariaLabel: 'red', accent: 'var(--alliance-red)' },
          { value: 'blue', label: 'Blue', ariaLabel: 'blue', accent: 'var(--alliance-blue)' },
        ]}
      />,
    );
    expect(screen.getByRole('group', { name: 'Alliance' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('radio', { name: 'red' }));
    expect(onChange).toHaveBeenCalledWith('red');
  });

  it('marks only the chosen card, with a check as well as colour (SPEC-FINAL 17.7)', () => {
    const { container } = render(
      <OptionButtons
        legend="Robot status"
        value="no_show"
        onChange={vi.fn()}
        options={[
          { value: 'played', label: 'Played', accent: 'var(--accent)' },
          { value: 'no_show', label: 'No show', accent: 'var(--muted)' },
        ]}
      />,
    );
    const checks = container.querySelectorAll('[data-chosen-mark]');
    expect(checks).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'No show' }).closest('label')).toContainElement(
      checks[0] as HTMLElement,
    );
  });

  it('shows the chosen value as checked', () => {
    render(
      <OptionButtons
        legend="Robot status"
        value="played"
        onChange={vi.fn()}
        options={[
          { value: 'played', label: 'Played' },
          { value: 'no_show', label: 'No show' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Played' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'No show' })).not.toBeChecked();
  });
});

describe('Counter (SPEC-FINAL 17.9: a wide − / value / + triplet)', () => {
  it('counts up and down, never below zero, with no text input', async () => {
    render(<CountingHarness />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Auto notes minus one' }));
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('0');
    await u.click(screen.getByRole('button', { name: 'Auto notes plus one' }));
    await u.click(screen.getByRole('button', { name: 'Auto notes plus one' }));
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('2');
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('confirms each change with one tick on the value, and none on first render', async () => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    const animate = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true });
    render(<CountingHarness />);
    expect(animate).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Auto notes plus one' }));
    expect(animate).toHaveBeenCalledOnce();
  });
});

describe('Switch', () => {
  it('reads its own checkbox only: a named group, never a bare group-has- that an ancestor .group (a phase card) would match', () => {
    expect(toggleSource).toMatch(/group\/toggle/);
    expect(toggleSource).not.toMatch(/group-has-\[[^\]]+\]:/);
  });

  it('is a native checkbox with role switch, named by its label', async () => {
    const onChange = vi.fn();
    render(<Switch label="Left the start line" checked={false} onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole('switch', { name: 'Left the start line' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('OptionButtons in a narrow column (UF.18)', () => {
  const four = [
    { value: 'none', label: 'No climb' },
    { value: 'park', label: 'Parked' },
    { value: 'low', label: 'Low rung' },
    { value: 'high', label: 'High rung' },
  ];
  /** Window-width variants (`sm:` … `2xl:`, `max-lg:`); container ones start with `@`. */
  const WINDOW_VARIANT = /(^|\s)(max-)?(sm|md|lg|xl|2xl):/;

  it('lays four options out by the group’s own width, never the window’s', () => {
    const { container } = render(
      <OptionButtons legend="Climb" value={null} onChange={vi.fn()} options={four} columns={4} />,
    );
    const grid = container.querySelector<HTMLElement>('[data-option-grid]')!;
    // Two columns unless the group itself is wide: a container query on its wrapper.
    expect(grid.className).toMatch(/(^|\s)grid-cols-2(\s|$)/);
    expect(grid.className).toMatch(/(^|\s)@lg:grid-cols-4(\s|$)/);
    expect(grid.parentElement!.className).toMatch(/(^|\s)@container(\s|$)/);
    for (const el of container.querySelectorAll<HTMLElement>('*')) {
      expect(el.getAttribute('class') ?? '', el.tagName).not.toMatch(WINDOW_VARIANT);
    }
  });

  it('a click shows only the chosen border; a key brings the focus ring back', async () => {
    function Harness() {
      const [value, setValue] = useState<string | null>(null);
      return (
        <>
          <OptionButtons legend="Climb" value={value} onChange={setValue} options={four} />
          <button type="button">After</button>
        </>
      );
    }
    render(<Harness />);
    const card = (name: string) => screen.getByRole('radio', { name }).closest('label')!;
    const RING = 'has-[:focus-visible]:outline-2';
    expect(card('Parked').className).toContain(RING);
    const u = userEvent.setup();
    await u.click(card('Parked'));
    expect(screen.getByRole('radio', { name: 'Parked' })).toBeChecked();
    for (const option of four) expect(card(option.label).className).not.toContain(RING);
    // The arrow keys move the choice: the keyboard's ring is back.
    await u.keyboard('{ArrowRight}');
    expect(card('Low rung').className).toContain(RING);
    // A click, then focus leaves the group: coming back by Tab shows the ring.
    await u.click(card('High rung'));
    expect(card('High rung').className).not.toContain(RING);
    await u.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    expect(card('High rung').className).toContain(RING);
  });

  it('a long label wraps inside its card, the ✓ kept clear of the edge', () => {
    render(
      <OptionButtons
        legend="Climb"
        value="long"
        onChange={vi.fn()}
        options={[
          { value: 'long', label: 'Hanging from the highest rung of all' },
          { value: 'none', label: 'No climb' },
        ]}
      />,
    );
    const card = screen.getByRole('radio', { name: /Hanging/ }).closest('label')!;
    const text = screen.getByText('Hanging from the highest rung of all');
    expect(text.className).toMatch(/(^|\s)min-w-0(\s|$)/);
    expect(text.className).toContain('[overflow-wrap:anywhere]');
    expect(card.className).toMatch(/(^|\s)min-w-0(\s|$)/);
    const check = card.querySelector('[data-chosen-mark]')!;
    expect(check.getAttribute('class')).toMatch(/(^|\s)shrink-0(\s|$)/);
  });
});
