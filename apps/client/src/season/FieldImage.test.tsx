import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FieldImage } from './FieldImage';

describe('FieldImage', () => {
  it('renders the game image when the path is a committed one', () => {
    render(<FieldImage path="seasons/2026/field.webp" alt="2026 field" />);
    expect(screen.getByRole('img', { name: '2026 field' })).toHaveAttribute(
      'src',
      '/seasons/2026/field.webp',
    );
  });

  it('fails loudly for a missing image and never renders a blank canvas', () => {
    render(<FieldImage path="seasons/1999/field.webp" alt="1999 field" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/game image is missing/i);
    expect(alert).toHaveTextContent('seasons/1999/field.webp');
    expect(alert).toHaveTextContent(/commit it and redeploy/i);
  });
});
