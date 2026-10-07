import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TeamCard } from './TeamCard';

function renderCard() {
  const onRename = vi.fn();
  render(
    <ul>
      <TeamCard number={1690} name="Orbit" busy={false} onAction={vi.fn()} onRename={onRename} />
    </ul>,
  );
  return onRename;
}

/** A browser fires `blur` as the field goes away, in the same batch as the key press. */
function keyThenBlur(field: HTMLElement, key: string) {
  act(() => {
    fireEvent.keyDown(field, { key });
    fireEvent.blur(field);
  });
}

describe('TeamCard rename', () => {
  it('Escape then blur sends nothing', async () => {
    const onRename = renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'Orbit' }));
    const field = screen.getByLabelText('Team name');
    await userEvent.type(field, ' 2');
    keyThenBlur(field, 'Escape');
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Orbit' })).toBeInTheDocument();
  });

  it('Enter then blur sends exactly one rename', async () => {
    const onRename = renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'Orbit' }));
    const field = screen.getByLabelText('Team name');
    await userEvent.type(field, ' 2');
    keyThenBlur(field, 'Enter');
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith('Orbit 2');
  });

  it('a second edit session saves again', async () => {
    const onRename = renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'Orbit' }));
    await userEvent.type(screen.getByLabelText('Team name'), ' 2{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Orbit' }));
    await userEvent.type(screen.getByLabelText('Team name'), '3{Enter}');
    expect(onRename).toHaveBeenCalledTimes(2);
  });
});
