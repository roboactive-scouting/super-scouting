import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sheet } from './sheet';

/** jsdom has no PointerEvent: a MouseEvent carrying the pointer fields React reads. */
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, { bubbles: true, cancelable: true, ...init });
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'touch';
    this.isPrimary = init.isPrimary ?? true;
  }
}

function pointer(el: Element, type: string, x: number, y: number, t = 0, pointerType = 'touch') {
  const e = new TestPointerEvent(type, { clientX: x, clientY: y, pointerType });
  Object.defineProperty(e, 'timeStamp', { value: t });
  fireEvent(el, e);
}

/** One pointer stroke on `el` through `points` ([x, y, ms]), released at the last one. */
function stroke(el: Element, points: [number, number, number][], pointerType = 'touch') {
  points.forEach(([x, y, t], i) =>
    pointer(el, i === 0 ? 'pointerdown' : 'pointermove', x, y, t, pointerType),
  );
  const [x, y, t] = points[points.length - 1]!;
  pointer(el, 'pointerup', x, y, t, pointerType);
}

/** A slow drag down by `by` px: no flick, so only the distance decides. */
const slowDown = (by: number): [number, number, number][] => [
  [100, 100, 0],
  [100, 110, 1000],
  [100, 100 + by, 2000],
];

/** jsdom has no matchMedia, which reads as reduced motion; this asks for motion. */
const original = window.matchMedia;
function motion() {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}
afterEach(() => {
  window.matchMedia = original;
});

function BottomHarness({
  onClose,
  dismissible,
  showClose,
}: {
  onClose?: () => void;
  dismissible?: boolean;
  showClose?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [taps, setTaps] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Opener
      </button>
      <Sheet
        open={open}
        side="bottom"
        title="Review entry"
        dismissible={dismissible}
        showClose={showClose}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
      >
        <p>The summary</p>
        <input aria-label="Notes" />
        <button type="button" onClick={() => setTaps((n) => n + 1)}>
          Tapped {taps}
        </button>
      </Sheet>
    </>
  );
}

/** Opens the harness's sheet from its opener, measured as a phone would lay it out. */
async function open(height = 500) {
  await userEvent.click(screen.getByRole('button', { name: 'Opener' }));
  return measure(height);
}

function measure(height = 500) {
  const dialog = screen.getByRole('dialog');
  Object.defineProperty(dialog, 'offsetHeight', { configurable: true, value: height });
  Object.defineProperty(dialog, 'offsetWidth', { configurable: true, value: 252 });
  return dialog;
}

const heading = () => screen.getByRole('heading', { name: 'Review entry' });

describe('Sheet: drag to dismiss (UF.4)', () => {
  it('closes on a drag down past the threshold, through the close path (focus goes back)', async () => {
    const onClose = vi.fn();
    render(<BottomHarness onClose={onClose} />);
    await open();
    stroke(heading(), slowDown(130));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Opener' })).toHaveFocus();
  });

  it('follows the finger, then springs back from a short drag', async () => {
    motion();
    const onClose = vi.fn();
    render(<BottomHarness onClose={onClose} />);
    const dialog = await open();
    pointer(heading(), 'pointerdown', 100, 100);
    pointer(heading(), 'pointermove', 100, 160);
    expect(dialog.style.translate).toContain('60px');
    pointer(heading(), 'pointerup', 100, 160);
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog.style.translate).toBe('');
    expect(dialog.style.transition).toContain('translate');
  });

  it('gives only a short rubber band upward', async () => {
    motion();
    render(<BottomHarness />);
    const dialog = await open();
    pointer(heading(), 'pointerdown', 100, 100);
    pointer(heading(), 'pointermove', 100, 110);
    pointer(heading(), 'pointermove', 100, -400);
    const lift = parseFloat(dialog.style.translate.split(' ')[1] ?? '');
    expect(lift).toBeLessThan(0);
    expect(lift).toBeGreaterThan(-24);
  });

  it('slides the rest of the way out, then closes, when motion is allowed', async () => {
    motion();
    const onClose = vi.fn();
    render(<BottomHarness onClose={onClose} />);
    const dialog = await open();
    stroke(screen.getByText('The summary'), slowDown(200));
    expect(dialog.style.translate).toContain('500px');
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('closes on a fast flick down, however short', async () => {
    const onClose = vi.fn();
    render(<BottomHarness onClose={onClose} />);
    await open();
    stroke(screen.getByText('The summary'), [
      [100, 100, 0],
      [100, 120, 20],
      [100, 150, 40],
    ]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('under reduced motion nothing follows the finger, and a qualifying swipe just closes', async () => {
    const onClose = vi.fn();
    render(<BottomHarness onClose={onClose} />);
    const dialog = await open();
    pointer(heading(), 'pointerdown', 100, 100);
    pointer(heading(), 'pointermove', 100, 260, 1000);
    expect(dialog.style.translate).toBe('');
    pointer(heading(), 'pointerup', 100, 260, 2000);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('leaves scrolled content to scroll: the body drags only at the top; the handle always', async () => {
    const onClose = vi.fn();
    render(<BottomHarness onClose={onClose} />);
    const dialog = await open();
    Object.defineProperty(dialog, 'scrollTop', { configurable: true, value: 40 });
    stroke(screen.getByText('The summary'), slowDown(200));
    expect(onClose).not.toHaveBeenCalled();
    stroke(heading(), slowDown(200));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('a drag that starts upward is a scroll, not a dismiss', async () => {
    const onClose = vi.fn();
    render(<BottomHarness onClose={onClose} />);
    await open();
    stroke(screen.getByText('The summary'), [
      [100, 100, 0],
      [100, 80, 1000],
      [100, 300, 2000],
    ]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('never starts on a focused text field, nor for a mouse, nor while not dismissible', async () => {
    const onClose = vi.fn();
    const { unmount } = render(<BottomHarness onClose={onClose} />);
    await open();
    const notes = screen.getByRole('textbox', { name: 'Notes' });
    notes.focus();
    stroke(notes, slowDown(200));
    stroke(screen.getByText('The summary'), slowDown(200), 'mouse');
    expect(onClose).not.toHaveBeenCalled();
    unmount();
    render(<BottomHarness onClose={onClose} dismissible={false} />);
    await open();
    stroke(heading(), slowDown(200));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a tap on a button still works; a drag that began on it is not a tap', async () => {
    render(<BottomHarness />);
    await open();
    const button = screen.getByRole('button', { name: /Tapped/ });
    stroke(button, [[100, 100, 0]]);
    fireEvent.click(button);
    expect(button).toHaveTextContent('Tapped 1');
    stroke(button, slowDown(40));
    fireEvent.click(button);
    expect(button).toHaveTextContent('Tapped 1');
  });

  it('shows the ✕ only when asked, and it closes', async () => {
    const onClose = vi.fn();
    const { unmount } = render(<BottomHarness onClose={onClose} />);
    await open();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    unmount();
    render(<BottomHarness onClose={onClose} showClose />);
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('the menu closes on a swipe toward its edge, never the other way', () => {
    const onClose = vi.fn();
    render(
      <Sheet open side="start" title="Menu" onClose={onClose}>
        <a href="/home">Home</a>
      </Sheet>,
    );
    measure();
    const link = screen.getByRole('link', { name: 'Home' });
    stroke(link, [
      [150, 100, 0],
      [170, 102, 1000],
      [260, 104, 2000],
    ]);
    expect(onClose).not.toHaveBeenCalled();
    stroke(link, [
      [200, 100, 0],
      [190, 102, 1000],
      [60, 104, 2000],
    ]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('the menu follows a swipe toward its edge when motion is allowed', () => {
    motion();
    render(
      <Sheet open side="start" title="Menu" onClose={() => {}}>
        <a href="/home">Home</a>
      </Sheet>,
    );
    const dialog = measure();
    const link = screen.getByRole('link', { name: 'Home' });
    pointer(link, 'pointerdown', 200, 100);
    pointer(link, 'pointermove', 150, 102);
    expect(dialog.style.translate).toContain('-50px');
  });
});
