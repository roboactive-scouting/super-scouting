# Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. **`docs/ops/BUILD-CONTEXT.md` is binding** and wins over this file where they disagree. §9 says how a build chat runs, §10 sets the verification standard and §12 the visual standard.

**Version:** 1.0 · **Date:** 2026-10-01 · **Decided in:** living spec v0.49 (Decision Log, 2026-10-01) · SPEC-FINAL v1.3 §17.4, §17.9

**Goal:** Move every screen built in phases 1A–1C onto one design system, with no behaviour change. The system is shadcn-style primitives, a sidebar / drawer / bottom-bar shell, a real Home page and Material 3 motion. Every unbuilt page (task 1.24 onward) then starts on the same system.

**Architecture:** Presentation only. The sync loop, the hydration gate, the outbox and every rule in `AppShell.tsx` stay exactly as they are. Only its returned JSX moves into a new `ShellLayout`. New code lives in:

- `components/ui/*`: primitives, as cva variant files.
- `components/entry/*`: the data-entry controls.
- `lib/motion.ts` and `styles/motion.css`.
- `lib/paths.ts`.
- `lib/useMediaQuery.ts`.
- `features/shell/{nav.ts, ShellLayout, Sidebar, NavList, TopBar, BottomBar, NavDrawer, AccountBlock, Brand, ShellState}`.
- `features/home/*`.

**Every existing test file is the behaviour contract.** A task edits a test only where its Files list names that test and shows the exact change.

**Tech stack:** React 19 · Tailwind CSS v4 (`@theme inline` token names) · `class-variance-authority` · `lucide-react` 0.454 · React Router 7 `NavLink` · the Web Animations API (`element.animate`). **No new dependency.**

## Global constraints

Every task's requirements implicitly include this section, all of `IMPLEMENTATION-PLAN.md` "Global constraints", and `BUILD-CONTEXT.md` §12.

- **Run order.** After task 1.23 and before task 1.24: R.1 → R.14, one task per chat, each on its own branch `feat/redesign-r<N>` cut from `develop`. **Do not fast-forward `develop` between R.6 and R.7.** From R.6 until R.7 lands, phones also get the sidebar.
- **No new npm dependency.** No Radix and no animation library. shadcn/ui is taken as the **visual system and the cva-variant file pattern**. Every behaviour the app needs (focus traps, native pickers) already exists and is tested.
- **Colour comes only from tokens.** Use the Tailwind theme names mapped in `styles/index.css` (`bg-surface`, `text-text-muted`, `border-border`, `bg-brand-plate`, `text-brand`, `border-danger`, `bg-status-played`, `bg-alliance-red`, …) or `var(--token)`. **No hex outside `styles/tokens.css`.** Brand yellow never appears in data ink and never on a light surface.
- **Every interactive primitive carries `tap-target`** (48 × 48 px, SPEC-FINAL §17.7), with ≥ 8 px between neighbours (`tap-row` or `gap-2`).
- **Native form controls stay native.** Keep `<select>`, `<input type="radio|checkbox">` and `<textarea>`: a phone shows its own picker, and the tests drive them with `selectOptions`, `click` and `toBeChecked`. Style them; do not replace them.
- **Copy, roles and accessible names are frozen.** Every string a test queries stays byte-identical, and every `dir="auto"` stays where it is. A visible label may become an icon only when its accessible name stays identical through `aria-label`, and no test queries it by text. Each task names those cases.
- **One copy of each nav destination in the DOM at a time.** The sidebar (≥ 1024 px) and the phone chrome (< 1024 px) are never both rendered. jsdom has no `matchMedia`, so the shell renders its desktop layout under test.
- **Motion rules** (SPEC-FINAL v1.3 §17.9):
  - Material 3 easing and duration tokens only (`styles/motion.css` ↔ `lib/motion.ts`).
  - Everything that moves sits in the `prefers-reduced-motion: no-preference` block or goes through `play()`, so reduced motion gets still screens.
  - **Allowed:** the nav indicator, sidebar collapse, drawer / dialog / sheet / notice **enter**, the route fade, state layers (hover / press veil) and press feedback.
  - **On the data-entry path** (`/scout`, `/entry/*`, and `/super` from task 1.36), only motion that carries information: the counter value tick, press feedback, a chosen-option edge, the notices that report a state change, and the review sheet sliding in.
  - **Banned everywhere:** page-load staggers, scroll reveals, ambient or looping animation, and exit animations. Exits are instant: an exit would keep a closed surface in the DOM, and M3 allows exits to be quicker than entries.
- **Rejected tells** (BUILD-CONTEXT §12.4): no cards inside cards, no shadows / gradients / glows (1-px borders instead), no icon beside every heading, no marketing copy, no placeholder text.
- **Shell:** Git Bash for every command (IMPLEMENTATION-PLAN "Shell"). Before each commit run `pnpm format`, then `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`, and paste the real output.
- **Screenshots** (BUILD-CONTEXT §12.5): every task that changes a screen ends with a screenshot of it at 375 px and 1280 px, dark theme, realistic dev-seed data. Report it in the §12.6 format.

## File map

| File | Responsibility | Task |
|---|---|---|
| `apps/client/src/styles/motion.css` | M3 motion tokens, keyframes, enter classes, state layer | R.1 |
| `apps/client/src/lib/motion.ts` | The same tokens for `element.animate`; `play`, `usePlayOnChange`, `prefersReducedMotion` | R.1 |
| `apps/client/src/components/ui/{button,input,textarea,native-select,label,card,badge,table,page-header}.tsx` | Visual primitives | R.2 |
| `apps/client/src/components/ui/tabs.tsx` | ARIA tabs with a sliding underline | R.13 |
| `apps/client/src/components/buttonStyles.ts` | Pre-redesign class constants, now derived from the primitives | R.2 |
| `apps/client/src/components/ui/{useModalFocus.ts,sheet.tsx,notice.tsx}` | Shared modal focus rules, the sheet, the notice strip | R.3 |
| `apps/client/src/lib/useMediaQuery.ts` | `useMediaQuery`, `useIsDesktop` | R.3 |
| `apps/client/src/features/shell/ShellState.tsx` | The shell's full-page states (no competition, loading, blocked) | R.3 |
| `apps/client/src/lib/paths.ts` | Every in-app path; `isEntryPath` | R.4 |
| `apps/client/src/features/shell/nav.ts` | The one nav registry | R.5 |
| `apps/client/src/features/shell/{Brand,NavList,AccountBlock,Sidebar,ShellLayout}.tsx` | Desktop shell | R.6 |
| `apps/client/src/features/shell/{TopBar,BottomBar,NavDrawer}.tsx` | Phone shell | R.7 |
| `apps/client/src/features/home/{HomePage,HomeSummary}.tsx` | Home at `/` | R.8 |
| `apps/client/src/components/entry/{ChoiceGroup,CounterControl,ToggleField,StickyActionBar}.tsx` | Data-entry controls | R.10 |

---

## Task R.1: The Material 3 motion system

**Files:**
- Create: `apps/client/src/styles/motion.css`
- Create: `apps/client/src/styles/motion.test.ts`
- Create: `apps/client/src/lib/motion.ts`
- Create: `apps/client/src/lib/motion.test.ts`
- Modify: `apps/client/src/styles/index.css` (one import line)

**Interfaces:**
- Produces:
  - `EASING: { standard, standardDecelerate, standardAccelerate, emphasizedDecelerate, emphasizedAccelerate }`, each a `cubic-bezier(...)` string.
  - `DURATION: { short2: 100, short3: 150, short4: 200, medium1: 250, medium2: 300, medium4: 400 }`, in milliseconds.
  - Keyframe sets `PAGE_ENTER` and `VALUE_TICK`, both `Keyframe[]`.
  - `type MotionOptions = { duration: number; easing: string }`.
  - `prefersReducedMotion(): boolean`.
  - `play(el: Element | null, keyframes: Keyframe[], options: MotionOptions): Animation | null`.
  - `usePlayOnChange(ref: RefObject<Element | null>, key: unknown, keyframes: Keyframe[], options: MotionOptions, enabled?: boolean): void`.
  - CSS classes: `.enter-fade`, `.enter-rise`, `.enter-scale`, `.enter-drawer`, `.enter-sheet-up`, `.indicator-in`, `.motion-transition`, `.press`, `.state-layer`.

- [ ] **Step 1: Write the failing tests**

`apps/client/src/styles/motion.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DURATION, EASING } from '@/lib/motion';

const css = readFileSync(join(import.meta.dirname, 'motion.css'), 'utf8');
const safeAt = css.indexOf('@media (prefers-reduced-motion: no-preference)');

const EASING_VARS: Record<keyof typeof EASING, string> = {
  standard: '--motion-easing-standard',
  standardDecelerate: '--motion-easing-standard-decelerate',
  standardAccelerate: '--motion-easing-standard-accelerate',
  emphasizedDecelerate: '--motion-easing-emphasized-decelerate',
  emphasizedAccelerate: '--motion-easing-emphasized-accelerate',
};

describe('motion tokens (Material 3 easing and duration, SPEC-FINAL 17.9)', () => {
  it('defines every M3 easing curve at the value lib/motion.ts uses', () => {
    for (const [key, name] of Object.entries(EASING_VARS)) {
      expect(css, name).toContain(`${name}: ${EASING[key as keyof typeof EASING]};`);
    }
  });

  it('defines every M3 duration at the value lib/motion.ts uses', () => {
    for (const [name, ms] of Object.entries(DURATION)) {
      expect(css, name).toContain(`--motion-duration-${name}: ${ms}ms;`);
    }
  });

  it('declares every animation and transition inside the no-preference block only', () => {
    expect(safeAt).toBeGreaterThan(-1);
    const before = css.slice(0, safeAt);
    expect(before).not.toMatch(/\banimation\s*:/);
    expect(before).not.toMatch(/\btransition(-duration|-property)?\s*:/);
  });

  it('never loops: nothing moves on its own', () => {
    expect(css).not.toMatch(/infinite/);
  });
});
```

`apps/client/src/lib/motion.test.ts`:

```ts
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DURATION,
  EASING,
  PAGE_ENTER,
  play,
  prefersReducedMotion,
  usePlayOnChange,
} from './motion';

const original = window.matchMedia;

function stubReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('reduce') ? reduce : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

/** A div with a spy where jsdom has no `animate`. */
function animatable() {
  const el = document.createElement('div');
  const animate = vi.fn(() => ({}) as Animation);
  Object.defineProperty(el, 'animate', { value: animate });
  return { el, animate };
}

const OPTIONS = { duration: DURATION.medium1, easing: EASING.emphasizedDecelerate };

afterEach(() => {
  window.matchMedia = original;
  vi.restoreAllMocks();
});

describe('play', () => {
  it('animates with the M3 tokens it is given and never holds the end state', () => {
    stubReducedMotion(false);
    const { el, animate } = animatable();
    play(el, PAGE_ENTER, OPTIONS);
    expect(animate).toHaveBeenCalledWith(PAGE_ENTER, {
      duration: 250,
      easing: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
      fill: 'none',
    });
  });

  it('does nothing under prefers-reduced-motion', () => {
    stubReducedMotion(true);
    const { el, animate } = animatable();
    expect(play(el, PAGE_ENTER, OPTIONS)).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  it('does nothing without matchMedia, without element.animate, or without an element', () => {
    // @ts-expect-error jsdom has no matchMedia; removed here on purpose
    window.matchMedia = undefined;
    expect(prefersReducedMotion()).toBe(true);
    stubReducedMotion(false);
    expect(play(document.createElement('div'), PAGE_ENTER, OPTIONS)).toBeNull();
    expect(play(null, PAGE_ENTER, OPTIONS)).toBeNull();
  });
});

describe('usePlayOnChange', () => {
  it('plays when the key changes, never on the first render or an unchanged key', () => {
    stubReducedMotion(false);
    const { el, animate } = animatable();
    const ref = { current: el };
    const { rerender } = renderHook(({ k }) => usePlayOnChange(ref, k, PAGE_ENTER, OPTIONS), {
      initialProps: { k: 'a' },
    });
    expect(animate).not.toHaveBeenCalled();
    rerender({ k: 'a' });
    expect(animate).not.toHaveBeenCalled();
    rerender({ k: 'b' });
    expect(animate).toHaveBeenCalledOnce();
  });

  it('skips a change while disabled, and never replays it later', () => {
    stubReducedMotion(false);
    const { el, animate } = animatable();
    const ref = { current: el };
    const { rerender } = renderHook(
      ({ k, on }) => usePlayOnChange(ref, k, PAGE_ENTER, OPTIONS, on),
      { initialProps: { k: 'a', on: true } },
    );
    rerender({ k: 'b', on: false });
    rerender({ k: 'b', on: true });
    expect(animate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @frc/client exec vitest run src/styles/motion.test.ts src/lib/motion.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/motion"` and `ENOENT … motion.css`.

- [ ] **Step 3: Write the implementation**

`apps/client/src/styles/motion.css`:

```css
/*
 * Material 3 motion (m3.material.io/styles/motion/easing-and-duration). Every value is
 * copied from the M3 token table; lib/motion.ts carries the same values for
 * element.animate(). SPEC-FINAL 17.9: motion only where it carries information, never
 * on a loop, and never on the way out. Everything that moves sits in the no-preference
 * block at the end, so prefers-reduced-motion gets the same screens standing still.
 */
:root {
  --motion-easing-standard: cubic-bezier(0.2, 0, 0, 1);
  --motion-easing-standard-decelerate: cubic-bezier(0, 0, 0, 1);
  --motion-easing-standard-accelerate: cubic-bezier(0.3, 0, 1, 1);
  --motion-easing-emphasized-decelerate: cubic-bezier(0.05, 0.7, 0.1, 1);
  --motion-easing-emphasized-accelerate: cubic-bezier(0.3, 0, 0.8, 0.15);

  --motion-duration-short2: 100ms;
  --motion-duration-short3: 150ms;
  --motion-duration-short4: 200ms;
  --motion-duration-medium1: 250ms;
  --motion-duration-medium2: 300ms;
  --motion-duration-medium4: 400ms;
}

@keyframes m3-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes m3-rise-in {
  from {
    opacity: 0;
    transform: translateY(0.5rem);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes m3-scale-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes m3-slide-in-start {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: none;
  }
}

@keyframes m3-slide-in-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: none;
  }
}

@keyframes m3-indicator-in {
  from {
    opacity: 0;
    transform: scaleX(0.4);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* M3 state layer: a veil of the content colour — 8 % on hover, 10 % while pressed. */
.state-layer {
  position: relative;
  isolation: isolate;
}

.state-layer::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: currentColor;
  opacity: 0;
  pointer-events: none;
}

@media (hover: hover) {
  .state-layer:hover::before {
    opacity: 0.08;
  }
}

.state-layer:active::before {
  opacity: 0.1;
}

.state-layer:disabled::before,
.state-layer[aria-disabled='true']::before {
  opacity: 0;
}

@media (prefers-reduced-motion: no-preference) {
  .enter-fade {
    animation: m3-fade-in var(--motion-duration-medium1) var(--motion-easing-standard-decelerate)
      both;
  }

  .enter-rise {
    animation: m3-rise-in var(--motion-duration-medium2)
      var(--motion-easing-emphasized-decelerate) both;
  }

  .enter-scale {
    animation: m3-scale-in var(--motion-duration-medium2)
      var(--motion-easing-emphasized-decelerate) both;
  }

  .enter-drawer {
    animation: m3-slide-in-start var(--motion-duration-medium4)
      var(--motion-easing-emphasized-decelerate) both;
  }

  .enter-sheet-up {
    animation: m3-slide-in-up var(--motion-duration-medium2)
      var(--motion-easing-emphasized-decelerate) both;
  }

  .indicator-in {
    animation: m3-indicator-in var(--motion-duration-medium1)
      var(--motion-easing-emphasized-decelerate) both;
  }

  .motion-transition {
    transition-property:
      color, background-color, border-color, opacity, transform, width, height, inline-size,
      block-size;
    transition-duration: var(--motion-duration-short4);
    transition-timing-function: var(--motion-easing-standard);
  }

  .state-layer::before {
    transition: opacity var(--motion-duration-short3) var(--motion-easing-standard);
  }

  /* Press feedback: the tap registered. Transitions through .motion-transition. */
  .press:active:not(:disabled) {
    transform: scale(0.97);
  }
}
```

`apps/client/src/lib/motion.ts`:

```ts
import { useEffect, useRef, type RefObject } from 'react';

/** Material 3 easing curves — the same values as styles/motion.css. */
export const EASING = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  standardDecelerate: 'cubic-bezier(0, 0, 0, 1)',
  standardAccelerate: 'cubic-bezier(0.3, 0, 1, 1)',
  emphasizedDecelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  emphasizedAccelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
} as const;

/** Material 3 durations in milliseconds — the same values as styles/motion.css. */
export const DURATION = {
  short2: 100,
  short3: 150,
  short4: 200,
  medium1: 250,
  medium2: 300,
  medium4: 400,
} as const;

/**
 * A new page fading in: M3's fade-through, opacity only. M3 also scales the incoming
 * container, but a transform on the page wrapper would re-anchor every `position: fixed`
 * descendant for the length of the animation, so the page only fades.
 */
export const PAGE_ENTER: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

/**
 * A counter's value confirming the tap (SPEC-FINAL 8.6): informational, so it is one of
 * the few movements allowed on the data-entry path (17.9).
 */
export const VALUE_TICK: Keyframe[] = [
  { transform: 'scale(1)' },
  { transform: 'scale(1.15)' },
  { transform: 'scale(1)' },
];

export type MotionOptions = { duration: number; easing: string };

/** True when the device asks for reduced motion — or cannot say (jsdom): no motion then. */
export function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Plays one animation on `el` through the Web Animations API and returns it, or does
 * nothing and returns null: no element, no `animate` (jsdom), or reduced motion. Never
 * loops, and never holds its end state (`fill: 'none'`), so the element's own CSS is
 * what remains.
 */
export function play(
  el: Element | null,
  keyframes: Keyframe[],
  options: MotionOptions,
): Animation | null {
  if (el === null || typeof el.animate !== 'function' || prefersReducedMotion()) return null;
  return el.animate(keyframes, {
    duration: options.duration,
    easing: options.easing,
    fill: 'none',
  });
}

/**
 * Replays `keyframes` on the element in `ref` each time `key` changes — never on the
 * first render. The element is never remounted, so a page or a counter keeps its state
 * (AppShell must never key its Outlet: that throws a part-filled form away).
 */
export function usePlayOnChange(
  ref: RefObject<Element | null>,
  key: unknown,
  keyframes: Keyframe[],
  options: MotionOptions,
  enabled = true,
): void {
  const previous = useRef(key);
  useEffect(() => {
    if (Object.is(previous.current, key)) return;
    previous.current = key;
    if (enabled) play(ref.current, keyframes, options);
  }, [key, enabled, ref, keyframes, options]);
}
```

`apps/client/src/styles/index.css`: add the import directly under `@import './tokens.css';`:

```css
@import './motion.css';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @frc/client exec vitest run src/styles/motion.test.ts src/lib/motion.test.ts`
Expected: PASS, both files green.

- [ ] **Step 5: Full check and commit**

```bash
pnpm format && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
git add apps/client/src/styles/motion.css apps/client/src/styles/motion.test.ts apps/client/src/lib/motion.ts apps/client/src/lib/motion.test.ts apps/client/src/styles/index.css
git commit -m "feat(client): add the Material 3 motion tokens and the play-on-change helper"
```

No screen changes in this task, so no screenshots.

---

## Task R.2: The design-system primitives

**Reference:** Linear / Vercel, the shadcn/ui default look (SPEC-FINAL §17.9 baseline). Colour comes from §17.4 tokens, never shadcn's palette.

**Files:**
- Create: `apps/client/src/components/ui/button.tsx`, `input.tsx`, `textarea.tsx`, `native-select.tsx`, `label.tsx`, `card.tsx`, `badge.tsx`, `table.tsx`, `page-header.tsx`
- Create: `apps/client/src/components/ui/ui.test.tsx`
- Modify: `apps/client/src/components/buttonStyles.ts`. The constants become the primitives' classes, so every screen built before the redesign takes the new buttons and fields with no JSX change.
- Modify: `apps/client/src/styles/index.css` (`@theme inline` names for the tokens not yet mapped)

**Interfaces:**
- Consumes: `.state-layer`, `.press`, `.motion-transition` (R.1); `cn` from `@/lib/utils`.
- Produces:
  - `buttonVariants({ variant?: 'primary' | 'secondary' | 'destructive' | 'ghost', size?: 'default' | 'lg' | 'icon' | 'block' }): string`.
  - `<Button variant size type? …button props>`, whose `type` defaults to `"button"`.
  - `inputClass: string`, `<Input …input props>`, `textareaClass`, `<Textarea>`.
  - `<NativeSelect wrapperClassName? …select props>`, `<Label …label props>`.
  - `<Card as?: 'div' | 'section' tone?: 'default' | 'danger'>`, `<CardHeader>`, `<CardTitle level?: 2 | 3>`, `<CardDescription>`.
  - `<Badge tone?: BadgeTone>`, where `type BadgeTone = 'neutral' | 'played' | 'broke_down' | 'disabled' | 'no_show' | 'success' | 'warning' | 'danger'`.
  - `<Table containerClassName?>`, `<TableHeader sticky?>`, `<TableBody>`, `<TableRow>`, `<TableHead numeric?>`, `<TableCell numeric?>`.
  - `<PageHeader title description? actions? titleDir?>`, `<SectionHeader id? title actions? level?: 2 | 3>`.

- [ ] **Step 1: Write the failing test**

`apps/client/src/components/ui/ui.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DESTRUCTIVE_BUTTON, FIELD, PRIMARY_BUTTON, SECONDARY_BUTTON } from '../buttonStyles';
import { Badge } from './badge';
import { Button, buttonVariants } from './button';
import { Card, CardTitle } from './card';
import { Input } from './input';
import { NativeSelect } from './native-select';
import { PageHeader } from './page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

const sources = import.meta.glob('./*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('design-system primitives (SPEC-FINAL 17.4, 17.7)', () => {
  it('never hard-codes a colour: no hex anywhere in components/ui', () => {
    const files = Object.entries(sources).filter(([path]) => !path.endsWith('.test.tsx'));
    expect(files.length).toBeGreaterThanOrEqual(9);
    for (const [path, source] of files) expect(source, path).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('puts every button variant and size on the 48 px floor', () => {
    for (const variant of ['primary', 'secondary', 'destructive', 'ghost'] as const) {
      for (const size of ['default', 'lg', 'icon', 'block'] as const) {
        expect(buttonVariants({ variant, size }).split(' ')).toContain('tap-target');
      }
    }
  });

  it('defaults a Button to type="button", never an accidental submit', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('keeps the pre-redesign class constants, now drawn from the primitives', () => {
    expect(PRIMARY_BUTTON).toBe(buttonVariants({ variant: 'primary' }));
    expect(PRIMARY_BUTTON).toContain('bg-brand-plate');
    expect(PRIMARY_BUTTON).toContain('text-brand');
    expect(SECONDARY_BUTTON).toBe(buttonVariants({ variant: 'secondary' }));
    expect(DESTRUCTIVE_BUTTON).toContain('border-danger');
    expect(FIELD.split(' ')).toContain('tap-target');
  });

  it('keeps inputs and selects native, on the floor, with 16 px text (no iOS zoom)', () => {
    render(
      <>
        <Input aria-label="Name" />
        <NativeSelect aria-label="Role">
          <option>Lead</option>
        </NativeSelect>
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveClass('tap-target', 'text-base');
    const select = screen.getByRole('combobox', { name: 'Role' });
    expect(select.tagName).toBe('SELECT');
    expect(select).toHaveClass('tap-target');
  });

  it('right-aligns numeric table cells with tabular figures, and scopes headers', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead numeric>Match</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell numeric>12</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const header = screen.getByRole('columnheader', { name: 'Match' });
    expect(header).toHaveClass('text-right');
    expect(header).toHaveAttribute('scope', 'col');
    expect(screen.getByRole('cell', { name: '12' })).toHaveClass('text-right', 'tabular-nums');
  });

  it('keeps a badge label in --text and puts the tone on the edge and the dot only', () => {
    render(<Badge tone="played">played</Badge>);
    const badge = screen.getByText('played');
    expect(badge).toHaveClass('text-text', 'border-status-played');
    expect(badge.querySelector('[aria-hidden="true"]')).toHaveClass('bg-status-played');
  });

  it('renders a card as a labelled section with its heading at the level asked', () => {
    render(
      <Card as="section" aria-labelledby="t">
        <CardTitle id="t" level={3}>
          Role
        </CardTitle>
      </Card>,
    );
    expect(screen.getByRole('region', { name: 'Role' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Role' })).toBeInTheDocument();
  });

  it('gives a page exactly one h1, from its header', () => {
    render(<PageHeader title="Users" description="Every account." />);
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @frc/client exec vitest run src/components/ui/ui.test.tsx`
Expected: FAIL, `Failed to resolve import "./badge"`.

- [ ] **Step 3: Write the implementation**

`apps/client/src/styles/index.css`: add these lines inside the existing `@theme inline { … }` block, under `--color-warning: var(--warning);`:

```css
  --color-brand-plate: var(--brand-plate);
  --color-on-brand: var(--on-brand);
  --color-focus: var(--focus);
  --color-status-played: var(--status-played);
  --color-status-broke-down: var(--status-broke-down);
  --color-status-disabled: var(--status-disabled);
  --color-status-no-show: var(--status-no-show);
  --color-sync-offline: var(--sync-offline);
  --color-sync-syncing: var(--sync-syncing);
  --color-sync-online: var(--sync-online);
```

`apps/client/src/components/ui/button.tsx`:

```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/*
 * SPEC-FINAL 17.7 asks 3:1 of a UI boundary. A `--brand-plate` fill on `--surface` has no
 * boundary to speak of (about 1.1:1), so the primary button carries a 1 px `--border` edge:
 * 3.67:1 on `--surface` and 4.09:1 on `--bg` in the dark theme, 7.03:1 and 7.73:1 in the
 * outdoor theme. The destructive button is an outline in `--danger`: 4.71:1 on `--surface`
 * (dark) and 5.89:1 (outdoor); its label stays `--text`.
 */
export const buttonVariants = cva(
  'tap-target state-layer press motion-transition inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /** The one primary action: the brand plate with the yellow label (SPEC-FINAL 17.4). */
        primary: 'border border-border bg-brand-plate font-semibold text-brand',
        /** Everything that is not the primary action. */
        secondary: 'border border-border bg-surface text-text',
        /** A destructive verb (SPEC-FINAL 17.8). Outline only: no fill clears 4.5:1 in both themes. */
        destructive: 'border-2 border-danger font-semibold text-text',
        /** Navigation and low-emphasis actions: no edge, only the state layer. */
        ghost: 'text-text',
      },
      size: {
        default: 'px-4 text-sm',
        lg: 'px-6 text-base',
        icon: 'px-0',
        block: 'w-full px-4 text-base',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'default' },
  },
);

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants>;

/** A native button in one of four variants. `type` defaults to "button", never "submit". */
export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
```

`apps/client/src/components/ui/input.tsx`:

```tsx
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * A text field at the 48 px floor (SPEC-FINAL 17.7). 16 px text, so iOS Safari never zooms
 * the page on focus. `aria-invalid` turns the edge to `--danger`.
 */
export const inputClass =
  'tap-target motion-transition w-full min-w-0 rounded-lg border border-border bg-bg px-3 text-base text-text placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(inputClass, className)} {...props} />;
}
```

`apps/client/src/components/ui/textarea.tsx`:

```tsx
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** A multi-line field; the same edge, surface and 16 px text as `Input`. */
export const textareaClass =
  'motion-transition block min-h-24 w-full rounded-lg border border-border bg-bg p-3 text-base text-text placeholder:text-text-muted disabled:opacity-50 aria-[invalid=true]:border-danger';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(textareaClass, className)} {...props} />;
}
```

`apps/client/src/components/ui/native-select.tsx`:

```tsx
import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { inputClass } from './input';

/**
 * A styled native <select>. Native on purpose: a phone opens its own picker rather than a
 * 30-row scroll, and the tests drive it with `selectOptions`. `className` styles the select
 * itself (and so carries `tap-target`); `wrapperClassName` the box around it.
 */
export function NativeSelect({
  className,
  wrapperClassName,
  ...props
}: ComponentProps<'select'> & { wrapperClassName?: string }) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <select className={cn(inputClass, 'appearance-none pe-10', className)} {...props} />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
      />
    </div>
  );
}
```

`apps/client/src/components/ui/label.tsx`:

```tsx
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('block text-sm font-medium text-text', className)} {...props} />;
}
```

`apps/client/src/components/ui/card.tsx`:

```tsx
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

type CardProps = Omit<ComponentProps<'div'>, 'ref'> & {
  /** `section` when the card is a labelled part of the page (pass `aria-labelledby`). */
  as?: 'div' | 'section';
  /** `danger` edges a card that holds an irreversible action (SPEC-FINAL 17.8). */
  tone?: 'default' | 'danger';
};

/** One bordered surface. Never put a Card inside a Card (BUILD-CONTEXT 12.4). */
export function Card({ as: Tag = 'div', tone = 'default', className, ...props }: CardProps) {
  return (
    <Tag
      className={cn(
        'rounded-xl border bg-surface p-5',
        tone === 'danger' ? 'border-danger' : 'border-border',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-wrap items-start justify-between gap-3', className)}
      {...props}
    />
  );
}

export function CardTitle({
  level = 2,
  className,
  ...props
}: ComponentProps<'h2'> & { level?: 2 | 3 }) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return <Heading className={cn('text-base font-semibold', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('mt-1 text-sm text-text-muted', className)} {...props} />;
}
```

`apps/client/src/components/ui/badge.tsx`:

```tsx
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Each tone as [edge, dot] classes: SPEC-FINAL 17.4's functional colours, never brand yellow. */
const TONE = {
  neutral: ['border-border', 'bg-text-muted'],
  played: ['border-status-played', 'bg-status-played'],
  broke_down: ['border-status-broke-down', 'bg-status-broke-down'],
  disabled: ['border-status-disabled', 'bg-status-disabled'],
  no_show: ['border-status-no-show', 'bg-status-no-show'],
  success: ['border-status-played', 'bg-status-played'],
  warning: ['border-warning', 'bg-warning'],
  danger: ['border-danger', 'bg-danger'],
} as const;

export type BadgeTone = keyof typeof TONE;

/**
 * A small label with a coloured dot. The dot and the edge carry the colour; the text stays
 * `--text`, so every tone clears 4.5:1 in both themes with no contrast check of its own.
 */
export function Badge({
  tone = 'neutral',
  className,
  children,
  ...props
}: ComponentProps<'span'> & { tone?: BadgeTone }) {
  const [edge, dot] = TONE[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium text-text',
        edge,
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', dot)} />
      {children}
    </span>
  );
}
```

`apps/client/src/components/ui/table.tsx`:

```tsx
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** SPEC-FINAL 17.9 (shadcn data-table): muted 1 px rules, no zebra striping. */
export function Table({
  className,
  containerClassName,
  ...props
}: ComponentProps<'table'> & { containerClassName?: string }) {
  return (
    <div className={cn('relative w-full overflow-x-auto', containerClassName)}>
      <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({
  className,
  sticky = false,
  ...props
}: ComponentProps<'thead'> & { sticky?: boolean }) {
  return (
    <thead
      className={cn(
        '[&_tr]:border-b [&_tr]:border-border',
        sticky && 'sticky top-0 z-10 bg-surface',
        className,
      )}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn('motion-transition border-b border-border hover:bg-surface-raised/50', className)}
      {...props}
    />
  );
}

/** A column header. `numeric` right-aligns it over its numbers (SPEC-FINAL 17.9). */
export function TableHead({
  className,
  numeric = false,
  scope = 'col',
  ...props
}: ComponentProps<'th'> & { numeric?: boolean }) {
  return (
    <th
      scope={scope}
      className={cn(
        'h-11 px-3 align-middle text-xs font-medium text-text-muted',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  numeric = false,
  ...props
}: ComponentProps<'td'> & { numeric?: boolean }) {
  return (
    <td
      className={cn('px-3 py-2.5 align-middle', numeric && 'text-right tabular-nums', className)}
      {...props}
    />
  );
}
```

`apps/client/src/components/ui/page-header.tsx`:

```tsx
import type { ReactNode } from 'react';

/**
 * The top of a page: its one h1, a muted line of what the page is for, and its actions on
 * the right. A <header> inside <main> is not a banner landmark, so pages keep theirs.
 */
export function PageHeader({
  title,
  description,
  actions,
  titleDir,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  titleDir?: 'auto';
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0">
        <h1 dir={titleDir} className="text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {description && <p className="mt-1 max-w-prose text-sm text-text-muted">{description}</p>}
      </div>
      {actions && <div className="tap-row flex flex-wrap items-center">{actions}</div>}
    </header>
  );
}

/** A section's heading row: its title and, on the right, its one or two actions. */
export function SectionHeader({
  id,
  title,
  actions,
  level = 2,
}: {
  id?: string;
  title: ReactNode;
  actions?: ReactNode;
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Heading id={id} className="text-lg font-semibold">
        {title}
      </Heading>
      {actions && <div className="tap-row flex flex-wrap items-center">{actions}</div>}
    </div>
  );
}
```

`apps/client/src/components/buttonStyles.ts`: replace the whole file with:

```ts
/*
 * The class strings every screen built before the redesign imports. They now come from the
 * design-system primitives (components/ui), so those screens take the new look without
 * touching their JSX. New code uses <Button> or buttonVariants() directly. The contrast
 * figures behind each variant are in components/ui/button.tsx.
 */
import { buttonVariants } from './ui/button';
import { inputClass } from './ui/input';

/** The one primary action: the brand plate with the yellow label (SPEC-FINAL 17.4). */
export const PRIMARY_BUTTON = buttonVariants({ variant: 'primary' });

/** Everything that is not the primary action. */
export const SECONDARY_BUTTON = buttonVariants({ variant: 'secondary' });

/** A destructive verb (SPEC-FINAL 17.8). Outline only: no fill clears 4.5:1 in both themes. */
export const DESTRUCTIVE_BUTTON = buttonVariants({ variant: 'destructive' });

/** A text input or select at the 48 px floor. */
export const FIELD = inputClass;
```

- [ ] **Step 4: Run the test, then the whole client suite**

Run: `pnpm --filter @frc/client exec vitest run src/components/ui/ui.test.tsx`
Expected: PASS.

Run: `pnpm --filter @frc/client exec vitest run`
Expected: every suite green. The re-pointed constants keep `tap-target`, so `LoginPage.test.tsx`, `SwitchScouter.test.tsx` and `AppShell.test.tsx` still pass.

- [ ] **Step 5: Screenshots, full check, commit**

Screenshot `/login`, `/admin/users` and `/admin/manage` at 1280 px, and `/scout` at 375 px (dark theme, dev seed). Their buttons and fields now come from the primitives. Report per BUILD-CONTEXT §12.6.

```bash
pnpm format && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
git add apps/client/src/components/ui apps/client/src/components/buttonStyles.ts apps/client/src/styles/index.css
git commit -m "feat(client): add the shadcn-style primitives and move the shared button classes onto them"
```

---

## Task R.3: Dialogs, sheets, notices and states on the design system

**Reference:** Linear / Vercel baseline. Obsidian Sync applies to the notices, which name a state in words (SPEC-FINAL §17.9).

**Files:**
- Create: `apps/client/src/components/ui/useModalFocus.ts`, `apps/client/src/components/ui/sheet.tsx`, `apps/client/src/components/ui/sheet.test.tsx`
- Create: `apps/client/src/components/ui/notice.tsx`, `apps/client/src/components/ui/notice.test.tsx`
- Create: `apps/client/src/lib/useMediaQuery.ts`, `apps/client/src/lib/useMediaQuery.test.ts`
- Create: `apps/client/src/features/shell/ShellState.tsx`
- Modify: `apps/client/src/components/ConfirmDialog.tsx`, `apps/client/src/components/StateMessage.tsx`, `apps/client/src/components/DesktopOnly.tsx`, `apps/client/src/components/Logo.tsx`, `apps/client/src/features/shell/NoCompetition.tsx`, `apps/client/src/season/FieldImage.tsx`, `apps/client/src/features/shell/AppShell.tsx` (the `HydrationGate` function only)
- Test contract, unchanged: `ConfirmDialog.test.tsx`, `StateMessage.test.tsx`, `DesktopOnly.test.tsx`, `Logo.test.tsx`, `FieldImage.test.tsx`, `AppShell.test.tsx`

**Interfaces:**
- Consumes: `Button`, `buttonVariants`, `Input`, `Label` (R.2); `.enter-*` (R.1).
- Produces:
  - `useModalFocus(onEscape: () => void, initial?: RefObject<HTMLElement | null>): { panel: RefObject<HTMLDivElement | null>; onKeyDown: (e: KeyboardEvent<HTMLElement>) => void }`.
  - `<Sheet open onClose label side?: 'start' | 'bottom'>`.
  - `<Notice tone?: 'info' | 'success' | 'warning' | 'danger' role? still? action? className? …>`.
  - `useMediaQuery(query: string, fallback: boolean): boolean`, `DESKTOP_QUERY`, `useIsDesktop(): boolean`.
  - `<ShellState glyph title busy?>`.
  - `<Logo variant? size?: 'sm' | 'lg' className?>`.

- [ ] **Step 1: Write the failing tests**

`apps/client/src/components/ui/sheet.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Sheet } from './sheet';

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open the menu
      </button>
      <Sheet
        open={open}
        label="Menu"
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
      >
        <button type="button">First</button>
        <a href="/last">Last</a>
      </Sheet>
    </>
  );
}

describe('Sheet', () => {
  it('opens as a labelled modal dialog with focus on its first control', async () => {
    render(<Harness />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open the menu' }));
    expect(screen.getByRole('dialog', { name: 'Menu' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('closes at once on Escape and hands focus back to what opened it', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Open the menu' }));
    await u.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open the menu' })).toHaveFocus();
  });

  it('keeps Tab inside', async () => {
    render(<Harness />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Open the menu' }));
    await u.tab();
    expect(screen.getByRole('link', { name: 'Last' })).toHaveFocus();
    await u.tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('closes when the scrim is tapped', async () => {
    render(<Harness />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Open the menu' }));
    await u.click(document.querySelector('[data-sheet-scrim]') as HTMLElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
```

`apps/client/src/components/ui/notice.test.tsx`:

```tsx
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
```

`apps/client/src/lib/useMediaQuery.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DESKTOP_QUERY, useIsDesktop, useMediaQuery } from './useMediaQuery';

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

function controllableMedia(initial: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches: initial,
    media: DESKTOP_QUERY,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  window.matchMedia = (() => media) as unknown as typeof window.matchMedia;
  return {
    set(next: boolean) {
      media.matches = next;
      for (const l of listeners) l();
    },
  };
}

describe('useMediaQuery', () => {
  it('answers the fallback where there is no matchMedia (jsdom)', () => {
    expect(renderHook(() => useMediaQuery(DESKTOP_QUERY, true)).result.current).toBe(true);
    expect(renderHook(() => useMediaQuery(DESKTOP_QUERY, false)).result.current).toBe(false);
  });

  it('follows the query as it changes', () => {
    const media = controllableMedia(false);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @frc/client exec vitest run src/components/ui src/lib/useMediaQuery.test.ts`
Expected: FAIL, `Failed to resolve import "./sheet"`, `"./notice"` and `"./useMediaQuery"`.

- [ ] **Step 3: Write the new modules**

`apps/client/src/components/ui/useModalFocus.ts`:

```ts
import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * The focus rules of every modal surface — ConfirmDialog, Sheet and the entry review:
 * first focus on `initial` (else the first focusable element), Tab and Shift+Tab kept
 * inside, Escape handed to `onEscape`, and focus handed back to what opened it on close.
 * Not a native <dialog>: jsdom has no `showModal`, and the tests must exercise the same
 * rules the app ships. Moved out of ConfirmDialog unchanged (redesign task R.3).
 */
export function useModalFocus(onEscape: () => void, initial?: RefObject<HTMLElement | null>) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = initial?.current ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE) ?? null;
    first?.focus();
    return () => {
      if (opener && opener.isConnected) opener.focus();
    };
    // Mount and unmount only: the opener is whatever held focus as the surface opened.
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onEscape();
      return;
    }
    if (e.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return { panel, onKeyDown };
}
```

`apps/client/src/components/ui/sheet.tsx`:

```tsx
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useModalFocus } from './useModalFocus';

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  /** The dialog's accessible name, e.g. "Menu". */
  label: string;
  /** `start`: the phone nav drawer. `bottom`: a phone action sheet. */
  side?: 'start' | 'bottom';
  children: ReactNode;
};

/**
 * A modal panel over a scrim, with ConfirmDialog's focus rules (useModalFocus). It slides
 * in (M3 emphasized-decelerate) and goes at once: an exit animation would keep a closed
 * sheet in the page, and M3 lets exits be quicker than entries.
 */
export function Sheet(props: SheetProps) {
  if (!props.open) return null;
  return createPortal(<OpenSheet {...props} />, document.body);
}

function OpenSheet({ onClose, label, side = 'start', children }: SheetProps) {
  const { panel, onKeyDown } = useModalFocus(onClose);
  return (
    <div className="fixed inset-0 z-50">
      {/* A tap on the scrim closes; the keyboard has Escape and the close button. */}
      <div
        aria-hidden="true"
        data-sheet-scrim=""
        className="enter-fade absolute inset-0 bg-bg/70"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={cn(
          'absolute flex flex-col overflow-y-auto border-border bg-surface',
          side === 'start'
            ? 'enter-drawer inset-y-0 start-0 w-[min(20rem,85vw)] border-e'
            : 'enter-sheet-up inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)]',
        )}
      >
        {children}
      </div>
    </div>
  );
}
```

`apps/client/src/components/ui/notice.tsx`:

```tsx
import type { ReactNode, Ref } from 'react';
import { cn } from '@/lib/utils';

const TONE = {
  info: 'border-s-border',
  success: 'border-s-status-played',
  warning: 'border-s-warning',
  danger: 'border-s-danger',
} as const;

/**
 * What the page must say out loud: a strip under the shell's top edge, or a box beside
 * the thing it is about. The start edge carries the tone; the text stays `--text`. It
 * rises in once when it appears — a state change the user must notice (SPEC-FINAL 17.9)
 * — unless `still`, and never moves again. `role` is the caller's: "status" for a state,
 * "alert" for a failure, none for a static line.
 */
export function Notice({
  tone = 'info',
  role,
  still = false,
  action,
  className,
  children,
  ref,
  ...rest
}: {
  tone?: keyof typeof TONE;
  role?: 'status' | 'alert';
  still?: boolean;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
  id?: string;
  tabIndex?: number;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}) {
  return (
    <div
      ref={ref}
      role={role}
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-s-4 border-border bg-surface px-3 py-2.5 text-sm text-text',
        TONE[tone],
        !still && 'enter-rise',
        className,
      )}
      {...rest}
    >
      <div dir="auto" className="min-w-0 flex-1">
        {children}
      </div>
      {action}
    </div>
  );
}
```

`apps/client/src/lib/useMediaQuery.ts`:

```ts
import { useEffect, useState } from 'react';

/** SPEC-FINAL 17.3: desktop starts at 1024 px; the width decides, never the user agent. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * A media query's answer, kept current. `fallback` is the answer where the browser has no
 * `matchMedia` — jsdom — so tests get a known layout without stubbing it.
 */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  const supported = typeof window.matchMedia === 'function';
  const [matches, setMatches] = useState(() =>
    supported ? window.matchMedia(query).matches : fallback,
  );
  useEffect(() => {
    if (!supported) return;
    const media = window.matchMedia(query);
    const listener = () => setMatches(media.matches);
    listener();
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query, supported]);
  return matches;
}

/** Desktop (≥ 1024 px). Desktop under test, where jsdom cannot say. */
export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY, true);
}
```

`apps/client/src/features/shell/ShellState.tsx`:

```tsx
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * A full-page state of the shell itself — no competition, loading, not loaded — laid out
 * like StateMessage (a glyph, one bold line, one muted line) but with its action optional:
 * a scouter on "no competition" has nothing to do but wait, and is told so.
 */
export function ShellState({
  glyph: Glyph,
  title,
  busy = false,
  children,
}: {
  glyph: LucideIcon;
  title: string;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      aria-busy={busy || undefined}
      className="enter-fade mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full border border-border bg-surface"
      >
        <Glyph className="size-6 text-text-muted" strokeWidth={1.5} />
      </span>
      <h1 className="mt-5 text-lg font-semibold" dir="auto">
        {title}
      </h1>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Move the existing components onto them**

`apps/client/src/components/ConfirmDialog.tsx`:
- Remove the file's own `FOCUSABLE` constant, its `useEffect` and its `onKeyDown` function.
- Replace the imports with:

```tsx
import { useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Notice } from './ui/notice';
import { useModalFocus } from './ui/useModalFocus';
```

Keep `ConfirmDialogProps` and the exported `ConfirmDialog` exactly as they are. Replace `OpenDialog`'s body from `const id = useId();` down to the end of the function with:

```tsx
  const id = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState('');
  const armed = typeToConfirm === undefined || typed === typeToConfirm;
  // First focus on Cancel, never on the destructive button; Escape cancels unless busy.
  const { panel, onKeyDown } = useModalFocus(() => {
    if (!busy) onCancel();
  }, cancel);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-4 sm:items-center">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        onKeyDown={onKeyDown}
        className="enter-scale w-full max-w-md rounded-2xl border border-border bg-surface p-6"
      >
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="mt-3 font-semibold" dir="auto">
          {objectName}
        </p>
        <div id={`${id}-body`} className="mt-2 text-sm text-text-muted">
          {body}
        </div>
        {loss && <p className="mt-3 text-sm font-medium">{loss}</p>}
        {typeToConfirm !== undefined && (
          <div className="mt-5">
            <Label htmlFor={`${id}-type`}>
              Type <span dir="auto">{typeToConfirm}</span> to confirm
            </Label>
            <Input
              id={`${id}-type`}
              type="text"
              value={typed}
              autoComplete="off"
              spellCheck={false}
              dir="auto"
              className="mt-1.5"
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        )}
        {error && (
          <Notice role="alert" tone="danger" className="mt-4">
            {error}
          </Notice>
        )}
        <div className="tap-row mt-6 flex justify-end">
          <Button ref={cancel} variant="secondary" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="destructive" disabled={busy || !armed} onClick={onConfirm}>
            <span dir="auto">{confirmLabel}</span>
          </Button>
        </div>
      </div>
    </div>
  );
```

The Cancel-then-destructive DOM order is what `ConfirmDialog.test.tsx`'s Tab-trap case expects. Keep it.

`apps/client/src/components/StateMessage.tsx`:
- Replace the `import { PRIMARY_BUTTON } from './buttonStyles';` line with:

```tsx
import { Button, buttonVariants } from './ui/button';
```

- Replace the returned JSX with the block below. Everything else in the file (`STATE_VARIANTS`, `SAFE_ON_DEVICE`, `VARIANTS`, the props) stays exactly as it is.

```tsx
  return (
    <section className="enter-fade mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full border border-border bg-surface"
      >
        <Glyph className="size-6 text-text-muted" strokeWidth={1.5} />
      </span>
      <Heading className="mt-5 text-lg font-semibold" dir="auto">
        {title ?? copy.title}
      </Heading>
      <p className="mt-2 text-sm text-text-muted" dir="auto">
        {line}
      </p>
      <div className="mt-6">
        {'to' in action ? (
          <Link to={action.to} className={buttonVariants({ variant: 'primary' })}>
            {action.label}
          </Link>
        ) : (
          <Button variant="primary" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    </section>
  );
```

`StateMessage.test.tsx` counts exactly one `<p>` and one action. The glyph plate is a `<span>`, so both counts hold.

`apps/client/src/components/DesktopOnly.tsx`: replace the whole file with:

```tsx
import { Monitor } from 'lucide-react';
import type { ReactNode } from 'react';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/useMediaQuery';

/**
 * SPEC-FINAL 17.2: builders unlock at 1024 px; anything narrower gets one clear panel.
 * The width decides, never the user agent (17.3). Device gating is not a permission
 * (7.4): the page inside still checks the role, and the server checks it again.
 *
 * `what` is written as it reads mid-sentence, e.g. "the form builder".
 */
export function DesktopOnly({ what, children }: { what: string; children: ReactNode }) {
  const wide = useMediaQuery(DESKTOP_QUERY, true);
  if (wide) return <>{children}</>;

  return (
    <div className="enter-fade mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full border border-border bg-surface"
      >
        <Monitor className="size-6 text-text-muted" strokeWidth={1.5} />
      </span>
      <h1 className="mt-5 text-lg font-semibold">This needs a computer</h1>
      <p className="mt-2 text-sm text-text-muted">
        Open {what} on a screen at least 1024 pixels wide. It is pre-competition work, done sitting
        down. Phones do the competition job — entering, browsing and reading — and this is not one
        of those.
      </p>
    </div>
  );
}
```

`apps/client/src/components/Logo.tsx`: replace the whole file with:

```tsx
import { cn } from '@/lib/utils';

const IMAGE = {
  sm: { mark: 'h-8 w-8', lockup: 'h-8 w-auto' },
  // The wordmark needs ~96 px of width to read (SPEC-FINAL 17.8); the lockup is taller
  // than it is wide, so `lg` is 144 px tall.
  lg: { mark: 'h-16 w-16', lockup: 'h-36 w-auto' },
} as const;

/**
 * SPEC-FINAL 17.4: brand yellow is 1.23:1 on white and 16:1 on near-black, so the
 * logo always sits on a --brand-plate plate, INCLUDING in the outdoor theme.
 */
export function Logo({
  variant = 'lockup',
  size = 'sm',
  className,
}: {
  variant?: 'lockup' | 'mark';
  size?: 'sm' | 'lg';
  className?: string;
}) {
  return (
    <span className={cn('brand-plate inline-flex items-center rounded-md p-2', className)}>
      <img
        src={variant === 'mark' ? '/brand/mark.png' : '/brand/logo.png'}
        alt="ROBACTIVE 2096"
        className={IMAGE[size][variant]}
      />
    </span>
  );
}
```

`apps/client/src/features/shell/NoCompetition.tsx`: replace the whole file with the block below. The text is unchanged, and R.4 swaps the literal path for `PATHS.manage`.

```tsx
import { CalendarX2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { ShellState } from './ShellState';

/**
 * The shell's gate when the server says no competition is set up (task 1.17b): the
 * `app_settings` singleton names no event. It is not an offline state and never says
 * anything about a connection — the device got its answer.
 *
 * `canSetUp` is `canManageEvents(user)` on the signed-in user (task 1.20): only an admin
 * gets the way out of this screen, to `/admin/manage` (marked `handle: NO_HYDRATION`, so
 * it is reachable from here).
 */
export function NoCompetition({ canSetUp }: { canSetUp: boolean }) {
  return (
    <ShellState glyph={CalendarX2} title="No competition is set up yet">
      <p className="mt-2 text-sm text-text-muted" dir="auto">
        An admin sets up the season and competition. This device loads it the next time it is
        online.
      </p>
      {canSetUp && (
        <Link to="/admin/manage" className={`${buttonVariants({ variant: 'primary' })} mt-6`}>
          Set up a competition
        </Link>
      )}
    </ShellState>
  );
}
```

`apps/client/src/features/shell/AppShell.tsx`:
- Add these imports:

```tsx
import { CloudDownload, CloudOff } from 'lucide-react';
import { ShellState } from './ShellState';
```

- Replace the body of `HydrationGate` from `if (state === 'loading') {` to the end of the function with:

```tsx
  if (state === 'loading') {
    return (
      <ShellState glyph={CloudDownload} title="Loading the competition onto this device" busy>
        <p className="mt-2 text-sm text-text-muted" dir="auto">
          This happens once, and takes a few seconds. The matches and robots appear as soon as it is
          done.
        </p>
      </ShellState>
    );
  }

  // 'blocked': this device has never loaded the event and got no answer. Only a device
  // that says it is offline is told it needs a connection; an online one is told the
  // server did not answer, so nobody goes hunting for Wi-Fi that will not help.
  return (
    <ShellState glyph={CloudOff} title="This device has not loaded the competition yet">
      <p className="mt-2 text-sm text-text-muted">
        {online
          ? SERVER_UNREACHABLE_LINE
          : 'An internet connection is required once, to load the event and its form. After that the app works with no network at all.'}
      </p>
    </ShellState>
  );
```

`apps/client/src/season/FieldImage.tsx`:
- Add `import { Notice } from '@/components/ui/notice';`.
- Replace the missing-image `return ( <div role="alert" …> … </div> );` with:

```tsx
    return (
      <Notice role="alert" tone="danger" still>
        <p className="font-semibold">This season's game image is missing.</p>
        <p className="mt-1 text-text-muted">
          The season points at <code>{path}</code>, which is not in this build. Commit it and
          redeploy the client. Field-position and cycle-path fields cannot be recorded until then.
        </p>
      </Notice>
    );
```

- [ ] **Step 5: Run the new tests and the unchanged contract**

Run: `pnpm --filter @frc/client exec vitest run src/components src/lib src/season src/features/shell`
Expected: every suite green. The new files pass. `ConfirmDialog.test.tsx`, `StateMessage.test.tsx`, `DesktopOnly.test.tsx`, `Logo.test.tsx`, `FieldImage.test.tsx` and `AppShell.test.tsx` all pass unmodified.

If `ConfirmDialog.test.tsx` fails, the refactor changed a focus rule. Fix the refactor, never the test.

- [ ] **Step 6: Screenshots, full check, commit**

Screenshot these at 375 px and 1280 px:
- the ConfirmDialog (Users → an account → Disable account);
- `/admin/users` offline (the StateMessage);
- a gated route on a device with nothing loaded (the ShellState, via a fresh browser profile with the network off);
- `/admin/manage` at 375 px (DesktopOnly).

```bash
pnpm format && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
git add apps/client/src
git commit -m "feat(client): put the dialog, states and notices on the design system, with one focus-trap hook"
```

---

## Task R.4: One place for paths — Scout moves to `/scout`, Home takes `/`

**Why:** the user chose `/context` upgraded into Home as the signed-in landing page (spec v0.49). `/` is the PWA's `start_url` and where sign-in lands, so Home takes `/`, Scout moves to `/scout`, and `/context` redirects to `/` so an old bookmark still lands. **[RAISED BY ME]** Home is also the page that sets a session override. That is safe to land on: an override is session-only, blocks new entries (`OverrideGuard`) and shows a banner, so an accidental tap is visible and undone in one tap.

**Files:**
- Create: `apps/client/src/lib/paths.ts`, `apps/client/src/lib/paths.test.ts`
- Modify: `apps/client/src/routes.tsx`, `apps/client/src/features/shell/AppShell.tsx`, `apps/client/src/features/shell/NoCompetition.tsx`, `apps/client/src/features/entry/EntryRoute.tsx`, `apps/client/src/features/entry/SelectRobotPage.tsx`, `apps/client/src/features/context/OverrideGuard.tsx`, `apps/client/src/features/admin/AdminOnly.tsx`, `apps/client/src/features/admin/ManagePage.tsx`, `apps/client/src/auth/LoginPage.tsx`, `apps/client/src/auth/ChangePasswordPage.tsx`, `apps/client/src/auth/SwitchScouter.tsx`
- Modify (tests, exactly as listed in Step 4): `apps/client/src/features/shell/AppShell.test.tsx`, `apps/client/src/routes.test.tsx`, `apps/client/src/features/admin/UsersPage.test.tsx`, `apps/client/src/features/entry/EntryRoute.test.tsx`, `apps/client/src/auth/offlineLogin.integration.test.ts`

**Interfaces:**
- Produces:
  - `PATHS = { home: '/', scout: '/scout', entries: '/entries', switchScouter: '/switch-scouter', changePassword: '/change-password', login: '/login', users: '/admin/users', manage: '/admin/manage' }`.
  - `ENTRY_ROUTE = '/entry/:matchId/:teamId'`.
  - `entryPath(matchId, teamId, alliance): string`.
  - `ENTRY_PATH_PREFIXES: readonly string[]`, `isEntryPath(pathname): boolean`.
- Rule for every later task: **a path is written once, in `PATHS`.** A new page adds its key there.

- [ ] **Step 1: Write the failing test**

`apps/client/src/lib/paths.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { entryPath, isEntryPath, PATHS } from './paths';

describe('paths (redesign R.4)', () => {
  it('puts Home at / and Scout at /scout', () => {
    expect(PATHS.home).toBe('/');
    expect(PATHS.scout).toBe('/scout');
  });

  it('builds the entry route with its alliance', () => {
    expect(entryPath('m-1', 't-1', 'blue')).toBe('/entry/m-1/t-1?alliance=blue');
  });

  it('knows the data-entry path, and nothing else as it (SPEC-FINAL 17.9)', () => {
    expect(isEntryPath('/scout')).toBe(true);
    expect(isEntryPath('/entry/m-1/t-1')).toBe(true);
    expect(isEntryPath('/entries')).toBe(false);
    expect(isEntryPath('/')).toBe(false);
    expect(isEntryPath('/scouting-report')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @frc/client exec vitest run src/lib/paths.test.ts`
Expected: FAIL, `Failed to resolve import "./paths"`.

- [ ] **Step 3: Write `paths.ts` and route through it**

`apps/client/src/lib/paths.ts`:

```ts
/**
 * Every in-app path, written once (redesign task R.4). `/` is Home — the context page
 * SPEC-FINAL 17.9 calls the landing page — and Scout lives at `/scout`. A task that adds a
 * page adds its path here and its nav row in features/shell/nav.ts.
 */
export const PATHS = {
  home: '/',
  scout: '/scout',
  entries: '/entries',
  switchScouter: '/switch-scouter',
  changePassword: '/change-password',
  login: '/login',
  users: '/admin/users',
  manage: '/admin/manage',
} as const;

/** The entry route's pattern, for `matchPath` and the route tree. */
export const ENTRY_ROUTE = '/entry/:matchId/:teamId';

export function entryPath(matchId: string, teamId: string, alliance: 'red' | 'blue'): string {
  return `/entry/${matchId}/${teamId}?alliance=${alliance}`;
}

/**
 * The data-entry path (SPEC-FINAL 17.9): the screens a scout uses mid-match. No route
 * transition plays into them and nothing on them moves unless it carries information.
 * Task 1.36 adds `/super`.
 */
export const ENTRY_PATH_PREFIXES: readonly string[] = [PATHS.scout, '/entry/'];

export function isEntryPath(pathname: string): boolean {
  return ENTRY_PATH_PREFIXES.some((prefix) =>
    prefix.endsWith('/')
      ? pathname.startsWith(prefix)
      : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
```

`apps/client/src/routes.tsx`:
- Add `Navigate` to the `react-router-dom` import, and add `import { PATHS } from '@/lib/paths';`.
- Replace the first child `{ index: true, element: <ScoutRoute /> },` with:

```tsx
        // Home (redesign R.4): the context page, now the landing page. It reads the cache
        // and the server itself (never useActiveEventId), so it renders with no event loaded.
        { index: true, element: <ContextPage />, handle: NO_HYDRATION },
        { path: 'scout', element: <ScoutRoute /> },
```

- Replace the `{ path: 'context', element: <ContextPage />, handle: NO_HYDRATION },` entry, and its comment, with:

```tsx
        // Task 1.22's path, kept so a bookmark or an old installed start page still lands.
        { path: 'context', element: <Navigate to={PATHS.home} replace />, handle: NO_HYDRATION },
```

`apps/client/src/features/shell/AppShell.tsx`:
- Delete the `ENTRY_ROUTE` and `CONTEXT_ROUTE` constants and their comments, and add `import { ENTRY_ROUTE, PATHS } from '@/lib/paths';`.
- Replace `const onContextPage = matchPath(CONTEXT_ROUTE, location.pathname) !== null;` with:

```tsx
  /** Home — the context page (task 1.22) — carries its own override banner and version line. */
  const onHome = location.pathname === PATHS.home;
```

- Rename every other `onContextPage` to `onHome`.
- Change the nav's Scout `to="/"` to `to={PATHS.scout}`, and the footer's `to={CONTEXT_ROUTE}` to `to={PATHS.home}`.

Change the remaining files as follows. Each one needs `import { PATHS } from '@/lib/paths';`, except `SelectRobotPage.tsx`, which imports `entryPath`.

| File | Change |
|---|---|
| `NoCompetition.tsx` | `to="/admin/manage"` becomes `to={PATHS.manage}`. |
| `EntryRoute.tsx` | Both `to: '/'` become `to: PATHS.scout`. Both `navigate('/')` become `navigate(PATHS.scout)`. `navigate('/', { replace: true, state: { saved } })` becomes `navigate(PATHS.scout, { replace: true, state: { saved } })`. |
| `SelectRobotPage.tsx` | Add `import { entryPath } from '@/lib/paths';`. The navigate in `start()` becomes `navigate(entryPath(matchId, team.id, side))`. |
| `OverrideGuard.tsx` | `to="/context"` becomes `to={PATHS.home}`. |
| `AdminOnly.tsx`, `ManagePage.tsx` | `to: '/'` becomes `to: PATHS.scout`. |
| `LoginPage.tsx` | `home()` returns `PATHS.changePassword` or `PATHS.home`. `navigate(offline ? '/' : …)` uses `PATHS.home`. |
| `ChangePasswordPage.tsx` | `navigate('/', …)` becomes `navigate(PATHS.home, …)`. The "Back to scouting" `to="/"` becomes `to={PATHS.scout}`. |
| `SwitchScouter.tsx` | `navigate('/', …)` becomes `navigate(PATHS.scout, …)`: the device was just handed to the next scout. The Cancel `to="/"` becomes `to={PATHS.home}`. |

- [ ] **Step 4: Move the tests' paths (and nothing else in them)**

Run these in Git Bash from the repo root, in this order: the `/` replacements must run before the `/context` ones.

```bash
cd apps/client/src
sed -i "s#renderShell('/')#renderShell('/scout')#g; s#router.navigate('/')#router.navigate('/scout')#g" features/shell/AppShell.test.tsx
sed -i "s#renderShell('/context')#renderShell('/')#g; s#toHaveAttribute('href', '/context')#toHaveAttribute('href', '/')#g" features/shell/AppShell.test.tsx
sed -i "s#renderAt('/')#renderAt('/scout')#g; s#pathname).toBe('/'))#pathname).toBe('/scout'))#g; s#'/context',#'/',#" routes.test.tsx
sed -i "s#toHaveAttribute('href', '/');#toHaveAttribute('href', '/scout');#; s#router.navigate('/'))#router.navigate('/scout'))#" features/admin/UsersPage.test.tsx
sed -i "s#toHaveAttribute('href', '/')#toHaveAttribute('href', '/scout')#g" features/entry/EntryRoute.test.tsx
sed -i "s#initialEntries: \['/'\]#initialEntries: ['/scout']#" auth/offlineLogin.integration.test.ts
cd ../../..
```

Then make these hand edits:
- `AppShell.test.tsx`:
  - `function renderShell(path = '/')` becomes `path = '/scout'`.
  - In its route tree, replace `{ index: true, element: <ScoutProbe /> },` with `{ index: true, element: <p>{CONTEXT_CHILD}</p>, handle: NO_HYDRATION },` followed by `{ path: 'scout', element: <ScoutProbe /> },`.
  - Delete the `{ path: 'context', … }` line.
- `routes.test.tsx`: add `'/scout'` to both path lists, the expired-session `it.each` and the no-session `for` loop. The `await router.navigate('/')` before the Switch scouter click stays on `/`, because Home offers that link.

`git diff --stat -- '*.test.*'` must list exactly the five test files above.

- [ ] **Step 5: Run the whole client suite**

Run: `pnpm --filter @frc/client exec vitest run`
Expected: every suite green.

- [ ] **Step 6: Screenshots, full check, commit**

Screenshot `/` and `/scout` at 375 px and 1280 px. Open `/context` and confirm it lands on `/`.

```bash
pnpm format && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
git add apps/client/src
git commit -m "refactor(client): move Scout to /scout and make / the home page"
```

---

## Task R.5: The nav registry

**Files:**
- Create: `apps/client/src/features/shell/nav.ts`, `apps/client/src/features/shell/nav.test.ts`

**Interfaces:**
- Consumes: `PATHS` (R.4); `canManageUsers`, `canManageEvents` (`features/admin/AdminOnly.tsx`).
- Produces:
  - `type NavAudience = { user: { id: string; role: Role }; expired: boolean; override: boolean }`.
  - `type NavGroup = 'competition' | 'admin'` and `NAV_GROUP_LABEL`.
  - `type NavItem = { id; label; to; icon: LucideIcon; group; bottomBar: number | null; end?; visible(who); disabled?(who) }`.
  - `NAV_ITEMS`, `BOTTOM_BAR_MAX = 4`.
  - `navItemsFor(who, items?)`, `bottomBarItems(who, items?)`, `groupsOf(items)`.
- **Rule for every later task:** a page reached from the nav adds **one row to `NAV_ITEMS`**, never a hand-written link in the shell. Only Search (1.51) and Ranking (1.58) take bottom-bar places.

- [ ] **Step 1: Write the failing test**

`apps/client/src/features/shell/nav.test.ts`:

```ts
import { House } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import type { Role } from '@frc/shared';
import { PATHS } from '@/lib/paths';
import {
  BOTTOM_BAR_MAX,
  bottomBarItems,
  groupsOf,
  NAV_ITEMS,
  navItemsFor,
  type NavAudience,
  type NavItem,
} from './nav';

const who = (role: Role, over: Partial<NavAudience> = {}): NavAudience => ({
  user: { id: 'u-1', role },
  expired: false,
  override: false,
  ...over,
});
const ids = (items: NavItem[]) => items.map((i) => i.id);

describe('the nav registry (redesign R.5)', () => {
  it('gives a scouter and a lead Home, Scout and Entries', () => {
    expect(ids(navItemsFor(who('scouter')))).toEqual(['home', 'scout', 'entries']);
    expect(ids(navItemsFor(who('lead')))).toEqual(['home', 'scout', 'entries']);
  });

  it('gives an admin Users and Manage too, grouped under Admin', () => {
    const items = navItemsFor(who('admin'));
    expect(ids(items)).toEqual(['home', 'scout', 'entries', 'users', 'manage']);
    expect(groupsOf(items).map((g) => [g.group, ids(g.items)])).toEqual([
      ['competition', ['home', 'scout', 'entries']],
      ['admin', ['users', 'manage']],
    ]);
  });

  it('drops the admin destinations once the session has expired', () => {
    expect(ids(navItemsFor(who('admin', { expired: true })))).toEqual(['home', 'scout', 'entries']);
  });

  it('disables Scout, and only Scout, under a session override (SPEC-FINAL 6.3)', () => {
    const overridden = who('scouter', { override: true });
    expect(ids(navItemsFor(overridden).filter((i) => i.disabled?.(overridden)))).toEqual(['scout']);
    expect(navItemsFor(who('scouter')).some((i) => i.disabled?.(who('scouter')))).toBe(false);
  });

  it('fills the bottom bar in its own order, and never past four', () => {
    expect(ids(bottomBarItems(who('admin')))).toEqual(['home', 'scout', 'entries']);
    const many: NavItem[] = [5, 3, 1, 4, 2, 0].map((place) => ({
      id: `p${place}`,
      label: `P${place}`,
      to: PATHS.home,
      icon: House,
      group: 'competition',
      bottomBar: place,
      visible: () => true,
    }));
    expect(ids(bottomBarItems(who('scouter'), many))).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(BOTTOM_BAR_MAX).toBe(4);
  });

  it('points every destination at a path from PATHS', () => {
    const known = new Set<string>(Object.values(PATHS));
    for (const item of NAV_ITEMS) expect(known.has(item.to), item.id).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @frc/client exec vitest run src/features/shell/nav.test.ts`
Expected: FAIL, `Failed to resolve import "./nav"`.

- [ ] **Step 3: Write `nav.ts`**

`apps/client/src/features/shell/nav.ts`:

```ts
import { CalendarCog, ClipboardPen, House, ListChecks, Users, type LucideIcon } from 'lucide-react';
import type { Role } from '@frc/shared';
import { canManageEvents, canManageUsers } from '@/features/admin/AdminOnly';
import { PATHS } from '@/lib/paths';

/** Who is looking: what decides which destinations show (convenience only, SPEC-FINAL 7.4). */
export type NavAudience = {
  user: { id: string; role: Role };
  expired: boolean;
  /** A session override is set (SPEC-FINAL 6.3). */
  override: boolean;
};

export type NavGroup = 'competition' | 'admin';

export const NAV_GROUP_LABEL: Record<NavGroup, string> = {
  competition: 'Competition',
  admin: 'Admin',
};

export type NavItem = {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  group: NavGroup;
  /** The item's place in the phone bottom bar, lower first; null keeps it in the drawer. */
  bottomBar: number | null;
  /** NavLink `end`: `/` is current on `/` alone. */
  end?: boolean;
  /** Whether it shows. The page checks the role again, and so does the server. */
  visible: (who: NavAudience) => boolean;
  /** Shown but not a link — Scout while a session override is set (SPEC-FINAL 6.3). */
  disabled?: (who: NavAudience) => boolean;
};

/** The phone bottom bar holds at most four (M3 navigation bar: three to five). */
export const BOTTOM_BAR_MAX = 4;

/**
 * Every destination, in sidebar order. A task that adds a page adds its row here — never
 * a hand-written link in the shell. Task 1.51 (Search) and 1.58 (Ranking) take bottom-bar
 * places, and 1.58 moves Entries back to the drawer (spec v0.49, the navigation decision).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    to: PATHS.home,
    icon: House,
    group: 'competition',
    bottomBar: 0,
    end: true,
    visible: () => true,
  },
  {
    id: 'scout',
    label: 'Scout',
    to: PATHS.scout,
    icon: ClipboardPen,
    group: 'competition',
    bottomBar: 1,
    visible: () => true,
    disabled: (who) => who.override,
  },
  {
    id: 'entries',
    label: 'Entries',
    to: PATHS.entries,
    icon: ListChecks,
    group: 'competition',
    bottomBar: 2,
    visible: () => true,
  },
  {
    id: 'users',
    label: 'Users',
    to: PATHS.users,
    icon: Users,
    group: 'admin',
    bottomBar: null,
    visible: (who) => !who.expired && canManageUsers(who.user),
  },
  {
    id: 'manage',
    label: 'Manage',
    to: PATHS.manage,
    icon: CalendarCog,
    group: 'admin',
    bottomBar: null,
    visible: (who) => !who.expired && canManageEvents(who.user),
  },
];

export function navItemsFor(who: NavAudience, items: readonly NavItem[] = NAV_ITEMS): NavItem[] {
  return items.filter((item) => item.visible(who));
}

export function bottomBarItems(
  who: NavAudience,
  items: readonly NavItem[] = NAV_ITEMS,
): NavItem[] {
  return navItemsFor(who, items)
    .filter((item) => item.bottomBar !== null)
    .sort((a, b) => (a.bottomBar ?? 0) - (b.bottomBar ?? 0))
    .slice(0, BOTTOM_BAR_MAX);
}

export function groupsOf(items: readonly NavItem[]): { group: NavGroup; items: NavItem[] }[] {
  return (['competition', 'admin'] as const)
    .map((group) => ({ group, items: items.filter((item) => item.group === group) }))
    .filter((entry) => entry.items.length > 0);
}
```

- [ ] **Step 4: Run it, full check, commit**

```bash
pnpm --filter @frc/client exec vitest run src/features/shell/nav.test.ts
pnpm format && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
git add apps/client/src/features/shell/nav.ts apps/client/src/features/shell/nav.test.ts
git commit -m "feat(client): add the nav registry every shell surface reads"
```

---

## Task R.6: The desktop shell — a collapsible sidebar

**Reference:** Linear / Vercel. Restrained dark chrome, one pill marking where you are, muted 1-px borders, the account at the foot. **Do not fast-forward `develop` until R.7 lands:** until then phones get the sidebar too.

**Files:**
- Create: `apps/client/src/features/shell/Brand.tsx`, `NavList.tsx`, `AccountBlock.tsx`, `Sidebar.tsx`, `ShellLayout.tsx`, `Sidebar.test.tsx`
- Modify: `apps/client/src/features/shell/AppShell.tsx` (its returned JSX only; not one line of the sync loop, the gate or the effects), `apps/client/src/features/shell/ConnectionIndicator.tsx` (a `compact` prop)
- Test contract, unchanged: `AppShell.test.tsx`, `ConnectionIndicator.test.tsx`, `routes.test.tsx`, `UsersPage.test.tsx`

**Interfaces:**
- Consumes: R.5's `NavItem`, `NavAudience`, `navItemsFor`, `groupsOf`, `NAV_GROUP_LABEL`; R.2 and R.3's `Button`, `buttonVariants`, `Badge`, `Notice`.
- Produces:
  - `<Brand compact?>`.
  - `<NavList items who collapsed? onNavigate?>`.
  - `<AccountBlock name role canSwitch canChangePassword onSignOut collapsed?>`.
  - `<Sidebar items who collapsed onToggle status account>`.
  - `<ShellLayout …>`, whose final props land in R.7.
  - `<ConnectionIndicator compact?>`.

**The contract this task keeps** (`AppShell.test.tsx`, unmodified):
- exactly one link each named `Scout`, `Entries`, `Users`, `Manage`, `Switch scouter` and `Change password`, plus one `Sign out` button;
- `Switch scouter` has class `tap-target`;
- under an override, `getByText('Scout')` is the `aria-disabled` element, so **the label is a direct text node of it**;
- the `Entries` link element survives an event switch, so the sidebar never remounts;
- the context link reads `Working on … · Change` and points at `/`;
- the override strip is the `role="status"` ancestor of its line and holds `Back to …`;
- no `version …` on `/`;
- no control text says reload / refresh / restart / update.

- [ ] **Step 1: Write the failing test**

`apps/client/src/features/shell/Sidebar.test.tsx`. It already passes R.7's three extra props (`desktop`, `bottomItems`, `hideBottomBar`). R.6's `ShellLayout` ignores them, so no later task edits this test.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@frc/shared';
import { navItemsFor, type NavAudience } from './nav';
import { ShellLayout } from './ShellLayout';

function renderShell(path = '/entries', role: Role = 'admin', over: Partial<NavAudience> = {}) {
  const who: NavAudience = { user: { id: 'u-1', role }, expired: false, override: false, ...over };
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <ShellLayout
            desktop
            items={navItemsFor(who)}
            bottomItems={[]}
            hideBottomBar={false}
            who={who}
            status={() => <span>online</span>}
            account={(collapsed) => <p>{collapsed ? 'compact account' : 'full account'}</p>}
            notices={null}
            footer={null}
          >
            <p>the page</p>
          </ShellLayout>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => localStorage.clear());

describe('the sidebar (redesign R.6)', () => {
  it('lists every destination once, grouped, with the current one marked', () => {
    renderShell('/entries');
    expect(screen.getByRole('list', { name: 'Competition' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Admin' })).toBeInTheDocument();
    for (const name of ['Home', 'Scout', 'Entries', 'Users', 'Manage']) {
      expect(screen.getAllByRole('link', { name })).toHaveLength(1);
    }
    expect(screen.getByRole('link', { name: 'Entries' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('marks Home current on / alone', () => {
    renderShell('/');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows Scout as a disabled item, not a link, under a session override', () => {
    renderShell('/entries', 'scouter', { override: true });
    expect(screen.queryByRole('link', { name: 'Scout' })).not.toBeInTheDocument();
    expect(screen.getByText('Scout')).toHaveAttribute('aria-disabled', 'true');
  });

  it('collapses to a rail, keeps every name, and remembers it on this device', async () => {
    renderShell();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Collapse the sidebar' }));
    expect(screen.getByRole('button', { name: 'Expand the sidebar' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('link', { name: 'Entries' })).toBeInTheDocument();
    expect(screen.getByText('compact account')).toBeInTheDocument();
    expect(localStorage.getItem('shell.sidebar.collapsed')).toBe('true');
  });

  it('starts collapsed when this device last left it collapsed', () => {
    localStorage.setItem('shell.sidebar.collapsed', 'true');
    renderShell();
    expect(screen.getByRole('button', { name: 'Expand the sidebar' })).toBeInTheDocument();
  });

  it('never remounts the page when the sidebar collapses', async () => {
    renderShell();
    const page = screen.getByText('the page');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Collapse the sidebar' }));
    expect(screen.getByText('the page')).toBe(page);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @frc/client exec vitest run src/features/shell/Sidebar.test.tsx`
Expected: FAIL, `Failed to resolve import "./ShellLayout"`.

- [ ] **Step 3: Write the shell pieces**

`apps/client/src/features/shell/Brand.tsx`:

```tsx
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';

/** The mark on its plate and the product's name (SPEC-FINAL 17.5: the mark alone when small). */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', compact && 'justify-center')}>
      <Logo variant="mark" className="p-1.5" />
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className="truncate font-semibold">ROBACTIVE</p>
          <p className="truncate text-xs text-text-muted">Scouting · team 2096</p>
        </div>
      )}
    </div>
  );
}
```

`apps/client/src/features/shell/NavList.tsx`:

```tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { groupsOf, NAV_GROUP_LABEL, type NavAudience, type NavItem } from './nav';

const ITEM =
  'tap-target state-layer motion-transition relative z-10 flex items-center gap-3 rounded-lg px-3 text-sm font-medium';

/**
 * One destination. Its label is a direct text node, so a disabled item IS its own label
 * (AppShell.test reads `getByText('Scout')` for the aria-disabled element). Collapsed, the
 * label stays for assistive technology and the icon carries the eye.
 */
export function NavItemLink({
  item,
  who,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  who: NavAudience;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const label = collapsed ? <span className="sr-only">{item.label}</span> : item.label;
  if (item.disabled?.(who)) {
    return (
      <span
        aria-disabled="true"
        className={cn(ITEM, 'cursor-not-allowed text-text-muted opacity-60')}
      >
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        {label}
      </span>
    );
  }
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(ITEM, isActive ? 'text-text' : 'text-text-muted hover:text-text')
      }
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      {label}
    </NavLink>
  );
}

/**
 * One group's list. A single pill sits behind the current item and slides to the next one
 * on every navigation (the M3 navigation indicator): it says where the user is, so it is
 * informational motion. It jumps into place on first render and only moves after that.
 */
function NavGroupList({
  label,
  items,
  who,
  collapsed,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  who: NavAudience;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const list = useRef<HTMLUListElement>(null);
  const placed = useRef(false);
  const { pathname } = useLocation();
  const [pill, setPill] = useState<{ top: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const current = list.current?.querySelector<HTMLElement>('[aria-current="page"]');
    setPill(current ? { top: current.offsetTop, height: current.offsetHeight } : null);
  }, [pathname, collapsed, items.length]);

  useEffect(() => {
    if (pill) placed.current = true;
  }, [pill]);

  return (
    <div>
      <p className={cn('px-3 pb-1 text-xs font-medium text-text-muted', collapsed && 'sr-only')}>
        {label}
      </p>
      <div className="relative">
        {pill && (
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-x-0 top-0 rounded-lg bg-surface-raised',
              placed.current && 'motion-transition',
            )}
            style={{ transform: `translateY(${pill.top}px)`, height: pill.height }}
          />
        )}
        <ul ref={list} aria-label={label} className="flex flex-col gap-0.5">
          {items.map((item) => (
            <li key={item.id}>
              <NavItemLink item={item} who={who} collapsed={collapsed} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The sidebar's and the phone drawer's destinations, grouped (nav.ts decides which). */
export function NavList({
  items,
  who,
  collapsed = false,
  onNavigate,
}: {
  items: NavItem[];
  who: NavAudience;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {groupsOf(items).map(({ group, items: groupItems }) => (
        <NavGroupList
          key={group}
          label={NAV_GROUP_LABEL[group]}
          items={groupItems}
          who={who}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}
```

`apps/client/src/features/shell/AccountBlock.tsx`:

```tsx
import { ArrowLeftRight, KeyRound, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Role } from '@frc/shared';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { ROLE_LABEL } from '@/features/admin/fields';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';

const ACTION = cn(
  buttonVariants({ variant: 'ghost', size: 'block' }),
  'justify-start gap-3 text-sm text-text-muted hover:text-text',
);

/**
 * Who is signed in, and the three things they can do about it. Moved from the old footer
 * (SPEC-FINAL 7.3, 7.5): Switch scouter only while the session is live, Change password
 * only with a token (it needs the server), Sign out always.
 */
export function AccountBlock({
  name,
  role,
  canSwitch,
  canChangePassword,
  onSignOut,
  collapsed = false,
}: {
  name: string;
  role: Role;
  canSwitch: boolean;
  canChangePassword: boolean;
  onSignOut: () => void;
  collapsed?: boolean;
}) {
  const label = (text: string) => (collapsed ? <span className="sr-only">{text}</span> : text);
  return (
    <div className="flex flex-col gap-0.5">
      <p
        className={cn(
          'flex flex-wrap items-center gap-2 px-3 pb-2 text-sm text-text-muted',
          collapsed && 'sr-only',
        )}
      >
        <span>
          Signed in as{' '}
          <span dir="auto" className="font-medium text-text">
            {name}
          </span>
        </span>
        <Badge>{ROLE_LABEL[role]}</Badge>
      </p>
      {canSwitch && (
        <Link
          to={PATHS.switchScouter}
          className={ACTION}
          title={collapsed ? 'Switch scouter' : undefined}
        >
          <ArrowLeftRight aria-hidden="true" />
          {label('Switch scouter')}
        </Link>
      )}
      {canChangePassword && (
        <Link
          to={PATHS.changePassword}
          className={ACTION}
          title={collapsed ? 'Change password' : undefined}
        >
          <KeyRound aria-hidden="true" />
          {label('Change password')}
        </Link>
      )}
      <button
        type="button"
        className={ACTION}
        title={collapsed ? 'Sign out' : undefined}
        onClick={onSignOut}
      >
        <LogOut aria-hidden="true" />
        {label('Sign out')}
      </button>
    </div>
  );
}
```

`apps/client/src/features/shell/Sidebar.tsx`:

```tsx
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Brand } from './Brand';
import { NavList } from './NavList';
import type { NavAudience, NavItem } from './nav';

/**
 * The desktop chrome (≥ 1024 px, SPEC-FINAL 17.3): the brand, the connection state, every
 * destination, the account. It collapses to a rail; the width change is a transition,
 * never a remount of the page beside it.
 */
export function Sidebar({
  items,
  who,
  collapsed,
  onToggle,
  status,
  account,
}: {
  items: NavItem[];
  who: NavAudience;
  collapsed: boolean;
  onToggle: () => void;
  status: ReactNode;
  account: ReactNode;
}) {
  return (
    <aside
      aria-label="Sidebar"
      className={cn(
        'motion-transition sticky top-0 flex h-dvh shrink-0 flex-col gap-4 border-e border-border bg-surface p-3',
        collapsed ? 'w-[4.75rem]' : 'w-64',
      )}
    >
      <Brand compact={collapsed} />
      <div className={cn(collapsed && 'flex justify-center')}>{status}</div>
      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto">
        <NavList items={items} who={who} collapsed={collapsed} />
      </nav>
      <div className="border-t border-border pt-3">{account}</div>
      <Button
        variant="ghost"
        size={collapsed ? 'icon' : 'default'}
        aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
        aria-expanded={!collapsed}
        className={cn('text-text-muted', collapsed ? 'self-center' : 'justify-start')}
        onClick={onToggle}
      >
        {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
        {!collapsed && 'Collapse'}
      </Button>
    </aside>
  );
}
```

`apps/client/src/features/shell/ShellLayout.tsx`, R.6's version: the sidebar at every width. It already takes R.7's `desktop`, `bottomItems` and `hideBottomBar` props, and ignores them until R.7 replaces this file.

```tsx
import { useState, type ReactNode, type TouchEventHandler } from 'react';
import { Sidebar } from './Sidebar';
import type { NavAudience, NavItem } from './nav';

const COLLAPSED_KEY = 'shell.sidebar.collapsed';

/** A remembered per-device convenience, never state that matters: storage may refuse. */
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, String(value));
  } catch {
    // Private mode or blocked storage: the choice is simply not remembered.
  }
}

export type ShellLayoutProps = {
  /** ≥ 1024 px: the sidebar. Below: the top bar, the drawer and the bottom bar (R.7). */
  desktop: boolean;
  items: NavItem[];
  bottomItems: NavItem[];
  /** The entry route: nothing in the thumb zone but the form's own Review bar. */
  hideBottomBar: boolean;
  who: NavAudience;
  /** The connection indicator; `collapsed` asks for its compact form. */
  status: (collapsed: boolean) => ReactNode;
  account: (collapsed: boolean) => ReactNode;
  /** The reconnect prompt and the notice strips, in the page flow above the page. */
  notices: ReactNode;
  footer: ReactNode;
  children: ReactNode;
  onTouchStart?: TouchEventHandler;
  onTouchMove?: TouchEventHandler;
};

export function ShellLayout({
  items,
  who,
  status,
  account,
  notices,
  footer,
  children,
  onTouchStart,
  onTouchMove,
}: ShellLayoutProps) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () => {
    const next = !collapsed;
    writeCollapsed(next);
    setCollapsed(next);
  };
  return (
    <div className="flex min-h-dvh" onTouchStart={onTouchStart} onTouchMove={onTouchMove}>
      <Sidebar
        items={items}
        who={who}
        collapsed={collapsed}
        onToggle={toggle}
        status={status(collapsed)}
        account={account(collapsed)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {notices}
        <div className="flex-1">{children}</div>
        <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-xs text-text-muted">
          {footer}
        </footer>
      </div>
    </div>
  );
}
```

`apps/client/src/features/shell/ConnectionIndicator.tsx`: add `import { cn } from '@/lib/utils';`. Change the signature to `export function ConnectionIndicator({ compact = false }: { compact?: boolean } = {})`. Replace the return with:

```tsx
  const text = unsynced > 0 ? `${state} · ${unsynced} unsynced` : state;
  return (
    <span
      role="status"
      title={compact ? text : undefined}
      className={cn(
        'tap-target inline-flex items-center gap-2 rounded-lg px-3 text-sm font-medium',
        compact && 'justify-center px-0',
      )}
      style={{ color: TOKEN[state] }}
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: TOKEN[state] }} />
      {compact ? <span className="sr-only">{text}</span> : text}
    </span>
  );
```

- [ ] **Step 4: Put AppShell's JSX onto `ShellLayout`**

`apps/client/src/features/shell/AppShell.tsx`:
- Add these imports:

```tsx
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { AccountBlock } from './AccountBlock';
import { bottomBarItems, navItemsFor, type NavAudience } from './nav';
import { ShellLayout } from './ShellLayout';
```

- Add `const desktop = useIsDesktop();` beside the other hooks at the top of the component, above every early return.
- Add this constant under `UPDATE_READY_LINE`:

```tsx
/** A notice as a full-width strip under the shell's top edge. */
const STRIP = 'rounded-none border-0 border-b border-s-4 px-4';
```

- Replace everything from the component's final `return (` to its closing `}` with the block below. Keep the `workingOn` and `lookingAt` lines above it.

```tsx
  const who: NavAudience = {
    user: current.user,
    expired: current.expired,
    override: override !== null,
  };

  const notices = (
    <>
      {offlineSession && prompt && (
        <ReconnectPrompt
          key={prompt.key}
          name={current.user.full_name}
          error={prompt.error}
          onClose={() => setPrompt(null)}
        />
      )}
      {current.expired ? (
        // Persistent and non-modal: the scout finishes the entry first (task 1.15).
        <Notice role="status" tone="warning" className={STRIP}>
          Sign in again to sync — this entry is saved on this device
        </Notice>
      ) : offlineSession ? (
        <Notice role="status" className={STRIP}>
          {OFFLINE_SIGNED_IN_LINE}
        </Notice>
      ) : (
        gate.state === 'cached' && (
          <Notice className={STRIP}>
            Working from data already on this device. Your entries are safe here and will sync when
            a connection returns.
          </Notice>
        )
      )}
      {override && !onHome && (
        // Persistent, on every page but Home (which carries its own banner).
        <Notice
          role="status"
          tone="warning"
          className={STRIP}
          action={
            <Button variant="ghost" className="underline" onClick={() => sessionOverride.clear()}>
              <span dir="auto">Back to {workingOn}</span>
            </Button>
          }
        >
          <span dir="auto">You are looking at {lookingAt} only for this session.</span>
        </Notice>
      )}
      {deferred && onEntryRoute && (
        <Notice role="status" tone="warning" className={STRIP}>
          The default competition has changed. Finish this entry — it stays with {workingOn}. This
          device moves to the new one when you leave it.
        </Notice>
      )}
      {switchedTo !== null && switchedTo === gate.eventId && loaded && (
        <Notice role="status" className={STRIP}>
          This device now works on {workingOn}, the new default competition.
        </Notice>
      )}
      {goneNotice && (
        <Notice role="status" tone="warning" className={STRIP}>
          {goneNotice}
        </Notice>
      )}
    </>
  );

  const footer = (
    <>
      {/* SPEC-FINAL 6.3: a link to the page, naming the context — never the switcher. */}
      {gate.eventId !== null && !current.expired && !onHome && (
        <Link
          className="tap-target state-layer inline-flex items-center rounded-lg px-2"
          to={PATHS.home}
        >
          <span dir="auto">{override ? `Looking at ${lookingAt}` : `Working on ${workingOn}`}</span>
          &nbsp;· Change
        </Link>
      )}
      {/* SPEC-FINAL 9.1: said, never acted on — no reload button, because there is
          nothing safe for it to do mid-match. */}
      {updateIsReady && <span>{UPDATE_READY_LINE}</span>}
      {!onHome && <span>version {clientConfig().appVersion}</span>}
    </>
  );

  return (
    <ShellLayout
      desktop={desktop}
      items={navItemsFor(who)}
      bottomItems={bottomBarItems(who)}
      hideBottomBar={onEntryRoute}
      who={who}
      status={(collapsed) => <ConnectionIndicator compact={collapsed} />}
      account={(collapsed) => (
        <AccountBlock
          name={current.user.full_name}
          role={current.user.role}
          canSwitch={!current.expired}
          canChangePassword={current.token !== null}
          onSignOut={() => void session.signOut()}
          collapsed={collapsed}
        />
      )}
      notices={notices}
      footer={footer}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
    >
      {/* Deliberately NOT `<Outlet key={state} />`: that remounts the page on every state
          change and would throw away a part-filled form ('cached' → 'fresh'). */}
      {showPage ? (
        <Outlet context={context} />
      ) : moving ? (
        <p className="p-8 text-center text-text-muted">Moving to the new default competition…</p>
      ) : (
        <HydrationGate
          state={gate.state}
          online={online}
          canSetUp={canManageEvents(current.user)}
        />
      )}
    </ShellLayout>
  );
}
```

Remove the imports that are now unused, such as `canManageUsers`. The linter names the rest.

- [ ] **Step 5: Run the new test and the unchanged contract**

Run: `pnpm --filter @frc/client exec vitest run src/features/shell src/routes.test.tsx src/features/admin`
Expected: every suite green, with `AppShell.test.tsx`, `ConnectionIndicator.test.tsx`, `routes.test.tsx` and `UsersPage.test.tsx` unmodified.

If an `AppShell.test.tsx` case finds two elements, a destination is rendered twice. Fix the shell, never the test.

- [ ] **Step 6: Screenshots, full check, commit**

Screenshot at 1280 px: `/entries` with the sidebar expanded, then collapsed; `/admin/users` as an admin; `/entries` under a session override.

```bash
pnpm format && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
git add apps/client/src/features/shell
git commit -m "feat(client): replace the header nav with a collapsible sidebar"
```

---

## Task R.7: The phone shell — top bar, drawer, bottom bar, and the route fade

**Reference:** the M3 navigation bar and modal navigation drawer; FotMob's thumb-reachable chrome. **[RAISED BY ME]** The bottom bar is hidden on the entry route, so a mid-match tap cannot leave the form and nothing competes with the Review bar in the thumb zone.

**Files:**
- Create: `apps/client/src/features/shell/TopBar.tsx`, `BottomBar.tsx`, `NavDrawer.tsx`, `ShellLayout.test.tsx`
- Modify: `apps/client/src/features/shell/ShellLayout.tsx` (replaced whole)

**Interfaces:**
- Consumes: R.3's `Sheet`; R.1's `PAGE_ENTER`, `DURATION`, `EASING`, `usePlayOnChange`; R.4's `isEntryPath`; R.6's `Brand`, `NavList`, `Sidebar`.
- Produces: `<TopBar menuOpen onOpenMenu status>`, `<BottomBar items who>`, `<NavDrawer open onClose items who account>`, and `ShellLayout` honouring `desktop`, `bottomItems` and `hideBottomBar`.

- [ ] **Step 1: Write the failing test**

`apps/client/src/features/shell/ShellLayout.test.tsx`:

```tsx
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGE_ENTER } from '@/lib/motion';
import { bottomBarItems, navItemsFor, type NavAudience } from './nav';
import { ShellLayout } from './ShellLayout';

const who: NavAudience = { user: { id: 'u-1', role: 'scouter' }, expired: false, override: false };

function Harness() {
  const [desktop, setDesktop] = useState(false);
  const { pathname } = useLocation();
  return (
    <ShellLayout
      desktop={desktop}
      items={navItemsFor(who)}
      bottomItems={bottomBarItems(who)}
      hideBottomBar={pathname.startsWith('/entry/')}
      who={who}
      status={() => <span>online</span>}
      account={() => <p>the account</p>}
      notices={null}
      footer={null}
    >
      <p>the page</p>
      <button type="button" onClick={() => setDesktop((d) => !d)}>
        Resize
      </button>
    </ShellLayout>
  );
}

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: '*', element: <Harness /> }], {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

const animate = vi.fn();
beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  animate.mockReset();
  Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true });
});
afterEach(() => {
  // @ts-expect-error jsdom has no animate; the stub is removed again
  delete HTMLElement.prototype.animate;
});

describe('the phone shell (redesign R.7)', () => {
  it('shows the menu button, a bottom bar with Home, Scout and Entries, and no sidebar', () => {
    renderAt('/entries');
    expect(screen.getByRole('button', { name: 'Open the menu' })).toBeInTheDocument();
    const quick = screen.getByRole('navigation', { name: 'Quick' });
    for (const name of ['Home', 'Scout', 'Entries']) {
      expect(within(quick).getByRole('link', { name })).toBeInTheDocument();
    }
    expect(within(quick).getByRole('link', { name: 'Entries' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.queryByRole('complementary', { name: 'Sidebar' })).not.toBeInTheDocument();
  });

  it('hides the bottom bar on the entry route', () => {
    renderAt('/entry/m-1/t-1');
    expect(screen.queryByRole('navigation', { name: 'Quick' })).not.toBeInTheDocument();
  });

  it('opens the drawer with every destination and the account, and closes it on a choice', async () => {
    const router = renderAt('/');
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Open the menu' }));
    const drawer = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(drawer).getByText('the account')).toBeInTheDocument();
    await u.click(within(drawer).getByRole('link', { name: 'Entries' }));
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entries');
  });

  it('closes the drawer on Escape and returns focus to the menu button', async () => {
    renderAt('/');
    const u = userEvent.setup();
    const menu = screen.getByRole('button', { name: 'Open the menu' });
    await u.click(menu);
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(menu).toHaveFocus();
  });

  it('fades a new page in, but never into the data-entry path (SPEC-FINAL 17.9)', async () => {
    const router = renderAt('/');
    expect(animate).not.toHaveBeenCalled();
    await act(() => router.navigate('/entries'));
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]![0]).toEqual(PAGE_ENTER);
    await act(() => router.navigate('/scout'));
    await act(() => router.navigate('/entry/m-1/t-1'));
    expect(animate).toHaveBeenCalledTimes(1);
    await act(() => router.navigate('/'));
    expect(animate).toHaveBeenCalledTimes(2);
  });

  it('keeps the page mounted when the width crosses the desktop breakpoint', async () => {
    renderAt('/entries');
    const page = screen.getByText('the page');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Resize' }));
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeInTheDocument();
    expect(screen.getByText('the page')).toBe(page);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @frc/client exec vitest run src/features/shell/ShellLayout.test.tsx`
Expected: FAIL, no `Open the menu` button (R.6's layout renders the sidebar at every width).

- [ ] **Step 3: Write the phone pieces**

`apps/client/src/features/shell/TopBar.tsx`:

```tsx
import { Menu } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Brand } from './Brand';

/** The phone's top edge: the menu, the brand, and the connection state on the right. */
export function TopBar({
  menuOpen,
  onOpenMenu,
  status,
}: {
  menuOpen: boolean;
  onOpenMenu: () => void;
  status: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b border-border bg-bg px-2 pt-[env(safe-area-inset-top)]">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open the menu"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        onClick={onOpenMenu}
      >
        <Menu aria-hidden="true" />
      </Button>
      <Brand />
      <div className="ms-auto">{status}</div>
    </header>
  );
}
```

`apps/client/src/features/shell/BottomBar.tsx`:

```tsx
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { NavAudience, NavItem } from './nav';

const ITEM =
  'tap-target flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-xs font-medium';
const PILL = 'state-layer flex h-8 w-16 items-center justify-center rounded-full';

/**
 * The M3 navigation bar: the phone's competition jobs in the thumb zone (SPEC-FINAL 17.3).
 * The current item's pill grows in when it becomes current — it says where you are, so it
 * is informational motion.
 */
export function BottomBar({ items, who }: { items: NavItem[]; who: NavAudience }) {
  return (
    <nav
      aria-label="Quick"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.id}>
              {item.disabled?.(who) ? (
                <span aria-disabled="true" className={cn(ITEM, 'text-text-muted opacity-60')}>
                  <span className={PILL}>
                    <Icon aria-hidden="true" className="size-6" />
                  </span>
                  {item.label}
                </span>
              ) : (
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(ITEM, isActive ? 'text-text' : 'text-text-muted')
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={cn(PILL, isActive && 'indicator-in bg-surface-raised')}>
                        <Icon aria-hidden="true" className="size-6" />
                      </span>
                      {item.label}
                    </>
                  )}
                </NavLink>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

`apps/client/src/features/shell/NavDrawer.tsx`:

```tsx
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Brand } from './Brand';
import { NavList } from './NavList';
import type { NavAudience, NavItem } from './nav';

/** The phone's full nav: the same destinations as the sidebar, and the account. */
export function NavDrawer({
  open,
  onClose,
  items,
  who,
  account,
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  who: NavAudience;
  account: ReactNode;
}) {
  return (
    <Sheet open={open} onClose={onClose} label="Menu" side="start">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <div className="min-w-0 flex-1">
          <Brand />
        </div>
        <Button variant="ghost" size="icon" aria-label="Close the menu" onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </div>
      <nav aria-label="Main" className="flex-1 p-3">
        <NavList items={items} who={who} onNavigate={onClose} />
      </nav>
      <div className="border-t border-border p-3">{account}</div>
    </Sheet>
  );
}
```

`apps/client/src/features/shell/ShellLayout.tsx`: replace the whole file with the version below. Keep `COLLAPSED_KEY`, `readCollapsed`, `writeCollapsed` and `ShellLayoutProps` exactly as R.6 wrote them.

```tsx
import { useEffect, useRef, useState, type ReactNode, type TouchEventHandler } from 'react';
import { useLocation } from 'react-router-dom';
import { DURATION, EASING, PAGE_ENTER, usePlayOnChange } from '@/lib/motion';
import { isEntryPath } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { BottomBar } from './BottomBar';
import { NavDrawer } from './NavDrawer';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import type { NavAudience, NavItem } from './nav';

const COLLAPSED_KEY = 'shell.sidebar.collapsed';
const ROUTE_MOTION = { duration: DURATION.medium1, easing: EASING.emphasizedDecelerate };

// readCollapsed, writeCollapsed and ShellLayoutProps: exactly as in R.6.

/**
 * The shell's frame. Its tree keeps ONE shape at every width — each piece of chrome is a
 * conditional sibling at a fixed position — so crossing the breakpoint (a tablet turned
 * sideways) never remounts the page and never throws a part-filled form away.
 */
export function ShellLayout({
  desktop,
  items,
  bottomItems,
  hideBottomBar,
  who,
  status,
  account,
  notices,
  footer,
  children,
  onTouchStart,
  onTouchMove,
}: ShellLayoutProps) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const content = useRef<HTMLDivElement>(null);

  // SPEC-FINAL 17.9: a new page fades in; nothing plays into the data-entry path.
  usePlayOnChange(content, pathname, PAGE_ENTER, ROUTE_MOTION, !isEntryPath(pathname));

  // A destination chosen in the drawer closes it, and so does any other navigation.
  useEffect(() => setMenuOpen(false), [pathname]);

  const toggle = () => {
    const next = !collapsed;
    writeCollapsed(next);
    setCollapsed(next);
  };
  const showBottomBar = !desktop && !hideBottomBar && bottomItems.length > 0;

  return (
    <div className="flex min-h-dvh" onTouchStart={onTouchStart} onTouchMove={onTouchMove}>
      {desktop && (
        <Sidebar
          items={items}
          who={who}
          collapsed={collapsed}
          onToggle={toggle}
          status={status(collapsed)}
          account={account(collapsed)}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {!desktop && (
          <TopBar menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} status={status(false)} />
        )}
        {notices}
        <div ref={content} className="flex-1">
          {children}
        </div>
        <footer
          className={cn(
            'flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-xs text-text-muted',
            showBottomBar && 'pb-24',
          )}
        >
          {footer}
        </footer>
        {showBottomBar && <BottomBar items={bottomItems} who={who} />}
      </div>
      {!desktop && (
        <NavDrawer
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          items={items}
          who={who}
          account={account(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the shell tests and the unchanged contract**

Run: `pnpm --filter @frc/client exec vitest run src/features/shell src/routes.test.tsx src/features/admin`
Expected: every suite green. `AppShell.test.tsx` still gets the desktop layout: jsdom has no `matchMedia`, so `useIsDesktop` falls back to desktop.

- [ ] **Step 5: Screenshots, full check, commit**

Screenshot at 375 px: `/` with the bottom bar; the drawer open; an entry route, with no bottom bar; `/entries` under an override. Screenshot `/entries` at 1280 px. With a part-filled entry open, resize across 1024 px and confirm the values survive.

```bash
pnpm format && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
git add apps/client/src/features/shell
git commit -m "feat(client): add the phone top bar, drawer and bottom bar, and a route fade"
```

---

## Task R.8: Home — the signed-in landing page

**Reference:** Figma file browser plus Notion (SPEC-FINAL §17.9, "Context / landing page"). Scope is chosen from a card grid, most recent first, and never a header dropdown. The page reads as a calm document, not a control panel, and the version sits quietly in the footer.

Home adds one thing above the card grid: a summary of what this device works on, with Scout as the one primary action. Scouts still reach Scout in one tap (bottom bar, sidebar, or the summary).

**Files:**
- Create: `apps/client/src/features/home/HomePage.tsx`, `apps/client/src/features/home/HomeSummary.tsx`, `apps/client/src/features/home/HomeSummary.test.tsx`
- Modify: `apps/client/src/features/shell/shellContext.ts` (the gate state joins the context), `apps/client/src/features/shell/AppShell.tsx` (the `GateState` type moves out; the context object gains `gate`), `apps/client/src/features/context/ContextPage.tsx` (root becomes a section, restyled), `apps/client/src/routes.tsx` (the index renders `HomePage`)
- Test contract, unchanged: `ContextPage.test.tsx`, `AppShell.test.tsx`, `UsersPage.test.tsx`, `routes.test.tsx`

**Interfaces:**
- Consumes: `useEventName` (`features/context/useEventName.ts`), `useSessionOverride`, `canManageEvents`, `PATHS`, `buttonVariants`, `Skeleton`, `Notice`, `Badge`, `Button`.
- Produces:
  - `type GateState = 'resolving' | 'loading' | HydrationState | 'no-event'`, exported from `shellContext.ts`.
  - `ShellContext.gate: GateState`.
  - `useShellContext(): ShellContext`.
  - `<HomeSummary />` and `<HomePage />`.

**Copy rule:** Home's own links are named `Scout a match`, `Review entries` and `Manage competitions`, never the nav's `Scout` / `Entries` / `Manage`. `UsersPage.test.tsx` finds `link 'Entries'` on `/` and must find exactly one.

- [ ] **Step 1: Write the failing test**

`apps/client/src/features/home/HomeSummary.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@frc/shared';
import { db } from '@/data/db';
import { sessionOverride } from '@/features/context/sessionOverride';
import type { ShellContext } from '@/features/shell/shellContext';
import { HomeSummary } from './HomeSummary';

const EVENT = 'ev-1';

function renderHome(over: Partial<ShellContext> = {}, role: Role = 'scouter') {
  const context: ShellContext = {
    user: {
      id: 'u-1',
      username: 'seed_scouter',
      full_name: 'Seed Scouter',
      role,
      must_change_password: false,
    },
    expired: false,
    eventId: EVENT,
    gate: 'fresh',
    ...over,
  };
  const router = createMemoryRouter([
    {
      path: '/',
      element: <Outlet context={context} />,
      children: [{ index: true, element: <HomeSummary /> }],
    },
  ]);
  render(<RouterProvider router={router} />);
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.rows.put({ entity: 'events', id: EVENT, season_id: 'se-1', name: 'Week 1' });
});
afterEach(() => sessionOverride.clear());

describe('HomeSummary (redesign R.8, SPEC-FINAL 17.9)', () => {
  it('names the competition this device works on, with Scout as the one primary action', async () => {
    renderHome();
    expect(await screen.findByRole('heading', { level: 1, name: 'Week 1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Scout a match' })).toHaveAttribute('href', '/scout');
    expect(screen.getByRole('link', { name: 'Review entries' })).toHaveAttribute(
      'href',
      '/entries',
    );
    expect(screen.queryByRole('link', { name: 'Manage competitions' })).not.toBeInTheDocument();
  });

  it('gives an admin the way to manage competitions', async () => {
    renderHome({}, 'admin');
    expect(await screen.findByRole('link', { name: 'Manage competitions' })).toHaveAttribute(
      'href',
      '/admin/manage',
    );
  });

  it('under a session override, names the other event and offers no new entry (SPEC-FINAL 6.3)', async () => {
    sessionOverride.set('ev-3', 'Week 3');
    renderHome();
    expect(await screen.findByRole('heading', { level: 1, name: 'Week 3' })).toBeInTheDocument();
    expect(await screen.findByText(/new entries are paused/i)).toHaveTextContent('Week 1');
    expect(screen.queryByRole('link', { name: 'Scout a match' })).not.toBeInTheDocument();
  });

  it('says there is no competition yet, and offers an admin the way to set one up', () => {
    renderHome({ eventId: null, gate: 'no-event' }, 'admin');
    expect(screen.getByRole('heading', { level: 1, name: 'No competition yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set up a competition' })).toHaveAttribute(
      'href',
      '/admin/manage',
    );
  });

  it('offers a scouter nothing to do when there is no competition yet', () => {
    renderHome({ eventId: null, gate: 'no-event' });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('says so while the competition loads onto the device', () => {
    renderHome({ eventId: EVENT, gate: 'loading' });
    expect(
      screen.getByRole('heading', { name: 'Loading the competition onto this device' }),
    ).toBeInTheDocument();
  });

  it('shows a busy skeleton, and no wrong claim, while the shell is still resolving', () => {
    renderHome({ eventId: null, gate: 'resolving' });
    expect(screen.getByRole('status', { name: 'Checking the competition' })).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @frc/client exec vitest run src/features/home`
Expected: FAIL, `Failed to resolve import "./HomeSummary"`.

- [ ] **Step 3: Put the gate into the shell context**

`apps/client/src/features/shell/shellContext.ts`:
- Add `import type { HydrationState } from '@/data/sync';` at the top.
- Add under the imports:

```ts
/**
 * Where the shell stands with the event (task 1.17b). `resolving` is the moment before the
 * cache has been read — and, on a device that holds no loaded event, the one
 * `getActiveContext` call. `no-event` is the server's answer that nothing is set up.
 */
export type GateState = 'resolving' | 'loading' | HydrationState | 'no-event';
```

- Add this field to `ShellContext`, after `eventId`:

```ts
  /** The gate's state, for a NO_HYDRATION page that says it itself — Home (redesign R.8). */
  gate: GateState;
```

- Add under `useSignedInUser`:

```ts
/** The whole shell context, for a NO_HYDRATION page that renders every gate state itself. */
export function useShellContext(): ShellContext {
  return useOutletContext<ShellContext>();
}
```

`apps/client/src/features/shell/AppShell.tsx`:
- Delete the local `type GateState = …` and its comment.
- Import it instead: change the `./shellContext` import to `import { needsNoHydration, type GateState, type ShellContext } from './shellContext';`.
- In the `context` object, add `gate: gate.state,` after `eventId: gate.eventId,`.

`ManagePage.test.tsx` builds an untyped Outlet context, so it needs no change.

- [ ] **Step 4: Write Home**

`apps/client/src/features/home/HomeSummary.tsx`:

```tsx
import { CalendarCog, ClipboardPen, ListChecks } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/Skeleton';
import { buttonVariants } from '@/components/ui/button';
import { canManageEvents } from '@/features/admin/AdminOnly';
import { useSessionOverride } from '@/features/context/sessionOverride';
import { useEventName } from '@/features/context/useEventName';
import { useShellContext } from '@/features/shell/shellContext';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';

/** What the top of Home says before the event is on the device (task 1.17b's states). */
const NOT_READY = {
  loading: {
    title: 'Loading the competition onto this device',
    detail: 'This happens once, and takes a few seconds.',
  },
  blocked: {
    title: 'This device has not loaded the competition yet',
    detail: 'It needs a connection once. After that it works with no network at all.',
  },
  'no-event': {
    title: 'No competition yet',
    detail:
      'An admin sets up the season and competition. This device loads it the next time it is online.',
  },
} as const;

const ACTION = 'lg' as const;

/**
 * The top of Home: which competition this device works on, and the one thing to do next
 * (SPEC-FINAL 17.9: one job, a calm document). Scout is the primary action; under a session
 * override it is withheld, because no new entry may be made then (6.3).
 */
export function HomeSummary() {
  const { user, eventId, gate } = useShellContext();
  const override = useSessionOverride();
  const eventName = useEventName(eventId, gate);
  const admin = canManageEvents(user);

  if (gate === 'resolving') {
    return <Skeleton rows={2} rowHeight="2.5rem" label="Checking the competition" />;
  }

  if (gate === 'loading' || gate === 'blocked' || gate === 'no-event') {
    const copy = NOT_READY[gate];
    return (
      <section aria-labelledby="home-title" className="enter-rise border-b border-border pb-8">
        <h1 id="home-title" className="text-2xl font-semibold tracking-tight">
          {copy.title}
        </h1>
        <p className="mt-2 max-w-prose text-text-muted">{copy.detail}</p>
        {gate === 'no-event' && admin && (
          <Link
            to={PATHS.manage}
            className={cn(buttonVariants({ variant: 'primary', size: ACTION }), 'mt-6')}
          >
            <CalendarCog aria-hidden="true" />
            Set up a competition
          </Link>
        )}
      </section>
    );
  }

  const name = eventName ?? 'this competition';
  return (
    <section aria-labelledby="home-title" className="enter-rise border-b border-border pb-8">
      <p className="text-sm font-medium text-text-muted">
        {override ? 'For this session, you are looking at' : 'This device is working on'}
      </p>
      <h1 id="home-title" dir="auto" className="mt-1 text-3xl font-semibold tracking-tight">
        {override ? (override.eventName ?? 'another competition') : name}
      </h1>
      <p className="mt-2 max-w-prose text-text-muted" dir="auto">
        {override
          ? `New entries are paused while you look at another competition. They can only be made in ${name}.`
          : 'Everything you enter is saved on this device first, and sent when there is a connection.'}
      </p>
      <div className="tap-row mt-6 flex flex-wrap gap-y-2">
        {!override && (
          <Link to={PATHS.scout} className={buttonVariants({ variant: 'primary', size: ACTION })}>
            <ClipboardPen aria-hidden="true" />
            Scout a match
          </Link>
        )}
        <Link to={PATHS.entries} className={buttonVariants({ variant: 'secondary', size: ACTION })}>
          <ListChecks aria-hidden="true" />
          Review entries
        </Link>
        {admin && (
          <Link to={PATHS.manage} className={buttonVariants({ variant: 'ghost', size: ACTION })}>
            <CalendarCog aria-hidden="true" />
            Manage competitions
          </Link>
        )}
      </div>
    </section>
  );
}
```

`apps/client/src/features/home/HomePage.tsx`:

```tsx
import { ContextPage } from '@/features/context/ContextPage';
import { HomeSummary } from './HomeSummary';

/** `/` (redesign R.8): what this device works on, then the competitions to look at. */
export function HomePage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 lg:px-10 lg:py-12">
      <HomeSummary />
      <ContextPage />
    </main>
  );
}
```

`apps/client/src/routes.tsx`:
- Add `import { HomePage } from '@/features/home/HomePage';`.
- Change the index child to `{ index: true, element: <HomePage />, handle: NO_HYDRATION },`.
- Remove the `ContextPage` import if nothing else uses it.

- [ ] **Step 5: Restyle the context page as Home's lower half**

`apps/client/src/features/context/ContextPage.tsx`:
- Replace `import { SECONDARY_BUTTON } from '@/components/buttonStyles';` with:

```tsx
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { cn } from '@/lib/utils';
```

- Replace the `CARD` and `CARD_SELECTED` constants with:

```tsx
/** A card: big, bordered, a 48 px floor, and one quiet marker under the name. */
const CARD =
  'tap-target state-layer motion-transition flex w-full flex-col items-start gap-1 rounded-xl border border-border bg-surface p-5 text-left disabled:cursor-not-allowed disabled:opacity-50';
const CARD_SELECTED = 'border-text bg-surface-raised';
```

- Replace the component's `return ( … );` with the block below. Every string and `aria-*` name is the one `ContextPage.test.tsx` reads. The override notice is the only `role="status"` inside the page.

```tsx
  return (
    <section aria-labelledby="context-title" className="mt-10">
      <h2 id="context-title" className="text-lg font-semibold">
        Competitions
      </h2>
      <p className="mt-1 max-w-prose text-sm text-text-muted">
        This device works on the competition an admin set as the default. You can look at another
        one for this session; reopening the app always returns to the default.
      </p>

      {override && (
        <Notice
          role="status"
          tone="warning"
          className="mt-4"
          action={
            <Button variant="secondary" onClick={() => sessionOverride.clear()}>
              <span dir="auto">Back to {defaultLabel}</span>
            </Button>
          }
        >
          You are looking at {override.eventName ?? 'another competition'} only for this session.
          You cannot create new entries here, and reopening the app returns to {defaultLabel}.
        </Notice>
      )}

      {!online ? (
        <p className="mt-4 text-sm text-text-muted">{OFFLINE_CONTEXT_LINE}</p>
      ) : (
        serverSilent && <p className="mt-4 text-sm text-text-muted">{SERVER_SILENT_LINE}</p>
      )}

      {cacheRead && seasons.length === 0 ? (
        <p className="mt-6 text-text-muted">No competition is set up on this device yet.</p>
      ) : (
        <section className="mt-6" aria-labelledby="context-seasons">
          <h3 id="context-seasons" className="text-sm font-medium text-text-muted">
            Seasons
          </h3>
          <ul
            aria-label="Seasons"
            className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {seasons.map((season) => {
              const isDefault = season.id === defaultSeasonId;
              const chosen = season.id === chosenSeasonId;
              return (
                <li key={season.id}>
                  <button
                    type="button"
                    aria-pressed={chosen}
                    disabled={!online && !isDefault}
                    className={cn(CARD, chosen && CARD_SELECTED)}
                    onClick={() => setChosenSeasonId(season.id)}
                  >
                    <span className="text-2xl font-semibold tabular-nums">{season.year}</span>
                    <span dir="auto" className="text-sm text-text-muted">
                      {season.game_name}
                    </span>
                    {isDefault && <Badge className="mt-2">Default season</Badge>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {chosenSeason && (
        <section className="mt-8" aria-labelledby="context-events">
          <h3 id="context-events" className="text-sm font-medium text-text-muted">
            Events in {chosenSeason.year} <span dir="auto">{chosenSeason.game_name}</span>
          </h3>
          {shownEvents.length === 0 ? (
            <p className="mt-3 text-text-muted">
              {online
                ? 'This season has no events yet.'
                : 'This season’s events need a connection to the server.'}
            </p>
          ) : (
            <ul
              aria-label={`Events in ${chosenSeason.year} ${chosenSeason.game_name}`}
              className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {shownEvents.map((event) => {
                const isDefault = event.id === defaultEventId;
                const isCurrent = event.id === workingOn;
                // One marker per card. "Current" is the event this session works on: the
                // default, or the override while one is set.
                const marker = isCurrent
                  ? override
                    ? 'Current, this session only'
                    : 'Current'
                  : isDefault
                    ? 'Default'
                    : null;
                return (
                  <li key={event.id}>
                    <button
                      type="button"
                      aria-pressed={isCurrent}
                      disabled={!online && !isDefault}
                      className={cn(CARD, isCurrent && CARD_SELECTED)}
                      onClick={() => void choose(event)}
                    >
                      <span dir="auto" className="text-lg font-semibold">
                        {event.name}
                      </span>
                      {marker && (
                        <Badge tone={isCurrent ? 'success' : 'neutral'} className="mt-2">
                          {marker}
                        </Badge>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <footer className="mt-16 border-t border-border pt-4 text-center text-xs text-text-muted">
        version {clientConfig().appVersion}
      </footer>
    </section>
  );
```

- [ ] **Step 6: Run the new test and the unchanged contract**

Run: `pnpm --filter @frc/client exec vitest run src/features/home src/features/context src/features/shell src/features/admin src/routes.test.tsx`
Expected: every suite green, with `ContextPage.test.tsx` unmodified.

- [ ] **Step 7: Screenshots, full check, commit**

Screenshot `/` at 375 px and 1280 px, in three states: a fresh device on the seeded event; under a session override; an admin on an install with no competition. Checklist against Figma + Notion: a card grid, most recent first; a calm document; the version in the footer; one primary action.

```bash
pnpm format && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
git add apps/client/src
git commit -m "feat(client): make Home the signed-in landing page"
```

---

## Task R.9: Sign-in, change password, switch scouter and the reconnect prompt

**Reference:** the Linear / Vercel sign-in. One job per screen, the form alone on the page. Desktop adds the ROBACTIVE lockup on its near-black plate as a panel beside the form. That is brand, not marketing: no tagline, no hero copy.

**Files:**
- Modify: `apps/client/src/auth/AuthFrame.tsx`, `LoginPage.tsx`, `ChangePasswordPage.tsx`, `SwitchScouter.tsx`, `ReconnectPrompt.tsx`
- Test contract, unchanged: `LoginPage.test.tsx`, `ChangePasswordPage.test.tsx`, `SwitchScouter.test.tsx`, `AppShell.test.tsx` (the reconnect-prompt cases), `routes.test.tsx`

**Interfaces:**
- Consumes: `Label`, `Input`, `NativeSelect`, `Button`, `buttonVariants`, `Notice`, `PageHeader`, `Logo size="lg"`, `PATHS`.
- Produces: no new exports. `AuthFrame`, `AuthField`, `AuthError` and `AuthSubmit` keep their props.

- [ ] **Step 1: Confirm the contract is green before touching it**

Run: `pnpm --filter @frc/client exec vitest run src/auth`
Expected: PASS. These files are this task's tests. It adds none and changes none.

- [ ] **Step 2: Rewrite `AuthFrame.tsx`**

Replace the whole of `apps/client/src/auth/AuthFrame.tsx` with:

```tsx
import { useId, type ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/ui/notice';

/**
 * The frame shared by the sign-in and change-password screens. One job per screen
 * (SPEC-FINAL 17.9). On a phone: the mark, then the form. On a computer, the lockup sits on
 * its near-black plate beside the form (17.4) — brand, not a hero: no tagline, no copy.
 */
export function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <div
        aria-hidden="true"
        className="brand-plate hidden flex-col items-center justify-center gap-4 border-e border-border lg:flex"
      >
        <Logo size="lg" />
      </div>
      <div className="flex flex-col items-center justify-center px-4 py-10">
        <div className="enter-rise w-full max-w-sm">
          {/* The mark alone: at this size the wordmark is unreadable (SPEC-FINAL 17.8). */}
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo variant="mark" />
          </div>
          <section aria-labelledby="auth-title">
            <h1 id="auth-title" className="text-2xl font-semibold tracking-tight">
              {title}
            </h1>
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}

/** A labelled input at the 48 px floor (SPEC-FINAL 17.7). The hint sits outside the label. */
export function AuthField(props: {
  label: ReactNode;
  type: 'text' | 'password';
  value: string;
  autoComplete: string;
  onChange: (value: string) => void;
  hint?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="mt-5">
      <Label htmlFor={id}>{props.label}</Label>
      <Input
        id={id}
        type={props.type}
        value={props.value}
        autoComplete={props.autoComplete}
        autoFocus={props.autoFocus}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        dir="auto"
        aria-describedby={props.hint ? hintId : undefined}
        className="mt-1.5"
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.hint && (
        <p id={hintId} className="mt-1.5 text-sm text-text-muted">
          {props.hint}
        </p>
      )}
    </div>
  );
}

/** The one error line: in view, announced, and never a raw code (SPEC-FINAL 17.8). */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Notice role="alert" tone="danger" className="mt-5">
      {message}
    </Notice>
  );
}

export function AuthSubmit({
  busy,
  label,
  busyLabel,
}: {
  busy: boolean;
  label: string;
  busyLabel: string;
}) {
  return (
    <Button type="submit" variant="primary" size="block" disabled={busy} className="mt-6">
      {busy ? busyLabel : label}
    </Button>
  );
}
```

- [ ] **Step 3: The screens**

`apps/client/src/auth/LoginPage.tsx`:
- Add `import { Notice } from '@/components/ui/notice';`.
- Replace the two status paragraphs with:

```tsx
      {current?.expired && (
        <Notice role="status" tone="warning" className="mt-4">
          {EXPIRED_LINE}
        </Notice>
      )}
      {!online && (
        <Notice role="status" className="mt-4">
          {OFFLINE_SIGN_IN_LINE}
        </Notice>
      )}
```

`apps/client/src/auth/ChangePasswordPage.tsx`:
- Add these imports:

```tsx
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
```

- Replace the "Back to scouting" link's `className="tap-target mt-2 flex w-full items-center justify-center rounded-lg border border-[var(--border)]"` with `className={cn(buttonVariants({ variant: 'ghost', size: 'block' }), 'mt-2')}`.
- Change the forced-change line's class to `mt-2 text-sm text-text-muted`.

`apps/client/src/auth/SwitchScouter.tsx`:
- Add these imports:

```tsx
import { buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';
```

- Replace the component's final `return ( … );` with:

```tsx
  return (
    <main className="mx-auto w-full max-w-md px-4 py-8">
      <PageHeader
        title="Switch scouter"
        description={
          users.length > 0 ? 'Entries already on this device keep the scouter who made them.' : undefined
        }
      />
      {users.length === 0 ? (
        <Notice still className="mt-6">
          {NO_CACHED_ACCOUNTS_LINE}
        </Notice>
      ) : (
        <form noValidate className="mt-6" onSubmit={(e) => void submit(e)}>
          <Label htmlFor={pickerId}>Scouter</Label>
          <NativeSelect
            id={pickerId}
            dir="auto"
            value={chosenId}
            wrapperClassName="mt-1.5"
            onChange={(e) => {
              setChosenId(e.target.value);
              setPassword('');
              setError(null);
            }}
          >
            <option value="" disabled>
              Choose who is scouting
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id} dir="auto">
                {optionText(u, u.id === current?.user.id)}
              </option>
            ))}
          </NativeSelect>
          {chosen && (
            <AuthField
              key={chosen.id}
              label={
                <>
                  Password for <span dir="auto">{chosen.full_name}</span>
                </>
              }
              type="password"
              value={password}
              autoComplete="current-password"
              autoFocus
              onChange={setPassword}
            />
          )}
          <AuthError message={error} />
          <AuthSubmit busy={busy} label="Switch scouter" busyLabel="Switching…" />
        </form>
      )}
      <Link
        className={cn(buttonVariants({ variant: 'ghost', size: 'block' }), 'mt-2')}
        to={PATHS.home}
      >
        Cancel
      </Link>
    </main>
  );
```

`apps/client/src/auth/ReconnectPrompt.tsx`:
- Add these imports:

```tsx
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
```

- Replace the returned `<section …> … </section>` with the block below. It is still a labelled region in the page flow: never a dialog, and it never takes focus.

```tsx
    <section
      aria-labelledby={`${id}-title`}
      className="enter-rise border-b border-s-4 border-border border-s-warning bg-surface px-4 py-3"
    >
      <h2 id={`${id}-title`} className="text-sm font-semibold">
        {RECONNECT_TITLE}
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        Enter the password for <span dir="auto">{name}</span> once to upload this device&apos;s
        entries. They are safe on this device until then.
      </p>
      <form noValidate className="mt-3" onSubmit={(e) => void submit(e)}>
        <Label htmlFor={`${id}-password`}>Password</Label>
        <div className="tap-row mt-1.5 flex flex-wrap items-center gap-y-2">
          <Input
            id={`${id}-password`}
            type="password"
            value={password}
            autoComplete="current-password"
            dir="auto"
            className="flex-1"
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
        </div>
        <AuthError message={error} />
      </form>
    </section>
```

- [ ] **Step 4: Run the contract**

Run: `pnpm --filter @frc/client exec vitest run src/auth src/features/shell src/routes.test.tsx`
Expected: every suite green, unmodified. `LoginPage.test.tsx` still finds `tap-target` on the submit button, and `SwitchScouter.test.tsx` finds it on the picker `<select>`.

- [ ] **Step 5: Screenshots, full check, commit**

Screenshot `/login` at 375 px and 1280 px (fresh; offline; with a wrong-password error), `/change-password` (forced), `/switch-scouter`, and the reconnect prompt (an offline sign-in, then the network back).

```bash
pnpm format && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
git add apps/client/src/auth
git commit -m "feat(client): redesign sign-in, change password, switch scouter and the reconnect prompt"
```

---

## Task R.10: Alliance colours, and the scout flow

**Reference:** Tally, Typeform and FotMob (SPEC-FINAL §17.9, "Phone data entry"):
- pacing: one job on screen, generous spacing, no cramped rows;
- counters as a wide − / value / + triplet, never a text input;
- choices as big tappable cards;
- the one primary action pinned in the thumb zone.

**[RAISED BY ME]** §17.4 gave the two alliances no colour. They are functional colour, like the robot statuses, so they get two tokens. Both are contrast-tested and neither is brand yellow (SPEC-FINAL v1.3 §17.4).

**Files:**
- Modify: `apps/client/src/styles/tokens.css` (two tokens per theme), `apps/client/src/styles/index.css` (two theme names), `apps/client/src/components/ui/badge.tsx` (two tones)
- Create: `apps/client/src/styles/contrast.test.ts`
- Create: `apps/client/src/components/entry/ChoiceGroup.tsx`, `CounterControl.tsx`, `ToggleField.tsx`, `StickyActionBar.tsx`, `entry.test.tsx`
- Modify: `apps/client/src/features/entry/SelectRobotPage.tsx`, `EntryRoute.tsx`, `EntryPage.tsx`, `FieldInput.tsx`, `RobotStatusPicker.tsx`
- Test contract, unchanged: `SelectRobotPage.test.tsx`, `EntryRoute.test.tsx`, `EntryPage.test.tsx`, `routes.test.tsx`, `AppShell.test.tsx`

**Interfaces:**
- Consumes: `VALUE_TICK`, `usePlayOnChange`, `DURATION`, `EASING` (R.1); `useModalFocus` (R.3); R.2's primitives.
- Produces:
  - Tokens `--alliance-red` / `--alliance-blue`, theme names `bg-alliance-red` / `border-alliance-red` (and blue), and `BadgeTone` `'alliance-red' | 'alliance-blue'`.
  - `type Choice<V> = { value: V; label: ReactNode; ariaLabel?: string; accent?: string }`.
  - `<ChoiceGroup legend name? value options onChange columns?: 2 | 4 groupLabel?>`.
  - `<CounterControl label value onChange step? min?>`.
  - `<ToggleField label checked onChange>`.
  - `<StickyActionBar>`.
- **Task 1.33 builds every further field type from these four controls.**

**The contract this task keeps:**
- the radio names `red` / `blue` (by `aria-label`);
- `Played`, `Broke down`, `Disabled` and `No show` (by label text);
- `group` named `Robot status`;
- the counter button names `<label> plus one` / `<label> minus one`, and the output named `<label> value`;
- no `spinbutton` for a counter;
- `combobox` `/robot/i`;
- `Start entry`, `Review entry`, `Submit entry` and `Keep editing`;
- the review `dialog`, whose failed-submit `alert` is a **direct child of the `.sticky` footer** (`EntryPage.test.tsx`);
- exactly one `role="status"` while a notice shows on `/scout`, and none otherwise.

- [ ] **Step 1: Write the failing tests**

`apps/client/src/styles/contrast.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');
const outdoorAt = css.indexOf("[data-theme='outdoor']");
const THEMES = { dark: css.slice(0, outdoorAt), outdoor: css.slice(outdoorAt) };

function token(theme: string, name: string): string {
  const match = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(theme);
  if (!match?.[1]) throw new Error(`${name} is not a six-digit hex in this theme`);
  return match[1];
}

/** WCAG 2.x relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const channel = (at: number) => {
    const c = parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('alliance colours (SPEC-FINAL v1.3 17.4, 17.7)', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    it(`clears 3:1 as a UI boundary on every surface, ${name} theme`, () => {
      for (const alliance of ['--alliance-red', '--alliance-blue']) {
        for (const surface of ['--bg', '--surface', '--surface-raised']) {
          expect(
            contrast(token(theme, alliance), token(theme, surface)),
            `${alliance} on ${surface}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    });

    it(`is never brand yellow, ${name} theme`, () => {
      for (const alliance of ['--alliance-red', '--alliance-blue']) {
        expect(token(theme, alliance).toUpperCase()).not.toBe('#FFEA07');
      }
    });
  }
});
```

`apps/client/src/components/entry/entry.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChoiceGroup } from './ChoiceGroup';
import { CounterControl } from './CounterControl';
import { ToggleField } from './ToggleField';

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
  // @ts-expect-error jsdom has no animate; a test may have stubbed it
  delete HTMLElement.prototype.animate;
});

function Counter() {
  const [value, setValue] = useState(0);
  return <CounterControl label="Auto notes" value={value} onChange={setValue} />;
}

describe('ChoiceGroup', () => {
  it('is a labelled group of native radios, named by aria-label or by their card', async () => {
    const onChange = vi.fn();
    render(
      <ChoiceGroup
        legend="Alliance"
        name="alliance"
        value={null}
        onChange={onChange}
        options={[
          { value: 'red', label: 'Red', ariaLabel: 'red', accent: 'var(--alliance-red)' },
          { value: 'blue', label: 'Blue', ariaLabel: 'blue', accent: 'var(--alliance-blue)' },
        ]}
      />,
    );
    expect(screen.getByRole('group', { name: 'Alliance' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('radio', { name: 'red' }));
    expect(onChange).toHaveBeenCalledWith('red');
  });

  it('shows the chosen value as checked', () => {
    render(
      <ChoiceGroup
        legend="Robot status"
        value="played"
        onChange={vi.fn()}
        options={[
          { value: 'played', label: 'Played' },
          { value: 'no_show', label: 'No show' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Played' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'No show' })).not.toBeChecked();
  });
});

describe('CounterControl (SPEC-FINAL 17.9: a wide − / value / + triplet)', () => {
  it('counts up and down, never below zero, with no text input', async () => {
    render(<Counter />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Auto notes minus one' }));
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('0');
    await u.click(screen.getByRole('button', { name: 'Auto notes plus one' }));
    await u.click(screen.getByRole('button', { name: 'Auto notes plus one' }));
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('2');
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('confirms each change with one tick on the value, and none on first render', async () => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    const animate = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true });
    render(<Counter />);
    expect(animate).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Auto notes plus one' }));
    expect(animate).toHaveBeenCalledOnce();
  });
});

describe('ToggleField', () => {
  it('is a native checkbox named by its label', async () => {
    const onChange = vi.fn();
    render(<ToggleField label="Left the start line" checked={false} onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Left the start line' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @frc/client exec vitest run src/styles/contrast.test.ts src/components/entry`
Expected: FAIL, `--alliance-red is not a six-digit hex in this theme` and `Failed to resolve import "./ChoiceGroup"`.

- [ ] **Step 3: The tokens**

`apps/client/src/styles/tokens.css`:
- In the dark block, under `--sync-online: #22C55E;`, add:

```css
  --alliance-red: #EF4444;
  --alliance-blue: #3B82F6;
```

- In the outdoor block, under `--sync-online: #15803D;`, add:

```css
  --alliance-red: #B91C1C;
  --alliance-blue: #1D4ED8;
```

`apps/client/src/styles/index.css`: in `@theme inline`, add:

```css
  --color-alliance-red: var(--alliance-red);
  --color-alliance-blue: var(--alliance-blue);
```

`apps/client/src/components/ui/badge.tsx`: add two entries to `TONE`:

```tsx
  'alliance-red': ['border-alliance-red', 'bg-alliance-red'],
  'alliance-blue': ['border-alliance-blue', 'bg-alliance-blue'],
```

- [ ] **Step 4: The entry controls**

`apps/client/src/components/entry/ChoiceGroup.tsx`:

```tsx
import { useId, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type Choice<V extends string> = {
  value: V;
  label: ReactNode;
  /** The radio's accessible name where the visible label is not it (e.g. "red"). */
  ariaLabel?: string;
  /** A token colour for the chosen card's edge and its dot: an alliance or a robot status. */
  accent?: string;
};

/**
 * One choice among a few, as big tappable cards (SPEC-FINAL 17.9, 17.7). The radio stays
 * native and focusable; its card is its label, so a tap anywhere on it chooses. The chosen
 * card takes the accent edge — a state change the scout must see, so its colour change is
 * the one motion here.
 */
export function ChoiceGroup<V extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  columns = 2,
  groupLabel,
}: {
  legend: string;
  name?: string;
  value: V | null;
  options: readonly Choice<V>[];
  onChange: (value: V) => void;
  columns?: 2 | 4;
  groupLabel?: string;
}) {
  const fallbackName = useId();
  return (
    <fieldset role="group" aria-label={groupLabel ?? legend} className="min-w-0">
      <legend className="text-sm font-medium" dir="auto">
        {legend}
      </legend>
      <div
        className={cn('mt-2 grid gap-2', columns === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2')}
      >
        {options.map((option) => (
          <label
            key={option.value}
            style={{ '--accent': option.accent ?? 'var(--text)' } as CSSProperties}
            className="tap-target state-layer press motion-transition flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-4 has-[:checked]:border-2 has-[:checked]:border-[var(--accent)] has-[:checked]:bg-surface-raised has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
          >
            <input
              type="radio"
              name={name ?? fallbackName}
              value={option.value}
              aria-label={option.ariaLabel}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.accent && (
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-full"
                style={{ background: option.accent }}
              />
            )}
            <span className="font-medium" dir="auto">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
```

`apps/client/src/components/entry/CounterControl.tsx`:

```tsx
import { Minus, Plus } from 'lucide-react';
import { useRef } from 'react';
import { DURATION, EASING, usePlayOnChange, VALUE_TICK } from '@/lib/motion';

const TICK = { duration: DURATION.short3, easing: EASING.standard };
const SIDE =
  'tap-target state-layer press motion-transition flex min-h-14 flex-1 items-center justify-center rounded-xl border border-border bg-surface text-text';

/**
 * SPEC-FINAL 17.9: "Counters are a wide − / value / + triplet, never a text input." The value
 * ticks once when it changes — the confirmation that a tap in a loud arena counted. That is
 * informational, so it is allowed on the data-entry path.
 */
export function CounterControl({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
}) {
  const output = useRef<HTMLOutputElement>(null);
  usePlayOnChange(output, value, VALUE_TICK, TICK);
  return (
    <div className="tap-row flex items-center">
      <button
        type="button"
        className={SIDE}
        aria-label={`${label} minus one`}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        <Minus aria-hidden="true" className="size-6" />
      </button>
      <output
        ref={output}
        aria-label={`${label} value`}
        className="tap-target min-w-20 basis-20 text-center text-3xl leading-[3.5rem] font-semibold tabular-nums"
      >
        {value}
      </output>
      <button
        type="button"
        className={SIDE}
        aria-label={`${label} plus one`}
        onClick={() => onChange(value + step)}
      >
        <Plus aria-hidden="true" className="size-6" />
      </button>
    </div>
  );
}
```

`apps/client/src/components/entry/ToggleField.tsx`:

```tsx
/**
 * A yes / no field as a switch. The checkbox stays native (it is what the label names and
 * what the tests click); the track and knob beside it only show its state, and the knob's
 * slide is the state change itself.
 */
export function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="group tap-target flex cursor-pointer items-center justify-between gap-4 py-2">
      <span className="text-sm font-medium" dir="auto">
        {label}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className="motion-transition relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border border-border bg-surface-raised group-has-[:checked]:border-text group-has-[:checked]:bg-text group-has-[:focus-visible]:outline-2 group-has-[:focus-visible]:outline-offset-2 group-has-[:focus-visible]:outline-focus"
      >
        <span className="motion-transition absolute start-1 size-6 rounded-full bg-text-muted group-has-[:checked]:translate-x-6 group-has-[:checked]:bg-bg" />
      </span>
    </label>
  );
}
```

`apps/client/src/components/entry/StickyActionBar.tsx`:

```tsx
import type { ReactNode } from 'react';

/**
 * An entry-path screen's one primary action, pinned in the thumb zone (SPEC-FINAL 17.3).
 * Sticky, not fixed: it never covers the sidebar on a wide screen or the last field of a
 * short form, and it clears the phone's home indicator.
 */
export function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-border bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}
```

- [ ] **Step 5: The field renderer and the status picker**

Replace the whole of `apps/client/src/features/entry/RobotStatusPicker.tsx` with:

```tsx
import type { RobotStatus } from '@frc/shared';
import { ChoiceGroup, type Choice } from '@/components/entry/ChoiceGroup';

const OPTIONS: readonly Choice<RobotStatus>[] = [
  { value: 'played', label: 'Played', accent: 'var(--status-played)' },
  { value: 'broke_down', label: 'Broke down', accent: 'var(--status-broke-down)' },
  { value: 'disabled', label: 'Disabled', accent: 'var(--status-disabled)' },
  { value: 'no_show', label: 'No show', accent: 'var(--status-no-show)' },
];

export function RobotStatusPicker({
  value,
  onChange,
}: {
  value: RobotStatus | null;
  onChange: (status: RobotStatus) => void;
}) {
  return (
    <ChoiceGroup
      legend="Robot status"
      name="robot_status"
      value={value}
      options={OPTIONS}
      onChange={onChange}
    />
  );
}
```

Replace the whole of `apps/client/src/features/entry/FieldInput.tsx` with:

```tsx
import { useId } from 'react';
import type { FormFieldDefinition } from '@frc/shared';
import { selectOptions } from '@frc/shared';
import { ChoiceGroup } from '@/components/entry/ChoiceGroup';
import { CounterControl } from '@/components/entry/CounterControl';
import { ToggleField } from '@/components/entry/ToggleField';
import { Textarea } from '@/components/ui/textarea';

type Props = {
  field: FormFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
};

/** Big touch targets, never a keyboard where a counter will do (SPEC-FINAL 8.6, 17.7). */
export function FieldInput({ field, value, onChange }: Props) {
  const id = useId();
  switch (field.type) {
    case 'counter': {
      const current = typeof value === 'number' ? value : 0;
      const step = typeof field.config.step === 'number' ? field.config.step : 1;
      return (
        <div className="py-4">
          <span className="block text-sm font-medium" dir="auto">
            {field.label}
          </span>
          <div className="mt-2">
            <CounterControl label={field.label} value={current} step={step} onChange={onChange} />
          </div>
        </div>
      );
    }
    case 'toggle':
      return (
        <div className="py-2">
          <ToggleField label={field.label} checked={value === true} onChange={onChange} />
        </div>
      );
    case 'single_select':
      return (
        <div className="py-4">
          <ChoiceGroup
            legend={field.label}
            name={field.key}
            value={typeof value === 'string' ? value : null}
            options={selectOptions(field).map((o) => ({ value: o.value, label: o.label }))}
            onChange={onChange}
          />
        </div>
      );
    case 'long_text':
      return (
        <div className="py-4">
          <label htmlFor={id} className="block text-sm font-medium" dir="auto">
            {field.label}
          </label>
          <Textarea
            id={id}
            dir="auto"
            rows={3}
            className="mt-2"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
  }
}
```

- [ ] **Step 6: The Scout picker**

`apps/client/src/features/entry/SelectRobotPage.tsx`:
- Add `useId` to the `react` import, and add:

```tsx
import { ChoiceGroup } from '@/components/entry/ChoiceGroup';
import { StickyActionBar } from '@/components/entry/StickyActionBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Notice } from '@/components/ui/notice';
```

- Add `const typeId = useId(); const numberId = useId(); const robotId = useId();` beside the other hooks.
- Add a module constant above the component:

```tsx
const ALLIANCES = [
  { value: 'red', label: 'Red', ariaLabel: 'red', accent: 'var(--alliance-red)' },
  { value: 'blue', label: 'Blue', ariaLabel: 'blue', accent: 'var(--alliance-blue)' },
] as const;
```

- Replace the component's `return ( … );` with:

```tsx
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-6">
      {saved && (
        // Static on purpose (SPEC-FINAL 17.9): the confirmation stands still on the entry path.
        // Submitting only queues the entry; the connection indicator owns sync state.
        <Notice role="status" aria-label="Entry saved" tone="success" still className="mb-5">
          <p className="font-semibold">
            {saved.edited ? 'Changes saved on this device' : 'Entry saved on this device'}
          </p>
          <p className="mt-1">
            {saved.matchLabel} · <span dir="auto">{saved.teamLabel}</span>
          </p>
          <p className="mt-1 text-text-muted">
            It is queued to send and stays safe here with no network.
          </p>
        </Notice>
      )}
      <h1 className="text-2xl font-semibold tracking-tight">Scout a match</h1>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={typeId}>Match type</Label>
          <NativeSelect
            id={typeId}
            wrapperClassName="mt-1.5"
            value={matchType}
            onChange={(e) => setMatchType(e.target.value)}
          >
            <option value="qualification">Qualification</option>
            <option value="practice">Practice</option>
            <option value="playoff">Playoff</option>
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor={numberId}>Match number</Label>
          <Input
            id={numberId}
            type="number"
            min={1}
            inputMode="numeric"
            className="mt-1.5 text-xl font-semibold tabular-nums"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </div>
      </div>

      {parsed > 0 && !existing && (
        <Notice role="status" className="mt-4">
          Match {formatCount(parsed)} is not on this device yet. It will be created when you submit
          — keep scouting.
        </Notice>
      )}

      <div className="mt-6">
        <ChoiceGroup
          legend="Alliance"
          name="alliance"
          value={alliance}
          options={ALLIANCES}
          onChange={(side) => setAlliance(side)}
        />
      </div>

      <div className="mt-6">
        <Label htmlFor={robotId}>Robot</Label>
        {/* Native, so a phone shows its own picker rather than a 30-row scroll. */}
        <NativeSelect
          id={robotId}
          wrapperClassName="mt-1.5"
          value={chosen?.id ?? ''}
          disabled={!ready}
          onChange={(e) => setTeamId(e.target.value)}
        >
          <option value="" disabled>
            {ready ? 'Choose a robot' : 'Choose a match and alliance first'}
          </option>
          {choices.map((team) => (
            <option key={team.id} value={team.id} dir="auto" disabled={isLocked(team.id)}>
              {optionLabel(team)}
            </option>
          ))}
        </NativeSelect>
      </div>

      {chosenEntry && (
        <p className="mt-3 text-sm text-text-muted">
          {editsAnyTime(author)
            ? 'This robot is already scouted in this match on this device. You can change that entry; a second one cannot be started.'
            : `This robot is already scouted in this match on this device. You can change that entry until ${editableUntil(
                chosenEntry,
              ).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}; a second one cannot be started.`}
        </p>
      )}

      <StickyActionBar>
        <Button variant="primary" size="block" disabled={!chosen} onClick={start}>
          {chosenEntry ? 'Edit the existing entry' : 'Start entry'}
        </Button>
      </StickyActionBar>
    </main>
  );
```

`routes.test.tsx` finds the Alliance radios by `aria-label` (`red`). `ALLIANCES` keeps both as literal types, so `setAlliance` receives `'red' | 'blue'`.

- [ ] **Step 7: The entry screen**

`apps/client/src/features/entry/EntryPage.tsx`:
- Add `useId` to the `react` import, add `type RefObject` to that import, and add:

```tsx
import { ChevronDown } from 'lucide-react';
import { StickyActionBar } from '@/components/entry/StickyActionBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/ui/notice';
import { useModalFocus } from '@/components/ui/useModalFocus';
```

- Add `const breakdownId = useId();` beside the other hooks.
- Replace the component's `return ( … );` with the block below. `update`, `commit` and every hook above them stay as they are.

```tsx
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <h1 className="text-xl font-semibold">
          {props.matchLabel} · <span dir="auto">{props.teamLabel}</span>
        </h1>
        <Badge tone={props.alliance === 'red' ? 'alliance-red' : 'alliance-blue'}>
          {props.alliance === 'red' ? 'Red alliance' : 'Blue alliance'}
        </Badge>
      </header>

      <div className="mt-5">
        <RobotStatusPicker value={status} onChange={(s) => update({ status: s })} />
      </div>

      {status === 'broke_down' && (
        <div className="mt-5">
          <Label htmlFor={breakdownId}>Breakdown time (seconds from match start)</Label>
          <Input
            id={breakdownId}
            type="number"
            min={0}
            inputMode="numeric"
            className="mt-1.5"
            value={breakdownSeconds}
            onChange={(e) => update({ seconds: Number(e.target.value) })}
          />
        </div>
      )}

      {status !== null &&
        !dead &&
        PHASE_ORDER.filter((phase) => (byPhase.get(phase) ?? []).length > 0).map((phase) => (
          <details key={phase} open className="group mt-4 rounded-xl border border-border bg-surface">
            <summary className="tap-target flex cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              {PHASE_LABEL[phase]}
              <ChevronDown
                aria-hidden="true"
                className="motion-transition size-4 text-text-muted group-open:rotate-180"
              />
            </summary>
            <div className="border-t border-border px-4 pb-2">
              {(byPhase.get(phase) ?? []).map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  value={data[field.key]}
                  onChange={(value) => update({ data: { ...data, [field.key]: value } })}
                />
              ))}
            </div>
          </details>
        ))}

      {dead && (
        <Notice still className="mt-5">
          No fields are recorded for a {status === 'no_show' ? 'no-show' : 'disabled'} robot. The
          entry records the status only — never zeros.
        </Notice>
      )}

      <StickyActionBar>
        <Button
          variant="primary"
          size="block"
          disabled={status === null}
          onClick={() => setReviewing(true)}
        >
          Review entry
        </Button>
      </StickyActionBar>

      {reviewing && (
        <ReviewDialog
          matchLabel={props.matchLabel}
          teamLabel={props.teamLabel}
          alliance={props.alliance}
          status={status}
          dead={dead}
          fields={fields}
          data={data}
          error={error}
          errorRef={errorRef}
          onBack={() => setReviewing(false)}
          onSubmit={() => void commit()}
        />
      )}
    </main>
  );
}

/**
 * The confirmation summary of the whole entry (SPEC-FINAL 8.2). A full-screen sheet that
 * slides up — the scout must notice they are now confirming, not editing — with
 * ConfirmDialog's focus rules: first focus on Keep editing, Escape keeps editing.
 */
function ReviewDialog(props: {
  matchLabel: string;
  teamLabel: string;
  alliance: 'red' | 'blue';
  status: RobotStatus | null;
  dead: boolean;
  fields: FormFieldDefinition[];
  data: Record<string, unknown>;
  error: string | null;
  errorRef: RefObject<HTMLParagraphElement | null>;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  const { panel, onKeyDown } = useModalFocus(props.onBack, back);
  const rows: { label: string; value: string; hebrew: boolean }[] = [
    { label: 'Match', value: props.matchLabel, hebrew: false },
    { label: 'Team', value: props.teamLabel, hebrew: true },
    { label: 'Alliance', value: props.alliance, hebrew: false },
    { label: 'Status', value: props.status ?? '', hebrew: false },
    ...(props.dead
      ? []
      : props.fields.map((field) => ({
          label: field.label,
          value: String(props.data[field.key] ?? '—'),
          hebrew: true,
        }))),
  ];
  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm this entry"
      onKeyDown={onKeyDown}
      className="enter-sheet-up fixed inset-0 z-40 flex flex-col overflow-auto bg-bg"
    >
      <div className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
        <h2 className="text-xl font-semibold">Confirm this entry</h2>
        <dl className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface text-sm">
          {rows.map((row, i) => (
            <div key={i} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt className="text-text-muted" dir={row.hebrew ? 'auto' : undefined}>
                {row.label}
              </dt>
              <dd className="text-end font-medium tabular-nums" dir={row.hebrew ? 'auto' : undefined}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {/* The failed-submit reason is a DIRECT child of this .sticky footer: in view, beside
          the button just pressed (EntryPage.test.tsx asserts the parent). */}
      <div className="sticky bottom-0 border-t border-border bg-bg px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {props.error && (
          <p
            ref={props.errorRef}
            role="alert"
            tabIndex={-1}
            dir="auto"
            className="mx-auto mb-3 max-w-xl rounded-lg border border-s-4 border-border border-s-danger bg-surface p-3 text-sm"
          >
            <span className="font-semibold">Not saved. </span>
            {props.error}
          </p>
        )}
        <div className="tap-row mx-auto flex max-w-xl">
          <Button ref={back} variant="secondary" size="lg" className="flex-1" onClick={props.onBack}>
            Keep editing
          </Button>
          <Button variant="primary" size="lg" className="flex-1" onClick={props.onSubmit}>
            Submit entry
          </Button>
        </div>
      </div>
    </div>
  );
```

The file's last line stays the component's closing `}`. `ReviewDialog` needs no `export`.

- [ ] **Step 8: The entry route's states**

`apps/client/src/features/entry/EntryRoute.tsx`:
- Add these imports:

```tsx
import { Skeleton } from '@/components/Skeleton';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
```

- Replace `if (resolved === null) return <p className="p-4 text-[var(--text-muted)]">Loading…</p>;` with:

```tsx
  if (resolved === null) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pt-6">
        <Skeleton rows={4} rowHeight="3.5rem" label="Loading the entry" />
      </div>
    );
  }
```

- Replace each of the two refusal `<main …>` blocks (other-event and locked) with the form below. Keep each block's own sentence, and keep its `dir="auto"` where it had one.

```tsx
      <main className="mx-auto w-full max-w-xl px-4 pt-6">
        <h1 className="text-xl font-semibold">
          {resolved.matchLabel} · <span dir="auto">{resolved.teamLabel}</span>
        </h1>
        <Notice role="alert" tone="warning" still className="mt-4">
          {/* this block's sentence, unchanged */}
        </Notice>
        <Button variant="secondary" size="block" className="mt-4" onClick={() => navigate(PATHS.scout)}>
          Back to scouting
        </Button>
      </main>
```

The other-event sentence is `This match belongs to {resolved.foreignEventName}, which is not the default competition. New entries can only be made in {resolved.refused.defaultName}.` The locked sentence is `This robot is already scouted in this match on this device, and the entry is locked — ask a lead to change it.`

- Replace the foreign-event strip `<p role="status" dir="auto" className="border-b-2 …">` with:

```tsx
      <Notice role="status" tone="warning" still className="rounded-none border-0 border-b border-s-4 px-4">
        This entry belongs to {resolved.foreignEventName}, which is no longer the default
        competition. It is saved there when you submit.
      </Notice>
```

- The `No match selected.` line becomes `<p className="p-4 text-text-muted">No match selected.</p>`.

- [ ] **Step 9: Run the new tests and the unchanged contract**

Run: `pnpm --filter @frc/client exec vitest run src/styles src/components/entry src/features/entry src/routes.test.tsx src/features/shell`
Expected: every suite green, with `SelectRobotPage.test.tsx`, `EntryRoute.test.tsx`, `EntryPage.test.tsx`, `routes.test.tsx` and `AppShell.test.tsx` unmodified.

- [ ] **Step 10: Screenshots, full check, commit**

Screenshot at 375 px (the job's width), dev seed, on an unscouted match (16–20, BUILD-CONTEXT §8):
- `/scout` empty, then filled with red chosen;
- the entry screen with Played, counters in use;
- a no-show entry (the "never zeros" line);
- the review sheet;
- a failed submit (a counter pushed past its range).

Also screenshot `/scout` at 1280 px. Checklist against Tally / Typeform / FotMob: one job on screen, generous spacing, the counter triplet, the action in the thumb zone, alliance colour in the picker and header.

```bash
pnpm format && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
git add apps/client/src
git commit -m "feat(client): redesign the scout flow and add the alliance colours"
```

---

## Task R.11: Entries — a dense, readable list

**Reference:** Attio (SPEC-FINAL §17.9, "Search & record detail"): dense list rows, numbers right-aligned and tabular, no zebra striping. Task 1.52 replaces this page with the full entry search. This task only stops the walking-skeleton table looking unfinished in the meantime.

**Files:**
- Modify: `apps/client/src/features/entries/EntriesPage.tsx`
- Modify (test): `apps/client/src/features/entries/EntriesPage.test.tsx`. Wrap each render in a `MemoryRouter`, because the empty state now has its one action (a link, SPEC-FINAL §17.8). Nothing else changes.

**Interfaces:**
- Consumes: `PageHeader`, `Table*`, `Badge`, `Notice`, `Skeleton`, `StateMessage`, `PATHS`.

- [ ] **Step 1: Make the test mount the page in a router**

```bash
cd apps/client/src/features/entries
sed -i 's#render(<EntriesPage eventId="ev-1" />)#render(<MemoryRouter><EntriesPage eventId="ev-1" /></MemoryRouter>)#g' EntriesPage.test.tsx
cd ../../../../..
```

Add `import { MemoryRouter } from 'react-router-dom';` to the test's imports.

Run: `pnpm --filter @frc/client exec vitest run src/features/entries`
Expected: PASS. Only the wrapper changed.

- [ ] **Step 2: Rewrite the render**

`apps/client/src/features/entries/EntriesPage.tsx`:
- Add these imports:

```tsx
import { Skeleton } from '@/components/Skeleton';
import { StateMessage } from '@/components/StateMessage';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PATHS } from '@/lib/paths';
```

- Add above the component:

```tsx
const STATUS_TONE: Record<string, BadgeTone> = {
  played: 'played',
  broke_down: 'broke_down',
  disabled: 'disabled',
  no_show: 'no_show',
};

const TITLE = 'Entries';
const DESCRIPTION = 'Everything this device holds for the current competition, by match.';
```

- Replace everything from `if (rows === null)` to the end of the component with:

```tsx
  if (rows === null) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <div className="mt-6">
          <Skeleton rows={6} label="Loading the entries" />
        </div>
      </main>
    );
  }

  if (rows.length === 0) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <StateMessage
          variant="no-data"
          title="No entries yet"
          detail="Entries appear here as soon as a device syncs. Nothing is lost while a device is offline."
          action={{ label: 'Scout a match', to: PATHS.scout }}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8">
      <PageHeader title={TITLE} description={DESCRIPTION} />
      <Table containerClassName="mt-6 max-h-[70vh] overflow-auto rounded-xl border border-border bg-surface">
        <TableHeader sticky>
          <TableRow>
            <TableHead numeric>Match</TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Scouter</TableHead>
            <TableHead>Recorded</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <Fragment key={row.id}>
              <TableRow className={row.rejection ? 'border-b-0' : undefined}>
                <TableCell numeric>{row.match}</TableCell>
                <TableCell dir="auto">{row.team}</TableCell>
                <TableCell>
                  {row.status && (
                    <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>{row.status}</Badge>
                  )}
                </TableCell>
                <TableCell dir="auto">{row.scouter}</TableCell>
                <TableCell className="tabular-nums">{row.when}</TableCell>
              </TableRow>
              {row.rejection && (
                <TableRow>
                  <TableCell colSpan={5} className="pt-0">
                    <Notice tone="warning" still>
                      <span className="font-semibold">Not synced: </span>
                      {row.rejection}
                    </Notice>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </main>
  );
}
```

- [ ] **Step 3: Run the tests**

Run: `pnpm --filter @frc/client exec vitest run src/features/entries src/features/shell`
Expected: PASS. The row named `/2096/` is found, the header plus one live row gives two rows, `/no entries yet/i` is found, and `not synced` appears exactly once per rejected entry.

- [ ] **Step 4: Screenshots, full check, commit**

Screenshot `/entries` at 375 px and 1280 px, with the seeded entries plus one rejected entry.

```bash
pnpm format && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
git add apps/client/src/features/entries
git commit -m "feat(client): redesign the entries list as a dense table"
```

---

## Task R.12: Users and the account page

**Reference:** Clerk (SPEC-FINAL §17.9, "Admin: users, seasons, events"):
- a table in which a row opens a detail page;
- the role is a select on that page;
- creation is one small form;
- destructive rows follow the single pattern.

**Files:**
- Modify: `apps/client/src/features/admin/fields.tsx` (whole file), `apps/client/src/features/admin/UsersPage.tsx`, `apps/client/src/features/admin/UserDetailPage.tsx`
- Test contract, unchanged: `UsersPage.test.tsx`

**Interfaces:**
- Consumes: `Label`, `Input`, `NativeSelect`, `Button`, `buttonVariants`, `Notice`, `Card`, `CardTitle`, `PageHeader`, `Table*`, `Badge`, `PATHS`.
- Produces: `fields.tsx` keeps every export and prop: `ROLE_LABEL`, `TextField`, `PasswordField`, `Checkbox`, `NumberField`, `RoleSelect`, `FormError`. Every admin form, including the R.13 panels, takes the new look from this one file.

- [ ] **Step 1: Confirm the contract is green**

Run: `pnpm --filter @frc/client exec vitest run src/features/admin`
Expected: PASS.

- [ ] **Step 2: Rewrite `fields.tsx` on the primitives**

Replace the whole of `apps/client/src/features/admin/fields.tsx` with:

```tsx
import { useId, type ReactNode } from 'react';
import type { Role } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Notice } from '@/components/ui/notice';
import { generatePassword } from './password';

export const ROLE_LABEL: Record<Role, string> = {
  scouter: 'Scouter',
  lead: 'Lead',
  admin: 'Admin',
};

const ROLES: readonly Role[] = ['scouter', 'lead', 'admin'];

function Hint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 text-sm text-text-muted">
      {children}
    </p>
  );
}

/** A labelled field at the 48 px floor; `dir="auto"` because names may be Hebrew (17.1). */
export function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  invalid?: boolean;
  errorId?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const describedBy = [props.hint ? hintId : null, props.invalid ? props.errorId : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="mt-4">
      <Label htmlFor={id}>{props.label}</Label>
      <Input
        id={id}
        type="text"
        value={props.value}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        dir="auto"
        aria-invalid={props.invalid || undefined}
        aria-describedby={describedBy || undefined}
        className="mt-1.5"
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.hint && <Hint id={hintId}>{props.hint}</Hint>}
    </div>
  );
}

/**
 * A password the admin sets for someone else: shown in clear so it can be handed over,
 * with a Generate button. It lives in the caller's component state and nowhere else.
 */
export function PasswordField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint: string;
  invalid?: boolean;
  errorId?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const describedBy = [hintId, props.invalid ? props.errorId : null].filter(Boolean).join(' ');
  return (
    <div className="mt-4">
      <Label htmlFor={id}>{props.label}</Label>
      <div className="tap-row mt-1.5 flex items-center">
        <Input
          id={id}
          type="text"
          value={props.value}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          dir="auto"
          aria-invalid={props.invalid || undefined}
          aria-describedby={describedBy}
          className="flex-1 font-mono"
          onChange={(e) => props.onChange(e.target.value)}
        />
        <Button onClick={() => props.onChange(generatePassword())}>Generate</Button>
      </div>
      <Hint id={hintId}>{props.hint}</Hint>
    </div>
  );
}

export function Checkbox(props: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="tap-target mt-2 flex cursor-pointer items-center gap-3 text-sm">
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        className="size-5 shrink-0 cursor-pointer accent-[var(--text)] disabled:cursor-not-allowed"
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span>{props.label}</span>
    </label>
  );
}

/**
 * A whole-number field (team numbers, match numbers, bulk counts — task 1.21), kept free
 * text (`type="number"`) so an in-progress "" or a leading zero is never coerced before the
 * caller validates it with the shared schema.
 */
export function NumberField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  invalid?: boolean;
  errorId?: string;
  /** A native `max` for the browser's own spinner; the real ceiling is the zod schema. */
  max?: number;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const describedBy = [props.hint ? hintId : null, props.invalid ? props.errorId : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="mt-4">
      <Label htmlFor={id}>{props.label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={props.max}
        value={props.value}
        aria-invalid={props.invalid || undefined}
        aria-describedby={describedBy || undefined}
        className="mt-1.5 tabular-nums"
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.hint && <Hint id={hintId}>{props.hint}</Hint>}
    </div>
  );
}

export function RoleSelect(props: {
  label: string;
  value: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="mt-4">
      <Label htmlFor={id}>{props.label}</Label>
      <NativeSelect
        id={id}
        value={props.value}
        disabled={props.disabled}
        aria-describedby={props.hint ? hintId : undefined}
        wrapperClassName="mt-1.5"
        onChange={(e) => props.onChange(e.target.value as Role)}
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABEL[role]}
          </option>
        ))}
      </NativeSelect>
      {props.hint && <Hint id={hintId}>{props.hint}</Hint>}
    </div>
  );
}

/** The one error line beside a form: announced, edged in danger, never a raw code (17.8). */
export function FormError({ id, message }: { id?: string; message: string | null }) {
  if (!message) return null;
  return (
    <Notice id={id} role="alert" tone="danger" className="mt-4">
      {message}
    </Notice>
  );
}
```

- [ ] **Step 3: The users table and the create form**

`apps/client/src/features/admin/UsersPage.tsx`:
- Replace the `PRIMARY_BUTTON, SECONDARY_BUTTON` import with:

```tsx
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
```

- Replace `UsersScreen`'s final `return ( <main …> … </main> );` with:

```tsx
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8">
      <PageHeader
        title="Users"
        description="Open an account to change its role, reset its password or disable it."
      />
      <div className="mt-6 flex flex-wrap items-start gap-6">
        <Card as="section" aria-label="All accounts" className="min-w-0 flex-[1_1_36rem] p-0">
          <div className="flex flex-wrap items-center justify-between gap-x-4 border-b border-border px-5 py-1">
            <Checkbox
              label="Show disabled accounts"
              checked={showDisabled}
              onChange={setShowDisabled}
            />
            {load.status === 'ready' && (
              <p className="text-sm text-text-muted">
                {formatCount(load.users.length)} {load.users.length === 1 ? 'account' : 'accounts'}
              </p>
            )}
          </div>
          {load.status === 'loading' ? (
            <div className="p-5">
              <Skeleton rows={6} rowHeight="3rem" label="Loading the users" />
            </div>
          ) : (
            <>
              {load.truncated && (
                <p className="px-5 pt-3 text-sm text-text-muted">
                  Showing the first {formatCount(MAX_LISTED_USERS)} accounts. The rest are on the
                  server but not listed here.
                </p>
              )}
              <UsersTable users={load.users} />
            </>
          )}
        </Card>
        <CreateUser onCreated={put} />
      </div>
    </main>
  );
```

- Replace `UsersTable`'s `return ( <div …> … </div> );` with the block below. The cell text is unchanged: a `Badge` wraps the same string.

```tsx
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="ps-5">Full name</TableHead>
          <TableHead>Username</TableHead>
          <TableHead>Role</TableHead>
          <TableHead className="pe-5">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id} onClick={open(user.id)} className="cursor-pointer">
            <TableCell className="py-0 ps-5">
              <Link
                to={`${PATHS.users}/${encodeURIComponent(user.id)}`}
                dir="auto"
                className="tap-target flex items-center font-medium"
              >
                {user.full_name}
              </Link>
            </TableCell>
            <TableCell dir="auto">{user.username}</TableCell>
            <TableCell>
              <Badge>{ROLE_LABEL[user.role]}</Badge>
            </TableCell>
            <TableCell className="pe-5">
              <Badge tone={user.disabled_at ? 'neutral' : 'success'}>{statusText(user)}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
```

In `open`, change `` navigate(`/admin/users/${encodeURIComponent(id)}`) `` to `` navigate(`${PATHS.users}/${encodeURIComponent(id)}`) ``, and add `import { PATHS } from '@/lib/paths';`.

- In `CreateUser`, change the rest of its JSX as follows:
  - the outer `<section aria-labelledby={titleId} className="flex-[0_1_24rem] rounded-xl …">` becomes `<Card as="section" aria-labelledby={titleId} className="flex-[0_1_24rem]">`, and its `</section>` becomes `</Card>`;
  - the `<h2 id={titleId} …>Add a user</h2>` becomes `<CardTitle id={titleId} className="text-lg">Add a user</CardTitle>`;
  - the created box's `className` becomes `"enter-rise mt-4 rounded-lg border border-s-4 border-border border-s-status-played bg-bg p-3"`;
  - its Done button becomes `<Button className="mt-3" onClick={() => setCreated(null)}>Done</Button>`;
  - the submit button becomes:

```tsx
        <Button type="submit" variant="primary" size="block" disabled={busy} className="mt-6">
          {busy ? 'Adding…' : 'Add user'}
        </Button>
```

  - every `text-[var(--text-muted)]` in the file becomes `text-text-muted`.

- [ ] **Step 4: The account page**

`apps/client/src/features/admin/UserDetailPage.tsx`:
- Add these imports:

```tsx
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';
```

- Change the not-found state's `to: '/admin/users'` to `to: PATHS.users`.
- Replace `Account`'s return, from `<main` through the `</p>` that ends the `· this is you` line, with the block below. The sections after it stay.

```tsx
    <main className="mx-auto w-full max-w-3xl px-4 py-8 lg:px-8">
      <Link
        to={PATHS.users}
        className={cn(buttonVariants({ variant: 'ghost' }), '-ms-3 text-text-muted')}
      >
        <ArrowLeft aria-hidden="true" />
        All users
      </Link>
      <div className="mt-2">
        <PageHeader
          titleDir="auto"
          title={user.full_name}
          description={
            <>
              <span dir="auto">{user.username}</span> · created {formatDate(user.created_at)}
              {self && ' · this is you'}
            </>
          }
        />
      </div>
```

Then run, from the repo root:

```bash
cd apps/client/src/features/admin
sed -i 's#<section className="mt-8 border-t border-\[var(--border)\] pt-6">#<Card as="section" className="mt-6">#; s#</section>#</Card>#; s#text-\[var(--text-muted)\]#text-text-muted#g; s#text-\[var(--text)\]#text-text#g' UserDetailPage.tsx
cd ../../../../..
```

Three more hand edits:
- In `DisableSection`, change `<Card as="section" className="mt-6">` to `<Card as="section" tone="danger" className="mt-6">`: it holds the irreversible action.
- In `EnableSection`, the `<div className="mt-6 rounded-lg border-2 border-[var(--warning)] p-3">` becomes `<Card className="mt-6 border-s-4 border-s-warning">`, and its `</div>` becomes `</Card>`.
- In `ResetSection`, the shown-password box's `className` becomes `"enter-rise mt-4 rounded-lg border border-s-4 border-border border-s-status-played bg-bg p-3"`.

- [ ] **Step 5: Run the contract**

Run: `pnpm --filter @frc/client exec vitest run src/features/admin src/routes.test.tsx`
Expected: every suite green, with `UsersPage.test.tsx` unmodified. That includes the `Loading the users` status, the `Active` text in Dana's row, and the `All users` link.

- [ ] **Step 6: Screenshots, full check, commit**

Screenshot at 1280 px, signed in as `seed_admin`: `/admin/users` (with "Show disabled" on); after creating a user (the one-time password box); `/admin/users/<seed_lead's id>`; its Disable dialog. Screenshot `/admin/users` at 375 px (the DesktopOnly panel).

```bash
pnpm format && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
git add apps/client/src/features/admin
git commit -m "feat(client): redesign user administration on the design system"
```

---

## Task R.13: Season and event management

**Reference:** Clerk for the tables and one-small-form creation, and the shadcn tabs. Row actions become icon buttons with their full names kept in `aria-label` and `title`. The admin tests find them by role and name, never by text.

**Files:**
- Create: `apps/client/src/components/ui/tabs.tsx`, `apps/client/src/components/ui/tabs.test.tsx`
- Modify: `apps/client/src/features/admin/ManagePage.tsx`, `SeasonsPanel.tsx`, `EventsPanel.tsx`, `TeamsPanel.tsx`, `MatchesPanel.tsx`
- Test contract, unchanged: `ManagePage.test.tsx`, `SeasonsPanel.test.tsx`, `EventsPanel.test.tsx`, `TeamsPanel.test.tsx`, `MatchesPanel.test.tsx`

**Interfaces:**
- Produces: `type TabItem<K extends string> = { key: K; label: string }` and `<Tabs label tabs value onChange>`, the WAI-ARIA tabs pattern with a sliding underline.
- Consumes: `SectionHeader`, `Card`, `CardTitle`, `Table*`, `Button`, `Label`, `NativeSelect`, `Badge`, `PageHeader`.

- [ ] **Step 1: Write the failing test**

`apps/client/src/components/ui/tabs.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Tabs } from './tabs';

const TABS = [
  { key: 'seasons', label: 'Seasons' },
  { key: 'events', label: 'Events' },
  { key: 'matches', label: 'Matches' },
] as const;

function Harness() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('seasons');
  return <Tabs label="Manage" tabs={TABS} value={tab} onChange={setTab} />;
}

describe('Tabs (WAI-ARIA tabs pattern)', () => {
  it('is a labelled tablist with the chosen tab selected and alone in the Tab order', () => {
    render(<Harness />);
    expect(screen.getByRole('tablist', { name: 'Manage' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Seasons' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('tabindex', '-1');
  });

  it('chooses on click', async () => {
    render(<Harness />);
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Events' }));
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('aria-selected', 'true');
  });

  it('moves with the arrow keys, Home and End, wrapping at the ends', async () => {
    render(<Harness />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('tab', { name: 'Seasons' }));
    await u.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('aria-selected', 'true');
    await u.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Matches' })).toHaveFocus();
    await u.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Seasons' })).toHaveFocus();
    await u.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Matches' })).toHaveFocus();
  });
});
```

Run: `pnpm --filter @frc/client exec vitest run src/components/ui/tabs.test.tsx`
Expected: FAIL, `Failed to resolve import "./tabs"`.

- [ ] **Step 2: Write `tabs.tsx`**

`apps/client/src/components/ui/tabs.tsx`:

```tsx
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export type TabItem<K extends string> = { key: K; label: string };

/**
 * A row of tabs (the WAI-ARIA tabs pattern: arrows move between tabs, Home / End jump, only
 * the chosen tab is in the Tab order). One underline slides to the chosen tab — it says
 * which tab is open, so it is informational motion. Presentation only: the page keeps the
 * chosen key and renders the panel.
 */
export function Tabs<K extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: readonly TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const chosen = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    setBar(chosen ? { left: chosen.offsetLeft, width: chosen.offsetWidth } : null);
  }, [value, tabs.length]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((t) => t.key === value);
    const next =
      e.key === 'ArrowRight'
        ? index + 1
        : e.key === 'ArrowLeft'
          ? index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? tabs.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    const target = tabs[(next + tabs.length) % tabs.length];
    if (!target) return;
    onChange(target.key);
    list.current?.querySelector<HTMLElement>(`[data-tab="${target.key}"]`)?.focus();
  }

  return (
    <div
      ref={list}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="relative flex flex-wrap gap-1 border-b border-border"
    >
      {tabs.map((tab) => {
        const selected = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            data-tab={tab.key}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            className={cn(
              'tap-target state-layer motion-transition rounded-t-lg px-4 text-sm font-medium',
              selected ? 'text-text' : 'text-text-muted hover:text-text',
            )}
          >
            {tab.label}
          </button>
        );
      })}
      {bar && (
        <span
          aria-hidden="true"
          className="motion-transition pointer-events-none absolute -bottom-px left-0 h-0.5 rounded-full bg-text"
          style={{ width: bar.width, transform: `translateX(${bar.left}px)` }}
        />
      )}
    </div>
  );
}
```

Run: `pnpm --filter @frc/client exec vitest run src/components/ui/tabs.test.tsx`
Expected: PASS.

- [ ] **Step 3: The management page**

`apps/client/src/features/admin/ManagePage.tsx`:
- Replace `import { FIELD } from '@/components/buttonStyles';` with:

```tsx
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs } from '@/components/ui/tabs';
```

- Replace the `<main …>` opening, the `<h1>` and the whole `<div role="tablist" …> … </div>` with:

```tsx
    <main className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8">
      <PageHeader
        title="Season and event management"
        description="Seasons, events, rosters and matches. The default event is the one every device works on."
      />
      <div className="mt-6">
        <Tabs label="Manage" tabs={TABS} value={tab} onChange={setTab} />
      </div>
```

- In `SeasonSelect` and `EventSelect`, replace each `<label …>` and `<select … className={`${FIELD} mt-1`} …>` pair with `<Label htmlFor={id}>…</Label>` and `<NativeSelect id={id} value={value} wrapperClassName="mt-1.5" onChange={…}>…</NativeSelect>`, keeping the options.

- [ ] **Step 4: The four panels — one set of rules**

Apply every rule below in all four panels. Each one is written out once, and the Files list names the panels.

1. **Panel heading row.** `<div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-lg font-semibold">X</h2><button …>…</button></div>` becomes `<SectionHeader title="X" actions={…the same button…} />` (import from `@/components/ui/page-header`). In TeamsPanel and MatchesPanel, the bare `<h2 className="text-lg font-semibold">…</h2>` becomes `<SectionHeader title="…" />`.
2. **Tables.**
   - `<div className="mt-4 overflow-x-auto"><table className="w-full border-collapse text-left">` becomes `<Table containerClassName="mt-4 rounded-xl border border-border bg-surface">`, closed with `</Table>`.
   - `<thead>` becomes `<TableHeader>` and `<tbody>` becomes `<TableBody>`.
   - Every `<tr className="border-b border-[var(--border)] …">` becomes `<TableRow>`. Keep `align-top` in MatchesPanel as `className="align-top"`.
   - Every `<th scope="col" className="…">` becomes `<TableHead>`. Year, Match and Order get `numeric`.
   - Every `<td className="…">` becomes `<TableCell>`, keeping any `dir="auto"`, `font-mono text-sm` or `font-medium` it had.
3. **Inline forms** (SeasonForm, EventForm, RenameForm, EditMatchForm).
   - `<form … className="mt-4 max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">` becomes `<Card className="mt-4 max-w-sm"><form …>…</form></Card>`: the form keeps its `aria-labelledby` and `noValidate`.
   - Its `<h3 id={titleId} className="font-semibold">` becomes `<CardTitle id={titleId} level={3}>`.
4. **"Active" and "Default" markers.** `<span className="font-medium">Active</span>` becomes `<Badge tone="success">Active</Badge>`, and the same for `Default`. `EventsPanel.test.tsx` reads `Default` through the row's text, and the badge keeps it.
5. **Row actions as icon buttons.** Each keeps its exact name in `aria-label` and in `title`, from `lucide-react`:
   - EventsPanel `Move … up` / `Move … down`: `<Button variant="ghost" size="icon" aria-label={…} title={…} dir="auto" disabled={…} onClick={…}><ArrowUp aria-hidden="true" /></Button>`, and `ArrowDown` for down.
   - SeasonsPanel `Edit` and EventsPanel `Rename`: `Pencil`. The name stays `Edit` / `Rename`.
   - MatchesPanel `Edit match N (type)`: `Pencil`. `Delete match N (type)`: `<Button variant="ghost" size="icon" className="text-danger" aria-label={…} title={…} onClick={onDelete}><Trash2 aria-hidden="true" /></Button>`.
   - TeamsPanel `Rename <number> <name>`: `Pencil`.
   - Text buttons that are the row's information stay text: `Make … active`, `Make … the default`.
6. **Selects and filters.**
   - MatchesPanel's single-match type `<select className={`${FIELD} mt-1`}>` and EditMatchForm's type select become `<NativeSelect wrapperClassName="mt-1.5" …>`.
   - MatchesPanel's slot selects keep `aria-label`, `value`, `disabled` and every option, and become `<NativeSelect className="min-w-32" …>`.
   - The `<label className="block text-sm font-medium" …>` beside them becomes `<Label …>`.
   - TeamsPanel's filter input becomes `<Input …>` with the same props.
7. **Lists.** TeamsPanel's `<ul className="mt-4 divide-y divide-[var(--border)]">` becomes `<ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface px-4">`.
8. **Colour classes.** Every `text-[var(--text-muted)]` becomes `text-text-muted`. MatchesPanel's off-roster line `text-[var(--warning)]` becomes `<Notice tone="warning" still className="mt-1 px-2 py-1 text-xs">`, with the same sentence.
9. **Buttons still using `PRIMARY_BUTTON` / `SECONDARY_BUTTON` / `DESTRUCTIVE_BUTTON`** stay as they are: R.2 already restyled them. Remove `${SECONDARY_BUTTON} tap-target`'s duplicate `tap-target`.

Worked example, the SeasonsPanel table body row after rules 2, 4 and 5:

```tsx
                <TableRow key={season.id}>
                  <TableCell numeric>{season.year}</TableCell>
                  <TableCell dir="auto">{season.game_name}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {season.field_image_path}
                    {!isKnownSeasonImage(season.field_image_path) && (
                      <div className="mt-1 font-sans">
                        <FieldImage
                          path={season.field_image_path}
                          alt={`${season.year} field image`}
                        />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {season.id === load.activeSeasonId ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <button
                        type="button"
                        className={SECONDARY_BUTTON}
                        disabled={!online || switchingId !== null}
                        onClick={() => void makeActive(season)}
                      >
                        {switchingId === season.id ? 'Switching…' : `Make ${season.year} active`}
                      </button>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit"
                      title="Edit"
                      onClick={() => setForm({ kind: 'edit', season })}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
```

`SeasonsPanel.test.tsx` might find the Edit buttons as `getAllByRole('button', { name: 'Edit' })`. The accessible name stays `Edit`. If a test reads the Edit button's visible text, keep the text instead, and log it in DEVIATIONS.

- [ ] **Step 5: Run the contract**

Run: `pnpm --filter @frc/client exec vitest run src/features/admin src/components/ui`
Expected: every suite green, all five admin test files unmodified. If a test fails on an icon button, it read the label as text: restore the text for that one button and log it.

- [ ] **Step 6: Screenshots, full check, commit**

Screenshot at 1280 px, as `seed_admin`: each of the four tabs with seed data; a New season form; the Matches table with its slot selects; the delete-match dialog. Screenshot `/admin/manage` at 375 px (DesktopOnly).

```bash
pnpm format && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
git add apps/client/src/components/ui apps/client/src/features/admin
git commit -m "feat(client): redesign season, event, roster and match management"
```

---

## Task R.14: The review sweep

**Files:**
- Modify: only what the sweep finds. Each fix is its own small commit, `fix(client): <what> (redesign review)`.
- Append: `docs/plans/DEVIATIONS.md`. One entry per departure from R.1–R.13, in the BUILD-CONTEXT §11 format.

- [ ] **Step 1: Run the app on dev data**

```bash
pnpm seed
pnpm --filter @frc/server dev
pnpm --filter @frc/client dev
```

Run the two `dev` commands in the background or in separate terminal tabs. Sign in through the page's cached-account path or the API, never by typing a credential into the browser pane (BUILD-CONTEXT §1).

- [ ] **Step 2: Screenshot every screen at 375 px and 1280 px, dark theme**

| Route / state | Reference (SPEC-FINAL §17.9) |
|---|---|
| `/` Home: fresh; under a session override; no competition (admin) | Figma file browser + Notion |
| `/scout`: empty; filled; the "not on this device yet" notice; the saved notice | Tally / Typeform / FotMob |
| `/entry/…`: played with counters; no-show; review sheet; failed submit | Tally / Typeform / FotMob |
| `/entries`: rows; one rejected; empty | Attio |
| `/login`: fresh; offline; error. `/change-password` (forced). `/switch-scouter` | Linear / Vercel |
| `/admin/users`, `/admin/users/:id`, the disable dialog | Clerk |
| `/admin/manage`: all four tabs, a form open, the delete dialog | Clerk |
| Shell: sidebar expanded and collapsed; phone drawer open; bottom bar; loading, blocked and no-competition gates | Linear / Vercel; M3 navigation |

- [ ] **Step 3: Check each screenshot against its row, and against the tells**

For each row, check its §17.9 "What we take" items. Then check the BUILD-CONTEXT §12.4 tells: everything centred; cards in cards; flat padding; an icon on every heading; shadows or glows; marketing copy; placeholder text. Then the motion rules: open the drawer, a dialog and the review sheet with the OS "reduce motion" setting on, and confirm each appears with no movement.

- [ ] **Step 4: Report**

Report in the BUILD-CONTEXT §12.6 format: each screen with its route and reference, the checklist result per item, and anything that fell short and why. That list is what the user reviews on dev.

- [ ] **Step 5: The full gate**

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
```

Expected: all green, and the client builds. Then say so, and fast-forward `develop`, which costs two Vercel deployments (BUILD-CONTEXT §9).

---

## Self-review (done while writing)

- **Spec coverage.** Every screen built in phases 1A–1C has a task:
  - shell, nav, gates (R.3, R.6, R.7);
  - Home and context (R.8);
  - sign-in, change password, switch scouter, reconnect (R.9);
  - scout, entry (R.10);
  - entries (R.11);
  - users (R.12);
  - management (R.13).

  The shared components are in R.3 and the review in R.14.
- **Placeholders.** Every code step shows its code. R.13 Step 4 is a rule set applied to four files with a worked example, because those files repeat one pattern many times.
- **Names.** Each is defined once and used under the same name: `PATHS`, `isEntryPath`, `navItemsFor`, `bottomBarItems`, `ShellLayout` (whose props land in R.6 and take effect in R.7), `useModalFocus`, `Notice`, `ChoiceGroup`, `CounterControl`, `PAGE_ENTER`, `VALUE_TICK`, `usePlayOnChange`.
