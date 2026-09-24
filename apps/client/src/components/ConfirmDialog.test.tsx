import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

function Harness(props: {
  onConfirm?: () => void;
  onCancel?: () => void;
  typeToConfirm?: string;
  loss?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open it
      </button>
      <ConfirmDialog
        open={open}
        title="Delete this season?"
        objectName="2026 Reefscape"
        body="Everything in it goes."
        loss={props.loss}
        confirmLabel="Delete 2026 Reefscape"
        typeToConfirm={props.typeToConfirm}
        onConfirm={() => props.onConfirm?.()}
        onCancel={() => {
          props.onCancel?.();
          setOpen(false);
        }}
      />
    </>
  );
}

describe('ConfirmDialog (SPEC-FINAL 17.8: the single destructive pattern)', () => {
  it('names the object, states the loss as a count, and puts the verb on the primary button', async () => {
    render(<Harness loss="This deletes 4 entries." />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open it' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this season?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('2026 Reefscape');
    expect(dialog).toHaveTextContent('Everything in it goes.');
    expect(dialog).toHaveTextContent('This deletes 4 entries.');
    expect(screen.getByRole('button', { name: 'Delete 2026 Reefscape' })).toBeInTheDocument();
  });

  it('puts the first focus on Cancel, never on the destructive button', async () => {
    render(<Harness />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open it' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('Escape cancels without confirming, and focus returns to what opened it', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<Harness onConfirm={onConfirm} onCancel={onCancel} />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Open it' }));
    await u.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open it' })).toHaveFocus();
  });

  it('traps Tab inside the dialog', async () => {
    render(<Harness />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Open it' }));
    await u.tab();
    expect(screen.getByRole('button', { name: 'Delete 2026 Reefscape' })).toHaveFocus();
    await u.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await u.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Delete 2026 Reefscape' })).toHaveFocus();
  });

  it('a plain confirm confirms on the primary button', async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Open it' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Delete 2026 Reefscape' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('typeToConfirm holds the primary button until the exact text is typed', async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} typeToConfirm="2026 Reefscape" />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Open it' }));
    const primary = screen.getByRole('button', { name: 'Delete 2026 Reefscape' });
    expect(primary).toBeDisabled();
    const field = screen.getByLabelText(/type 2026 Reefscape to confirm/i);
    await u.type(field, '2026 reefscape');
    expect(primary).toBeDisabled();
    await u.clear(field);
    await u.type(field, '2026 Reefscape');
    expect(primary).toBeEnabled();
    await u.click(primary);
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
