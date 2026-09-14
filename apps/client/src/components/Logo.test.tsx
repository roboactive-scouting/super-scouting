import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from './Logo';

describe('Logo (SPEC-FINAL 17.4, 17.5)', () => {
  it('renders the lockup on a near-black plate', () => {
    render(<Logo />);
    const img = screen.getByRole('img', { name: /robactive/i });
    expect(img).toHaveAttribute('src', '/brand/logo.png');
    expect(img.parentElement!.className).toContain('brand-plate');
  });

  it('renders the mark alone when asked, for tight spaces', () => {
    render(<Logo variant="mark" />);
    expect(screen.getByRole('img', { name: /robactive/i })).toHaveAttribute(
      'src',
      '/brand/mark.png',
    );
  });
});
