import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './dialog';
import { Sheet } from './sheet';

/** THEME "Delete bill" (task 1.61): the `--ink` band above the title, on both surfaces. */
describe('the band of a dialog and a bottom sheet', () => {
  it('a dialog draws the band first, edge to edge, then the title and the body', () => {
    render(
      <Dialog open title="Delete Season 2025?" onClose={vi.fn()} band={<p>1912 entries go</p>}>
        <p>Body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Delete Season 2025?' });
    const band = dialog.querySelector('[data-band]')!;
    expect(band).toHaveTextContent('1912 entries go');
    expect(band).toHaveClass('bg-ink', 'text-surface');
    expect(dialog.firstElementChild).toBe(band);
    const heading = screen.getByRole('heading', { name: 'Delete Season 2025?' });
    expect(band.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a dialog without a band is drawn as before', () => {
    render(
      <Dialog open title="Edit 2025" onClose={vi.fn()}>
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog').querySelector('[data-band]')).toBeNull();
    expect(screen.getByRole('dialog')).toHaveClass('px-6');
  });

  it("a bottom sheet's band holds the grab handle and is what a drag pulls", () => {
    render(
      <Sheet open side="bottom" title="Q41 has entries" onClose={vi.fn()} band={<p>6 entries</p>}>
        <p>Body</p>
      </Sheet>,
    );
    const sheet = screen.getByRole('dialog', { name: 'Q41 has entries' });
    const band = sheet.querySelector('[data-band]')!;
    expect(band).toHaveAttribute('data-drag-handle');
    expect(band).toHaveTextContent('6 entries');
    expect(sheet.querySelectorAll('[data-drag-handle]')).toHaveLength(1);
  });
});
