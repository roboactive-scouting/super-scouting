import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Capability } from '@/data/offlineCapability';
import { OFFLINE_GATE_LINE, OfflineGate } from './OfflineGate';
import { Button } from './ui/button';

afterEach(() => vi.restoreAllMocks());

function setOnline(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value);
}

function gate(capability: Capability) {
  return render(
    <MemoryRouter>
      <OfflineGate capability={capability}>
        {(held) => <Button disabled={held}>Save the form</Button>}
      </OfflineGate>
    </MemoryRouter>,
  );
}

describe('OfflineGate (SPEC-FINAL 9.6, task 1.45)', () => {
  it('online: the action is enabled and nothing else is said', () => {
    setOnline(true);
    gate('edit_form');
    expect(screen.getByRole('button', { name: 'Save the form' })).toBeEnabled();
    expect(screen.queryByText(/safe on this device/i)).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('offline: the action is disabled, with the one-line offline notice beneath it', () => {
    setOnline(false);
    gate('edit_form');
    const button = screen.getByRole('button', { name: 'Save the form' });
    expect(button).toBeDisabled();
    // One compact muted line, no card and no button (task 1.45 follow-up).
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    const line = screen.getByText(OFFLINE_GATE_LINE);
    expect(line).toHaveAttribute('role', 'status');
    expect(line).toHaveTextContent(/safe on this device/i);
    // The plan's sentence verbatim, said once.
    expect(line.textContent).toBe(OFFLINE_GATE_LINE);
    // Beneath the action, in document order.
    expect(button.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('going back online re-enables the action and drops the state', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    gate('manage_users');
    expect(screen.getByRole('button', { name: 'Save the form' })).toBeDisabled();

    onLine.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByRole('button', { name: 'Save the form' })).toBeEnabled();
    expect(screen.queryByText(OFFLINE_GATE_LINE)).toBeNull();

    onLine.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('button', { name: 'Save the form' })).toBeDisabled();
    expect(screen.getByText(OFFLINE_GATE_LINE)).toBeInTheDocument();
  });

  it.each([
    'create_entry',
    'self_edit_entry',
    'ensure_match',
    'view_statistics',
    'read_conflicts',
  ] as const)('never gates %s: it works offline', (capability) => {
    setOnline(false);
    gate(capability);
    expect(screen.getByRole('button', { name: 'Save the form' })).toBeEnabled();
    expect(screen.queryByText(OFFLINE_GATE_LINE)).toBeNull();
  });

  it('with no children it is the state alone, for a screen whose controls read the matrix', () => {
    setOnline(false);
    render(
      <MemoryRouter>
        <OfflineGate capability="manage_events" />
      </MemoryRouter>,
    );
    expect(screen.getByText(OFFLINE_GATE_LINE)).toBeInTheDocument();
  });
});
