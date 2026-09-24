import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DesktopOnly } from './DesktopOnly';

function setWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: px });
  window.matchMedia = ((query: string) => ({
    matches: px >= 1024,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

describe('DesktopOnly (SPEC-FINAL 17.2)', () => {
  it('renders its children at 1024 px and wider', () => {
    setWidth(1280);
    render(
      <DesktopOnly what="the form builder">
        <p>builder</p>
      </DesktopOnly>,
    );
    expect(screen.getByText('builder')).toBeInTheDocument();
  });

  it('renders one clear panel naming what needs a computer, and never a cramped builder', () => {
    setWidth(640);
    render(
      <DesktopOnly what="the form builder">
        <p>builder</p>
      </DesktopOnly>,
    );
    expect(screen.queryByText('builder')).not.toBeInTheDocument();
    expect(screen.getByRole('heading')).toHaveTextContent(/needs a computer/i);
    expect(screen.getByText(/the form builder/)).toBeInTheDocument();
  });
});
