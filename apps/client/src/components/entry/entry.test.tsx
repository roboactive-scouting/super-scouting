import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChoiceGroup } from './ChoiceGroup';
import { CounterControl } from './CounterControl';
import { ToggleField } from './ToggleField';

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
  // @ts-expect-error jsdom has no animate; a test may have stubbed it
  delete HTMLElement.prototype.animate;
});

function Counter() {
  const [value, setValue] = useState(0);
  return <CounterControl label="Auto notes" value={value} onChange={setValue} />;
}

describe('ChoiceGroup', () => {
  it('is a labelled group of native radios, named by aria-label or by their card', async () => {
    const onChange = vi.fn();
    render(
      <ChoiceGroup
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

  it('shows the chosen value as checked', () => {
    render(
      <ChoiceGroup
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

describe('CounterControl (SPEC-FINAL 17.9: a wide − / value / + triplet)', () => {
  it('counts up and down, never below zero, with no text input', async () => {
    render(<Counter />);
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
    render(<Counter />);
    expect(animate).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Auto notes plus one' }));
    expect(animate).toHaveBeenCalledOnce();
  });
});

describe('ToggleField', () => {
  it('is a native checkbox named by its label', async () => {
    const onChange = vi.fn();
    render(<ToggleField label="Left the start line" checked={false} onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Left the start line' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
