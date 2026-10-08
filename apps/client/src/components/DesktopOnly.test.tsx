import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
      <MemoryRouter>
        <DesktopOnly what="the form builder">
          <p>builder</p>
        </DesktopOnly>
      </MemoryRouter>,
    );
    expect(screen.getByText('builder')).toBeInTheDocument();
  });

  it('renders one clear panel naming what needs a computer, and never a cramped builder', () => {
    setWidth(640);
    render(
      <MemoryRouter>
        <DesktopOnly what="the form builder">
          <p>builder</p>
        </DesktopOnly>
      </MemoryRouter>,
    );
    expect(screen.queryByText('builder')).not.toBeInTheDocument();
    expect(screen.getByRole('heading')).toHaveTextContent(/needs a computer/i);
    expect(screen.getByText(/the form builder/)).toBeInTheDocument();
  });

  it('is never a dead end: a secondary "Back to scouting" goes to Scout (THEME desktop-only gate)', () => {
    setWidth(375);
    render(
      <MemoryRouter>
        <DesktopOnly what="the user administration page">
          <p>builder</p>
        </DesktopOnly>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Back to scouting' })).toHaveAttribute(
      'href',
      '/scout',
    );
  });
});
