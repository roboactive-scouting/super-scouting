import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fitColumns, OptionButtons } from './option-buttons';
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
    // 26 rem: under the entry's 440 px desktop control column (task 1.33).
    expect(grid.className).toMatch(/(^|\s)@min-\[26rem\]:grid-cols-4(\s|$)/);
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
    // Between words only; a word breaks only when wider than one column (side task 3).
    expect(text.className).toContain('[overflow-wrap:break-word]');
    expect(text.className).not.toContain('anywhere');
    expect(card.className).toMatch(/(^|\s)min-w-0(\s|$)/);
    const check = card.querySelector('[data-chosen-mark]')!;
    expect(check.getAttribute('class')).toMatch(/(^|\s)shrink-0(\s|$)/);
  });
});

describe('OptionButtons never split a word (Phase 1 H side task 3)', () => {
  const FOUR = 'grid-cols-4';
  /** The measured widths jsdom cannot lay out: the grid, and the probe card for the longest word. */
  const size = { grid: 440, probe: 0 };
  let resize: (() => void) | undefined;
  const realRect = Element.prototype.getBoundingClientRect;
  beforeEach(() => {
    resize = undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          resize = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const width = this.hasAttribute('data-option-grid')
        ? size.grid
        : this.hasAttribute('data-option-probe')
          ? size.probe
          : 0;
      return { width } as DOMRect;
    };
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Element.prototype.getBoundingClientRect = realRect;
  });

  const endGame = [
    { value: 'none', label: 'None' },
    { value: 'park', label: 'Parked' },
    { value: 'def', label: 'Defense' },
    { value: 'he', label: 'חנייה חלקית' },
  ];
  const grid = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-option-grid]')!;

  it('the rule: the most columns at which the longest word fits beside its ✓', () => {
    // 440 px, 8 px gaps: a card is 104 px at four columns, 216 px at two.
    expect(fitColumns(96, 440, 8)).toBe(4);
    expect(fitColumns(104, 440, 8)).toBe(4);
    expect(fitColumns(118, 440, 8)).toBe(2);
    expect(fitColumns(216, 440, 8)).toBe(2);
    expect(fitColumns(240, 440, 8)).toBe(1);
  });

  it('the whole group drops to two columns when its longest word does not fit at four', () => {
    size.probe = 118; // "Defense" with its ✓, wider than a 110 px quarter
    const { container } = render(
      <OptionButtons
        legend="End game"
        value="park"
        onChange={vi.fn()}
        options={endGame}
        columns={4}
      />,
    );
    expect(grid(container).dataset.fit).toBe('2');
    expect(grid(container).className).not.toContain(FOUR);
    expect(grid(container).className).toMatch(/(^|\s)grid-cols-2(\s|$)/);
  });

  it('a group whose longest word fits keeps four columns', () => {
    size.probe = 96;
    const { container } = render(
      <OptionButtons
        legend="Fouls"
        value="1"
        onChange={vi.fn()}
        options={['0', '1', '2', '3+'].map((v) => ({ value: v, label: v }))}
        columns={4}
      />,
    );
    expect(grid(container).dataset.fit).toBe('4');
    expect(grid(container).className).toMatch(/(^|\s)@min-\[26rem\]:grid-cols-4(\s|$)/);
  });

  it('re-measures when the group or its words change size, and goes to one column last', () => {
    size.probe = 96;
    const { container } = render(
      <OptionButtons
        legend="End game"
        value={null}
        onChange={vi.fn()}
        options={endGame}
        columns={4}
      />,
    );
    expect(grid(container).className).toContain(FOUR);
    size.probe = 240; // a large text size: wider than half the group
    act(() => resize!());
    expect(grid(container).dataset.fit).toBe('1');
    expect(grid(container).className).toMatch(/(^|\s)grid-cols-1(\s|$)/);
    expect(grid(container).className).not.toContain(FOUR);
    size.probe = 96;
    act(() => resize!());
    expect(grid(container).className).toContain(FOUR);
  });

  it('a hidden group (no width) keeps its last answer', () => {
    size.probe = 118;
    const { container } = render(
      <OptionButtons
        legend="End game"
        value={null}
        onChange={vi.fn()}
        options={endGame}
        columns={4}
      />,
    );
    size.grid = 0;
    act(() => resize!());
    expect(grid(container).dataset.fit).toBe('2');
    size.grid = 440;
  });

  it('the probe holds every word once, with the ✓, and no text query finds it', () => {
    const { container } = render(
      <OptionButtons
        legend="End game"
        value={null}
        onChange={vi.fn()}
        options={endGame}
        columns={4}
      />,
    );
    const probe = container.querySelector<HTMLElement>('[data-option-probe]')!;
    const words = [...probe.querySelectorAll('[data-word]')].map((w) =>
      w.getAttribute('data-word'),
    );
    expect(words).toEqual(['None', 'Parked', 'Defense', 'חנייה', 'חלקית']);
    expect(probe.querySelector('svg')).not.toBeNull();
    expect(probe.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(probe.textContent).toBe('');
    expect(screen.getAllByText('Parked')).toHaveLength(1);
  });
});
