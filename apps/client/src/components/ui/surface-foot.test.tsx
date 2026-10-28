import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfirmEntry } from '@/features/entry/ConfirmEntry';
import { Dialog } from './dialog';
import { ResponsiveDialog } from './responsive-dialog';
import { Sheet } from './sheet';

/*
 * Phase 1 I side task 1 (plan v1.29): a sheet's or dialog's pinned foot is opaque from its top
 * edge to the surface's bottom edge. jsdom lays nothing out, so the boxes are checked in
 * e2e/review-foot.spec.ts; here, the structure that makes them so: the foot is the scroller's
 * last child, the scroller keeps no bottom padding while a foot is pinned (the strip that showed
 * answers through), the foot carries that room inside its own painted box, edge to edge, and it
 * wears its hairline only while content is under it.
 */

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

/** jsdom has no matchMedia, so the hook answers "desktop"; this makes it answer "phone". */
function phone() {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

const classes = (el: Element) => el.className.split(/\s+/);
const footOf = (surface: HTMLElement) => surface.querySelector<HTMLElement>('[data-surface-foot]');

/** Gives `el` a scroll box: `height` of content in a `client` px window, scrolled to `top`. */
function scrollBox(el: HTMLElement, height: number, client: number, top: number) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: height });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: client });
  el.scrollTop = top;
  fireEvent.scroll(el);
}

describe('the pinned foot of a modal surface (Phase 1 I side task 1)', () => {
  it('a bottom sheet: the foot is the last child, the sheet keeps no bottom padding, the foot carries the inset', () => {
    render(
      <Sheet open side="bottom" title="Review" onClose={() => {}} foot={<button>Submit</button>}>
        <p>Answers</p>
      </Sheet>,
    );
    const sheet = screen.getByRole('dialog', { name: 'Review' });
    const foot = footOf(sheet)!;
    expect(sheet.lastElementChild).toBe(foot);
    expect(foot).toContainElement(screen.getByRole('button', { name: 'Submit' }));
    expect(classes(sheet)).toContain('pb-0');
    expect(sheet.className).not.toMatch(/pb-\[env/);
    // Painted, pinned at the bottom, above the content, edge to edge, the room below inside it.
    expect(classes(foot)).toEqual(
      expect.arrayContaining([
        'sticky',
        'bottom-0',
        'z-10',
        'bg-surface',
        '-mx-4',
        'px-4',
        'pb-[calc(1rem+env(safe-area-inset-bottom))]',
      ]),
    );
  });

  it('a bottom sheet without a foot keeps its safe-area padding and draws no foot', () => {
    render(
      <Sheet open side="bottom" title="Review" onClose={() => {}}>
        <p>Answers</p>
      </Sheet>,
    );
    const sheet = screen.getByRole('dialog', { name: 'Review' });
    expect(footOf(sheet)).toBeNull();
    expect(classes(sheet)).toContain('pb-[env(safe-area-inset-bottom)]');
    expect(classes(sheet)).not.toContain('pb-0');
  });

  it('a dialog: the foot is the last child, the dialog keeps no bottom padding, the foot carries it', () => {
    render(
      <Dialog open title="Review" onClose={() => {}} foot={<button>Submit</button>}>
        <p>Answers</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Review' });
    const foot = footOf(dialog)!;
    expect(dialog.lastElementChild).toBe(foot);
    expect(classes(dialog)).toContain('pb-0');
    expect(classes(dialog)).not.toContain('pb-[1.375rem]');
    expect(classes(foot)).toEqual(
      expect.arrayContaining([
        'sticky',
        'bottom-0',
        'bg-surface',
        '-mx-6',
        'px-6',
        'pb-[1.375rem]',
      ]),
    );
  });

  it('a dialog without a foot keeps its bottom padding and draws no foot', () => {
    render(
      <Dialog open title="Review" onClose={() => {}}>
        <p>Answers</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Review' });
    expect(footOf(dialog)).toBeNull();
    expect(classes(dialog)).toEqual(expect.arrayContaining(['pt-[1.375rem]', 'pb-[1.375rem]']));
  });

  it("a dialog whose body has no control puts first focus on the foot's action", () => {
    render(
      <Dialog open title="Review" onClose={() => {}} showClose={false} foot={<button>Done</button>}>
        <p>Answers</p>
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
  });

  it('ResponsiveDialog on a phone hands the foot to the sheet, after its content', () => {
    phone();
    render(
      <ResponsiveDialog open title="Review" onClose={() => {}} foot={<button>Submit</button>}>
        <p>Answers</p>
      </ResponsiveDialog>,
    );
    const sheet = screen.getByRole('dialog', { name: 'Review' });
    expect(sheet.dataset.surface).toBe('sheet');
    expect(sheet.lastElementChild).toBe(footOf(sheet));
    expect(classes(sheet)).toContain('pb-0');
    // The content's own bottom room gives way to the foot's (12 + the foot's 8 = the old 20 px).
    expect(classes(screen.getByText('Answers').parentElement!)).toContain('pb-3');
  });

  it('wears the --line hairline only while content is under it', () => {
    render(
      <Dialog open title="Review" onClose={() => {}} foot={<button>Submit</button>}>
        <p>Answers</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Review' });
    const foot = footOf(dialog)!;
    expect(foot.className).toContain('data-[stuck=true]:shadow-[0_-1px_0_var(--line)]');
    // A list that fits: nothing under the foot.
    expect(foot).toHaveAttribute('data-stuck', 'false');
    act(() => scrollBox(dialog, 1000, 400, 0));
    expect(foot).toHaveAttribute('data-stuck', 'true');
    act(() => scrollBox(dialog, 1000, 400, 300));
    expect(foot).toHaveAttribute('data-stuck', 'true');
    // The end of the list: the last row sits above the foot, and the hairline goes.
    act(() => scrollBox(dialog, 1000, 400, 600));
    expect(foot).toHaveAttribute('data-stuck', 'false');
  });
});

describe("the Review sheet's buttons sit on the surface's foot", () => {
  const props = {
    open: true,
    matchLabel: 'Q39',
    teamLabel: '2630 Thunderbolts',
    status: 'played' as const,
    phases: [],
    data: {},
    windowApplies: true,
    errorRef: { current: null },
    onBack: () => {},
    onSubmit: () => {},
  };

  for (const shape of ['phone', 'desktop'] as const) {
    it(`on the ${shape}: Keep editing, Submit entry and a failed-submit line are the foot's`, () => {
      if (shape === 'phone') phone();
      render(<ConfirmEntry {...props} error="The server refused it." />);
      const surface = screen.getByRole('dialog', { name: 'Confirm this entry' });
      const foot = footOf(surface)!;
      expect(surface.lastElementChild).toBe(foot);
      expect(foot).toContainElement(screen.getByRole('button', { name: 'Keep editing' }));
      expect(foot).toContainElement(screen.getByRole('button', { name: 'Submit entry' }));
      // The reason is a direct child of the foot, beside the buttons.
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/^Not saved\. The server refused it\./);
      expect(alert.parentElement).toBe(foot);
      // No second sticky box of its own inside the content.
      expect(surface.querySelectorAll('.sticky')).toHaveLength(1);
    });
  }
});
