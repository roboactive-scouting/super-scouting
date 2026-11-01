import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { HEBREW_KEYBOARD_LINE, hasHebrew, KeyboardHint, PasswordInput } from './password-input';

function Controlled({ start = '' }: { start?: string }) {
  const [value, setValue] = useState(start);
  return (
    <>
      <label>
        Password
        {/* A caller's dir is ignored: credentials are always left-to-right. */}
        <PasswordInput dir="auto" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <output>{value}</output>
    </>
  );
}

describe('sign-in fields stay left-to-right in Hebrew (Phase 1 H side task 1)', () => {
  it('finds any Hebrew letter, final forms included, and nothing else', () => {
    expect(hasHebrew('שלום')).toBe(true);
    expect(hasHebrew('abcך')).toBe(true);
    expect(hasHebrew('seedpass1')).toBe(false);
    expect(hasHebrew('')).toBe(false);
    expect(hasHebrew('dana٣ é ß')).toBe(false);
  });

  it('the password field is left-to-right with left-aligned text and the eye room', () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('dir', 'ltr');
    expect(input).toHaveClass('text-left', 'pe-12');
  });

  it('Hebrew text shows the quiet keyboard line, and the value is kept as typed', async () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Password');
    await userEvent.type(input, 'שדג');
    const line = screen.getByText(HEBREW_KEYBOARD_LINE);
    expect(line).toHaveClass('text-muted');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).toHaveAccessibleDescription(HEBREW_KEYBOARD_LINE);
    expect(input).toHaveValue('שדג');
    expect(screen.getByRole('status')).toHaveTextContent('שדג');
  });

  it('Latin text shows no line, and the line goes once the Hebrew is gone', async () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Password');
    await userEvent.type(input, 'seedpass');
    expect(screen.queryByText(HEBREW_KEYBOARD_LINE)).toBeNull();
    expect(input).not.toHaveAttribute('aria-describedby');
    await userEvent.type(input, 'ש');
    expect(screen.getByText(HEBREW_KEYBOARD_LINE)).toBeInTheDocument();
    await userEvent.type(input, '{Backspace}');
    expect(screen.queryByText(HEBREW_KEYBOARD_LINE)).toBeNull();
  });

  it('an uncontrolled field decides on its own text', async () => {
    render(<PasswordInput aria-label="Password" defaultValue="שלום" />);
    expect(screen.getByText(HEBREW_KEYBOARD_LINE)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Password'));
    expect(screen.queryByText(HEBREW_KEYBOARD_LINE)).toBeNull();
  });

  it('keeps the caller’s own description beside the keyboard line', () => {
    render(
      <>
        <p id="own">Forgot it?</p>
        <PasswordInput aria-label="Password" aria-describedby="own" value="א" readOnly />
      </>,
    );
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      `Forgot it? ${HEBREW_KEYBOARD_LINE}`,
    );
  });

  it('the hint alone renders nothing for Latin text', () => {
    const { container } = render(<KeyboardHint value="seed_lead" />);
    expect(container).toBeEmptyDOMElement();
  });
});
