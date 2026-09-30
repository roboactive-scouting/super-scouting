import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Notice } from './notice';

describe('Notice', () => {
  it('carries the role it is given, its text and its one action', () => {
    render(
      <Notice role="status" tone="warning" action={<button type="button">Back to Week 1</button>}>
        You are looking at Week 3 only for this session.
      </Notice>,
    );
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('You are looking at Week 3 only for this session.');
    expect(notice).toContainElement(screen.getByRole('button', { name: 'Back to Week 1' }));
  });

  it('puts the tone on the start edge only and the text on --text', () => {
    render(<Notice tone="danger">Not saved.</Notice>);
    const notice = screen.getByText('Not saved.').parentElement as HTMLElement;
    expect(notice).toHaveClass('border-s-danger');
    expect(notice.className).not.toMatch(/text-danger/);
  });

  it('rises in once by default, and stands still when asked', () => {
    const { rerender } = render(<Notice>Saved</Notice>);
    expect(screen.getByText('Saved').parentElement).toHaveClass('enter-rise');
    rerender(<Notice still>Saved</Notice>);
    expect(screen.getByText('Saved').parentElement).not.toHaveClass('enter-rise');
  });

  it('keeps text that may hold Hebrew direction-neutral', () => {
    render(<Notice>הערה</Notice>);
    expect(screen.getByText('הערה')).toHaveAttribute('dir', 'auto');
  });
});
