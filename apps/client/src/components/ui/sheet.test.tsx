import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Sheet } from './sheet';

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open the menu
      </button>
      <Sheet
        open={open}
        title="Menu"
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
      >
        <p>Some words</p>
        <button type="button">First</button>
        <a href="/last">Last</a>
      </Sheet>
    </>
  );
}

describe('Sheet', () => {
  it('opens as a labelled modal dialog with focus on its first control', async () => {
    render(<Harness />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open the menu' }));
    expect(screen.getByRole('dialog', { name: 'Menu' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('closes at once on Escape and hands focus back to what opened it', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Open the menu' }));
    await u.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open the menu' })).toHaveFocus();
  });

  it('keeps Tab inside', async () => {
    render(<Harness />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Open the menu' }));
    await u.tab();
    expect(screen.getByRole('link', { name: 'Last' })).toHaveFocus();
    await u.tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('still closes on Escape after a click on text inside it', async () => {
    render(<Harness />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Open the menu' }));
    await u.click(screen.getByText('Some words'));
    expect(screen.getByRole('dialog', { name: 'Menu' })).toHaveFocus();
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when the scrim is tapped', async () => {
    render(<Harness />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Open the menu' }));
    await u.click(document.querySelector('[data-sheet-scrim]') as HTMLElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Sheet (RB.3)', () => {
  it('takes `title` as its name', () => {
    render(
      <Sheet open side="start" title="Menu" onClose={() => {}}>
        <button type="button">A</button>
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeInTheDocument();
  });

  it('a bottom sheet shows its title as the heading that names it', () => {
    render(
      <Sheet open side="bottom" title="Switch competition" onClose={() => {}}>
        <button type="button">A</button>
      </Sheet>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Switch competition' });
    expect(dialog).toHaveAttribute('data-surface', 'sheet');
    expect(screen.getByRole('heading', { name: 'Switch competition' })).toBeInTheDocument();
  });

  it('holds Escape and the scrim while not dismissible', async () => {
    const onClose = vi.fn();
    render(
      <Sheet open side="bottom" title="Busy" dismissible={false} onClose={onClose}>
        <button type="button">A</button>
      </Sheet>,
    );
    await userEvent.keyboard('{Escape}');
    await userEvent.click(document.querySelector('[data-sheet-scrim]') as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });
});
