# Redesign Build Implementation Plan (D1 "Pit Wall")

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `docs/ops/BUILD-CONTEXT.md` first — it is binding and this plan does not restate it.

**Goal:** Make the running app look and behave exactly like the closed designs in `docs/design/pages/01-entry … 11-phone-shell/final/`, local-first and fast, with every screen proven by unit tests and by screenshots compared against the final images.

**Architecture:** One theme layer (`styles/theme.css`, generated from `docs/design/theme.css`) feeds Tailwind v4 through `@theme inline`. A small set of primitives in `components/ui/` implements every row of THEME.md "Locked components" once. Pages read the device's IndexedDB through one change-aware hook (`useDeviceQuery`) and call the server only where the data is not on the device (admin pages, sign-in, the Switch-competition sheet when opened, the new per-scouter count). A Playwright harness with a mocked API takes the 1440 px and 375 px screenshots of every route without touching any database.

**Tech Stack:** React 19, react-router 7, Tailwind 4 (`@tailwindcss/vite`), Dexie 4, Vitest 2 + Testing Library + fake-indexeddb, Playwright (`channel: 'chrome'`, the Chrome already installed — no browser download), `@axe-core/playwright`, fontsource (self-hosted fonts).

## Global Constraints

- **Binding:** `docs/ops/BUILD-CONTEXT.md` (§9 how a build chat runs, §10 verification, §11 DEVIATIONS format, §12 UI standard). Precedence: the chat's prompt, then BUILD-CONTEXT, then this plan.
- **Source of truth for looks:** `docs/design/pages/<nn>-<page>/final/*.png` + `README.md`, and `docs/design/THEME.md` "Locked components". "When the page is coded, it must look the same as its final images." Where an image and a README disagree, the README wins; where the README and SPEC-FINAL disagree, SPEC-FINAL wins and a DEVIATIONS entry is written.
- **Screenshot widths:** 1440 px and 375 px (`docs/design/README.md`). Task RB.19 updates BUILD-CONTEXT §12 (which still says 1280).
- **Colours:** only through tokens. No hex outside `apps/client/src/styles/theme.css`. Red and blue mean alliances only; **nothing else is ever red** (errors use `--warn`, destructive actions use filled `--ink`).
- **Accessibility floor (SPEC-FINAL §17.7):** 48 px touch targets, WCAG AA 4.5:1 text / 3:1 controls in every theme, visible focus on every control, OS text size respected (rem units), `dir="auto"` on user text, `prefers-reduced-motion` respected.
- **Offline-first:** no screen on the competition path (Home, Scout, Entry, Entries, Switch scouter) waits for the network. Server calls only on: Login, Change password, Users, User detail, Manage, the Switch-competition sheet *when opened*, and the shell's existing sync loop.
- **Server rule (BUILD-CONTEXT §6):** any `apps/server/src/**` change also runs `pnpm --filter @frc/server build` and commits `apps/server/api/index.js` in the same commit.
- **Gate for every task (BUILD-CONTEXT §9):** `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`, real output pasted. Screen tasks add `pnpm --filter @frc/client e2e` and the screenshot review of Step "Compare".
- **Simple code:** one component per file, files under ~250 lines, no new state library, no `React.memo` unless a profile shows a re-render problem, plain functions for derivations (tested without React).
- **Copy:** every user-facing string is copied from the page's final README or today's code. No new marketing or placeholder text.
- **Self-edit window:** use `SELF_EDIT_WINDOW_MS` from `@frc/shared` (5 minutes). The "10 minutes" in the Entry mock-up is mock text, not a requirement.

## Decisions taken for this plan (accepted by the user, 2026-10-07)

| # | Decision | Why |
|---|---|---|
| P1 | **Hebrew face: keep Noto Sans Hebrew** (already a dependency) as the fallback after Schibsted Grotesk. Closes THEME open question 2. | Self-hosted, already precached, matches the grotesk's weight range. |
| P2 | **Outdoor theme values** are fixed in RB.1 (black ink on white, darker accent/warn/alliances). The theme *switch* stays task 1.38. Closes THEME open question 1 for values. | §17.4 requires the theme; tokens are cheap now and the contrast test proves them. |
| P3 | **Old token names stay as aliases** of the new values until RB.18 deletes them. | Lets screens move one at a time; nothing breaks mid-build. |
| P4 | **Visual testing = Playwright + mocked API**, run locally (`channel: 'chrome'`), not in CI yet. CI keeps unit tests. | No database, no deploy, repeatable screenshots; CI has no Chrome install step today. |
| P5 | **Parallel waves in the one working copy**, each task owning a disjoint file list (below). Subagents run *scoped* tests; the orchestrator runs the full gate once per wave, then commits each task's files separately with its plan message. **Amends BUILD-CONTEXT §9 ("one subagent per task, sequentially") — accepted by the user on the condition that every checkpoint stays visible: each wave ends with the gate output, the e2e screenshots beside the finals, and one commit per task.** | The user asked for parallel work; COLLABORATION §11 forbids worktrees. |
| P6 | **Entries per person** is a new server query `countEntriesByScouter` (season-wide). | The device only holds the active event's entries. |
| P7 | **Unused `@tanstack/react-query` is removed; admin and auth routes are lazy-loaded** (precached by the PWA, so they still work offline). | Smaller first load; nothing imports React Query today. |

## Prerequisites (the user)

1. Merge `spec/redesign-process` into `develop` (it holds the designs, THEME.md and the spec amendments this plan reads).
2. Cut the build branch: `git switch develop && git pull && git switch -c feat/redesign-build`.
3. Answer P5 (and any other row above you disagree with).

## Waves and file ownership

```
Wave A (sequential)      RB.1 theme + fonts
Wave B (parallel)        RB.2 primitives I · RB.3 primitives II · RB.4 device data · RB.5 e2e harness · RB.13 server count
Wave C (sequential)      RB.6 shell + navigation + lazy routes
Wave D (parallel)        RB.7 Login+Change password · RB.8 Entry · RB.9 Scout · RB.10 Home · RB.11 Entries · RB.12 Switch scouter
Wave E (parallel)        RB.14 Users · RB.15 User detail · RB.16 Manage: Competitions + Roster · RB.17 Manage: Matches + phone view
Wave F (sequential)      RB.20 delete season/event · RB.18 cleanup + performance budget · RB.19 full visual review + docs
```

| Task | Owns (only it edits these) |
|---|---|
| RB.1 | `apps/client/src/styles/*`, `apps/client/index.html`, `apps/client/package.json` (fonts) |
| RB.2 | `components/ui/{button,input,password-input,select,native-select,search-field,notice,tag,filter-chips,initials,card,table,empty-state,handover,alliance-buttons,stat-tile,goto-tile,station-pill}.tsx`, `components/ui/{primitives-1,ui,notice}.test.tsx`, `components/StateMessage.tsx`, `components/Skeleton.tsx` |
| RB.3 | `components/ui/{dialog,sheet,responsive-dialog,destructive-confirm,segmented,described-choice,option-buttons,switch,counter,tabs,live-checks,suggest-input,action-bar}.tsx`, `components/ui/{primitives-2,sheet,tabs}.test.tsx`, `components/ConfirmDialog.tsx`, `components/entry/*`, the `label=` line of `features/shell/NavDrawer.tsx` |
| RB.4 | `apps/client/src/data/{changes,useDeviceQuery,station,syncStatus}.ts`, `apps/client/src/lib/derive/*`, their tests; one-line notify calls in `data/{sync,outbox,connection}.ts`, `features/entry/submitEntry.ts`, the bare-match write in `features/entry/SelectRobotPage.tsx`, and `wipeEvent` |
| RB.5 | `apps/client/e2e/**`, `apps/client/playwright.config.ts`, `apps/client/package.json` (`e2e` script + devDeps — after RB.1 merged its font change) |
| RB.13 | `packages/shared/src/api/users.ts`, `packages/shared/src/api/index.ts`, `apps/server/src/core/queries/countEntriesByScouter*.ts`, `apps/server/src/core/context.ts` (one method), `apps/server/src/repos/store.ts` (one method), `apps/server/src/test/fake-context.ts`, `apps/server/src/routes/registry.ts`, `apps/server/api/index.js` |
| RB.6 | `features/shell/**`, `routes.tsx`, `lib/paths.ts`, `lib/pageTitle.ts` |
| RB.7 | `auth/{AuthFrame,LoginPage,ChangePasswordPage}.tsx` + tests |
| RB.8 | `features/entry/{EntryPage,FieldInput,RobotStatusPicker,useDraft,PhaseTabs,EntrySummary,ConfirmEntry}.tsx` + tests |
| RB.9 | `features/entry/{SelectRobotPage,StationSheet,LineupTiles,RosterList}.tsx` + tests |
| RB.10 | `features/home/**`, `features/context/**` |
| RB.11 | `features/entries/**` |
| RB.12 | `auth/SwitchScouter.tsx` + test |
| RB.14 | `features/admin/{UsersPage,AddUserDialog,password}.tsx/ts` + tests, `features/admin/useUsers.ts` |
| RB.15 | `features/admin/UserDetailPage.tsx` + test |
| RB.16 | `features/admin/{ManagePage,CompetitionsPanel,RosterPanel}.tsx` + tests; deletes `SeasonsPanel`, `EventsPanel`, `TeamsPanel` |
| RB.17 | `features/admin/{MatchesPanel,LineupGrid,ProblemBar,ManagePhone,ManageRoute}.tsx` + tests, `features/admin/adminMessages.ts`, the `admin/manage` line in `routes.tsx` |
| RB.18 | deletes legacy (`components/buttonStyles.ts`, `styles/motion.css`, `lib/motion.ts`, token aliases), `scripts/check-bundle.mjs`, root `package.json` script |
| RB.20 | the files listed in RB.20 (runs alone, after Wave E) |
| RB.19 | docs only |

**Running a parallel wave (orchestrator, P5):** dispatch every task of the wave at once, each subagent told its owned files and to run only `pnpm vitest run <its folders>` (type errors in *another* task's files are reported, not fixed). **Subagents in a parallel wave do not run e2e or build** — several `pnpm build` runs would share `dist/` and port 4173. When all return, the orchestrator: (1) `pnpm format`; (2) the full gate; (3) fix-forward any cross-task break with the owning task's subagent; (4) `pnpm --filter @frc/client e2e` for the wave's specs and the **Compare** step for each page, shown to the user (the visible checkpoint); (5) commits each task alone (`git add <its files> pnpm-lock.yaml` when it changed dependencies + its plan message), in table order. **Every task:** run `pnpm format` before the gate (Prettier reflows the CSS/TS in this plan), and include `pnpm-lock.yaml` in any commit that adds or removes a dependency (CI installs with `--frozen-lockfile`).

---
## Wave A

### Task RB.1: Theme layer — D1 tokens, fonts, outdoor values

**Files:**
- Create: `apps/client/src/styles/theme.css`, `apps/client/src/styles/theme.test.ts`
- Modify: `apps/client/src/styles/index.css`, `apps/client/src/styles/contrast.test.ts`, `apps/client/index.html`, `apps/client/package.json`
- Delete: `apps/client/src/styles/tokens.css`, `apps/client/src/styles/tokens.test.ts` (replaced by `theme.test.ts`); remove the `apps/client/src/styles/tokens.css` line from `.prettierignore`

**Interfaces:**
- Produces: CSS custom properties and Tailwind colour utilities named exactly as `docs/design/theme.css` — `bg surface line line-2 control-border ink ink-2 muted faint rail rail-raised rail-ink rail-muted rail-line accent accent-ink accent-tint on-accent warn warn-tint alliance-red alliance-red-tint alliance-blue alliance-blue-tint` (so `bg-surface`, `text-ink`, `border-control-border`, `bg-accent-tint` …). Fonts `font-ui` and `font-num`. Radius utilities `rounded-tag` (6), `rounded-control` (8), `rounded-card` (12). Class `.num` (mono, tabular). Old names kept as aliases until RB.18: `text text-muted border surface-raised brand brand-plate on-brand focus danger warning status-* sync-*`.

- [ ] **Step 1: Write the failing test** — `apps/client/src/styles/theme.test.ts`

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'theme.css'), 'utf8');
const outdoorAt = css.indexOf("[data-theme='outdoor']");
const LIGHT = css.slice(0, outdoorAt);
const OUTDOOR = css.slice(outdoorAt);

/** Every colour token of docs/design/theme.css, which this file is generated from. */
const TOKENS = [
  '--bg', '--surface', '--line', '--line-2', '--control-border',
  '--ink', '--ink-2', '--muted', '--faint',
  '--rail', '--rail-raised', '--rail-ink', '--rail-muted', '--rail-line',
  '--accent', '--accent-ink', '--accent-tint', '--on-accent',
  '--warn', '--warn-tint',
  '--alliance-red', '--alliance-red-tint', '--alliance-blue', '--alliance-blue-tint',
];

describe('theme tokens (THEME.md, SPEC-FINAL 17.4)', () => {
  it.each(TOKENS)('light defines %s as a hex', (t) => {
    expect(LIGHT).toMatch(new RegExp(`${t}:\\s*#[0-9a-f]{6};`, 'i'));
  });
  it.each(TOKENS)('outdoor redefines %s', (t) => {
    expect(OUTDOOR).toMatch(new RegExp(`${t}:\\s*#[0-9a-f]{6};`, 'i'));
  });
  it('copies the light values from docs/design/theme.css exactly', () => {
    const design = readFileSync(join(import.meta.dirname, '../../../../docs/design/theme.css'), 'utf8');
    for (const t of TOKENS) {
      const want = new RegExp(`${t}:\\s*(#[0-9a-f]{6});`, 'i').exec(design)?.[1]?.toLowerCase();
      const got = new RegExp(`${t}:\\s*(#[0-9a-f]{6});`, 'i').exec(LIGHT)?.[1]?.toLowerCase();
      expect(got, t).toBe(want);
    }
  });
  it('has no red outside the alliance tokens', () => {
    const reds = [...css.matchAll(/--([a-z0-9-]+):\s*#([0-9a-f]{6})/gi)].filter(([, , hex]) => {
      const r = parseInt(hex!.slice(0, 2), 16), g = parseInt(hex!.slice(2, 4), 16), b = parseInt(hex!.slice(4, 6), 16);
      return r > 150 && g < 90 && b < 90;
    });
    expect(reds.map(([, name]) => name).filter((n) => !n!.startsWith('alliance-red'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Rewrite `contrast.test.ts` against the new pairs** (replace the file; keep its `luminance`/`ratio` helpers):

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'theme.css'), 'utf8');
const outdoorAt = css.indexOf("[data-theme='outdoor']");
const THEMES = { light: css.slice(0, outdoorAt), outdoor: css.slice(outdoorAt) };

function token(theme: string, name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6});`).exec(theme);
  if (!m?.[1]) throw new Error(`${name} missing`);
  return m[1];
}
function luminance(hex: string): number {
  const ch = (at: number) => {
    const c = parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** [foreground, background, minimum] — the pairs THEME.md "Palette" promises. */
const TEXT: [string, string, number][] = [
  ['--ink', '--surface', 4.5], ['--ink', '--bg', 4.5],
  ['--ink-2', '--surface', 4.5], ['--muted', '--surface', 4.5], ['--muted', '--bg', 4.5],
  ['--accent', '--surface', 4.5], ['--accent', '--bg', 4.5], ['--accent-ink', '--accent-tint', 4.5],
  ['--on-accent', '--accent', 4.5],
  ['--warn', '--surface', 4.5], ['--warn', '--warn-tint', 4.5],
  ['--alliance-red', '--surface', 4.5], ['--alliance-red', '--alliance-red-tint', 4.5],
  ['--alliance-blue', '--surface', 4.5], ['--alliance-blue', '--alliance-blue-tint', 4.5],
  ['--rail-ink', '--rail', 4.5], ['--rail-muted', '--rail', 4.5],
  ['--control-border', '--surface', 3], ['--control-border', '--bg', 3],
];

describe.each(Object.entries(THEMES))('%s theme contrast (SPEC-FINAL 17.7)', (_name, theme) => {
  it.each(TEXT)('%s on %s ≥ %s', (fg, bg, min) => {
    expect(ratio(token(theme, fg), token(theme, bg))).toBeGreaterThanOrEqual(min);
  });
});
```

- [ ] **Step 3: Run them — both fail** (`theme.css` does not exist)

Run: `pnpm vitest run apps/client/src/styles`
Expected: FAIL — `ENOENT … theme.css`.

- [ ] **Step 4: Create `apps/client/src/styles/theme.css`**

```css
/*
 * Theme D1 "Pit Wall" — generated from docs/design/theme.css (THEME.md). The only file in
 * the client that holds a colour value. Light is the default; `outdoor` is the
 * high-contrast theme (SPEC-FINAL 17.4), switched by task 1.38.
 */
:root,
[data-theme='light'] {
  --bg: #f4f6f8;
  --surface: #ffffff;
  --line: #e3e7ec;
  --line-2: #eef1f4;
  --control-border: #808a96;
  --ink: #141820;
  --ink-2: #3a424e;
  --muted: #5f6977;
  --faint: #9aa3ae;
  --rail: #161a21;
  --rail-raised: #232933;
  --rail-ink: #c9cfd8;
  --rail-muted: #7d8693;
  --rail-line: #262b34;
  --accent: #12795b;
  --accent-ink: #0b5a43;
  --accent-tint: #e5f2ec;
  --on-accent: #ffffff;
  --warn: #94600f;
  --warn-tint: #fbf1e1;
  --alliance-red: #b53a33;
  --alliance-red-tint: #fbeae8;
  --alliance-blue: #2f62c8;
  --alliance-blue-tint: #e8eefb;
  --coverage-gap: #9ccbb8; /* Home coverage grid: "missing a robot" (THEME "Coverage grid") */
  --scrim: rgb(20 24 32 / 0.45);
  --shadow-float: 0 24px 60px -20px rgb(20 24 32 / 0.45);
  --shadow-sheet: 0 -12px 40px -12px rgb(20 24 32 / 0.4);
  --text-scale: 1;
}

[data-theme='outdoor'] {
  --bg: #ffffff;
  --surface: #ffffff;
  --line: #808a96;
  --line-2: #e3e7ec;
  --control-border: #3a424e;
  --ink: #000000;
  --ink-2: #141820;
  --muted: #3a424e;
  --faint: #5f6977;
  --rail: #000000;
  --rail-raised: #1c2027;
  --rail-ink: #ffffff;
  --rail-muted: #c9cfd8;
  --rail-line: #3a424e;
  --accent: #0b5a43;
  --accent-ink: #063d2d;
  --accent-tint: #dcefe6;
  --on-accent: #ffffff;
  --warn: #6b4409;
  --warn-tint: #fbf1e1;
  --alliance-red: #8e2b25;
  --alliance-red-tint: #fbeae8;
  --alliance-blue: #1f4a9e;
  --alliance-blue-tint: #e8eefb;
  --coverage-gap: #5fa88a;
}

/* Old names (task 0.x–R.14 screens) point at the new values until RB.18 deletes them. */
:root {
  --text: var(--ink);
  --text-muted: var(--muted);
  --border: var(--line);
  --surface-raised: var(--line-2);
  --brand: var(--accent);
  --brand-plate: var(--rail);
  --on-brand: var(--on-accent);
  --focus: var(--accent);
  --danger: var(--warn);
  --warning: var(--warn);
  --status-played: var(--accent);
  --status-broke-down: var(--warn);
  --status-disabled: var(--warn);
  --status-no-show: var(--muted);
  --sync-offline: var(--muted);
  --sync-syncing: var(--warn);
  --sync-online: var(--accent);
}
```

- [ ] **Step 5: Replace the head of `styles/index.css`** (imports + `@theme inline`; keep its `@layer` blocks, change `.brand-plate` to `background: var(--rail)`)

```css
@import '@fontsource-variable/schibsted-grotesk/index.css';
@import '@fontsource-variable/jetbrains-mono/index.css';
@import '@fontsource/noto-sans-hebrew/400.css';
@import '@fontsource/noto-sans-hebrew/600.css';
@import 'tailwindcss';
@import './theme.css';
@import './motion.css';

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-line: var(--line);
  --color-line-2: var(--line-2);
  --color-control-border: var(--control-border);
  --color-ink: var(--ink);
  --color-ink-2: var(--ink-2);
  --color-muted: var(--muted);
  --color-faint: var(--faint);
  --color-rail: var(--rail);
  --color-rail-raised: var(--rail-raised);
  --color-rail-ink: var(--rail-ink);
  --color-rail-muted: var(--rail-muted);
  --color-rail-line: var(--rail-line);
  --color-accent: var(--accent);
  --color-accent-ink: var(--accent-ink);
  --color-accent-tint: var(--accent-tint);
  --color-on-accent: var(--on-accent);
  --color-warn: var(--warn);
  --color-warn-tint: var(--warn-tint);
  --color-alliance-red: var(--alliance-red);
  --color-alliance-red-tint: var(--alliance-red-tint);
  --color-alliance-blue: var(--alliance-blue);
  --color-alliance-blue-tint: var(--alliance-blue-tint);
  --color-coverage-gap: var(--coverage-gap);
  /* legacy aliases — removed in RB.18 */
  --color-text: var(--text);
  --color-text-muted: var(--text-muted);
  --color-border: var(--border);
  --color-surface-raised: var(--surface-raised);
  --color-brand: var(--brand);
  --color-brand-plate: var(--brand-plate);
  --color-on-brand: var(--on-brand);
  --color-focus: var(--focus);
  --color-danger: var(--danger);
  --color-warning: var(--warning);
  --color-status-played: var(--status-played);
  --color-status-broke-down: var(--status-broke-down);
  --color-status-disabled: var(--status-disabled);
  --color-status-no-show: var(--status-no-show);
  --color-sync-offline: var(--sync-offline);
  --color-sync-syncing: var(--sync-syncing);
  --color-sync-online: var(--sync-online);

  --font-ui: 'Schibsted Grotesk Variable', 'Noto Sans Hebrew', system-ui, sans-serif;
  --font-sans: var(--font-ui);
  --font-num: 'JetBrains Mono Variable', ui-monospace, monospace;
  --radius-tag: 6px;
  --radius-control: 8px;
  --radius-card: 12px;
}

@layer base {
  html { font-size: calc(100% * var(--text-scale)); color-scheme: light; }
  body { background: var(--bg); color: var(--ink); font-family: var(--font-ui); font-size: 0.875rem; -webkit-font-smoothing: antialiased; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
}

@layer components {
  .num { font-family: var(--font-num); font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
}
```

- [ ] **Step 6: Fonts** — swap the dependency and set the light theme in the document

```bash
pnpm --filter @frc/client remove @fontsource-variable/inter
pnpm --filter @frc/client add @fontsource-variable/schibsted-grotesk @fontsource-variable/jetbrains-mono
```

Confirm in the built CSS that `--font-ui` and `--font-num` are emitted (Tailwind 4 drops unused theme vars); if not, also declare them in `theme.css` `:root`. Leave the manifest `theme_color` (`#0A0A0B`, pinned by `manifest.test.ts`) for RB.18. If either package does not resolve, use the static `@fontsource/schibsted-grotesk` (400, 500, 600, 700, 800) / `@fontsource/jetbrains-mono` (400, 500, 600) imports instead and write a DEVIATIONS entry. In `apps/client/index.html` change `data-theme="dark"` to `data-theme="light"` and the `theme-color` meta (if present) to `#161a21`.

- [ ] **Step 7: Run the style tests**

Run: `pnpm vitest run apps/client/src/styles`
Expected: PASS (theme, contrast — both themes; motion unchanged).

- [ ] **Step 8: Full gate** — `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`. Expected: PASS. Old tests that pin old class names (`ui.test.tsx`, `notice.test.tsx`, `Logo.test.tsx`) still pass because the aliases keep those utilities alive.

- [ ] **Step 9: Commit** (orchestrator)

```bash
git add -A apps/client pnpm-lock.yaml .prettierignore && git commit -m "feat(client): D1 theme tokens, Schibsted Grotesk + JetBrains Mono, outdoor values (RB.1)"
```

---

## Wave B (parallel: RB.2, RB.3, RB.4, RB.5, RB.13)

### Task RB.2: Primitives I — buttons, fields, notes, tags, chips, table, empty state

**Files:** as owned in the table, plus `components/ui/{ui,notice}.test.tsx` and `components/ui/native-select.tsx`. Test: `apps/client/src/components/ui/primitives-1.test.tsx`. **Keep legacy exports until RB.18:** `notice.tsx` still exports `Notice` (12 importers) and `native-select.tsx` stays (5 importers) — restyled, same props. Also owns the shared pieces no page owns (THEME rows): `components/ui/handover.tsx` (`Handover({ title, secret, note, actions })`), `components/ui/alliance-buttons.tsx` (`AllianceButtons({ value, onChange })`), `components/ui/stat-tile.tsx` (`StatTile({ label, value, note, tone? })`), `components/ui/goto-tile.tsx` (`GoToTile({ icon, title, description, to, admin? })`), `components/ui/station-pill.tsx` (`StationPill({ station })`). `StationTag` and `StationPill` import `Station` from `@/data/station` (RB.4) — until RB.4 lands, declare it locally with the same literal type and switch in the wave's fix-forward pass. `SearchField` renders `<input type="search">` (role `searchbox`). Replace the class-pinning parts of `components/ui/ui.test.tsx` (keep its "no hex in components" and "every variant has a 48 px target" checks; drop `bg-brand-plate`/`text-brand` assertions).

**Interfaces (Produces) — exact exports:**
```ts
// button.tsx
export const buttonVariants: (o: { variant?: 'primary'|'secondary'|'ghost'|'destructive'; size?: 'sm'|'md'|'lg'|'block'|'icon' }) => string;
export function Button(props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: …; size?: …; busy?: boolean; busyLabel?: string }): JSX.Element;
// input.tsx
export function Input(props: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean; size?: 'md'|'lg' }): JSX.Element; // lg = 56 px "large number field"
// password-input.tsx
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>,'type'>): JSX.Element; // eye toggle, aria-pressed, label "Show password"/"Hide password"
// select.tsx
export function Select(props: SelectHTMLAttributes<HTMLSelectElement> & { size?: 'md'|'lg' }): JSX.Element;
// search-field.tsx
export function SearchField(props: { value: string; onChange(v: string): void; placeholder: string; label: string }): JSX.Element;
// notice.tsx
export function Note(props: { children: ReactNode; icon?: 'info'|'offline' }): JSX.Element;          // 3 px ink edge
export function ErrorLine(props: { children: ReactNode; id?: string }): JSX.Element;                 // role="alert", 3 px warn edge
export function WarningNotice(props: { children: ReactNode; lead?: ReactNode }): JSX.Element;      // warn-tint box
export function SuccessBanner(props: { title: ReactNode; children?: ReactNode }): JSX.Element;
// tag.tsx
export function AllianceTag(p: { alliance: 'red'|'blue'; children: ReactNode }): JSX.Element;
export function StationTag(p: { station: `${'R'|'B'}${1|2|3}` }): JSX.Element;               // "Red 1"
export function RobotStatusTag(p: { status: 'played'|'broke_down'|'disabled'|'no_show' }): JSX.Element;
export function RoleTag(p: { role: Role }): JSX.Element;
export function AccountStatusTag(p: { disabledAt: string | null }): JSX.Element;
export function WarningFlag(p: { children: ReactNode }): JSX.Element;                        // "Not in line-up"
// filter-chips.tsx
export function FilterChips<K extends string>(p: { label: string; options: { key: K; label: string; count?: number }[]; value: K; onChange(k: K): void }): JSX.Element; // buttons with aria-pressed
// initials.tsx
export function Initials(p: { name: string; size?: 32|40|52; tone?: 'neutral'|'accent'|'dark' }): JSX.Element;
// card.tsx — Card, CardHeader, CardTitle (unchanged API, new look)
// table.tsx — unchanged API, new look (header 12 px/650 muted, 46 px rows, line-2 dividers)
// empty-state.tsx
export function EmptyState(p: { icon: LucideIcon; title: string; detail: string; action?: ReactNode }): JSX.Element;
```

**Look (copy each from THEME.md "Locked components"):**
- primary: `bg-accent text-on-accent`, secondary: `bg-surface border border-control-border text-ink`, ghost: transparent `text-ink-2`, destructive: `bg-ink text-white` (THEME "Destructive button"). Radius `rounded-control`. Heights: sm 36, md 44, lg 52, block 52 full-width; all keep `min-h-12` hit area (48 px) via padding on sm.
- RobotStatusTag (THEME "Robot status tag"): played `bg-line-2 text-ink-2` + green dot; broke_down `bg-warn-tint text-warn` + diamond; disabled white + 1 px `warn` ring + hollow square; no_show white + 1 px `control-border` ring + dash. Labels "Played", "Broke down", "Disabled", "No show".
- RoleTag: admin `bg-rail text-white`, lead white + `control-border` ring, scouter `bg-line-2 text-ink-2`. Labels "Admin", "Scout lead", "Scouter".

- [ ] **Step 1: Write the failing test** — `components/ui/primitives-1.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { PasswordInput } from './password-input';
import { ErrorLine, Note } from './notice';
import { RobotStatusTag, RoleTag, StationTag } from './tag';
import { FilterChips } from './filter-chips';
import { Initials } from './initials';

describe('primitives I', () => {
  it('a busy button is disabled and says its busy label', () => {
    render(<Button busy busyLabel="Signing in…">Sign in</Button>);
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
  });
  it('the destructive button is filled ink, never red', () => {
    render(<Button variant="destructive">Disable</Button>);
    expect(screen.getByRole('button').className).toMatch(/bg-ink/);
    expect(screen.getByRole('button').className).not.toMatch(/red/);
  });
  it('the password eye shows and hides the text', async () => {
    render(<label>Password<PasswordInput defaultValue="secret12" /></label>);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('an error line is announced', () => {
    render(<ErrorLine>That username and password do not match.</ErrorLine>);
    expect(screen.getByRole('alert')).toHaveTextContent('do not match');
  });
  it('a note is not an alert', () => {
    render(<Note icon="offline">No connection.</Note>);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('status, role and station tags say their word, not only a colour', () => {
    render(<><RobotStatusTag status="no_show" /><RoleTag role="lead" /><StationTag station="B2" /></>);
    expect(screen.getByText('No show')).toBeInTheDocument();
    expect(screen.getByText('Scout lead')).toBeInTheDocument();
    expect(screen.getByText('Blue 2')).toBeInTheDocument();
  });
  it('filter chips are toggle buttons with counts', async () => {
    let value = 'all';
    const { rerender } = render(
      <FilterChips label="Filter" value={value} onChange={(k) => (value = k)}
        options={[{ key: 'all', label: 'All', count: 14 }, { key: 'mine', label: 'Mine', count: 4 }]} />,
    );
    expect(screen.getByRole('button', { name: 'All 14' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Mine 4' }));
    expect(value).toBe('mine');
    rerender(<FilterChips label="Filter" value="mine" onChange={() => {}} options={[{ key: 'all', label: 'All' }, { key: 'mine', label: 'Mine' }]} />);
    expect(screen.getByRole('button', { name: 'Mine' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('initials take the first letters of up to two words', () => {
    render(<Initials name="Yael Shapira" />);
    expect(screen.getByText('YS')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — fails** (`pnpm vitest run apps/client/src/components/ui/primitives-1.test.tsx` → modules not found).
- [ ] **Step 3: Implement** each file with the exports above, the looks above, `cn()` for classes, no hex. `PasswordInput` keeps `autoComplete`, `autoCapitalize="none"`, `spellCheck={false}` from the props; the eye is a 40 px ghost icon button inside the input's right padding (`lucide` `Eye`/`EyeOff`). `StateMessage.tsx` keeps its variant API and renders through `EmptyState`. `Skeleton.tsx` uses `bg-line-2` blocks with `motion-safe:animate-pulse`.
- [ ] **Step 4: Run** `pnpm vitest run apps/client/src/components` → PASS.
- [ ] **Step 5: Commit** — `feat(client): primitives I — buttons, fields, notes, tags, chips, table (RB.2)`

### Task RB.3: Primitives II — overlays, choices, controls

**Files:** as owned, plus `components/ui/{sheet,tabs}.test.tsx` and the one `label=` line in `features/shell/NavDrawer.tsx`. Test: `components/ui/primitives-2.test.tsx`. **Compatibility:** `Sheet` keeps accepting today's `label` prop (alias of `title`); `DestructiveConfirm` keeps every prop `ConfirmDialog` has today (`loss`, `cancelLabel`, `typeToConfirm`, …) and `components/ConfirmDialog.tsx` re-exports it under the old name until RB.18. **`DescribedChoice` structure:** each option is `<button type="button" role="radio" aria-checked={…} disabled={saving && key !== saving}>` inside `role="radiogroup"`, label + description as its text — so `toHaveTextContent`, `toBeDisabled` and `toBeChecked` work.

**Interfaces (Produces):**
```ts
// dialog.tsx — centred desktop dialog (THEME "Dialog (desktop)")
export function Dialog(p: { open: boolean; title: string; onClose(): void; children: ReactNode; footer?: ReactNode; width?: number }): JSX.Element | null;
// sheet.tsx — bottom / start sheet (THEME "Bottom sheet", "Phone menu")
export function Sheet(p: { open: boolean; side: 'bottom'|'start'; title: string; onClose(): void; children: ReactNode; width?: number; tone?: 'light'|'dark' }): JSX.Element | null;
// responsive-dialog.tsx — Dialog at ≥1024 px, bottom Sheet below
export function ResponsiveDialog(p: Parameters<typeof Dialog>[0]): JSX.Element | null;
// destructive-confirm.tsx (replaces components/ConfirmDialog.tsx; keep a re-export there until RB.18)
export function DestructiveConfirm(p: { open: boolean; title: string; objectName: string; body: ReactNode; confirmLabel: string; busy?: boolean; error?: string | null; typeToConfirm?: string; onConfirm(): void; onCancel(): void }): JSX.Element | null;
// segmented.tsx
export function Segmented<K extends string>(p: { label: string; options: { key: K; label: string }[]; value: K; onChange(k: K): void }): JSX.Element;  // radiogroup, 46 px segments
// described-choice.tsx
export function DescribedChoice<K extends string>(p: { label: string; options: { key: K; label: string; description: string }[]; value: K; saving?: K | null; onChange(k: K): void }): JSX.Element;
// option-buttons.tsx (was components/entry/ChoiceGroup) — same props as ChoiceGroup today
// switch.tsx (was ToggleField) — same props; 52×32 track
// counter.tsx (was CounterControl) — same props; − white / value mono 22 / + filled ink, 50 px buttons
// tabs.tsx — same API; equal width, 44 px, current = accent-tint + 3 px accent underline, optional `done` set renders ✓ and an optional `count` per tab
// live-checks.tsx
export function LiveChecks(p: { checks: { label: string; state: 'idle'|'ok'|'no' }[] }): JSX.Element;   // aria-live="polite"
// suggest-input.tsx — typed number with suggestions (THEME "Suggestion list")
export function SuggestInput<T>(p: { label: string; value: string; onChange(v: string): void; suggestions: T[]; render(t: T): ReactNode; onPick(t: T): void; createRow?: { label: string; onPick(): void }; inputMode?: 'numeric'|'text' }): JSX.Element;  // role=combobox + listbox, ↑↓ Enter Esc
// action-bar.tsx (was components/entry/StickyActionBar) — same props; white bar, 52 px block button
```

- [ ] **Step 1: Write the failing test** — `components/ui/primitives-2.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DestructiveConfirm } from './destructive-confirm';
import { DescribedChoice } from './described-choice';
import { LiveChecks } from './live-checks';
import { Segmented } from './segmented';
import { SuggestInput } from './suggest-input';

const ROLES = [
  { key: 'scouter', label: 'Scouter', description: 'Enters match data' },
  { key: 'lead', label: 'Scout lead', description: 'Fixes any entry, pick list' },
  { key: 'admin', label: 'Admin', description: 'Everything, incl. users' },
] as const;

describe('primitives II', () => {
  it('destructive confirm focuses Cancel first and names the object', () => {
    render(<DestructiveConfirm open title="Disable this account?" objectName="Yael Shapira" body="Not a delete."
      confirmLabel="Disable Yael Shapira" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Disable this account?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });
  it('Escape cancels a destructive confirm', async () => {
    const onCancel = vi.fn();
    render(<DestructiveConfirm open title="Delete?" objectName="Q10" body="x" confirmLabel="Delete" onConfirm={() => {}} onCancel={onCancel} />);
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });
  it('a described choice shows Saving… and locks the others while saving', () => {
    render(<DescribedChoice label="Role" options={[...ROLES]} value="scouter" saving="lead" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /Scout lead/ })).toHaveTextContent('Saving…');
    expect(screen.getByRole('radio', { name: /Admin/ })).toBeDisabled();
  });
  it('segmented control is a radio group', async () => {
    const onChange = vi.fn();
    render(<Segmented label="Match type" value="qual" onChange={onChange}
      options={[{ key: 'practice', label: 'Practice' }, { key: 'qual', label: 'Qualification' }]} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Practice' }));
    expect(onChange).toHaveBeenCalledWith('practice');
  });
  it('live checks say met / not met in words', () => {
    render(<LiveChecks checks={[{ label: 'At least 8 characters', state: 'ok' }, { label: 'Both new passwords match', state: 'no' }]} />);
    expect(screen.getByText('At least 8 characters').closest('li')).toHaveAttribute('data-state', 'ok');
    expect(screen.getByText('Both new passwords match').closest('li')).toHaveAttribute('data-state', 'no');
  });
  it('suggest input picks with the keyboard', async () => {
    const onPick = vi.fn();
    render(<SuggestInput label="Red 3" value="62" onChange={() => {}} inputMode="numeric"
      suggestions={[{ n: 6230, name: 'Team Koi' }]} render={(t) => `${t.n} ${t.name}`} onPick={onPick} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Red 3' }));
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onPick).toHaveBeenCalledWith({ n: 6230, name: 'Team Koi' });
  });
});
```

- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement.** Move `components/entry/{ChoiceGroup,ToggleField,CounterControl,StickyActionBar}.tsx` to `components/ui/{option-buttons,switch,counter,action-bar}.tsx` and leave one-line re-exports at the old paths (removed in RB.18) so RB.8 is not blocked. Dialog/Sheet use the existing `useModalFocus` (focus trap, Escape, return focus). `ResponsiveDialog` picks with `useIsDesktop()` from `lib/useMediaQuery`. No animation libraries: `motion-safe:` Tailwind transitions only.
- [ ] **Step 4: Run** `pnpm vitest run apps/client/src/components` → PASS (including the moved entry tests at their new paths).
- [ ] **Step 5: Commit** — `feat(client): primitives II — dialog, sheet, choices, counter, live checks, suggest input (RB.3)`

### Task RB.4: Device data — change bus, `useDeviceQuery`, station store, pure derivations

The speed task: pages stop polling and stop re-reading everything on every render. Data on the device is read once, re-read only when something actually changed.

**Files:**
- Create: `apps/client/src/data/changes.ts`, `data/useDeviceQuery.ts`, `data/station.ts`, `data/syncStatus.ts`, `lib/derive/entries.ts`, `lib/derive/coverage.ts`, and a `.test.ts` beside each
- Modify: `data/sync.ts` (after a pull is applied and after a push is acked: `notifyChanged('rows')` / `notifyChanged('outbox')`), `data/outbox.ts` (after `enqueue` and `ackResults`: `notifyChanged('outbox')`), `data/connection.ts` (`beginSync`/`endSync` call `notifyChanged('meta')`, so "syncing" — SPEC-FINAL 9.10 — reaches the hooks), `features/entry/submitEntry.ts` and the bare-match write in `features/entry/SelectRobotPage.tsx` and `wipeEvent` (one `notifyChanged('rows')` line each after their row writes)

**Interfaces (Produces):**
```ts
// data/changes.ts
export type ChangeKind = 'rows' | 'outbox' | 'meta';
export function notifyChanged(kind: ChangeKind): void;
export function onChanged(listener: (kind: ChangeKind) => void): () => void;
// data/useDeviceQuery.ts
export function useDeviceQuery<T>(load: () => Promise<T>, deps: unknown[], kinds: ChangeKind[]): T | undefined;
// data/station.ts — the remembered station (Scout README: "chosen once, remembered on the device")
export type Station = 'R1'|'R2'|'R3'|'B1'|'B2'|'B3';
export function getStation(): Promise<Station | null>;
export function setStation(s: Station): Promise<void>;   // setMeta('scout.station') + notifyChanged('meta')
// data/syncStatus.ts
export function readSyncStatus(): Promise<{ waiting: number; byAuthor: Record<string, number>; lastSyncAt: string | null }>;
export function useSyncStatus(): { waiting: number; byAuthor: Record<string, number>; lastSyncAt: string | null; online: boolean; syncing: boolean };
// lib/derive/entries.ts — pure, no Dexie
export type LineupSlot = { match_id: string; team_id: string; alliance: 'red'|'blue'; station: 1|2|3 };
export function stationOf(slots: LineupSlot[], matchId: string, teamId: string): Station | null;
export function notInLineup(slots: LineupSlot[], matchId: string, teamId: string, alliance: 'red'|'blue'): boolean;   // true only when the match HAS slots for that alliance and the team is not among them (Scout README)
export function needsLook(e: { id: string; match_id: string; team_id: string; alliance: 'red'|'blue' }, slots: LineupSlot[], refusedIds: Set<string>): boolean;
export function newestFirst<T extends { client_created_at: string }>(rows: T[]): T[];
export function matchesSearch(q: string, fields: (string | number | null | undefined)[]): boolean;   // case-insensitive, trims, number prefix
// lib/derive/coverage.ts
export function coverage(matches: { id: string; type: string; number: number }[], slots: LineupSlot[], entries: { match_id: string; team_id: string; form_kind?: string; deleted_at?: string | null }[]):   // ignores form_kind !== 'match'
  { matchId: string; number: number; state: 'full'|'gap'|'none' }[];   // qualification only; 'none' = no entry at all; 'full' = an entry for every slotted team (6)
```

- [ ] **Step 1: Write the failing tests** — `lib/derive/entries.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { matchesSearch, needsLook, newestFirst, notInLineup, stationOf, type LineupSlot } from './entries';

const SLOTS: LineupSlot[] = [
  { match_id: 'm37', team_id: 't5654', alliance: 'blue', station: 2 },
  { match_id: 'm37', team_id: 't1690', alliance: 'red', station: 2 },
];

describe('entry derivations', () => {
  it('finds the station a team holds in a match', () => {
    expect(stationOf(SLOTS, 'm37', 't5654')).toBe('B2');
    expect(stationOf(SLOTS, 'm37', 't3316')).toBeNull();
  });
  it('flags a team outside its alliance line-up, but not when the match has no line-up', () => {
    expect(notInLineup(SLOTS, 'm37', 't3316', 'blue')).toBe(true);
    expect(notInLineup(SLOTS, 'm37', 't1690', 'blue')).toBe(true);
    expect(notInLineup(SLOTS, 'm37', 't5654', 'blue')).toBe(false);
    expect(notInLineup(SLOTS, 'm99', 't3316', 'red')).toBe(false);
  });
  it('needs a look when refused or not in line-up', () => {
    expect(needsLook({ id: 'e1', match_id: 'm37', team_id: 't5654', alliance: 'blue' }, SLOTS, new Set(['e1']))).toBe(true);
    expect(needsLook({ id: 'e2', match_id: 'm37', team_id: 't3316', alliance: 'blue' }, SLOTS, new Set())).toBe(true);
    expect(needsLook({ id: 'e3', match_id: 'm37', team_id: 't5654', alliance: 'blue' }, SLOTS, new Set())).toBe(false);
  });
  it('orders newest first without mutating', () => {
    const rows = [{ client_created_at: '2026-10-06T09:00:00Z' }, { client_created_at: '2026-10-06T11:00:00Z' }];
    expect(newestFirst(rows)[0]!.client_created_at).toBe('2026-10-06T11:00:00Z');
    expect(rows[0]!.client_created_at).toBe('2026-10-06T09:00:00Z');
  });
  it('searches team number by prefix and names by substring, any case', () => {
    expect(matchesSearch('59', [5951, 'Tiny Titans'])).toBe(true);
    expect(matchesSearch('titans', [5951, 'Tiny Titans'])).toBe(true);
    expect(matchesSearch('noa', ['Noa Levi'])).toBe(true);
    expect(matchesSearch('', [1])).toBe(true);
    expect(matchesSearch('95', [5951])).toBe(false);
  });
});
```

`lib/derive/coverage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { coverage } from './coverage';

const M = [{ id: 'q1', type: 'qualification', number: 1 }, { id: 'q2', type: 'qualification', number: 2 }, { id: 'p1', type: 'practice', number: 1 }];
const slots = ['a', 'b', 'c', 'd', 'e', 'f'].map((t, i) => ({ match_id: 'q1', team_id: t, alliance: i < 3 ? 'red' as const : 'blue' as const, station: ((i % 3) + 1) as 1|2|3 }));

describe('schedule coverage (Home README)', () => {
  it('is qualification only, ordered by number', () => {
    expect(coverage(M, slots, []).map((c) => c.number)).toEqual([1, 2]);
  });
  it('full when every slotted team has an entry, gap when some do, none when nobody', () => {
    const all = slots.map((s) => ({ match_id: 'q1', team_id: s.team_id }));
    expect(coverage(M, slots, all)[0]!.state).toBe('full');
    expect(coverage(M, slots, all.slice(1))[0]!.state).toBe('gap');
    expect(coverage(M, slots, [])[0]!.state).toBe('none');
  });
  it('ignores deleted entries', () => {
    const all = slots.map((s) => ({ match_id: 'q1', team_id: s.team_id, deleted_at: s.team_id === 'a' ? '2026-10-06T00:00:00Z' : null }));
    expect(coverage(M, slots, all)[0]!.state).toBe('gap');
  });
});
```

`data/useDeviceQuery.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { notifyChanged } from './changes';
import { useDeviceQuery } from './useDeviceQuery';

let value = 1;
function Probe() {
  const v = useDeviceQuery(async () => value, [], ['outbox']);
  return <p>{v ?? 'loading'}</p>;
}

describe('useDeviceQuery', () => {
  it('reads once, then again only when its kind changes', async () => {
    render(<Probe />);
    expect(await screen.findByText('1')).toBeInTheDocument();
    value = 2;
    await act(async () => notifyChanged('rows'));
    expect(screen.getByText('1')).toBeInTheDocument();
    await act(async () => notifyChanged('outbox'));
    expect(await screen.findByText('2')).toBeInTheDocument();
  });
});
```

`data/station.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { getStation, setStation } from './station';

beforeEach(async () => { await db.delete(); await db.open(); });

describe('remembered station', () => {
  it('is null until chosen, then remembered', async () => {
    expect(await getStation()).toBeNull();
    await setStation('B2');
    expect(await getStation()).toBe('B2');
  });
});
```

- [ ] **Step 2: Run — fails** (`pnpm vitest run apps/client/src/lib/derive apps/client/src/data/useDeviceQuery.test.tsx apps/client/src/data/station.test.ts`).
- [ ] **Step 3: Implement**

```ts
// data/changes.ts
export type ChangeKind = 'rows' | 'outbox' | 'meta';
const listeners = new Set<(kind: ChangeKind) => void>();
/** Something on the device changed: re-read what depends on it. Sync, the outbox and meta writers call this. */
export function notifyChanged(kind: ChangeKind): void {
  for (const l of listeners) l(kind);
}
export function onChanged(listener: (kind: ChangeKind) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
```

```ts
// data/useDeviceQuery.ts
import { useEffect, useState } from 'react';
import { onChanged, type ChangeKind } from './changes';

/**
 * Read from IndexedDB once, then again only when one of `kinds` changes. No polling, no
 * network. A stale answer from an older run is dropped.
 */
export function useDeviceQuery<T>(load: () => Promise<T>, deps: unknown[], kinds: ChangeKind[]): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    let run = 0;
    const read = () => {
      const mine = ++run;
      void load().then((v) => { if (mine === run) setValue(v); });
    };
    read();
    const off = onChanged((kind) => { if (kinds.includes(kind)) read(); });
    return () => { run = -1; off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
```

```ts
// data/station.ts
import { notifyChanged } from './changes';
import { getMeta, setMeta } from './db';

export type Station = 'R1' | 'R2' | 'R3' | 'B1' | 'B2' | 'B3';
const KEY = 'scout.station';
export const STATIONS: readonly Station[] = ['R1', 'R2', 'R3', 'B1', 'B2', 'B3'];

export async function getStation(): Promise<Station | null> {
  const v = await getMeta<string | null>(KEY, null);
  return STATIONS.includes(v as Station) ? (v as Station) : null;
}
export async function setStation(s: Station): Promise<void> {
  await setMeta(KEY, s);
  notifyChanged('meta');
}
```

```ts
// data/syncStatus.ts
import { useOnline } from '@/lib/useOnline';
import { connectionState } from './connection';
import { db, getMeta } from './db';
import { useDeviceQuery } from './useDeviceQuery';

/** What the shell, Home and Switch scouter show about sending (SPEC-FINAL 9.10). Counts records, not bare matches. */
export async function readSyncStatus() {
  const ops = await db.outbox.filter((op) => op.entity !== 'match').toArray();
  const byAuthor: Record<string, number> = {};
  for (const op of ops) byAuthor[op.author_user_id] = (byAuthor[op.author_user_id] ?? 0) + 1;
  return { waiting: ops.length, byAuthor, lastSyncAt: await getMeta<string | null>('sync.last_success_at', null) };
}
export function useSyncStatus() {
  const status = useDeviceQuery(readSyncStatus, [], ['outbox', 'meta']);
  const online = useOnline();
  return { waiting: status?.waiting ?? 0, byAuthor: status?.byAuthor ?? {}, lastSyncAt: status?.lastSyncAt ?? null, online, syncing: connectionState() === 'syncing' };
}
```

In `data/sync.ts`, after `setMeta('sync.last_success_at', …)` add `notifyChanged('meta')` and after the pull's rows are written `notifyChanged('rows')`; in `data/outbox.ts` add `notifyChanged('outbox')` at the end of `enqueue`, `ackResults` and `retryRejected`. Implement `lib/derive/entries.ts` and `coverage.ts` as plain functions over the arrays (build a `Map` keyed `${match_id}:${team_id}` once per call).

- [ ] **Step 4: Run** the scoped tests → PASS; then `pnpm vitest run apps/client/src/data` → PASS (existing sync/outbox tests unchanged).
- [ ] **Step 5: Commit** — `feat(client): device data — change bus, useDeviceQuery, remembered station, derivations (RB.4)`

### Task RB.5: E2E harness — Playwright, mocked API, screenshot + overflow + axe checks

**Files:**
- Create: `apps/client/playwright.config.ts`, `apps/client/e2e/fixtures.ts`, `apps/client/e2e/api-mock.ts`, `apps/client/e2e/shoot.ts`, `apps/client/e2e/smoke.spec.ts`, `apps/client/e2e/.gitignore` (`__screens__/`, `test-results/`)
- Modify: `apps/client/package.json` (script `"e2e": "playwright test"`, devDeps `@playwright/test`, `@axe-core/playwright`)

**Interfaces (Produces):**
```ts
// e2e/api-mock.ts
export type Role = 'scouter' | 'lead' | 'admin';
export async function mockApi(page: Page, opts?: MockOptions): Promise<void>;          // call once per test; overrides first; MockError → { error: { code, message } }
export async function signIn(page: Page, role?: Role, opts?: Omit<MockOptions, 'role'>): Promise<void>;   // registers the mock itself — do not also call mockApi
export async function goOffline(page: Page): Promise<void>;
// e2e/shoot.ts
export async function shoot(page: Page, name: string): Promise<void>;   // 1440 and 375: screenshot to e2e/__screens__/<name>-{desktop,phone}.png, asserts no horizontal overflow, asserts no serious/critical axe violations
// e2e/fixtures.ts — FIXTURE: one season, District #3, 22 teams, 10 qualification matches with the line-ups of docs/design/pages/07-manage/src/manage.js, 14 entries of docs/design/pages/05-entries/src/entries.js, 12 users of docs/design/pages/08-users/src/users.js — every id a fixed UUID (loginOutput's user.id is .uuid())
```

- [ ] **Step 1: Install** (Chrome is already installed; Playwright drives it, no browser download)

```bash
pnpm --filter @frc/client add -D @playwright/test @axe-core/playwright
```

- [ ] **Step 2: `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  use: { channel: 'chrome', baseURL: 'http://localhost:4173', locale: 'en-GB', timezoneId: 'Asia/Jerusalem', serviceWorkers: 'block' },
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    env: { VITE_API_BASE_URL: 'http://api.test', VITE_DEVICE_WIPE_CODE: 'WIPE2096', VITE_APP_VERSION: '1.4.0' },
  },
});
```

- [ ] **Step 3: `api-mock.ts`** — every call to `http://api.test/**` is answered from `FIXTURE`; nothing leaves the machine. Responses are validated with the shared schemas so a fixture that drifts from the API fails loudly.

```ts
import type { Page, Route } from '@playwright/test';
import { API, loginOutput } from '@frc/shared';
import { FIXTURE, USERS } from './fixtures';

export type Role = 'scouter' | 'lead' | 'admin';
const USER: Record<Role, (typeof USERS)[number]> = {
  scouter: USERS.find((u) => u.username === 'yael.s')!,
  lead: USERS.find((u) => u.username === 'noa.levi')!,
  admin: USERS.find((u) => u.username === 'tamar.m')!,
};

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'X-Refreshed-Token' };
/** An override that is an Error-shaped object becomes an HTTP error with the client's error body. */
export type MockError = { status: number; code: string; message: string };
const isError = (v: unknown): v is MockError => typeof v === 'object' && v !== null && 'status' in v && 'code' in v;

export type MockOptions = { role?: Role; mustChange?: boolean; overrides?: Record<string, unknown> };

/** Register once per test. Overrides are checked FIRST (also for 'sync/pull' and 'login'). */
export async function mockApi(page: Page, opts: MockOptions = {}) {
  const role = opts.role ?? 'lead';
  await page.route('http://api.test/**', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(route.request().url());
    const name = url.pathname.replace(/^\/api\//, '').replace(/^\//, '');
    const fulfill = (status: number, json: unknown) => route.fulfill({ status, json, headers: CORS });
    const override = opts.overrides?.[name];
    if (isError(override)) return fulfill(override.status, { error: { code: override.code, message: override.message } });
    if (override !== undefined) return fulfill(200, override);
    if (name === 'sync/pull') return fulfill(200, FIXTURE.pull);
    if (name === 'sync/push') {
      const body = route.request().postDataJSON() as { operations: { op_id: string; row_id: string }[] };
      return fulfill(200, { results: body.operations.map((o) => ({ op_id: o.op_id, status: 'applied', row_id: o.row_id, new_version: 1 })) });
    }
    if (name === 'login' || name === 'refreshToken') {
      const user = { ...USER[role], must_change_password: Boolean(opts.mustChange) };
      return fulfill(200, loginOutput.parse({ token: 'test-token', user }));
    }
    const answer = (FIXTURE.rpc as Record<string, unknown>)[name];
    if (answer === undefined) return fulfill(404, { error: { code: 'not_found', message: `no mock for ${name}` } });
    const spec = (API as Record<string, { output: { parse(v: unknown): unknown } }>)[name];
    return fulfill(200, spec ? spec.output.parse(answer) : answer);
  });
}

/** Go offline only AFTER a page has loaded (offline before goto fails the navigation). */
export async function goOffline(page: Page) {
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
}

export async function signIn(page: Page, role: Role = 'lead', opts: Omit<MockOptions, 'role'> = {}) {
  await mockApi(page, { role, ...opts });
  await page.goto('/login');
  await page.getByLabel('Username').fill(USER[role].username);
  await page.getByLabel('Password', { exact: true }).fill('test-password-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/');
}
```

Verified in review: RPC goes to `${base}/api/<name>`, sync to `${base}/sync/pull?event_id=…` and `/sync/push`; push results are `{ op_id, status: 'applied', row_id, new_version }` (`PushResult`, protocol.ts); errors are `{ error: { code, message } }` (rpc.ts) — a 401 with that body is "definitive", so login shows the wrong-password line instead of falling back to the offline check; `FIXTURE.rpc` holds one answer per registry query the screens call (`getActiveContext`, `listSeasons`, `listEvents`, `listUsers`, `listTeams`, `listEventRoster`, `listMatches`, `countEntriesByScouter`).

- [ ] **Step 4: `shoot.ts`**

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const WIDTHS = { desktop: { width: 1440, height: 900 }, phone: { width: 375, height: 812 } } as const;

/** One screen at both design widths: picture, no sideways scroll, no serious a11y problem. */
export async function shoot(page: Page, name: string, only?: keyof typeof WIDTHS) {
  for (const [label, size] of Object.entries(WIDTHS)) {
    if (only && only !== label) continue;
    await page.setViewportSize(size);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${name} ${label}: horizontal overflow`).toBeLessThanOrEqual(0);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${v.id}: ${v.help}`), `${name} ${label}: axe`).toEqual([]);
    await page.screenshot({ path: `e2e/__screens__/${name}-${label}.png`, fullPage: label === 'phone' });
  }
}
```

- [ ] **Step 5: `smoke.spec.ts`** — proves the harness, not a design

```ts
import { expect, test } from '@playwright/test';
import { signIn } from './api-mock';
import { shoot } from './shoot';

test('signs in against the mock and lands on Home', async ({ page }) => {
  await signIn(page, 'lead');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await shoot(page, 'smoke-home');
});
```

- [ ] **Step 6: Run** `pnpm --filter @frc/client e2e` → `1 passed`; `e2e/__screens__/smoke-home-desktop.png` and `-phone.png` exist. (Axe may find violations in the *old* screens: record them in DEVIATIONS and mark the assertion `test.fail()` in the smoke spec only — page tasks remove it.)
- [ ] **Step 7: Commit** — `test(client): Playwright harness with mocked API, screenshots, overflow and axe checks (RB.5)`

### Task RB.13: Server — `countEntriesByScouter` (entries this season per person)

**Files:** as owned. Test: `apps/server/src/core/queries/countEntriesByScouter.test.ts`.

**Interfaces (Produces):**
```ts
// packages/shared/src/api/users.ts
export const countEntriesByScouterInput = z.object({ season_id: z.string().uuid() });
export const countEntriesByScouterOutput = z.object({ items: z.array(z.object({ scouter_id: z.string().uuid(), count: z.number().int().min(0) })) });
// API registry key: countEntriesByScouter (kind 'query'; any authenticated user)
// store: countEntriesByScouterForSeason(seasonId: string): Promise<{ scouter_id: string; count: number }[]>
```

- [ ] **Step 1: Write the failing test** (uses the fake context like `listUsers.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { makeFakeContext } from '../../test/fake-context.js';
import { countEntriesByScouter } from './countEntriesByScouter.js';

describe('countEntriesByScouter', () => {
  it('counts live entries per scouter across the season, never deleted ones', async () => {
    // makeFakeContext() takes no arguments: seed the fake store through its own setters
    // (read apps/server/src/test/fake-context.ts), e.g. ctx.store.seed({ events, scouting_entries }).
    const ctx = makeFakeContext();
    seedFake(ctx, {
      events: [{ id: E1, season_id: S1 }, { id: E2, season_id: S1 }, { id: E3, season_id: S2 }],
      scouting_entries: [
        { id: A, event_id: E1, scouter_id: U1, deleted_at: null },
        { id: B, event_id: E2, scouter_id: U1, deleted_at: null },
        { id: C, event_id: E2, scouter_id: U2, deleted_at: '2026-10-06T00:00:00Z' },
        { id: D, event_id: E3, scouter_id: U2, deleted_at: null },
      ],
    });
    const admin = { kind: 'user', userId: U9, role: 'admin' } as const; // Caller is { kind, userId, role }
    const out = await countEntriesByScouter(admin, { season_id: S1 }, ctx);
    expect(out.items).toEqual([{ scouter_id: U1, count: 2 }]);
  });
});
```

(`seedFake` is a small helper in the test file over the fake store's real API; `E1…U9` are fixed UUID constants at the top of the file.)

- [ ] **Step 2: Run — fails** (`pnpm vitest run apps/server/src/core/queries/countEntriesByScouter.test.ts`).
- [ ] **Step 3: Implement**
  - Shared schemas above; add `countEntriesByScouter: { input, output }` to `API` in `packages/shared/src/api/index.ts`.
  - `UseCaseContext.store` (context.ts) gains `countEntriesByScouterForSeason(seasonId)`.
  - `repos/store.ts`, following `countEntriesBySeason` (two reads, no join):

```ts
async countEntriesByScouterForSeason(seasonId: string) {
  const { data: events, error } = await db.from('events').select('id').eq('season_id', seasonId);
  if (error) throw dbError(error);
  const eventIds = (events ?? []).map((e) => e.id);
  if (eventIds.length === 0) return [];
  // PostgREST caps a read at max_rows = 1000 (packages/db/supabase/config.toml): page through.
  const PAGE = 1000;
  const counts = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error: readError } = await db
      .from('scouting_entries')
      .select('scouter_id')
      .in('event_id', eventIds)
      .is('deleted_at', null)
      .order('id')
      .range(from, from + PAGE - 1);
    if (readError) throw dbError(readError);
    for (const r of data ?? []) counts.set(r.scouter_id, (counts.get(r.scouter_id) ?? 0) + 1);
    if ((data ?? []).length < PAGE) break;
  }
  return [...counts].map(([scouter_id, count]) => ({ scouter_id, count }));
},
```

  - The fake store implements the same over its arrays.
  - `core/queries/countEntriesByScouter.ts`: `void caller; const { season_id } = parseInput(countEntriesByScouterInput, input); return { items: (await ctx.store.countEntriesByScouterForSeason(season_id)).sort((a, b) => b.count - a.count) };`
  - Registry row: `kind: 'query'`, description `"Entries per scouter across a season's events, live entries only. Feeds the Users page."`.
- [ ] **Step 4: Run** the test → PASS; `pnpm --filter @frc/server build` (BUILD-CONTEXT §6) → `apps/server/api/index.js` changes.
- [ ] **Step 5: Commit** — `feat(server): countEntriesByScouter query for the Users page (RB.13)`

---
## Wave C

### Task RB.6: Shell — sidebar + account menu, phone top bar, raised-Scout bottom bar, narrow menu, lazy routes

**Design:** `docs/design/pages/11-phone-shell/final/` (phone), `10-password/final/password-desktop-entry.png` (account menu), the sidebar in every desktop final, THEME rows "Phone top bar", "Phone bottom bar", "Phone menu (drawer)", "Account menu".

**Files:**
- Modify: `features/shell/{ShellLayout,Sidebar,TopBar,BottomBar,NavDrawer,NavList,AccountBlock,Brand,ConnectionIndicator,nav}.tsx/ts`, `routes.tsx`, `apps/client/package.json` (remove `@tanstack/react-query`)
- Create: `features/shell/AccountMenu.tsx`, `features/shell/SyncPill.tsx`, `lib/pageTitle.ts`, tests `features/shell/nav.test.ts` (extend), `features/shell/shell.test.tsx`, `e2e/shell.spec.ts`

**Interfaces:**
- Consumes: `useSyncStatus()` (RB.4), `Sheet` (RB.3), `Initials`, `RoleTag` (RB.2).
- Produces:
```ts
// nav.ts — NavItem gains:
//   phoneLabel?: string            // 'Matches' for manage
//   desktopOnly?: boolean          // users: true (never in the phone menu)
//   raised?: boolean               // scout: true (the middle button)
export const BOTTOM_BAR_SIDE_MAX = 2;                       // tabs either side of the raised Scout (spec v1.15)
export function bottomBar(who: NavAudience, isDesktop: false): { left: NavItem[]; raised: NavItem | null; right: NavItem[] };
export function menuItemsFor(who: NavAudience, isDesktop: boolean): NavItem[];
// lib/pageTitle.ts
export function usePageTitle(title: string | null): void;   // a page sets its own top-bar title ("Q38 · 5951")
export function useCurrentTitle(): string;                  // TopBar reads it; falls back to the route handle `title`
```

- [ ] **Step 1: Write the failing tests** — add to `features/shell/nav.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bottomBar, menuItemsFor, NAV_ITEMS } from './nav';

const admin = { user: { id: 'u', role: 'admin' as const }, expired: false, override: false };
const scouter = { user: { id: 'u', role: 'scouter' as const }, expired: false, override: false };

describe('navigation (spec v1.15)', () => {
  it('phone bar: Home and Entries around a raised Scout', () => {
    const bar = bottomBar(scouter, false);
    expect(bar.left.map((i) => i.id)).toEqual(['home']);
    expect(bar.raised?.id).toBe('scout');
    expect(bar.right.map((i) => i.id)).toEqual(['entries']);
  });
  it('the phone menu never offers Users, and calls Manage "Matches"', () => {
    const items = menuItemsFor(admin, false);
    expect(items.map((i) => i.id)).not.toContain('users');
    expect(items.find((i) => i.id === 'manage')?.phoneLabel).toBe('Matches');
  });
  it('the desktop sidebar offers both admin places to an admin, none to a scouter', () => {
    expect(menuItemsFor(admin, true).filter((i) => i.group === 'admin').map((i) => i.id)).toEqual(['users', 'manage']);
    expect(menuItemsFor(scouter, true).filter((i) => i.group === 'admin')).toEqual([]);
  });
  it('keeps one row per destination', () => {
    expect(new Set(NAV_ITEMS.map((i) => i.id)).size).toBe(NAV_ITEMS.length);
  });
});
```

`features/shell/shell.test.tsx` (render the shell around a dummy child with a signed-in lead, using the existing AppShell test helpers in `AppShell.test.tsx` — copy its `renderShell` setup):

```tsx
it('opens the account menu from the sidebar corner with the three account actions', async () => {
  await renderShell({ width: 1440 });
  await userEvent.click(screen.getByRole('button', { name: /Noa Levi/ }));
  const menu = screen.getByRole('menu');
  expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Switch scouter', 'Change password', 'Sign out']);
});
it('shows the waiting count on the Entries tab and in the top-bar pill', async () => {
  await seedOutbox(3); // three entry ops by the signed-in user
  await renderShell({ width: 375 });
  expect(screen.getByRole('link', { name: 'Entries, 3 waiting to send' })).toBeInTheDocument();
  expect(screen.getByText('3 waiting')).toBeInTheDocument();
});
it('hides the bottom bar on the entry route', async () => {
  await renderShell({ width: 375, path: '/entry/m/t' });
  expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
});
```

(`renderShell` and `seedOutbox` are small helpers you add at the top of the file: `seedOutbox(n)` puts `n` outbox ops with `entity: 'scouting_entry'` and the lead's `author_user_id`; `renderShell` copies the `setWidth` `matchMedia` stub from `ShellLayout.test.tsx:45` (jsdom otherwise renders desktop) and `AppShell.test.tsx`'s `vi.mock`s of `@/data/sync`, `@/data/api` and `@/config`, then mounts `createMemoryRouter(routeTree(), { initialEntries: [path ?? '/'] })`. Lazy routes resolve asynchronously: use `findBy…`, and update `routes.test.tsx` / `UsersPage.test.tsx` routeTree tests the same way.)

- [ ] **Step 2: Run — fails.** `pnpm vitest run apps/client/src/features/shell`
- [ ] **Step 3: Implement**
  - `nav.ts`: add the three fields; `users` gets `desktopOnly: true`; `manage` gets `phoneLabel: 'Matches'`; `scout` gets `raised: true`; `bottomBar()` returns `left` = items with `bottomBar` < scout's, `right` = after, each sliced to `BOTTOM_BAR_SIDE_MAX`; replace `BOTTOM_BAR_MAX` and its comment (Entries no longer returns to the drawer).
  - Every route `handle` merges, never replaces: `{ ...NO_HYDRATION, title: 'Users' }`.
  - The account menu keeps `AccountBlock`'s conditions: **Switch scouter** only while the session is not expired, **Change password** only with a token.
  - The phone ☰ keeps today's accessible name **"Open the menu"**.
  - **Desktop sidebar** (`--rail`, 232 px): brand row (mark + "RobActive Scout" + "Team 2096"), groups with 11 px uppercase `rail-muted` headings, items 9×10 padding, current `bg-rail-raised text-white`. Keep the collapse behaviour. The foot is a button (initials, name, role) that opens `AccountMenu` (white, 10 px radius, shadow, `role="menu"`, items `role="menuitem"`: Switch scouter → `/switch-scouter`, Change password → `/change-password`, divider, Sign out → existing sign-out). Esc and outside click close it.
  - **Desktop top bar** (60 px, white, `border-b border-line`): crumb on the left (route handle `crumb`, default the title), `SyncPill` chips on the right ("● 3 waiting to send" amber dot, "● Online"/"Offline").
  - **Phone top bar** (54 px `bg-rail`): ☰ (44 px), mark, `useCurrentTitle()` 16 px/650 white, `SyncPill compact` on `bg-rail-raised` ("● 3 waiting" / "● All sent" / "● Offline").
  - **Phone bottom bar** (`bg-rail`, `nav aria-label="Main"`): left tabs, a raised 58 px `bg-accent` 18 px-radius Scout button with a 4 px `rail` ring and label below, right tabs; current tab white with a `bg-rail-raised` pill behind the icon; Entries carries the amber mono badge and its accessible name becomes "Entries, N waiting to send". Hidden where `matchPath(ENTRY_ROUTE, pathname)` matches (as `AppShell.tsx:121` does today — not `isEntryPath`, which includes `/scout`; Scout keeps the bar).
  - **Phone menu:** `Sheet side="start" tone="dark" width={252}` with brand row + ✕, the sync line ("● 3 waiting to send" / "last sync 09:08"), `menuItemsFor(who,false)` grouped (labels use `phoneLabel ?? label`), the account at the foot (initials, name, role, the three actions, "version {appVersion}" + "Team 2096").
  - `ConnectionIndicator`: stop the 2 s poll; read `useSyncStatus()` (event-driven).
  - **Lazy routes** in `routes.tsx`: `LoginPage`, `ChangePasswordPage`, `SwitchScouter`, `UsersPage`, `UserDetailPage`, `ManagePage` become `lazy(() => import(...))` inside one `<Suspense fallback={<Skeleton rows={4} label="Loading" />}>`. Home, Scout, Entry and Entries stay eager (the competition path never waits on a chunk). Each route gets `handle: { title: 'Home' | 'Scout' | 'Entries' | 'Switch scouter' | 'Users' | 'Matches' … }`.
  - Remove `@tanstack/react-query` (`pnpm --filter @frc/client remove @tanstack/react-query`); confirm `grep -r "react-query" apps/client/src` is empty first.
- [ ] **Step 4: Run** `pnpm vitest run apps/client/src/features/shell apps/client/src/routes.test.tsx` → PASS.
- [ ] **Step 5: E2E** — `e2e/shell.spec.ts`

```ts
import { expect, test } from '@playwright/test';
import { signIn } from './api-mock';
import { shoot } from './shoot';

test('phone shell: bars, menu, and no Users on a phone', async ({ page }) => {
  await signIn(page, 'admin');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Open the menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu.getByRole('link', { name: 'Matches' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Users' })).toHaveCount(0);
  const box = await menu.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(252);
  await shoot(page, 'shell-menu', 'phone');
});

test('desktop account menu', async ({ page }) => {
  await signIn(page, 'lead');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: /Noa Levi/ }).click();
  await expect(page.getByRole('menuitem', { name: 'Change password' })).toBeVisible();
  await shoot(page, 'shell-account-menu', 'desktop');
});
```

Run `pnpm --filter @frc/client e2e shell` → 2 passed.
- [ ] **Step 6: Compare** — open `e2e/__screens__/shell-menu-phone.png` beside `docs/design/pages/11-phone-shell/final/shell-phone.png` (image 2) and `shell-account-menu-desktop.png` beside `10-password/final/password-desktop-entry.png`. Write the check in the report as a table: element · matches? · difference. Fix every difference that is not mock data (names, counts).
- [ ] **Step 7: Commit** — `feat(client): D1 shell — sidebar account menu, dark phone bars with raised Scout, narrow menu, lazy admin routes (RB.6)`

---

## Wave D (parallel: RB.7 – RB.12). Every task: Consumes RB.2/RB.3 primitives, RB.4 data, RB.6 shell; owns only its files.

**Every page task ends with the same three steps:** (a) the subagent *writes* an e2e spec `e2e/<page>.spec.ts` that drives the states its final images show and calls `shoot()` for each — **it does not run it** (parallel wave); (b) after the wave gate the **orchestrator** runs the wave's specs and does **Compare**: each screenshot beside its final image, a table (element · matches? · difference) shown to the user, and every non-mock-data difference sent back to the owning task's subagent; (c) commit with the plan message. The final images are the acceptance test; the unit tests guard behaviour.

### Task RB.7: Login and Change password — the sign-in frame

**Design:** `04-login/final/`, `10-password/final/`.
**Files:** `auth/AuthFrame.tsx`, `auth/LoginPage.tsx`, `auth/ChangePasswordPage.tsx`, their tests, `e2e/auth.spec.ts`.

**Behaviour to build (from the READMEs):** desktop = 44 % `bg-rail` plate with the full lockup (`/brand/logo.png`, ~300 px) + the form alone on `bg-bg` at 380 px + "version {appVersion}" centred at the foot; phone = `bg-rail` band with the lockup (120 px; 84 px when a notice shows) then the form. `PasswordInput` on every password field. Login keeps today's offline note, expired warning (username prefilled, password focused), error line (`ErrorLine`), "Signing in…" busy button. Change password: titles "Choose a new password" (forced, with today's line, no way back) / "Change your password" (by choice, "Back to scouting"); `LiveChecks` under New password ("At least 8 characters" — `passwordSchema` length; "Both new passwords match") with `idle` until typed; offline → `Note icon="offline"` first with the 10-password README's wording ("No connection. Changing your password needs the server — try again when this device is online." — today's page has no offline note) and the button disabled.

- [ ] **Step 1: Failing tests** — add to `auth/LoginPage.test.tsx`:

```tsx
it('shows the version and lets you see the password you typed', async () => {
  renderLogin();
  expect(screen.getByText(/version/)).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Password', { selector: 'input' }), 'abc12345');
  await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText('Password', { selector: 'input' })).toHaveAttribute('type', 'text');
});
```

and to `auth/ChangePasswordPage.test.tsx`:

```tsx
it('ticks the rules as you type and catches a mismatch before submit', async () => {
  renderChangePassword({ mustChange: false });
  const items = () => screen.getAllByRole('listitem').map((li) => li.getAttribute('data-state'));
  expect(items()).toEqual(['idle', 'idle']);
  await userEvent.type(screen.getByLabelText('New password', { selector: 'input' }), 'orbit-cedar-42');
  await userEvent.type(screen.getByLabelText('Confirm new password', { selector: 'input' }), 'orbit-cedar');
  expect(items()).toEqual(['ok', 'no']);
});
it('offline: says so first and holds the button', () => {
  setOnline(false);
  renderChangePassword({ mustChange: false });
  expect(screen.getByText(/Changing your password needs the server/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled();
});
```

(`renderLogin` exists; add `renderChangePassword` and `setOnline` as 5-line helpers in the test file: memory router + the session setup `LoginPage.test.tsx` uses; `Object.defineProperty(navigator, 'onLine', { value, configurable: true })` + dispatch `offline`.)
- [ ] **Step 2: Run — fails.** `pnpm vitest run apps/client/src/auth`
- [ ] **Step 3: Implement** the behaviour above with `PasswordInput`, `LiveChecks`, `Note`, `ErrorLine`, `WarningNotice`, `Button busy`. Delete the `tap-target` source-reading assertion in `LoginPage.test.tsx` (it read `index.css`; the 48 px rule is now proven by RB.2's tests and axe).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: E2E** `e2e/auth.spec.ts`: login empty (desktop + phone) → `shoot('login')`; wrong password (`mockApi(page, { overrides: { login: { status: 401, code: 'unauthorized', message: 'invalid credentials' } } })`) → `shoot('login-error','phone')`; offline (`goto('/login')` then `goOffline(page)`) → `shoot('login-offline','phone')`; change password forced (`signIn(page, 'scouter', { mustChange: true })`) → `shoot('password-forced','phone')`; by choice with a mismatch → `shoot('password')`.
- [ ] **Step 6: Compare** against `04-login/final/login-{desktop,phone}.png`, `10-password/final/password-{desktop,phone}.png`.
- [ ] **Step 7: Commit** — `feat(client): sign-in frame — show/hide password, live checks, version (RB.7)`

### Task RB.8: Entry — phase tabs, pane header, summary panel, confirm sheet/dialog

**Design:** `01-entry/final/` (README + `final.css` for exact sizes).
**Files:** `features/entry/{EntryPage,FieldInput,RobotStatusPicker,useDraft,PhaseTabs,EntrySummary,ConfirmEntry}.tsx` + tests, `e2e/entry.spec.ts`.

**Behaviour:** header (back, "Q38 · 5951 Tiny Titans", `AllianceTag`, station pill); robot status as `Segmented` (Played · Broke down · Disabled · No show) — Disabled/No show hide every field and show today's "status only, never zeros" note; phases as `Tabs` (Auto · Teleop · Endgame · Notes — label "Notes" for the `post_match` phase, a DEVIATIONS line since code says "Post-match") with ✓ on a phase once any field in it is set; pane header "Auto", "n of N", pager dots; phone: swipe left/right between phases (pointer events, threshold 60 px, ignored when the gesture starts on a control) plus prev/next foot line; desktop: right-hand "This entry" panel per the README — per phase **how many fields are filled** ("3 of 5"), clicking a phase opens its tab, and **Review entry** sits in the panel and "Draft saved on this device · hh:mm" from the draft's `updated_at` (`useDraft` returns `savedAt: string | null`); Review → `ResponsiveDialog` (sheet on phone, dialog on desktop) grouped by phase with Keep editing / Submit and the error inside; edit-window line from `SELF_EDIT_WINDOW_MS` (5 minutes; the README's "10 minutes" gets a DEVIATIONS entry). Fields use `Counter`, `Switch`, `OptionButtons`, `Input`/`textarea` look. `usePageTitle('Q38 · 5951')`.

- [ ] **Step 1: Failing tests** — add to `features/entry/EntryPage.test.tsx`:

```tsx
it('shows phases as tabs and marks a phase done once a field in it is set', async () => {
  await renderEntry(); // existing helper: published form with auto/teleop/endgame/post_match fields
  await userEvent.click(screen.getByRole('radio', { name: 'Played' })); // fields appear only once a status is chosen
  const tab = () => screen.getByRole('tab', { name: /Auto/ });
  expect(tab()).toHaveAttribute('aria-selected', 'true');
  expect(tab()).not.toHaveTextContent('✓');
  await userEvent.click(screen.getAllByRole('button', { name: /plus one/ })[0]!); // CounterControl's label
  expect(tab()).toHaveTextContent('✓');
  expect(screen.getByText(/1 of \d/)).toBeInTheDocument();
});
it('a no-show hides every field and never records zeros', async () => {
  await renderEntry();
  await userEvent.click(screen.getByRole('radio', { name: 'No show' }));
  expect(screen.queryByRole('tab')).toBeNull();
  expect(screen.getByText(/never/i)).toBeInTheDocument();
});
it('says when the draft was saved', async () => {
  await renderEntry({ draftSavedAt: '2026-10-06T08:41:00Z' });
  expect(screen.getByText(/Draft saved on this device · \d\d:\d\d/)).toBeInTheDocument();
});
```

`renderEntry` does not exist yet: add it at the top of the test file, built from that file's existing setup (a published form with auto/teleop/endgame/post_match fields, `startWith`/`renderPage`-style mounting); `draftSavedAt` writes a `db.drafts` row with that `updated_at`.
- [ ] **Step 2: Run — fails.** `pnpm vitest run apps/client/src/features/entry/EntryPage.test.tsx`
- [ ] **Step 3: Implement.** `PhaseTabs.tsx` (tabs + pane header + swipe), `EntrySummary.tsx` (desktop panel), `ConfirmEntry.tsx` (the review dialog) — `EntryPage.tsx` composes them and keeps its data logic. `useDraft` adds `savedAt`. Derive "done" per phase with `useMemo` from the draft values.
- [ ] **Step 4: Run** `pnpm vitest run apps/client/src/features/entry` → PASS (existing submit/draft tests unchanged).
- [ ] **Step 5: E2E** `e2e/entry.spec.ts`: from Scout open Q38 · 5951 (fixture), set two auto counters, switch to Teleop, `shoot('entry')`; choose No show → `shoot('entry-noshow','phone')`; Review → `shoot('entry-confirm')`.
- [ ] **Step 6: Compare** against `01-entry/final/entry-{desktop,phone}.png`.
- [ ] **Step 7: Commit** — `feat(client): Entry — phase tabs, summary panel, confirm sheet (RB.8)`

### Task RB.9: Scout — remembered station, line-up tiles, roster list, "Team not here?"

**Design:** `02-scout/final/`.
**Files:** `features/entry/{SelectRobotPage,StationSheet,LineupTiles,RosterList}.tsx` + tests, `e2e/scout.spec.ts`.

**Behaviour:** first visit (no station) → `StationSheet` "Choose your station" (six `Station tile`s, red left, blue right; tapping a tile selects it, **"Use Blue 2"** saves with `setStation()`, **"Not now"** closes); then a "Your station · Blue 2 · Change" bar. Match: type `Select` (lg) + typed number (`Input size="lg" mono`, "Q" prefix). With `match_teams`: `LineupTiles` — six station tiles (alliance tint, "RED 1" label, team mono 19 px, name), the remembered station marked **YOUR STATION** and preselected; picking another tile asks first (`ResponsiveDialog` "Scout Red 1 instead?"); done tiles grey with ✓ (editable until hh:mm, `canSelfEdit`) or 🔒. Without `match_teams` (and after "Team not here?"): the **alliance choice** (`AllianceButtons`, preset from the remembered station's alliance) + `RosterList` — `SearchField` + selectable list rows from the roster. **"Team not here?"** opens `RosterList` over the whole roster; the chosen team gets a `WarningFlag` "Not in line-up" (derived later by `notInLineup`, nothing stored). Primary action bar "Start entry · 5654 Phoenix". Keep today's "not on this device yet, created on submit" note and the saved banner (`SuccessBanner`). All from IndexedDB via `useDeviceQuery(…, ['rows','meta'])`.

- [ ] **Step 1: Failing tests** — `features/entry/SelectRobotPage.test.tsx` (add):

```tsx
it('asks for a station once, then remembers it and preselects that robot', async () => {
  await seedEventWithLineup(); // existing fixture helper + match_teams for Q39
  renderScout();
  const sheet = await screen.findByRole('dialog', { name: 'Choose your station' });
  await userEvent.click(within(sheet).getByRole('button', { name: /BLUE 2/ }));
  await userEvent.click(within(sheet).getByRole('button', { name: 'Use Blue 2' }));
  expect(await getStation()).toBe('B2');
  await userEvent.type(screen.getByLabelText('Match number'), '39');
  expect(await screen.findByRole('radio', { name: /YOUR STATION/ })).toBeChecked();
  expect(screen.getByRole('button', { name: /Start entry · 5654/ })).toBeEnabled();
});
it('confirms before scouting a robot that is not your station', async () => {
  await seedEventWithLineup(); await setStation('B2');
  renderScout();
  await userEvent.type(await screen.findByLabelText('Match number'), '39');
  await userEvent.click(screen.getByRole('radio', { name: /RED 1/ }));
  expect(screen.getByRole('dialog', { name: /Scout Red 1 instead\?/ })).toBeInTheDocument();
});
it('"Team not here?" lists the whole roster', async () => {
  await seedEventWithLineup(); await setStation('B2');
  renderScout();
  await userEvent.type(await screen.findByLabelText('Match number'), '39');
  await userEvent.click(screen.getByRole('button', { name: 'Team not here?' }));
  await userEvent.type(screen.getByRole('searchbox'), '3316');
  expect(screen.getByRole('radio', { name: /3316/ })).toBeInTheDocument();
});
```

`seedEventWithLineup` and `renderScout` do not exist yet: add them at the top of the test file from its current setup (`renderSwitch`/`renderPage` pattern), seeding `match_teams` for Q39 with 5654 at blue 2.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** (split into the three new files; `SelectRobotPage.tsx` keeps navigation + submit wiring).
- [ ] **Step 4: Run** `pnpm vitest run apps/client/src/features/entry` → PASS.
- [ ] **Step 5: E2E** `e2e/scout.spec.ts`: clear storage → station sheet `shoot('scout-station','phone')`; choose B2, type 39 → `shoot('scout')`; "Team not here?" → `shoot('scout-roster','phone')`.
- [ ] **Step 6: Compare** against `02-scout/final/scout-{desktop,phone}.png`.
- [ ] **Step 7: Commit** — `feat(client): Scout — remembered station, line-up tiles, roster list (RB.9)`

### Task RB.10: Home — tiles, Go to, schedule coverage, Switch-competition sheet

**Design:** `03-home/final/` (B3; phone order in the README; image `home-phone.png` incl. the Matches tile and no Users tile).
**Files:** `features/home/**`, `features/context/**` (ContextPage becomes `SwitchCompetitionSheet.tsx`; `/context` stays a redirect), tests, `e2e/home.spec.ts`.

**Behaviour:** "This device is working on" + event name; **Scout a match** (primary; withheld under an override, as today) + **Switch competition** (secondary → `ResponsiveDialog` with season chips + event cards, current = "Current · default"; fetches `listSeasons`/`listEvents` **only when opened**, cached rows first; offline disables non-default events with today's line). Tiles: **Your station** (`StationTag`-style pill, "Change it on Scout"), **Waiting to send** (`useSyncStatus`, warn count, "Last sync 09:08 · sends when online"), **Your last entry** (newest of `scouting_entries` where `scouter_id` = me; "Q38 · 5951 Tiny Titans · 2 min ago · Open"). Phone: one small line "● 3 entries waiting to send · last sync 09:08" / "Everything is sent". **Go to** tiles: Entries, Switch scouter; admins: desktop Manage + Users (dark icon, "ADMIN"), phone only **Matches** ("Create matches and line-ups"). **Schedule coverage**: `coverage()` from RB.4 → grid of rounded squares (`bg-accent` full, `bg-coverage-gap` gap — token from RB.1, `bg-line-2` + `border-line` none), legend, "N matches are missing a robot" + the match labels in mono. Our-team card and Top teams are **not built** (README: after ranking). Version in the footer. Override banner (`WarningNotice` + "Back to …"). Zero network on render.

- [ ] **Step 1: Failing tests** — `features/home/HomePage.test.tsx`:

```tsx
it('renders from the device alone — no RPC on load', async () => {
  const rpc = { call: vi.fn() }; // HomePage and SwitchCompetitionSheet take an injectable rpc = { call: typedCall }, like ContextPage does today
  await seedHomeDevice(); // event, matches Q1..Q10 with line-ups, entries, station B2, 3 outbox ops
  renderHome({ role: 'lead', rpc });
  expect(await screen.findByText('District #3 · Tel Aviv')).toBeInTheDocument();
  expect(screen.getByText('Blue 2')).toBeInTheDocument();
  expect(screen.getByText(/3 entries waiting to send/)).toBeInTheDocument();
  expect(rpc.call).not.toHaveBeenCalled();
});
it('names the matches missing a robot', async () => {
  await seedHomeDevice();
  renderHome({ role: 'lead' });
  expect(await screen.findByText(/matches are missing a robot/)).toBeInTheDocument();
});
it('a phone admin sees Matches but not Users; a scouter sees neither', async () => {
  await seedHomeDevice();
  setWidth(375); renderHome({ role: 'admin' });
  expect(await screen.findByRole('link', { name: /Matches/ })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /^Users/ })).toBeNull();
});
it('loads competitions only when Switch competition is opened', async () => {
  const rpc = { call: vi.fn().mockResolvedValue({ items: [], next_cursor: null }) };
  await seedHomeDevice(); renderHome({ role: 'lead', rpc });
  expect(rpc.call).not.toHaveBeenCalled();
  await userEvent.click(await screen.findByRole('button', { name: 'Switch competition' }));
  expect(rpc.call).toHaveBeenCalled();
});
```

(`seedHomeDevice`, `renderHome`, `setWidth` are local to the test file; `setWidth` copies the `matchMedia` stub from `ShellLayout.test.tsx:45`.)
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** `HomePage.tsx` (layout per width), `StatTiles.tsx`, `GoToTiles.tsx`, `CoverageCard.tsx`, `SwitchCompetitionSheet.tsx`; each under ~150 lines.
- [ ] **Step 4: Run** `pnpm vitest run apps/client/src/features/home apps/client/src/features/context` → PASS.
- [ ] **Step 5: E2E** `e2e/home.spec.ts`: `shoot('home')`; open Switch competition → `shoot('home-switch','phone')`; scouter → `shoot('home-scouter','phone')`.
- [ ] **Step 6: Compare** against `03-home/final/home-{desktop,phone}.png` (ignore the rank card and top teams — not built yet; the README says coverage then takes the full width).
- [ ] **Step 7: Commit** — `feat(client): Home — tiles, Go to, schedule coverage, Switch competition sheet (RB.10)`

### Task RB.11: Entries — newest first, search, chips, station, waiting marker, phone cards

**Design:** `05-entries/final/`.
**Files:** `features/entries/{EntriesPage,EntriesTable,EntryCard,useEntriesView}.tsx/ts` + tests, `e2e/entries.spec.ts`.

**Behaviour:** all from the device: `scouting_entries` (live, current event), `matches`, `match_teams`, `teams`, `users`, `rejectedRows()`, pending outbox ids. `useEntriesView()` returns rows `{ id, matchLabel, station, teamNumber, teamName, status, scouter, time, waiting, refused, notInLineup }` newest first, plus chip counts. `SearchField` (team, match or scouter) + `FilterChips` **All · Mine · Waiting to send · Needs a look**. Desktop `Data table`: Match ↓ · Team (`StationTag` + number + name + `WarningFlag` "Not in line-up") · Status (`RobotStatusTag`) · Scouter · Time (time only; date when not today; amber ↑ when waiting) — **no Points column yet** (README: after task 1.54). Refused → its own `ErrorLine` row "Not synced: …". Key line under the table. Phone: `Entry card`s (points slot omitted until 1.54). Empty state with Scout a match. Rows do not open anything yet (entry preview is a later page).

- [ ] **Step 1: Failing tests** — `features/entries/useEntriesView.test.ts` (pure, over arrays) and `EntriesPage.test.tsx`:

```tsx
it('lists newest first and filters to mine', async () => {
  await seedEntries(); // 3 by me (noa), 2 by others, ascending times
  renderEntries({ me: 'noa' });
  const rows = await screen.findAllByRole('row');
  expect(rows[1]).toHaveTextContent('Q38');
  await userEvent.click(screen.getByRole('button', { name: /^Mine/ }));
  expect(screen.getAllByRole('row')).toHaveLength(1 + 3);
});
it('Needs a look = refused or not in line-up', async () => {
  await seedEntries({ refused: ['e36'], offLineup: ['e37'] });
  renderEntries({ me: 'noa' });
  await userEvent.click(await screen.findByRole('button', { name: /Needs a look 2/ }));
  expect(screen.getByText('Not in line-up')).toBeInTheDocument();
  expect(screen.getByText(/Not synced:/)).toBeInTheDocument();
});
it('marks a waiting entry next to its time', async () => {
  await seedEntries({ waiting: ['e38'] });
  renderEntries({ me: 'noa' });
  expect(await screen.findByLabelText('waiting to send')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement.** `useEntriesView` = `useDeviceQuery(load, [eventId], ['rows','outbox'])` + `useMemo` for search/filter (filtering is in memory; no re-read on typing).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: E2E** `e2e/entries.spec.ts`: `shoot('entries')`; Needs a look → `shoot('entries-look','phone')`; search "Noa" → `shoot('entries-search','phone')`; empty fixture → `shoot('entries-empty','phone')`.
- [ ] **Step 6: Compare** against `05-entries/final/entries-{desktop,phone}.png` (no Points column — expected).
- [ ] **Step 7: Commit** — `feat(client): Entries — newest first, search, filter chips, station, waiting marker (RB.11)`

### Task RB.12: Switch scouter — Scouting now, show/hide, "stays on this device"

**Design:** `06-switch/final/`.
**Files:** `auth/SwitchScouter.tsx` + test, `e2e/switch.spec.ts`.

**Behaviour:** 460 px column. "Scouting now" card (`Initials` + name). "Who's scouting next?" `Select size="lg"` ("Full name · username", current marked "· signed in now"). Password for {name} with `PasswordInput`, focused. **Stays on this device** `Note icon="info"` once someone is chosen: `useSyncStatus().byAuthor[current.id]` waiting count + `getStation()`: with both → "{Current}'s N entries waiting to send, which still send as {Current}'s, and station {Station label}."; only station → "Station {label}."; neither → no note. Never a pronoun. Errors as `ErrorLine` (password cleared, keeps focus). Today's no-accounts `Note`. Cancel.

- [ ] **Step 1: Failing test** — add to `auth/SwitchScouter.test.tsx`:

```tsx
it('says what stays on the device, by name, once someone is chosen', async () => {
  await seedUsersAndOutbox({ waitingByCurrent: 3 }); await setStation('B2');
  renderSwitch({ current: 'noa' });
  expect(screen.queryByText(/Stays on this device/)).toBeNull();
  await userEvent.selectOptions(await screen.findByLabelText("Who's scouting next?"), 'amit');
  expect(screen.getByText(/Noa Levi's 3 entries waiting to send, which still send as Noa Levi's, and station Blue 2/)).toBeInTheDocument();
});
```

- [ ] **Step 2–4:** run (fails) → implement → run `pnpm vitest run apps/client/src/auth/SwitchScouter.test.tsx` (PASS).
- [ ] **Step 5: E2E** `e2e/switch.spec.ts`: nobody chosen → `shoot('switch','phone')`; chosen → `shoot('switch-chosen')`; offline wrong password (mock 401 offline path uses the cached hash — seed none so it mismatches) → `shoot('switch-error','phone')`.
- [ ] **Step 6: Compare** against `06-switch/final/switch-{desktop,phone}.png`.
- [ ] **Step 7: Commit** — `feat(client): Switch scouter — scouting-now card, show/hide, what stays on the device (RB.12)`

---
## Wave E (parallel: RB.14 – RB.17). Admin pages: server calls are expected here; each list is fetched once per visit and updated in place after a change (no re-fetch storms).

### Task RB.14: Users — search, chips, entries this season, row actions, Add-a-user dialog

**Design:** `08-users/final/` (`users-desktop.png`, `-add.png`, `-created.png`).
**Files:** `features/admin/{UsersPage,UsersTable,AddUserDialog,password}.tsx/ts`, `features/admin/useUsers.ts`, tests, `e2e/users.spec.ts`.
**Consumes:** `countEntriesByScouter` (RB.13), `DestructiveConfirm`, `DescribedChoice`, `ResponsiveDialog`→`Dialog`, `FilterChips`, `SearchField`, `RoleTag`, `AccountStatusTag`, `Initials`.

**Behaviour:** load `listUsers({ include_disabled: true })` once (+ `countEntriesByScouter({ season_id: activeSeason })` in parallel, `Promise.all`); chips **All · Scouters · Leads · Admins · Disabled** with counts (Disabled replaces the checkbox; the role chips list active accounts only); search name/username in memory. Table: initials+name · username (mono) · `RoleTag` · `AccountStatusTag` · Entries this season (mono, 0 in `warn`) · quick actions **Reset password** / **Disable** on row hover and keyboard focus. Reset password opens a small `Dialog` (generated password, must-change, handover); Disable opens the same `DestructiveConfirm` as page 9 (title "Disable this account?", body = `DISABLE_BODY`, confirm "Disable {name}"). Row click / name link opens the account. **Add a user** → `Dialog`: Full name, Username (suggested from the name, editable), Role as `DescribedChoice` (Scouter "Enters match data", Scout lead "Fixes any entry, pick list", Admin "Everything, incl. users"; Scouter preselected), Initial password with **Generate**, "Ask them to change it at next sign-in" (on), Cancel · Add user ("Adding…"). After create the dialog becomes the handover box ("Created {name} · {username}", password large mono, today's line, **Add another** / **Done**); the new row is inserted locally (no re-fetch). Desktop only (unchanged gate).

**Injectable rpc:** `UsersPage`, `AddUserDialog` and `UserDetailPage` gain `rpc = adminRpc` props (as `ManagePage.tsx:43` does), and `useUsers` takes it; tests pass `vi.fn()` and assert `rpc(name, input)` with two arguments. **Shared with RB.15:** RB.14 owns `password.ts`; the new `generatePassword(random?)` keeps a second export `generatePasswordWith(fill: FillRandom)` with today's signature so `fields.tsx` and RB.15 keep working; the handover uses `Handover` from RB.2; `DISABLE_BODY` stays exported from `UserDetailPage.tsx` (RB.15 keeps it).

**Interfaces (Produces):**
```ts
// password.ts
export function generatePassword(random?: (n: number) => number): string;   // "<word>-<word>-<dd>", ≥ 8 chars, from a 256-word lowercase list in the file
export function suggestUsername(fullName: string, taken: Set<string>): string; // "Gal Levy" → "gal.l"; adds a digit if taken
```

- [ ] **Step 1: Failing tests** — `features/admin/password.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { passwordSchema } from '@frc/shared';
import { generatePassword, suggestUsername } from './password';

describe('generated passwords and usernames', () => {
  it('is three parts, word-word-two digits, and passes the server rule', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
      expect(passwordSchema.safeParse(p).success).toBe(true);
    }
  });
  it('is deterministic with an injected random source', () => {
    expect(generatePassword(() => 0)).toBe(generatePassword(() => 0));
  });
  it('suggests first name + first letter of the last name, unique', () => {
    expect(suggestUsername('Gal Levy', new Set())).toBe('gal.l');
    expect(suggestUsername('Gal Levy', new Set(['gal.l']))).toBe('gal.l2');
    expect(suggestUsername('Noa', new Set())).toBe('noa');
  });
});
```

and in `UsersPage.test.tsx` (rpc injected as today with `vi.fn`):

```tsx
it('filters by role chip and shows entries this season', async () => {
  renderUsers({ users: USERS_12, counts: [{ scouter_id: ID.yael, count: 52 }] });
  await userEvent.click(await screen.findByRole('button', { name: /^Leads 2/ }));
  expect(screen.getAllByRole('row')).toHaveLength(1 + 2);
  await userEvent.click(screen.getByRole('button', { name: /^All/ }));
  expect(within(screen.getByRole('row', { name: /Yael Shapira/ })).getByText('52')).toBeInTheDocument();
});
it('adds a user in a dialog and hands the password over once', async () => {
  const rpc = renderUsers({ users: USERS_12, counts: [] });
  await userEvent.click(await screen.findByRole('button', { name: 'Add a user' }));
  const dlg = screen.getByRole('dialog', { name: 'Add a user' });
  await userEvent.type(within(dlg).getByLabelText('Full name'), 'Gal Levy');
  expect(within(dlg).getByLabelText('Username')).toHaveValue('gal.l');
  await userEvent.click(within(dlg).getByRole('button', { name: 'Generate' }));
  await userEvent.click(within(dlg).getByRole('button', { name: 'Add user' }));
  expect(rpc).toHaveBeenCalledWith('createUser', expect.objectContaining({ username: 'gal.l', role: 'scouter', must_change: true }));
  expect(await within(dlg).findByText(/Created Gal Levy · gal.l/)).toBeInTheDocument();
  expect(screen.getByRole('row', { name: /Gal Levy/ })).toBeInTheDocument();
});
it('disable from the row asks first', async () => {
  renderUsers({ users: USERS_12, counts: [] });
  const row = await screen.findByRole('row', { name: /Yael Shapira/ });
  await userEvent.hover(row);
  await userEvent.click(within(row).getByRole('button', { name: 'Disable' }));
  expect(screen.getByRole('dialog', { name: 'Disable this account?' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run — fails.** `pnpm vitest run apps/client/src/features/admin/password.test.ts apps/client/src/features/admin/UsersPage.test.tsx`
- [ ] **Step 3: Implement.** Split: `UsersPage.tsx` (data + chips/search), `UsersTable.tsx`, `AddUserDialog.tsx`. Replace the old 12-character generator in `password.ts` (and its old test) with `generatePassword`.
- [ ] **Step 4: Run** `pnpm vitest run apps/client/src/features/admin` → PASS.
- [ ] **Step 5: E2E** `e2e/users.spec.ts` (admin, desktop): list → `shoot('users','desktop')`; hover a row; Add a user filled → `shoot('users-add','desktop')`; created → `shoot('users-created','desktop')`; phone → `shoot('users-gate','phone')`.
- [ ] **Step 6: Compare** against `08-users/final/*.png`.
- [ ] **Step 7: Commit** — `feat(client): Users — search, chips, entries this season, row actions, Add-a-user dialog (RB.14)`

### Task RB.15: User detail — described roles saved on pick, Generate, destructive confirm

**Design:** `09-user/final/` (incl. `user-role-steps.png`).
**Files:** `features/admin/UserDetailPage.tsx` (+ split `RoleSection.tsx` if it passes 250 lines), tests, `e2e/user.spec.ts`.

**Behaviour:** 680 px column; back "All users"; header (`Initials` 52, name, "username · created DD/MM/YYYY", "This is you"); **Role** = `DescribedChoice` that calls `setUserRole` on pick — saving: picked option "Saving…", others disabled; saved: green "Saved. {name} is now {a lead}. It applies from their next request."; refused: `ErrorLine` with the server sentence and the selection restored; own account: today's warning hint; Rename (two fields side by side, Save name, today's hint); Reset password (`Input` mono + **Generate** + Reset password + must-change; handover box after); **Disable** section (3 px `ink` left edge) with a filled-ink button → `DestructiveConfirm` (self line on own account). Disabled account: header "Disabled" tag + one box (`line-2`, 3 px `warn` edge) with **Enable account**.

- [ ] **Step 1: Failing tests** — add to `UserDetailPage.test.tsx`:

```tsx
it('saves a role on pick: Saving…, then Saved', async () => {
  let resolve!: (u: unknown) => void;
  const rpc = renderDetail({ user: YAEL, rpc: (name) => (name === 'setUserRole' ? new Promise((r) => (resolve = r)) : undefined) });
  await userEvent.click(await screen.findByRole('radio', { name: /Scout lead/ }));
  expect(screen.getByRole('radio', { name: /Scout lead/ })).toHaveTextContent('Saving…');
  expect(screen.getByRole('radio', { name: /Admin/ })).toBeDisabled();
  await act(async () => resolve({ ...YAEL, role: 'lead' }));
  expect(screen.getByText('Saved. Yael Shapira is now a lead. It applies from their next request.')).toBeInTheDocument();
  expect(rpc).toHaveBeenCalledWith('setUserRole', { user_id: YAEL.id, role: 'lead' });
});
it('a refused role change shows the server sentence and restores the role', async () => {
  renderDetail({ user: TAMAR_LAST_ADMIN, rpc: (name) => (name === 'setUserRole' ? Promise.reject(new RpcError('conflict', 'The last enabled admin must stay an admin.', 409, true)) : undefined) });
  await userEvent.click(await screen.findByRole('radio', { name: /Scouter/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The last enabled admin must stay an admin.');
  expect(screen.getByRole('radio', { name: /Admin/ })).toBeChecked();
});
```

(`RpcError(code, message, status, answered)` — verified in review.)
- [ ] **Step 2–4:** run (fails) → implement → `pnpm vitest run apps/client/src/features/admin/UserDetailPage.test.tsx` (PASS).
- [ ] **Step 5: E2E** `e2e/user.spec.ts`: account → `shoot('user','desktop')`; Disable → `shoot('user-disable','desktop')`; disabled account → `shoot('user-disabled','desktop')`.
- [ ] **Step 6: Compare** against `09-user/final/*.png` including the five role steps.
- [ ] **Step 7: Commit** — `feat(client): User detail — roles saved on pick, Generate, destructive confirm (RB.15)`

### Task RB.16: Manage — header, tabs with counts, Competitions, Teams & roster

**Design:** `07-manage/final/manage-desktop-competitions.png`, `manage-desktop-roster.png`, README.
**Files:** `features/admin/{ManagePage,CompetitionsPanel,RosterPanel}.tsx` + tests; delete `SeasonsPanel`, `EventsPanel`, `TeamsPanel` and move their still-valid tests into the new files' tests; `e2e/manage.spec.ts` (competitions + roster parts).

**Behaviour:** header "Season and event management" + "Working on **{event}** (default) · {year}" + event `Select` (when > 1 event). `Tabs` **Competitions · Teams & roster {n} · Matches {n}** (counts from the lists, loaded once at page level and passed down). **Competitions:** season chips (newest first; active = filled ink "· Active"; "+ New season" dashed) → season card (image preview `FieldImage`, "2026 — REBUILT", path mono, "Active season" or **Make 2026 active**, **Edit season** → today's form in a `Dialog`) → "Events" + "Order is display order only — every event counts equally." → event cards (name, "#n", Default badge or **Make default**, ↑ ↓ ✎) + "+ New event" card. Optimistic reorder/default in place, reverted on refusal (today's behaviour). **Teams & roster:** one field "Add a team to the roster" (`SuggestInput` over `listTeams({ q })`, debounced 200 ms; an unknown number offers "+ New team {n} — enter its name" → name field → `createTeam` then `setEventRoster`), Filter, today's note, "On this event's roster ({n})" team cards (click name = rename in place, × = remove), "In the registry, not on this roster ({n})" dashed cards with +. Every roster change sends the full list (today's API), applied optimistically. Offline: today's single page-level line; **Manage's own wording** for an offline save: "Managing seasons, events, rosters and matches needs a connection — try again when this device is online." (RB.17 owns `adminMessages.ts`; RB.16 imports `MANAGE_UNREACHABLE` from it — RB.17 adds it first in its Step 3, so RB.16 uses the literal string until the wave's full gate, then switches to the import in the fix-forward pass.)

- [ ] **Step 1: Failing tests** — `features/admin/RosterPanel.test.tsx`:

```tsx
it('adds an unknown team in one step: create, then roster', async () => {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'listTeams') return { items: [], next_cursor: null };
    if (name === 'createTeam') return { id: T_NEW, number: 9036, name: 'Cyber Owls' };
    if (name === 'setEventRoster') return { items: [...ROSTER_ROWS, { team_id: T_NEW, number: 9036, name: 'Cyber Owls' }] }; // real shape: { items: rosterRow[] } (teams.ts:110)
  });
  renderRoster({ rpc, roster: ROSTER_22 });
  await userEvent.type(screen.getByRole('combobox', { name: 'Add a team to the roster' }), '9036');
  await userEvent.click(await screen.findByRole('option', { name: /New team 9036/ }));
  await userEvent.type(screen.getByLabelText('Team name'), 'Cyber Owls{Enter}');
  expect(rpc.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['createTeam', 'setEventRoster']));
  expect(await screen.findByText('Cyber Owls')).toBeInTheDocument();
});
```

`CompetitionsPanel.test.tsx`:

```tsx
it('moves an event up in place and reverts if the server refuses', async () => {
  const rpc = vi.fn(async (name: string) => { if (name === 'reorderEvents') throw new Error('refused'); });
  renderCompetitions({ rpc, events: FIVE_EVENTS });
  let reject!: (e: Error) => void;
  rpc.mockImplementation(async (name: string) => { if (name === 'reorderEvents') return new Promise((_, r) => (reject = r)); });
  const cards = () => screen.getAllByRole('article').map((a) => a.querySelector('h3')!.textContent);
  await userEvent.click(screen.getByRole('button', { name: 'Move District #2 · Be\'er Sheva up' }));
  expect(cards()[0]).toBe("District #2 · Be'er Sheva"); // moved in place at once
  await act(async () => reject(new Error('refused')));
  await waitFor(() => expect(cards()[0]).toBe('District #1 · Haifa')); // reverted
});
```

- [ ] **Step 2–4:** run (fails) → implement → `pnpm vitest run apps/client/src/features/admin/{CompetitionsPanel,RosterPanel,ManagePage}.test.tsx` (PASS).
- [ ] **Step 5: E2E** (in `e2e/manage.spec.ts`, desktop): Competitions → `shoot('manage-competitions','desktop')`; roster → `shoot('manage-roster','desktop')`.
- [ ] **Step 6: Compare** against the two final images.
- [ ] **Step 7: Commit** — `feat(client): Manage — Competitions tab, one-field roster add, tab counts (RB.16)`

### Task RB.17: Manage — Matches grid, problem bar, and the phone matches view

**Design:** `07-manage/final/manage-desktop.png`, `manage-phone.png`, README "Phone (< 1024 px): matches only".
**Contract with RB.16 (same wave):** `ManagePage` renders the Matches tab as `<MatchesPanel rpc={rpc} eventId={eventId} roster={roster} matches={matches} onMatchesChange={setMatches} onRosterChange={setRoster} />` — the page owns the lists (so the tab counts stay right) and `MatchesPanel` reports every change through the two callbacks. RB.16 writes that line; RB.17 implements those props.

**Files:** `features/admin/{MatchesPanel,LineupGrid,ProblemBar,ManagePhone,ManageRoute}.tsx`, `features/admin/adminMessages.ts`, the `admin/manage` route line in `routes.tsx`, tests, `e2e/manage-matches.spec.ts`.

**Behaviour:** desktop Matches tab: toolbar (type `Select` driving both creates, count + **Create matches**, number + **Create match**); `ProblemBar` ("Q7 and Q10 are missing robots", "7845 is not on this event's roster" + **Add 7845 to the roster** → `setEventRoster`, hint "Type a number · Tab moves on · saved per cell"); `LineupGrid` — one row per match, six `SuggestInput` cells (roster suggestions; Enter/Tab saves the cell through `setMatchTeams` with the full slot set, per-match busy as today; empty = dashed; off-roster = warn cell "Not on roster"), ✎ and 🗑 (today's delete confirm via `DestructiveConfirm`). **Phone** (`ManageRoute` renders `ManagePhone` below 1024 px instead of `DesktopOnly`): title "Matches", event line, `Segmented` Practice/Qualification/Playoff, `Match card`s (two rows of three alliance pills, "N empty"/"off roster"), pinned **Add matches** + "Seasons, events and the roster need a computer."; tap a card → `Sheet` "Edit Q10" (six typed stations Red 1–3 beside Blue 1–3 with suggestions, type + number, **Save changes**, **Delete match**); Add matches sheet (type, "How many qualification matches?", **Create N matches**, "or one match" + number + **Create match**); delete = `DestructiveConfirm`. Admin gate unchanged. `adminMessages.ts` gains `MANAGE_UNREACHABLE` (wording in RB.16) and the Manage panels use it instead of the Users line.

- [ ] **Step 1: Failing tests** — `features/admin/LineupGrid.test.tsx`:

```tsx
it('typing a number in a cell and pressing Tab saves the full slot set and moves on', async () => {
  const rpc = vi.fn().mockResolvedValue(undefined);
  renderGrid({ rpc, matches: [Q10_PARTIAL], roster: ROSTER_22 }); // Q10: red1 5951, red2 1937, rest empty
  const red3 = screen.getByRole('combobox', { name: 'Q10 Red 3' });
  await userEvent.type(red3, '6230');
  await userEvent.tab();
  expect(rpc).toHaveBeenCalledWith('setMatchTeams', expect.objectContaining({ match_id: Q10_PARTIAL.id, slots: expect.arrayContaining([expect.objectContaining({ alliance: 'red', station: 3, team_id: T6230 })]) }));
  expect(screen.getByRole('combobox', { name: 'Q10 Blue 1' })).toHaveFocus();
});
```

`ProblemBar.test.tsx`:

```tsx
it('names matches missing robots and offers to add an off-roster team', () => {
  render(<ProblemBar matches={[Q7_ONE_EMPTY, Q8_WITH_7845, Q10_PARTIAL]} rosterIds={ROSTER_IDS} onAddToRoster={vi.fn()} />);
  expect(screen.getByText('Q7 and Q10 are missing robots')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add 7845 to the roster' })).toBeInTheDocument();
});
```

`ManageRoute.test.tsx`:

```tsx
it('a phone admin gets the matches view, not "This needs a computer"', async () => {
  setWidth(375); renderManageRoute({ role: 'admin' });
  expect(await screen.findByRole('heading', { name: 'Matches' })).toBeInTheDocument();
  expect(screen.queryByText('This needs a computer')).toBeNull();
  expect(screen.getByText('Seasons, events and the roster need a computer.')).toBeInTheDocument();
});
```

- [ ] **Step 2–4:** run (fails) → implement → `pnpm vitest run apps/client/src/features/admin` (PASS).
- [ ] **Step 5: E2E** `e2e/manage-matches.spec.ts`: desktop grid typing into Q10 → `shoot('manage','desktop')`; phone list → `shoot('manage-phone-list','phone')`; edit sheet → `shoot('manage-phone-edit','phone')`; add sheet → `shoot('manage-phone-add','phone')`.
- [ ] **Step 6: Compare** against `07-manage/final/manage-desktop.png` and `manage-phone.png`.
- [ ] **Step 7: Commit** — `feat(client): Manage — typed line-up grid, problem bar, matches on a phone (RB.17)`

---

## Wave F

### Task RB.20: Delete a season or an event (SPEC-FINAL §3.9, raised in planning)

**Why here:** §6.4 lists season and event delete, but no use case or screen exists. Runs after RB.16 (it adds to `CompetitionsPanel`), before RB.18.

**Files:**
- Create: `packages/db/supabase/migrations/<timestamp>_delete_cascade.sql`, `packages/db/test/deleteCascade.itest.ts`, `apps/server/src/core/commands/deleteCompetition.ts` + test, `apps/client/src/features/admin/DeleteCompetition.tsx` + test
- Modify: `packages/shared/src/api/context.ts` (where `createSeasonInput` lives), `packages/db/src/database.types.ts` (regenerated), `packages/shared/src/api/index.ts`, `apps/server/src/core/context.ts`, `apps/server/src/repos/store.ts`, `apps/server/src/test/fake-context.ts`, `apps/server/src/routes/registry.ts`, `apps/server/api/index.js`, `features/admin/CompetitionsPanel.tsx`

**Rules (SPEC-FINAL §3.9, §17.8):** admin only; hard, irreversible; **the active season and the active event cannot be deleted** (refuse with "Switch the active season first." / "Switch the default event first."); the confirmation **names the damage with exact counts** and the admin **types the object's name** (season: "2025", event: its name). `scouting_entries.match_id` is `on delete restrict`, which is checked immediately, so a plain `delete from events` can fail when Postgres reaches a match before its entries — the delete runs in one SQL function that removes the entries first, atomically.

**Interfaces (Produces):**
```ts
// shared
export const deleteSeasonInput = z.object({ season_id: z.string().uuid(), dry_run: z.boolean().default(false), confirm_name: z.string().optional() });
export const deleteEventInput  = z.object({ event_id: z.string().uuid(),  dry_run: z.boolean().default(false), confirm_name: z.string().optional() });
export const deleteImpactOutput = z.object({ deleted: z.boolean(), events: z.number().int(), matches: z.number().int(), entries: z.number().int(), forms: z.number().int() });
// registry: deleteSeason, deleteEvent — kind 'command', permission manage_events
// dry_run: true → counts only (deleted: false). dry_run: false → confirm_name must equal the season year / event name, else AppError('invalid', 'Type the name exactly to delete.')
```

- [ ] **Step 1: Migration** — `packages/db/supabase/migrations/<now>_delete_cascade.sql` (applied by CLI, never in the dashboard):

```sql
-- SPEC-FINAL 3.9: hard cascade deletes. Entries go first because
-- scouting_entries.match_id is ON DELETE RESTRICT (checked immediately).
create or replace function public.delete_event_cascade(p_event_id uuid) returns void
language plpgsql security invoker as $$
begin
  delete from public.scouting_entries where event_id = p_event_id;
  delete from public.events where id = p_event_id;
end $$;

create or replace function public.delete_season_cascade(p_season_id uuid) returns void
language plpgsql security invoker as $$
begin
  delete from public.scouting_entries where event_id in (select id from public.events where season_id = p_season_id);
  delete from public.seasons where id = p_season_id;
end $$;
```

- [ ] **Step 2: Integration test** `packages/db/test/deleteCascade.itest.ts` — following `entries.itest.ts`'s setup: create a season, an event, a match, an entry on that match; call `delete_event_cascade`; assert the event, match and entry rows are gone and the season remains; then `delete_season_cascade` removes the season and its forms. Apply to the **dev** project (`pnpm db:push`), regenerate the types (`pnpm --filter @frc/db db:types` — `database.types.ts` has `Functions: never` until then, so `db.rpc(...)` would not typecheck and `types-drift.itest.ts` would fail), then run `pnpm db:test test/deleteCascade.itest.ts` → PASS.
- [ ] **Step 3: Server unit test** `deleteCompetition.test.ts` with the fake context:

```ts
it('refuses the active event', async () => {
  const ctx = fakeWith({ active_event_id: EVENT });
  await expect(deleteEvent(ADMIN, { event_id: EVENT, dry_run: true }, ctx)).rejects.toThrow('Switch the default event first.');
});
it('dry run returns the damage; a wrong name refuses; the right name deletes', async () => {
  const ctx = fakeWith({ active_event_id: OTHER, events: [{ id: EVENT, name: 'District #2' }], matches: 3, entries: 17 });
  expect(await deleteEvent(ADMIN, { event_id: EVENT, dry_run: true }, ctx)).toEqual({ deleted: false, events: 1, matches: 3, entries: 17, forms: 0 });
  await expect(deleteEvent(ADMIN, { event_id: EVENT, confirm_name: 'district #2' }, ctx)).rejects.toThrow('Type the name exactly to delete.');
  expect((await deleteEvent(ADMIN, { event_id: EVENT, confirm_name: 'District #2' }, ctx)).deleted).toBe(true);
});
it('a lead may not delete', async () => {
  await expect(deleteEvent(LEAD, { event_id: EVENT, dry_run: true }, fakeWith({}))).rejects.toThrow(/admin/i);
});
```

(`fakeWith` is a 10-line helper over the real fake-context; counts come from new store methods `countDeleteImpact({ seasonId? , eventId? })`; the delete calls `db.rpc('delete_event_cascade', { p_event_id })`.)
- [ ] **Step 4: Run — fails → implement → PASS.** `pnpm --filter @frc/server build`, commit `api/index.js` with it.
- [ ] **Step 5: Client** — `DeleteCompetition.tsx`: from the season card's **Edit season** dialog and the event card's ✎ menu, a "Delete …" secondary action → `dry_run` → `DestructiveConfirm` with `typeToConfirm` = the name, body "This deletes {N} events, {M} matches and {E} entries for good. It cannot be undone. Run `supabase db dump` first if you might need them." (event: "{M} matches and {E} entries"; the dump line per SPEC-FINAL §3.9); the active season/event shows the action disabled with the refusal sentence. Test:

```tsx
it('names the damage and needs the exact name', async () => {
  const rpc = vi.fn(async (_n: string, input: { dry_run?: boolean }) =>
    input.dry_run ? { deleted: false, events: 1, matches: 3, entries: 17, forms: 0 } : { deleted: true, events: 1, matches: 3, entries: 17, forms: 0 });
  renderDelete({ rpc, event: { id: EVENT, name: 'District #2' } });
  await userEvent.click(screen.getByRole('button', { name: 'Delete District #2' }));
  expect(await screen.findByText(/3 matches and 17 entries/)).toBeInTheDocument();
  const confirm = screen.getByRole('button', { name: 'Delete District #2 for good' });
  expect(confirm).toBeDisabled();
  await userEvent.type(screen.getByLabelText(/Type District #2/), 'District #2');
  expect(confirm).toBeEnabled();
});
```

- [ ] **Step 6: Gate** (full) → PASS. **Step 7: Commit** — `feat: delete a season or an event — hard cascade, counts, type-to-confirm (RB.20)`

---

### Task RB.18: Cleanup and performance budget

**Files:** delete `components/buttonStyles.ts`, `styles/motion.css`, `styles/motion.test.ts`, `lib/motion.ts`, the re-export stubs from RB.3, `components/ConfirmDialog.tsx`; remove the legacy aliases from `theme.css` and `index.css`; create `scripts/check-bundle.mjs`; root `package.json` script `"bundle:check": "node scripts/check-bundle.mjs"`; `apps/client/vite.config.ts` (`build.manifest: true`); the manifest `theme_color` → `#161a21` and its pin in `manifest.test.ts`; `notice.tsx`'s legacy `Notice` and `native-select.tsx` once nothing imports them.

- [ ] **Step 1: Find leftovers**

Run: `grep -rnE "text-text|text-text-muted|border-border|bg-surface-raised|brand-plate|text-brand|status-(played|broke|disabled|no-show)|sync-(online|offline|syncing)|PRIMARY_BUTTON|motion-transition|state-layer|enter-rise|usePlayOnChange" apps/client/src`
Expected after this task: no output. Replace each hit with the new token/primitive (the owning page tasks are done, so these are stragglers in shared files).
- [ ] **Step 2: Write `scripts/check-bundle.mjs`** — reads `apps/client/dist/.vite/manifest.json` (enable `build.manifest: true` in `vite.config.ts`), sums the gzip size (`node:zlib` `gzipSync`) of the entry chunk and its static imports, and fails above **180 KB gzip**; prints each lazy chunk's size; also asserts every lazy chunk appears in `dist/sw.js` precache (offline still works).

```js
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = 'apps/client/dist';
const manifest = JSON.parse(readFileSync(join(dist, '.vite/manifest.json'), 'utf8'));
const entry = Object.values(manifest).find((c) => c.isEntry);
const seen = new Set();
const walk = (key) => {
  const c = manifest[key] ?? Object.values(manifest).find((m) => m.file === key);
  if (!c || seen.has(c.file)) return;
  seen.add(c.file);
  for (const i of c.imports ?? []) walk(i);
};
walk(Object.keys(manifest).find((k) => manifest[k] === entry));
const gz = (f) => gzipSync(readFileSync(join(dist, f))).length;
const initial = [...seen].reduce((s, f) => s + gz(f), 0);
console.log(`initial JS ${(initial / 1024).toFixed(1)} KB gzip`);
const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
const lazy = Object.values(manifest).filter((c) => c.isDynamicEntry);
for (const c of lazy) {
  console.log(`  lazy ${c.file} ${(gz(c.file) / 1024).toFixed(1)} KB`);
  if (!sw.includes(c.file)) { console.error(`not precached: ${c.file}`); process.exit(1); }
}
if (initial > 180 * 1024) { console.error('initial JS over 180 KB gzip'); process.exit(1); }
```

- [ ] **Step 3: Run** `pnpm build && pnpm bundle:check` → prints sizes, exits 0. If over budget, the report names the three biggest modules (`npx vite-bundle-visualizer` is not added; read the manifest) and the fix (move them behind `lazy`), not a raised budget.
- [ ] **Step 4: Full gate + full e2e** — `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check && pnpm --filter @frc/client e2e` → all PASS.
- [ ] **Step 5: Commit** — `chore(client): remove the old look, add a 180 KB initial-JS budget (RB.18)`

### Task RB.19: Whole-app visual review and docs

**Files:** `docs/ops/BUILD-CONTEXT.md` (§12.3 method: screenshots by `pnpm --filter @frc/client e2e` against the mocked API at 1440/375, plus a browser-pane check against dev seed data for flows that touch the server; §12.5 component list = `components/ui/*` of RB.2/RB.3 — accepted by the user with P4), `docs/plans/IMPLEMENTATION-PLAN.md` (execution-order note: "**RB.1 – RB.19 redesign build** (`REDESIGN-BUILD-PLAN.md`) runs before 1.24"; the visual-reference banner now points at the build), `docs/design/README.md` (page-order table: a "Coded" column = RB task), `docs/design/THEME.md` (open questions 1 and 2 closed by P1/P2), `docs/plans/DEVIATIONS.md` (one summary entry linking each task's entries).

- [ ] **Step 1: Full run** — `pnpm --filter @frc/client e2e` (all specs) → note the count, e.g. `24 passed`.
- [ ] **Step 2: Review sheet** — a subagent with no history opens every `e2e/__screens__/*.png` beside its final image and fills one table per page: element · matches? · difference · fix-owner. Mock-data differences (names, numbers, times) are not differences.
- [ ] **Step 3: Fix** every row marked "no" by re-dispatching the owning RB task's files (one commit per page: `fix(client): <page> matches its final image (RB.19)`), re-shoot, re-review until the table is all "yes".
- [ ] **Step 4: Update the docs** listed above.
- [ ] **Step 5: Show the user** the twenty-odd screenshots side by side with the finals (one image per page: left final, right app) — this is the user's visual review gate.
- [ ] **Step 6: Commit** — `docs: the redesign build is done — BUILD-CONTEXT §12, plan order, design status (RB.19)`

---

## Self-review (done while writing)

**Spec coverage** — every final README "Now" item maps to a task: Entry → RB.8; Scout → RB.9 (+ station in RB.4); Home → RB.10 (coverage in RB.4; rank/top teams deliberately not built); Login + Change password + account menu → RB.7 + RB.6; Entries → RB.11 (points deliberately not built); Switch scouter → RB.12; Manage → RB.16 + RB.17; Users → RB.14 + RB.13; User detail → RB.15; Phone shell → RB.6. THEME "Locked components" → RB.2/RB.3 primitives + page tasks. Open items not in scope and left to their own tasks: entry preview (1.52), points (1.54), rank card / top teams (1.58), outdoor switch (1.38), season/event delete → RB.20 (added at the user's request), PDF schedule import (§24).

**Type consistency** — `Station` (`'R1'…'B3'`) is defined once in `data/station.ts` and reused by `stationOf`, `StationTag`, Home and Switch scouter; `ChangeKind` is defined once in `data/changes.ts`; `useSyncStatus().byAuthor` is used by RB.6 (badge), RB.10 (tiles) and RB.12 (note).

**Known risks:** P5 needs the user's yes; fontsource package names are checked in RB.1 Step 6; the e2e mock's route prefix is checked in RB.5 Step 3; the "Notes" phase label differs from code ("Post-match") — RB.8 writes a DEVIATIONS entry.
