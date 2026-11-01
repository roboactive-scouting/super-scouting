import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { shadeFor } from '@frc/shared';
import { ShadedValue, shadeBackground } from './ShadedValue';

const domain = { kind: 'range' as const, min: 0, max: 10 };

describe('ShadedValue (SPEC-FINAL 12.6; THEME "Value shading")', () => {
  it('always prints the value, whatever the shading — best, worst, flat or neutral', () => {
    const cases: [string, Parameters<typeof shadeFor>][] = [
      ['10', [10, domain, 'higher_is_better']],
      ['0', [0, domain, 'higher_is_better']],
      ['7', [7, { kind: 'range', min: 7, max: 7 }, 'higher_is_better']],
      ['8.6', [8.6, domain, 'neutral']],
      ['2', [2, null, 'lower_is_better']],
    ];
    for (const [text, args] of cases) {
      const { unmount } = render(<ShadedValue text={text} shade={shadeFor(...args)} />);
      expect(screen.getByText(text)).toBeInTheDocument();
      unmount();
    }
  });

  it('prints a bare muted em dash, with no chip, when shadeFor returns null (no value)', () => {
    render(<ShadedValue text="12" shade={shadeFor(null, domain, 'higher_is_better')} />);
    const dash = screen.getByText('—');
    expect(dash).toHaveClass('text-muted');
    expect(dash).not.toHaveAttribute('style');
    expect(screen.queryByText('12')).not.toBeInTheDocument();
  });

  it('fills the chip from the ramp: the accent mixed into the surface, 6 % → 52 %', () => {
    render(<ShadedValue text="10" shade={shadeFor(10, domain, 'higher_is_better')} />);
    expect(screen.getByText('10').getAttribute('style')).toContain(
      'color-mix(in srgb, var(--accent) 52%, var(--surface))',
    );
    expect(shadeBackground(shadeFor(0, domain, 'higher_is_better')!)).toBe(
      'color-mix(in srgb, var(--accent) 6%, var(--surface))',
    );
  });

  it('paints neutral and min = max flat --line-2, never a ramp mix', () => {
    render(
      <>
        <ShadedValue text="8.6" shade={shadeFor(8.6, domain, 'neutral')} />
        <ShadedValue
          text="7"
          shade={shadeFor(7, { kind: 'range', min: 7, max: 7 }, 'higher_is_better')}
        />
      </>,
    );
    for (const text of ['8.6', '7']) {
      const chip = screen.getByText(text);
      expect(chip.getAttribute('style')).toContain('var(--line-2)');
      expect(chip.getAttribute('style')).not.toContain('color-mix');
      expect(chip).toHaveAttribute('data-shade', 'flat');
    }
  });
});
