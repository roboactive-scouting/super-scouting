import { act, render, screen, within } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from './button';
import { DestructiveConfirm } from './destructive-confirm';
import { Dialog } from './dialog';
import { ResponsiveDialog } from './responsive-dialog';
import {
  ACTION_BUTTON,
  ACTIONS_ROW,
  ACTIONS_STACKED,
  fitsInRow,
  SurfaceActions,
} from './surface-actions';

/*
 * Phase 1 I side task 3 (plan v1.31): one action-row rule for every sheet and dialog, in the
 * shared surface. Below 1024 px the row is full width with equal-width 52 px buttons; at 1024 px
 * and above it is right-aligned with 44 px buttons. jsdom evaluates no media query, so here the
 * classes that say so (the boxes are measured in e2e/settings.spec.ts); `max-lg:` is below
 * 1024 px and `lg:` is 1024 px and above (SPEC-FINAL 17.3's breakpoint, Tailwind's `lg`).
 */

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

function phone() {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

const classes = (el: Element) => el.className.split(/\s+/);
const rowClasses = ACTIONS_ROW.split(' ');
const buttonClasses = ACTION_BUTTON.split(' ');

function expectRule(surface: HTMLElement) {
  const row = surface.querySelector<HTMLElement>('[data-surface-actions]')!;
  expect(row).not.toBeNull();
  // Full width below 1024 px; right-aligned (wrapping) at 1024 px and above.
  expect(classes(row)).toEqual(expect.arrayContaining(rowClasses));
  expect(classes(row)).toEqual(expect.arrayContaining(['flex', 'max-lg:w-full', 'lg:justify-end']));
  const buttons = within(row).getAllByRole('button');
  for (const b of buttons) {
    // Equal widths and one 52 px height below 1024 px; the one 44 px `md` button above.
    expect(classes(b)).toEqual(expect.arrayContaining(buttonClasses));
    expect(classes(b)).toEqual(
      expect.arrayContaining(['max-lg:flex-1', 'max-lg:min-h-[52px]', 'min-h-11']),
    );
    // No size of its own: never the 52 px `lg`/`block` height on a computer, never w-full.
    expect(classes(b)).not.toContain('min-h-[52px]');
    expect(classes(b)).not.toContain('w-full');
  }
  return buttons;
}

const twoButtons = (
  <>
    <Button>Cancel</Button>
    {/* A size given in the row is set aside: the row decides. */}
    <Button variant="primary" size="lg">
      Save
    </Button>
  </>
);

describe('the action row of a sheet or dialog (Phase 1 I side task 3)', () => {
  it('a phone sheet (ResponsiveDialog below 1024 px): the footer is the shared row', () => {
    phone();
    render(
      <ResponsiveDialog open title="Edit" onClose={() => {}} footer={twoButtons}>
        <p>Body</p>
      </ResponsiveDialog>,
    );
    const sheet = screen.getByRole('dialog', { name: 'Edit' });
    expect(sheet).toHaveAttribute('data-surface', 'sheet');
    const [cancel, save] = expectRule(sheet);
    // Secondary first, primary last: the caller's order is kept.
    expect(cancel).toHaveTextContent('Cancel');
    expect(save).toHaveTextContent('Save');
  });

  it('a computer dialog (ResponsiveDialog at 1024 px and up): the same row', () => {
    render(
      <ResponsiveDialog open title="Edit" onClose={() => {}} footer={twoButtons}>
        <p>Body</p>
      </ResponsiveDialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Edit' });
    expect(dialog).toHaveAttribute('data-surface', 'dialog');
    expectRule(dialog);
  });

  it('a plain Dialog and a DestructiveConfirm draw their actions in it', () => {
    render(
      <Dialog open title="Plain" onClose={() => {}} footer={twoButtons}>
        <p>Body</p>
      </Dialog>,
    );
    expectRule(screen.getByRole('dialog', { name: 'Plain' }));
  });

  it('a destructive confirmation: Cancel then the filled-ink confirm, both the row’s size', () => {
    phone();
    render(
      <DestructiveConfirm
        open
        title="Disable this account?"
        objectName="Dana Cohen"
        body="They can no longer sign in."
        confirmLabel="Disable Dana Cohen"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const [cancel, confirm] = expectRule(
      screen.getByRole('dialog', { name: 'Disable this account?' }),
    );
    expect(cancel).toHaveTextContent('Cancel');
    expect(confirm).toHaveTextContent('Disable Dana Cohen');
    expect(classes(confirm!)).toEqual(expect.arrayContaining(['bg-ink', 'text-surface']));
  });

  it('hideConfirm draws Cancel alone (the held device wipe)', () => {
    render(
      <DestructiveConfirm
        open
        title="Wipe this device?"
        objectName="Everything"
        body="Removes it all."
        confirmLabel="Wipe this device"
        held="Held."
        hideConfirm
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Wipe this device?' });
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Cancel']);
  });

  it('a pinned foot or a row in the content uses the same row (SurfaceActions)', () => {
    render(
      <Dialog
        open
        title="Review"
        onClose={() => {}}
        foot={<SurfaceActions>{twoButtons}</SurfaceActions>}
      >
        <p>Answers</p>
      </Dialog>,
    );
    expectRule(screen.getByRole('dialog', { name: 'Review' }));
  });

  it('a button outside an action row keeps its own size (the negative)', () => {
    render(
      <Button variant="primary" size="block">
        Save changes
      </Button>,
    );
    const b = screen.getByRole('button', { name: 'Save changes' });
    expect(classes(b)).toEqual(expect.arrayContaining(['min-h-[52px]', 'w-full']));
    for (const c of buttonClasses) expect(classes(b)).not.toContain(c);
  });
});

/** Every .tsx under `features/`, tests aside. */
function featureFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return featureFiles(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

/*
 * A label never wraps (side task 3, follow-up): when any button's one-line width is wider than
 * its equal share of the row, the row stacks below 1024 px, full width, one per line, primary or
 * destructive last. jsdom lays nothing out, so the boxes are stubbed: the row is `size.row` px
 * wide, and a button measured at `max-content` is as wide as `size.label` says for its text.
 */
describe('a row whose labels do not fit stacks (measured)', () => {
  const size = { row: 343, label: {} as Record<string, number> };
  let resize: (() => void) | undefined;
  const realRect = Element.prototype.getBoundingClientRect;
  beforeEach(() => {
    resize = undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          resize = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const el = this as HTMLElement;
      const width = el.hasAttribute('data-surface-actions')
        ? size.row
        : // Only the one-line read (max-content) gives the label's own width.
          el.style.width === 'max-content'
          ? (size.label[el.textContent ?? ''] ?? 100)
          : 0;
      return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0 } as DOMRect;
    };
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Element.prototype.getBoundingClientRect = realRect;
  });

  const row = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-surface-actions]')!;
  const practice = (
    <SurfaceActions>
      <Button>Exit practice</Button>
      <Button variant="primary">Practice another match</Button>
    </SurfaceActions>
  );

  it('the rule: side by side while the widest label fits its equal share', () => {
    // 343 px, 0 px gap in jsdom's styles: a half is 171.5 px.
    expect(fitsInRow(171, 2, 343, 0)).toBe(true);
    expect(fitsInRow(172, 2, 343, 0)).toBe(true); // half a pixel of slack
    expect(fitsInRow(173, 2, 343, 0)).toBe(false);
    // With the row's 10 px gap a half is 166.5 px.
    expect(fitsInRow(167, 2, 343, 10)).toBe(true);
    expect(fitsInRow(168, 2, 343, 10)).toBe(false);
    // One button always fits: it is the row.
    expect(fitsInRow(900, 1, 343, 10)).toBe(true);
  });

  it('a long label stacks the row: full width, one per line, primary last', () => {
    size.label = { 'Exit practice': 130, 'Practice another match': 204 };
    const { container } = render(practice);
    expect(row(container).dataset.stacked).toBe('true');
    expect(row(container).className.split(/\s+/)).toContain(ACTIONS_STACKED);
    expect(
      within(row(container))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Exit practice', 'Practice another match']);
    // The read put every button's own layout back.
    for (const b of within(row(container)).getAllByRole('button')) {
      expect(b.style.width).toBe('');
      expect(b.style.flex).toBe('');
    }
  });

  it('short labels stay one row (the negative)', () => {
    size.label = { 'Keep this device': 150, 'Wipe anyway': 130 };
    const { container } = render(
      <SurfaceActions>
        <Button>Keep this device</Button>
        <Button variant="destructive">Wipe anyway</Button>
      </SurfaceActions>,
    );
    expect(row(container).dataset.stacked).toBe('false');
    expect(row(container).className.split(/\s+/)).not.toContain(ACTIONS_STACKED);
  });

  it('re-measures as the row or a label changes size, and unstacks when there is room', () => {
    size.label = { 'Exit practice': 130, 'Practice another match': 204 };
    const { container } = render(practice);
    expect(row(container).dataset.stacked).toBe('true');
    size.row = 440; // a wider sheet: a half is 220 px
    act(() => resize!());
    expect(row(container).dataset.stacked).toBe('false');
    size.label['Exit practice'] = 230; // a larger text size
    act(() => resize!());
    expect(row(container).dataset.stacked).toBe('true');
    size.row = 343;
  });

  it('a row with no width (a hidden surface) keeps its answer', () => {
    size.label = { 'Exit practice': 130, 'Practice another match': 204 };
    const { container } = render(practice);
    size.row = 0;
    act(() => resize!());
    expect(row(container).dataset.stacked).toBe('true');
    size.row = 343;
  });

  it('no button in the row may wrap its label', () => {
    for (const c of ACTION_BUTTON.split(' ')) expect(c).not.toMatch(/whitespace-normal|wrap/);
    render(practice);
    for (const b of screen.getAllByRole('button')) {
      expect(b.className.split(/\s+/)).toContain('whitespace-nowrap');
      expect(b.className).not.toMatch(/whitespace-normal/);
    }
  });
});

describe('no page builds its own sheet or dialog action row (source)', () => {
  const root = join(import.meta.dirname, '../../features');
  const files = featureFiles(root).map((path) => ({ path, text: readFileSync(path, 'utf8') }));

  it('finds the features', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  // The per-page layouts the audit moved onto SurfaceActions: a right-aligned row, buttons that
  // stretch only on a phone, or a full-width button that shrinks on a computer.
  const ROLLED_OWN = [
    /flex flex-wrap justify-end gap-2/,
    /flex-1 lg:flex-none/,
    /w-full lg:w-auto/,
    /max-lg:w-full"/,
  ];

  for (const pattern of ROLLED_OWN) {
    it(`no ${pattern.source}`, () => {
      const hits = files.filter((f) => pattern.test(f.text)).map((f) => f.path);
      expect(hits).toEqual([]);
    });
  }
});
