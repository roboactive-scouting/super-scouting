import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { goOnline, openBuilder, server } from '@/test/builderHarness';
import { FORM_ID } from '@/test/formFixtures';

/*
 * UF.20: moving a field by its grip shows the move while it happens, as Manage's event cards do:
 * the lifted field follows, the others slide out of its way, and only then does it drop.
 */

const draftPath = `/admin/forms/${FORM_ID}?version=4`;
const canvas = () => screen.getByRole('region', { name: 'Form' });
const item = (key: string) => canvas().querySelector<HTMLElement>(`[data-field-key="${key}"]`)!;
/** dnd-kit's keyboard sensor listens for the next key only after a tick. */
const tick = () => act(() => new Promise((done) => setTimeout(done, 20)));

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as { matchMedia?: unknown }).matchMedia;
  goOnline();
});

describe('Builder canvas: a field moved by its grip (UF.20)', { timeout: 20_000 }, () => {
  it('lifts while it moves: it carries a transform and the float shadow; the field it passes slides, not jumps', async () => {
    // Motion allowed (jsdom has no matchMedia, which reads as reduced motion), at a desktop width.
    window.matchMedia = ((query: string) => ({
      matches: !query.includes('reduce'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    await openBuilder(draftPath, server().rpc);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const card = this.closest<HTMLElement>('[data-field-key]');
      const all = [...document.querySelectorAll('[data-field-key]')];
      const top = card ? all.indexOf(card) * 100 : 0;
      return DOMRect.fromRect({ x: 0, y: top, width: 380, height: 90 });
    });
    const grip = within(canvas()).getByRole('button', { name: 'Move Left the start zone' });
    grip.focus();
    fireEvent.keyDown(grip, { code: 'Space', key: ' ' });
    await tick();
    fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' });
    await tick();

    // Mid-move: nothing dropped yet, the order is as it was.
    const lifted = item('auto_leave');
    expect(lifted).toHaveAttribute('data-dragging', 'true');
    expect(lifted.style.transform).toMatch(/translate3d\(0px, 100px/);
    expect(lifted.style.transition).toBe('');
    expect(lifted.className).toContain('shadow-[var(--shadow-float)]');
    expect(lifted.className).not.toMatch(/opacity-/);
    // The field it passes makes room for it, with a slide (not dnd-kit's 0 ms "jump" transition).
    const passed = item('auto_high');
    expect(passed.style.transform).toMatch(/translate3d\(0px, -100px/);
    expect(passed.style.transition).toMatch(/^transform 200ms/);

    fireEvent.keyDown(document, { code: 'Space', key: ' ' });
    await tick();
    await act(() => new Promise((done) => setTimeout(done, 50)));
    const keys = [...canvas().querySelectorAll<HTMLElement>('[data-field-key]')].map(
      (el) => el.dataset.fieldKey,
    );
    expect(keys).toEqual(['auto_high', 'auto_leave']);
    expect(item('auto_high')).not.toHaveAttribute('data-dragging');
  });
});

describe('Builder canvas under reduced motion (UF.20)', { timeout: 20_000 }, () => {
  it('the passed field jumps to its new place: no slide', async () => {
    await openBuilder(draftPath, server().rpc);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const card = this.closest<HTMLElement>('[data-field-key]');
      const all = [...document.querySelectorAll('[data-field-key]')];
      const top = card ? all.indexOf(card) * 100 : 0;
      return DOMRect.fromRect({ x: 0, y: top, width: 380, height: 90 });
    });
    const grip = within(canvas()).getByRole('button', { name: 'Move Left the start zone' });
    grip.focus();
    fireEvent.keyDown(grip, { code: 'Space', key: ' ' });
    await tick();
    fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' });
    await tick();
    expect(item('auto_high').style.transform).toMatch(/translate3d\(0px, -100px/);
    expect(item('auto_high').style.transition).toBe('');
    fireEvent.keyDown(document, { code: 'Escape', key: 'Escape' });
    await tick();
  });
});
