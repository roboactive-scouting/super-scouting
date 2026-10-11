import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toast } from './toast';

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast (task 1.34)', () => {
  it('says its line politely and runs its action once, then goes', () => {
    const onClick = vi.fn();
    const onDismiss = vi.fn();
    render(
      <Toast
        open
        message="Match timer reset"
        action={{ label: 'Undo', onClick }}
        onDismiss={onDismiss}
      />,
    );
    const toast = screen.getByRole('status');
    expect(toast).toHaveAttribute('aria-live', 'polite');
    expect(toast).toHaveTextContent('Match timer reset');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('goes by itself after its timeout, so the undo is offered only while fresh', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <Toast
        open
        message="Match timer reset"
        action={{ label: 'Undo', onClick: vi.fn() }}
        onDismiss={onDismiss}
        timeoutMs={8_000}
      />,
    );
    act(() => vi.advanceTimersByTime(7_999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('draws nothing while closed', () => {
    render(
      <Toast
        open={false}
        message="x"
        action={{ label: 'Undo', onClick: vi.fn() }}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.queryByRole('status')).toBeNull();
  });
});
