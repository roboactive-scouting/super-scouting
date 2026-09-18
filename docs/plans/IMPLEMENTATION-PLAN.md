# FRC Scouting Platform — Implementation Plan

**Version:** 1.1 · **Date:** 2026-09-03 · **Build input:** `docs/spec/SPEC-FINAL.md` v1.0
**Scope of this document:** phase 0 and phase 1 in full task detail; phase 2 as headings only (SPEC-FINAL §20.8).

**Goal:** build the v1 platform defined by `SPEC-FINAL.md` — an offline-first, year-agnostic FRC scouting PWA for team 2096 — up to and including the phase 1 gate.

**Architecture:** one pnpm/Turborepo monorepo holding two deployables (`apps/client`, a React + Vite PWA; `apps/server`, Hono on Vercel Functions, Node runtime) and two libraries (`packages/shared`, the browser-safe metric/sync/form engine *and* the Zod schemas both sides validate with; `packages/db`, migrations, generated types and the dev seed). All client traffic goes through the server API; the server alone holds the service-role key. The device's IndexedDB is the source of truth during an event and reconciles through an outbox plus a delta-pull protocol.

**Tech stack:** TypeScript · React 19 + Vite 6 + `vite-plugin-pwa` · Tailwind CSS v4 + shadcn/ui · Recharts · Dexie 4 · Hono 4 · `@supabase/supabase-js` · Supabase Postgres · Zod · Vitest · pnpm 9 + Turborepo · Node 22 · Vercel.

---

## How to run a build task

One task per chat. Never two.

1. **`/clear`.** Start the chat empty.
2. **Plan mode** (`Shift+Tab` twice). State exactly one task by its number and the files it may touch. Read the plan; push back if it invents scope or touches files the task does not list.
3. **Approve, then let it execute that one task.** The build chat invokes the **`executing-plans`** skill and the **`test-driven-development`** skill: the test is written first, run, seen to fail, and only then is the implementation written.
4. **Per SPEC-FINAL §20.5, a task arrives finished.** Inside a task the agent may split work across parallel subagents where the work genuinely splits, and it ends with an automated review pass before the diff is presented. All of that happens *inside* one task. It never means more than one task per chat.
5. **Review the diff.** Read every line. If it is longer than you want to read, the task was drawn wrong — say so and stop.
6. **Run the test yourself.** Copy the task's command, run it, compare against the task's stated expected output. Do not accept "it should work".
7. **Commit** with the task's commit message.
8. `/clear`, then the next task.

Every task below is one reviewable diff and ends with an independently testable deliverable.

**Branching.** Work happens on `feat/<thing>` branches cut from `develop`, merged back into `develop` (SPEC-FINAL §19.2). `develop` does not exist yet; task 0.1 creates it. **Every task begins by cutting its own branch** — the first step of each task is implicitly:

```bash
git checkout develop && git pull && git checkout -b feat/<the-task's-slug>
```

The plan does not repeat that line in every task. Do it anyway.

### Shell

**Every command in this plan is written for a POSIX shell.** This machine is Windows, so run them in **Git Bash** (the Bash tool, or `"C:\Program Files\Git\bin\bash.exe"`), never in PowerShell. Three things break under PowerShell specifically, and they are why this rule exists:

- `VAR=value pnpm …` env-var prefixes are a parse error;
- `>` redirection writes **UTF-16**, which silently corrupts the generated `database.types.ts` and breaks its drift check (task 0.13);
- `mkdir -p`, `cp`, `grep -r` and `$VAR` expansion behave differently or not at all.

**When a task cannot be verified without a live service**, the task says so explicitly and sits after the PROVISIONING GATE.

### Test counts

Tasks do **not** state a cumulative "N tests passed" figure. A plan that hard-codes running totals goes stale the first time a task adds one more case, and then the number becomes noise you learn to ignore — which is worse than no number. Instead:

- the failing-first run names the **specific file** that should fail and the **error you should see**;
- the passing run expects **every suite green**, with this task's new file among them.

If a suite that was green goes red, that is the signal. Do not proceed past it.

---

## Global constraints

Every task's requirements implicitly include this section. Values are copied verbatim from `SPEC-FINAL.md`.

- **Node 22.** pnpm 9, pinned in the root `packageManager` field. Turborepo for the task graph.
- **TypeScript everywhere**, `strict: true`, no `any` in committed code.
- **`packages/shared` is browser-safe**: no Node built-ins, no `@supabase/supabase-js`, no `process.env`. Enforced by an ESLint rule and a test (task 0.2).
- **`packages/shared` is also the single validation source for both sides** (§16.1): every use-case input and output schema lives there, and the server registry and the typed client both import them.
- **All client traffic goes through the server API** (§16.2). The client never imports `@supabase/supabase-js`.
- **No Postgres RLS, no per-row policies** (§3, §7.4). Authorization lives in the use-case layer.
- **Every use case takes `caller` as its first argument** — `useCase(caller, input, ctx)` — and authorization reads that argument and nothing else (§16.5). `login` and `refreshToken` are the only two exempt.
- **Every query use case returns bounded, paginated, pre-aggregated output** (§16.4). `syncPull` is the single exception and is bounded per page by `next_cursor`.
- **Every table carries `created_at` / `updated_at timestamptz not null default now()` and a `BEFORE UPDATE` trigger** setting `updated_at = now()` (§3.10). The delta pull depends on it absolutely.
- **All primary keys are `uuid`, generated on the client** for every entity creatable offline (§3).
- **Only `match_type = 'qualification'` feeds metric aggregates.** Not configurable, not a user filter (§3.1, §11.2).
- **A dead or no-show robot never records zeros.** `no_show` and `disabled` are excluded entirely from aggregates; `broke_down` is included (§11.3).
- **Field `key`s are permanent. Labels are not** (§5.1).
- **Semantic metadata (`description`, `unit`, `phase`, `direction`) is required on every non-`section` field and is captured at field-creation time** (§5.4). It cannot be backfilled.
- **Points are non-negative** (`check (points >= 0)`), and scores are always derived, never stored (§4.1, §18.2).
- **Colour comes only from the §17.4 CSS variable tokens.** No component hard-codes a hex. Brand yellow `#FFEA07` never appears in data ink, and never as text or an icon on a light surface — the logo always sits on a `--brand-plate` near-black plate, in both themes.
- **The `frontend-design` skill is used for craft, never for identity** (§17.9). Its **Restraint and self-critique** and **More on writing in design** sections apply in full, as does *Structure is information* and its plan-then-critique habit. Its *Ground it in the subject* section and its "describe the palette as 4–6 named hex values / the typefaces for 2+ roles" step do **not** — §17.4 and §17.6 fixed both. **No decorative animation on the data-entry path**: no page-load sequence, no scroll reveal, no ambient atmosphere. Where the skill and §17 disagree, §17 wins, and the build chat says which line disagreed rather than silently picking one.
- **Touch targets ≥ 48 × 48 px with ≥ 8 px between adjacent targets. WCAG AA: 4.5:1 for text, 3:1 for UI boundaries and chart strokes, in both themes** (§17.7).
- **`dir="auto"` on every text node that can hold Hebrew** — form labels, notes, chart axis labels, table cells (§17.1).
- **Formatting is identical on every surface** (§17.8): computed metrics and standard deviations to **2 decimal places**; integer counts and team numbers with **no decimals and no thousands separator**; percentages as **whole numbers**; dates **`DD/MM/YYYY`**; times **24-hour**; the **device's local timezone**.
- **Builder routes require a viewport ≥ 1024 px** and otherwise render one clear "this needs a computer" panel. Alliance selection and conflict review work at any width (§17.2).
- **Device baseline: Android Chrome from the last ~2 years, iOS Safari 16+** (§18.1). That is the browserslist and the Vite build target; older devices are unsupported rather than broken-for.
- **No secret value is ever written into the repository, a commit message, or a chat message** (Appendix B). Only non-secret identifiers — project refs and deployment URLs — are ever spoken aloud.
- **Every environment variable is read through one typed, validated config module per app** that fails loudly at startup naming the missing variable. Nothing anywhere else reads `process.env` or `import.meta.env`.
- **Never touch the production Supabase project** from code, CI, or a script. CI touches dev only; production is migrated by hand (§19.4).
- **Appendix A of SPEC-FINAL is out of scope.** If a task appears to want something on that list, the task is wrong.

---

## Task index

| Group | Tasks | Deliverable |
|---|---|---|
| **Phase 0 — pre-gate scaffold** | 0.1 – 0.7 | Monorepo, both app skeletons, both config modules, `.env.example` generation, ops docs. Nothing needs a live account. |
| **PROVISIONING GATE** | — | You create the accounts and set the secrets. Everything below is blocked until it passes. |
| **Phase 0 — post-gate** | 0.8 – 0.17 | Schema migrations, generated types, seed script, CI, keep-alive, both deployments. |
| **Phase 1 A — walking skeleton** | 1.1 – 1.9 | §20.3's vertical slice: hardcoded form → offline entry → sync → visible on a laptop. |
| **Phase 1 B — auth and roles** | 1.10 – 1.17 | Login, JWT, the caller contract at the edge, the typed client, permissions, offline login, user administration. |
| **Phase 1 C — seasons, events, teams, matches** | 1.18 – 1.23 | The admin management page, the active context and the game-image pipeline. **Run 1.23 first** — see below. |
| **Phase 1 D — form builder** | 1.24 – 1.32 | Field catalogue, semantic metadata, scoring editor, versioning, JSON export/import. |
| **Phase 1 E — data-entry runtime** | 1.33 – 1.38 | All field types, the sticky timer, robot status, super scouting, undo, drafts, practice mode. |
| **Phase 1 F — sync protocol** | 1.39 – 1.45 | Outbox, push, delta pull, hydration, conflicts, the review screen, the sync page. |
| **Phase 1 G — QR and wipe** | 1.46 – 1.49 | QR fallback transfer, disposal on ack, the lead-approved wipe. |
| **Phase 1 H — browse and search** | 1.50 – 1.53 | Team search, entry search, entry preview, the team page. **Run 1.54–1.56 first** — see below. |
| **Phase 1 I — basic statistics** | 1.54 – 1.59 | The shared metric engine, team stats, the fixed ranking table and value shading. |
| **Phase 1 J — admin delete** | 1.60 – 1.61 | Season / event / form cascade deletes behind the destructive pattern. |
| **Phase 1 K — smoke suite and gate** | 1.62 – 1.64 | The full CI smoke suite, `RUNBOOK.md`, the phase 1 gate rehearsal. |
| **Phase 2** | headings only | Re-planned after the phase 1 gate passes. |

### Three tasks run out of numeric order

The numbering follows SPEC-FINAL §20.2's order exactly. **Three tasks must nonetheless be executed before their numeric neighbour**, because one dependency runs backwards. It is called out again at the head of its group.

| Run this first | Before | Why |
|---|---|---|
| **1.54, 1.55, 1.56** — the metric engine | **1.50** — the browse and search queries | §13.3 requires every entry-search row to carry its **scouted points**, and §11.1 allows exactly one scoring implementation. `queryEntries` calls `scoreEntry`, which 1.54 builds. |

So the execution order is: … 1.49, **1.54, 1.55, 1.56**, 1.50, 1.51, 1.52, **1.57**, 1.53, 1.58 …

If you would rather the file read in execution order, renumber it once before the first build chat and never again — but do not renumber halfway through, because the commit messages and the branch names will stop matching.

---

# Phase 0 — Foundations

SPEC-FINAL §20.2. The gate (§20.4): both apps deployed from the repo, migrations applied to both projects, CI green on `develop`, the `/health` wiring check green, the seed script fills the dev project, and `SETUP.md` followed start-to-finish by someone reading it rather than remembering it.

Tasks 0.1 – 0.7 need no account, no secret and no network beyond the npm registry. Tasks 0.8 onward need all of them. The PROVISIONING GATE sits between.

---

## Task 0.1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.npmrc`, `tsconfig.base.json`, `.gitignore`, `.editorconfig`, `.prettierrc.json`, `.prettierignore`, `eslint.config.js`, `vitest.workspace.ts`, `.browserslistrc`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/version.ts`, `packages/shared/src/version.test.ts`

**Interfaces:**
- Produces: the workspace scripts `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; the package name `@frc/shared`, importable from every other workspace package.

- [ ] **Step 1: Cut the branches**

```bash
git checkout main && git pull && git checkout -b develop && git push -u origin develop && git checkout -b feat/monorepo-scaffold
```

- [ ] **Step 2: Write the workspace files**

`package.json` — note `"type": "module"`, which is what lets ESLint load `eslint.config.js`:

```json
{
  "name": "frc-scouting",
  "private": true,
  "type": "module",
  "version": "0.0.0",
  "packageManager": "pnpm@9.12.3",
  "engines": { "node": ">=22.0.0 <23" },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "vitest run",
    "test:watch": "vitest",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "devDependencies": {
    "@eslint/js": "^9.14.0",
    "@types/node": "^22.9.0",
    "eslint": "^9.14.0",
    "prettier": "^3.3.3",
    "turbo": "^2.2.3",
    "typescript": "^5.6.3",
    "typescript-eslint": "^8.13.0",
    "vitest": "^2.1.4"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

`turbo.json` — `globalEnv` is required: Turborepo 2 runs in strict env mode and would otherwise hide `VITE_*` from the build:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalEnv": [
    "NODE_ENV",
    "VITE_API_BASE_URL",
    "VITE_DEVICE_WIPE_CODE",
    "VITE_APP_VERSION",
    "VERCEL_GIT_COMMIT_SHA"
  ],
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".vercel/output/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint": {},
    "dev": { "cache": false, "persistent": true }
  }
}
```

`.nvmrc`:

```
22
```

`.npmrc`:

```
engine-strict=true
auto-install-peers=true
```

`.browserslistrc` — SPEC-FINAL §18.1's device baseline, in one place:

```
last 2 years and last 4 chrome versions
iOS >= 16
not dead
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`.gitignore`:

```
node_modules/
dist/
.turbo/
coverage/
.vercel/
*.tsbuildinfo
.env
.env.*
!.env.example
.DS_Store
```

`.editorconfig`:

```
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

`.prettierrc.json`:

```json
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "all"
}
```

`.prettierignore` — the spec and the plan are hand-formatted documents and are not Prettier's business:

```
docs/
pnpm-lock.yaml
packages/db/src/database.types.ts
packages/shared/src/season/manifest.ts
**/dist/
**/.turbo/
```

`eslint.config.js`:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.turbo/**', '**/node_modules/**', '**/*.gen.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      // an underscore prefix is how this codebase spells "deliberately discarded"
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
);
```

`vitest.workspace.ts` — `scripts/` is a project too, or the two build-tooling suites would never run:

```ts
export default ['packages/*', 'apps/*', { test: { name: 'scripts', include: ['scripts/**/*.test.ts'] } }];
```

- [ ] **Step 3: Write the shared package and its failing test**

`packages/shared/package.json`:

```json
{
  "name": "@frc/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc --noEmit",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src"
  },
  "devDependencies": { "typescript": "^5.6.3", "vitest": "^2.1.4" }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022", "DOM"], "noEmit": true, "types": ["node"] },
  "include": ["src"]
}
```

(`types: ["node"]` is only for the `browser-safe.test.ts` harness, which reads the source tree. The lint rule and that test together are what keep production code browser-safe.)

`packages/shared/src/version.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SHARED_PACKAGE_NAME } from './version';

describe('shared package', () => {
  it('exposes its package name', () => {
    expect(SHARED_PACKAGE_NAME).toBe('@frc/shared');
  });
});
```

- [ ] **Step 4: Run the test and watch it fail**

```bash
pnpm install && pnpm test
```

Expected: `FAIL packages/shared/src/version.test.ts` — `Failed to resolve import "./version"`.

- [ ] **Step 5: Write the implementation**

`packages/shared/src/version.ts`:

```ts
export const SHARED_PACKAGE_NAME = '@frc/shared' as const;
```

`packages/shared/src/index.ts`:

```ts
export * from './version';
```

- [ ] **Step 6: Run everything and watch it pass**

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
```

Expected: the shared suite green; turbo reports success for `typecheck` and `lint`; prettier prints `All matched files use Prettier code style!`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold the pnpm and turborepo workspace with a shared package"
```

---

## Task 0.2: Shared foundations — caller contract, error codes, formatting, browser-safety guard

**Files:**
- Create: `packages/shared/src/caller.ts`, `packages/shared/src/errors.ts`, `packages/shared/src/format.ts`
- Create: `packages/shared/src/caller.test.ts`, `packages/shared/src/errors.test.ts`, `packages/shared/src/format.test.ts`, `packages/shared/src/browser-safe.test.ts`
- Modify: `packages/shared/src/index.ts`, `eslint.config.js`

**Interfaces:**
- Produces: `type Caller`, `type Role`, `isUser`, `isService`, `assertRole`; `class AppError` with `code` and `details`, and `ERROR_CODES`; the formatters `formatMetric`, `formatCount`, `formatPercent`, `formatDate`, `formatTime`, and `NO_VALUE`. Every later task imports from here.

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AppError, ERROR_CODES } from './errors';

describe('AppError', () => {
  it('carries a code, a message and details', () => {
    const e = new AppError('not-found', 'no such team', { teamId: 't-1' });
    expect(e.code).toBe('not-found');
    expect(e.message).toBe('no such team');
    expect(e.details).toEqual({ teamId: 't-1' });
    expect(e).toBeInstanceOf(Error);
  });

  it('lists every rejection reason the push protocol can return', () => {
    for (const reason of ['parent-deleted', 'edit-window-expired', 'forbidden', 'invalid']) {
      expect(ERROR_CODES).toContain(reason);
    }
  });
});
```

`packages/shared/src/caller.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AppError } from './errors';
import { assertRole, isService, isUser, type Caller } from './caller';

const admin: Caller = { kind: 'user', userId: 'u-1', role: 'admin' };
const scouter: Caller = { kind: 'user', userId: 'u-2', role: 'scouter' };
const service: Caller = { kind: 'service', label: 'mcp' };

describe('caller', () => {
  it('recognises user and service callers', () => {
    expect(isUser(admin)).toBe(true);
    expect(isService(service)).toBe(true);
    expect(isUser(service)).toBe(false);
  });

  it('allows a role that is listed', () => {
    expect(() => assertRole(admin, ['admin'])).not.toThrow();
    expect(() => assertRole(scouter, ['scouter', 'lead', 'admin'])).not.toThrow();
  });

  it('rejects a role that is not listed, with code forbidden', () => {
    expect(() => assertRole(scouter, ['admin'])).toThrowError(AppError);
    try {
      assertRole(scouter, ['admin']);
    } catch (e) {
      expect((e as AppError).code).toBe('forbidden');
    }
  });

  it('rejects a service caller from every role-gated use case', () => {
    expect(() => assertRole(service, ['scouter', 'lead', 'admin'])).toThrowError(AppError);
  });
});
```

`packages/shared/src/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatCount, formatDate, formatMetric, formatPercent, formatTime } from './format';

describe('formatting (SPEC-FINAL 17.8)', () => {
  it('renders metrics and standard deviations to 2 decimals', () => {
    expect(formatMetric(12.3456)).toBe('12.35');
    expect(formatMetric(12)).toBe('12.00');
  });

  it('renders null as an em dash, never as zero', () => {
    expect(formatMetric(null)).toBe('—');
    expect(formatPercent(null)).toBe('—');
    expect(formatCount(null)).toBe('—');
  });

  it('renders counts and team numbers with no decimals and no separator', () => {
    expect(formatCount(2096)).toBe('2096');
    expect(formatCount(120)).toBe('120');
  });

  it('renders rates as whole-number percentages', () => {
    expect(formatPercent(0.8333)).toBe('83%');
    expect(formatPercent(1)).toBe('100%');
  });

  it('renders dates as DD/MM/YYYY and times in 24 hours', () => {
    const iso = '2026-11-14T09:31:02.000Z';
    expect(formatDate(iso, 'UTC')).toBe('14/11/2026');
    expect(formatTime(iso, 'UTC')).toBe('09:31');
  });
});
```

`packages/shared/src/browser-safe.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = import.meta.dirname;
const FORBIDDEN: RegExp[] = [
  /from 'node:/,
  /from 'fs'/,
  /from 'path'/,
  /from 'crypto'/,
  /process\.env/,
  /@supabase\/supabase-js/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!name.endsWith('.ts') || name.endsWith('.test.ts')) return [];
    return [full];
  });
}

describe('packages/shared is browser-safe (SPEC-FINAL 16.1)', () => {
  it('imports no Node built-in, reads no process.env and never touches supabase-js', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN) {
        if (pattern.test(text)) offenders.push(`${file}: ${String(pattern)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
pnpm vitest run packages/shared
```

Expected: three files fail with `Failed to resolve import` (`./errors`, `./caller`, `./format`); `browser-safe.test.ts` passes trivially because only `version.ts` exists.

- [ ] **Step 3: Write the implementations**

`packages/shared/src/errors.ts`:

```ts
export const ERROR_CODES = [
  'invalid',
  'forbidden',
  'not-found',
  'conflict',
  'parent-deleted',
  'edit-window-expired',
  'unauthenticated',
  'offline-unavailable',
  'rate-limited',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}
```

`packages/shared/src/caller.ts`:

```ts
import { AppError } from './errors';

export type Role = 'scouter' | 'lead' | 'admin';

export type Caller =
  | { kind: 'user'; userId: string; role: Role }
  | { kind: 'service'; label: string };

export function isUser(caller: Caller): caller is Extract<Caller, { kind: 'user' }> {
  return caller.kind === 'user';
}

export function isService(caller: Caller): caller is Extract<Caller, { kind: 'service' }> {
  return caller.kind === 'service';
}

/**
 * The single authorization primitive. It reads the caller argument and nothing else
 * (SPEC-FINAL 16.5). A service caller never satisfies a role requirement, which is
 * what makes every command use case read-only-hostile by construction.
 */
export function assertRole(
  caller: Caller,
  allowed: readonly Role[],
): asserts caller is Extract<Caller, { kind: 'user' }> {
  if (!isUser(caller)) {
    throw new AppError('forbidden', 'a service caller may not perform this operation');
  }
  if (!allowed.includes(caller.role)) {
    throw new AppError('forbidden', `role '${caller.role}' may not perform this operation`, {
      allowed: [...allowed],
    });
  }
}
```

`packages/shared/src/format.ts`:

```ts
export const NO_VALUE = '—';

/** Computed metrics and standard deviations: 2 decimal places (SPEC-FINAL 17.8). */
export function formatMetric(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE;
  return value.toFixed(2);
}

/** Integer counts, match numbers, team numbers: no decimals, no thousands separator. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE;
  return String(Math.round(value));
}

/** Rates: a 0–1 fraction rendered as a whole-number percentage. */
export function formatPercent(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return NO_VALUE;
  return `${Math.round(fraction * 100)}%`;
}

function parts(iso: string, timeZone: string | undefined): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
}

function part(list: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return list.find((p) => p.type === type)?.value ?? '';
}

/** DD/MM/YYYY, in the device's local zone unless a zone is given (SPEC-FINAL 17.8). */
export function formatDate(iso: string, timeZone?: string): string {
  const p = parts(iso, timeZone);
  return `${part(p, 'day')}/${part(p, 'month')}/${part(p, 'year')}`;
}

/** 24-hour HH:MM, in the device's local zone unless a zone is given. */
export function formatTime(iso: string, timeZone?: string): string {
  const p = parts(iso, timeZone);
  return `${part(p, 'hour')}:${part(p, 'minute')}`;
}
```

`packages/shared/src/index.ts` (replace the whole file):

```ts
export * from './caller';
export * from './errors';
export * from './format';
export * from './version';
```

- [ ] **Step 4: Add the matching ESLint guard**

Insert this object into `eslint.config.js` as the final argument to `tseslint.config(...)`:

```js
  {
    files: ['packages/shared/src/**/*.ts'],
    ignores: ['packages/shared/src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['fs', 'path', 'crypto', 'os', 'child_process'],
          patterns: [
            {
              group: ['node:*'],
              message: 'packages/shared must stay browser-safe (SPEC-FINAL 16.1)',
            },
            {
              group: ['@supabase/supabase-js'],
              message: 'no service-role client in shared code (SPEC-FINAL 16.1)',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'packages/shared reads no environment variables' },
      ],
    },
  },
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
pnpm vitest run packages/shared && pnpm lint && pnpm typecheck
```

Expected: every suite green, with the new file(s) from this task among them; lint and typecheck both clean.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(shared): add the caller contract, error codes and the formatting rules"
```

---
## Task 0.3: Server skeleton — typed config module, Hono app, `/health`

**Files:**
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/vitest.config.ts`, `apps/server/vercel.json`
- Create: `apps/server/src/config.ts`, `apps/server/src/config.test.ts`
- Create: `apps/server/src/db/client.ts`, `apps/server/src/db/ping.ts`
- Create: `apps/server/src/app.ts`, `apps/server/src/app.test.ts`
- Create: `apps/server/src/dev-server.ts`, `apps/server/src/composition.ts`, `apps/server/api/index.ts`

**Interfaces:**
- Consumes: `@frc/shared`.
- Produces: `loadServerConfig(env): ServerConfig` — the **only** place `process.env` is read on the server; `createApp(deps: AppDeps): Hono` where `AppDeps = { config; pingDatabase; routes?: Hono[] }`; `getServiceClient(config)`; the route `GET /health`.

**`AppDeps.routes` exists from the start on purpose.** Tasks 1.3 and 1.12 mount the sync routes and the use-case registry by passing them in this array. If it were added later, every existing `createApp` call — and every test that makes one — would break on the day it changed.

**Note:** the real `pingDatabase` reads `app_settings`, which does not exist until task 0.8. This task's tests inject a stub, so it passes with no database. `/health` is verified against a live deployment in task 0.17.

- [ ] **Step 1: Write the package files**

`apps/server/package.json`:

```json
{
  "name": "@frc/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/dev-server.ts",
    "build": "tsc --noEmit",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src api"
  },
  "dependencies": {
    "@frc/shared": "workspace:*",
    "@hono/node-server": "^1.13.7",
    "@supabase/supabase-js": "^2.46.1",
    "hono": "^4.6.9",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.9.0",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

`apps/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022"], "types": ["node"], "noEmit": true },
  "include": ["src", "api"]
}
```

`apps/server/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

`apps/server/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": { "api/index.ts": { "runtime": "nodejs22.x" } },
  "rewrites": [{ "source": "/(.*)", "destination": "/api/index" }]
}
```

- [ ] **Step 2: Install, then write the failing tests**

```bash
pnpm install
```

`apps/server/src/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadServerConfig } from './config';

const complete = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  AUTH_JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
  ALLOWED_ORIGIN: 'http://localhost:5173',
  NODE_ENV: 'development',
};

describe('loadServerConfig', () => {
  it('parses a complete environment', () => {
    const config = loadServerConfig(complete);
    expect(config.supabaseUrl).toBe('https://example.supabase.co');
    expect(config.allowedOrigin).toBe('http://localhost:5173');
    expect(config.isProduction).toBe(false);
  });

  it('applies the documented defaults for the two token settings', () => {
    const config = loadServerConfig(complete);
    expect(config.tokenTtlDays).toBe(30);
    expect(config.tokenRefreshAfterDays).toBe(7);
  });

  it('fails loudly and names every missing variable', () => {
    expect(() => loadServerConfig({ NODE_ENV: 'development' })).toThrowError(
      /SUPABASE_URL[\s\S]*SUPABASE_SERVICE_ROLE_KEY[\s\S]*AUTH_JWT_SECRET[\s\S]*ALLOWED_ORIGIN/,
    );
  });

  it('names the offending variable when a value is present but wrong', () => {
    expect(() => loadServerConfig({ ...complete, AUTH_TOKEN_TTL_DAYS: 'thirty' })).toThrowError(
      /AUTH_TOKEN_TTL_DAYS/,
    );
  });

  it('never returns a silently undefined value', () => {
    const config = loadServerConfig(complete);
    for (const [key, value] of Object.entries(config)) {
      expect(value, `config.${key}`).toBeDefined();
    }
  });
});
```

`apps/server/src/app.test.ts`:

```ts
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { loadServerConfig } from './config';

const config = loadServerConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  AUTH_JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
  ALLOWED_ORIGIN: 'https://client.example.com',
  NODE_ENV: 'development',
});

const app = (over: Partial<Parameters<typeof createApp>[0]> = {}) =>
  createApp({ config, pingDatabase: async () => undefined, ...over });

describe('GET /health', () => {
  it('returns ok when the database read succeeds', async () => {
    const res = await app().request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('returns 503 and names the failure when the database read fails', async () => {
    const res = await app({
      pingDatabase: async () => {
        throw new Error('relation "app_settings" does not exist');
      },
    }).request('/health');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 'error', database: 'error' });
  });
});

describe('CORS', () => {
  it('allows exactly the configured client origin', async () => {
    const res = await app().request('/health', { headers: { Origin: 'https://client.example.com' } });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://client.example.com');
  });

  it('does not allow another origin', async () => {
    const res = await app().request('/health', { headers: { Origin: 'https://evil.example.com' } });
    expect(res.headers.get('access-control-allow-origin')).not.toBe('https://evil.example.com');
  });
});

describe('mounted routes', () => {
  it('mounts everything passed in deps.routes', async () => {
    const extra = new Hono();
    extra.get('/extra', (c) => c.json({ ok: true }));
    const res = await app({ routes: [extra] }).request('/extra');
    expect(res.status).toBe(200);
  });
});

describe('unknown routes', () => {
  it('returns a JSON 404, never HTML', async () => {
    const res = await app().request('/nope');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
```

- [ ] **Step 3: Run the tests and watch them fail**

```bash
pnpm --filter @frc/server exec vitest run
```

Expected: both files fail — `Failed to resolve import "./config"`.

- [ ] **Step 4: Write the implementation**

`apps/server/src/config.ts`:

```ts
import { z } from 'zod';

/**
 * The one place the server reads its environment (SPEC-FINAL Appendix B).
 * Nothing else in apps/server may touch process.env.
 */
const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  AUTH_JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  AUTH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  AUTH_TOKEN_REFRESH_AFTER_DAYS: z.coerce.number().int().positive().default(7),
  ALLOWED_ORIGIN: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type ServerConfig = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  authJwtSecret: string;
  tokenTtlDays: number;
  tokenRefreshAfterDays: number;
  allowedOrigin: string;
  nodeEnv: 'development' | 'production' | 'test';
  isProduction: boolean;
};

export function loadServerConfig(env: Record<string, string | undefined>): ServerConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(
      `Server environment is not usable. Fix these variables (see docs/ops/ENVIRONMENT.md):\n${lines.join('\n')}`,
    );
  }
  const v = parsed.data;
  return {
    supabaseUrl: v.SUPABASE_URL,
    supabaseServiceRoleKey: v.SUPABASE_SERVICE_ROLE_KEY,
    authJwtSecret: v.AUTH_JWT_SECRET,
    tokenTtlDays: v.AUTH_TOKEN_TTL_DAYS,
    tokenRefreshAfterDays: v.AUTH_TOKEN_REFRESH_AFTER_DAYS,
    allowedOrigin: v.ALLOWED_ORIGIN,
    nodeEnv: v.NODE_ENV,
    isProduction: v.NODE_ENV === 'production',
  };
}

let cached: ServerConfig | null = null;

/** Loaded once per function instance; throws at first use if the environment is wrong. */
export function serverConfig(): ServerConfig {
  cached ??= loadServerConfig(process.env);
  return cached;
}
```

`apps/server/src/db/client.ts` — untyped for now; task 0.13 replaces it with the generated-type version:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ServerConfig } from '../config';

let cached: SupabaseClient | null = null;

/** The service-role client. Server-side only; never reachable from a client bundle. */
export function getServiceClient(config: ServerConfig): SupabaseClient {
  cached ??= createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
```

`apps/server/src/db/ping.ts`:

```ts
import type { ServerConfig } from '../config';
import { getServiceClient } from './client';

/**
 * One trivial database read (SPEC-FINAL 19.6). This is what counts as activity
 * against the Supabase free-tier idle pause.
 */
export function makePingDatabase(config: ServerConfig): () => Promise<void> {
  return async () => {
    const { error } = await getServiceClient(config).from('app_settings').select('id').limit(1);
    if (error) throw new Error(error.message);
  };
}
```

`apps/server/src/app.ts`:

```ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ServerConfig } from './config';

export type AppDeps = {
  config: ServerConfig;
  pingDatabase: () => Promise<void>;
  /** Sub-apps mounted at the root. Tasks 1.3 and 1.12 fill this. */
  routes?: Hono[];
};

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: deps.config.allowedOrigin,
      allowHeaders: ['Content-Type', 'Authorization'],
      exposeHeaders: ['X-Refreshed-Token'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      maxAge: 86400,
    }),
  );

  app.get('/health', async (c) => {
    try {
      await deps.pingDatabase();
      return c.json({ status: 'ok', database: 'ok', time: new Date().toISOString() });
    } catch (e) {
      return c.json(
        { status: 'error', database: 'error', message: e instanceof Error ? e.message : 'unknown' },
        503,
      );
    }
  });

  for (const route of deps.routes ?? []) app.route('/', route);

  app.notFound((c) => c.json({ error: { code: 'not-found', message: 'no such route' } }, 404));

  return app;
}
```

`apps/server/src/composition.ts` — the one place the real application is assembled. Tasks 1.3, 1.4 and 1.12 extend **this function only**, so neither entry point changes again:

```ts
import type { Hono } from 'hono';
import { createApp } from './app';
import { serverConfig } from './config';
import { makePingDatabase } from './db/ping';

/** Builds the production application from the real environment. */
export function buildApp(): Hono {
  const config = serverConfig();
  return createApp({ config, pingDatabase: makePingDatabase(config), routes: [] });
}
```

`apps/server/api/index.ts`:

```ts
import { handle } from 'hono/vercel';
import { buildApp } from '../src/composition';

export const config = { runtime: 'nodejs' };

const app = buildApp();

export const GET = handle(app);
export const POST = handle(app);
export const OPTIONS = handle(app);
```

`apps/server/src/dev-server.ts`:

```ts
import { serve } from '@hono/node-server';
import { buildApp } from './composition';

serve({ fetch: buildApp().fetch, port: 3000 }, (info) => {
  // eslint-disable-next-line no-console
  console.warn(`server listening on http://localhost:${info.port}`);
});
```


- [ ] **Step 5: Run the tests and watch them pass**

```bash
pnpm --filter @frc/server exec vitest run && pnpm typecheck
```

Expected: every suite green, with the new file(s) from this task among them; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(server): add the typed config module, the Hono app and the /health route"
```

---

## Task 0.4: Client skeleton — Vite, React, Tailwind v4, shadcn/ui, theme tokens, typed config

**Files:**
- Create: `apps/client/package.json`, `apps/client/tsconfig.json`, `apps/client/tsconfig.app.json`, `apps/client/tsconfig.node.json`, `apps/client/vite.config.ts`, `apps/client/index.html`, `apps/client/vitest.config.ts`, `apps/client/components.json`, `apps/client/src/test/setup.ts`
- Create: `apps/client/src/main.tsx`, `apps/client/src/App.tsx`, `apps/client/src/styles/tokens.css`, `apps/client/src/styles/index.css`, `apps/client/src/lib/utils.ts`
- Create: `apps/client/src/config.ts`, `apps/client/src/config.test.ts`, `apps/client/src/styles/tokens.test.ts`

**Interfaces:**
- Consumes: `@frc/shared`.
- Produces: `loadClientConfig(env): ClientConfig` — the only place `import.meta.env` is read; the complete §17.4 token set on `:root` (dark) and `[data-theme='outdoor']`; `cn()` and a configured shadcn/ui install so later tasks can `pnpm dlx shadcn@latest add <component>` instead of hand-rolling primitives.

- [ ] **Step 1: Write the package files**

`apps/client/package.json`:

```json
{
  "name": "@frc/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b --force",
    "lint": "eslint src"
  },
  "dependencies": {
    "@frc/shared": "workspace:*",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.454.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwind-merge": "^2.5.4",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^22.9.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.3",
    "fake-indexeddb": "^6.0.0",
    "jsdom": "^25.0.1",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.3",
    "vite": "^6.0.1",
    "vitest": "^2.1.4"
  }
}
```

`apps/client/tsconfig.json` — a solution file, so the browser code and the build tooling get different `lib`/`types`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

`apps/client/tsconfig.app.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client", "vite-plugin-pwa/client", "node"],
    "noEmit": true,
    "composite": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

`apps/client/tsconfig.node.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022"], "types": ["node"], "noEmit": true, "composite": true },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

`apps/client/vite.config.ts`:

```ts
import { execSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

function gitShortSha(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // SPEC-FINAL 18.1: Android Chrome from the last ~2 years, iOS Safari 16+.
  build: { target: ['chrome111', 'safari16'] },
  define: {
    // VITE_APP_VERSION is injected at build time, never typed by hand (ENVIRONMENT.md §1).
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(
      process.env.VITE_APP_VERSION ??
        process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
        gitShortSha(),
    ),
  },
  server: { port: 5173 },
}));
```

`apps/client/index.html`:

```html
<!doctype html>
<html lang="en" dir="ltr" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0A0A0B" />
    <title>ROBACTIVE Scouting</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/client/vitest.config.ts`:

```ts
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

`apps/client/src/test/setup.ts`:

```ts
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
```

`apps/client/components.json` — the shadcn/ui manifest, so later tasks add primitives with the CLI instead of hand-rolling them:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": { "config": "", "css": "src/styles/index.css", "baseColor": "zinc", "cssVariables": true },
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui" }
}
```

`apps/client/src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Install, then write the failing tests**

```bash
pnpm install
```

`apps/client/src/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadClientConfig } from './config';

const complete = {
  VITE_API_BASE_URL: 'https://api.example.com',
  VITE_DEVICE_WIPE_CODE: '2096',
  VITE_APP_VERSION: 'abc1234',
};

describe('loadClientConfig', () => {
  it('parses a complete environment', () => {
    const config = loadClientConfig(complete);
    expect(config.apiBaseUrl).toBe('https://api.example.com');
    expect(config.deviceWipeCode).toBe('2096');
    expect(config.appVersion).toBe('abc1234');
  });

  it('strips a trailing slash from the API base URL', () => {
    expect(
      loadClientConfig({ ...complete, VITE_API_BASE_URL: 'https://api.example.com/' }).apiBaseUrl,
    ).toBe('https://api.example.com');
  });

  it('fails loudly and names every missing variable', () => {
    expect(() => loadClientConfig({})).toThrowError(/VITE_API_BASE_URL[\s\S]*VITE_DEVICE_WIPE_CODE/);
  });

  it('defaults the version to "unknown" rather than undefined', () => {
    const config = loadClientConfig({
      VITE_API_BASE_URL: 'https://api.example.com',
      VITE_DEVICE_WIPE_CODE: '2096',
    });
    expect(config.appVersion).toBe('unknown');
  });
});
```

`apps/client/src/styles/tokens.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');
const outdoorAt = css.indexOf("[data-theme='outdoor']");

const TOKENS = [
  '--bg', '--surface', '--surface-raised', '--border', '--text', '--text-muted',
  '--brand', '--brand-plate', '--on-brand', '--focus',
];

describe('theme tokens (SPEC-FINAL 17.4)', () => {
  it('defines every token in the dark default theme', () => {
    const dark = css.slice(css.indexOf(':root'), outdoorAt);
    for (const token of TOKENS) expect(dark, token).toContain(`${token}:`);
  });

  it('redefines every token in the outdoor high-contrast theme', () => {
    const outdoor = css.slice(outdoorAt);
    for (const token of TOKENS) expect(outdoor, token).toContain(`${token}:`);
  });

  it('uses the exact spec values for the dark defaults', () => {
    expect(css).toContain('--bg: #0A0A0B');
    expect(css).toContain('--brand: #FFEA07');
    expect(css).toContain('--brand-plate: #0A0A0B');
  });

  it('keeps the brand plate near-black in the outdoor theme too', () => {
    const outdoor = css.slice(outdoorAt);
    expect(outdoor).toContain('--brand-plate: #0A0A0B');
    expect(outdoor).toContain('--focus: #09090B');
  });

  it('defines the functional status colours separately from the brand', () => {
    for (const token of [
      '--status-played', '--status-broke-down', '--status-disabled', '--status-no-show',
      '--danger', '--warning', '--sync-offline', '--sync-syncing', '--sync-online',
    ]) {
      expect(css, token).toContain(`${token}:`);
    }
  });

  it('never puts brand yellow anywhere in the shading ramp, in EITHER theme', () => {
    const ramp = ['--shade-worst', '--shade-mid', '--shade-best'];
    for (const theme of [css.slice(0, outdoorAt), css.slice(outdoorAt)]) {
      for (const token of ramp) {
        expect(theme, token).toContain(`${token}:`);
        const value = theme.slice(theme.indexOf(`${token}:`), theme.indexOf(`${token}:`) + 24);
        expect(value.toUpperCase(), token).not.toContain('FFEA07');
      }
    }
  });
});
```

- [ ] **Step 3: Run the tests and watch them fail**

```bash
pnpm --filter @frc/client exec vitest run
```

Expected: `Failed to resolve import "./config"` and `ENOENT ... tokens.css`.

- [ ] **Step 4: Write the implementation**

`apps/client/src/config.ts`:

```ts
import { z } from 'zod';

/**
 * The one place the client reads its environment (SPEC-FINAL Appendix B.1).
 * The client holds no Supabase credentials at all, not even the anon key.
 */
const schema = z.object({
  VITE_API_BASE_URL: z.string().url(),
  VITE_DEVICE_WIPE_CODE: z.string().min(1),
  VITE_APP_VERSION: z.string().min(1).default('unknown'),
});

export type ClientConfig = {
  apiBaseUrl: string;
  /** Not a secret: it ships in the bundle and is an accident guard (SPEC-FINAL 9.9). */
  deviceWipeCode: string;
  appVersion: string;
};

export function loadClientConfig(env: Record<string, string | undefined>): ClientConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(
      `Client environment is not usable. Fix these variables (see docs/ops/ENVIRONMENT.md):\n${lines.join('\n')}`,
    );
  }
  return {
    apiBaseUrl: parsed.data.VITE_API_BASE_URL.replace(/\/+$/, ''),
    deviceWipeCode: parsed.data.VITE_DEVICE_WIPE_CODE,
    appVersion: parsed.data.VITE_APP_VERSION,
  };
}

let cached: ClientConfig | null = null;

export function clientConfig(): ClientConfig {
  cached ??= loadClientConfig(import.meta.env as unknown as Record<string, string | undefined>);
  return cached;
}
```

`apps/client/src/styles/tokens.css` — **hex digits uppercase**, exactly as the test asserts:

```css
/* SPEC-FINAL 17.4. Components never hard-code a hex; they read these tokens. */
:root,
[data-theme='dark'] {
  --bg: #0A0A0B;
  --surface: #18181B;
  --surface-raised: #27272A;
  --border: #71717A;
  --text: #FAFAFA;
  --text-muted: #A1A1AA;
  --brand: #FFEA07;
  --brand-plate: #0A0A0B;
  --on-brand: #0A0A0B;
  --focus: #FFEA07;

  --status-played: #22C55E;
  --status-broke-down: #F97316;
  --status-disabled: #C2410C;
  --status-no-show: #71717A;
  --danger: #EF4444;
  --warning: #F97316;
  --sync-offline: #EF4444;
  --sync-syncing: #F97316;
  --sync-online: #22C55E;

  --shade-worst: #B91C1C;
  --shade-mid: #8A8060;
  --shade-best: #15803D;

  --text-scale: 1;
}

[data-theme='outdoor'] {
  --bg: #FFFFFF;
  --surface: #F4F4F5;
  --surface-raised: #E4E4E7;
  --border: #52525B;
  --text: #09090B;
  --text-muted: #3F3F46;
  --brand: #FFEA07; /* only ever on --brand-plate */
  --brand-plate: #0A0A0B;
  --on-brand: #0A0A0B;
  --focus: #09090B;

  --status-played: #15803D;
  --status-broke-down: #C2410C;
  --status-disabled: #9A3412;
  --status-no-show: #52525B;
  --danger: #B91C1C;
  --warning: #C2410C;
  --sync-offline: #B91C1C;
  --sync-syncing: #C2410C;
  --sync-online: #15803D;

  --shade-worst: #B91C1C;
  --shade-mid: #7C7455;
  --shade-best: #15803D;
}
```

`apps/client/src/styles/index.css`:

```css
@import 'tailwindcss';
@import './tokens.css';

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-border: var(--border);
  --color-text: var(--text);
  --color-text-muted: var(--text-muted);
  --color-brand: var(--brand);
  --color-danger: var(--danger);
  --color-warning: var(--warning);
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-hebrew: 'Noto Sans Hebrew', 'Inter', system-ui, sans-serif;
}

html {
  font-size: calc(100% * var(--text-scale));
  color-scheme: dark;
}

[data-theme='outdoor'] {
  color-scheme: light;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  -webkit-text-size-adjust: 100%;
}

:where(button, a, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

/* SPEC-FINAL 17.7: the accessibility floor, applied to every tappable control. */
.tap-target {
  min-inline-size: 48px;
  min-block-size: 48px;
}

.tap-row > * + * {
  margin-inline-start: 8px;
}

/* SPEC-FINAL 17.4: brand yellow is legible only on a near-black plate. */
.brand-plate {
  background: var(--brand-plate);
  color: var(--brand);
}
```

`apps/client/src/App.tsx`:

```tsx
import { clientConfig } from '@/config';

export function App() {
  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold">ROBACTIVE Scouting</h1>
      <p className="text-[var(--text-muted)]">version {clientConfig().appVersion}</p>
    </main>
  );
}
```

`apps/client/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import '@/styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
pnpm --filter @frc/client exec vitest run && pnpm typecheck
```

Expected: every suite green, with the new file(s) from this task among them; typecheck clean.

- [ ] **Step 6: Verify the build**

```bash
VITE_API_BASE_URL=https://api.example.com VITE_DEVICE_WIPE_CODE=2096 pnpm --filter @frc/client build
```

Expected: `vite build` prints `dist/index.html` and a `dist/assets/*.js` bundle, with no errors.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(client): scaffold the Vite PWA shell with the theme tokens and typed config"
```

---

## Task 0.5: PWA identity — manifest, icons, logo, service worker, self-hosted fonts

**Files:**
- Create: `apps/client/public/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon-180.png`, `apps/client/public/brand/logo.png`, `apps/client/public/brand/mark.png` (copied from `docs/brand/`)
- Modify: `apps/client/vite.config.ts`, `apps/client/index.html`, `apps/client/package.json`, `apps/client/src/styles/index.css`
- Create: `apps/client/src/pwa.ts`, `apps/client/src/pwa.test.ts`, `apps/client/src/manifest.test.ts`, `apps/client/src/components/Logo.tsx`, `apps/client/src/components/Logo.test.tsx`

**Interfaces:**
- Produces: `registerServiceWorker(onUpdateReady, adapter)` — registers with **no auto-reload**; the update activates on the next cold start (SPEC-FINAL §9.1); `<Logo />` — the lockup on its near-black plate, in both themes (§17.4, §17.5).

- [ ] **Step 1: Copy the brand assets**

```bash
mkdir -p apps/client/public/icons apps/client/public/brand
cp docs/brand/icon-192.png docs/brand/icon-512.png docs/brand/icon-512-maskable.png docs/brand/apple-touch-icon-180.png apps/client/public/icons/
cp docs/brand/logo.png docs/brand/mark.png apps/client/public/brand/
```

- [ ] **Step 2: Write the failing tests**

`apps/client/src/manifest.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const viteConfig = readFileSync(join(root, 'vite.config.ts'), 'utf8');

describe('PWA install identity (SPEC-FINAL 17.8)', () => {
  it('uses the exact manifest name and short name', () => {
    expect(viteConfig).toContain("name: 'ROBACTIVE Scouting'");
    expect(viteConfig).toContain("short_name: 'Scouting'");
  });

  it('is standalone, near-black, and orientation-unlocked', () => {
    expect(viteConfig).toContain("display: 'standalone'");
    expect(viteConfig).toContain("theme_color: '#0A0A0B'");
    expect(viteConfig).toContain("background_color: '#0A0A0B'");
    expect(viteConfig).toContain("orientation: 'any'");
  });

  it('ships the trefoil mark at 192, 512, maskable 512 and an Apple touch icon', () => {
    for (const file of [
      'icons/icon-192.png', 'icons/icon-512.png',
      'icons/icon-512-maskable.png', 'icons/apple-touch-icon-180.png',
    ]) {
      expect(existsSync(join(root, 'public', file)), file).toBe(true);
    }
    expect(viteConfig).toContain("purpose: 'maskable'");
  });

  it('ships the logo lockup and the mark as static assets', () => {
    expect(existsSync(join(root, 'public/brand/logo.png'))).toBe(true);
    expect(existsSync(join(root, 'public/brand/mark.png'))).toBe(true);
  });

  it('precaches the app shell, the fonts and the season game images', () => {
    expect(viteConfig).toContain('globPatterns');
    expect(viteConfig).toContain('woff2');
    expect(viteConfig).toContain('webp');
  });
});
```

`apps/client/src/pwa.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from './pwa';

describe('service worker registration (SPEC-FINAL 9.1)', () => {
  it('never reloads the tab; it only reports that an update is ready', async () => {
    const onUpdateReady = vi.fn();
    const reload = vi.fn();
    await registerServiceWorker(onUpdateReady, {
      register: (onNeedRefresh) => {
        onNeedRefresh();
        return Promise.resolve();
      },
      reload,
    });
    expect(onUpdateReady).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('stays silent when no update is waiting', async () => {
    const onUpdateReady = vi.fn();
    await registerServiceWorker(onUpdateReady, { register: () => Promise.resolve(), reload: vi.fn() });
    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  it('reports an update that arrives later, not only one present at registration', async () => {
    const onUpdateReady = vi.fn();
    let notify = (): void => undefined;
    await registerServiceWorker(onUpdateReady, {
      register: (onNeedRefresh) => {
        notify = onNeedRefresh;
        return Promise.resolve();
      },
      reload: vi.fn(),
    });
    expect(onUpdateReady).not.toHaveBeenCalled();
    notify();
    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });
});
```

`apps/client/src/components/Logo.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from './Logo';

describe('Logo (SPEC-FINAL 17.4, 17.5)', () => {
  it('renders the lockup on a near-black plate', () => {
    render(<Logo />);
    const img = screen.getByRole('img', { name: /robactive/i });
    expect(img).toHaveAttribute('src', '/brand/logo.png');
    expect(img.parentElement!.className).toContain('brand-plate');
  });

  it('renders the mark alone when asked, for tight spaces', () => {
    render(<Logo variant="mark" />);
    expect(screen.getByRole('img', { name: /robactive/i })).toHaveAttribute('src', '/brand/mark.png');
  });
});
```

- [ ] **Step 3: Run and watch fail**

```bash
pnpm --filter @frc/client exec vitest run src/pwa.test.ts src/manifest.test.ts src/components/Logo.test.tsx
```

Expected: `manifest.test.ts` fails on `name: 'ROBACTIVE Scouting'`; the other two fail to resolve their imports.

- [ ] **Step 4: Implement**

Add to `apps/client/package.json` dependencies: `"@fontsource-variable/inter": "^5.1.0"`, `"@fontsource/noto-sans-hebrew": "^5.1.0"`; devDependencies: `"vite-plugin-pwa": "^0.21.0"`.

`apps/client/vite.config.ts` — add `import { VitePWA } from 'vite-plugin-pwa';` and this entry to `plugins`:

```ts
    VitePWA({
      registerType: 'prompt', // never auto-reload; activate on the next cold start
      injectRegister: null,
      manifest: {
        name: 'ROBACTIVE Scouting',
        short_name: 'Scouting',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0A0A0B',
        background_color: '#0A0A0B',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,webp,png,svg}'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
```

`apps/client/index.html` — add inside `<head>`:

```html
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />
    <link rel="icon" href="/icons/icon-192.png" />
```

`apps/client/src/styles/index.css` — add at the very top, above the Tailwind import:

```css
@import '@fontsource-variable/inter/index.css';
@import '@fontsource/noto-sans-hebrew/400.css';
@import '@fontsource/noto-sans-hebrew/600.css';
```

`apps/client/src/pwa.ts`:

```ts
export type PwaAdapter = {
  /** Registers, and calls back if and when an update becomes available. */
  register: (onNeedRefresh: () => void) => Promise<void>;
  reload: () => void;
};

/**
 * SPEC-FINAL 9.1: a new version is never applied by auto-reload. A service worker
 * that reloads the tab mid-match would destroy a scouter's screen at the one moment
 * it matters. We surface a discreet hint; the update activates on the next cold start.
 */
export async function registerServiceWorker(
  onUpdateReady: () => void,
  adapter: PwaAdapter,
): Promise<void> {
  await adapter.register(onUpdateReady);
}

export function browserAdapter(): PwaAdapter {
  return {
    register: async (onNeedRefresh) => {
      if (!('serviceWorker' in navigator)) return;
      const { registerSW } = await import('virtual:pwa-register');
      registerSW({ immediate: true, onNeedRefresh });
    },
    reload: () => window.location.reload(),
  };
}
```

`apps/client/src/components/Logo.tsx`:

```tsx
import { cn } from '@/lib/utils';

/**
 * SPEC-FINAL 17.4: brand yellow is 1.23:1 on white and 16:1 on near-black, so the
 * logo always sits on a --brand-plate plate, INCLUDING in the outdoor theme.
 */
export function Logo({
  variant = 'lockup',
  className,
}: {
  variant?: 'lockup' | 'mark';
  className?: string;
}) {
  return (
    <span className={cn('brand-plate inline-flex items-center rounded-md p-2', className)}>
      <img
        src={variant === 'mark' ? '/brand/mark.png' : '/brand/logo.png'}
        alt="ROBACTIVE 2096"
        className={variant === 'mark' ? 'h-8 w-8' : 'h-8 w-auto'}
      />
    </span>
  );
}
```

- [ ] **Step 5: Run and watch pass**

```bash
pnpm install && pnpm --filter @frc/client exec vitest run && VITE_API_BASE_URL=https://api.example.com VITE_DEVICE_WIPE_CODE=2096 pnpm --filter @frc/client build
```

Expected: every suite green, with the new file(s) from this task among them; the build prints `PWA v0.21.x` and lists `dist/sw.js` and `dist/manifest.webmanifest` among the emitted files.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(client): add the PWA manifest, brand assets, self-hosted fonts and a no-auto-reload service worker"
```

---
## Task 0.6: Generate both `.env.example` files from `docs/ops/ENVIRONMENT.md`

**Files:**
- Create: `scripts/gen-env-example.mjs`, `scripts/gen-env-example.test.ts`
- Create (generated, committed): `apps/client/.env.example`, `apps/server/.env.example`
- Modify: root `package.json` (add `"env:example": "node scripts/gen-env-example.mjs"` and `"env:example:check": "node scripts/gen-env-example.mjs --check"`)

**Interfaces:**
- Produces: two committed files holding **names and placeholders only**; a `--check` mode that fails when the worksheet and the generated files have drifted. CI runs the check (task 0.15).

**Contract:** the generator reads the tables in `docs/ops/ENVIRONMENT.md` §1 (client) and §2 (server). It emits the variable name, the "What it is" text and the "Where you get it" text as comments, then `NAME=` with an empty placeholder. **It never emits a value from the worksheet's value columns**, so a worksheet accidentally filled in with a real value can never leak into the repo.

**Path note:** every script in this repo resolves paths with `fileURLToPath`, never `new URL(...).pathname`. The repository path contains spaces and Hebrew characters and lives on a Windows drive; `.pathname` percent-encodes both and prefixes a drive letter with a slash, and every `readFileSync` on the result fails.

- [ ] **Step 1: Write the failing test**

`scripts/gen-env-example.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseWorksheet, renderEnvExample } from './gen-env-example.mjs';

const WORKSHEET = `
## 1. Client — \`apps/client/.env.example\`

| Variable | What it is | Where you get it | Secret? | Dev / Preview value | Production value | Set? |
|---|---|---|---|---|---|:---:|
| \`VITE_API_BASE_URL\` | Base URL of the server API | The server's Vercel project URL | No | \`https://leaked.example.com\` | \` \` | ☐ |
| \`VITE_DEVICE_WIPE_CODE\` | The code a lead types | You choose it | **No** — it ships in the JS bundle. | \`1234\` | \` \` | ☐ |

## 2. Server — \`apps/server/.env.example\`

| Variable | What it is | Where you get it | Secret? | Dev / Preview value | Production value | Set? |
|---|---|---|---|---|---|:---:|
| \`SUPABASE_URL\` | Project REST URL | Supabase → Settings → API | No | \` \` | \` \` | ☐ |
| \`AUTH_JWT_SECRET\` | HS256 signing secret | Generate: \`openssl rand -base64 48\` | **YES** | \` \` | \` \` | ☐ |

## 3. GitHub Actions secrets
`;

describe('gen-env-example', () => {
  it('reads the client and server tables', () => {
    const { client, server } = parseWorksheet(WORKSHEET);
    expect(client.map((v) => v.name)).toEqual(['VITE_API_BASE_URL', 'VITE_DEVICE_WIPE_CODE']);
    expect(server.map((v) => v.name)).toEqual(['SUPABASE_URL', 'AUTH_JWT_SECRET']);
  });

  it('marks secret variables', () => {
    const { server } = parseWorksheet(WORKSHEET);
    expect(server.find((v) => v.name === 'AUTH_JWT_SECRET')?.secret).toBe(true);
    expect(server.find((v) => v.name === 'SUPABASE_URL')?.secret).toBe(false);
  });

  it('never copies a value out of the worksheet, even a non-secret one', () => {
    const rendered = renderEnvExample('client', parseWorksheet(WORKSHEET).client);
    expect(rendered).not.toContain('leaked.example.com');
    expect(rendered).not.toContain('1234');
  });

  it('emits every name with an empty placeholder and its documentation', () => {
    const rendered = renderEnvExample('client', parseWorksheet(WORKSHEET).client);
    expect(rendered).toContain('# Base URL of the server API');
    expect(rendered).toContain("# Where: The server's Vercel project URL");
    expect(rendered).toMatch(/^VITE_API_BASE_URL=$/m);
  });

  it('warns in the header that the file is generated and holds no real values', () => {
    const rendered = renderEnvExample('server', parseWorksheet(WORKSHEET).server);
    expect(rendered).toContain('generated from docs/ops/ENVIRONMENT.md');
    expect(rendered).toContain('pnpm env:example');
    expect(rendered).toContain('No real value belongs in this file');
  });

  it('throws a readable error when a section heading is missing', () => {
    expect(() => parseWorksheet('# nothing here')).toThrowError(/## 1\. Client/);
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
pnpm vitest run --project scripts
```

Expected: `Failed to resolve import "./gen-env-example.mjs"`.

- [ ] **Step 3: Implement**

`scripts/gen-env-example.mjs`:

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSHEET_PATH = join(ROOT, 'docs/ops/ENVIRONMENT.md');
const TARGETS = {
  client: join(ROOT, 'apps/client/.env.example'),
  server: join(ROOT, 'apps/server/.env.example'),
};

const strip = (cell) => cell.replaceAll('`', '').replaceAll('**', '').trim();

function parseSection(markdown, heading) {
  const start = markdown.indexOf(heading);
  if (start === -1) throw new Error(`ENVIRONMENT.md is missing the section "${heading}"`);
  const rest = markdown.slice(start + heading.length);
  const end = rest.indexOf('\n## ');
  const body = end === -1 ? rest : rest.slice(0, end);
  return body
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .slice(2) // header row and separator row
    .map((line) => line.split('|').slice(1, -1))
    .filter((cells) => cells.length >= 4 && strip(cells[0]).length > 0)
    .map((cells) => ({
      name: strip(cells[0]),
      what: strip(cells[1]),
      where: strip(cells[2]),
      secret: /yes/i.test(strip(cells[3])),
    }));
}

export function parseWorksheet(markdown) {
  return {
    client: parseSection(markdown, '## 1. Client'),
    server: parseSection(markdown, '## 2. Server'),
  };
}

export function renderEnvExample(app, variables) {
  const lines = [
    `# apps/${app}/.env.example`,
    '#',
    '# GENERATED — do not edit by hand.',
    '# It is generated from docs/ops/ENVIRONMENT.md by `pnpm env:example`.',
    '# No real value belongs in this file, in this repository, in a commit message,',
    '# or in a chat message. Names and placeholders only (SPEC-FINAL Appendix B).',
    '',
  ];
  for (const v of variables) {
    lines.push(`# ${v.what}`);
    lines.push(`# Where: ${v.where}`);
    if (v.secret) lines.push('# SECRET — set it in the Vercel dashboard, never here.');
    lines.push(`${v.name}=`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export function main(argv = process.argv.slice(2)) {
  const check = argv.includes('--check');
  const parsed = parseWorksheet(readFileSync(WORKSHEET_PATH, 'utf8'));
  let drifted = false;
  for (const app of ['client', 'server']) {
    const rendered = renderEnvExample(app, parsed[app]);
    const path = TARGETS[app];
    let current = null;
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      current = null;
    }
    if (current === rendered) continue;
    if (check) {
      drifted = true;
      console.error(`drift: ${path} does not match docs/ops/ENVIRONMENT.md`);
    } else {
      writeFileSync(path, rendered, 'utf8');
      console.warn(`wrote ${path}`);
    }
  }
  if (check && drifted) {
    console.error('Run `pnpm env:example` and commit the result.');
    process.exit(1);
  }
}

// Run only when invoked directly, never when imported by the test.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
```

- [ ] **Step 4: Generate the two files and re-run**

```bash
pnpm env:example && pnpm vitest run --project scripts && pnpm env:example:check
```

Expected: `wrote .../apps/client/.env.example` and `wrote .../apps/server/.env.example`; every suite green, including the new file(s) from this task; the check exits 0 and prints nothing.

- [ ] **Step 5: Confirm no value leaked**

```bash
grep -rnE "supabase\.co|eyJ|https://" apps/client/.env.example apps/server/.env.example || echo "clean: names and placeholders only"
```

Expected: `clean: names and placeholders only`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(ops): generate both .env.example files from the environment worksheet"
```

---

## Task 0.7: Write `docs/ops/SETUP.md` and `docs/ops/RUNBOOK.md`

**Files:**
- Create: `docs/ops/SETUP.md`, `docs/ops/RUNBOOK.md`
- Create: `scripts/check-docs.mjs`, `scripts/check-docs.test.ts`
- Modify: root `package.json` (add `"docs:check": "node scripts/check-docs.mjs"`)

**Interfaces:**
- Produces: the two documents SPEC-FINAL §19.5 requires, plus a heading check so a required section can never be quietly dropped.

- [ ] **Step 1: Write the failing test**

`scripts/check-docs.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { missingHeadings, REQUIRED } from './check-docs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('required ops documentation (SPEC-FINAL 19.5)', () => {
  it('every required document carries every required section', () => {
    for (const [path, required] of Object.entries(REQUIRED)) {
      expect(missingHeadings(readFileSync(join(ROOT, path), 'utf8'), required), path).toEqual([]);
    }
  });

  it('no required document contains a value that looks like a secret', () => {
    for (const path of Object.keys(REQUIRED)) {
      const text = readFileSync(join(ROOT, path), 'utf8');
      expect(text, path).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/); // a JWT-shaped string
      expect(text, path).not.toMatch(/sb[ps]_[A-Za-z0-9]{20,}/); // a Supabase key
    }
  });

  it('reports a missing section rather than passing silently', () => {
    expect(missingHeadings('# nothing\n', ['Accounts to create'])).toEqual(['Accounts to create']);
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
pnpm vitest run --project scripts
```

Expected: `ENOENT: no such file or directory, open 'docs/ops/SETUP.md'`.

- [ ] **Step 3: Implement the checker**

`scripts/check-docs.mjs`:

```js
#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED = {
  'docs/ops/SETUP.md': [
    'Accounts to create',
    'Supabase — dev project',
    'Supabase — production project',
    'Migrations by CLI',
    'Vercel — client project',
    'Vercel — server project',
    'GitHub Actions secrets',
    'Backup: `supabase db dump`',
    'New-season checklist',
    'Maintenance and handover checklist',
    'Account transfer checklist',
  ],
  'docs/ops/RUNBOOK.md': [
    'Site will not load',
    'Sync is failing',
    'A tablet is dead or misbehaving',
    'Conflicts are piling up',
    'Pre-event checklist',
    'Daily at an event',
  ],
};

export function missingHeadings(text, required) {
  const headings = text
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3).trim());
  return required.filter((h) => !headings.includes(h));
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function main() {
  let failed = false;
  for (const [path, required] of Object.entries(REQUIRED)) {
    const missing = missingHeadings(readFileSync(join(ROOT, path), 'utf8'), required);
    if (missing.length > 0) {
      failed = true;
      console.error(`${path} is missing sections: ${missing.join(', ')}`);
    }
  }
  if (failed) process.exit(1);
  console.warn('ops documentation complete');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
```

- [ ] **Step 4: Write `docs/ops/RUNBOOK.md`, in full**

```markdown
# Runbook — what to do when something breaks at an event

One page. A checklist, not a manual. Updated after every event.

**The one thing to remember:** entries live on the device that made them until the
server acknowledges them. Sync failing is an inconvenience. Wiping a device that
still holds unacknowledged entries is a loss.

## Site will not load

1. Open the Vercel dashboard for the affected project (client or server).
2. Deployments → the last deployment that was green → **Promote to Production**.
3. Confirm: `curl -s https://<server-host>/health` returns `{"status":"ok","database":"ok",...}`.
4. If `/health` says `database: error`, the Supabase project is paused or unreachable.
   Open the Supabase dashboard; a paused project resumes on first access.
5. Scouters keep scouting throughout. Nothing they have entered is lost.

## Sync is failing

1. **Keep scouting.** The data is safe on the device.
2. Walk outside the arena and open the sync page; press **Sync now**.
3. Still failing → hop the data to the collector tablet by QR (Sync → Send by QR),
   and let the runner carry that tablet outside.
4. Never clear a device's data to "fix" sync. The wipe refuses while anything is
   unacknowledged, and that refusal is correct.

## A tablet is dead or misbehaving

1. Take a spare device, install the app, log in, and let it pull the event.
2. Recover the dead device's entries by QR from the collector tablet
   (Sync → Receive by QR). The originals keep their author and their timestamps.
3. If the dead device comes back to life, let it sync normally — a second upload of
   the same record is an idempotent no-op, never a duplicate.

## Conflicts are piling up

1. A **lead or an admin** opens Sync → Conflicts.
2. Resolution needs a connection; offline the queue is readable but not resolvable.
3. A divergence: keep the current copy, or restore the other one. A duplicate: keep one.
4. Clear the queue before the end of the day. An unresolved duplicate does not corrupt
   statistics — the latest entry wins — but it hides a scouting mix-up worth knowing about.

## Pre-event checklist

- [ ] Run `supabase db dump` and save the file off-platform. **Not optional.**
- [ ] 48 hours before: open the app and confirm it loads (this also wakes the database).
- [ ] Verify the offline path on a real phone with the network actually off.
      (Task 1.63 turns this line into a numbered procedure in `OFFLINE-CHECK.md`.)
- [ ] Confirm every scouting device has hydrated the event while on wifi.
- [ ] Confirm every device shows the same version string on the context page.

## Daily at an event

- [ ] Every device syncs at least once. Check the unsynced count on each before it is
      put away — the app is designed for a one-day offline window, not a weekend one.
- [ ] The conflict queue is empty, or the open items are known.
- [ ] The collector tablet has been carried outside at least once per two match cycles.

## Results log

| Date | Event | Who ran the offline check | Result |
|---|---|---|---|
| | | | |
```

- [ ] **Step 5: Write `docs/ops/SETUP.md`**

Written for a student who has never seen the project. Each `##` section is a numbered, followable procedure. Write the real text, not a summary; the content of each section is:

1. **Accounts to create** — GitHub, Supabase (two projects: dev and prod), Vercel (two projects: client and server). Cross-reference `docs/ops/ENVIRONMENT.md` §6, and state the standing rule from SPEC-FINAL §19.8: **nothing may depend on a personal identity** — no personal email in code, config, seed data, or as the running app's only admin.
2. **Supabase — dev project** — create it; choose the region nearest the team; save the database password into a password manager (never into this repo); record the **project ref** in `ENVIRONMENT.md` §3; copy the project URL and the service-role key straight from the Supabase dashboard into the Vercel *server* project's **Preview** environment, in the browser, without pasting them anywhere else.
3. **Supabase — production project** — the same, into the server project's **Production** environment. State the standing rule: **CI never touches this project**, and its name never appears in a workflow file.
4. **Migrations by CLI** — `pnpm dlx supabase login`; `pnpm --filter @frc/db exec supabase link --project-ref <ref>`; `pnpm --filter @frc/db exec supabase db push`. Dev is pushed automatically by CI on every push to `develop`. **Production is pushed by hand, one deliberate command, never on a merge** — a merge on a Friday must not be able to alter the database on a competition Saturday.
5. **Vercel — client project** — Root Directory `apps/client`; Framework *Vite*; Node 22; the build and install commands come from `apps/client/vercel.json`. Set the three §B.1 variables per environment.
6. **Vercel — server project** — Root Directory `apps/server`; Framework *Other*; Node 22. Set the whole §B.2 list per environment: **Preview → the dev Supabase project, Production → the prod Supabase project**. Generate a different `AUTH_JWT_SECRET` per environment with `openssl rand -base64 48`.
7. **GitHub Actions secrets** — the §B.3 list, where each comes from, and why every one of them is named `*_DEV_*`.
8. **Backup: `supabase db dump`** — the exact command, where to save the file, and the standing rule that it is a checklist line before every event and at the end of every season. State the accepted risk plainly: with no in-app export, that dump is the only copy of a season outside the live database.
9. **New-season checklist** — (1) commit `apps/client/public/seasons/<year>/field.webp`, run `pnpm season:images`, and redeploy the client — **the season cannot be created until that image is live**; (2) create the season with that exact path; (3) create the events in competition order; (4) build and publish the `match` and `super` forms; (5) set the active context; (6) create the event roster and the match schedule.
10. **Maintenance and handover checklist** — who holds each account today, what to check monthly (one `/health` call, one `supabase db dump`, the free-tier usage page), what a new maintainer reads first (`SPEC-FINAL.md`, then this file, then `RUNBOOK.md`), and where the archive of *why* lives (`docs/spec/frc-scouting-app-spec.md`).
11. **Account transfer checklist** — the order to move things: GitHub first (the repository and its Actions secrets), then Supabase (both projects), then Vercel (both projects). What breaks at each step: Vercel environment variables are **not** carried by a project transfer and must be re-entered; the Supabase service-role key changes if a project is recreated rather than transferred; the GitHub Actions secrets must be re-added to the new owner's repository. After each move, re-verify `/health` on both environments before continuing.

- [ ] **Step 6: Run the check and watch it pass**

```bash
pnpm docs:check && pnpm vitest run --project scripts
```

Expected: `ops documentation complete`; every suite green, including the new file(s) from this task for the scripts project.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "docs(ops): write SETUP.md and RUNBOOK.md with a required-section check"
```

---
# PROVISIONING GATE

**Everything above this line is buildable with no account, no secret and no live service. Everything below it is blocked until this gate passes.**

Do these in order. Tick each box in `docs/ops/ENVIRONMENT.md` as you go — that file is the record, and ticking it is the whole handshake. **Never send a secret value into a chat.** The only things ever spoken aloud are the **non-secret identifiers**: the two Supabase project refs and the four deployment URLs.

### Gate checklist — in this order

1. **GitHub** — the repository exists and `develop` is pushed. → tick `ENVIRONMENT.md` §6 *GitHub*.
2. **Supabase dev project** — create it; pick the region nearest the team; save the database password into a password manager. → tick §6 *Supabase — dev*.
3. **Supabase production project** — create it, same region. → tick §6 *Supabase — prod*.
4. **Vercel client project** — import the repository, root directory `apps/client`. → tick §6 *Vercel — client*.
5. **Vercel server project** — import the same repository again, root directory `apps/server`. → tick §6 *Vercel — server*.
6. **Record the non-secret identifiers in `ENVIRONMENT.md`**: the dev project ref (§3 `SUPABASE_DEV_PROJECT_REF`), and the four deployment URLs that fill `VITE_API_BASE_URL` (§1) and `ALLOWED_ORIGIN` (§2) for Production and Preview.
7. **Set the Vercel server variables** — the whole of §2, twice: **Preview → the dev Supabase project**, **Production → the prod Supabase project**. Generate a *different* `AUTH_JWT_SECRET` per environment with `openssl rand -base64 48`. → tick every §2 and §4 row.
8. **Set the Vercel client variables** — the three §1 variables, twice. Preview points at the dev/preview server; Production points at the production server. → tick every §1 and §4 row.
9. **Set the GitHub Actions secrets** — the whole of §3. `SUPABASE_DEV_*` only; production is deliberately absent. → tick every §3 row.
10. **Create your local `.env` files** — copy `apps/server/.env.example` to `apps/server/.env` and fill it with the **dev** project's values, and `apps/client/.env.example` to `apps/client/.env`. Both are gitignored. → tick §5.

### What I need from you at the gate

Only these, and only when a task asks for them:

- the **dev** Supabase project ref (a non-secret identifier, e.g. `abcdefghijklmnopqrst`);
- the four deployment URLs.

I will never ask you for a secret value, and there is no task below that needs one.

### What is blocked until the gate passes

| Blocked | Why |
|---|---|
| Tasks **0.8 – 0.12** (migrations) | `supabase link` and `supabase db push` need the dev project ref and its database password. |
| Task **0.13** (generated DB types) | `supabase gen types --linked` reads the linked dev project. |
| Task **0.14** (dev seed script) | Writes rows into the dev project. |
| Task **0.15** (CI) | The workflow consumes the §3 GitHub secrets. |
| Task **0.16** (keep-alive) | Needs `HEALTHCHECK_DEV_URL` and `HEALTHCHECK_PROD_URL`. |
| Task **0.17** (deployments and `/health`) | Needs both Vercel projects and both Supabase projects. |
| **All of phase 1** | Every phase 1 task's integration test runs against the dev project. |

---

# Phase 0 — after the gate

## Task 0.8: `packages/db` and migration 0001 — the fixed skeleton

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/vitest.integration.config.ts`, `packages/db/vitest.config.ts`, `packages/db/test/client.ts`
- Create: `packages/db/supabase/config.toml` (from `supabase init`)
- Create: `packages/db/supabase/migrations/20260903090000_skeleton.sql`
- Create: `packages/db/test/skeleton.itest.ts`
- Modify: root `package.json` (`"db:push": "pnpm --filter @frc/db db:push"`, `"db:test": "pnpm --filter @frc/db test:integration"`)

**Interfaces:**
- Produces: the `set_updated_at()` trigger function reused by every later migration; the tables `seasons`, `events`, `app_settings`, `teams`, `event_teams`, `matches`, `match_teams`; the integration-test harness `serviceClient()` every later database task uses.

**Requires the gate.** The tests in this task write to the **dev** Supabase project.

- [ ] **Step 1: Create the package and link the project**

`packages/db/package.json`:

```json
{
  "name": "@frc/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "db:push": "supabase db push",
    "db:types": "supabase gen types typescript --linked --schema public --output src/database.types.ts",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --no-error-on-unmatched-pattern",
    "build": "tsc --noEmit"
  },
  "dependencies": { "@supabase/supabase-js": "^2.46.1" },
  "devDependencies": {
    "dotenv": "^16.4.5",
    "supabase": "^2.117.0",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

Two details that would otherwise bite:

- **`db:types` uses `--output`, not `>`.** Shell redirection writes UTF-16 on Windows, and the drift check in task 0.13 would then never match.
- **`lint` globs the package rather than naming `src`**, because `src/` does not exist until task 0.13 and `eslint src` would fail every run until then.

`packages/db/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022"], "types": ["node"], "noEmit": true },
  "include": ["src", "test"]
}
```

`packages/db/src/index.ts` — a placeholder so `tsc` has an input; task 0.13 fills it:

```ts
export {};
```

`packages/db/vitest.config.ts` — the default project must exist and must **not** pick up the integration suite, which needs a live database:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'] } });
```

Then initialise and link, using the **dev** project ref you recorded at the gate:

```bash
cd packages/db && pnpm dlx supabase init && cd ../..
pnpm --filter @frc/db exec supabase login
pnpm --filter @frc/db exec supabase link --project-ref <dev-project-ref>
```

Expected: `Finished supabase link.`

`packages/db/vitest.integration.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.itest.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
```

`packages/db/test/client.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// fileURLToPath, never new URL(...).pathname: this repository lives on a Windows drive
// under a path with spaces and Hebrew characters, and .pathname mangles both.
loadEnv({ path: fileURLToPath(new URL('../../../apps/server/.env', import.meta.url)) });

/**
 * Integration tests run against the DEV Supabase project only. If SUPABASE_URL
 * ever names the production project, that is a bug in your local .env, not here.
 */
export function serviceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Integration tests need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/server/.env ' +
        '(the DEV project). See docs/ops/ENVIRONMENT.md §5.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export const uuid = (): string => crypto.randomUUID();
```

- [ ] **Step 2: Write the failing test**

`packages/db/test/skeleton.itest.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceClient, uuid } from './client';

const db = serviceClient();
const seasonId = uuid();
const eventId = uuid();
const teamId = uuid();
const matchId = uuid();

beforeAll(async () => {
  await db.from('seasons').insert({
    id: seasonId,
    year: 1900,
    game_name: 'TEST GAME',
    field_image_path: 'seasons/1900/field.webp',
  });
  await db.from('events').insert({ id: eventId, season_id: seasonId, name: 'Test Event', sort_order: 1 });
  await db.from('teams').insert({ id: teamId, number: 999999, name: 'Test Team' });
});

afterAll(async () => {
  await db.from('seasons').delete().eq('id', seasonId);
  await db.from('teams').delete().eq('id', teamId);
});

describe('migration 0001 — the fixed skeleton', () => {
  it('creates every skeleton table', async () => {
    for (const table of [
      'app_settings',
      'seasons',
      'events',
      'teams',
      'event_teams',
      'matches',
      'match_teams',
    ]) {
      const { error } = await db.from(table).select('id').limit(1);
      expect(error, `${table}: ${error?.message}`).toBeNull();
    }
  });

  it('holds exactly one app_settings row, enforced by the boolean primary key', async () => {
    const { data } = await db.from('app_settings').select('id');
    expect(data).toHaveLength(1);
    const { error } = await db.from('app_settings').insert({ id: true });
    expect(error?.code).toBe('23505');
  });

  it('bumps updated_at on UPDATE (SPEC-FINAL 3.10)', async () => {
    const before = await db.from('seasons').select('updated_at').eq('id', seasonId).single();
    await new Promise((r) => setTimeout(r, 1100));
    await db.from('seasons').update({ game_name: 'TEST GAME 2' }).eq('id', seasonId);
    const after = await db.from('seasons').select('updated_at').eq('id', seasonId).single();
    expect(new Date(after.data!.updated_at).getTime()).toBeGreaterThan(
      new Date(before.data!.updated_at).getTime(),
    );
  });

  it('restricts match_type to the three legal values', async () => {
    const bad = await db
      .from('matches')
      .insert({ id: uuid(), event_id: eventId, match_type: 'final', number: 1 });
    expect(bad.error?.code).toBe('23514');
    const good = await db
      .from('matches')
      .insert({ id: matchId, event_id: eventId, match_type: 'qualification', number: 1 });
    expect(good.error).toBeNull();
  });

  it('allows a match with no match_teams rows and fills slots later', async () => {
    const { error } = await db
      .from('match_teams')
      .insert({ id: uuid(), match_id: matchId, alliance: 'red', station: 2, team_id: teamId });
    expect(error).toBeNull();
    const dup = await db
      .from('match_teams')
      .insert({ id: uuid(), match_id: matchId, alliance: 'red', station: 2, team_id: teamId });
    expect(dup.error?.code).toBe('23505');
  });

  it('makes the event roster soft-deletable and unique only among live rows', async () => {
    const first = uuid();
    await db.from('event_teams').insert({ id: first, event_id: eventId, team_id: teamId });
    const dup = await db.from('event_teams').insert({ id: uuid(), event_id: eventId, team_id: teamId });
    expect(dup.error?.code).toBe('23505');
    await db.from('event_teams').update({ deleted_at: new Date().toISOString() }).eq('id', first);
    const again = await db.from('event_teams').insert({ id: uuid(), event_id: eventId, team_id: teamId });
    expect(again.error).toBeNull();
  });

  it('keeps team numbers globally unique', async () => {
    const dup = await db.from('teams').insert({ id: uuid(), number: 999999, name: 'Clone' });
    expect(dup.error?.code).toBe('23505');
  });
});
```

- [ ] **Step 3: Run and watch it fail**

```bash
pnpm --filter @frc/db test:integration
```

Expected: every test fails with `relation "public.seasons" does not exist` (PostgREST code `42P01`).

- [ ] **Step 4: Write the migration**

`packages/db/supabase/migrations/20260903090000_skeleton.sql`:

```sql
-- Migration 0001 — the fixed skeleton (SPEC-FINAL §3.1).
-- No RLS anywhere in this schema: authorization lives in the server use-case layer (§7.4).

create extension if not exists pgcrypto;

-- The one load-bearing trigger (§3.10). Without it the delta pull silently misses
-- every edit and every tombstone. It is a timestamp assignment, not logic.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.seasons (
  id                uuid primary key,
  year              integer not null unique,
  game_name         text not null,
  field_image_path  text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.events (
  id          uuid primary key,
  season_id   uuid not null references public.seasons(id) on delete cascade,
  name        text not null,
  code        text,
  sort_order  integer not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (season_id, name)
);
create index events_season_sort_idx on public.events (season_id, sort_order);

-- The active context is a singleton row, not a flag on events (§3.1, D21).
create table public.app_settings (
  id                boolean primary key default true check (id),
  active_season_id  uuid references public.seasons(id) on delete set null,
  active_event_id   uuid references public.events(id)  on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
insert into public.app_settings (id) values (true);

create table public.teams (
  id          uuid primary key,
  number      integer not null unique,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.event_teams (
  id          uuid primary key,
  event_id    uuid not null references public.events(id) on delete cascade,
  team_id     uuid not null references public.teams(id)  on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create unique index event_teams_live_idx on public.event_teams (event_id, team_id) where deleted_at is null;
create index event_teams_delta_idx on public.event_teams (event_id, updated_at);
create index event_teams_team_idx on public.event_teams (team_id);

create table public.matches (
  id                  uuid primary key,
  event_id            uuid not null references public.events(id) on delete cascade,
  match_type          text not null check (match_type in ('practice','qualification','playoff')),
  number              integer not null,
  -- reserved official result, nullable, never populated in v1 (§3.1)
  official_red_score  integer,
  official_blue_score integer,
  official_red_rp     integer,
  official_blue_rp    integer,
  official_winner     text check (official_winner in ('red','blue','tie')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (event_id, match_type, number)
);
create index matches_delta_idx on public.matches (event_id, updated_at);

create table public.match_teams (
  id          uuid primary key,
  match_id    uuid not null references public.matches(id) on delete cascade,
  alliance    text not null check (alliance in ('red','blue')),
  station     integer not null check (station between 1 and 3),
  team_id     uuid not null references public.teams(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (match_id, alliance, station)
);
create index match_teams_team_idx on public.match_teams (team_id);
create index match_teams_match_idx on public.match_teams (match_id);

do $$
declare t text;
begin
  foreach t in array array[
    'seasons','events','app_settings','teams','event_teams','matches','match_teams'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
```

- [ ] **Step 5: Apply and re-run**

```bash
pnpm --filter @frc/db db:push && pnpm --filter @frc/db test:integration
```

Expected: `db push` prints `Applying migration 20260903090000_skeleton.sql...` then `Finished supabase db push.`; the test run prints every suite green, with the new file(s) from this task among them.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(db): add the fixed-skeleton schema and the updated_at trigger"
```

---

## Task 0.9: Migration 0002 — users, forms, form versions, fields, scoring rules

**Files:**
- Create: `packages/db/supabase/migrations/20260903091000_forms.sql`
- Create: `packages/db/test/forms.itest.ts`

**Interfaces:**
- Consumes: `set_updated_at()` and `seasons` from task 0.8.
- Produces: `users`, `forms`, `form_versions`, `form_fields`, `scoring_rules`.

**Note on the circular reference:** `forms.active_version_id → form_versions.id` and `form_versions.form_id → forms.id` are mutually dependent. The migration creates `forms` without that foreign key, creates `form_versions`, then adds the constraint with `alter table`.

- [ ] **Step 1: Write the failing test**

`packages/db/test/forms.itest.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceClient, uuid } from './client';

const db = serviceClient();
const seasonId = uuid();
const formId = uuid();
const versionId = uuid();

beforeAll(async () => {
  await db.from('seasons').insert({
    id: seasonId,
    year: 1901,
    game_name: 'TEST',
    field_image_path: 'seasons/1901/field.webp',
  });
  await db.from('forms').insert({ id: formId, season_id: seasonId, kind: 'match', name: 'Match' });
  await db.from('form_versions').insert({ id: versionId, form_id: formId, version_no: 1 });
});

afterAll(async () => {
  await db.from('seasons').delete().eq('id', seasonId);
  await db.from('users').delete().eq('username', 'itest_user');
});

describe('migration 0002 — users and forms', () => {
  it('creates every table', async () => {
    for (const table of ['users', 'forms', 'form_versions', 'form_fields', 'scoring_rules']) {
      const { error } = await db.from(table).select('id').limit(1);
      expect(error, `${table}: ${error?.message}`).toBeNull();
    }
  });

  it('makes usernames unique case-insensitively (SPEC-FINAL 7.5)', async () => {
    const first = await db.from('users').insert({
      id: uuid(),
      username: 'itest_user',
      full_name: 'Integration Test',
      password_hash: 'x',
      role: 'scouter',
    });
    expect(first.error).toBeNull();
    const dup = await db.from('users').insert({
      id: uuid(),
      username: 'ITEST_USER',
      full_name: 'Clash',
      password_hash: 'x',
      role: 'scouter',
    });
    expect(dup.error?.code).toBe('23505');
  });

  it('restricts roles to scouter, lead and admin', async () => {
    const bad = await db.from('users').insert({
      id: uuid(),
      username: 'itest_bad_role',
      full_name: 'Bad',
      password_hash: 'x',
      role: 'mentor',
    });
    expect(bad.error?.code).toBe('23514');
  });

  it('allows one match form and one super form per season, and no more', async () => {
    const dup = await db.from('forms').insert({ id: uuid(), season_id: seasonId, kind: 'match', name: 'Again' });
    expect(dup.error?.code).toBe('23505');
    const other = await db.from('forms').insert({ id: uuid(), season_id: seasonId, kind: 'super', name: 'Super' });
    expect(other.error).toBeNull();
  });

  it('rejects a form kind outside match and super', async () => {
    const bad = await db.from('forms').insert({ id: uuid(), season_id: seasonId, kind: 'pit', name: 'Pit' });
    expect(bad.error?.code).toBe('23514');
  });

  it('points a form at its active version once the version exists', async () => {
    const { error } = await db.from('forms').update({ active_version_id: versionId }).eq('id', formId);
    expect(error).toBeNull();
  });

  it('defaults timer_config to an empty phase list (SPEC-FINAL 8.4)', async () => {
    const { data } = await db.from('forms').select('timer_config').eq('id', formId).single();
    expect(data!.timer_config).toEqual({ phases: [] });
  });

  it('keeps field keys unique inside a version and permits the same key in another', async () => {
    const field = {
      form_version_id: versionId,
      key: 'auto_speaker',
      label: 'Auto speaker notes',
      type: 'counter',
      display_order: 1,
      description: 'Notes scored in autonomous',
      unit: 'count',
      phase: 'auto',
      direction: 'higher_is_better',
    };
    expect((await db.from('form_fields').insert({ id: uuid(), ...field })).error).toBeNull();
    expect((await db.from('form_fields').insert({ id: uuid(), ...field })).error?.code).toBe('23505');

    const v2 = uuid();
    await db.from('form_versions').insert({ id: v2, form_id: formId, version_no: 2 });
    const inV2 = await db.from('form_fields').insert({ id: uuid(), ...field, form_version_id: v2 });
    expect(inV2.error).toBeNull();
  });

  it('constrains the semantic-metadata vocabularies', async () => {
    const base = {
      id: uuid(),
      form_version_id: versionId,
      key: 'bad_unit',
      label: 'x',
      type: 'counter',
      display_order: 9,
      description: 'x',
      phase: 'auto',
      direction: 'higher_is_better',
    };
    expect((await db.from('form_fields').insert({ ...base, unit: 'furlongs' })).error?.code).toBe('23514');
    expect(
      (await db.from('form_fields').insert({ ...base, unit: 'count', phase: 'halftime' })).error?.code,
    ).toBe('23514');
    expect(
      (await db.from('form_fields').insert({ ...base, unit: 'count', direction: 'up' })).error?.code,
    ).toBe('23514');
  });

  it('refuses negative points and keys scoring by (form_id, field_key)', async () => {
    const negative = await db
      .from('scoring_rules')
      .insert({ id: uuid(), form_id: formId, field_key: 'auto_speaker', points: -1 });
    expect(negative.error?.code).toBe('23514');

    const ok = await db
      .from('scoring_rules')
      .insert({ id: uuid(), form_id: formId, field_key: 'auto_speaker', points: 5 });
    expect(ok.error).toBeNull();

    const dup = await db
      .from('scoring_rules')
      .insert({ id: uuid(), form_id: formId, field_key: 'auto_speaker', points: 2 });
    expect(dup.error?.code).toBe('23505');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
pnpm --filter @frc/db test:integration test/forms.itest.ts
```

Expected: `relation "public.users" does not exist`.

- [ ] **Step 3: Write the migration**

`packages/db/supabase/migrations/20260903091000_forms.sql`:

```sql
-- Migration 0002 — users, forms, versions, fields, scoring (SPEC-FINAL §3.2–§3.4).

create table public.users (
  id                   uuid primary key,
  username             text not null,
  full_name            text not null,
  password_hash        text not null,             -- bcrypt, cost 10 (§7.5)
  role                 text not null check (role in ('scouter','lead','admin')),
  must_change_password boolean not null default false,
  disabled_at          timestamptz,               -- "delete a user" means disable (§3.2)
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
-- Case-insensitive uniqueness without the citext extension (§7.5).
create unique index users_username_lower_idx on public.users (lower(username));

create table public.forms (
  id                 uuid primary key,
  season_id          uuid not null references public.seasons(id) on delete cascade,
  kind               text not null check (kind in ('match','super')),
  name               text not null,
  active_version_id  uuid,                        -- FK added below (circular reference)
  timer_config       jsonb not null default '{"phases":[]}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (season_id, kind)
);

create table public.form_versions (
  id            uuid primary key,
  form_id       uuid not null references public.forms(id) on delete cascade,
  version_no    integer not null,
  published_at  timestamptz,                      -- null = draft
  is_locked     boolean not null default false,   -- true once an entry binds to it
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (form_id, version_no)
);
create index form_versions_delta_idx on public.form_versions (form_id, updated_at);

alter table public.forms
  add constraint forms_active_version_fk
  foreign key (active_version_id) references public.form_versions(id) on delete set null;

create table public.form_fields (
  id                    uuid primary key,
  form_version_id       uuid not null references public.form_versions(id) on delete cascade,
  key                   text not null,            -- PERMANENT. Never changes, ever.
  label                 text not null,            -- editable in place, no new version
  help_text             text,
  type                  text not null,
  section               text,
  display_order         integer not null,
  required              boolean not null default false,
  default_value         jsonb,
  config                jsonb not null default '{}'::jsonb,
  visibility_condition  jsonb,
  deprecated            boolean not null default false,
  -- semantic metadata; required on data fields, enforced in the use-case layer (§3.3)
  description           text,
  unit                  text check (unit in ('count','seconds','points','boolean','enum','text','coordinate')),
  phase                 text check (phase in ('auto','teleop','endgame','post_match')),
  direction             text check (direction in ('higher_is_better','lower_is_better','neutral')),
  category              text,
  expected_range        jsonb,
  include_in_ai_context boolean,
  is_ordinal            boolean,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (form_version_id, key)
);
create index form_fields_delta_idx on public.form_fields (form_version_id, updated_at);

create table public.scoring_rules (
  id             uuid primary key,
  form_id        uuid not null references public.forms(id) on delete cascade,
  field_key      text not null,
  points         numeric not null default 0 check (points >= 0),
  option_points  jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (form_id, field_key)
);
create index scoring_rules_delta_idx on public.scoring_rules (form_id, updated_at);

do $$
declare t text;
begin
  foreach t in array array['users','forms','form_versions','form_fields','scoring_rules'] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
```

- [ ] **Step 4: Apply and re-run**

```bash
pnpm --filter @frc/db db:push && pnpm --filter @frc/db test:integration
```

Expected: `Finished supabase db push.`; every suite green, with the new file(s) from this task among them.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(db): add users, forms, form versions, fields and scoring rules"
```

---

## Task 0.10: Migration 0003 — scouting entries and sync conflicts

**Files:**
- Create: `packages/db/supabase/migrations/20260903092000_entries.sql`
- Create: `packages/db/test/entries.itest.ts`

**Interfaces:**
- Produces: `scouting_entries` and `sync_conflicts`, with the deliberately **non-unique** duplicate-detection index and the delta-pull index.

- [ ] **Step 1: Write the failing test**

`packages/db/test/entries.itest.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceClient, uuid } from './client';

const db = serviceClient();
const ids = {
  season: uuid(),
  event: uuid(),
  team: uuid(),
  match: uuid(),
  form: uuid(),
  version: uuid(),
  user: uuid(),
};

const now = () => new Date().toISOString();

const entry = (over: Record<string, unknown> = {}) => ({
  id: uuid(),
  form_version_id: ids.version,
  form_kind: 'match',
  event_id: ids.event,
  match_id: ids.match,
  team_id: ids.team,
  alliance: 'red',
  scouter_id: ids.user,
  robot_status: 'played',
  data: { auto_speaker: 3 },
  client_created_at: now(),
  client_updated_at: now(),
  ...over,
});

beforeAll(async () => {
  await db.from('seasons').insert({ id: ids.season, year: 1902, game_name: 'T', field_image_path: 'p' });
  await db.from('events').insert({ id: ids.event, season_id: ids.season, name: 'E', sort_order: 1 });
  await db.from('teams').insert({ id: ids.team, number: 999998, name: 'T' });
  await db.from('matches').insert({ id: ids.match, event_id: ids.event, match_type: 'qualification', number: 1 });
  await db.from('forms').insert({ id: ids.form, season_id: ids.season, kind: 'match', name: 'M' });
  await db.from('form_versions').insert({ id: ids.version, form_id: ids.form, version_no: 1 });
  await db.from('users').insert({
    id: ids.user,
    username: 'itest_entries',
    full_name: 'E',
    password_hash: 'x',
    role: 'scouter',
  });
});

afterAll(async () => {
  await db.from('scouting_entries').delete().eq('event_id', ids.event);
  await db.from('seasons').delete().eq('id', ids.season);
  await db.from('users').delete().eq('id', ids.user);
  await db.from('teams').delete().eq('id', ids.team);
});

describe('migration 0003 — entries, conflicts and the idempotency ledger', () => {
  it('creates all three tables', async () => {
    for (const table of ['scouting_entries', 'sync_conflicts']) {
      const { error } = await db.from(table).select('id').limit(1);
      expect(error, `${table}: ${error?.message}`).toBeNull();
    }
    const { error } = await db.from('applied_operations').select('op_id').limit(1);
    expect(error, `applied_operations: ${error?.message}`).toBeNull();
  });

  it('makes an op_id unique, which is what makes a replayed push a noop', async () => {
    const opId = `itest-${uuid()}`;
    expect((await db.from('applied_operations').insert({ op_id: opId })).error).toBeNull();
    expect((await db.from('applied_operations').insert({ op_id: opId })).error?.code).toBe('23505');
    await db.from('applied_operations').delete().eq('op_id', opId);
  });

  it('accepts an entry with a client-generated id and starts version at 1', async () => {
    const row = entry();
    const { error } = await db.from('scouting_entries').insert(row);
    expect(error).toBeNull();
    const { data } = await db.from('scouting_entries').select('version').eq('id', row.id).single();
    expect(data!.version).toBe(1);
  });

  it('keeps BOTH rows for the same logical key — the index is deliberately not unique (D6)', async () => {
    const a = await db.from('scouting_entries').insert(entry());
    const b = await db.from('scouting_entries').insert(entry());
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
  });

  it('blocks deleting a match that has entries (SPEC-FINAL 3.9)', async () => {
    const { error } = await db.from('matches').delete().eq('id', ids.match);
    expect(error?.code).toBe('23503');
  });

  it('cascades entries when the form version is removed, not restricts (SPEC-FINAL 3.5)', async () => {
    const version2 = uuid();
    await db.from('form_versions').insert({ id: version2, form_id: ids.form, version_no: 9 });
    const doomed = entry({ form_version_id: version2 });
    await db.from('scouting_entries').insert(doomed);
    const { error } = await db.from('form_versions').delete().eq('id', version2);
    expect(error).toBeNull();
    const { data } = await db.from('scouting_entries').select('id').eq('id', doomed.id);
    expect(data).toEqual([]);
  });

  it('restricts robot_status, form_kind and alliance to their vocabularies', async () => {
    expect((await db.from('scouting_entries').insert(entry({ robot_status: 'dead' }))).error?.code).toBe('23514');
    expect((await db.from('scouting_entries').insert(entry({ form_kind: 'pit' }))).error?.code).toBe('23514');
    expect((await db.from('scouting_entries').insert(entry({ alliance: 'green' }))).error?.code).toBe('23514');
  });

  it('requires the two client timestamps', async () => {
    const { error } = await db
      .from('scouting_entries')
      .insert(entry({ client_created_at: null, client_updated_at: null }));
    expect(error?.code).toBe('23502');
  });

  it('stores a divergence conflict with the whole losing payload', async () => {
    const live = entry();
    await db.from('scouting_entries').insert(live);
    const { error } = await db.from('sync_conflicts').insert({
      id: uuid(),
      event_id: ids.event,
      entity: 'scouting_entry',
      row_id: live.id,
      kind: 'divergence',
      superseded_payload: { data: { auto_speaker: 9 } },
      superseded_author_id: ids.user,
      superseded_client_updated_at: now(),
      base_version: 1,
    });
    expect(error).toBeNull();
  });

  it('restricts the conflict entity and kind vocabularies', async () => {
    const bad = await db.from('sync_conflicts').insert({
      id: uuid(),
      event_id: ids.event,
      entity: 'team',
      row_id: uuid(),
      kind: 'divergence',
    });
    expect(bad.error?.code).toBe('23514');
    const badKind = await db.from('sync_conflicts').insert({
      id: uuid(),
      event_id: ids.event,
      entity: 'scouting_entry',
      row_id: uuid(),
      kind: 'merge',
    });
    expect(badKind.error?.code).toBe('23514');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
pnpm --filter @frc/db test:integration test/entries.itest.ts
```

Expected: `relation "public.scouting_entries" does not exist`.

- [ ] **Step 3: Write the migration**

`packages/db/supabase/migrations/20260903092000_entries.sql`:

```sql
-- Migration 0003 — scouting entries and sync conflicts (SPEC-FINAL §3.5, §3.6).

create table public.scouting_entries (
  id                 uuid primary key,                        -- client-generated
  form_version_id    uuid not null references public.form_versions(id) on delete cascade,
  form_kind          text not null check (form_kind in ('match','super')),
  event_id           uuid not null references public.events(id) on delete cascade,
  match_id           uuid references public.matches(id) on delete restrict,
  team_id            uuid not null references public.teams(id) on delete restrict,
  alliance           text check (alliance in ('red','blue')),
  scouter_id         uuid not null references public.users(id) on delete restrict,
  robot_status       text check (robot_status in ('played','no_show','disabled','broke_down')),
  breakdown_seconds  integer,
  data               jsonb not null default '{}'::jsonb,
  version            integer not null default 1,              -- server-assigned revision (§9.5)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  client_created_at  timestamptz not null,
  client_updated_at  timestamptz not null,
  deleted_at         timestamptz
);

-- Duplicate detection for the canonical-entry rule. DELIBERATELY NOT UNIQUE (§9.5, §11.6):
-- both rows are kept and flagged, and the engine reads the latest client_updated_at.
create index scouting_entries_logical_key_idx
  on public.scouting_entries (event_id, form_kind, team_id, match_id)
  where deleted_at is null;
-- The delta-pull index (§9.3).
create index scouting_entries_delta_idx on public.scouting_entries (event_id, updated_at);
create index scouting_entries_scouter_idx on public.scouting_entries (scouter_id);
create index scouting_entries_match_idx on public.scouting_entries (match_id);
create index scouting_entries_form_version_idx on public.scouting_entries (form_version_id);
-- No GIN index on data: nothing in v1 queries the JSONB from SQL (§3.5).

create table public.sync_conflicts (
  id                            uuid primary key,
  event_id                      uuid not null references public.events(id) on delete cascade,
  entity                        text not null check (entity in
                                  ('scouting_entry','pick_list','pick_list_entry',
                                   'do_not_pick','alliance_slot')),
  row_id                        uuid not null,
  kind                          text not null check (kind in ('divergence','duplicate')),
  superseded_payload            jsonb,
  superseded_author_id          uuid references public.users(id),
  superseded_client_updated_at  timestamptz,
  base_version                  integer,
  duplicate_row_id              uuid,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  resolved_at                   timestamptz,
  resolved_by                   uuid references public.users(id)
);
create index sync_conflicts_delta_idx on public.sync_conflicts (event_id, updated_at);
create index sync_conflicts_entity_idx on public.sync_conflicts (entity, row_id);
create index sync_conflicts_open_idx on public.sync_conflicts (event_id) where resolved_at is null;

-- The op_id idempotency ledger (SPEC-FINAL 9.3.1). Replaying a push batch is safe:
-- a previously applied op_id returns `noop`. It carries no updated_at and therefore
-- no trigger — it is append-only and is never synced to a device.
create table public.applied_operations (
  op_id       text primary key,
  applied_at  timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['scouting_entries','sync_conflicts'] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
```

- [ ] **Step 4: Apply and re-run**

```bash
pnpm --filter @frc/db db:push && pnpm --filter @frc/db test:integration
```

Expected: `Finished supabase db push.`; every suite green, with the new file(s) from this task among them.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(db): add scouting entries and the sync conflict table"
```

---

## Task 0.11: Migration 0004 — metrics, dashboards, charts, weight presets

**Files:**
- Create: `packages/db/supabase/migrations/20260903093000_analysis.sql`
- Create: `packages/db/test/analysis.itest.ts`

**Interfaces:**
- Produces: `metrics`, `dashboards`, `dashboard_charts`, `weight_presets`. Phase 1 reads `dashboards` only for the fixed ranking table; the builders are phase 2. The tables ship now because the whole §3 schema is a phase 0 deliverable (§20.2).

- [ ] **Step 1: Write the failing test**

`packages/db/test/analysis.itest.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceClient, uuid } from './client';

const db = serviceClient();
const seasonId = uuid();
const dashboardId = uuid();

beforeAll(async () => {
  await db.from('seasons').insert({ id: seasonId, year: 1903, game_name: 'T', field_image_path: 'p' });
});

afterAll(async () => {
  await db.from('seasons').delete().eq('id', seasonId);
});

describe('migration 0004 — analysis tables', () => {
  it('creates every table', async () => {
    for (const table of ['metrics', 'dashboards', 'dashboard_charts', 'weight_presets']) {
      const { error } = await db.from(table).select('id').limit(1);
      expect(error, `${table}: ${error?.message}`).toBeNull();
    }
  });

  it('keeps metric names unique within a season', async () => {
    const metric = {
      season_id: seasonId,
      source_kind: 'meta',
      name: 'Entries per user',
      definition: { source: { kind: 'meta', measure: 'entries_per_user' }, aggregation: 'count', filters: {} },
    };
    expect((await db.from('metrics').insert({ id: uuid(), ...metric })).error).toBeNull();
    expect((await db.from('metrics').insert({ id: uuid(), ...metric })).error?.code).toBe('23505');
  });

  it('restricts source_kind to form and meta', async () => {
    const bad = await db.from('metrics').insert({
      id: uuid(),
      season_id: seasonId,
      source_kind: 'sql',
      name: 'Bad',
      definition: {},
    });
    expect(bad.error?.code).toBe('23514');
  });

  it('allows exactly one dashboard of each built-in kind per season, and many custom ones', async () => {
    const ranking = { season_id: seasonId, kind: 'ranking', name: 'Ranking', scope: { mode: 'season' } };
    expect((await db.from('dashboards').insert({ id: dashboardId, ...ranking })).error).toBeNull();
    expect((await db.from('dashboards').insert({ id: uuid(), ...ranking })).error?.code).toBe('23505');

    const custom = { season_id: seasonId, kind: 'custom', name: 'Mine', scope: { mode: 'season' } };
    expect((await db.from('dashboards').insert({ id: uuid(), ...custom })).error).toBeNull();
    expect((await db.from('dashboards').insert({ id: uuid(), ...custom, name: 'Mine 2' })).error).toBeNull();
  });

  it('restricts a chart span to 3, 6 or 12 (SPEC-FINAL 12.4)', async () => {
    const chart = { dashboard_id: dashboardId, position: 1, config: { type: 'bar' } };
    expect((await db.from('dashboard_charts').insert({ id: uuid(), ...chart, span: 6 })).error).toBeNull();
    expect((await db.from('dashboard_charts').insert({ id: uuid(), ...chart, span: 5 })).error?.code).toBe('23514');
  });

  it('keeps weight preset names unique within a season', async () => {
    const preset = { season_id: seasonId, name: 'Defence-heavy', weights: {} };
    expect((await db.from('weight_presets').insert({ id: uuid(), ...preset })).error).toBeNull();
    expect((await db.from('weight_presets').insert({ id: uuid(), ...preset })).error?.code).toBe('23505');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
pnpm --filter @frc/db test:integration test/analysis.itest.ts
```

Expected: `relation "public.metrics" does not exist`.

- [ ] **Step 3: Write the migration**

`packages/db/supabase/migrations/20260903093000_analysis.sql`:

```sql
-- Migration 0004 — metrics, dashboards, charts, weight presets (SPEC-FINAL §3.7).

create table public.metrics (
  id           uuid primary key,
  season_id    uuid not null references public.seasons(id) on delete cascade,
  source_kind  text not null check (source_kind in ('form','meta')),
  form_id      uuid references public.forms(id) on delete cascade,
  name         text not null,
  description  text,
  definition   jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (season_id, name)
);
create index metrics_delta_idx on public.metrics (season_id, updated_at);

create table public.dashboards (
  id         uuid primary key,
  season_id  uuid not null references public.seasons(id) on delete cascade,
  kind       text not null check (kind in
               ('custom','team','ranking','compare','match_preview','operational')),
  name       text not null,
  scope      jsonb not null,
  filters    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- exactly one of each built-in kind per season; 'custom' is unconstrained
create unique index dashboards_builtin_idx on public.dashboards (season_id, kind) where kind <> 'custom';
create index dashboards_delta_idx on public.dashboards (season_id, updated_at);

create table public.dashboard_charts (
  id            uuid primary key,
  dashboard_id  uuid not null references public.dashboards(id) on delete cascade,
  position      integer not null,
  span          integer not null check (span in (3,6,12)),
  config        jsonb not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index dashboard_charts_position_idx on public.dashboard_charts (dashboard_id, position);

create table public.weight_presets (
  id         uuid primary key,
  season_id  uuid not null references public.seasons(id) on delete cascade,
  name       text not null,
  weights    jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, name)
);
create index weight_presets_delta_idx on public.weight_presets (season_id, updated_at);

do $$
declare t text;
begin
  foreach t in array array['metrics','dashboards','dashboard_charts','weight_presets'] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
```

- [ ] **Step 4: Apply and re-run**

```bash
pnpm --filter @frc/db db:push && pnpm --filter @frc/db test:integration
```

Expected: `Finished supabase db push.`; every suite green, with the new file(s) from this task among them.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(db): add metrics, dashboards, charts and weight presets"
```

---

## Task 0.12: Migration 0005 — alliance selection

**Files:**
- Create: `packages/db/supabase/migrations/20260903094000_alliance.sql`
- Create: `packages/db/test/alliance.itest.ts`

**Interfaces:**
- Produces: `pick_lists`, `pick_list_entries`, `do_not_pick`, `alliances`, `alliance_slots`, `alliance_declines`. The feature is phase 2; the schema is phase 0.

- [ ] **Step 1: Write the failing test**

`packages/db/test/alliance.itest.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceClient, uuid } from './client';

const db = serviceClient();
const ids = { season: uuid(), event: uuid(), team: uuid(), user: uuid(), alliance: uuid(), list: uuid() };
const now = () => new Date().toISOString();
const clientStamps = { client_created_at: now(), client_updated_at: now() };

beforeAll(async () => {
  await db.from('seasons').insert({ id: ids.season, year: 1904, game_name: 'T', field_image_path: 'p' });
  await db.from('events').insert({ id: ids.event, season_id: ids.season, name: 'E', sort_order: 1 });
  await db.from('teams').insert({ id: ids.team, number: 999997, name: 'T' });
  await db.from('users').insert({
    id: ids.user, username: 'itest_alliance', full_name: 'A', password_hash: 'x', role: 'lead',
  });
  await db.from('alliances').insert({ id: ids.alliance, event_id: ids.event, number: 1 });
});

afterAll(async () => {
  await db.from('seasons').delete().eq('id', ids.season);
  await db.from('users').delete().eq('id', ids.user);
  await db.from('teams').delete().eq('id', ids.team);
});

describe('migration 0005 — alliance selection', () => {
  it('creates every table', async () => {
    for (const table of ['pick_lists', 'pick_list_entries', 'do_not_pick', 'alliances', 'alliance_slots', 'alliance_declines']) {
      const { error } = await db.from(table).select('id').limit(1);
      expect(error, `${table}: ${error?.message}`).toBeNull();
    }
  });

  it('allows exactly one first list and one second list per event', async () => {
    const list = { event_id: ids.event, kind: 'first', ...clientStamps };
    expect((await db.from('pick_lists').insert({ id: ids.list, ...list })).error).toBeNull();
    expect((await db.from('pick_lists').insert({ id: uuid(), ...list })).error?.code).toBe('23505');
    expect((await db.from('pick_lists').insert({ id: uuid(), ...list, kind: 'second' })).error).toBeNull();
  });

  it('carries a list-level version for the ordering guard (SPEC-FINAL 14.7)', async () => {
    const { data } = await db.from('pick_lists').select('version').eq('id', ids.list).single();
    expect(data!.version).toBe(1);
  });

  it('keeps a team once per live list and lets it come back after a soft delete', async () => {
    const row = { pick_list_id: ids.list, team_id: ids.team, rank: 1, ...clientStamps };
    const first = uuid();
    expect((await db.from('pick_list_entries').insert({ id: first, ...row })).error).toBeNull();
    expect((await db.from('pick_list_entries').insert({ id: uuid(), ...row })).error?.code).toBe('23505');
    await db.from('pick_list_entries').update({ deleted_at: now() }).eq('id', first);
    expect((await db.from('pick_list_entries').insert({ id: uuid(), ...row })).error).toBeNull();
  });

  it('requires a non-empty reason on a do-not-pick row (SPEC-FINAL 14.5)', async () => {
    const base = { event_id: ids.event, team_id: ids.team, created_by: ids.user, ...clientStamps };
    expect((await db.from('do_not_pick').insert({ id: uuid(), ...base, reason: '   ' })).error?.code).toBe('23514');
    expect((await db.from('do_not_pick').insert({ id: uuid(), ...base, reason: 'Broke down twice' })).error).toBeNull();
  });

  it('numbers alliances 1..8 only', async () => {
    expect((await db.from('alliances').insert({ id: uuid(), event_id: ids.event, number: 9 })).error?.code).toBe('23514');
  });

  it('allows an empty slot as a row with a null team, one row per (alliance, slot) (D31)', async () => {
    const slot = { id: uuid(), alliance_id: ids.alliance, slot: 'pick1', team_id: null, ...clientStamps };
    expect((await db.from('alliance_slots').insert(slot)).error).toBeNull();
    expect(
      (await db.from('alliance_slots').insert({ ...slot, id: uuid() })).error?.code,
    ).toBe('23505');
    expect((await db.from('alliance_slots').update({ team_id: ids.team }).eq('id', slot.id)).error).toBeNull();
    expect((await db.from('alliance_slots').update({ team_id: null }).eq('id', slot.id)).error).toBeNull();
  });

  it('restricts the slot vocabulary to captain, pick1, pick2 and backup', async () => {
    const bad = await db.from('alliance_slots').insert({
      id: uuid(), alliance_id: ids.alliance, slot: 'pick3', team_id: null, ...clientStamps,
    });
    expect(bad.error?.code).toBe('23514');
  });

  it('records a decline once per (alliance, team)', async () => {
    const row = { alliance_id: ids.alliance, team_id: ids.team, client_created_at: now() };
    expect((await db.from('alliance_declines').insert({ id: uuid(), ...row })).error).toBeNull();
    expect((await db.from('alliance_declines').insert({ id: uuid(), ...row })).error?.code).toBe('23505');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
pnpm --filter @frc/db test:integration test/alliance.itest.ts
```

Expected: `relation "public.pick_lists" does not exist`.

- [ ] **Step 3: Write the migration**

`packages/db/supabase/migrations/20260903094000_alliance.sql`:

```sql
-- Migration 0005 — alliance selection (SPEC-FINAL §3.8).

create table public.pick_lists (
  id                     uuid primary key,
  event_id               uuid not null references public.events(id) on delete cascade,
  kind                   text not null check (kind in ('first','second')),
  seeded_from_preset_id  uuid references public.weight_presets(id) on delete set null,
  seeded_from_weights    jsonb,
  version                integer not null default 1,   -- the ordering guard (§14.7)
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  client_created_at      timestamptz not null,
  client_updated_at      timestamptz not null,
  unique (event_id, kind)
);
create index pick_lists_delta_idx on public.pick_lists (event_id, updated_at);

create table public.pick_list_entries (
  id                 uuid primary key,
  pick_list_id       uuid not null references public.pick_lists(id) on delete cascade,
  team_id            uuid not null references public.teams(id) on delete restrict,
  rank               integer not null,
  note               text,
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  client_created_at  timestamptz not null,
  client_updated_at  timestamptz not null,
  deleted_at         timestamptz
);
create unique index pick_list_entries_live_idx
  on public.pick_list_entries (pick_list_id, team_id) where deleted_at is null;
create index pick_list_entries_rank_idx on public.pick_list_entries (pick_list_id, rank);
create index pick_list_entries_delta_idx on public.pick_list_entries (pick_list_id, updated_at);

create table public.do_not_pick (
  id                 uuid primary key,
  event_id           uuid not null references public.events(id) on delete cascade,
  team_id            uuid not null references public.teams(id) on delete restrict,
  reason             text not null check (length(btrim(reason)) > 0),
  created_by         uuid not null references public.users(id),
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  client_created_at  timestamptz not null,
  client_updated_at  timestamptz not null,
  deleted_at         timestamptz
);
create unique index do_not_pick_live_idx on public.do_not_pick (event_id, team_id) where deleted_at is null;
create index do_not_pick_delta_idx on public.do_not_pick (event_id, updated_at);

create table public.alliances (
  id         uuid primary key,
  event_id   uuid not null references public.events(id) on delete cascade,
  number     integer not null check (number between 1 and 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, number)
);

-- An empty slot is a row with team_id null, never an absent row (§3.8, D31).
create table public.alliance_slots (
  id                 uuid primary key,
  alliance_id        uuid not null references public.alliances(id) on delete cascade,
  slot               text not null check (slot in ('captain','pick1','pick2','backup')),
  team_id            uuid references public.teams(id) on delete restrict,
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  client_created_at  timestamptz not null,
  client_updated_at  timestamptz not null,
  unique (alliance_id, slot)
);
create index alliance_slots_alliance_idx on public.alliance_slots (alliance_id);

create table public.alliance_declines (
  id                 uuid primary key,
  alliance_id        uuid not null references public.alliances(id) on delete cascade,
  team_id            uuid not null references public.teams(id) on delete restrict,
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  client_created_at  timestamptz not null,
  deleted_at         timestamptz,
  unique (alliance_id, team_id)
);
create index alliance_declines_alliance_idx on public.alliance_declines (alliance_id);

do $$
declare t text;
begin
  foreach t in array array[
    'pick_lists','pick_list_entries','do_not_pick','alliances','alliance_slots','alliance_declines'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
```

- [ ] **Step 4: Apply and re-run the whole database suite**

```bash
pnpm --filter @frc/db db:push && pnpm --filter @frc/db test:integration
```

Expected: `Finished supabase db push.`; every suite green, with the new file(s) from this task among them.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(db): add the alliance-selection schema"
```

---
## Task 0.13: Generated database types, committed and drift-checked

**Files:**
- Create: `packages/db/src/database.types.ts` (generated)
- Modify: `packages/db/src/index.ts` (replacing task 0.8's placeholder)
- Create: `packages/db/test/types-drift.itest.ts`
- Modify: `packages/db/package.json`, `apps/server/src/db/client.ts`

**Interfaces:**
- Produces: `type Database` and `type Tables<'name'>` from `@frc/db`; `getServiceClient` becomes `SupabaseClient<Database>`, so a migration that changes a column surfaces as a compile error rather than a runtime surprise (SPEC-FINAL §16.1).

- [ ] **Step 1: Generate the types**

```bash
pnpm --filter @frc/db db:types
```

Expected: `packages/db/src/database.types.ts` is written and begins with `export type Json =` followed by `export type Database = {`.

- [ ] **Step 2: Write the drift test**

`packages/db/test/types-drift.itest.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('generated database types', () => {
  it('match the linked dev project (regenerate with `pnpm --filter @frc/db db:types`)', () => {
    const committed = readFileSync(
      fileURLToPath(new URL('../src/database.types.ts', import.meta.url)),
      'utf8',
    );
    const fresh = execFileSync(
      'pnpm',
      ['exec', 'supabase', 'gen', 'types', 'typescript', '--linked', '--schema', 'public'],
      {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        encoding: 'utf8',
        shell: true,
      },
    );
    expect(fresh.trim()).toBe(committed.trim());
  });
});
```

**Standing rule this test enforces:** *any* task that adds a migration must re-run `pnpm --filter @frc/db db:types` and commit the result in the same diff. Phase 1 adds no migrations — every table the plan needs is created in tasks 0.8–0.12 — so this rule only bites if a build chat invents one. If it does, that is a signal the task was wrong.

- [ ] **Step 3: Write the package surface**

`packages/db/src/index.ts` (replace the task 0.8 placeholder):

```ts
export type { Database, Json } from './database.types';

import type { Database } from './database.types';

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type Insertable<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type Updatable<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
```

- [ ] **Step 4: Type the server client**

`apps/server/src/db/client.ts` (replace):

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@frc/db';
import type { ServerConfig } from '../config';

export type Db = SupabaseClient<Database>;

let cached: Db | null = null;

/** The service-role client. Server-side only; never reachable from a client bundle. */
export function getServiceClient(config: ServerConfig): Db {
  cached ??= createClient<Database>(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
```

Add `"@frc/db": "workspace:*"` to `apps/server` dependencies.

- [ ] **Step 5: Run and watch it pass**

```bash
pnpm install && pnpm --filter @frc/db test:integration test/types-drift.itest.ts && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task; typecheck clean across all four packages.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(db): commit the generated database types and type the service client"
```

---

## Task 0.14: The dev seed script

**Files:**
- Create: `packages/db/src/seed/fixtures.ts`, `packages/db/src/seed/seed.ts`, `packages/db/src/seed/run.ts`
- Create: `packages/db/test/seed.itest.ts`
- Modify: `packages/db/package.json` (`"seed": "tsx src/seed/run.ts"`), root `package.json` (`"seed": "pnpm --filter @frc/db seed"`)

**Interfaces:**
- Produces: `SEED` — a frozen object of **deterministic UUIDs** (`SEED.season`, `SEED.event`, `SEED.team[i]`, `SEED.formVersion`, `SEED.scouter`) that the phase 1 walking skeleton references directly; `seedDevDatabase(db)`; the CLI `pnpm seed`.

**Rules (SPEC-FINAL §19.7, §19.8):** manual by design; never run against production; writes rows directly at the database level and is not a use-case caller; **no personal identity anywhere** — no real name, no email, no personal username.

- [ ] **Step 1: Write the failing test**

`packages/db/test/seed.itest.ts`:

```ts
import { describe, expect, it, beforeAll } from 'vitest';
import { serviceClient } from './client';
import { SEED } from '../src/seed/fixtures';
import { seedDevDatabase } from '../src/seed/seed';

const db = serviceClient();

beforeAll(async () => {
  await seedDevDatabase(db);
});

describe('dev seed (SPEC-FINAL 19.7)', () => {
  it('creates the fake season, one event and about thirty teams', async () => {
    const season = await db.from('seasons').select('*').eq('id', SEED.season).single();
    expect(season.data!.year).toBe(SEED.year);
    const events = await db.from('events').select('id').eq('season_id', SEED.season);
    expect(events.data!.length).toBeGreaterThanOrEqual(1);
    const roster = await db.from('event_teams').select('id').eq('event_id', SEED.event);
    expect(roster.data!.length).toBe(30);
  });

  it('creates a published match form with two versions and scoring rules', async () => {
    const versions = await db.from('form_versions').select('*').eq('form_id', SEED.matchForm);
    expect(versions.data!.length).toBe(2);
    const form = await db.from('forms').select('active_version_id').eq('id', SEED.matchForm).single();
    expect(form.data!.active_version_id).toBe(SEED.formVersion);
    const rules = await db.from('scoring_rules').select('field_key').eq('form_id', SEED.matchForm);
    expect(rules.data!.length).toBeGreaterThan(0);
  });

  it('gives the match form its fields too — the ids must not collide across versions', async () => {
    for (const versionId of [SEED.formVersionOld, SEED.formVersion]) {
      const fields = await db.from('form_fields').select('key').eq('form_version_id', versionId);
      expect(fields.data!.map((f) => f.key).sort(), versionId).toEqual(
        ['auto_left_zone', 'auto_notes', 'endgame_climb', 'notes', 'teleop_notes'],
      );
    }
  });

  it('creates a published super form with its own fields, so both v1 kinds exist', async () => {
    const form = await db.from('forms').select('kind, active_version_id').eq('id', SEED.superForm).single();
    expect(form.data!.kind).toBe('super');
    expect(form.data!.active_version_id).toBe(SEED.superFormVersion);
    const fields = await db.from('form_fields').select('key').eq('form_version_id', SEED.superFormVersion);
    expect(fields.data!.map((f) => f.key).sort()).toEqual(['driver_skill', 'super_notes']);
  });

  it('creates about a hundred scouting entries, all bound to a form version', async () => {
    const entries = await db.from('scouting_entries').select('id, form_version_id').eq('event_id', SEED.event);
    expect(entries.data!.length).toBeGreaterThanOrEqual(100);
    expect(entries.data!.every((e) => e.form_version_id !== null)).toBe(true);
  });

  it('sets the active context to the seeded season and event', async () => {
    const settings = await db.from('app_settings').select('*').eq('id', true).single();
    expect(settings.data!.active_season_id).toBe(SEED.season);
    expect(settings.data!.active_event_id).toBe(SEED.event);
  });

  it('creates one seeded user per role and depends on no personal identity', async () => {
    const users = await db.from('users').select('username, full_name, role').in('id', [
      SEED.scouter, SEED.lead, SEED.admin,
    ]);
    expect(users.data!.map((u) => u.role).sort()).toEqual(['admin', 'lead', 'scouter']);
    for (const user of users.data!) {
      expect(user.username).toMatch(/^seed_/);
      expect(user.full_name).toMatch(/^Seed /);
      expect(JSON.stringify(user)).not.toMatch(/@/);
    }
  });

  it('never records a zero for a dead robot', async () => {
    const dead = await db
      .from('scouting_entries')
      .select('robot_status, data')
      .eq('event_id', SEED.event)
      .in('robot_status', ['no_show', 'disabled']);
    expect(dead.data!.length).toBeGreaterThan(0);
    for (const row of dead.data!) expect(row.data).toEqual({});
  });

  it('is idempotent — running it twice changes nothing', async () => {
    await seedDevDatabase(db);
    const entries = await db.from('scouting_entries').select('id').eq('event_id', SEED.event);
    expect(entries.data!.length).toBeLessThan(200);
  });

  it('refuses to run against a URL that is not the dev project', async () => {
    await expect(seedDevDatabase(db, { requireUrlToContain: 'not-this-project' })).rejects.toThrow(
      /dev/i,
    );
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
pnpm --filter @frc/db test:integration test/seed.itest.ts
```

Expected: `Failed to resolve import "../src/seed/fixtures"`.

- [ ] **Step 3: Write the fixtures**

`packages/db/src/seed/fixtures.ts`:

```ts
/**
 * Deterministic ids so the walking skeleton (phase 1 group A) and the smoke suite can
 * reference seeded rows without querying for them. Never used outside dev and CI.
 */
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const SEED = Object.freeze({
  year: 1999,
  season: id(1),
  event: id(2),
  matchForm: id(3),
  formVersionOld: id(4),
  formVersion: id(5),
  scouter: id(6),
  lead: id(7),
  admin: id(8),
  superForm: id(9),
  superFormVersion: id(10),
  team: (index: number): string => id(1000 + index),
  match: (number: number): string => id(2000 + number),
  matchTeam: (number: number, slot: number): string => id(20000 + number * 10 + slot),
  entry: (index: number): string => id(50000 + index),
  /** Unique per (form version, field index) — see the note in seed.ts. */
  formField: (versionIndex: number, fieldIndex: number): string =>
    id(60000 + versionIndex * 100 + fieldIndex),
  /** bcrypt hash of the password "seedpass1" at cost 10. Dev only. */
  passwordHash: '$2a$10$Vv3nJXsX0G2xh0m0Y6mCkuJ0iH5wLZ0Q0y2xJ4bqz2s5g3lI1nqhK',
});

/**
 * Every element carries the same keys, with nulls where a value does not apply. A
 * heterogeneous `as const` array would make `f.points` a type error on the members
 * that omit it, which is exactly the kind of thing `strict` is for.
 */
export type SeedField = {
  key: string;
  label: string;
  type: 'counter' | 'toggle' | 'single_select' | 'long_text';
  phase: 'auto' | 'teleop' | 'endgame' | 'post_match';
  unit: 'count' | 'boolean' | 'enum' | 'text';
  direction: 'higher_is_better' | 'lower_is_better' | 'neutral';
  description: string;
  points: number | null;
  option_points: Record<string, number> | null;
  config: Record<string, unknown>;
  expected_range: { min: number; max: number } | null;
};

export const SEED_FIELDS: SeedField[] = [
  { key: 'auto_notes', label: 'Auto notes scored', type: 'counter', phase: 'auto', unit: 'count',
    direction: 'higher_is_better', description: 'Game pieces scored in autonomous',
    points: 5, option_points: null,
    config: { min: 0, max: 10, step: 1 }, expected_range: { min: 0, max: 10 } },
  { key: 'auto_left_zone', label: 'Left the starting zone', type: 'toggle', phase: 'auto',
    unit: 'boolean', direction: 'higher_is_better', description: 'Robot left its starting zone',
    points: 2, option_points: null, config: {}, expected_range: null },
  { key: 'teleop_notes', label: 'Teleop notes scored', type: 'counter', phase: 'teleop', unit: 'count',
    direction: 'higher_is_better', description: 'Game pieces scored in teleop',
    points: 2, option_points: null,
    config: { min: 0, max: 40, step: 1 }, expected_range: { min: 0, max: 40 } },
  { key: 'endgame_climb', label: 'Climb level', type: 'single_select', phase: 'endgame', unit: 'enum',
    direction: 'higher_is_better', description: 'How high the robot climbed',
    points: 0, option_points: { none: 0, park: 2, low: 6, high: 10 },
    config: { is_ordinal: true, options: [
      { value: 'none', label: 'No climb' },
      { value: 'park', label: 'Parked' },
      { value: 'low', label: 'Low rung' },
      { value: 'high', label: 'High rung' },
    ] },
    expected_range: null },
  { key: 'notes', label: 'Notes', type: 'long_text', phase: 'post_match', unit: 'text',
    direction: 'neutral', description: 'Anything worth telling a strategy lead',
    points: null, option_points: null, config: {}, expected_range: null },
];

/** The super form is one record per (team, event): driver skill and a free-text read. */
export const SEED_SUPER_FIELDS: SeedField[] = [
  { key: 'driver_skill', label: 'Driver skill', type: 'single_select', phase: 'post_match',
    unit: 'enum', direction: 'higher_is_better', description: 'Overall driver control across the event',
    points: null, option_points: null,
    config: { is_ordinal: true, options: [
      { value: 'poor', label: 'Poor' },
      { value: 'ok', label: 'OK' },
      { value: 'strong', label: 'Strong' },
    ] },
    expected_range: null },
  { key: 'super_notes', label: 'Super notes', type: 'long_text', phase: 'post_match', unit: 'text',
    direction: 'neutral', description: 'Defence, penalties, breakdowns, anything subjective',
    points: null, option_points: null, config: {}, expected_range: null },
];
```

- [ ] **Step 4: Write the seed**

`packages/db/src/seed/seed.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import { SEED, SEED_FIELDS, SEED_SUPER_FIELDS } from './fixtures';

export type SeedOptions = { requireUrlToContain?: string };

const iso = (dayOffset: number, minute: number): string =>
  new Date(Date.UTC(1999, 2, 1 + dayOffset, 9, minute)).toISOString();

/**
 * Fills the DEV project with a fake season (SPEC-FINAL 19.7). Manual by design,
 * idempotent, and never run against production. It writes rows directly and is not
 * a use-case caller, which is what lets it run before auth and roles exist (§16.5).
 */
export async function seedDevDatabase(
  db: SupabaseClient<Database>,
  options: SeedOptions = {},
): Promise<void> {
  const guard = options.requireUrlToContain;
  if (guard !== undefined) {
    // The caller asserts which project this must be. A mismatch stops the run.
    const url = (db as unknown as { supabaseUrl: string }).supabaseUrl ?? '';
    if (!url.includes(guard)) {
      throw new Error(`refusing to seed: this is not the expected dev project (${guard})`);
    }
  }

  await db.from('seasons').upsert({
    id: SEED.season,
    year: SEED.year,
    game_name: 'SEED GAME 1999',
    field_image_path: `seasons/${SEED.year}/field.webp`,
  });

  await db.from('events').upsert({
    id: SEED.event,
    season_id: SEED.season,
    name: 'Seed District Event',
    sort_order: 1,
  });

  await db.from('users').upsert([
    { id: SEED.scouter, username: 'seed_scouter', full_name: 'Seed Scouter',
      password_hash: SEED.passwordHash, role: 'scouter' },
    { id: SEED.lead, username: 'seed_lead', full_name: 'Seed Lead',
      password_hash: SEED.passwordHash, role: 'lead' },
    { id: SEED.admin, username: 'seed_admin', full_name: 'Seed Admin',
      password_hash: SEED.passwordHash, role: 'admin' },
  ]);

  const teams = Array.from({ length: 30 }, (_, i) => ({
    id: SEED.team(i),
    number: 8000 + i,
    name: `Seed Team ${8000 + i}`,
  }));
  await db.from('teams').upsert(teams);
  await db.from('event_teams').upsert(
    teams.map((t, i) => ({ id: SEED.team(500 + i), event_id: SEED.event, team_id: t.id })),
    { onConflict: 'id' },
  );

  await db.from('forms').upsert({
    id: SEED.matchForm,
    season_id: SEED.season,
    kind: 'match',
    name: 'Seed match form',
    timer_config: { phases: [
      { phase: 'auto', seconds: 15 },
      { phase: 'teleop', seconds: 135 },
      { phase: 'endgame', seconds: 30 },
    ] },
  });
  await db.from('form_versions').upsert([
    { id: SEED.formVersionOld, form_id: SEED.matchForm, version_no: 1,
      published_at: iso(0, 0), is_locked: true },
    { id: SEED.formVersion, form_id: SEED.matchForm, version_no: 2,
      published_at: iso(0, 5), is_locked: true },
  ]);
  await db.from('forms').update({ active_version_id: SEED.formVersion }).eq('id', SEED.matchForm);

  // The super form: one match form and one super form per season (SPEC-FINAL 3.3).
  await db.from('forms').upsert({
    id: SEED.superForm,
    season_id: SEED.season,
    kind: 'super',
    name: 'Seed super form',
    timer_config: { phases: [] },
  });
  await db.from('form_versions').upsert({
    id: SEED.superFormVersion, form_id: SEED.superForm, version_no: 1,
    published_at: iso(0, 0), is_locked: true,
  });
  await db.from('forms')
    .update({ active_version_id: SEED.superFormVersion })
    .eq('id', SEED.superForm);

  // The field id must be unique PER VERSION. Deriving it from the version id by
  // string surgery collapsed all three versions onto one id set, and the upserts
  // then overwrote each other — leaving the match form with no fields at all,
  // silently, because only the last pass survived. Use the fixture allocator.
  for (const [versionIndex, [versionId, fields]] of [
    [SEED.formVersionOld, SEED_FIELDS],
    [SEED.formVersion, SEED_FIELDS],
    [SEED.superFormVersion, SEED_SUPER_FIELDS],
  ].entries()) {
    await db.from('form_fields').upsert(
      fields.map((f, i) => ({
        id: SEED.formField(versionIndex, i),
        form_version_id: versionId,
        key: f.key,
        label: f.label,
        type: f.type,
        display_order: i + 1,
        required: f.type === 'counter',
        config: f.config,
        description: f.description,
        unit: f.unit,
        phase: f.phase,
        direction: f.direction,
        expected_range: f.expected_range,
        is_ordinal: f.type === 'single_select' ? true : null,
      })),
    );
  }

  await db.from('scoring_rules').upsert(
    SEED_FIELDS.filter((f) => f.points !== null).map((f, i) => ({
      id: SEED.team(900 + i),
      form_id: SEED.matchForm,
      field_key: f.key,
      points: f.points ?? 0,
      option_points: f.option_points,
    })),
    { onConflict: 'form_id,field_key' },
  );

  // 20 qualification matches x 6 robots = 120 entries; a handful of them are dead robots.
  const matches = Array.from({ length: 20 }, (_, i) => ({
    id: SEED.match(i + 1),
    event_id: SEED.event,
    match_type: 'qualification' as const,
    number: i + 1,
  }));
  await db.from('matches').upsert(matches);

  const matchTeams: Database['public']['Tables']['match_teams']['Insert'][] = [];
  const entries: Database['public']['Tables']['scouting_entries']['Insert'][] = [];

  for (let m = 0; m < matches.length; m += 1) {
    for (let slot = 0; slot < 6; slot += 1) {
      const teamIndex = (m * 6 + slot) % teams.length;
      const alliance = slot < 3 ? 'red' : 'blue';
      const station = (slot % 3) + 1;
      matchTeams.push({
        id: SEED.matchTeam(m + 1, slot),
        match_id: matches[m]!.id,
        alliance,
        station,
        team_id: teams[teamIndex]!.id,
      });

      const index = m * 6 + slot;
      const dead = index % 37 === 0;
      const brokeDown = index % 23 === 0 && !dead;
      const status = dead ? (index % 74 === 0 ? 'no_show' : 'disabled') : brokeDown ? 'broke_down' : 'played';
      entries.push({
        id: SEED.entry(index),
        form_version_id: index % 11 === 0 ? SEED.formVersionOld : SEED.formVersion,
        form_kind: 'match',
        event_id: SEED.event,
        match_id: matches[m]!.id,
        team_id: teams[teamIndex]!.id,
        alliance,
        scouter_id: [SEED.scouter, SEED.lead, SEED.admin][index % 3]!,
        robot_status: status,
        breakdown_seconds: status === 'broke_down' ? 60 + (index % 60) : null,
        // A dead or no-show robot records no field values at all (SPEC-FINAL 8.2).
        data: dead
          ? {}
          : {
              auto_notes: index % 5,
              auto_left_zone: index % 3 !== 0,
              teleop_notes: (index * 7) % 19,
              endgame_climb: ['none', 'park', 'low', 'high'][index % 4],
              notes: index % 9 === 0 ? 'הרובוט היה איטי בסוף המשחק' : '',
            },
        client_created_at: iso(1, index),
        client_updated_at: iso(1, index),
      });
    }
  }

  await db.from('match_teams').upsert(matchTeams);
  await db.from('scouting_entries').upsert(entries);

  await db.from('app_settings').update({
    active_season_id: SEED.season,
    active_event_id: SEED.event,
  }).eq('id', true);
}
```

`packages/db/src/seed/run.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import { seedDevDatabase } from './seed';

loadEnv({ path: fileURLToPath(new URL('../../../../apps/server/.env', import.meta.url)) });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must name the DEV project.');
}

const ref = process.env.SUPABASE_DEV_PROJECT_REF;
if (ref && !url.includes(ref)) {
  throw new Error(
    `refusing to seed: SUPABASE_URL does not contain SUPABASE_DEV_PROJECT_REF (${ref}). ` +
      'The seed script never runs against production.',
  );
}

await seedDevDatabase(createClient<Database>(url, key, { auth: { persistSession: false } }));
// eslint-disable-next-line no-console
console.warn('dev database seeded');
```

- [ ] **Step 5: Run and watch it pass**

```bash
pnpm seed && pnpm --filter @frc/db test:integration test/seed.itest.ts
```

Expected: `dev database seeded`; every suite green, with the new file(s) from this task among them.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(db): add the manual dev seed script with deterministic fixtures"
```

---

## Task 0.15: CI on `develop` and on pull requests into `main`

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/README.md`

**Interfaces:**
- Produces: the pipeline of SPEC-FINAL §19.3 — **install → lint → typecheck → apply migrations to dev → unit tests → smoke suite → build both apps**. Until phase 1 ships its use cases, the smoke step is the `/health` wiring check alone (§19.3, D30). The step exists from the first push so it can never be forgotten.

**Migrations are applied to dev only on a push to `develop`.** A pull request into `main` runs everything else and never touches a database.

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [develop]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with: { version: 9.12.3 }

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Environment worksheet has not drifted
        run: pnpm env:example:check

      - name: Required ops documentation is present
        run: pnpm docs:check

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      # SPEC-FINAL 19.4: CI auto-applies migrations to the DEV project, never production.
      - name: Apply migrations to the dev project
        if: github.event_name == 'push'
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
        run: |
          pnpm --filter @frc/db exec supabase link \
            --project-ref ${{ secrets.SUPABASE_DEV_PROJECT_REF }} \
            --password ${{ secrets.SUPABASE_DEV_DB_PASSWORD }}
          pnpm --filter @frc/db exec supabase db push \
            --password ${{ secrets.SUPABASE_DEV_DB_PASSWORD }}

      - name: Unit tests
        run: pnpm test

      # SPEC-FINAL 19.3 / D30: this is the /health wiring check until phase 1's use cases
      # exist, then it grows into the full smoke suite of 18.4. The step is present from
      # the first push so it can never be forgotten.
      - name: Smoke suite
        env:
          SMOKE_API_BASE_URL: ${{ secrets.SMOKE_API_BASE_URL }}
          SMOKE_SUPABASE_URL: ${{ secrets.SMOKE_SUPABASE_URL }}
          SMOKE_SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SMOKE_SUPABASE_SERVICE_ROLE_KEY }}
        run: pnpm smoke

      - name: Build both apps
        env:
          VITE_API_BASE_URL: ${{ secrets.SMOKE_API_BASE_URL }}
          VITE_DEVICE_WIPE_CODE: ci-build-placeholder
        run: pnpm build
```

- [ ] **Step 2: Write the phase 0 smoke check**

Add to root `package.json`: `"smoke": "node scripts/smoke.mjs"`.

`scripts/smoke.mjs`:

```js
#!/usr/bin/env node
// Phase 0 smoke suite: the /health wiring check alone (SPEC-FINAL 19.3, D30).
// Phase 1 task 1.62 replaces this with the full suite of 18.4.
const base = process.env.SMOKE_API_BASE_URL;
if (!base) {
  console.error('SMOKE_API_BASE_URL is not set. See docs/ops/ENVIRONMENT.md §3.');
  process.exit(1);
}

const url = `${base.replace(/\/+$/, '')}/health`;
const res = await fetch(url, { headers: { accept: 'application/json' } });
const body = await res.json().catch(() => ({}));

if (res.status !== 200 || body.status !== 'ok' || body.database !== 'ok') {
  console.error(`smoke failed: GET ${url} -> ${res.status} ${JSON.stringify(body)}`);
  process.exit(1);
}
console.warn(`smoke ok: GET ${url} -> 200 ${JSON.stringify(body)}`);
```

`.github/workflows/README.md` — three lines: what each workflow does, which secrets it consumes (by name, never by value), and the standing rule that **no workflow may ever reference a production Supabase secret**.

- [ ] **Step 3: Commit and push the branch**

```bash
git checkout develop && git pull && git checkout -b feat/ci
git add -A && git commit -m "ci: add the develop pipeline with the health wiring check"
git push -u origin feat/ci
```

- [ ] **Step 4: Do task 0.17 before merging this**

**The first CI run cannot be green until something is deployed**, because the smoke step calls `/health` on a real deployment. That is not a flaw in the pipeline; it is the order the two tasks have to happen in. So: leave this branch open, complete **task 0.17**, then come back.

- [ ] **Step 5: Merge and watch the run**

```bash
gh pr create --base develop --title "ci: develop pipeline" --fill && gh pr merge --squash && gh run watch
```

Expected: every step green. `Apply migrations to the dev project` prints `Remote database is up to date.` (the migrations were pushed by hand in tasks 0.8–0.12). `Smoke suite` prints `smoke ok: GET https://<dev-server>/health -> 200 {"status":"ok","database":"ok",...}`.

---

## Task 0.16: The twice-weekly keep-alive workflow

**Files:**
- Create: `.github/workflows/keepalive.yml`

**Interfaces:**
- Produces: the **one** scheduled job in v1 (SPEC-FINAL §19.6). It calls `/health` on both the dev and the production deployments, which performs one trivial database read — the thing that actually counts as activity against the free-tier idle pause.

- [ ] **Step 1: Write the workflow**

`.github/workflows/keepalive.yml`:

```yaml
name: Keep-alive

# SPEC-FINAL 19.6: exactly one scheduled job in v1. No Vercel Cron, no background
# jobs, no database-side scheduling. Twice a week is enough against the ~7-day
# Supabase free-tier idle pause.
on:
  schedule:
    - cron: '17 5 * * 1' # Mondays 05:17 UTC
    - cron: '17 5 * * 4' # Thursdays 05:17 UTC
  workflow_dispatch:

jobs:
  ping:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    strategy:
      fail-fast: false
      matrix:
        target:
          - name: dev
            secret: HEALTHCHECK_DEV_URL
          - name: production
            secret: HEALTHCHECK_PROD_URL
    steps:
      - name: Ping ${{ matrix.target.name }}
        env:
          URL: ${{ secrets[matrix.target.secret] }}
        run: |
          if [ -z "$URL" ]; then
            echo "::error::${{ matrix.target.secret }} is not set (docs/ops/ENVIRONMENT.md §3)"
            exit 1
          fi
          body=$(curl --fail --silent --show-error --max-time 30 "$URL")
          echo "$body"
          echo "$body" | grep -q '"database":"ok"'
```

- [ ] **Step 2: Run it by hand and read the output**

```bash
gh workflow run keepalive.yml && sleep 20 && gh run list --workflow=keepalive.yml --limit 1
```

Expected: both matrix jobs succeed; each log line shows `{"status":"ok","database":"ok","time":"..."}`.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "ci: add the twice-weekly health keep-alive for both deployments"
```

---

## Task 0.17: Deploy both apps and prove the wiring

**Files:**
- Create: `apps/client/vercel.json`
- Modify: `apps/server/vercel.json` (if the dashboard settings need it), `docs/ops/SETUP.md` (record the exact settings that worked)

**Interfaces:**
- Produces: four live deployments (client × 2 environments, server × 2) and a green `/health` on both server environments. This is the last phase 0 task and, together with a green CI run, closes the phase 0 gate.

**Requires the gate.** It uses both Vercel projects and both Supabase projects.

- [ ] **Step 1: Configure the client project**

`apps/client/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "cd ../.. && pnpm turbo run build --filter=@frc/client",
  "outputDirectory": "dist",
  "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
  "headers": [
    {
      "source": "/sw.js",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }]
    }
  ]
}
```

In the Vercel dashboard for the **client** project set Root Directory to `apps/client` and Node.js Version to 22.

- [ ] **Step 2: Configure the server project**

In the Vercel dashboard for the **server** project set Root Directory to `apps/server`, Framework Preset to *Other*, and Node.js Version to 22. `apps/server/vercel.json` (task 0.3) already pins the function runtime and rewrites every path into `api/index`.

- [ ] **Step 3: Deploy**

```bash
git push origin develop
```

Wait for both Vercel projects to finish their Preview deployments, then promote each to Production from the dashboard (or push to `main` through a reviewed PR once CI is green).

- [ ] **Step 4: Prove the server wiring against both environments**

```bash
curl -s https://<preview-server-host>/health | tee /dev/stderr | grep -q '"database":"ok"' && echo PREVIEW_OK
curl -s https://<production-server-host>/health | tee /dev/stderr | grep -q '"database":"ok"' && echo PRODUCTION_OK
```

Expected: each prints `{"status":"ok","database":"ok","time":"2026-..."}` followed by `PREVIEW_OK` / `PRODUCTION_OK`. A 503 with `relation "app_settings" does not exist` means that environment's Supabase project has not been migrated — apply the migrations there (production by hand, one deliberate command) and retry.

- [ ] **Step 5: Prove the client is installable and works offline**

Open the client production URL on a phone, install it to the home screen, then put the phone into airplane mode and cold-start the installed app.

Expected: the app shell renders with the version string visible and no network error. This is the first proof of the §9.1 requirement and it is verified by hand, not by a test.

- [ ] **Step 6: Record what worked**

Append the exact Vercel settings (root directory, build command, output directory, install command, Node version) to the *Vercel — client project* and *Vercel — server project* sections of `docs/ops/SETUP.md`, replacing any guesswork with what actually deployed.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "ops: deploy both apps and record the settings that worked"
```

---

## Phase 0 gate

Tick all six before starting phase 1 (SPEC-FINAL §20.4):

- [ ] Both apps deployed from the repo (task 0.17).
- [ ] Migrations applied to **both** Supabase projects — dev by CI, production by hand.
- [ ] CI green on `develop` (task 0.15).
- [ ] The `/health` wiring check green on both server environments.
- [ ] The seed script fills the dev project (task 0.14).
- [ ] `SETUP.md` followed start-to-finish **by someone reading it rather than remembering it**. If a step was ambiguous, fix the document before moving on — this is the deliverable, not a formality.

---
# Phase 1 — Core loop

SPEC-FINAL §20.2. Gate (§20.4): a student who has never seen the app enters 10 real match entries on a real phone in airplane mode, syncs, and the ranking table is correct — no help, no coaching, watched not assisted. Plus the full smoke suite green in CI, `RUNBOOK.md` written, and the offline path verified with the network actually off.

The order below is SPEC-FINAL §20.2's order, and the vertical slice of §20.3 comes first, before auth and before any generalisation.

---

# Phase 1 A — the walking skeleton (§20.3)

**What this group builds:** the §1.2 success criterion, end to end and deliberately ugly. One hardcoded form, filled in on a real phone in airplane mode, synced when the network returns, visible on a laptop. It runs against the **single seeded user, season, event, team and form version created by the phase 0 seed script** (§20.2), so it needs neither auth nor the management pages to exist.

**What it deliberately does not do yet:** no login (the caller is derived from each operation's `author_user_id`, which is where it lives permanently anyway — §7.5, §9.4); no conflict detection beyond idempotency; no form builder; four field types instead of fourteen. Group B adds the bearer token on top of the same authorization path; group F adds the full conflict policy on top of the same push endpoint.

---

## Task 1.1: Shared — the outbox operation and the push/pull wire types

**Files:**
- Create: `packages/shared/src/sync/operation.ts`, `packages/shared/src/sync/operation.test.ts`
- Create: `packages/shared/src/sync/protocol.ts`, `packages/shared/src/sync/protocol.test.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/package.json` (add `"zod": "^3.23.8"`)

**Interfaces:**
- Produces:
  - `type Operation`, `operationSchema`, `SYNC_ENTITIES`, `type SyncEntity`
  - `type PushRequest`, `pushRequestSchema`, `type PushResult`, `type PushResponse`, `MAX_OPERATIONS_PER_PUSH = 200`
  - `type PullRequest`, `pullRequestSchema`, `type PullResponse`, `PULL_ENTITY_KEYS` (the 24 keys of §9.3), `WATERMARK_OVERLAP_MS = 5000`
  - `isAck(status)` — true for `applied`, `noop`, `divergence`, `duplicate`; false for `rejected`. This one function is the durability rule's test (§9.4).

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/sync/operation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { operationSchema, SYNC_ENTITIES, type Operation } from './operation';

const valid: Operation = {
  op_id: '11111111-1111-4111-8111-111111111111',
  entity: 'scouting_entry',
  row_id: '22222222-2222-4222-8222-222222222222',
  action: 'create',
  base_version: null,
  payload: { team_id: 't' },
  author_user_id: '33333333-3333-4333-8333-333333333333',
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  seq: 1,
};

describe('Operation', () => {
  it('accepts a well-formed create', () => {
    expect(operationSchema.parse(valid)).toEqual(valid);
  });

  it('requires base_version to be null on a create and a number on an update', () => {
    expect(operationSchema.safeParse({ ...valid, action: 'update', base_version: null }).success).toBe(false);
    expect(operationSchema.safeParse({ ...valid, action: 'update', base_version: 3 }).success).toBe(true);
    expect(operationSchema.safeParse({ ...valid, action: 'create', base_version: 3 }).success).toBe(false);
  });

  it('requires an empty payload on a delete', () => {
    expect(
      operationSchema.safeParse({ ...valid, action: 'delete', base_version: 1, payload: { a: 1 } }).success,
    ).toBe(false);
    expect(
      operationSchema.safeParse({ ...valid, action: 'delete', base_version: 1, payload: {} }).success,
    ).toBe(true);
  });

  it('carries author_user_id, because push authorizes per operation and not per bearer', () => {
    const { author_user_id: _omitted, ...without } = valid;
    expect(operationSchema.safeParse(without).success).toBe(false);
  });

  it('covers exactly the seven syncable entities of SPEC-FINAL 9.4', () => {
    expect([...SYNC_ENTITIES]).toEqual([
      'scouting_entry',
      'match',
      'pick_list',
      'pick_list_entry',
      'do_not_pick',
      'alliance_slot',
      'alliance_decline',
    ]);
  });

  it('rejects a non-ISO client timestamp', () => {
    expect(operationSchema.safeParse({ ...valid, client_created_at: '14/11/2026' }).success).toBe(false);
  });
});
```

`packages/shared/src/sync/protocol.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  isAck,
  MAX_OPERATIONS_PER_PUSH,
  PULL_ENTITY_KEYS,
  pullRequestSchema,
  pushRequestSchema,
  WATERMARK_OVERLAP_MS,
} from './protocol';

describe('push protocol', () => {
  it('caps a batch at 200 operations (SPEC-FINAL 9.3.1)', () => {
    expect(MAX_OPERATIONS_PER_PUSH).toBe(200);
    const op = {
      op_id: '11111111-1111-4111-8111-111111111111',
      entity: 'scouting_entry',
      row_id: '22222222-2222-4222-8222-222222222222',
      action: 'create',
      base_version: null,
      payload: {},
      author_user_id: '33333333-3333-4333-8333-333333333333',
      client_created_at: '2026-11-14T09:00:00.000Z',
      client_updated_at: '2026-11-14T09:00:00.000Z',
      seq: 1,
    };
    const many = Array.from({ length: 201 }, (_, i) => ({ ...op, seq: i, op_id: `${i}` }));
    expect(pushRequestSchema.safeParse({ device_id: op.row_id, operations: many }).success).toBe(false);
  });

  it('treats applied, noop, divergence and duplicate as a cloud ack, and rejected as not', () => {
    expect(isAck('applied')).toBe(true);
    expect(isAck('noop')).toBe(true);
    expect(isAck('divergence')).toBe(true);
    expect(isAck('duplicate')).toBe(true);
    expect(isAck('rejected')).toBe(false);
  });
});

describe('pull protocol', () => {
  it('names exactly the 24 synced entity keys of SPEC-FINAL 9.3', () => {
    expect(PULL_ENTITY_KEYS).toHaveLength(24);
    expect(PULL_ENTITY_KEYS).toContain('app_settings');
    expect(PULL_ENTITY_KEYS).toContain('weight_presets');
    expect(PULL_ENTITY_KEYS).not.toContain('drafts');
  });

  it('overlaps the watermark by five seconds so nothing committed in the same instant is skipped', () => {
    expect(WATERMARK_OVERLAP_MS).toBe(5000);
  });

  it('accepts a first pull with no since and a delta pull with one', () => {
    const eventId = '22222222-2222-4222-8222-222222222222';
    expect(pullRequestSchema.parse({ event_id: eventId })).toMatchObject({ event_id: eventId });
    expect(
      pullRequestSchema.parse({ event_id: eventId, since: '2026-11-14T09:00:00.000Z' }).since,
    ).toBe('2026-11-14T09:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
pnpm vitest run packages/shared/src/sync
```

Expected: both files fail with `Failed to resolve import`.

- [ ] **Step 3: Implement**

`packages/shared/src/sync/operation.ts`:

```ts
import { z } from 'zod';

/** SPEC-FINAL 9.4. `match` covers only the bare auto-creation of 6.4. */
export const SYNC_ENTITIES = [
  'scouting_entry',
  'match',
  'pick_list',
  'pick_list_entry',
  'do_not_pick',
  'alliance_slot',
  'alliance_decline',
] as const;

export type SyncEntity = (typeof SYNC_ENTITIES)[number];
export type OperationAction = 'create' | 'update' | 'delete';

const isoDateTime = z.string().datetime({ offset: false });

export const operationSchema = z
  .object({
    op_id: z.string().min(1),
    entity: z.enum(SYNC_ENTITIES),
    row_id: z.string().uuid(),
    action: z.enum(['create', 'update', 'delete']),
    base_version: z.number().int().positive().nullable(),
    /** Always the whole row, never a patch. Field-level merging does not exist. */
    payload: z.record(z.unknown()),
    author_user_id: z.string().uuid(),
    client_created_at: isoDateTime,
    client_updated_at: isoDateTime,
    seq: z.number().int().nonnegative(),
  })
  .superRefine((op, ctx) => {
    if (op.action === 'create' && op.base_version !== null) {
      ctx.addIssue({ code: 'custom', path: ['base_version'], message: 'a create has no base version' });
    }
    if (op.action !== 'create' && op.base_version === null) {
      ctx.addIssue({ code: 'custom', path: ['base_version'], message: 'an edit must name its base version' });
    }
    if (op.action === 'delete' && Object.keys(op.payload).length > 0) {
      ctx.addIssue({ code: 'custom', path: ['payload'], message: 'a delete carries an empty payload' });
    }
  });

export type Operation = z.infer<typeof operationSchema>;
```

`packages/shared/src/sync/protocol.ts`:

```ts
import { z } from 'zod';
import { operationSchema } from './operation';

export const MAX_OPERATIONS_PER_PUSH = 200;
/** The delta pull rewinds the watermark by five seconds (SPEC-FINAL 9.3, D5). */
export const WATERMARK_OVERLAP_MS = 5000;

export const pushRequestSchema = z.object({
  device_id: z.string().uuid(),
  operations: z.array(operationSchema).max(MAX_OPERATIONS_PER_PUSH),
});
export type PushRequest = z.infer<typeof pushRequestSchema>;

export const REJECTION_REASONS = [
  'parent-deleted',
  'edit-window-expired',
  'forbidden',
  'invalid',
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export type PushStatus = 'applied' | 'noop' | 'divergence' | 'duplicate' | 'rejected';

export type PushResult =
  | { op_id: string; status: 'applied' | 'noop'; row_id: string; new_version: number }
  | { op_id: string; status: 'divergence'; row_id: string; new_version: number; conflict_id: string }
  | {
      op_id: string;
      status: 'duplicate';
      row_id: string;
      new_version: number;
      conflict_id: string;
      duplicate_row_id: string;
    }
  | { op_id: string; status: 'rejected'; reason: RejectionReason; detail?: string };

export type PushResponse = { results: PushResult[] };

/**
 * The durability rule's test (SPEC-FINAL 9.4). applied, noop, divergence and duplicate
 * all mean the data is on the server, so the record may be pruned from the outbox.
 * `rejected` is never an ack and the record stays local.
 */
export function isAck(status: PushStatus): boolean {
  return status !== 'rejected';
}

/** The complete synced set (SPEC-FINAL 9.3). Every row carries its deleted_at. */
export const PULL_ENTITY_KEYS = [
  'app_settings',
  'seasons',
  'events',
  'teams',
  'event_teams',
  'matches',
  'match_teams',
  'forms',
  'form_versions',
  'form_fields',
  'scoring_rules',
  'users',
  'scouting_entries',
  'sync_conflicts',
  'pick_lists',
  'pick_list_entries',
  'do_not_pick',
  'alliances',
  'alliance_slots',
  'alliance_declines',
  'metrics',
  'dashboards',
  'dashboard_charts',
  'weight_presets',
] as const;

export type PullEntityKey = (typeof PULL_ENTITY_KEYS)[number];

export const pullRequestSchema = z.object({
  event_id: z.string().uuid(),
  since: z.string().datetime({ offset: false }).optional(),
  cursor: z.string().optional(),
});
export type PullRequest = z.infer<typeof pullRequestSchema>;

export type PullResponse = {
  watermark: string;
  next_cursor: string | null;
  complete: boolean;
  entities: Record<PullEntityKey, Record<string, unknown>[]>;
};
```

Add to `packages/shared/src/index.ts`:

```ts
export * from './sync/operation';
export * from './sync/protocol';
```

- [ ] **Step 4: Run and watch pass**

```bash
pnpm install && pnpm vitest run packages/shared && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): define the outbox operation and the sync wire protocol"
```

---

## Task 1.2: Shared — the form-definition model and the dynamic entry validator

**Files:**
- Create: `packages/shared/src/forms/types.ts`, `packages/shared/src/forms/validate.ts`, `packages/shared/src/forms/validate.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `type FieldType`, `type FormFieldDefinition`, `type FormVersionDefinition`, `type RobotStatus`; `buildEntryDataSchema(fields)` — the runtime-generated validator of SPEC-FINAL §16.4 ("dynamic-form validation is generated at runtime from the field definitions"); `validateEntryData(fields, robotStatus, data)`.

**Scope now:** the four field types the seeded form uses — `counter`, `toggle`, `single_select`, `long_text`. Task 1.24 **widens the same union and the same function** to the full §5.2 catalogue. Nothing here is thrown away.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/forms/validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { FormFieldDefinition } from './types';
import { validateEntryData } from './validate';

const fields: FormFieldDefinition[] = [
  {
    // The config range is the input's own limit; expected_range is the narrower
    // sanity band that blocks a submit (SPEC-FINAL 15.1). They are deliberately
    // different here so each rule is tested on its own.
    id: 'f1', key: 'auto_notes', label: 'Auto notes', type: 'counter', display_order: 1,
    required: true, config: { min: 0, max: 99, step: 1 }, section: null, help_text: null,
    default_value: 0, visibility_condition: null, deprecated: false,
    description: 'Notes in auto', unit: 'count', phase: 'auto', direction: 'higher_is_better',
    category: null, expected_range: { min: 0, max: 10 }, include_in_ai_context: null, is_ordinal: null,
  },
  {
    id: 'f2', key: 'auto_left_zone', label: 'Left zone', type: 'toggle', display_order: 2,
    required: false, config: {}, section: null, help_text: null, default_value: false,
    visibility_condition: null, deprecated: false, description: 'Left the zone', unit: 'boolean',
    phase: 'auto', direction: 'higher_is_better', category: null, expected_range: null,
    include_in_ai_context: null, is_ordinal: null,
  },
  {
    id: 'f3', key: 'endgame_climb', label: 'Climb', type: 'single_select', display_order: 3,
    required: true,
    config: { is_ordinal: true, options: [
      { value: 'none', label: 'None' }, { value: 'high', label: 'High' },
    ] },
    section: null, help_text: null, default_value: null, visibility_condition: null,
    deprecated: false, description: 'Climb level', unit: 'enum', phase: 'endgame',
    direction: 'higher_is_better', category: null, expected_range: null,
    include_in_ai_context: null, is_ordinal: true,
  },
  {
    id: 'f4', key: 'notes', label: 'Notes', type: 'long_text', display_order: 4, required: false,
    config: {}, section: null, help_text: null, default_value: null, visibility_condition: null,
    deprecated: false, description: 'Free notes', unit: 'text', phase: 'post_match',
    direction: 'neutral', category: null, expected_range: null, include_in_ai_context: null,
    is_ordinal: null,
  },
];

describe('validateEntryData', () => {
  it('accepts a complete, in-range payload', () => {
    const result = validateEntryData(fields, 'played', {
      auto_notes: 3, auto_left_zone: true, endgame_climb: 'high', notes: 'טוב',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a missing required field', () => {
    const result = validateEntryData(fields, 'played', { auto_notes: 3, auto_left_zone: true });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.issues.map((i) => i.field_key)).toContain('endgame_climb');
  });

  it('blocks a numeric value outside its expected_range (SPEC-FINAL 15.1)', () => {
    const result = validateEntryData(fields, 'played', {
      auto_notes: 11, auto_left_zone: false, endgame_climb: 'none',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.issues[0]?.code).toBe('out-of-expected-range');
  });

  it('blocks a numeric value outside the input own min/max separately', () => {
    const result = validateEntryData(fields, 'played', {
      auto_notes: 120, auto_left_zone: false, endgame_climb: 'none',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.issues[0]?.code).toBe('out-of-config-range');
  });

  it('rejects a select value that is not in the option list', () => {
    const result = validateEntryData(fields, 'played', {
      auto_notes: 1, auto_left_zone: false, endgame_climb: 'moon',
    });
    expect(result.ok).toBe(false);
  });

  it('requires data to be empty for no_show and disabled, and validates nothing else', () => {
    expect(validateEntryData(fields, 'no_show', {}).ok).toBe(true);
    expect(validateEntryData(fields, 'disabled', {}).ok).toBe(true);
    const withValues = validateEntryData(fields, 'no_show', { auto_notes: 0 });
    expect(withValues.ok).toBe(false);
    expect(withValues.ok === false && withValues.issues[0]?.code).toBe('dead-robot-has-data');
  });

  it('validates broke_down exactly like played — its partial data is real observed performance', () => {
    expect(
      validateEntryData(fields, 'broke_down', {
        auto_notes: 1, auto_left_zone: true, endgame_climb: 'none',
      }).ok,
    ).toBe(true);
    expect(validateEntryData(fields, 'broke_down', {}).ok).toBe(false);
  });

  it('ignores a deprecated field entirely', () => {
    const withDeprecated = fields.map((f) =>
      f.key === 'endgame_climb' ? { ...f, deprecated: true } : f,
    );
    expect(
      validateEntryData(withDeprecated, 'played', { auto_notes: 1, auto_left_zone: false }).ok,
    ).toBe(true);
  });

  it('rejects a key that belongs to no field', () => {
    const result = validateEntryData(fields, 'played', {
      auto_notes: 1, auto_left_zone: false, endgame_climb: 'none', invented: 7,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.issues[0]?.code).toBe('unknown-field');
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
pnpm vitest run packages/shared/src/forms
```

Expected: `Failed to resolve import "./validate"`.

- [ ] **Step 3: Implement**

`packages/shared/src/forms/types.ts`:

```ts
/**
 * The field-type catalogue. Task 1.24 widens this union to the full SPEC-FINAL 5.2
 * catalogue; the walking skeleton needs only these four.
 */
export type FieldType = 'counter' | 'toggle' | 'single_select' | 'long_text';

export type FieldUnit =
  | 'count' | 'seconds' | 'points' | 'boolean' | 'enum' | 'text' | 'coordinate';
export type FieldPhase = 'auto' | 'teleop' | 'endgame' | 'post_match';
export type FieldDirection = 'higher_is_better' | 'lower_is_better' | 'neutral';
export type RobotStatus = 'played' | 'no_show' | 'disabled' | 'broke_down';

export type SelectOption = { value: string; label: string };

export type VisibilityCondition = {
  field_key: string;
  op: '=' | '!=' | '>' | '<' | '>=' | '<=';
  value: unknown;
};

export type FormFieldDefinition = {
  id: string;
  key: string;
  label: string;
  help_text: string | null;
  type: FieldType;
  section: string | null;
  display_order: number;
  required: boolean;
  default_value: unknown;
  config: Record<string, unknown>;
  visibility_condition: VisibilityCondition | null;
  deprecated: boolean;
  description: string | null;
  unit: FieldUnit | null;
  phase: FieldPhase | null;
  direction: FieldDirection | null;
  category: string | null;
  expected_range: { min: number; max: number } | null;
  include_in_ai_context: boolean | null;
  is_ordinal: boolean | null;
};

export type FormVersionDefinition = {
  id: string;
  form_id: string;
  version_no: number;
  published_at: string | null;
  is_locked: boolean;
  fields: FormFieldDefinition[];
};

export function selectOptions(field: FormFieldDefinition): SelectOption[] {
  const raw = field.config.options;
  return Array.isArray(raw) ? (raw as SelectOption[]) : [];
}
```

`packages/shared/src/forms/validate.ts`:

```ts
import type { FormFieldDefinition, RobotStatus } from './types';
import { selectOptions } from './types';

export type ValidationIssue = {
  field_key: string;
  code:
    | 'required'
    | 'wrong-type'
    | 'out-of-expected-range'
    | 'out-of-config-range'
    | 'not-an-option'
    | 'unknown-field'
    | 'dead-robot-has-data';
  message: string;
};

export type ValidationResult = { ok: true } | { ok: false; issues: ValidationIssue[] };

/** SPEC-FINAL 8.2: no_show and disabled record no field values at all. */
export function isDeadRobot(status: RobotStatus): boolean {
  return status === 'no_show' || status === 'disabled';
}

/**
 * Dynamic-form validation generated at runtime from the field definitions
 * (SPEC-FINAL 16.4). A new season's form needs no code change.
 */
export function validateEntryData(
  fields: FormFieldDefinition[],
  robotStatus: RobotStatus,
  data: Record<string, unknown>,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (isDeadRobot(robotStatus)) {
    if (Object.keys(data).length > 0) {
      issues.push({
        field_key: '*',
        code: 'dead-robot-has-data',
        message: 'a no-show or disabled robot records no field values, never zeros',
      });
    }
    return issues.length === 0 ? { ok: true } : { ok: false, issues };
  }

  const live = fields.filter((f) => !f.deprecated);
  const known = new Set(live.map((f) => f.key));
  for (const key of Object.keys(data)) {
    if (!known.has(key)) {
      issues.push({ field_key: key, code: 'unknown-field', message: `no field with key '${key}'` });
    }
  }

  for (const field of live) {
    const value = data[field.key];
    const missing = value === undefined || value === null || value === '';
    if (missing) {
      if (field.required) {
        issues.push({ field_key: field.key, code: 'required', message: `${field.label} is required` });
      }
      continue;
    }

    switch (field.type) {
      case 'counter': {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          issues.push({ field_key: field.key, code: 'wrong-type', message: `${field.label} must be a number` });
          break;
        }
        const min = typeof field.config.min === 'number' ? field.config.min : undefined;
        const max = typeof field.config.max === 'number' ? field.config.max : undefined;
        if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
          issues.push({
            field_key: field.key,
            code: 'out-of-config-range',
            message: `${field.label} must be between ${min ?? '-∞'} and ${max ?? '∞'}`,
          });
          break;
        }
        // The hard entry-time block of SPEC-FINAL 15.1.
        if (field.expected_range) {
          const { min: lo, max: hi } = field.expected_range;
          if (value < lo || value > hi) {
            issues.push({
              field_key: field.key,
              code: 'out-of-expected-range',
              message: `${field.label} is outside its expected range (${lo}–${hi})`,
            });
          }
        }
        break;
      }
      case 'toggle': {
        if (typeof value !== 'boolean') {
          issues.push({ field_key: field.key, code: 'wrong-type', message: `${field.label} must be true or false` });
        }
        break;
      }
      case 'single_select': {
        const allowed = selectOptions(field).map((o) => o.value);
        if (typeof value !== 'string' || !allowed.includes(value)) {
          issues.push({
            field_key: field.key,
            code: 'not-an-option',
            message: `${field.label} must be one of: ${allowed.join(', ')}`,
          });
        }
        break;
      }
      case 'long_text': {
        if (typeof value !== 'string') {
          issues.push({ field_key: field.key, code: 'wrong-type', message: `${field.label} must be text` });
        }
        break;
      }
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
```

Add to `packages/shared/src/index.ts`:

```ts
export * from './forms/types';
export * from './forms/validate';
```

- [ ] **Step 4: Run and watch pass**

```bash
pnpm vitest run packages/shared && pnpm typecheck && pnpm lint
```

Expected: every suite green, including the new file(s) from this task; typecheck and lint clean.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): add the form-definition model and the runtime entry validator"
```

---

## Task 1.3: Server — the entry repository and `syncPush` (fast-forward only)

**Files:**
- Create: `apps/server/src/core/context.ts`
- Create: `apps/server/src/core/commands/syncPush.ts`, `apps/server/src/core/commands/syncPush.test.ts`
- Create: `apps/server/src/test/fake-context.ts`
- Create: `apps/server/src/repos/store.ts`
- Create: `apps/server/src/routes/sync.ts`
- Create: `packages/shared/src/forms/entryShape.ts`, `packages/shared/src/forms/entryShape.test.ts`
- Modify: `apps/server/src/composition.ts` (build the real context and mount the sync routes), `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `Operation`, `PushRequest`, `PushResponse`, `validateEntryData` from `@frc/shared`; `Db` from task 0.13; the `applied_operations` ledger from migration 0003 (task 0.10).
- Produces: `type Store` and `type UseCaseContext = { store: Store; now: () => Date }`; `syncPush(caller, input, ctx): Promise<PushResponse>`; `supabaseStore(db)`; `syncRoutes(deps)`; `validateEntryShape(row)` — the three §3.5 cross-column rules the database deliberately does not express.

**The §3.5 constraints this task builds** (they are "expressed in the use-case layer, not as check constraints, because they span form kinds"):

- `form_kind = 'match'` → `match_id`, `alliance` and `robot_status` are all **required**;
- `form_kind = 'super'` → `match_id`, `alliance`, `robot_status` and `breakdown_seconds` are all **null**;
- `breakdown_seconds` is non-null **if and only if** `robot_status = 'broke_down'`.

They live in `packages/shared` so the client checks them before submit and the server checks them again on push — which matters, because a QR-relayed operation reaches the server without ever passing through the originating client.

**Scope now:** `applied` and `noop` only, for the `scouting_entry` and `match` entities. **Task 1.40 extends the same function** with divergence, duplicate and parent-deleted. The `op_id` idempotency key and the per-operation `author_user_id` authorization are built now because they are load-bearing, not later.

**How the caller is built with no auth yet:** `syncPush` takes a caller like every other use case, and each operation is additionally authorized against **its own** `author_user_id` (SPEC-FINAL §7.5) — the permanent rule, not a stopgap. Until group B the HTTP route builds the caller by looking the first operation's `author_user_id` up in `users`. Task 1.14 replaces that one line with the bearer token and nothing else changes.

- [ ] **Step 1: Write the failing test**

`apps/server/src/core/commands/syncPush.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller, Operation } from '@frc/shared';
import { syncPush } from './syncPush';
import { makeFakeContext, type FakeContext } from '../../test/fake-context';

const scouter: Caller = { kind: 'user', userId: 'u-scouter', role: 'scouter' };

const op = (over: Partial<Operation> = {}): Operation => ({
  op_id: `op-${Math.random()}`,
  entity: 'scouting_entry',
  row_id: 'e-1',
  action: 'create',
  base_version: null,
  payload: {
    form_version_id: 'fv-1',
    form_kind: 'match',
    event_id: 'ev-1',
    match_id: 'm-1',
    team_id: 't-1',
    alliance: 'red',
    scouter_id: 'u-scouter',
    robot_status: 'played',
    data: { auto_notes: 2 },
  },
  author_user_id: 'u-scouter',
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  seq: 1,
  ...over,
});

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
});

describe('syncPush', () => {
  it('applies a create and returns the new version', async () => {
    const res = await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    expect(res.results[0]).toMatchObject({ status: 'applied', row_id: 'e-1', new_version: 1 });
    expect(ctx.rows.scouting_entries.get('e-1')?.version).toBe(1);
  });

  it('is idempotent: replaying the same op_id returns noop and does not bump the version', async () => {
    const operation = op();
    await syncPush(scouter, { device_id: 'd-1', operations: [operation] }, ctx);
    const again = await syncPush(scouter, { device_id: 'd-1', operations: [operation] }, ctx);
    expect(again.results[0]).toMatchObject({ status: 'noop', new_version: 1 });
    expect(ctx.rows.scouting_entries.get('e-1')?.version).toBe(1);
  });

  it('fast-forwards an update whose base_version matches, bumping the version', async () => {
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [
          op({
            action: 'update',
            base_version: 1,
            client_updated_at: '2026-11-14T09:02:00.000Z',
            payload: { ...op().payload, data: { auto_notes: 5 } },
          }),
        ],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'applied', new_version: 2 });
    expect(ctx.rows.scouting_entries.get('e-1')?.data).toEqual({ auto_notes: 5 });
  });

  it('applies operations in seq order, each in its own transaction', async () => {
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [
          op({ row_id: 'e-2', seq: 2, payload: { ...op().payload, data: { auto_notes: 2 } } }),
          op({ row_id: 'e-1', seq: 1 }),
        ],
      },
      ctx,
    );
    expect(ctx.appliedOrder).toEqual(['e-1', 'e-2']);
    expect(res.results).toHaveLength(2);
  });

  it('a rejection does not stop the batch', async () => {
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [
          op({ row_id: 'e-1', seq: 1, payload: { ...op().payload, robot_status: 'no_show', data: { auto_notes: 1 } } }),
          op({ row_id: 'e-2', seq: 2 }),
        ],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'invalid' });
    expect(res.results[1]).toMatchObject({ status: 'applied' });
  });

  it('authorizes each operation against its own author_user_id, not the bearer (SPEC-FINAL 7.5)', async () => {
    ctx.users.set('u-other', { id: 'u-other', role: 'scouter', disabled_at: null });
    const res = await syncPush(
      scouter,
      { device_id: 'd-collector', operations: [op({ author_user_id: 'u-other', payload: { ...op().payload, scouter_id: 'u-other' } })] },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'applied' });
    expect(ctx.rows.scouting_entries.get('e-1')?.scouter_id).toBe('u-other');
  });

  it('rejects an operation whose author is disabled', async () => {
    ctx.users.set('u-gone', { id: 'u-gone', role: 'scouter', disabled_at: '2026-01-01T00:00:00.000Z' });
    const res = await syncPush(
      scouter,
      { device_id: 'd-1', operations: [op({ author_user_id: 'u-gone' })] },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'forbidden' });
  });

  it('rejects a service caller outright', async () => {
    const res = await syncPush({ kind: 'service', label: 'mcp' }, { device_id: 'd-1', operations: [op()] }, ctx);
    expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'forbidden' });
  });

  it('creates a bare match row for the auto-creation entity (SPEC-FINAL 6.4)', async () => {
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [
          op({
            entity: 'match',
            row_id: 'm-9',
            payload: { event_id: 'ev-1', match_type: 'qualification', number: 9 },
          }),
        ],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'applied' });
    expect(ctx.rows.matches.get('m-9')).toMatchObject({ number: 9, match_type: 'qualification' });
  });

  it('rejects a match entry missing its alliance or its robot status (SPEC-FINAL 3.5)', async () => {
    for (const missing of ['alliance', 'robot_status', 'match_id'] as const) {
      const payload = { ...op().payload, [missing]: null };
      const res = await syncPush(scouter, { device_id: 'd-1', operations: [op({ payload })] }, ctx);
      expect(res.results[0], missing).toMatchObject({ status: 'rejected', reason: 'invalid' });
    }
  });

  it('rejects a super entry that carries a match, an alliance or a robot status', async () => {
    const superPayload = {
      ...op().payload, form_kind: 'super', match_id: null, alliance: null, robot_status: null,
    };
    const ok = await syncPush(
      scouter,
      { device_id: 'd-1', operations: [op({ row_id: 's-1', payload: superPayload })] },
      ctx,
    );
    expect(ok.results[0]).toMatchObject({ status: 'applied' });

    const bad = await syncPush(
      scouter,
      { device_id: 'd-1', operations: [op({ row_id: 's-2', payload: { ...superPayload, alliance: 'red' } })] },
      ctx,
    );
    expect(bad.results[0]).toMatchObject({ status: 'rejected', reason: 'invalid' });
  });

  it('requires breakdown_seconds exactly when the robot broke down', async () => {
    const withoutSeconds = await syncPush(
      scouter,
      { device_id: 'd-1', operations: [op({ row_id: 'b-1', payload: { ...op().payload, robot_status: 'broke_down' } })] },
      ctx,
    );
    expect(withoutSeconds.results[0]).toMatchObject({ status: 'rejected', reason: 'invalid' });

    const withSeconds = await syncPush(
      scouter,
      { device_id: 'd-1', operations: [op({ row_id: 'b-2', payload: { ...op().payload, robot_status: 'broke_down', breakdown_seconds: 45 } })] },
      ctx,
    );
    expect(withSeconds.results[0]).toMatchObject({ status: 'applied' });

    const straySeconds = await syncPush(
      scouter,
      { device_id: 'd-1', operations: [op({ row_id: 'b-3', payload: { ...op().payload, breakdown_seconds: 45 } })] },
      ctx,
    );
    expect(straySeconds.results[0]).toMatchObject({ status: 'rejected', reason: 'invalid' });
  });

  it('is a noop when the bare match already exists', async () => {
    ctx.rows.matches.set('m-9', { id: 'm-9', event_id: 'ev-1', match_type: 'qualification', number: 9, version: 1 });
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [op({ entity: 'match', row_id: 'm-9', payload: { event_id: 'ev-1', match_type: 'qualification', number: 9 } })],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'noop' });
  });
});
```

- [ ] **Step 2: Write the in-memory context the test needs**

`apps/server/src/test/fake-context.ts`:

```ts
import type { FormFieldDefinition } from '@frc/shared';
import type { StoredFullUser, StoredUser, UseCaseContext } from '../core/context';

export type FakeRow = Record<string, unknown> & { id: string; version: number };

/**
 * Every map the phase-1 tests use, declared once. Later tasks add rows to these maps
 * and implement the Store methods that read them; none of them adds a field.
 */
export type FakeContext = UseCaseContext & {
  rows: { scouting_entries: Map<string, FakeRow>; matches: Map<string, FakeRow> };
  users: Map<string, StoredUser>;
  usersById: Map<string, StoredFullUser>;
  usersByName: Map<string, StoredFullUser>;
  seasons: Map<string, FakeRow>;
  events: Map<string, FakeRow>;
  teams: Map<string, FakeRow>;
  eventTeams: Map<string, FakeRow>;
  roster: Map<string, string[]>;
  matches: Map<string, FakeRow>;
  matchTeams: Map<string, FakeRow>;
  forms: Map<string, FakeRow>;
  formVersions: Map<string, FakeRow>;
  formFields: Map<string, FormFieldDefinition>;
  scoringRules: Map<string, FakeRow>;
  conflicts: Map<string, FakeRow>;
  pullRows: Map<string, Record<string, unknown>[]>;
  knownEvents: Set<string>;
  missingParents: Set<string>;
  entryCountsByMatch: Map<string, number>;
  entryCountsBySeason: Map<string, number>;
  entryCountsByVersion: Map<string, number>;
  ops: Set<string>;
  appliedOrder: string[];
  formVersionWrites: number;
  /** Overridable clock, so a test can prove the server never compares to server time. */
  nowValue: Date;
  /** Fixtures used by the later groups; each is implemented by the task that needs it. */
  seedSmallSeason(): void;
  seedRankingFixture(): void;
  setActiveContext(seasonId: string | null, eventId: string | null): void;
  softDelete(entryId: string): void;
  duplicateEntry(sourceId: string, options: { scoreDelta: number; newer: boolean }): void;
  changeFieldTypeBetweenVersions(key: string): void;
};

const SKELETON_FIELDS: FormFieldDefinition[] = [
  {
    id: 'f1', key: 'auto_notes', label: 'Auto notes', type: 'counter', display_order: 1,
    required: false, config: { min: 0, max: 10, step: 1 }, section: null, help_text: null,
    default_value: 0, visibility_condition: null, deprecated: false, description: 'x',
    unit: 'count', phase: 'auto', direction: 'higher_is_better', category: null,
    expected_range: { min: 0, max: 10 }, include_in_ai_context: null, is_ordinal: null,
  },
];

/**
 * An in-memory stand-in for the database, so use-case tests run with no network.
 * Integration tests against the real dev project live in packages/db/test.
 */
export function makeFakeContext(): FakeContext {
  const rows = { scouting_entries: new Map<string, FakeRow>(), matches: new Map<string, FakeRow>() };
  const users = new Map([
    ['u-scouter', { id: 'u-scouter', role: 'scouter' as const, disabled_at: null }],
    ['u-lead', { id: 'u-lead', role: 'lead' as const, disabled_at: null }],
  ]);
  const ops = new Set<string>();
  const appliedOrder: string[] = [];

  const fake = {
    // every map from the FakeContext type, constructed empty
    rows,
    users,
    usersById: new Map(),
    usersByName: new Map(),
    seasons: new Map(),
    events: new Map(),
    teams: new Map(),
    eventTeams: new Map(),
    roster: new Map(),
    matches: rows.matches,
    matchTeams: new Map(),
    forms: new Map(),
    formVersions: new Map(),
    formFields: new Map(),
    scoringRules: new Map(),
    conflicts: new Map(),
    pullRows: new Map(),
    knownEvents: new Set(['ev-1']),
    missingParents: new Set<string>(),
    entryCountsByMatch: new Map(),
    entryCountsBySeason: new Map(),
    entryCountsByVersion: new Map(),
    ops,
    appliedOrder,
    formVersionWrites: 0,
    nowValue: new Date('2026-11-14T10:00:00.000Z'),
    seedSmallSeason: () => { throw new Error('seedSmallSeason lands with task 1.50'); },
    seedRankingFixture: () => { throw new Error('seedRankingFixture lands with task 1.57'); },
    setActiveContext: () => { throw new Error('setActiveContext lands with task 1.18'); },
    softDelete: () => { throw new Error('softDelete lands with task 1.50'); },
    duplicateEntry: () => { throw new Error('duplicateEntry lands with task 1.57'); },
    changeFieldTypeBetweenVersions: () => { throw new Error('lands with task 1.57'); },
  } as unknown as FakeContext;

  return Object.assign(fake, {
    // the clock is read through the object, so a test can move it
    now: () => fake.nowValue,
    store: {
      async getUser(id) {
        return users.get(id) ?? null;
      },
      async wasApplied(opId) {
        return ops.has(opId);
      },
      async markApplied(opId) {
        ops.add(opId);
      },
      async getRow(entity, id) {
        const table = entity === 'match' ? rows.matches : rows.scouting_entries;
        return table.get(id) ?? null;
      },
      async putRow(entity, id, row) {
        const table = entity === 'match' ? rows.matches : rows.scouting_entries;
        table.set(id, row as FakeRow);
        appliedOrder.push(id);
      },
      async getFormFields() {
        return SKELETON_FIELDS;
      },
      // Everything else on the Store starts as a loud stub; each later task
      // replaces the two or three entries it needs.
      ...stubsFor([
        'findByLogicalKey', 'parentsExist', 'insertConflict', 'listConflicts', 'getConflict',
        'resolveConflictRow', 'eventExists', 'resolveScope', 'pullEntity', 'getUserByUsername',
        'insertUser', 'updateUser', 'listUsers', 'countEnabledAdmins', 'getActiveContext',
        'setActiveContext', 'getSeason', 'getSeasonByYear', 'insertSeason', 'updateSeason',
        'listSeasons', 'getEvent', 'insertEvent', 'updateEvent', 'listEvents', 'getTeam',
        'getTeamByNumber', 'insertTeam', 'updateTeam', 'listTeams', 'getRoster', 'setRoster',
        'findMatch', 'insertMatch', 'listMatches', 'setMatchTeams', 'countEntriesByMatch',
        'countEntriesBySeason', 'deleteMatch', 'getForm', 'getFormByKind', 'insertForm', 'updateForm', 'getFormVersion',
        'listFormVersions', 'insertFormVersion', 'updateFormVersion', 'countEntriesByFormVersion',
        'replaceFormFields', 'getScoringRules', 'replaceScoringRules', 'getEntry', 'queryEntries',
        'entriesForScope', 'listTeamEvents', 'deleteSeason', 'deleteEvent', 'deleteFormCascade',
        'deleteFormVersion', 'countDeleteImpact',
      ]),
    },
  });
}

```

`stubsFor` is imported from `../repos/store`, not redefined — one helper, one message.

- [ ] **Step 3: Run and watch fail**

```bash
pnpm --filter @frc/server exec vitest run src/core
```

Expected: `Failed to resolve import "../core/context"`.

- [ ] **Step 4: Implement**

`apps/server/src/core/context.ts`:

```ts
import type { FormFieldDefinition, SyncEntity } from '@frc/shared';

export type StoredUser = {
  id: string;
  role: 'scouter' | 'lead' | 'admin';
  disabled_at: string | null;
};

export type StoredFullUser = StoredUser & {
  username: string;
  full_name: string;
  password_hash: string;
  must_change_password: boolean;
  created_at: string;
};

export type StoredRow = Record<string, unknown> & { id: string; version: number };

export type PullScope = { eventId: string; seasonId: string };

export type PullEntitySource = (
  key: string,
  scope: PullScope,
  since: string | undefined,
  offset: number,
  limit: number,
) => Promise<Record<string, unknown>[]>;

/**
 * The persistence surface the use cases talk to. One implementation over Supabase
 * (`repos/store.ts`), one in-memory for tests (`test/fake-context.ts`). Use cases
 * never import supabase-js.
 *
 * THE WHOLE PHASE-1 INTERFACE IS DECLARED HERE, IN ONE PLACE, ON PURPOSE. If it grew
 * a method per task, every task that widened it would break the Supabase
 * implementation and the fake at the same moment. Instead: the shape is fixed now,
 * both implementations start as stubs that throw `not implemented`, and each later
 * task fills in the two methods it needs and deletes those two stubs. A task that
 * wants a method not on this list is a task that has drifted from the plan.
 */
export type Store = {
  // sync (task 1.3, 1.4, 1.40)
  wasApplied(opId: string): Promise<boolean>;
  markApplied(opId: string): Promise<void>;
  getRow(entity: SyncEntity, id: string): Promise<StoredRow | null>;
  putRow(entity: SyncEntity, id: string, row: Record<string, unknown>): Promise<void>;
  findByLogicalKey(key: string): Promise<StoredRow | null>;
  parentsExist(parents: {
    event_id: string;
    match_id: string | null;
    form_version_id: string;
  }): Promise<boolean>;
  insertConflict(row: Record<string, unknown>): Promise<void>;
  listConflicts(eventId: string, limit: number, cursor?: string): Promise<StoredRow[]>;
  getConflict(id: string): Promise<StoredRow | null>;
  resolveConflictRow(id: string, resolvedBy: string, at: string): Promise<void>;

  // pull (task 1.4)
  eventExists(eventId: string): Promise<boolean>;
  resolveScope(eventId: string): Promise<PullScope>;
  pullEntity: PullEntitySource;

  // users (tasks 1.3, 1.11, 1.13)
  getUser(id: string): Promise<StoredUser | null>;
  getUserByUsername(usernameLower: string): Promise<StoredFullUser | null>;
  insertUser(row: Record<string, unknown>): Promise<StoredFullUser>;
  updateUser(id: string, patch: Record<string, unknown>): Promise<StoredFullUser>;
  listUsers(options: { includeDisabled: boolean; limit: number; cursor?: string }): Promise<StoredFullUser[]>;
  countEnabledAdmins(): Promise<number>;

  // context, seasons, events (task 1.18)
  getActiveContext(): Promise<{ active_season_id: string | null; active_event_id: string | null }>;
  setActiveContext(next: { active_season_id: string | null; active_event_id: string | null }): Promise<{
    active_season_id: string | null;
    active_event_id: string | null;
  }>;
  getSeason(id: string): Promise<StoredRow | null>;
  getSeasonByYear(year: number): Promise<StoredRow | null>;
  insertSeason(row: Record<string, unknown>): Promise<StoredRow>;
  updateSeason(id: string, patch: Record<string, unknown>): Promise<StoredRow>;
  listSeasons(limit: number, cursor?: string): Promise<StoredRow[]>;
  getEvent(id: string): Promise<StoredRow | null>;
  insertEvent(row: Record<string, unknown>): Promise<StoredRow>;
  updateEvent(id: string, patch: Record<string, unknown>): Promise<StoredRow>;
  listEvents(seasonId: string, limit: number, cursor?: string): Promise<StoredRow[]>;

  // teams, roster, matches (task 1.19)
  getTeam(id: string): Promise<StoredRow | null>;
  getTeamByNumber(number: number): Promise<StoredRow | null>;
  insertTeam(row: Record<string, unknown>): Promise<StoredRow>;
  updateTeam(id: string, patch: Record<string, unknown>): Promise<StoredRow>;
  listTeams(options: { seasonId?: string; query?: string; limit: number; cursor?: string }): Promise<StoredRow[]>;
  getRoster(eventId: string): Promise<StoredRow[]>;
  setRoster(eventId: string, teamIds: string[], at: string): Promise<void>;
  findMatch(eventId: string, matchType: string, number: number): Promise<StoredRow | null>;
  insertMatch(row: Record<string, unknown>): Promise<StoredRow>;
  listMatches(eventId: string, limit: number, cursor?: string): Promise<StoredRow[]>;
  setMatchTeams(matchId: string, slots: Record<string, unknown>[]): Promise<void>;
  countEntriesByMatch(matchId: string): Promise<number>;
  countEntriesBySeason(seasonId: string): Promise<number>;
  deleteMatch(id: string): Promise<void>;

  // forms and scoring (tasks 1.27, 1.28)
  getForm(id: string): Promise<StoredRow | null>;
  getFormByKind(seasonId: string, kind: 'match' | 'super'): Promise<StoredRow | null>;
  insertForm(row: Record<string, unknown>): Promise<StoredRow>;
  updateForm(id: string, patch: Record<string, unknown>): Promise<StoredRow>;
  getFormVersion(id: string): Promise<StoredRow | null>;
  listFormVersions(formId: string): Promise<StoredRow[]>;
  insertFormVersion(row: Record<string, unknown>): Promise<StoredRow>;
  updateFormVersion(id: string, patch: Record<string, unknown>): Promise<StoredRow>;
  countEntriesByFormVersion(formVersionId: string): Promise<number>;
  getFormFields(formVersionId: string): Promise<FormFieldDefinition[]>;
  replaceFormFields(formVersionId: string, fields: Record<string, unknown>[]): Promise<void>;
  getScoringRules(formId: string): Promise<StoredRow[]>;
  replaceScoringRules(formId: string, rules: Record<string, unknown>[]): Promise<void>;

  // reads for browse, search and statistics (tasks 1.50, 1.57)
  getEntry(id: string): Promise<StoredRow | null>;
  queryEntries(options: {
    eventId: string;
    formKind?: 'match' | 'super';
    query?: string;
    limit: number;
    cursor?: string;
  }): Promise<StoredRow[]>;
  entriesForScope(scope: { eventIds: string[]; teamId?: string }): Promise<StoredRow[]>;
  listTeamEvents(teamId: string): Promise<StoredRow[]>;

  // deletes (task 1.60)
  deleteSeason(id: string): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  deleteFormCascade(id: string): Promise<void>;
  deleteFormVersion(id: string): Promise<void>;
  countDeleteImpact(kind: 'season' | 'event' | 'form', id: string): Promise<Record<string, number>>;
};

export type UseCaseContext = {
  store: Store;
  now: () => Date;
};
```

**How the stubs work.** `repos/store.ts` and `test/fake-context.ts` both start like this, and each later task replaces exactly the entries it needs:

```ts
const notImplemented = (name: string) => async (): Promise<never> => {
  throw new Error(`Store.${name} is not implemented yet — it lands with its own task`);
};
```

so an accidental call fails loudly with the method's name rather than returning `undefined`.

`apps/server/src/core/commands/syncPush.ts`:

```ts
import {
  isUser,
  validateEntryData,
  validateEntryShape,
  type Caller,
  type Operation,
  type PushRequest,
  type PushResponse,
  type PushResult,
  type RejectionReason,
  type RobotStatus,
} from '@frc/shared';
import type { UseCaseContext } from '../context';

const rejected = (opId: string, reason: RejectionReason, detail?: string): PushResult =>
  detail === undefined
    ? { op_id: opId, status: 'rejected', reason }
    : { op_id: opId, status: 'rejected', reason, detail };

/**
 * SPEC-FINAL 9.3.1. Operations are applied in seq order, each independently; a
 * rejection does not stop the batch. op_id is the idempotency key. Authorization is
 * per operation, against the operation's author_user_id and not against the bearer
 * (7.5) — which is what makes a shared collector tablet work at all.
 *
 * Divergence, duplicate and parent-deleted arrive in task 1.40. Until then a stale
 * base version is rejected as `invalid` rather than silently overwriting.
 */
export async function syncPush(
  caller: Caller,
  input: PushRequest,
  ctx: UseCaseContext,
): Promise<PushResponse> {
  const ordered = [...input.operations].sort((a, b) => a.seq - b.seq);
  const results: PushResult[] = [];

  for (const op of ordered) {
    results.push(await applyOne(caller, op, ctx));
  }
  return { results };
}

async function applyOne(caller: Caller, op: Operation, ctx: UseCaseContext): Promise<PushResult> {
  if (!isUser(caller)) return rejected(op.op_id, 'forbidden', 'a service caller may not push');

  const author = await ctx.store.getUser(op.author_user_id);
  if (!author) return rejected(op.op_id, 'forbidden', 'unknown author');
  if (author.disabled_at !== null) return rejected(op.op_id, 'forbidden', 'the author is disabled');

  if (await ctx.store.wasApplied(op.op_id)) {
    const existing = await ctx.store.getRow(op.entity, op.row_id);
    return { op_id: op.op_id, status: 'noop', row_id: op.row_id, new_version: existing?.version ?? 1 };
  }

  if (op.entity === 'match') return applyBareMatch(op, ctx);
  if (op.entity !== 'scouting_entry') {
    return rejected(op.op_id, 'invalid', `entity '${op.entity}' is not accepted yet`);
  }
  return applyEntry(op, ctx);
}

async function applyBareMatch(op: Operation, ctx: UseCaseContext): Promise<PushResult> {
  // SPEC-FINAL 6.4: the bare auto-creation only — event, type, number. A no-op if it exists.
  const existing = await ctx.store.getRow('match', op.row_id);
  if (existing) {
    await ctx.store.markApplied(op.op_id);
    return { op_id: op.op_id, status: 'noop', row_id: op.row_id, new_version: existing.version };
  }
  const { event_id, match_type, number } = op.payload as Record<string, unknown>;
  if (typeof event_id !== 'string' || typeof match_type !== 'string' || typeof number !== 'number') {
    return rejected(op.op_id, 'invalid', 'a bare match needs event_id, match_type and number');
  }
  await ctx.store.putRow('match', op.row_id, {
    id: op.row_id, event_id, match_type, number, version: 1,
  });
  await ctx.store.markApplied(op.op_id);
  return { op_id: op.op_id, status: 'applied', row_id: op.row_id, new_version: 1 };
}

async function applyEntry(op: Operation, ctx: UseCaseContext): Promise<PushResult> {
  const payload = op.payload as Record<string, unknown>;
  const existing = await ctx.store.getRow('scouting_entry', op.row_id);

  if (op.action === 'delete') {
    if (!existing) return rejected(op.op_id, 'invalid', 'no such entry');
    await ctx.store.putRow('scouting_entry', op.row_id, {
      ...existing,
      deleted_at: ctx.now().toISOString(),
      version: existing.version + 1,
      client_updated_at: op.client_updated_at,
    });
    await ctx.store.markApplied(op.op_id);
    return { op_id: op.op_id, status: 'applied', row_id: op.row_id, new_version: existing.version + 1 };
  }

  if (existing && op.base_version !== existing.version) {
    // Task 1.40 turns this into the divergence path of SPEC-FINAL 9.5.
    return rejected(op.op_id, 'invalid', `stale base version ${op.base_version}`);
  }

  const formVersionId = payload.form_version_id;
  if (typeof formVersionId !== 'string') {
    return rejected(op.op_id, 'invalid', 'form_version_id is required');
  }
  // SPEC-FINAL 3.5: the cross-column rules first, then the JSONB payload.
  const shapeIssues = validateEntryShape({
    form_kind: payload.form_kind as 'match' | 'super',
    match_id: (payload.match_id as string | null) ?? null,
    alliance: (payload.alliance as 'red' | 'blue' | null) ?? null,
    robot_status: (payload.robot_status as RobotStatus | null) ?? null,
    breakdown_seconds: (payload.breakdown_seconds as number | null) ?? null,
  });
  if (shapeIssues.length > 0) return rejected(op.op_id, 'invalid', shapeIssues.join('; '));

  const fields = await ctx.store.getFormFields(formVersionId);
  const status = (payload.robot_status as RobotStatus | null) ?? 'played';
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const validation = validateEntryData(fields, status, data);
  if (!validation.ok) {
    return rejected(op.op_id, 'invalid', validation.issues.map((i) => i.message).join('; '));
  }

  const version = existing ? existing.version + 1 : 1;
  await ctx.store.putRow('scouting_entry', op.row_id, {
    ...payload,
    id: op.row_id,
    scouter_id: op.author_user_id,
    version,
    client_created_at: op.client_created_at,
    client_updated_at: op.client_updated_at,
    deleted_at: null,
  });
  await ctx.store.markApplied(op.op_id);
  return { op_id: op.op_id, status: 'applied', row_id: op.row_id, new_version: version };
}
```

`apps/server/src/repos/store.ts` — the Supabase implementation of `Store`:

```ts
import type { FormFieldDefinition, SyncEntity } from '@frc/shared';
import type { Store, StoredRow, StoredUser } from '../core/context';
import type { Db } from '../db/client';

// `as const` matters: SupabaseClient<Database>.from() takes a literal table-name
// union, not `string`, so a widened Record<SyncEntity, string> would not typecheck.
const TABLE = {
  scouting_entry: 'scouting_entries',
  match: 'matches',
  pick_list: 'pick_lists',
  pick_list_entry: 'pick_list_entries',
  do_not_pick: 'do_not_pick',
  alliance_slot: 'alliance_slots',
  alliance_decline: 'alliance_declines',
} as const satisfies Record<SyncEntity, string>;

export function supabaseStore(db: Db): Store {
  return {
    async getUser(id: string): Promise<StoredUser | null> {
      const { data } = await db.from('users').select('id, role, disabled_at').eq('id', id).maybeSingle();
      return (data as StoredUser | null) ?? null;
    },
    async wasApplied(opId: string): Promise<boolean> {
      const { data } = await db.from('applied_operations').select('op_id').eq('op_id', opId).maybeSingle();
      return data !== null;
    },
    async markApplied(opId: string): Promise<void> {
      await db.from('applied_operations').insert({ op_id: opId });
    },
    async getRow(entity: SyncEntity, id: string): Promise<StoredRow | null> {
      const { data } = await db.from(TABLE[entity]).select('*').eq('id', id).maybeSingle();
      return (data as StoredRow | null) ?? null;
    },
    async putRow(entity: SyncEntity, id: string, row: Record<string, unknown>): Promise<void> {
      const { error } = await db.from(TABLE[entity]).upsert({ ...row, id });
      if (error) throw new Error(error.message);
    },
    async getFormFields(formVersionId: string): Promise<FormFieldDefinition[]> {
      const { data } = await db.from('form_fields').select('*').eq('form_version_id', formVersionId);
      return (data ?? []) as unknown as FormFieldDefinition[];
    },
    // The other 59 methods start as loud stubs, exactly as the fake does. Each later
    // task replaces the two or three it needs. `supabaseStore` is typed `: Store`, so
    // without these the file does not compile at all.
    ...stubsFor([
      'findByLogicalKey', 'parentsExist', 'insertConflict', 'listConflicts', 'getConflict',
      'resolveConflictRow', 'eventExists', 'resolveScope', 'pullEntity', 'getUserByUsername',
      'insertUser', 'updateUser', 'listUsers', 'countEnabledAdmins', 'getActiveContext',
      'setActiveContext', 'getSeason', 'getSeasonByYear', 'insertSeason', 'updateSeason',
      'listSeasons', 'getEvent', 'insertEvent', 'updateEvent', 'listEvents', 'getTeam',
      'getTeamByNumber', 'insertTeam', 'updateTeam', 'listTeams', 'getRoster', 'setRoster',
      'findMatch', 'insertMatch', 'listMatches', 'setMatchTeams', 'countEntriesByMatch',
      'countEntriesBySeason', 'deleteMatch', 'getForm', 'getFormByKind', 'insertForm',
      'updateForm', 'getFormVersion', 'listFormVersions', 'insertFormVersion',
      'updateFormVersion', 'countEntriesByFormVersion', 'replaceFormFields', 'getScoringRules',
      'replaceScoringRules', 'getEntry', 'queryEntries', 'entriesForScope', 'listTeamEvents',
      'deleteSeason', 'deleteEvent', 'deleteFormCascade', 'deleteFormVersion',
      'countDeleteImpact',
    ]),
  };
}

/** Shared by both Store implementations. A missing method fails by name, never as undefined. */
export function stubsFor(names: string[]): Record<string, () => Promise<never>> {
  return Object.fromEntries(
    names.map((name) => [
      name,
      async (): Promise<never> => {
        throw new Error(`Store.${name} is not implemented yet — it lands with its own task`);
      },
    ]),
  );
}
```

`packages/shared/src/forms/entryShape.ts`:

```ts
import type { RobotStatus } from './types';

export type EntryShape = {
  form_kind: 'match' | 'super';
  match_id: string | null;
  alliance: 'red' | 'blue' | null;
  robot_status: RobotStatus | null;
  breakdown_seconds: number | null;
};

/**
 * The three SPEC-FINAL 3.5 constraints that span form kinds and therefore cannot be
 * database check constraints. Both sides call this: the client before submit, and the
 * server on every pushed operation — a QR-relayed copy never passed through a client.
 */
export function validateEntryShape(row: EntryShape): string[] {
  const issues: string[] = [];

  if (row.form_kind === 'match') {
    if (row.match_id === null) issues.push('a match entry needs a match');
    if (row.alliance === null) issues.push('a match entry needs an alliance');
    if (row.robot_status === null) issues.push('a match entry needs a robot status');
  } else {
    if (row.match_id !== null) issues.push('a super entry has no match');
    if (row.alliance !== null) issues.push('a super entry has no alliance');
    if (row.robot_status !== null) issues.push('a super entry has no robot status');
    if (row.breakdown_seconds !== null) issues.push('a super entry has no breakdown time');
  }

  const brokeDown = row.robot_status === 'broke_down';
  if (brokeDown && row.breakdown_seconds === null) {
    issues.push('a robot that broke down needs its breakdown time in seconds');
  }
  if (!brokeDown && row.breakdown_seconds !== null) {
    issues.push('breakdown time is recorded only when the robot broke down');
  }

  return issues;
}
```

`packages/shared/src/forms/entryShape.test.ts` covers each branch: a complete match entry passes; each of the three missing match columns fails with its own message; a clean super entry passes; each of the four columns a super entry must not carry fails; `broke_down` without seconds fails; seconds without `broke_down` fails; and `no_show` with null seconds passes.

`apps/server/src/routes/sync.ts`:

```ts
import { Hono } from 'hono';
import { pushRequestSchema, type Caller } from '@frc/shared';
import { syncPush } from '../core/commands/syncPush';
import type { UseCaseContext } from '../core/context';

export type SyncRouteDeps = {
  ctx: UseCaseContext;
  /**
   * Builds the caller at the transport edge (SPEC-FINAL 16.5). Task 1.12 replaces the
   * walking skeleton's implementation with the bearer token, in composition.ts and
   * nowhere else; this signature does not change.
   */
  callerFor: (request: Request, fallbackUserId: string | null) => Promise<Caller | null>;
};

export function syncRoutes(deps: SyncRouteDeps): Hono {
  const app = new Hono();

  app.post('/sync/push', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = pushRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: 'invalid', message: parsed.error.message } }, 400);
    }
    const caller = await deps.callerFor(c.req.raw, parsed.data.operations[0]?.author_user_id ?? null);
    if (!caller) return c.json({ error: { code: 'unauthenticated', message: 'no caller' } }, 401);

    return c.json(await syncPush(caller, parsed.data, deps.ctx));
  });

  return app;
}
```

- [ ] **Step 5: Wire the real context into the one composition point**

`apps/server/src/composition.ts` (replace) — this is the **only** file the two entry points ever import, which is why neither `api/index.ts` nor `dev-server.ts` changes again for the rest of phase 1:

```ts
import type { Hono } from 'hono';
import { createApp } from './app';
import { serverConfig } from './config';
import { getServiceClient } from './db/client';
import { makePingDatabase } from './db/ping';
import { supabaseStore } from './repos/store';
import { syncRoutes } from './routes/sync';
import type { UseCaseContext } from './core/context';

export function buildContext(): UseCaseContext {
  const config = serverConfig();
  return { store: supabaseStore(getServiceClient(config)), now: () => new Date() };
}

export function buildApp(): Hono {
  const config = serverConfig();
  const ctx = buildContext();
  return createApp({
    config,
    pingDatabase: makePingDatabase(config),
    routes: [
      syncRoutes({
        ctx,
        // Task 1.12 replaces this one function with the bearer-token version.
        callerFor: async (_request, fallbackUserId) => {
          if (!fallbackUserId) return null;
          const user = await ctx.store.getUser(fallbackUserId);
          return user && user.disabled_at === null
            ? { kind: 'user', userId: user.id, role: user.role }
            : null;
        },
      }),
    ],
  });
}
```

- [ ] **Step 6: Run and watch pass**

```bash
pnpm --filter @frc/server exec vitest run && pnpm vitest run packages/shared && pnpm typecheck
```

Expected: every suite green in `apps/server` and in shared, including the new `syncPush` and `entryShape` files; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(server): add syncPush with per-operation authorization and op_id idempotency"
```

---
## Task 1.4: Server — `syncPull`, the delta protocol and its paging

**Files:**
- Create: `apps/server/src/core/queries/syncPull.ts`, `apps/server/src/core/queries/syncPull.test.ts`
- Create: `apps/server/src/repos/pull.ts`
- Modify: `apps/server/src/repos/store.ts` (implement `eventExists`, `resolveScope`, `pullEntity` — replacing their stubs), `apps/server/src/routes/sync.ts` (mount `GET /sync/pull`), `apps/server/src/test/fake-context.ts` (same three)

**Nothing changes in `core/context.ts`.** `Store` already declares these three, and `PullScope` and `PullEntitySource` already exist, because task 1.3 fixed the whole interface up front. This task replaces three stubs with three implementations, on both sides.

**Interfaces:**
- Consumes: `PullRequest`, `PullResponse`, `PULL_ENTITY_KEYS`, `WATERMARK_OVERLAP_MS`.
- Produces: `syncPull(caller, input, ctx): Promise<PullResponse>`; `PULL_SCOPES` — the table describing how each of the 24 entities is scoped (event, season, or global); `PULL_PAGE_ROWS = 2000`.

**The watermark rule (SPEC-FINAL §9.3, D5).** Every entity is queried ordered by `updated_at` ascending, so paging is monotone. Each page returns `watermark = max(updated_at over the rows in that page) − 5 s`. **The client keeps the greatest watermark it has seen and commits it only when `complete: true`.** The five-second overlap guarantees no row committed inside the same instant is skipped; overlapping rows arrive twice and are idempotently upserted locally.

- [ ] **Step 1: Write the failing test**

`apps/server/src/core/queries/syncPull.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { PULL_ENTITY_KEYS, type Caller } from '@frc/shared';
import { syncPull } from './syncPull';
import { makeFakeContext, type FakeContext } from '../../test/fake-context';

const scouter: Caller = { kind: 'user', userId: 'u-scouter', role: 'scouter' };
const EVENT = 'ev-1';

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
  ctx.pullRows.set('scouting_entries', [
    { id: 'e-1', event_id: EVENT, updated_at: '2026-11-14T09:00:00.000Z', deleted_at: null },
    { id: 'e-2', event_id: EVENT, updated_at: '2026-11-14T09:00:30.000Z', deleted_at: null },
    { id: 'e-3', event_id: EVENT, updated_at: '2026-11-14T09:01:00.000Z', deleted_at: '2026-11-14T09:01:00.000Z' },
  ]);
  ctx.pullRows.set('teams', [{ id: 't-1', number: 2096, updated_at: '2026-11-13T08:00:00.000Z' }]);
});

describe('syncPull', () => {
  it('returns all 24 entity keys, even the empty ones', async () => {
    const res = await syncPull(scouter, { event_id: EVENT }, ctx);
    expect(Object.keys(res.entities).sort()).toEqual([...PULL_ENTITY_KEYS].sort());
  });

  it('returns the whole dataset on a first pull and marks it complete', async () => {
    const res = await syncPull(scouter, { event_id: EVENT }, ctx);
    expect(res.entities.scouting_entries).toHaveLength(3);
    expect(res.complete).toBe(true);
    expect(res.next_cursor).toBeNull();
  });

  it('returns tombstones as ordinary rows carrying deleted_at', async () => {
    const res = await syncPull(scouter, { event_id: EVENT }, ctx);
    const tombstone = res.entities.scouting_entries.find((r) => r.id === 'e-3');
    expect(tombstone?.deleted_at).toBe('2026-11-14T09:01:00.000Z');
  });

  it('returns only rows newer than `since` on a delta pull', async () => {
    const res = await syncPull(scouter, { event_id: EVENT, since: '2026-11-14T09:00:15.000Z' }, ctx);
    expect(res.entities.scouting_entries.map((r) => r.id)).toEqual(['e-2', 'e-3']);
    expect(res.entities.teams).toHaveLength(0);
  });

  it('rewinds the watermark five seconds behind the newest row it returned', async () => {
    const res = await syncPull(scouter, { event_id: EVENT }, ctx);
    expect(res.watermark).toBe('2026-11-14T09:00:55.000Z');
  });

  it('pages a large first pull and reports complete only on the last page', async () => {
    ctx.pullRows.set(
      'scouting_entries',
      Array.from({ length: 2500 }, (_, i) => ({
        id: `e-${i}`,
        event_id: EVENT,
        updated_at: new Date(Date.UTC(2026, 10, 14, 9, 0, 0) + i * 1000).toISOString(),
        deleted_at: null,
      })),
    );
    const first = await syncPull(scouter, { event_id: EVENT }, ctx);
    expect(first.complete).toBe(false);
    expect(first.next_cursor).not.toBeNull();
    expect(first.entities.scouting_entries.length).toBeLessThanOrEqual(2000);

    const second = await syncPull(scouter, { event_id: EVENT, cursor: first.next_cursor! }, ctx);
    expect(second.complete).toBe(true);
    expect(second.next_cursor).toBeNull();
    const ids = new Set([
      ...first.entities.scouting_entries.map((r) => r.id),
      ...second.entities.scouting_entries.map((r) => r.id),
    ]);
    expect(ids.size).toBe(2500);
  });

  it('caches every user row including the password hash, for offline login (SPEC-FINAL 7.5, 9.2)', async () => {
    ctx.pullRows.set('users', [
      { id: 'u-1', username: 'a', full_name: 'A', role: 'scouter', password_hash: '$2a$10$x', disabled_at: null, updated_at: '2026-11-13T08:00:00.000Z' },
    ]);
    const res = await syncPull(scouter, { event_id: EVENT }, ctx);
    expect(res.entities.users[0]).toHaveProperty('password_hash');
  });

  it('a service caller may call it — syncPull is a query', async () => {
    const res = await syncPull({ kind: 'service', label: 'mcp' }, { event_id: EVENT }, ctx);
    expect(res.complete).toBe(true);
  });

  it('reports not-found when the event no longer exists, so the client can wipe its cache', async () => {
    ctx.knownEvents.clear();
    await expect(syncPull(scouter, { event_id: EVENT }, ctx)).rejects.toMatchObject({ code: 'not-found' });
  });
});
```

- [ ] **Step 2: Extend the fake context**

Add to `apps/server/src/test/fake-context.ts`:

```ts
  const pullRows = new Map<string, Record<string, unknown>[]>();
  const knownEvents = new Set(['ev-1']);
```

expose `pullRows` and `knownEvents` on the returned object, and add to `store`:

```ts
      async eventExists(eventId) {
        return knownEvents.has(eventId);
      },
      async pullEntity(key, scope, since, offset, limit) {
        void scope;
        const all = (pullRows.get(key) ?? [])
          .filter((r) => since === undefined || String(r.updated_at) > since)
          .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
        return all.slice(offset, offset + limit);
      },
      async resolveScope(eventId) {
        return { eventId, seasonId: 'se-1' };
      },
```

- [ ] **Step 3: Run and watch fail**

```bash
pnpm --filter @frc/server exec vitest run src/core/queries
```

Expected: `Failed to resolve import "./syncPull"`.

- [ ] **Step 4: Implement**

`apps/server/src/core/queries/syncPull.ts`:

```ts
import {
  AppError,
  PULL_ENTITY_KEYS,
  WATERMARK_OVERLAP_MS,
  type Caller,
  type PullEntityKey,
  type PullRequest,
  type PullResponse,
} from '@frc/shared';
import type { UseCaseContext } from '../context';

/** A page is bounded by rows, not by call (SPEC-FINAL 16.4). */
export const PULL_PAGE_ROWS = 2000;

type Cursor = { entityIndex: number; offset: number };

const encodeCursor = (c: Cursor): string => btoa(JSON.stringify(c));
const decodeCursor = (raw: string): Cursor => {
  try {
    const parsed = JSON.parse(atob(raw)) as Cursor;
    if (typeof parsed.entityIndex !== 'number' || typeof parsed.offset !== 'number') {
      throw new Error('bad cursor');
    }
    return parsed;
  } catch {
    throw new AppError('invalid', 'cursor is not readable; start the pull again without one');
  }
};

/**
 * The replication endpoint (SPEC-FINAL 9.3). It lives in queries/ but is the one
 * query use case that returns raw rows, because offline computation requires them.
 * It is bounded per page by next_cursor rather than per call, and it is not a
 * candidate for future MCP exposure.
 */
export async function syncPull(
  caller: Caller,
  input: PullRequest,
  ctx: UseCaseContext,
): Promise<PullResponse> {
  void caller; // every role, and a service caller, may replicate

  if (!(await ctx.store.eventExists(input.event_id))) {
    throw new AppError('not-found', 'that event no longer exists', { event_id: input.event_id });
  }
  const scope = await ctx.store.resolveScope(input.event_id);

  const start = input.cursor ? decodeCursor(input.cursor) : { entityIndex: 0, offset: 0 };
  const entities = Object.fromEntries(
    PULL_ENTITY_KEYS.map((key) => [key, [] as Record<string, unknown>[]]),
  ) as PullResponse['entities'];

  let budget = PULL_PAGE_ROWS;
  let newest = '';
  let nextCursor: string | null = null;

  for (let index = start.entityIndex; index < PULL_ENTITY_KEYS.length; index += 1) {
    const key = PULL_ENTITY_KEYS[index] as PullEntityKey;
    let offset = index === start.entityIndex ? start.offset : 0;

    for (;;) {
      if (budget === 0) {
        nextCursor = encodeCursor({ entityIndex: index, offset });
        break;
      }
      const rows = await ctx.store.pullEntity(key, scope, input.since, offset, budget);
      entities[key].push(...rows);
      for (const row of rows) {
        const updated = String(row.updated_at ?? '');
        if (updated > newest) newest = updated;
      }
      budget -= rows.length;
      offset += rows.length;
      if (rows.length < 1 || budget > 0) break;
    }
    if (nextCursor !== null) break;
  }

  const watermark =
    newest === ''
      ? (input.since ?? new Date(ctx.now().getTime() - WATERMARK_OVERLAP_MS).toISOString())
      : new Date(new Date(newest).getTime() - WATERMARK_OVERLAP_MS).toISOString();

  return { watermark, next_cursor: nextCursor, complete: nextCursor === null, entities };
}
```

`apps/server/src/repos/pull.ts` — the Supabase source, one row per entity describing its scope:

```ts
import type { PullScope } from '../core/context';
import type { Db } from '../db/client';

type ScopeKind = 'event' | 'season' | 'season-teams' | 'global' | 'settings';

/** SPEC-FINAL 9.2: the local store is scoped to the active competition only. */
export const PULL_SCOPES: Record<string, { table: string; kind: ScopeKind; column?: string }> = {
  app_settings: { table: 'app_settings', kind: 'settings' },
  seasons: { table: 'seasons', kind: 'season', column: 'id' },
  events: { table: 'events', kind: 'event', column: 'id' },
  // SPEC-FINAL 9.2: every team in the SEASON — the global rows for every team that
  // appears on any of the season's rosters or entries, not the whole registry.
  teams: { table: 'teams', kind: 'season-teams' },
  event_teams: { table: 'event_teams', kind: 'event', column: 'event_id' },
  matches: { table: 'matches', kind: 'event', column: 'event_id' },
  match_teams: { table: 'match_teams', kind: 'event', column: 'match_id' },
  forms: { table: 'forms', kind: 'season', column: 'season_id' },
  form_versions: { table: 'form_versions', kind: 'season', column: 'form_id' },
  form_fields: { table: 'form_fields', kind: 'season', column: 'form_version_id' },
  scoring_rules: { table: 'scoring_rules', kind: 'season', column: 'form_id' },
  users: { table: 'users', kind: 'global' },
  scouting_entries: { table: 'scouting_entries', kind: 'event', column: 'event_id' },
  sync_conflicts: { table: 'sync_conflicts', kind: 'event', column: 'event_id' },
  pick_lists: { table: 'pick_lists', kind: 'event', column: 'event_id' },
  pick_list_entries: { table: 'pick_list_entries', kind: 'event', column: 'pick_list_id' },
  do_not_pick: { table: 'do_not_pick', kind: 'event', column: 'event_id' },
  alliances: { table: 'alliances', kind: 'event', column: 'event_id' },
  alliance_slots: { table: 'alliance_slots', kind: 'event', column: 'alliance_id' },
  alliance_declines: { table: 'alliance_declines', kind: 'event', column: 'alliance_id' },
  metrics: { table: 'metrics', kind: 'season', column: 'season_id' },
  dashboards: { table: 'dashboards', kind: 'season', column: 'season_id' },
  dashboard_charts: { table: 'dashboard_charts', kind: 'season', column: 'dashboard_id' },
  weight_presets: { table: 'weight_presets', kind: 'season', column: 'season_id' },
};

/**
 * Child tables are scoped through their parent's id list. The lists are small
 * (one event's matches, one season's forms, eight alliances), so an `in` filter is
 * the boring correct choice and stays inside the free-tier budget.
 */
async function parentIds(db: Db, key: string, scope: PullScope): Promise<string[] | null> {
  switch (key) {
    case 'match_teams': {
      const { data } = await db.from('matches').select('id').eq('event_id', scope.eventId);
      return (data ?? []).map((r) => r.id);
    }
    case 'form_versions':
    case 'scoring_rules': {
      const { data } = await db.from('forms').select('id').eq('season_id', scope.seasonId);
      return (data ?? []).map((r) => r.id);
    }
    case 'form_fields': {
      const { data: forms } = await db.from('forms').select('id').eq('season_id', scope.seasonId);
      const { data } = await db
        .from('form_versions')
        .select('id')
        .in('form_id', (forms ?? []).map((r) => r.id));
      return (data ?? []).map((r) => r.id);
    }
    case 'pick_list_entries': {
      const { data } = await db.from('pick_lists').select('id').eq('event_id', scope.eventId);
      return (data ?? []).map((r) => r.id);
    }
    case 'alliance_slots':
    case 'alliance_declines': {
      const { data } = await db.from('alliances').select('id').eq('event_id', scope.eventId);
      return (data ?? []).map((r) => r.id);
    }
    case 'dashboard_charts': {
      const { data } = await db.from('dashboards').select('id').eq('season_id', scope.seasonId);
      return (data ?? []).map((r) => r.id);
    }
    case 'teams': {
      // Every team on any of the season's rosters, plus every team with an entry there.
      const { data: events } = await db.from('events').select('id').eq('season_id', scope.seasonId);
      const eventIds = (events ?? []).map((r) => r.id);
      const [roster, entries] = await Promise.all([
        db.from('event_teams').select('team_id').in('event_id', eventIds),
        db.from('scouting_entries').select('team_id').in('event_id', eventIds),
      ]);
      return [
        ...new Set([
          ...(roster.data ?? []).map((r) => r.team_id),
          ...(entries.data ?? []).map((r) => r.team_id),
        ]),
      ];
    }
    default:
      return null;
  }
}

export function supabasePullEntity(db: Db) {
  return async (
    key: string,
    scope: PullScope,
    since: string | undefined,
    offset: number,
    limit: number,
  ): Promise<Record<string, unknown>[]> => {
    const spec = PULL_SCOPES[key];
    if (!spec) return [];

    let query = db.from(spec.table).select('*').order('updated_at', { ascending: true })
      .range(offset, offset + limit - 1);
    if (since !== undefined) query = query.gt('updated_at', since);

    const ids = await parentIds(db, key, scope);
    if (ids !== null) {
      query = query.in(spec.kind === 'season-teams' ? 'id' : (spec.column ?? 'id'), ids);
    } else if (spec.kind === 'event') {
      query = query.eq(spec.column ?? 'event_id', scope.eventId);
    } else if (spec.kind === 'season') {
      query = query.eq(spec.column ?? 'season_id', scope.seasonId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`${key}: ${error.message}`);
    return (data ?? []) as Record<string, unknown>[];
  };
}
```

Add the route to `apps/server/src/routes/sync.ts`:

```ts
  app.get('/sync/pull', async (c) => {
    const parsed = pullRequestSchema.safeParse({
      event_id: c.req.query('event_id'),
      since: c.req.query('since'),
      cursor: c.req.query('cursor'),
    });
    if (!parsed.success) {
      return c.json({ error: { code: 'invalid', message: parsed.error.message } }, 400);
    }
    const caller = await deps.callerFor(c.req.raw, null);
    if (!caller) return c.json({ error: { code: 'unauthenticated', message: 'no caller' } }, 401);
    return c.json(await syncPull(caller, parsed.data, deps.ctx));
  });
```

- [ ] **Step 5: Run and watch pass**

```bash
pnpm --filter @frc/server exec vitest run && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task; typecheck clean.

- [ ] **Step 6: Prove it against the seeded dev project**

```bash
curl -s "https://<preview-server-host>/sync/pull?event_id=00000000-0000-4000-8000-000000000002" | head -c 400
```

Expected: JSON beginning `{"watermark":"1999-...","next_cursor":null,"complete":true,"entities":{"app_settings":[{...`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(server): add syncPull with the delta watermark and per-page cursor"
```

---

## Task 1.5: Client — the Dexie local store and the outbox

**Files:**
- Create: `apps/client/src/data/db.ts`, `apps/client/src/data/outbox.ts`, `apps/client/src/data/outbox.test.ts`
- Modify: `apps/client/package.json` (add `"dexie": "^4.0.10"`)

**`fake-indexeddb`, `src/test/setup.ts` and the `setupFiles` line already exist** — task 0.4 created all three. This task adds only Dexie.

**Interfaces:**
- Consumes: `Operation`, `isAck`, `type PushResult`.
- Produces: `db` — the Dexie database with the stores of SPEC-FINAL §9.2; `enqueue(op)`, `pending(limit)`, `ackResults(results)`, `unackedCount()`, `nextSeq()`; the sync-state record `{ row_id, sync_state, acked_at, origin }`.

**Two rules this task exists to enforce.** **Coalescing** (§9.4, D26): the outbox holds **at most one pending operation per `row_id`**; a second update replaces the first, keeping the **earliest `base_version`** and the **latest payload and `client_updated_at`**. **Durability** (§9.4): a record leaves the outbox **only** on a cloud ack for that exact `row_id`. Nothing else — closing the app, a handoff, a QR transfer, a wipe — ever removes an unacked record.

- [ ] **Step 1: Write the failing test**

`apps/client/src/data/outbox.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Operation, PushResult } from '@frc/shared';
import { db } from './db';
import { ackResults, enqueue, nextSeq, pending, syncStateOf, unackedCount } from './outbox';

const op = (over: Partial<Operation> = {}): Operation => ({
  op_id: crypto.randomUUID(),
  entity: 'scouting_entry',
  row_id: 'row-1',
  action: 'create',
  base_version: null,
  payload: { data: { auto_notes: 1 } },
  author_user_id: 'u-1',
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  seq: 1,
  ...over,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('outbox', () => {
  it('queues an operation and reports it as pending', async () => {
    await enqueue(op());
    expect(await pending(50)).toHaveLength(1);
    expect(await unackedCount()).toBe(1);
  });

  it('hands out a monotonic per-device seq', async () => {
    const a = await nextSeq();
    const b = await nextSeq();
    expect(b).toBe(a + 1);
  });

  it('coalesces two edits of the same row into one pending operation', async () => {
    await enqueue(op({ action: 'create', base_version: null }));
    await enqueue(
      op({
        action: 'update',
        base_version: 2,
        payload: { data: { auto_notes: 9 } },
        client_updated_at: '2026-11-14T09:05:00.000Z',
      }),
    );
    const queued = await pending(50);
    expect(queued).toHaveLength(1);
    expect(queued[0]!.payload).toEqual({ data: { auto_notes: 9 } });
    expect(queued[0]!.client_updated_at).toBe('2026-11-14T09:05:00.000Z');
    // the earliest base_version is kept, so the server sees one it actually issued
    expect(queued[0]!.base_version).toBeNull();
  });

  it('cancels a create that is deleted before it ever reached the server', async () => {
    await enqueue(op({ action: 'create' }));
    await enqueue(op({ action: 'delete', base_version: 1, payload: {} }));
    expect(await pending(50)).toHaveLength(0);
    expect(await unackedCount()).toBe(0);
  });

  it('keeps a delete of a row the server already knows about', async () => {
    await enqueue(op({ action: 'create' }));
    await ackResults([{ op_id: (await pending(50))[0]!.op_id, status: 'applied', row_id: 'row-1', new_version: 1 }]);
    await enqueue(op({ action: 'delete', base_version: 1, payload: {} }));
    expect(await pending(50)).toHaveLength(1);
  });

  it('prunes on every acking status and keeps the row in the dataset', async () => {
    for (const status of ['applied', 'noop', 'divergence', 'duplicate'] as const) {
      await db.delete();
      await db.open();
      await enqueue(op({ row_id: `row-${status}` }));
      const [queued] = await pending(50);
      const result = { op_id: queued!.op_id, status, row_id: `row-${status}`, new_version: 1 } as PushResult;
      await ackResults([result]);
      expect(await pending(50), status).toHaveLength(0);
      expect((await syncStateOf(`row-${status}`))?.sync_state, status).toBe('acked');
    }
  });

  it('NEVER prunes on a rejection — the durability rule (SPEC-FINAL 9.4)', async () => {
    await enqueue(op());
    const [queued] = await pending(50);
    await ackResults([{ op_id: queued!.op_id, status: 'rejected', reason: 'invalid', detail: 'x' }]);
    expect(await pending(50)).toHaveLength(1);
    expect((await syncStateOf('row-1'))?.sync_state).toBe('pending');
  });

  it('returns pending operations in seq order and never more than the limit', async () => {
    for (let i = 0; i < 250; i += 1) await enqueue(op({ row_id: `row-${i}`, seq: 250 - i }));
    const batch = await pending(200);
    expect(batch).toHaveLength(200);
    expect(batch.map((o) => o.seq)).toEqual([...batch.map((o) => o.seq)].sort((a, b) => a - b));
  });
});
```

- [ ] **Step 2: Add the test setup**

`apps/client/src/test/setup.ts`:

```ts
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
```

and in `apps/client/vitest.config.ts` add `setupFiles: ['./src/test/setup.ts']` inside `test`.

- [ ] **Step 3: Run and watch fail**

```bash
pnpm --filter @frc/client exec vitest run src/data
```

Expected: `Failed to resolve import "./db"`.

- [ ] **Step 4: Implement**

`apps/client/src/data/db.ts`:

```ts
import Dexie, { type Table } from 'dexie';
import type { Operation, PullEntityKey } from '@frc/shared';

/** SPEC-FINAL 9.2. Per-record sync state is the representation behind the durability
 *  rule (9.4), QR-copy disposal (9.8) and the wipe guard (9.9). */
export type SyncStateRecord = {
  row_id: string;
  sync_state: 'pending' | 'acked';
  acked_at: string | null;
  origin: 'local' | 'qr';
};

export type CachedRow = Record<string, unknown> & { id: string; entity: PullEntityKey };

export type DraftRecord = {
  key: string; // a stable key per (form_kind, match_id, team_id)
  row_id: string;
  payload: Record<string, unknown>;
  updated_at: string;
};

export type MetaRecord = { key: string; value: unknown };

export type DiscardedRecord = {
  id: string;
  discarded_at: string;
  reason: string;
  summary: Record<string, unknown>;
};

class ScoutingDb extends Dexie {
  rows!: Table<CachedRow, string>;
  outbox!: Table<Operation, string>;
  syncState!: Table<SyncStateRecord, string>;
  drafts!: Table<DraftRecord, string>;
  practiceDrafts!: Table<DraftRecord, string>;
  discarded!: Table<DiscardedRecord, string>;
  meta!: Table<MetaRecord, string>;

  constructor() {
    super('robactive-scouting');
    this.version(1).stores({
      rows: '[entity+id], entity, id, event_id, updated_at, team_id, match_id',
      outbox: 'op_id, row_id, seq',
      syncState: 'row_id, sync_state, origin',
      drafts: 'key, row_id, updated_at',
      practiceDrafts: 'key, updated_at',
      discarded: 'id, discarded_at',
      meta: 'key',
    });
  }
}

export const db = new ScoutingDb();

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const record = await db.meta.get(key);
  return record === undefined ? fallback : (record.value as T);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
```

`apps/client/src/data/outbox.ts`:

```ts
import { isAck, type Operation, type PushResult } from '@frc/shared';
import { db, getMeta, setMeta, type SyncStateRecord } from './db';

const SEQ_KEY = 'outbox.seq';

export async function nextSeq(): Promise<number> {
  const current = await getMeta<number>(SEQ_KEY, 0);
  const next = current + 1;
  await setMeta(SEQ_KEY, next);
  return next;
}

/**
 * SPEC-FINAL 9.4 / D26. At most one pending operation per row_id: a second update
 * replaces the first, keeping the EARLIEST base_version and the LATEST payload and
 * client_updated_at. A delete after a still-pending create removes both without
 * ever contacting the server, since the row never reached it.
 */
export async function enqueue(op: Operation, origin: 'local' | 'qr' = 'local'): Promise<void> {
  await db.transaction('rw', db.outbox, db.syncState, async () => {
    const existing = await db.outbox.where('row_id').equals(op.row_id).first();

    if (existing && op.action === 'delete' && existing.action === 'create') {
      await db.outbox.delete(existing.op_id);
      await db.syncState.delete(op.row_id);
      return;
    }

    if (existing) {
      await db.outbox.delete(existing.op_id);
      await db.outbox.put({
        ...op,
        base_version: existing.base_version,
        action: existing.action === 'create' ? 'create' : op.action,
        seq: existing.seq,
      });
    } else {
      await db.outbox.put(op);
    }

    await db.syncState.put({
      row_id: op.row_id,
      sync_state: 'pending',
      acked_at: null,
      origin,
    });
  });
}

export async function pending(limit: number): Promise<Operation[]> {
  return db.outbox.orderBy('seq').limit(limit).toArray();
}

export async function unackedCount(): Promise<number> {
  return db.syncState.where('sync_state').equals('pending').count();
}

export async function syncStateOf(rowId: string): Promise<SyncStateRecord | undefined> {
  return db.syncState.get(rowId);
}

/**
 * The durability rule (SPEC-FINAL 9.4): a record leaves the outbox ONLY on a cloud
 * ack for that exact row_id. `rejected` is never an ack.
 */
export async function ackResults(results: PushResult[]): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', db.outbox, db.syncState, async () => {
    for (const result of results) {
      const op = await db.outbox.get(result.op_id);
      if (!op) continue;
      if (!isAck(result.status)) continue;
      await db.outbox.delete(result.op_id);
      await db.syncState.put({
        row_id: op.row_id,
        sync_state: 'acked',
        acked_at: now,
        origin: (await db.syncState.get(op.row_id))?.origin ?? 'local',
      });
    }
  });
}
```

- [ ] **Step 5: Run and watch pass**

```bash
pnpm install && pnpm --filter @frc/client exec vitest run src/data && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(client): add the Dexie local store and the coalescing, durable outbox"
```

---

## Task 1.6: Client — the API client and the sync engine

**Files:**
- Create: `apps/client/src/data/api.ts`, `apps/client/src/data/sync.ts`, `apps/client/src/data/sync.test.ts`
- Create: `apps/client/src/data/connection.ts`

**Interfaces:**
- Consumes: `pending`, `ackResults`, `db`, `PULL_ENTITY_KEYS`, `MAX_OPERATIONS_PER_PUSH`.
- Produces: `apiClient(config)` with `push(request)` and `pull(request)`; `syncNow(deps): Promise<SyncOutcome>`; `hydrate(deps): Promise<HydrationState>` returning `'fresh' | 'cached' | 'blocked'`; `connectionState()`.

**Hydration, exactly as SPEC-FINAL §9.3 states it.** Pull succeeds → `fresh`. Pull fails but the device already holds a hydrated dataset → `cached`, and the app continues in entry-and-read mode. Pull fails and the device has never hydrated → `blocked`; the app cannot be used, because there is no form definition to render.

- [ ] **Step 1: Write the failing test**

`apps/client/src/data/sync.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullResponse, PushResponse } from '@frc/shared';
import { PULL_ENTITY_KEYS } from '@frc/shared';
import { db, getMeta } from './db';
import { enqueue, pending } from './outbox';
import { hydrate, syncNow } from './sync';

const emptyEntities = Object.fromEntries(PULL_ENTITY_KEYS.map((k) => [k, []])) as PullResponse['entities'];

const op = (rowId: string) => ({
  op_id: `op-${rowId}`,
  entity: 'scouting_entry' as const,
  row_id: rowId,
  action: 'create' as const,
  base_version: null,
  payload: { event_id: 'ev-1', data: {} },
  author_user_id: 'u-1',
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  seq: 1,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('syncNow', () => {
  it('pushes pending operations, then pulls, and prunes what was acked', async () => {
    await enqueue(op('row-1'));
    const push = vi.fn(async (): Promise<PushResponse> => ({
      results: [{ op_id: 'op-row-1', status: 'applied', row_id: 'row-1', new_version: 1 }],
    }));
    const pull = vi.fn(async (): Promise<PullResponse> => ({
      watermark: '2026-11-14T09:00:55.000Z',
      next_cursor: null,
      complete: true,
      entities: { ...emptyEntities, scouting_entries: [{ id: 'row-1', event_id: 'ev-1', updated_at: '2026-11-14T09:01:00.000Z' }] },
    }));

    const outcome = await syncNow({ api: { push, pull }, eventId: 'ev-1', deviceId: 'd-1' });

    expect(outcome.status).toBe('ok');
    expect(push).toHaveBeenCalledOnce();
    expect(await pending(50)).toHaveLength(0);
    expect(await db.rows.get(['scouting_entries', 'row-1'])).toBeDefined();
    expect(await getMeta('sync.watermark', null)).toBe('2026-11-14T09:00:55.000Z');
  });

  it('sends at most 200 operations per call (SPEC-FINAL 9.3.1)', async () => {
    for (let i = 0; i < 205; i += 1) await enqueue(op(`row-${i}`));
    const push = vi.fn(async (req: { operations: unknown[] }): Promise<PushResponse> => {
      expect(req.operations.length).toBeLessThanOrEqual(200);
      return { results: [] };
    });
    await syncNow({
      api: { push, pull: async () => ({ watermark: 'x', next_cursor: null, complete: true, entities: emptyEntities }) },
      eventId: 'ev-1',
      deviceId: 'd-1',
    });
    expect(push).toHaveBeenCalled();
  });

  it('keeps everything local when the push fails, and reports offline', async () => {
    await enqueue(op('row-1'));
    const outcome = await syncNow({
      api: {
        push: async () => { throw new Error('network'); },
        pull: async () => { throw new Error('network'); },
      },
      eventId: 'ev-1',
      deviceId: 'd-1',
    });
    expect(outcome.status).toBe('offline');
    expect(await pending(50)).toHaveLength(1);
  });

  it('follows next_cursor until the pull is complete, committing the greatest watermark', async () => {
    const pages: PullResponse[] = [
      { watermark: '2026-11-14T09:00:00.000Z', next_cursor: 'c1', complete: false, entities: emptyEntities },
      { watermark: '2026-11-14T09:10:00.000Z', next_cursor: null, complete: true, entities: emptyEntities },
    ];
    let call = 0;
    await syncNow({
      api: { push: async () => ({ results: [] }), pull: async () => pages[call++]! },
      eventId: 'ev-1',
      deviceId: 'd-1',
    });
    expect(call).toBe(2);
    expect(await getMeta('sync.watermark', null)).toBe('2026-11-14T09:10:00.000Z');
  });

  it('does not commit a watermark from an incomplete pull', async () => {
    await syncNow({
      api: {
        push: async () => ({ results: [] }),
        pull: async () => ({ watermark: '2026-11-14T09:00:00.000Z', next_cursor: 'c1', complete: false, entities: emptyEntities }),
      },
      eventId: 'ev-1',
      deviceId: 'd-1',
      maxPages: 1,
    });
    expect(await getMeta('sync.watermark', null)).toBeNull();
  });

  it('wipes the event cache when the server says the event is gone (SPEC-FINAL 9.3)', async () => {
    await db.rows.put({ entity: 'scouting_entries', id: 'row-1', event_id: 'ev-1' });
    const outcome = await syncNow({
      api: {
        push: async () => ({ results: [] }),
        pull: async () => { throw Object.assign(new Error('gone'), { code: 'not-found' }); },
      },
      eventId: 'ev-1',
      deviceId: 'd-1',
    });
    expect(outcome.status).toBe('event-gone');
    expect(await db.rows.where('event_id').equals('ev-1').count()).toBe(0);
  });
});

describe('hydrate', () => {
  const workingApi = {
    push: async () => ({ results: [] }),
    pull: async () => ({ watermark: 'w', next_cursor: null, complete: true, entities: emptyEntities }),
  };

  it('reports fresh when the pull succeeds', async () => {
    expect(await hydrate({ api: workingApi, eventId: 'ev-1', deviceId: 'd-1' })).toBe('fresh');
  });

  it('reports cached when the pull fails but this event has hydrated before', async () => {
    await hydrate({ api: workingApi, eventId: 'ev-1', deviceId: 'd-1' });
    const failing = { push: workingApi.push, pull: async () => { throw new Error('offline'); } };
    expect(await hydrate({ api: failing, eventId: 'ev-1', deviceId: 'd-1' })).toBe('cached');
  });

  it('reports blocked when the pull fails and nothing has ever been hydrated', async () => {
    const failing = { push: workingApi.push, pull: async () => { throw new Error('offline'); } };
    expect(await hydrate({ api: failing, eventId: 'ev-1', deviceId: 'd-1' })).toBe('blocked');
  });

  it('reports blocked after a PARTIAL first pull, not cached', async () => {
    // rows landed, but the pull never reached complete: true
    const partial = {
      push: workingApi.push,
      pull: async () => ({
        watermark: 'w', next_cursor: 'c1', complete: false,
        entities: { ...emptyEntities, form_fields: [{ id: 'f-1', key: 'x' }] },
      }),
    };
    await syncNow({ api: partial, eventId: 'ev-1', deviceId: 'd-1', maxPages: 1 });
    expect(await db.rows.count()).toBeGreaterThan(0);

    const failing = { push: workingApi.push, pull: async () => { throw new Error('offline'); } };
    expect(await hydrate({ api: failing, eventId: 'ev-1', deviceId: 'd-1' })).toBe('blocked');
  });

  it('reports blocked when the hydrated event is a different one', async () => {
    await hydrate({ api: workingApi, eventId: 'ev-1', deviceId: 'd-1' });
    const failing = { push: workingApi.push, pull: async () => { throw new Error('offline'); } };
    expect(await hydrate({ api: failing, eventId: 'ev-2', deviceId: 'd-1' })).toBe('blocked');
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
pnpm --filter @frc/client exec vitest run src/data/sync.test.ts
```

Expected: `Failed to resolve import "./sync"`.

- [ ] **Step 3: Implement**

`apps/client/src/data/api.ts`:

```ts
import type { PullRequest, PullResponse, PushRequest, PushResponse } from '@frc/shared';
import type { ClientConfig } from '@/config';

export type Api = {
  push(request: PushRequest): Promise<PushResponse>;
  pull(request: PullRequest): Promise<PullResponse>;
};

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export type TokenSource = () => Promise<string | null>;

export function apiClient(config: ClientConfig, token: TokenSource = async () => null): Api {
  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const bearer = await token();
    const res = await fetch(`${config.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        ...init.headers,
      },
    });
    const body: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = (body as { error?: { code?: string; message?: string } }).error;
      throw new ApiError(error?.code ?? 'unknown', error?.message ?? res.statusText, res.status);
    }
    return body as T;
  }

  return {
    push: (r) => request<PushResponse>('/sync/push', { method: 'POST', body: JSON.stringify(r) }),
    pull: (r) => {
      const params = new URLSearchParams({ event_id: r.event_id });
      if (r.since) params.set('since', r.since);
      if (r.cursor) params.set('cursor', r.cursor);
      return request<PullResponse>(`/sync/pull?${params.toString()}`, { method: 'GET' });
    },
  };
}
```

`apps/client/src/data/sync.ts`:

```ts
import { MAX_OPERATIONS_PER_PUSH, PULL_ENTITY_KEYS, type PullEntityKey } from '@frc/shared';
import { db, getMeta, setMeta } from './db';
import { ackResults, pending } from './outbox';
import type { Api } from './api';

export type SyncDeps = {
  api: Api;
  eventId: string;
  deviceId: string;
  /** Guard against an endless cursor loop; the real cap is the server's page size. */
  maxPages?: number;
};

export type SyncOutcome =
  | { status: 'ok'; pushed: number; pulled: number }
  | { status: 'offline'; reason: string }
  | { status: 'event-gone' };

const WATERMARK = 'sync.watermark';
const HYDRATED = 'sync.hydrated_event_id';

function isEventGone(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'not-found';
}

/** SPEC-FINAL 9.3, 9.4: push first so nothing local is overwritten by a stale pull. */
export async function syncNow(deps: SyncDeps): Promise<SyncOutcome> {
  let pushed = 0;
  try {
    for (;;) {
      const batch = await pending(MAX_OPERATIONS_PER_PUSH);
      if (batch.length === 0) break;
      const response = await deps.api.push({ device_id: deps.deviceId, operations: batch });
      await ackResults(response.results);
      pushed += response.results.length;
      const stillPending = await pending(MAX_OPERATIONS_PER_PUSH);
      if (stillPending.length === batch.length) break; // nothing was acked; stop retrying
    }
  } catch (e) {
    if (isEventGone(e)) return wipeEvent(deps.eventId);
    return { status: 'offline', reason: e instanceof Error ? e.message : 'push failed' };
  }

  let pulled = 0;
  try {
    const since = await getMeta<string | null>(WATERMARK, null);
    let cursor: string | undefined;
    let bestWatermark = since;
    let complete = false;
    const maxPages = deps.maxPages ?? 50;

    for (let page = 0; page < maxPages; page += 1) {
      const response = await deps.api.pull({
        event_id: deps.eventId,
        ...(since ? { since } : {}),
        ...(cursor ? { cursor } : {}),
      });
      pulled += await upsertEntities(response.entities);
      if (bestWatermark === null || response.watermark > bestWatermark) bestWatermark = response.watermark;
      if (response.complete) {
        complete = true;
        break;
      }
      cursor = response.next_cursor ?? undefined;
      if (cursor === undefined) {
        complete = true;
        break;
      }
    }

    if (complete && bestWatermark !== null) {
      await setMeta(WATERMARK, bestWatermark);
      await setMeta(HYDRATED, deps.eventId);
      await setMeta('sync.last_success_at', new Date().toISOString());
    }
  } catch (e) {
    if (isEventGone(e)) return wipeEvent(deps.eventId);
    return { status: 'offline', reason: e instanceof Error ? e.message : 'pull failed' };
  }

  return { status: 'ok', pushed, pulled };
}

async function upsertEntities(entities: Record<PullEntityKey, Record<string, unknown>[]>): Promise<number> {
  let count = 0;
  await db.transaction('rw', db.rows, async () => {
    for (const key of PULL_ENTITY_KEYS) {
      const rows = entities[key] ?? [];
      if (rows.length === 0) continue;
      // Idempotent upsert: an overlapping row that arrives twice simply overwrites itself.
      await db.rows.bulkPut(rows.map((row) => ({ ...row, entity: key, id: String(row.id) })));
      count += rows.length;
    }
  });
  return count;
}

async function wipeEvent(eventId: string): Promise<SyncOutcome> {
  await db.rows.where('event_id').equals(eventId).delete();
  await setMeta(WATERMARK, null);
  await setMeta(HYDRATED, null);
  return { status: 'event-gone' };
}

export type HydrationState = 'fresh' | 'cached' | 'blocked';

/**
 * SPEC-FINAL 9.3: the three hydration outcomes, exactly.
 *
 * `cached` requires a COMPLETED first pull for this event, not merely some rows. A
 * first pull that reached page 1 of 3 and then lost the network leaves the device with
 * a partial form definition, and rendering an entry form from that would be worse than
 * refusing — which is why the test is the HYDRATED watermark, not `rows.count() > 0`.
 */
export async function hydrate(deps: SyncDeps): Promise<HydrationState> {
  const outcome = await syncNow(deps);
  if (outcome.status === 'ok') return 'fresh';
  const hydratedEventId = await getMeta<string | null>(HYDRATED, null);
  return hydratedEventId === deps.eventId ? 'cached' : 'blocked';
}
```

`apps/client/src/data/connection.ts`:

```ts
export type ConnectionState = 'online' | 'syncing' | 'offline';

let syncing = 0;

export function beginSync(): void {
  syncing += 1;
}

export function endSync(): void {
  syncing = Math.max(0, syncing - 1);
}

/** SPEC-FINAL 9.10: three states, named in words, never a silent icon. */
export function connectionState(): ConnectionState {
  if (syncing > 0) return 'syncing';
  return navigator.onLine ? 'online' : 'offline';
}
```

- [ ] **Step 4: Run and watch pass**

```bash
pnpm --filter @frc/client exec vitest run src/data && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(client): add the API client, the sync engine and the three hydration states"
```

---
## Task 1.7: Client — the skeleton entry screen, its draft and its submit

**Files:**
- Create: `apps/client/src/data/cache.ts`
- Create: `apps/client/src/features/entry/EntryPage.tsx`, `apps/client/src/features/entry/FieldInput.tsx`, `apps/client/src/features/entry/RobotStatusPicker.tsx`, `apps/client/src/features/entry/useDraft.ts`, `apps/client/src/features/entry/submitEntry.ts`
- Create: `apps/client/src/features/entry/EntryPage.test.tsx`, `apps/client/src/features/entry/submitEntry.test.ts`

**Interfaces:**
- Consumes: `db`, `enqueue`, `nextSeq`, `validateEntryData`, `type FormFieldDefinition`, `type RobotStatus`.
- Produces: `cachedFormFields(formVersionId)`, `cachedRows(entity, filter)`; `submitEntry(input, deps): Promise<{ row_id: string }>`; `<EntryPage />`; `useDraft(key)`.

**Behaviours this task must show (SPEC-FINAL §8.2, §8.3):** mandatory robot status **before** the scoring fields; `no_show` and `disabled` hide every field and submit `data = {}`; `broke_down` captures `breakdown_seconds` and keeps all fields visible; a counter is a wide − / value / + triplet and **never a text input**; every interaction writes a local draft immediately; submit shows a confirmation summary of the whole entry before it commits.

- [ ] **Step 1: Write the failing tests**

`apps/client/src/features/entry/submitEntry.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { FormFieldDefinition } from '@frc/shared';
import { db } from '@/data/db';
import { pending } from '@/data/outbox';
import { submitEntry } from './submitEntry';

const fields: FormFieldDefinition[] = [
  {
    id: 'f1', key: 'auto_notes', label: 'Auto notes', type: 'counter', display_order: 1,
    required: true, config: { min: 0, max: 10, step: 1 }, section: null, help_text: null,
    default_value: 0, visibility_condition: null, deprecated: false, description: 'x',
    unit: 'count', phase: 'auto', direction: 'higher_is_better', category: null,
    expected_range: { min: 0, max: 10 }, include_in_ai_context: null, is_ordinal: null,
  },
];

const base = {
  fields,
  eventId: 'ev-1',
  formVersionId: 'fv-1',
  formKind: 'match' as const,
  matchId: 'm-1',
  teamId: 't-1',
  alliance: 'red' as const,
  authorUserId: 'u-1',
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('submitEntry', () => {
  it('queues one create operation carrying the whole row', async () => {
    const { row_id } = await submitEntry({ ...base, robotStatus: 'played', data: { auto_notes: 3 } });
    const [op] = await pending(10);
    expect(op!.entity).toBe('scouting_entry');
    expect(op!.action).toBe('create');
    expect(op!.row_id).toBe(row_id);
    expect(op!.payload).toMatchObject({
      event_id: 'ev-1', match_id: 'm-1', team_id: 't-1', alliance: 'red',
      form_kind: 'match', robot_status: 'played', data: { auto_notes: 3 },
    });
    expect(op!.author_user_id).toBe('u-1');
  });

  it('writes the row into the local dataset immediately, so statistics include it offline', async () => {
    const { row_id } = await submitEntry({ ...base, robotStatus: 'played', data: { auto_notes: 3 } });
    const row = await db.rows.get(['scouting_entries', row_id]);
    expect(row).toMatchObject({ event_id: 'ev-1', version: 1 });
  });

  it('submits data = {} for a no-show and never a zero (SPEC-FINAL 8.2)', async () => {
    await submitEntry({ ...base, robotStatus: 'no_show', data: { auto_notes: 0 } });
    const [op] = await pending(10);
    expect(op!.payload.data).toEqual({});
    expect(op!.payload.robot_status).toBe('no_show');
  });

  it('carries breakdown_seconds only for broke_down', async () => {
    await submitEntry({ ...base, robotStatus: 'broke_down', breakdownSeconds: 45, data: { auto_notes: 2 } });
    const [op] = await pending(10);
    expect(op!.payload.breakdown_seconds).toBe(45);

    await db.delete(); await db.open();
    await submitEntry({ ...base, robotStatus: 'played', breakdownSeconds: 45, data: { auto_notes: 2 } });
    const [second] = await pending(10);
    expect(second!.payload.breakdown_seconds).toBeNull();
  });

  it('refuses a value outside the expected range (SPEC-FINAL 15.1)', async () => {
    await expect(
      submitEntry({ ...base, robotStatus: 'played', data: { auto_notes: 11 } }),
    ).rejects.toThrow(/expected range/i);
    expect(await pending(10)).toHaveLength(0);
  });

  it('refuses a second entry for the same (event, kind, team, match) already on this device', async () => {
    await submitEntry({ ...base, robotStatus: 'played', data: { auto_notes: 1 } });
    await expect(
      submitEntry({ ...base, robotStatus: 'played', data: { auto_notes: 2 } }),
    ).rejects.toThrow(/already an entry/i);
  });

  it('clears the draft once the entry is queued', async () => {
    await db.drafts.put({ key: 'match:m-1:t-1', row_id: 'x', payload: {}, updated_at: 'now' });
    await submitEntry({ ...base, robotStatus: 'played', data: { auto_notes: 1 }, draftKey: 'match:m-1:t-1' });
    expect(await db.drafts.get('match:m-1:t-1')).toBeUndefined();
  });
});
```

`apps/client/src/features/entry/EntryPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/data/db';
import { pending } from '@/data/outbox';
import { EntryPage } from './EntryPage';

const field = (over: Record<string, unknown>) => ({
  entity: 'form_fields' as const,
  form_version_id: 'fv-1',
  required: false,
  deprecated: false,
  config: {},
  ...over,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.rows.bulkPut([
    field({ id: 'f1', key: 'auto_notes', label: 'Auto notes', type: 'counter', display_order: 1, phase: 'auto', unit: 'count', direction: 'higher_is_better', config: { min: 0, max: 10, step: 1 }, expected_range: { min: 0, max: 10 } }),
    field({ id: 'f2', key: 'notes', label: 'Notes', type: 'long_text', display_order: 2, phase: 'post_match', unit: 'text', direction: 'neutral' }),
  ]);
});

const props = {
  eventId: 'ev-1', formVersionId: 'fv-1', matchId: 'm-1', teamId: 't-1',
  alliance: 'red' as const, authorUserId: 'u-1', teamLabel: '2096 ROBACTIVE', matchLabel: 'Q12',
};

describe('EntryPage', () => {
  it('asks for robot status before it shows any scoring field', async () => {
    render(<EntryPage {...props} />);
    expect(await screen.findByRole('group', { name: /robot status/i })).toBeInTheDocument();
    expect(screen.queryByText('Auto notes')).not.toBeInTheDocument();
  });

  it('shows the fields once the robot is marked as played', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    expect(await screen.findByText('Auto notes')).toBeInTheDocument();
  });

  it('hides every field for a no-show, and records no values', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /no show/i }));
    expect(screen.queryByText('Auto notes')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));
    await waitFor(async () => expect((await pending(10))[0]?.payload.data).toEqual({}));
  });

  it('increments a counter by tapping plus, and never renders a text input for it', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    const plus = await screen.findByRole('button', { name: 'Auto notes plus one' });
    await user.click(plus);
    await user.click(plus);
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('2');
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('undoes the last counter tap', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    await user.click(await screen.findByRole('button', { name: 'Auto notes plus one' }));
    await user.click(screen.getByRole('button', { name: 'Auto notes minus one' }));
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('0');
  });

  it('writes a draft on every interaction and recovers it on remount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    await user.click(await screen.findByRole('button', { name: 'Auto notes plus one' }));
    await waitFor(async () => expect(await db.drafts.count()).toBe(1));
    unmount();

    render(<EntryPage {...props} />);
    expect(await screen.findByLabelText('Auto notes value')).toHaveTextContent('1');
  });

  it('shows a confirmation summary of the whole entry before it commits', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    await user.click(await screen.findByRole('button', { name: 'Auto notes plus one' }));
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('2096 ROBACTIVE');
    expect(dialog).toHaveTextContent('Auto notes');
    expect(await pending(10)).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /submit entry/i }));
    await waitFor(async () => expect(await pending(10)).toHaveLength(1));
  });

  it('blocks submission and names the field when a value is outside its expected range', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    const plus = await screen.findByRole('button', { name: 'Auto notes plus one' });
    for (let i = 0; i < 11; i += 1) await user.click(plus);
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Auto notes/);
    expect(await pending(10)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
pnpm --filter @frc/client exec vitest run src/features/entry
```

Expected: `Failed to resolve import "./submitEntry"` and `"./EntryPage"`.

- [ ] **Step 3: Implement the cache reader**

`apps/client/src/data/cache.ts`:

```ts
import type { FormFieldDefinition, PullEntityKey } from '@frc/shared';
import { db } from './db';

export async function cachedRows<T = Record<string, unknown>>(entity: PullEntityKey): Promise<T[]> {
  return (await db.rows.where('entity').equals(entity).toArray()) as unknown as T[];
}

export async function cachedFormFields(formVersionId: string): Promise<FormFieldDefinition[]> {
  const all = await cachedRows<FormFieldDefinition & { form_version_id: string }>('form_fields');
  return all
    .filter((f) => f.form_version_id === formVersionId && !f.deprecated)
    .sort((a, b) => a.display_order - b.display_order);
}

export async function cachedEntry(rowId: string): Promise<Record<string, unknown> | undefined> {
  return db.rows.get(['scouting_entries', rowId]);
}
```

- [ ] **Step 4: Implement submit**

`apps/client/src/features/entry/submitEntry.ts`:

```ts
import {
  validateEntryData,
  validateEntryShape,
  type FormFieldDefinition,
  type RobotStatus,
} from '@frc/shared';
import { db } from '@/data/db';
import { enqueue, nextSeq } from '@/data/outbox';

export type SubmitEntryInput = {
  fields: FormFieldDefinition[];
  eventId: string;
  formVersionId: string;
  formKind: 'match' | 'super';
  matchId: string | null;
  teamId: string;
  alliance: 'red' | 'blue' | null;
  authorUserId: string;
  robotStatus: RobotStatus | null;
  breakdownSeconds?: number;
  data: Record<string, unknown>;
  draftKey?: string;
  rowId?: string;
};

/**
 * SPEC-FINAL 8.2, 9.4, 9.5. The client refuses to create a second entry for the same
 * logical key locally; the duplicate path exists for the case it cannot see — two
 * devices, both offline.
 */
export async function submitEntry(input: SubmitEntryInput): Promise<{ row_id: string }> {
  const dead = input.robotStatus === 'no_show' || input.robotStatus === 'disabled';
  const data = dead ? {} : input.data;

  // The same three SPEC-FINAL 3.5 rules the server enforces on push. Checking them here
  // too is what turns a server rejection into a message the scouter sees before they
  // leave the screen.
  const shapeIssues = validateEntryShape({
    form_kind: input.formKind,
    match_id: input.matchId,
    alliance: input.formKind === 'match' ? input.alliance : null,
    robot_status: input.formKind === 'match' ? input.robotStatus : null,
    breakdown_seconds: input.robotStatus === 'broke_down' ? (input.breakdownSeconds ?? null) : null,
  });
  if (shapeIssues.length > 0) throw new Error(shapeIssues.join('
'));

  const validation = validateEntryData(input.fields, input.robotStatus ?? 'played', data);
  if (!validation.ok) {
    throw new Error(validation.issues.map((i) => i.message).join('\n'));
  }

  if (!input.rowId) {
    const existing = (await db.rows.where('entity').equals('scouting_entries').toArray()).find(
      (row) =>
        row.event_id === input.eventId &&
        row.form_kind === input.formKind &&
        row.team_id === input.teamId &&
        (row.match_id ?? null) === input.matchId &&
        row.deleted_at == null,
    );
    if (existing) {
      throw new Error('there is already an entry for this team in this match on this device');
    }
  }

  const rowId = input.rowId ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const existingRow = input.rowId ? await db.rows.get(['scouting_entries', rowId]) : undefined;

  const payload: Record<string, unknown> = {
    id: rowId,
    form_version_id: input.formVersionId,
    form_kind: input.formKind,
    event_id: input.eventId,
    match_id: input.matchId,
    team_id: input.teamId,
    alliance: input.formKind === 'match' ? input.alliance : null,
    scouter_id: input.authorUserId,
    robot_status: input.formKind === 'match' ? input.robotStatus : null,
    breakdown_seconds: input.robotStatus === 'broke_down' ? (input.breakdownSeconds ?? null) : null,
    data,
  };

  await enqueue({
    op_id: crypto.randomUUID(),
    entity: 'scouting_entry',
    row_id: rowId,
    action: existingRow ? 'update' : 'create',
    base_version: existingRow ? Number(existingRow.version ?? 1) : null,
    payload,
    author_user_id: input.authorUserId,
    client_created_at: String(existingRow?.client_created_at ?? now),
    client_updated_at: now,
    seq: await nextSeq(),
  });

  // Optimistic local write: the user's own action appears instantly (SPEC-FINAL 10).
  await db.rows.put({
    ...payload,
    entity: 'scouting_entries',
    id: rowId,
    version: Number(existingRow?.version ?? 1),
    client_created_at: String(existingRow?.client_created_at ?? now),
    client_updated_at: now,
    updated_at: now,
    deleted_at: null,
  });

  if (input.draftKey) await db.drafts.delete(input.draftKey);

  return { row_id: rowId };
}
```

- [ ] **Step 5: Implement the screen**

`apps/client/src/features/entry/useDraft.ts`:

```ts
import { useEffect, useState } from 'react';
import { db } from '@/data/db';

export type DraftPayload = Record<string, unknown>;

/** SPEC-FINAL 8.3: every interaction writes a local draft immediately. */
export function useDraft(key: string): {
  draft: DraftPayload | null;
  loaded: boolean;
  save: (payload: DraftPayload) => void;
} {
  const [draft, setDraft] = useState<DraftPayload | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void db.drafts.get(key).then((record) => {
      if (cancelled) return;
      setDraft(record?.payload ?? null);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return {
    draft,
    loaded,
    save: (payload) => {
      setDraft(payload);
      void db.drafts.put({ key, row_id: '', payload, updated_at: new Date().toISOString() });
    },
  };
}
```

`apps/client/src/features/entry/FieldInput.tsx`:

```tsx
import type { FormFieldDefinition } from '@frc/shared';
import { selectOptions } from '@frc/shared';

type Props = {
  field: FormFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
};

/** Big touch targets, never a keyboard where a counter will do (SPEC-FINAL 8.6, 17.7). */
export function FieldInput({ field, value, onChange }: Props) {
  const label = (
    <span className="block text-sm font-medium" dir="auto">
      {field.label}
    </span>
  );

  switch (field.type) {
    case 'counter': {
      const current = typeof value === 'number' ? value : 0;
      const step = typeof field.config.step === 'number' ? field.config.step : 1;
      return (
        <div className="py-3">
          {label}
          <div className="tap-row mt-2 flex items-center">
            <button
              type="button"
              className="tap-target flex-1 rounded-lg border border-[var(--border)] text-2xl"
              aria-label={`${field.label} minus one`}
              onClick={() => onChange(Math.max(0, current - step))}
            >
              −
            </button>
            <output
              aria-label={`${field.label} value`}
              className="tap-target min-w-16 grow-0 basis-20 text-center text-2xl font-semibold leading-[48px]"
            >
              {current}
            </output>
            <button
              type="button"
              className="tap-target flex-1 rounded-lg border border-[var(--border)] text-2xl"
              aria-label={`${field.label} plus one`}
              onClick={() => onChange(current + step)}
            >
              +
            </button>
          </div>
        </div>
      );
    }
    case 'toggle':
      return (
        <label className="tap-target flex items-center justify-between py-3">
          {label}
          <input
            type="checkbox"
            className="h-8 w-14"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
        </label>
      );
    case 'single_select':
      return (
        <fieldset className="py-3">
          <legend className="text-sm font-medium" dir="auto">{field.label}</legend>
          <div className="tap-row mt-2 flex flex-wrap gap-2">
            {selectOptions(field).map((option) => (
              <label key={option.value} className="tap-target flex items-center gap-2 rounded-lg border border-[var(--border)] px-3">
                <input
                  type="radio"
                  name={field.key}
                  value={option.value}
                  checked={value === option.value}
                  onChange={() => onChange(option.value)}
                />
                <span dir="auto">{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    case 'long_text':
      return (
        <label className="block py-3">
          {label}
          <textarea
            dir="auto"
            rows={3}
            className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );
  }
}
```

`apps/client/src/features/entry/RobotStatusPicker.tsx`:

```tsx
import type { RobotStatus } from '@frc/shared';

const OPTIONS: { value: RobotStatus; label: string; token: string }[] = [
  { value: 'played', label: 'Played', token: 'var(--status-played)' },
  { value: 'broke_down', label: 'Broke down', token: 'var(--status-broke-down)' },
  { value: 'disabled', label: 'Disabled', token: 'var(--status-disabled)' },
  { value: 'no_show', label: 'No show', token: 'var(--status-no-show)' },
];

export function RobotStatusPicker({
  value,
  onChange,
}: {
  value: RobotStatus | null;
  onChange: (status: RobotStatus) => void;
}) {
  return (
    <fieldset role="group" aria-label="Robot status" className="py-2">
      <legend className="text-sm font-medium">Robot status</legend>
      <div className="tap-row mt-2 grid grid-cols-2 gap-2">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className="tap-target flex items-center gap-2 rounded-lg border px-3"
            style={{ borderColor: value === option.value ? option.token : 'var(--border)' }}
          >
            <input
              type="radio"
              name="robot_status"
              aria-label={option.label}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
```

`apps/client/src/features/entry/EntryPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import type { FormFieldDefinition, RobotStatus } from '@frc/shared';
import { cachedFormFields } from '@/data/cache';
import { FieldInput } from './FieldInput';
import { RobotStatusPicker } from './RobotStatusPicker';
import { submitEntry } from './submitEntry';
import { useDraft } from './useDraft';

export type EntryPageProps = {
  eventId: string;
  formVersionId: string;
  matchId: string;
  teamId: string;
  alliance: 'red' | 'blue';
  authorUserId: string;
  teamLabel: string;
  matchLabel: string;
  onSubmitted?: (rowId: string) => void;
};

const PHASE_ORDER = ['auto', 'teleop', 'endgame', 'post_match'] as const;
const PHASE_LABEL: Record<string, string> = {
  auto: 'Autonomous', teleop: 'Teleop', endgame: 'Endgame', post_match: 'Post-match',
};

export function EntryPage(props: EntryPageProps) {
  const draftKey = `${props.formVersionId}:${props.matchId}:${props.teamId}`;
  const { draft, loaded, save } = useDraft(draftKey);
  const [fields, setFields] = useState<FormFieldDefinition[]>([]);
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [breakdownSeconds, setBreakdownSeconds] = useState<number>(0);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void cachedFormFields(props.formVersionId).then(setFields);
  }, [props.formVersionId]);

  useEffect(() => {
    if (!loaded || draft === null) return;
    setStatus((draft.robot_status as RobotStatus | null) ?? null);
    setData((draft.data as Record<string, unknown>) ?? {});
    setBreakdownSeconds(Number(draft.breakdown_seconds ?? 0));
  }, [loaded, draft]);

  const dead = status === 'no_show' || status === 'disabled';

  const byPhase = useMemo(() => {
    const groups = new Map<string, FormFieldDefinition[]>();
    for (const field of fields) {
      const phase = field.phase ?? 'post_match';
      groups.set(phase, [...(groups.get(phase) ?? []), field]);
    }
    return groups;
  }, [fields]);

  function update(next: { status?: RobotStatus; data?: Record<string, unknown>; seconds?: number }) {
    const nextStatus = next.status ?? status;
    const nextData = next.data ?? data;
    const nextSeconds = next.seconds ?? breakdownSeconds;
    setStatus(nextStatus);
    setData(nextData);
    setBreakdownSeconds(nextSeconds);
    save({ robot_status: nextStatus, data: nextData, breakdown_seconds: nextSeconds });
  }

  async function commit() {
    setError(null);
    try {
      const { row_id } = await submitEntry({
        fields,
        eventId: props.eventId,
        formVersionId: props.formVersionId,
        formKind: 'match',
        matchId: props.matchId,
        teamId: props.teamId,
        alliance: props.alliance,
        authorUserId: props.authorUserId,
        robotStatus: status,
        breakdownSeconds,
        data,
        draftKey,
      });
      setReviewing(false);
      props.onSubmitted?.(row_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not submit');
    }
  }

  return (
    <main className="mx-auto max-w-xl p-4 pb-32">
      <header className="mb-2">
        <h1 className="text-lg font-semibold">
          {props.matchLabel} · <span dir="auto">{props.teamLabel}</span>
        </h1>
        <p className="text-sm text-[var(--text-muted)]">{props.alliance === 'red' ? 'Red alliance' : 'Blue alliance'}</p>
      </header>

      <RobotStatusPicker value={status} onChange={(s) => update({ status: s })} />

      {status === 'broke_down' && (
        <label className="block py-3">
          <span className="text-sm font-medium">Breakdown time (seconds from match start)</span>
          <input
            type="number"
            min={0}
            className="tap-target mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
            value={breakdownSeconds}
            onChange={(e) => update({ seconds: Number(e.target.value) })}
          />
        </label>
      )}

      {status !== null && !dead &&
        PHASE_ORDER.filter((phase) => (byPhase.get(phase) ?? []).length > 0).map((phase) => (
          <details key={phase} open className="mt-4 rounded-lg border border-[var(--border)] p-3">
            <summary className="cursor-pointer text-sm font-semibold">{PHASE_LABEL[phase]}</summary>
            {(byPhase.get(phase) ?? []).map((field) => (
              <FieldInput
                key={field.key}
                field={field}
                value={data[field.key]}
                onChange={(value) => update({ data: { ...data, [field.key]: value } })}
              />
            ))}
          </details>
        ))}

      {dead && (
        <p className="mt-4 rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">
          No fields are recorded for a {status === 'no_show' ? 'no-show' : 'disabled'} robot. The entry
          records the status only — never zeros.
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-[var(--border)] bg-[var(--surface)] p-3">
        <button
          type="button"
          disabled={status === null}
          className="tap-target w-full rounded-lg bg-[var(--brand-plate)] font-semibold text-[var(--brand)] disabled:opacity-50"
          onClick={() => setReviewing(true)}
        >
          Review entry
        </button>
      </div>

      {reviewing && (
        <div role="dialog" aria-modal="true" aria-label="Confirm this entry"
             className="fixed inset-0 z-10 overflow-auto bg-[var(--bg)] p-4">
          <h2 className="text-lg font-semibold">Confirm this entry</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <div><dt className="inline font-medium">Match: </dt><dd className="inline">{props.matchLabel}</dd></div>
            <div><dt className="inline font-medium">Team: </dt><dd className="inline" dir="auto">{props.teamLabel}</dd></div>
            <div><dt className="inline font-medium">Alliance: </dt><dd className="inline">{props.alliance}</dd></div>
            <div><dt className="inline font-medium">Status: </dt><dd className="inline">{status}</dd></div>
            {!dead && fields.map((field) => (
              <div key={field.key}>
                <dt className="inline font-medium" dir="auto">{field.label}: </dt>
                <dd className="inline" dir="auto">{String(data[field.key] ?? '—')}</dd>
              </div>
            ))}
          </dl>
          {error && <p role="alert" className="mt-3 text-[var(--danger)]">{error}</p>}
          <div className="tap-row mt-4 flex gap-2">
            <button type="button" className="tap-target flex-1 rounded-lg border border-[var(--border)]"
                    onClick={() => setReviewing(false)}>
              Keep editing
            </button>
            <button type="button" className="tap-target flex-1 rounded-lg bg-[var(--brand-plate)] font-semibold text-[var(--brand)]"
                    onClick={() => void commit()}>
              Submit entry
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
```

Add `"@testing-library/user-event": "^14.5.2"` to `apps/client` devDependencies.

- [ ] **Step 6: Run and watch pass**

```bash
pnpm install && pnpm --filter @frc/client exec vitest run src/features/entry && pnpm typecheck && pnpm lint
```

Expected: every suite green, with the new file(s) from this task among them; typecheck and lint clean.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(client): add the skeleton entry screen with drafts, robot status and confirm-before-submit"
```

---

## Task 1.8: Client — routing, the connection indicator and the laptop entries view

**Files:**
- Create: `apps/client/src/routes.tsx`, `apps/client/src/features/shell/AppShell.tsx`, `apps/client/src/features/shell/ConnectionIndicator.tsx`, `apps/client/src/features/shell/ConnectionIndicator.test.tsx`
- Create: `apps/client/src/features/entry/SelectRobotPage.tsx`, `apps/client/src/features/entry/SelectRobotPage.test.tsx`, `apps/client/src/features/entry/EntryRoute.tsx`
- Create: `apps/client/src/features/entries/EntriesPage.tsx`, `apps/client/src/features/entries/EntriesPage.test.tsx`
- Modify: `apps/client/src/App.tsx`, `apps/client/package.json` (add `"react-router-dom": "^7.0.1"`, `"@tanstack/react-query": "^5.59.20"`)

**Interfaces:**
- Produces: the routes `/` (select robot), `/entry/:matchId/:teamId`, `/entries` (the laptop view), `/sync`; `<ConnectionIndicator />` — always visible, three states named in words plus the unsynced count; `<AppShell />` running hydration on open and a **45-second background refresh while online** (SPEC-FINAL §10).

- [ ] **Step 1: Write the failing tests**

`apps/client/src/features/shell/ConnectionIndicator.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/data/db';
import { enqueue } from '@/data/outbox';
import { ConnectionIndicator } from './ConnectionIndicator';

const op = (rowId: string) => ({
  op_id: `op-${rowId}`, entity: 'scouting_entry' as const, row_id: rowId, action: 'create' as const,
  base_version: null, payload: {}, author_user_id: 'u-1',
  client_created_at: '2026-11-14T09:00:00.000Z', client_updated_at: '2026-11-14T09:00:00.000Z', seq: 1,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('ConnectionIndicator (SPEC-FINAL 9.10)', () => {
  it('names the state in words, not just a colour', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<ConnectionIndicator />);
    expect(await screen.findByText(/online/i)).toBeInTheDocument();
  });

  it('shows the unsynced count next to the state when offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await enqueue(op('r-1'));
    await enqueue(op('r-2'));
    render(<ConnectionIndicator />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('offline · 2 unsynced'));
  });

  it('says nothing about a count when there is nothing unsynced', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<ConnectionIndicator />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^online$/i));
  });
});
```

`apps/client/src/features/entries/EntriesPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/data/db';
import { EntriesPage } from './EntriesPage';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.rows.bulkPut([
    { entity: 'teams', id: 't-1', number: 2096, name: 'ROBACTIVE' },
    { entity: 'matches', id: 'm-1', event_id: 'ev-1', match_type: 'qualification', number: 12 },
    { entity: 'users', id: 'u-1', full_name: 'Seed Scouter', username: 'seed_scouter' },
    {
      entity: 'scouting_entries', id: 'e-1', event_id: 'ev-1', match_id: 'm-1', team_id: 't-1',
      scouter_id: 'u-1', robot_status: 'played', data: { auto_notes: 3 }, deleted_at: null,
      client_updated_at: '2026-11-14T09:00:00.000Z',
    },
    {
      entity: 'scouting_entries', id: 'e-2', event_id: 'ev-1', match_id: 'm-1', team_id: 't-1',
      scouter_id: 'u-1', robot_status: 'no_show', data: {}, deleted_at: '2026-11-14T09:30:00.000Z',
      client_updated_at: '2026-11-14T09:20:00.000Z',
    },
  ]);
});

describe('EntriesPage — the laptop view of the walking skeleton', () => {
  it('lists a live entry with its match, team, status and scouter', async () => {
    render(<EntriesPage eventId="ev-1" />);
    const row = await screen.findByRole('row', { name: /2096/ });
    expect(row).toHaveTextContent('12');
    expect(row).toHaveTextContent('ROBACTIVE');
    expect(row).toHaveTextContent('played');
    expect(row).toHaveTextContent('Seed Scouter');
  });

  it('never lists a soft-deleted entry', async () => {
    render(<EntriesPage eventId="ev-1" />);
    expect(await screen.findAllByRole('row')).toHaveLength(2); // header + one live row
  });

  it('shows the empty state when the event has no entries', async () => {
    await db.rows.where('entity').equals('scouting_entries').delete();
    render(<EntriesPage eventId="ev-1" />);
    expect(await screen.findByText(/no entries yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
pnpm --filter @frc/client exec vitest run src/features/shell src/features/entries
```

Expected: `Failed to resolve import "./ConnectionIndicator"` and `"./EntriesPage"`.

- [ ] **Step 3: Implement**

`apps/client/src/features/shell/ConnectionIndicator.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { connectionState, type ConnectionState } from '@/data/connection';
import { unackedCount } from '@/data/outbox';

const TOKEN: Record<ConnectionState, string> = {
  online: 'var(--sync-online)',
  syncing: 'var(--sync-syncing)',
  offline: 'var(--sync-offline)',
};

/**
 * SPEC-FINAL 9.10: a primary UI element, not a footnote. It names the state in words
 * plus the unsynced count — "offline · 4 unsynced".
 */
export function ConnectionIndicator() {
  const [state, setState] = useState<ConnectionState>(connectionState());
  const [unsynced, setUnsynced] = useState(0);

  useEffect(() => {
    const tick = () => {
      setState(connectionState());
      void unackedCount().then(setUnsynced);
    };
    tick();
    const timer = setInterval(tick, 2000);
    window.addEventListener('online', tick);
    window.addEventListener('offline', tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', tick);
      window.removeEventListener('offline', tick);
    };
  }, []);

  return (
    <span
      role="status"
      className="tap-target inline-flex items-center gap-2 px-3 text-sm"
      style={{ color: TOKEN[state] }}
    >
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: TOKEN[state] }} />
      {unsynced > 0 ? `${state} · ${unsynced} unsynced` : state}
    </span>
  );
}
```

`apps/client/src/features/entries/EntriesPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { formatCount, formatDate, formatTime } from '@frc/shared';
import { cachedRows } from '@/data/cache';

type Row = {
  id: string;
  match: string;
  team: string;
  status: string;
  scouter: string;
  when: string;
};

export function EntriesPage({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    void (async () => {
      const [entries, matches, teams, users] = await Promise.all([
        cachedRows('scouting_entries'),
        cachedRows('matches'),
        cachedRows('teams'),
        cachedRows('users'),
      ]);
      const matchById = new Map(matches.map((m) => [String(m.id), m]));
      const teamById = new Map(teams.map((t) => [String(t.id), t]));
      const userById = new Map(users.map((u) => [String(u.id), u]));

      setRows(
        entries
          .filter((e) => e.event_id === eventId && e.deleted_at == null)
          .map((e) => ({
            id: String(e.id),
            match: formatCount(Number(matchById.get(String(e.match_id))?.number ?? NaN)),
            team: `${formatCount(Number(teamById.get(String(e.team_id))?.number ?? NaN))} ${
              teamById.get(String(e.team_id))?.name ?? ''
            }`,
            status: String(e.robot_status ?? ''),
            scouter: String(userById.get(String(e.scouter_id))?.full_name ?? ''),
            when: `${formatDate(String(e.client_updated_at))} ${formatTime(String(e.client_updated_at))}`,
          }))
          .sort((a, b) => Number(a.match) - Number(b.match)),
      );
    })();
  }, [eventId]);

  if (rows === null) return <p className="p-4 text-[var(--text-muted)]">Loading…</p>;

  if (rows.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-lg font-semibold">No entries yet</p>
        <p className="text-[var(--text-muted)]">
          Entries appear here as soon as a device syncs. Nothing is lost while a device is offline.
        </p>
      </div>
    );
  }

  return (
    <div className="max-h-[70vh] overflow-auto p-4">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[var(--surface)]">
          <tr>
            <th className="p-2 text-right">Match</th>
            <th className="p-2 text-left">Team</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Scouter</th>
            <th className="p-2 text-left">Recorded</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-[var(--border)]">
              <td className="p-2 text-right tabular-nums">{row.match}</td>
              <td className="p-2" dir="auto">{row.team}</td>
              <td className="p-2">{row.status}</td>
              <td className="p-2" dir="auto">{row.scouter}</td>
              <td className="p-2 tabular-nums">{row.when}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`apps/client/src/features/shell/AppShell.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { clientConfig } from '@/config';
import { apiClient } from '@/data/api';
import { beginSync, endSync } from '@/data/connection';
import { getMeta, setMeta } from '@/data/db';
import { hydrate, syncNow, type HydrationState } from '@/data/sync';
import { ConnectionIndicator } from './ConnectionIndicator';

/** SPEC-FINAL 10: a background auto-refresh every 45 seconds on data-bearing screens. */
const AUTO_REFRESH_MS = 45_000;

async function deviceId(): Promise<string> {
  const existing = await getMeta<string | null>('device.id', null);
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  await setMeta('device.id', fresh);
  return fresh;
}

export function AppShell({ eventId }: { eventId: string }) {
  const [state, setState] = useState<HydrationState | 'loading'>('loading');

  useEffect(() => {
    const api = apiClient(clientConfig());
    let stopped = false;

    async function run(first: boolean) {
      beginSync();
      try {
        const id = await deviceId();
        if (first) setState(await hydrate({ api, eventId, deviceId: id }));
        else await syncNow({ api, eventId, deviceId: id });
      } finally {
        endSync();
      }
    }

    void run(true);
    const timer = setInterval(() => {
      if (!stopped && navigator.onLine) void run(false);
    }, AUTO_REFRESH_MS);
    const onReconnect = () => void run(false);
    window.addEventListener('online', onReconnect);

    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('online', onReconnect);
    };
  }, [eventId]);

  if (state === 'blocked') {
    return (
      <div className="p-8 text-center">
        <h1 className="text-lg font-semibold">This device has not loaded the competition yet</h1>
        <p className="text-[var(--text-muted)]">
          An internet connection is required once, to load the event and its form. After that the app
          works with no network at all.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b border-[var(--border)] p-2">
        <nav className="tap-row flex">
          <Link className="tap-target px-3 leading-[48px]" to="/">Scout</Link>
          <Link className="tap-target px-3 leading-[48px]" to="/entries">Entries</Link>
        </nav>
        <ConnectionIndicator />
      </header>
      {state === 'cached' && (
        <p className="border-b border-[var(--border)] p-2 text-sm text-[var(--text-muted)]">
          Working from data already on this device. Your entries are safe here and will sync when a
          connection returns.
        </p>
      )}
      <Outlet />
      <footer className="p-2 text-center text-xs text-[var(--text-muted)]">
        version {clientConfig().appVersion}
      </footer>
    </div>
  );
}
```

`apps/client/src/features/entry/SelectRobotPage.tsx` — the manual selection of SPEC-FINAL §8.1: a match picker, a red/blue toggle, and a team select filtered to that match's `match_teams` for the chosen alliance, falling back to the whole roster when the slots are empty. It navigates to `/entry/:matchId/:teamId`.

**It also carries the client half of bare-match auto-creation (§6.4).** Without it a scouter at a venue with an incomplete schedule cannot record a match at all, which is the exact failure §6.4 exists to prevent. So the match picker is a **number input plus a type select**, never a dropdown of known matches: if the number is already known the page uses that match, and **if it is not, the page creates it** — offline, through the outbox, like any other create.

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCount } from '@frc/shared';
import { cachedRows } from '@/data/cache';
import { db } from '@/data/db';
import { enqueue, nextSeq } from '@/data/outbox';

type MatchRow = { id: string; event_id: string; match_type: string; number: number };
type TeamRow = { id: string; number: number; name: string };
type SlotRow = { match_id: string; alliance: 'red' | 'blue'; team_id: string };
type RosterRow = { event_id: string; team_id: string; deleted_at: string | null };

export function SelectRobotPage({ eventId, authorUserId }: { eventId: string; authorUserId: string }) {
  const navigate = useNavigate();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [roster, setRoster] = useState<TeamRow[]>([]);
  const [matchType, setMatchType] = useState('qualification');
  const [number, setNumber] = useState('');
  const [alliance, setAlliance] = useState<'red' | 'blue' | null>(null);

  useEffect(() => {
    void (async () => {
      setMatches((await cachedRows<MatchRow>('matches')).filter((m) => m.event_id === eventId));
      setSlots(await cachedRows<SlotRow>('match_teams'));
      const teamById = new Map((await cachedRows<TeamRow>('teams')).map((t) => [t.id, t]));
      const live = (await cachedRows<RosterRow>('event_teams')).filter(
        (r) => r.event_id === eventId && r.deleted_at == null,
      );
      setRoster(live.map((r) => teamById.get(r.team_id)).filter((t): t is TeamRow => Boolean(t)));
    })();
  }, [eventId]);

  const parsed = Number(number);
  const existing = matches.find((m) => m.match_type === matchType && m.number === parsed);
  const listed = existing
    ? slots.filter((s) => s.match_id === existing.id && s.alliance === alliance).map((s) => s.team_id)
    : [];
  const choices = listed.length > 0 ? roster.filter((t) => listed.includes(t.id)) : roster;

  /**
   * SPEC-FINAL 6.4: a system action, not an admin capability. It creates the minimal row
   * — event, type, number, nothing else — rides the outbox, and works offline.
   */
  async function ensureMatchLocally(): Promise<string> {
    if (existing) return existing.id;
    const rowId = crypto.randomUUID();
    const now = new Date().toISOString();
    const payload = { id: rowId, event_id: eventId, match_type: matchType, number: parsed };
    await enqueue({
      op_id: crypto.randomUUID(),
      entity: 'match',
      row_id: rowId,
      action: 'create',
      base_version: null,
      payload,
      author_user_id: authorUserId,
      client_created_at: now,
      client_updated_at: now,
      seq: await nextSeq(),
    });
    // Optimistic local write, so the picker and the entry screen see it at once.
    await db.rows.put({ ...payload, entity: 'matches', version: 1, updated_at: now });
    setMatches((current) => [...current, payload]);
    return rowId;
  }

  return (
    <main className="mx-auto max-w-xl p-4">
      <label className="block py-2">
        <span className="text-sm font-medium">Match type</span>
        <select
          className="tap-target mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]"
          value={matchType}
          onChange={(e) => setMatchType(e.target.value)}
        >
          <option value="qualification">Qualification</option>
          <option value="practice">Practice</option>
          <option value="playoff">Playoff</option>
        </select>
      </label>

      <label className="block py-2">
        <span className="text-sm font-medium">Match number</span>
        <input
          type="number"
          min={1}
          inputMode="numeric"
          className="tap-target mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
        />
      </label>

      {parsed > 0 && !existing && (
        <p role="status" className="rounded-lg border border-[var(--border)] p-2 text-sm">
          Match {formatCount(parsed)} is not on this device yet. It will be created when you
          submit — keep scouting.
        </p>
      )}

      <fieldset role="group" aria-label="Alliance" className="py-2">
        <legend className="text-sm font-medium">Alliance</legend>
        <div className="tap-row mt-1 flex">
          {(['red', 'blue'] as const).map((side) => (
            <label
              key={side}
              className="tap-target flex flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--border)]"
            >
              <input
                type="radio"
                name="alliance"
                aria-label={side}
                checked={alliance === side}
                onChange={() => setAlliance(side)}
              />
              <span className="capitalize">{side}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="py-2" disabled={alliance === null || parsed <= 0}>
        <legend className="text-sm font-medium">Robot</legend>
        <div className="mt-1 grid gap-2">
          {choices.map((team) => (
            <button
              key={team.id}
              type="button"
              className="tap-target rounded-lg border border-[var(--border)] px-3 text-left"
              onClick={() => {
                void ensureMatchLocally().then((matchId) => navigate(`/entry/${matchId}/${team.id}`));
              }}
            >
              <span dir="auto">
                {formatCount(team.number)} {team.name}
              </span>
            </button>
          ))}
        </div>
      </fieldset>
    </main>
  );
}
```

`apps/client/src/features/entry/SelectRobotPage.test.tsx` asserts: the roster lists once an alliance is chosen; a **known** match number navigates and enqueues nothing; an **unknown** one shows the `role="status"` notice and, on choosing a robot, enqueues exactly one `entity: 'match'` create whose payload holds only `event_id`, `match_type` and `number` — plus a `matches` row in the local dataset; the same unknown number chosen twice yields **one** match, not two; the team list narrows to that match's `match_teams` when the slots are filled and falls back to the whole roster when they are not; and the whole flow works with `navigator.onLine` false.

`apps/client/src/routes.tsx`:

```tsx
import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/features/shell/AppShell';
import { EntriesPage } from '@/features/entries/EntriesPage';
import { SelectRobotPage } from '@/features/entry/SelectRobotPage';
import { EntryRoute } from '@/features/entry/EntryRoute';

export function buildRouter(eventId: string) {
  return createBrowserRouter([
    {
      path: '/',
      element: <AppShell eventId={eventId} />,
      children: [
        { index: true, element: <SelectRobotPage eventId={eventId} /> },
        { path: 'entry/:matchId/:teamId', element: <EntryRoute eventId={eventId} /> },
        { path: 'entries', element: <EntriesPage eventId={eventId} /> },
      ],
    },
  ]);
}
```

`EntryRoute` reads `matchId` and `teamId` from `useParams`, looks the labels up in the cache, resolves the active season's `match` form version from cached `forms`, and renders `<EntryPage />`.

`apps/client/src/App.tsx` (replace): read the active event id from the cached `app_settings` row, fall back to the seeded event id while nothing is cached, and render `<RouterProvider router={buildRouter(eventId)} />`.

- [ ] **Step 4: Run and watch pass**

```bash
pnpm install && pnpm --filter @frc/client exec vitest run && pnpm typecheck && pnpm lint
```

Expected: every suite green, including the new file(s) from this task; typecheck and lint clean.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(client): add routing, the connection indicator and the entries view"
```

---

## Task 1.9: The walking skeleton walks — smoke test and the airplane-mode rehearsal

**Files:**
- Create: `apps/server/smoke/slice.smoke.ts`, `apps/server/vitest.smoke.config.ts`
- Modify: root `package.json` (`"smoke": "node scripts/smoke.mjs && pnpm --filter @frc/server exec vitest run --config vitest.smoke.config.ts"`)
- Modify: `docs/ops/RUNBOOK.md` (add the offline verification procedure under *Pre-event checklist*)

**Interfaces:**
- Produces: the first real CI smoke test — **submit an entry through the deployed API and read it back** (SPEC-FINAL §18.4). It runs inside a namespaced `CI` season that the suite creates and tears down, against the **dev** project, never production.

- [ ] **Step 1: Write the smoke test**

`apps/server/vitest.smoke.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['smoke/**/*.smoke.ts'], testTimeout: 60000, fileParallelism: false },
});
```

`apps/server/smoke/slice.smoke.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { PullResponse, PushResponse } from '@frc/shared';

const base = process.env.SMOKE_API_BASE_URL;
const supabaseUrl = process.env.SMOKE_SUPABASE_URL;
const supabaseKey = process.env.SMOKE_SUPABASE_SERVICE_ROLE_KEY;
if (!base || !supabaseUrl || !supabaseKey) {
  throw new Error('SMOKE_API_BASE_URL, SMOKE_SUPABASE_URL and SMOKE_SUPABASE_SERVICE_ROLE_KEY are required');
}

const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
const uid = () => crypto.randomUUID();

const ids = {
  season: uid(), event: uid(), team: uid(), match: uid(),
  form: uid(), version: uid(), user: uid(), entry: uid(),
};

beforeAll(async () => {
  // A namespaced CI season, created and torn down by the suite (SPEC-FINAL 18.4).
  await db.from('seasons').insert({ id: ids.season, year: 2999, game_name: 'CI', field_image_path: 'seasons/2999/field.webp' });
  await db.from('events').insert({ id: ids.event, season_id: ids.season, name: `CI ${ids.event.slice(0, 8)}`, sort_order: 1 });
  await db.from('teams').insert({ id: ids.team, number: 900000 + Math.floor(Math.random() * 90000), name: 'CI Team' });
  await db.from('event_teams').insert({ id: uid(), event_id: ids.event, team_id: ids.team });
  await db.from('matches').insert({ id: ids.match, event_id: ids.event, match_type: 'qualification', number: 1 });
  await db.from('users').insert({ id: ids.user, username: `ci_${ids.user.slice(0, 8)}`, full_name: 'CI User', password_hash: 'x', role: 'scouter' });
  await db.from('forms').insert({ id: ids.form, season_id: ids.season, kind: 'match', name: 'CI form' });
  await db.from('form_versions').insert({ id: ids.version, form_id: ids.form, version_no: 1, published_at: new Date().toISOString() });
  await db.from('form_fields').insert({
    id: uid(), form_version_id: ids.version, key: 'ci_counter', label: 'CI counter', type: 'counter',
    display_order: 1, required: false, config: { min: 0, max: 10, step: 1 },
    description: 'CI', unit: 'count', phase: 'auto', direction: 'higher_is_better',
  });
});

afterAll(async () => {
  await db.from('scouting_entries').delete().eq('event_id', ids.event);
  await db.from('seasons').delete().eq('id', ids.season);
  await db.from('users').delete().eq('id', ids.user);
  await db.from('teams').delete().eq('id', ids.team);
});

describe('smoke: the walking skeleton path', () => {
  it('the health endpoint reads the database', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('loads the active competition and its form version', async () => {
    const res = await fetch(`${base}/sync/pull?event_id=${ids.event}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as PullResponse;
    expect(body.complete).toBe(true);
    expect(body.entities.form_fields.some((f) => f.key === 'ci_counter')).toBe(true);
  });

  it('submits an entry and reads it back', async () => {
    const now = new Date().toISOString();
    const push = await fetch(`${base}/sync/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        device_id: uid(),
        operations: [
          {
            op_id: uid(),
            entity: 'scouting_entry',
            row_id: ids.entry,
            action: 'create',
            base_version: null,
            payload: {
              form_version_id: ids.version, form_kind: 'match', event_id: ids.event,
              match_id: ids.match, team_id: ids.team, alliance: 'red',
              scouter_id: ids.user, robot_status: 'played', data: { ci_counter: 4 },
            },
            author_user_id: ids.user,
            client_created_at: now,
            client_updated_at: now,
            seq: 1,
          },
        ],
      }),
    });
    expect(push.status).toBe(200);
    const pushed = (await push.json()) as PushResponse;
    expect(pushed.results[0]).toMatchObject({ status: 'applied', new_version: 1 });

    const pull = await fetch(`${base}/sync/pull?event_id=${ids.event}`);
    const body = (await pull.json()) as PullResponse;
    const entry = body.entities.scouting_entries.find((e) => e.id === ids.entry);
    expect(entry).toBeDefined();
    expect(entry!.data).toEqual({ ci_counter: 4 });
  });

  it('replaying the same operation is a noop, never a duplicate row', async () => {
    const now = new Date().toISOString();
    const opId = uid();
    const body = {
      device_id: uid(),
      operations: [{
        op_id: opId, entity: 'scouting_entry', row_id: uid(), action: 'create', base_version: null,
        payload: {
          form_version_id: ids.version, form_kind: 'match', event_id: ids.event, match_id: ids.match,
          team_id: ids.team, alliance: 'blue', scouter_id: ids.user, robot_status: 'no_show', data: {},
        },
        author_user_id: ids.user, client_created_at: now, client_updated_at: now, seq: 1,
      }],
    };
    const headers = { 'content-type': 'application/json' };
    const first = (await (await fetch(`${base}/sync/push`, { method: 'POST', headers, body: JSON.stringify(body) })).json()) as PushResponse;
    const second = (await (await fetch(`${base}/sync/push`, { method: 'POST', headers, body: JSON.stringify(body) })).json()) as PushResponse;
    expect(first.results[0]!.status).toBe('applied');
    expect(second.results[0]!.status).toBe('noop');
  });
});
```

- [ ] **Step 2: Run it against the preview deployment**

```bash
SMOKE_API_BASE_URL=https://<preview-server-host> \
SMOKE_SUPABASE_URL=https://<dev-ref>.supabase.co \
SMOKE_SUPABASE_SERVICE_ROLE_KEY=<from your local apps/server/.env, never typed into a chat> \
pnpm --filter @frc/server exec vitest run --config vitest.smoke.config.ts
```

Expected: every suite green, with the new file(s) from this task among them.

- [ ] **Step 3: Run the airplane-mode rehearsal by hand**

This is the §20.3 criterion and no test can replace it.

1. Open the deployed client on a real phone and let it hydrate (the indicator says `online`).
2. Put the phone into **airplane mode**. Cold-start the installed app: it must open and say it is working from data on the device.
3. Enter **three** match entries for three different robots. The indicator reads `offline · 3 unsynced`.
4. Force-quit the app, reopen it still offline: the three entries are still listed and still unsynced.
5. Turn airplane mode off. Within a few seconds the indicator reads `online` with no count.
6. On a laptop, open `/entries` and confirm all three appear with the right match, team, status and scouter.

Record the result — pass or fail, with what broke — in `docs/ops/RUNBOOK.md` under *Pre-event checklist*.

- [ ] **Step 4: Wire it into CI**

Update the root `smoke` script as listed under **Files** and push. Expected: the CI `Smoke suite` step now prints both the `/health` line and every suite green, including the new file(s) from this task.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test: add the walking-skeleton smoke suite and record the airplane-mode rehearsal"
```

---

**Group A gate.** The §1.2 success criterion now holds in its ugliest form: a scouter records a robot on a phone with no internet, and within seconds of regaining connectivity a laptop shows it. Everything after this generalises outwards; nothing after this may break this.

---
# Phase 1 B — auth and roles (§20.2.2)

---

## Task 1.10: Shared — the permission matrix and the five-minute self-edit rule

**Files:**
- Create: `packages/shared/src/auth/permissions.ts`, `packages/shared/src/auth/permissions.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `CAPABILITIES` — the §7.2 matrix as data; `can(caller, capability): boolean`; `assertCan(caller, capability): void`; `SELF_EDIT_WINDOW_MS = 300_000`; `withinSelfEditWindow(clientCreatedAt, clientUpdatedAt): boolean`; `canEditEntry(caller, entry): boolean`.

**Why this is data, not `if` statements.** The matrix is checked in the use-case layer *and* used by the UI to hide or disable actions a role may not perform (§7.4). One table, two consumers, no drift.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/auth/permissions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AppError } from '../errors';
import type { Caller } from '../caller';
import {
  assertCan,
  can,
  canEditEntry,
  CAPABILITIES,
  SELF_EDIT_WINDOW_MS,
  withinSelfEditWindow,
} from './permissions';

const scouter: Caller = { kind: 'user', userId: 'u-s', role: 'scouter' };
const lead: Caller = { kind: 'user', userId: 'u-l', role: 'lead' };
const admin: Caller = { kind: 'user', userId: 'u-a', role: 'admin' };
const service: Caller = { kind: 'service', label: 'mcp' };

describe('the permission matrix (SPEC-FINAL 7.2)', () => {
  it('lets every role log in, view all data and submit entries', () => {
    for (const caller of [scouter, lead, admin]) {
      expect(can(caller, 'view_all_data')).toBe(true);
      expect(can(caller, 'submit_entry')).toBe(true);
      expect(can(caller, 'ensure_match')).toBe(true);
    }
  });

  it('gives leads and admins entry management, conflict resolution, do-not-pick and draft dashboards', () => {
    for (const capability of ['manage_entries', 'resolve_conflict', 'add_do_not_pick', 'draft_dashboard'] as const) {
      expect(can(scouter, capability), capability).toBe(false);
      expect(can(lead, capability), capability).toBe(true);
      expect(can(admin, capability), capability).toBe(true);
    }
  });

  it('reserves saving dashboards, forms, events, pick lists, users and deletion to the admin', () => {
    for (const capability of [
      'save_dashboard', 'manage_forms', 'manage_events', 'manage_pick_lists',
      'manage_users', 'delete_objects', 'edit_do_not_pick',
    ] as const) {
      expect(can(scouter, capability), capability).toBe(false);
      expect(can(lead, capability), capability).toBe(false);
      expect(can(admin, capability), capability).toBe(true);
    }
  });

  it('grants a service caller nothing at all', () => {
    for (const capability of Object.keys(CAPABILITIES) as (keyof typeof CAPABILITIES)[]) {
      expect(can(service, capability), capability).toBe(false);
    }
  });

  it('throws a forbidden AppError from assertCan', () => {
    expect(() => assertCan(scouter, 'manage_users')).toThrowError(AppError);
    expect(() => assertCan(admin, 'manage_users')).not.toThrow();
  });
});

describe('the five-minute self-edit window (SPEC-FINAL 7.6)', () => {
  it('is five minutes', () => {
    expect(SELF_EDIT_WINDOW_MS).toBe(300_000);
  });

  it('compares the two client timestamps to each other, never to server time', () => {
    // created and edited offline, uploaded six hours later: still inside the window
    expect(
      withinSelfEditWindow('2026-11-14T09:00:00.000Z', '2026-11-14T09:04:00.000Z'),
    ).toBe(true);
    expect(
      withinSelfEditWindow('2026-11-14T09:00:00.000Z', '2026-11-14T09:06:00.000Z'),
    ).toBe(false);
  });

  it('lets a scouter edit their own entry inside the window and not outside it', () => {
    const own = { scouter_id: 'u-s', client_created_at: '2026-11-14T09:00:00.000Z' };
    expect(canEditEntry(scouter, { ...own, client_updated_at: '2026-11-14T09:01:00.000Z' })).toBe(true);
    expect(canEditEntry(scouter, { ...own, client_updated_at: '2026-11-14T09:30:00.000Z' })).toBe(false);
  });

  it('never lets a scouter edit somebody else’s entry, even inside the window', () => {
    expect(
      canEditEntry(scouter, {
        scouter_id: 'u-other',
        client_created_at: '2026-11-14T09:00:00.000Z',
        client_updated_at: '2026-11-14T09:01:00.000Z',
      }),
    ).toBe(false);
  });

  it('lets a lead or admin edit any entry at any time', () => {
    const old = {
      scouter_id: 'u-other',
      client_created_at: '2026-11-14T09:00:00.000Z',
      client_updated_at: '2026-11-20T09:00:00.000Z',
    };
    expect(canEditEntry(lead, old)).toBe(true);
    expect(canEditEntry(admin, old)).toBe(true);
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
pnpm vitest run packages/shared/src/auth
```

Expected: `Failed to resolve import "./permissions"`.

- [ ] **Step 3: Implement**

`packages/shared/src/auth/permissions.ts`:

```ts
import { isUser, type Caller, type Role } from '../caller';
import { AppError } from '../errors';

const ALL: readonly Role[] = ['scouter', 'lead', 'admin'];
const LEADS: readonly Role[] = ['lead', 'admin'];
const ADMIN: readonly Role[] = ['admin'];

/** SPEC-FINAL 7.2, as data. Checked in the use-case layer and read by the UI. */
export const CAPABILITIES = {
  view_all_data: ALL,
  submit_entry: ALL,
  edit_own_entry: ALL,
  ensure_match: ALL,
  manage_entries: LEADS,
  resolve_conflict: LEADS,
  add_do_not_pick: LEADS,
  draft_dashboard: LEADS,
  save_dashboard: ADMIN,
  manage_forms: ADMIN,
  manage_events: ADMIN,
  manage_pick_lists: ADMIN,
  edit_do_not_pick: ADMIN,
  manage_users: ADMIN,
  delete_objects: ADMIN,
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(caller: Caller, capability: Capability): boolean {
  return isUser(caller) && CAPABILITIES[capability].includes(caller.role);
}

export function assertCan(caller: Caller, capability: Capability): void {
  if (!can(caller, capability)) {
    throw new AppError('forbidden', `not permitted: ${capability}`, { capability });
  }
}

/** SPEC-FINAL 7.6. */
export const SELF_EDIT_WINDOW_MS = 300_000;

export type EntryOwnership = {
  scouter_id: string;
  client_created_at: string;
  client_updated_at: string;
};

/**
 * The two client timestamps are compared to each other, never to server time
 * (SPEC-FINAL 7.6). An entry created and edited offline and uploaded six hours later
 * still passes, because the elapsed time measured is the scouter's own.
 */
export function withinSelfEditWindow(clientCreatedAt: string, clientUpdatedAt: string): boolean {
  const elapsed = new Date(clientUpdatedAt).getTime() - new Date(clientCreatedAt).getTime();
  return elapsed >= 0 && elapsed <= SELF_EDIT_WINDOW_MS;
}

export function canEditEntry(caller: Caller, entry: EntryOwnership): boolean {
  if (!isUser(caller)) return false;
  if (caller.role === 'lead' || caller.role === 'admin') return true;
  if (entry.scouter_id !== caller.userId) return false;
  return withinSelfEditWindow(entry.client_created_at, entry.client_updated_at);
}
```

Add `export * from './auth/permissions';` to `packages/shared/src/index.ts`.

- [ ] **Step 4: Run and watch pass**

```bash
pnpm vitest run packages/shared && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): encode the permission matrix and the five-minute self-edit rule"
```

---

## Task 1.11: Server — password hashing, `login` and the session token

**Files:**
- Create: `apps/server/src/auth/password.ts`, `apps/server/src/auth/token.ts`, `apps/server/src/auth/token.test.ts`
- Create: `apps/server/src/auth/rateLimit.ts`, `apps/server/src/auth/rateLimit.test.ts`
- Create: `apps/server/src/core/commands/login.ts`, `apps/server/src/core/commands/login.test.ts`
- Modify: `apps/server/src/repos/store.ts`, `apps/server/src/test/fake-context.ts`, `apps/server/package.json` (add `"bcryptjs": "^2.4.3"`, `"@types/bcryptjs": "^2.4.6"`, `"jose": "^5.9.6"`)

**Interfaces:**
- Produces: `hashPassword(plain)` and `verifyPassword(plain, hash)` — **bcrypt, cost 10, via `bcryptjs`** (pure JS, no native build step on Vercel Functions); `issueToken(user, config)` and `verifyToken(raw, config)` — **HS256 JWT** with claims `sub`, `role`, `username`, `iat`, `exp`; `shouldRefresh(claims, config)`; `login(input, ctx, config)` — **takes no caller: it produces one**.

- [ ] **Step 1: Write the failing tests**

`apps/server/src/auth/token.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../config';
import { issueToken, shouldRefresh, verifyToken } from './token';

const config = loadServerConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  AUTH_JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
  ALLOWED_ORIGIN: 'https://client.example.com',
});

const user = { id: 'u-1', username: 'alice', role: 'lead' as const };

describe('session token (SPEC-FINAL 7.5)', () => {
  it('carries sub, role, username, iat and exp', async () => {
    const claims = await verifyToken(await issueToken(user, config), config);
    expect(claims).toMatchObject({ sub: 'u-1', role: 'lead', username: 'alice' });
    expect(typeof claims.iat).toBe('number');
    expect(typeof claims.exp).toBe('number');
  });

  it('lives 30 days', async () => {
    const claims = await verifyToken(await issueToken(user, config), config);
    const days = (claims.exp - claims.iat) / 86400;
    expect(Math.round(days)).toBe(30);
  });

  it('rejects a token signed with another secret', async () => {
    const other = loadServerConfig({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      AUTH_JWT_SECRET: 'a-completely-different-secret-value-32!!',
      ALLOWED_ORIGIN: 'https://client.example.com',
    });
    const token = await issueToken(user, other);
    await expect(verifyToken(token, config)).rejects.toThrow();
  });

  it('asks for a refresh once the token is older than seven days, not before', async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(shouldRefresh({ sub: 'u', role: 'lead', username: 'a', iat: now - 6 * 86400, exp: now }, config)).toBe(false);
    expect(shouldRefresh({ sub: 'u', role: 'lead', username: 'a', iat: now - 8 * 86400, exp: now }, config)).toBe(true);
  });
});
```

`apps/server/src/auth/rateLimit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeRateLimiter } from './rateLimit';

describe('login rate limiting (SPEC-FINAL 16.5)', () => {
  it('allows the first attempts and then refuses', () => {
    let time = 0;
    const limiter = makeRateLimiter({ limit: 5, windowMs: 60_000, now: () => time });
    for (let i = 0; i < 5; i += 1) expect(limiter.take('alice')).toBe(true);
    expect(limiter.take('alice')).toBe(false);
  });

  it('limits per username, so one account cannot lock out another', () => {
    const limiter = makeRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    expect(limiter.take('alice')).toBe(true);
    expect(limiter.take('alice')).toBe(false);
    expect(limiter.take('bob')).toBe(true);
  });

  it('forgets attempts once the window has passed', () => {
    let time = 0;
    const limiter = makeRateLimiter({ limit: 1, windowMs: 60_000, now: () => time });
    expect(limiter.take('alice')).toBe(true);
    expect(limiter.take('alice')).toBe(false);
    time = 61_000;
    expect(limiter.take('alice')).toBe(true);
  });
});
```

`apps/server/src/core/commands/login.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { loadServerConfig } from '../../config';
import { hashPassword } from '../../auth/password';
import { verifyToken } from '../../auth/token';
import { login, loginLimiter } from './login';
import { makeFakeContext, type FakeContext } from '../../test/fake-context';

const config = loadServerConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  AUTH_JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
  ALLOWED_ORIGIN: 'https://client.example.com',
});

let ctx: FakeContext;
beforeEach(async () => {
  loginLimiter.reset(); // a module singleton would otherwise leak between cases
  ctx = makeFakeContext();
  ctx.usersByName.set('alice', {
    id: 'u-1',
    username: 'alice',
    full_name: 'Alice',
    role: 'lead',
    password_hash: await hashPassword('correct horse'),
    must_change_password: false,
    disabled_at: null,
    created_at: '2026-11-01T00:00:00.000Z',
  });
});

describe('login (SPEC-FINAL 7.5)', () => {
  it('returns a token and the user for the right password', async () => {
    const result = await login({ username: 'alice', password: 'correct horse' }, ctx, config);
    expect(result.user).toMatchObject({ id: 'u-1', username: 'alice', role: 'lead' });
    expect((await verifyToken(result.token, config)).sub).toBe('u-1');
  });

  it('matches the username case-insensitively', async () => {
    await expect(login({ username: 'ALICE', password: 'correct horse' }, ctx, config)).resolves.toBeTruthy();
  });

  it('rejects the wrong password with the same message as an unknown user', async () => {
    const wrong = login({ username: 'alice', password: 'nope' }, ctx, config);
    const missing = login({ username: 'nobody', password: 'nope' }, ctx, config);
    await expect(wrong).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(missing).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('refuses a disabled account', async () => {
    const user = ctx.usersByName.get('alice')!;
    ctx.usersByName.set('alice', { ...user, disabled_at: '2026-01-01T00:00:00.000Z' });
    await expect(login({ username: 'alice', password: 'correct horse' }, ctx, config)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('reports must_change_password so the client can force a change', async () => {
    const user = ctx.usersByName.get('alice')!;
    ctx.usersByName.set('alice', { ...user, must_change_password: true });
    const result = await login({ username: 'alice', password: 'correct horse' }, ctx, config);
    expect(result.user.must_change_password).toBe(true);
  });

  it('rate-limits by username', async () => {
    for (let i = 0; i < 10; i += 1) {
      await login({ username: 'alice', password: 'nope' }, ctx, config).catch(() => undefined);
    }
    await expect(login({ username: 'alice', password: 'correct horse' }, ctx, config)).rejects.toMatchObject({
      code: 'rate-limited',
    });
  });

  it('never returns the password hash', async () => {
    const result = await login({ username: 'alice', password: 'correct horse' }, ctx, config);
    expect(JSON.stringify(result)).not.toContain('$2a$');
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
pnpm --filter @frc/server exec vitest run src/auth src/core/commands/login.test.ts
```

Expected: `Failed to resolve import "./token"`.

- [ ] **Step 3: Implement**

`apps/server/src/auth/password.ts`:

```ts
import bcrypt from 'bcryptjs';

/** SPEC-FINAL 7.5 / D1: bcrypt cost 10 via bcryptjs — pure JS, no native build on Vercel. */
export const BCRYPT_COST = 10;
export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

`apps/server/src/auth/token.ts`:

```ts
import { jwtVerify, SignJWT } from 'jose';
import type { ServerConfig } from '../config';

export type SessionClaims = {
  sub: string;
  role: 'scouter' | 'lead' | 'admin';
  username: string;
  iat: number;
  exp: number;
};

const key = (config: ServerConfig): Uint8Array => new TextEncoder().encode(config.authJwtSecret);

export async function issueToken(
  user: { id: string; username: string; role: SessionClaims['role'] },
  config: ServerConfig,
): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: user.role, username: user.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt(iat)
    .setExpirationTime(iat + config.tokenTtlDays * 86400)
    .sign(key(config));
}

export async function verifyToken(raw: string, config: ServerConfig): Promise<SessionClaims> {
  const { payload } = await jwtVerify(raw, key(config), { algorithms: ['HS256'] });
  return payload as unknown as SessionClaims;
}

/** Sliding sessions: re-issue a token more than seven days old (SPEC-FINAL 7.5). */
export function shouldRefresh(claims: SessionClaims, config: ServerConfig): boolean {
  const ageDays = (Date.now() / 1000 - claims.iat) / 86400;
  return ageDays > config.tokenRefreshAfterDays;
}
```

`apps/server/src/auth/rateLimit.ts`:

```ts
export type RateLimiter = { take(key: string): boolean; reset(): void };

/**
 * Per-instance, in-memory, best-effort. With ~11 users and a serverless runtime this
 * is the boring right size: it slows a password guesser without adding a store.
 */
export function makeRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const now = options.now ?? (() => Date.now());
  const hits = new Map<string, number[]>();
  return {
    take(key: string): boolean {
      const cutoff = now() - options.windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
      if (recent.length >= options.limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now());
      hits.set(key, recent);
      return true;
    },
    reset(): void {
      hits.clear();
    },
  };
}
```

`apps/server/src/core/commands/login.ts`:

```ts
import { AppError } from '@frc/shared';
import { z } from 'zod';
import type { ServerConfig } from '../../config';
import { verifyPassword } from '../../auth/password';
import { makeRateLimiter } from '../../auth/rateLimit';
import { issueToken } from '../../auth/token';
import type { UseCaseContext } from '../context';

export const loginInput = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginInput>;

export const loginOutput = z.object({
  token: z.string(),
  user: z.object({
    id: z.string().uuid(),
    username: z.string(),
    full_name: z.string(),
    role: z.enum(['scouter', 'lead', 'admin']),
    must_change_password: z.boolean(),
  }),
});

export type LoginOutput = z.infer<typeof loginOutput>;

/**
 * Module-level, so it survives between requests on a warm function instance — and
 * EXPORTED, so a test can reset it. A module singleton with no reset makes the tests
 * in a single file interfere with each other, which is a real bug that shows up as a
 * mysteriously failing seventh case.
 */
export const loginLimiter = makeRateLimiter({ limit: 10, windowMs: 5 * 60_000 });

/**
 * SPEC-FINAL 16.5: login takes NO caller — it produces one. It lives in commands/ for
 * placement and is exempt from the caller contract and the service rejection. It is
 * one of exactly two unauthenticated routes, and it is rate-limited by username.
 */
export async function login(
  input: LoginInput,
  ctx: UseCaseContext,
  config: ServerConfig,
): Promise<LoginOutput> {
  const username = input.username.trim().toLowerCase();
  if (!loginLimiter.take(username)) {
    throw new AppError('rate-limited', 'too many attempts; wait a few minutes and try again');
  }

  const user = await ctx.store.getUserByUsername(username);
  // Same message for an unknown user and a wrong password: no account enumeration.
  const wrong = new AppError('unauthenticated', 'that username and password do not match');
  if (!user) throw wrong;
  if (!(await verifyPassword(input.password, user.password_hash))) throw wrong;
  if (user.disabled_at !== null) {
    throw new AppError('forbidden', 'this account has been disabled; ask an admin');
  }

  return {
    token: await issueToken({ id: user.id, username: user.username, role: user.role }, config),
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      must_change_password: user.must_change_password,
    },
  };
}
```

`Store.getUserByUsername` and `StoredFullUser` **already exist** — task 1.3 declared the whole interface. This task only replaces the stub, in `apps/server/src/repos/store.ts`:

```ts
    async getUserByUsername(usernameLower: string): Promise<StoredFullUser | null> {
      const { data } = await db
        .from('users')
        .select('id, username, full_name, password_hash, role, must_change_password, disabled_at, created_at')
        .ilike('username', usernameLower)
        .maybeSingle();
      return (data as StoredFullUser | null) ?? null;
    },
```

and the matching entry in the fake, reading `ctx.usersByName`. Delete both names from the `stubsFor([...])` lists as you go — a stub left behind shadows the real method.

- [ ] **Step 4: Run and watch pass**

```bash
pnpm install && pnpm --filter @frc/server exec vitest run && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(server): add bcrypt hashing, the HS256 session token and rate-limited login"
```

---

## Task 1.12: Server — the caller at the HTTP edge, `refreshToken` and the use-case registry

**Files:**
- Create: `apps/server/src/routes/registry.ts`, `apps/server/src/routes/rpc.ts`, `apps/server/src/routes/rpc.test.ts`
- Create: `apps/server/src/core/commands/refreshToken.ts`
- Create: `apps/server/src/auth/callerFor.ts`, `apps/server/src/auth/callerFor.test.ts`
- Modify: `apps/server/src/app.ts`, `apps/server/src/routes/sync.ts`

**Interfaces:**
- Produces: `REGISTRY` — the use-case registry of SPEC-FINAL §16.4, one entry per use case carrying a **Zod input schema, a Zod output schema, a plain-language description**, its kind (`query` | `command`) and its handler; `rpcRoutes(deps)` mounting **`POST /api/<useCaseName>`** for every registry entry; `callerFor(request, config, store)` building the caller from the bearer token; the `X-Refreshed-Token` response header.

**The two hard rules this task enforces at the edge (§16.5).** Authorization reads the `caller` argument and nothing else — the Hono context never reaches a use case. And **every `commands/` entry rejects a `service` caller**, tested generically over the whole registry so a new command cannot forget.

- [ ] **Step 1: Write the failing tests**

`apps/server/src/routes/rpc.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { REGISTRY } from './registry';

describe('the use-case registry (SPEC-FINAL 16.4)', () => {
  it('gives every entry an input schema, an output schema and a description', () => {
    for (const [name, entry] of Object.entries(REGISTRY)) {
      expect(entry.input, name).toBeInstanceOf(z.ZodType);
      expect(entry.output, name).toBeInstanceOf(z.ZodType);
      expect(entry.description.length, name).toBeGreaterThan(20);
      expect(['query', 'command'], name).toContain(entry.kind);
    }
  });

  it('rejects a service caller from every command, without exception', async () => {
    const service = { kind: 'service', label: 'mcp' } as const;
    for (const [name, entry] of Object.entries(REGISTRY)) {
      if (entry.kind !== 'command') continue;
      if (entry.unauthenticated) continue; // login and refreshToken produce a caller
      await expect(
        Promise.resolve(entry.handler(service, {}, {} as never)),
        name,
      ).rejects.toMatchObject({ code: 'forbidden' });
    }
  });

  it('marks exactly login and refreshToken as unauthenticated', () => {
    const open = Object.entries(REGISTRY).filter(([, e]) => e.unauthenticated).map(([n]) => n);
    expect(open.sort()).toEqual(['login', 'refreshToken']);
  });

  it('holds exactly the entries registered so far', () => {
    expect(Object.keys(REGISTRY).sort()).toEqual(['login', 'refreshToken']);
  });
});
```

**This last case is deliberately brittle, and that is the point.** Every later task that registers a use case updates it, which is the cheapest possible reminder that a use case is not finished until it is reachable over HTTP. If you find yourself deleting it rather than updating it, you have found a task that forgot to register something.

`apps/server/src/auth/callerFor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../config';
import { issueToken } from './token';
import { callerFor } from './callerFor';

const config = loadServerConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  AUTH_JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
  ALLOWED_ORIGIN: 'https://client.example.com',
});

const store = {
  async getUser(id: string) {
    if (id === 'u-disabled') return { id, role: 'scouter' as const, disabled_at: '2026-01-01T00:00:00.000Z' };
    if (id === 'u-1') return { id, role: 'lead' as const, disabled_at: null };
    return null;
  },
};

const withToken = async (userId: string, role: 'scouter' | 'lead' | 'admin') =>
  new Request('https://api.example.com/api/listUsers', {
    headers: { authorization: `Bearer ${await issueToken({ id: userId, username: 'u', role }, config)}` },
  });

describe('callerFor (SPEC-FINAL 16.5)', () => {
  it('builds a user caller from a valid bearer token', async () => {
    const result = await callerFor(await withToken('u-1', 'lead'), config, store);
    expect(result.caller).toEqual({ kind: 'user', userId: 'u-1', role: 'lead' });
  });

  it('takes the role from the database, not from the token', async () => {
    const result = await callerFor(await withToken('u-1', 'admin'), config, store);
    expect(result.caller?.kind === 'user' && result.caller.role).toBe('lead');
  });

  it('returns no caller for a missing, malformed or unknown token', async () => {
    expect((await callerFor(new Request('https://api.example.com/x'), config, store)).caller).toBeNull();
    expect(
      (await callerFor(new Request('https://api.example.com/x', { headers: { authorization: 'Bearer nonsense' } }), config, store)).caller,
    ).toBeNull();
    expect((await callerFor(await withToken('u-missing', 'lead'), config, store)).caller).toBeNull();
  });

  it('refuses a disabled user', async () => {
    expect((await callerFor(await withToken('u-disabled', 'scouter'), config, store)).caller).toBeNull();
  });

  it('asks for a refreshed token once the bearer is older than seven days', async () => {
    const stale = await callerFor(await withToken('u-1', 'lead'), config, store, {
      now: () => Date.now() + 8 * 86400 * 1000,
    });
    expect(stale.refreshedToken).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
pnpm --filter @frc/server exec vitest run src/routes src/auth/callerFor.test.ts
```

Expected: `Failed to resolve import "./registry"`.

- [ ] **Step 3: Implement**

`apps/server/src/auth/callerFor.ts`:

```ts
import type { Caller } from '@frc/shared';
import type { ServerConfig } from '../config';
import type { StoredUser } from '../core/context';
import { issueToken, shouldRefresh, verifyToken } from './token';

export type CallerResult = { caller: Caller | null; refreshedToken: string | null };

type UserLookup = { getUser(id: string): Promise<StoredUser | null> };

/**
 * The HTTP transport builds the caller at its own edge (SPEC-FINAL 16.5). Nothing
 * downstream ever sees a request object. The ROLE COMES FROM THE DATABASE, not from
 * the token, so a role change takes effect immediately rather than in 30 days.
 */
export async function callerFor(
  request: Request,
  config: ServerConfig,
  store: UserLookup,
  options: { now?: () => number } = {},
): Promise<CallerResult> {
  const header = request.headers.get('authorization') ?? '';
  const raw = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (raw === '') return { caller: null, refreshedToken: null };

  let claims;
  try {
    claims = await verifyToken(raw, config);
  } catch {
    return { caller: null, refreshedToken: null };
  }

  const user = await store.getUser(claims.sub);
  if (!user || user.disabled_at !== null) return { caller: null, refreshedToken: null };

  const now = options.now ?? (() => Date.now());
  const stale = (now() / 1000 - claims.iat) / 86400 > config.tokenRefreshAfterDays;
  const refreshedToken =
    stale || shouldRefresh(claims, config)
      ? await issueToken({ id: user.id, username: claims.username, role: user.role }, config)
      : null;

  return { caller: { kind: 'user', userId: user.id, role: user.role }, refreshedToken };
}
```

`apps/server/src/routes/registry.ts` — the shape **and** the two entries that exist by the end of this task. Later tasks add rows to `REGISTRY`; **no later task changes `RegistryEntry`**:

```ts
import { z } from 'zod';
import type { Caller } from '@frc/shared';
import type { ServerConfig } from '../config';
import type { UseCaseContext } from '../core/context';
import { login, loginInput, loginOutput } from '../core/commands/login';
import { refreshToken, refreshTokenInput } from '../core/commands/refreshToken';

export type RegistryEntry = {
  kind: 'query' | 'command';
  /** Plain language, for a human reading the registry and for a future MCP tool list. */
  description: string;
  input: z.ZodType;
  output: z.ZodType;
  /** login and refreshToken only (SPEC-FINAL 16.5). */
  unauthenticated?: true;
  handler: (
    caller: Caller,
    input: never,
    ctx: UseCaseContext,
    config: ServerConfig,
  ) => Promise<unknown>;
};

export const REGISTRY: Record<string, RegistryEntry> = {
  login: {
    kind: 'command',
    description:
      'Exchange a username and password for a 30-day session token. Takes no caller — it produces one. Rate-limited by username.',
    input: loginInput,
    output: loginOutput,
    unauthenticated: true,
    handler: (_caller, input, ctx, config) => login(input as never, ctx, config),
  },
  refreshToken: {
    kind: 'command',
    description:
      'Exchange a still-valid session token for a fresh one. Takes no caller — it produces one. Rate-limited by username.',
    input: refreshTokenInput,
    output: loginOutput,
    unauthenticated: true,
    handler: (_caller, input, ctx, config) => refreshToken(input as never, ctx, config),
  },
};
```

**Where the schemas live.** Every `input`/`output` schema is exported from the use case's own module in `core/`, and each of those modules re-exports it from `packages/shared/src/api/` so the typed client can import the identical object (§16.1: "the Zod schemas in `packages/shared` are the single validation source for both sides"). Task 1.20 builds the typed client on top of that.

`apps/server/src/routes/rpc.ts`:

```ts
import { Hono } from 'hono';
import { AppError, type Caller } from '@frc/shared';
import type { ServerConfig } from '../config';
import type { UseCaseContext } from '../core/context';
import { callerFor } from '../auth/callerFor';
import { REGISTRY } from './registry';

const STATUS: Record<string, number> = {
  invalid: 400,
  unauthenticated: 401,
  forbidden: 403,
  'not-found': 404,
  conflict: 409,
  'rate-limited': 429,
  'parent-deleted': 409,
  'edit-window-expired': 409,
  'offline-unavailable': 503,
};

/** One HTTP route per registry entry: the typed client is derived from the registry
 *  itself, which is why there is no tRPC (SPEC-FINAL 16.1, 16.4). */
export function rpcRoutes(ctx: UseCaseContext, config: ServerConfig): Hono {
  const app = new Hono();

  for (const [name, entry] of Object.entries(REGISTRY)) {
    app.post(`/api/${name}`, async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const parsedInput = entry.input.safeParse(body);
      if (!parsedInput.success) {
        return c.json({ error: { code: 'invalid', message: parsedInput.error.message } }, 400);
      }

      let caller: Caller = { kind: 'service', label: 'unauthenticated' };
      if (!entry.unauthenticated) {
        const result = await callerFor(c.req.raw, config, ctx.store);
        if (!result.caller) {
          return c.json({ error: { code: 'unauthenticated', message: 'sign in again' } }, 401);
        }
        caller = result.caller;
        if (result.refreshedToken) c.header('X-Refreshed-Token', result.refreshedToken);
      }

      try {
        const output = await entry.handler(caller, parsedInput.data as never, ctx, config);
        return c.json(entry.output.parse(output));
      } catch (e) {
        if (e instanceof AppError) {
          return c.json({ error: { code: e.code, message: e.message, details: e.details } }, STATUS[e.code] ?? 500);
        }
        // eslint-disable-next-line no-console
        console.error(`${name} failed`, e);
        return c.json({ error: { code: 'invalid', message: 'that did not work' } }, 500);
      }
    });
  }

  return app;
}
```

`apps/server/src/core/commands/refreshToken.ts`:

```ts
import { AppError } from '@frc/shared';
import { z } from 'zod';
import type { ServerConfig } from '../../config';
import { loginLimiter } from './login';
import { issueToken, verifyToken } from '../../auth/token';
import type { UseCaseContext } from '../context';
import type { LoginOutput } from './login';

export const refreshTokenInput = z.object({ token: z.string().min(1) });

/**
 * The explicit counterpart to the automatic X-Refreshed-Token header, for a client that
 * has been closed for weeks. Like `login` it takes NO caller — it produces one — and
 * SPEC-FINAL 16.5 requires BOTH unauthenticated routes to be rate-limited by username.
 */
export async function refreshToken(
  input: z.infer<typeof refreshTokenInput>,
  ctx: UseCaseContext,
  config: ServerConfig,
): Promise<LoginOutput> {
  let claims;
  try {
    claims = await verifyToken(input.token, config);
  } catch {
    throw new AppError('unauthenticated', 'that session has expired; sign in again');
  }

  if (!loginLimiter.take(claims.username)) {
    throw new AppError('rate-limited', 'too many attempts; wait a few minutes and try again');
  }

  const user = await ctx.store.getUserByUsername(claims.username.toLowerCase());
  if (!user) throw new AppError('unauthenticated', 'that session is no longer valid');
  if (user.disabled_at !== null) {
    throw new AppError('forbidden', 'this account has been disabled; ask an admin');
  }

  return {
    token: await issueToken({ id: user.id, username: user.username, role: user.role }, config),
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      must_change_password: user.must_change_password,
    },
  };
}
```

Also in this task: replace `syncRoutes`' walking-skeleton `callerFor` in `composition.ts` with the real `callerFor(request, config, ctx.store)`, add the `X-Refreshed-Token` header there too, and **update the smoke suite from task 1.9 to log in first and send a bearer on both sync calls** — the two sync routes stop accepting an anonymous caller the moment this task lands, and the smoke suite is the only other caller of them.

- [ ] **Step 4: Run and watch pass**

```bash
pnpm --filter @frc/server exec vitest run && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(server): build the caller at the HTTP edge and mount the use-case registry"
```

---

## Task 1.13: Server — user administration use cases

**Files:**
- Create: `apps/server/src/core/commands/users.ts`, `apps/server/src/core/commands/users.test.ts`
- Create: `apps/server/src/core/queries/listUsers.ts`, `apps/server/src/core/queries/listUsers.test.ts`
- Modify: `apps/server/src/routes/registry.ts`, `apps/server/src/repos/store.ts`, `apps/server/src/test/fake-context.ts`

**Interfaces:**
- Produces: `createUser`, `setUserRole`, `resetPassword`, `disableUser`, `changeOwnPassword`, `listUsers` — the Appendix C rows for users, all admin-only except `changeOwnPassword` (any authenticated user, own account only).

**Rules (SPEC-FINAL §7.3, §3.2, §18.5):** only the admin creates users, changes roles, resets passwords and disables accounts; there is no self-service reset; **"delete a user" means `disabled_at`** and the row is retained forever; the **only personal datum is the full name** — no email, no phone; `listUsers` **never returns `password_hash`** except on the `syncPull` path; minimum password length 8, no composition rules, no expiry.

- [ ] **Step 1: Write the failing test**

`apps/server/src/core/commands/users.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '@frc/shared';
import { verifyPassword } from '../../auth/password';
import { changeOwnPassword, createUser, disableUser, resetPassword, setUserRole } from './users';
import { makeFakeContext, type FakeContext } from '../../test/fake-context';

const admin: Caller = { kind: 'user', userId: 'u-admin', role: 'admin' };
const lead: Caller = { kind: 'user', userId: 'u-lead', role: 'lead' };
const scouter: Caller = { kind: 'user', userId: 'u-scouter', role: 'scouter' };

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
});

describe('user administration (SPEC-FINAL 7.3)', () => {
  it('lets an admin create a user with a hashed password', async () => {
    const user = await createUser(admin, { username: 'Dana', full_name: 'Dana Levi', role: 'scouter', password: 'firstpass1' }, ctx);
    expect(user.username).toBe('dana');
    const stored = ctx.usersByName.get('dana')!;
    expect(stored.password_hash).not.toBe('firstpass1');
    expect(await verifyPassword('firstpass1', stored.password_hash)).toBe(true);
  });

  it('stores no personal datum beyond the full name', async () => {
    const user = await createUser(admin, { username: 'dana', full_name: 'Dana Levi', role: 'scouter', password: 'firstpass1' }, ctx);
    expect(Object.keys(user).sort()).toEqual(
      ['created_at', 'disabled_at', 'full_name', 'id', 'must_change_password', 'role', 'username'].sort(),
    );
  });

  it('refuses a password shorter than eight characters', async () => {
    await expect(
      createUser(admin, { username: 'dana', full_name: 'D', role: 'scouter', password: 'short1' }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('refuses a username that already exists in another case', async () => {
    await createUser(admin, { username: 'dana', full_name: 'D', role: 'scouter', password: 'firstpass1' }, ctx);
    await expect(
      createUser(admin, { username: 'DANA', full_name: 'D2', role: 'lead', password: 'firstpass1' }, ctx),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('refuses every one of these to a lead and to a scouter', async () => {
    for (const caller of [lead, scouter]) {
      await expect(createUser(caller, { username: 'x', full_name: 'X', role: 'scouter', password: 'firstpass1' }, ctx)).rejects.toMatchObject({ code: 'forbidden' });
      await expect(setUserRole(caller, { user_id: 'u-scouter', role: 'admin' }, ctx)).rejects.toMatchObject({ code: 'forbidden' });
      await expect(resetPassword(caller, { user_id: 'u-scouter', password: 'firstpass1' }, ctx)).rejects.toMatchObject({ code: 'forbidden' });
      await expect(disableUser(caller, { user_id: 'u-scouter' }, ctx)).rejects.toMatchObject({ code: 'forbidden' });
    }
  });

  it('disables rather than deletes, keeping the row and its authorship', async () => {
    await disableUser(admin, { user_id: 'u-scouter' }, ctx);
    const stored = ctx.usersById.get('u-scouter')!;
    expect(stored.disabled_at).not.toBeNull();
    expect(ctx.usersById.has('u-scouter')).toBe(true);
  });

  it('forces a password change when the admin asks for one', async () => {
    await resetPassword(admin, { user_id: 'u-scouter', password: 'brandnew1', must_change: true }, ctx);
    expect(ctx.usersById.get('u-scouter')!.must_change_password).toBe(true);
  });

  it('lets a user change their own password and clears the must-change flag', async () => {
    await resetPassword(admin, { user_id: 'u-scouter', password: 'brandnew1', must_change: true }, ctx);
    await changeOwnPassword(scouter, { current_password: 'brandnew1', new_password: 'evennewer1' }, ctx);
    const stored = ctx.usersById.get('u-scouter')!;
    expect(await verifyPassword('evennewer1', stored.password_hash)).toBe(true);
    expect(stored.must_change_password).toBe(false);
  });

  it('never lets a user change somebody else’s password', async () => {
    await expect(
      changeOwnPassword(scouter, { user_id: 'u-lead', current_password: 'x', new_password: 'evennewer1' } as never, ctx),
    ).rejects.toBeTruthy();
  });

  it('refuses to disable the last enabled admin', async () => {
    await expect(disableUser(admin, { user_id: 'u-admin' }, ctx)).rejects.toMatchObject({ code: 'invalid' });
  });
});
```

`apps/server/src/core/queries/listUsers.test.ts` asserts: bounded and paginated; excludes disabled users unless `include_disabled: true`; **never returns `password_hash`**; every role may call it; a `service` caller may call it.

- [ ] **Step 2: Run and watch fail**

```bash
pnpm --filter @frc/server exec vitest run src/core
```

Expected: `Failed to resolve import "./users"`.

- [ ] **Step 3: Implement**

`apps/server/src/core/commands/users.ts` — one exported function per use case, each starting with `assertCan(caller, 'manage_users')` (or, for `changeOwnPassword`, an `isUser` check that operates only on `caller.userId`), then a Zod-validated input, then a store call. The password rules live in one place:

```ts
import { AppError, assertCan, isUser, type Caller } from '@frc/shared';
import { z } from 'zod';
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from '../../auth/password';
import type { StoredFullUser, UseCaseContext } from '../context';

const password = z.string().min(MIN_PASSWORD_LENGTH, `at least ${MIN_PASSWORD_LENGTH} characters`);

export const createUserInput = z.object({
  username: z.string().min(1).max(40),
  full_name: z.string().min(1).max(80),
  role: z.enum(['scouter', 'lead', 'admin']),
  password,
});

export type PublicUser = {
  id: string;
  username: string;
  full_name: string;
  role: 'scouter' | 'lead' | 'admin';
  must_change_password: boolean;
  disabled_at: string | null;
  created_at: string;
};

export async function createUser(
  caller: Caller,
  input: z.infer<typeof createUserInput>,
  ctx: UseCaseContext,
): Promise<PublicUser> {
  assertCan(caller, 'manage_users');
  const parsed = createUserInput.parse(input);
  const username = parsed.username.trim().toLowerCase();
  if (await ctx.store.getUserByUsername(username)) {
    throw new AppError('conflict', `the username '${username}' is taken`);
  }
  const stored = await ctx.store.insertUser({
    id: crypto.randomUUID(),
    username,
    full_name: parsed.full_name.trim(),
    role: parsed.role,
    password_hash: await hashPassword(parsed.password),
    must_change_password: false,
  });
  return toPublicUser(stored);
}

/**
 * The one place a stored user becomes a returned user. It drops `password_hash`
 * explicitly rather than by omission, because SPEC-FINAL 18.5 and Appendix C both say
 * the hash leaves the server on the syncPull path and nowhere else.
 */
export function toPublicUser(user: StoredFullUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    must_change_password: user.must_change_password,
    disabled_at: user.disabled_at,
    created_at: user.created_at,
  };
}
```

`setUserRole`, `resetPassword` (with an optional `must_change`), `disableUser` (which refuses to disable the last enabled admin — a boring guard against locking yourself out) and `changeOwnPassword` follow the same shape: `assertCan` → parse → invariant → `ctx.store.updateUser(...)` → `toPublicUser`. **Every one of them returns through `toPublicUser`**, so there is exactly one place the hash could ever escape and it does not.

**Register them.** This task adds `changeOwnPassword`, `createUser`, `setUserRole`, `resetPassword`, `disableUser` and `listUsers` to `REGISTRY`, and updates task 1.12's deliberately brittle test to:

```ts
    expect(Object.keys(REGISTRY).sort()).toEqual([
      'changeOwnPassword', 'createUser', 'disableUser', 'listUsers',
      'login', 'refreshToken', 'resetPassword', 'setUserRole',
    ]);
``` `disableUser` writes `disabled_at`; **there is no code path that deletes a `users` row.**

`apps/server/src/core/queries/listUsers.ts` returns `{ items: PublicUser[]; next_cursor: string | null }`, defaulting `limit` to 50 and capping it at 200, and **selects an explicit column list that omits `password_hash`**.

Register all six in `REGISTRY` with their schemas and descriptions.

- [ ] **Step 4: Run and watch pass**

```bash
pnpm --filter @frc/server exec vitest run && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(server): add user administration and the bounded listUsers query"
```

---

## Task 1.14: Server — per-operation push authorization and the server-side edit window

**Files:**
- Modify: `apps/server/src/core/commands/syncPush.ts`, `apps/server/src/core/commands/syncPush.test.ts`, `apps/server/src/routes/sync.ts`

**Interfaces:**
- Produces: `syncPush` now (a) requires a real bearer caller, (b) authorizes each operation against its own `author_user_id`, and (c) rejects an out-of-window scouter self-edit with `edit-window-expired`.

**The rule (SPEC-FINAL §7.5, §7.6).** The bearer must be an authenticated, non-disabled user of this install; **beyond that it is the transport, not the author**. An operation whose `author_user_id` has the `scouter` role and targets its own entry is accepted only when `client_updated_at − client_created_at ≤ 5 minutes`. **The server compares the two client timestamps to each other, never to server time.**

- [ ] **Step 1: Add the failing tests to `syncPush.test.ts`**

```ts
  it('accepts a scouter self-edit inside the five-minute window', async () => {
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    const res = await syncPush(
      scouter,
      { device_id: 'd-1', operations: [op({
        action: 'update', base_version: 1,
        client_created_at: '2026-11-14T09:00:00.000Z',
        client_updated_at: '2026-11-14T09:04:00.000Z',
      })] },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'applied' });
  });

  it('rejects a scouter self-edit outside the window with edit-window-expired', async () => {
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    const res = await syncPush(
      scouter,
      { device_id: 'd-1', operations: [op({
        action: 'update', base_version: 1,
        client_created_at: '2026-11-14T09:00:00.000Z',
        client_updated_at: '2026-11-14T09:06:00.000Z',
      })] },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'edit-window-expired' });
  });

  it('measures elapsed CLIENT time, so an upload six hours later still passes', async () => {
    ctx.nowValue = new Date('2026-11-14T15:00:00.000Z'); // server clock, six hours on
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    const res = await syncPush(
      scouter,
      { device_id: 'd-1', operations: [op({
        action: 'update', base_version: 1,
        client_created_at: '2026-11-14T09:00:00.000Z',
        client_updated_at: '2026-11-14T09:03:00.000Z',
      })] },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'applied' });
  });

  it('lets a lead edit an entry authored by somebody else, at any age', async () => {
    ctx.users.set('u-lead', { id: 'u-lead', role: 'lead', disabled_at: null });
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    const res = await syncPush(
      { kind: 'user', userId: 'u-lead', role: 'lead' },
      { device_id: 'd-2', operations: [op({
        action: 'update', base_version: 1, author_user_id: 'u-lead',
        client_created_at: '2026-11-14T09:00:00.000Z',
        client_updated_at: '2026-11-20T09:00:00.000Z',
      })] },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'applied' });
  });

  it('rejects a scouter editing an entry authored by somebody else', async () => {
    ctx.users.set('u-other', { id: 'u-other', role: 'scouter', disabled_at: null });
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    const res = await syncPush(
      scouter,
      { device_id: 'd-1', operations: [op({ action: 'update', base_version: 1, author_user_id: 'u-other' })] },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'forbidden' });
  });
```

- [ ] **Step 2: Run and watch fail**

```bash
pnpm --filter @frc/server exec vitest run src/core/commands/syncPush.test.ts
```

Expected: the five new tests fail; the existing ones still pass.

- [ ] **Step 3: Implement**

In `applyEntry`, before writing, insert:

```ts
  if (existing) {
    const owner = String(existing.scouter_id);
    const authorRole = (await ctx.store.getUser(op.author_user_id))?.role ?? 'scouter';

    if (authorRole === 'scouter') {
      if (owner !== op.author_user_id) {
        return rejected(op.op_id, 'forbidden', 'a scouter may edit only their own entry');
      }
      // SPEC-FINAL 7.6: the two CLIENT timestamps are compared to each other.
      if (!withinSelfEditWindow(String(existing.client_created_at), op.client_updated_at)) {
        return rejected(op.op_id, 'edit-window-expired', 'this entry is locked — ask a lead');
      }
    }
  }
```

with `import { withinSelfEditWindow } from '@frc/shared';`. Note it reads `existing.client_created_at` — the row's own creation stamp — not the operation's, so a client cannot widen its own window by resending a fresher `client_created_at`.

**One more change in `applyEntry`, easy to miss:** the write currently sets `scouter_id: op.author_user_id`. That is right for a **create** and wrong for an **update** — a lead fixing a scouter's entry would silently reassign authorship, and SPEC-FINAL §7.5 says every entry records the scouter who actually entered it. On an update, keep the existing row's `scouter_id`:

```ts
    scouter_id: existing ? existing.scouter_id : op.author_user_id,
```

and add the case that proves it:

```ts
  it('never reassigns authorship when a lead edits a scouter’s entry', async () => {
    ctx.users.set('u-lead', { id: 'u-lead', role: 'lead', disabled_at: null });
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    await syncPush(
      { kind: 'user', userId: 'u-lead', role: 'lead' },
      { device_id: 'd-2', operations: [op({
        action: 'update', base_version: 1, author_user_id: 'u-lead',
        client_updated_at: '2026-11-20T09:00:00.000Z',
      })] },
      ctx,
    );
    expect(ctx.rows.scouting_entries.get('e-1')!.scouter_id).toBe('u-scouter');
  });
```

**`callerFor` is already the real one** — task 1.12 replaced it in `composition.ts`, and the sync routes receive it from there. Nothing about the transport changes in this task.

- [ ] **Step 4: Run and watch pass**

```bash
pnpm --filter @frc/server exec vitest run && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(server): authorize each pushed operation by its author and enforce the edit window"
```

---
## Task 1.15: Client — the session, the login screen and the bearer token

**Files:**
- Create: `apps/client/src/auth/session.ts`, `apps/client/src/auth/session.test.ts`
- Create: `apps/client/src/auth/LoginPage.tsx`, `apps/client/src/auth/LoginPage.test.tsx`, `apps/client/src/auth/ChangePasswordPage.tsx`
- Modify: `apps/client/src/data/api.ts` (bearer + `X-Refreshed-Token`), `apps/client/src/routes.tsx`
- Create: `apps/client/src/data/api.test.ts`, `apps/client/src/data/rpc.ts` (the RPC client the login and change-password screens call)

**Interfaces:**
- Produces: `session` — a small store over Dexie with `current()`, `signIn(user, token)`, `signOut()`, `token()`, `subscribe(fn)`; `<LoginPage />`; the API client now attaches `Authorization: Bearer <token>` and **stores any `X-Refreshed-Token` it receives**.

**Rules (SPEC-FINAL §7.5).** The token lives in **IndexedDB, in the same database as the offline dataset**, so one store governs all offline state. Transport is the `Authorization` header — **never cookies**, because client and server are separate Vercel projects and therefore cross-origin. **Logout clears the token and the session-scoped draft state; it does not clear the offline dataset or the outbox.**

- [ ] **Step 1: Write the failing tests**

`apps/client/src/auth/session.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/data/db';
import { enqueue } from '@/data/outbox';
import { session } from './session';

const user = { id: 'u-1', username: 'alice', full_name: 'Alice', role: 'lead' as const, must_change_password: false };

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('session (SPEC-FINAL 7.5)', () => {
  it('stores the token in IndexedDB, not in localStorage', async () => {
    await session.signIn(user, 'token-abc');
    expect(await session.token()).toBe('token-abc');
    expect(globalThis.localStorage?.getItem('token')).toBeFalsy();
  });

  it('survives a reload', async () => {
    await session.signIn(user, 'token-abc');
    await db.close();
    await db.open();
    expect((await session.current())?.user.id).toBe('u-1');
  });

  it('replaces the token when a refreshed one arrives', async () => {
    await session.signIn(user, 'token-abc');
    await session.replaceToken('token-def');
    expect(await session.token()).toBe('token-def');
    expect((await session.current())?.user.id).toBe('u-1');
  });

  it('signOut clears the token but never the dataset or the outbox', async () => {
    await session.signIn(user, 'token-abc');
    await db.rows.put({ entity: 'scouting_entries', id: 'e-1', event_id: 'ev-1' });
    await enqueue({
      op_id: 'o-1', entity: 'scouting_entry', row_id: 'e-1', action: 'create', base_version: null,
      payload: {}, author_user_id: 'u-1', client_created_at: '2026-11-14T09:00:00.000Z',
      client_updated_at: '2026-11-14T09:00:00.000Z', seq: 1,
    });

    await session.signOut();

    expect(await session.token()).toBeNull();
    expect(await db.rows.count()).toBe(1);
    expect(await db.outbox.count()).toBe(1);
  });

  it('notifies subscribers on sign-in and sign-out', async () => {
    const seen: (string | null)[] = [];
    const stop = session.subscribe((s) => seen.push(s?.user.id ?? null));
    await session.signIn(user, 't');
    await session.signOut();
    stop();
    expect(seen).toContain('u-1');
    expect(seen).toContain(null);
  });
});
```

`apps/client/src/auth/LoginPage.test.tsx` asserts: the username and password fields have labels; a wrong password shows one clear message and no raw error code; a successful sign-in stores the session; `must_change_password` routes to the change-password screen; the submit button is at least 48 px tall; and while offline the screen says it will use the credentials cached on this device (task 1.16 makes that true).

Add to `apps/client/src/data/api.test.ts`: the client sends `Authorization: Bearer <token>` when a session exists, sends none when it does not, and calls `session.replaceToken` when the response carries `X-Refreshed-Token`.

- [ ] **Step 2: Run and watch fail**

```bash
pnpm --filter @frc/client exec vitest run src/auth
```

Expected: `Failed to resolve import "./session"`.

- [ ] **Step 3: Implement**

`apps/client/src/auth/session.ts`:

```ts
import { db, getMeta, setMeta } from '@/data/db';

export type SessionUser = {
  id: string;
  username: string;
  full_name: string;
  role: 'scouter' | 'lead' | 'admin';
  must_change_password: boolean;
};

export type Session = { user: SessionUser; token: string | null; offline: boolean };

const KEY = 'auth.session';
const listeners = new Set<(session: Session | null) => void>();

async function read(): Promise<Session | null> {
  return getMeta<Session | null>(KEY, null);
}

async function write(next: Session | null): Promise<void> {
  await setMeta(KEY, next);
  for (const listener of listeners) listener(next);
}

export const session = {
  current: read,
  async token(): Promise<string | null> {
    return (await read())?.token ?? null;
  },
  async signIn(user: SessionUser, token: string | null, offline = false): Promise<void> {
    await write({ user, token, offline });
  },
  async replaceToken(token: string): Promise<void> {
    const current = await read();
    if (current) await write({ ...current, token, offline: false });
  },
  /**
   * SPEC-FINAL 7.5: logout clears the token and the session-scoped draft state. It does
   * NOT clear the offline dataset or the outbox — a scouter's unsynced work is not
   * something a sign-out may destroy.
   */
  async signOut(): Promise<void> {
    await db.practiceDrafts.clear();
    await write(null);
  },
  subscribe(listener: (session: Session | null) => void): () => void {
    listeners.add(listener);
    void read().then(listener);
    return () => listeners.delete(listener);
  },
};
```

In `apps/client/src/data/api.ts`, replace the `TokenSource` default with `session.token`, and after each response:

```ts
    const refreshed = res.headers.get('x-refreshed-token');
    if (refreshed) await session.replaceToken(refreshed);
```

`apps/client/src/data/rpc.ts` — the client for every registry route. `api.ts` (task 1.6) stays as it is: it owns `/sync/push` and `/sync/pull`, which are not registry routes.

**This task also creates `packages/shared/src/api/index.ts`**, the shared schema map §16.1 requires — *"the Zod schemas in `packages/shared` are the single validation source for both sides"*:

```ts
import { z } from 'zod';
import { loginInput, loginOutput } from './schemas/auth';
// ...one import per use case; each use-case module re-exports its two schemas from here

export const API = {
  login: { input: loginInput, output: loginOutput },
  refreshToken: { input: refreshTokenInput, output: loginOutput },
} as const;

export type Api = typeof API;
```

The server's `REGISTRY` imports its `input`/`output` from this same map rather than declaring them again, so the two sides cannot drift. **Every task that adds a use case adds its row here as well** — that is what makes `rpc.call('createSeason', …)` typed at every call site instead of `Promise<unknown>`.

```ts
import { clientConfig } from '@/config';
import { session } from '@/auth/session';

export type Rpc = { call: (name: string, input?: unknown) => Promise<unknown> };

export class RpcError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'RpcError';
  }
}

/**
 * SPEC-FINAL 16.1: "the typed client is derived from the use-case registry itself" — this
 * is why there is no tRPC. `API` is the map of use-case name to its Zod input and output,
 * exported from packages/shared, so a renamed field is a compile error in the page that
 * reads it rather than `undefined` at a venue.
 */
export async function call<K extends keyof Api>(
  name: K,
  input: z.input<Api[K]['input']>,
): Promise<z.output<Api[K]['output']>> {
  const parsed = API[name].input.parse(input);
  const body = await post(String(name), parsed);
  return API[name].output.parse(body);
}

/** The untyped escape hatch, for the two unauthenticated routes and for tests. */
export const rpc: Rpc = {
  async call(name: string, input: unknown = {}): Promise<unknown> {
    const token = await session.token();
    const res = await fetch(`${clientConfig().apiBaseUrl}/api/${name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
    });
    const refreshed = res.headers.get('x-refreshed-token');
    if (refreshed) await session.replaceToken(refreshed);

    const body: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = (body as { error?: { code?: string; message?: string } }).error;
      throw new RpcError(error?.code ?? 'invalid', error?.message ?? 'that did not work');
    }
    return body;
  },
};
```

`apps/client/src/auth/LoginPage.tsx` — a single centred card: a `username` input (`autoComplete="username"`), a `password` input (`autoComplete="current-password"`), one full-width 48 px submit button, and one error line. It calls `POST /api/login` through the API client, then `session.signIn(user, token)`, then navigates to `/` — or to `/change-password` when `must_change_password` is true. It shows no "forgot password" link, because there is no self-service reset (§7.3); it says instead: *"Ask an admin to reset it."*

`apps/client/src/auth/ChangePasswordPage.tsx` — current password, new password, confirm; calls `changeOwnPassword`; refuses fewer than 8 characters client-side with the same message the server uses.

Wire both into `routes.tsx`, and make `AppShell` redirect to `/login` when `session.current()` is null.

- [ ] **Step 4: Run and watch pass**

```bash
pnpm --filter @frc/client exec vitest run && pnpm typecheck && pnpm lint
```

Expected: every suite green, including the new file(s) from this task.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(client): add the IndexedDB session, the login screen and bearer transport"
```

---

## Task 1.16: Client — offline login and switch scouter

**Files:**
- Create: `apps/client/src/auth/offlineLogin.ts`, `apps/client/src/auth/offlineLogin.test.ts`
- Create: `apps/client/src/auth/SwitchScouter.tsx`, `apps/client/src/auth/SwitchScouter.test.tsx`
- Create: `apps/client/src/auth/pendingCredential.ts`
- Modify: `apps/client/src/auth/LoginPage.tsx`, `apps/client/src/features/shell/AppShell.tsx`, `apps/client/package.json` (add `"bcryptjs": "^2.4.3"`)

**Interfaces:**
- Produces: `offlineLogin(username, password)` — verifies against the **cached bcrypt hash on-device** and records the active user locally, minting no token; `pendingCredential` — an **in-memory only** holder used to obtain a real token on the first successful reconnect; `<SwitchScouter />` — the shared-device quick action, backed by the cached user list.

**Rules (SPEC-FINAL §7.5).** The offline dataset caches `{id, username, full_name, role, password_hash, disabled_at}` for every user. The password entered at offline login is **held in memory only, for the life of that session**, and is **never written to IndexedDB or anywhere else**. If the app was closed since the offline login, the user is prompted for the password once when connectivity returns; the outbox holds the data safely meanwhile and nothing is lost. **Every entry records the scouter who actually entered it.**

- [ ] **Step 1: Write the failing tests**

`apps/client/src/auth/offlineLogin.test.ts`:

```ts
import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/data/db';
import { session } from './session';
import { offlineLogin } from './offlineLogin';
import { pendingCredential } from './pendingCredential';

beforeEach(async () => {
  await db.delete();
  await db.open();
  pendingCredential.clear();
  await db.rows.bulkPut([
    {
      entity: 'users', id: 'u-1', username: 'alice', full_name: 'Alice', role: 'lead',
      password_hash: bcrypt.hashSync('correct horse', 10), disabled_at: null,
    },
    {
      entity: 'users', id: 'u-2', username: 'bob', full_name: 'Bob', role: 'scouter',
      password_hash: bcrypt.hashSync('other pass', 10), disabled_at: '2026-01-01T00:00:00.000Z',
    },
  ]);
});

describe('offline login (SPEC-FINAL 7.5)', () => {
  it('verifies the password against the cached hash and signs in with no token', async () => {
    await offlineLogin('alice', 'correct horse');
    const current = await session.current();
    expect(current?.user.id).toBe('u-1');
    expect(current?.token).toBeNull();
    expect(current?.offline).toBe(true);
  });

  it('refuses a wrong password', async () => {
    await expect(offlineLogin('alice', 'nope')).rejects.toThrow();
    expect(await session.current()).toBeNull();
  });

  it('refuses a disabled user', async () => {
    await expect(offlineLogin('bob', 'other pass')).rejects.toThrow(/disabled/i);
  });

  it('holds the password in memory only, never in IndexedDB', async () => {
    await offlineLogin('alice', 'correct horse');
    expect(pendingCredential.get()).toEqual({ username: 'alice', password: 'correct horse' });
    const dump = JSON.stringify(await db.meta.toArray());
    expect(dump).not.toContain('correct horse');
  });

  it('forgets the password once it has been exchanged for a token', async () => {
    await offlineLogin('alice', 'correct horse');
    pendingCredential.clear();
    expect(pendingCredential.get()).toBeNull();
  });

  it('matches the username case-insensitively, like the server', async () => {
    await offlineLogin('ALICE', 'correct horse');
    expect((await session.current())?.user.id).toBe('u-1');
  });
});
```

`apps/client/src/auth/SwitchScouter.test.tsx` asserts: the picker lists every cached, non-disabled user by full name; choosing one asks for that user's password; a correct password switches the active user without touching the outbox; the outbox still holds the previous scouter's unsynced operations with **their** `author_user_id`.

- [ ] **Step 2: Run and watch fail**

```bash
pnpm --filter @frc/client exec vitest run src/auth/offlineLogin.test.ts
```

Expected: `Failed to resolve import "./offlineLogin"`.

- [ ] **Step 3: Implement**

`apps/client/src/auth/pendingCredential.ts`:

```ts
type Credential = { username: string; password: string };

/**
 * SPEC-FINAL 7.5: held in memory only, for the life of this session, and used to obtain
 * a real token on the first successful reconnect. It is never written to IndexedDB or
 * anywhere else. A module-level variable is exactly the right lifetime: it dies with
 * the tab, which is what the spec asks for.
 */
let held: Credential | null = null;

export const pendingCredential = {
  set(credential: Credential): void {
    held = credential;
  },
  get(): Credential | null {
    return held;
  },
  clear(): void {
    held = null;
  },
};
```

`apps/client/src/auth/offlineLogin.ts`:

```ts
import bcrypt from 'bcryptjs';
import { cachedRows } from '@/data/cache';
import { pendingCredential } from './pendingCredential';
import { session, type SessionUser } from './session';

type CachedUser = SessionUser & { password_hash: string; disabled_at: string | null };

export async function offlineLogin(username: string, password: string): Promise<SessionUser> {
  const wanted = username.trim().toLowerCase();
  const users = await cachedRows<CachedUser>('users');
  const user = users.find((u) => u.username.toLowerCase() === wanted);
  if (!user) throw new Error('that username and password do not match');
  if (user.disabled_at !== null) throw new Error('this account has been disabled; ask an admin');
  if (!bcrypt.compareSync(password, user.password_hash)) {
    throw new Error('that username and password do not match');
  }

  const signedIn: SessionUser = {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    must_change_password: false,
  };
  await session.signIn(signedIn, null, true);
  pendingCredential.set({ username: wanted, password });
  return signedIn;
}
```

In `LoginPage`, catch a network failure from `POST /api/login` and fall back to `offlineLogin`, showing *"Signed in from this device's cached accounts. You are offline — your entries are safe here."*

In `AppShell`, on the `online` event: if the session has no token and `pendingCredential.get()` is non-null, exchange it for a real token through `POST /api/login` and `pendingCredential.clear()`. If it is null, show a one-field prompt asking for the password once. **The outbox is pushed either way** — `syncPush` authorizes per `author_user_id`, so a collector device can upload another scouter's work under its own bearer.

- [ ] **Step 4: Run and watch pass**

```bash
pnpm install && pnpm --filter @frc/client exec vitest run && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(client): add offline login against cached hashes and the switch-scouter action"
```

---

## Task 1.17: Client — the user administration page

**Files:**
- Create: `apps/client/src/features/admin/UsersPage.tsx`, `apps/client/src/features/admin/UserDetailPage.tsx`, `apps/client/src/features/admin/UsersPage.test.tsx`
- Create: `apps/client/src/components/DesktopOnly.tsx`, `apps/client/src/components/DesktopOnly.test.tsx`
- Create: `apps/client/src/components/StateMessage.tsx`, `apps/client/src/components/Skeleton.tsx`, `apps/client/src/components/Skeleton.test.tsx`
- Create: `apps/client/src/components/ConfirmDialog.tsx`
- Modify: `apps/client/src/routes.tsx`

**Interfaces:**
- Produces: `<DesktopOnly what="the user administration page">` — the ≥ 1024 px gate of SPEC-FINAL §17.2; `<StateMessage variant=… />` — the **one state component, six variants** of §17.8; `<ConfirmDialog>` — the single destructive pattern; the users table and detail page (Clerk reference: table → row opens a detail page; role is a select on that page; creation is one small form).

- [ ] **Step 1: Write the failing tests**

`apps/client/src/components/DesktopOnly.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DesktopOnly } from './DesktopOnly';

function setWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: px });
  window.matchMedia = ((query: string) => ({
    matches: px >= 1024,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

describe('DesktopOnly (SPEC-FINAL 17.2)', () => {
  it('renders its children at 1024 px and wider', () => {
    setWidth(1280);
    render(<DesktopOnly what="the form builder"><p>builder</p></DesktopOnly>);
    expect(screen.getByText('builder')).toBeInTheDocument();
  });

  it('renders one clear panel naming what needs a computer, and never a cramped builder', () => {
    setWidth(640);
    render(<DesktopOnly what="the form builder"><p>builder</p></DesktopOnly>);
    expect(screen.queryByText('builder')).not.toBeInTheDocument();
    expect(screen.getByRole('heading')).toHaveTextContent(/needs a computer/i);
    expect(screen.getByText(/the form builder/)).toBeInTheDocument();
  });
});
```

`apps/client/src/features/admin/UsersPage.test.tsx` asserts: only an admin sees the page (a lead gets the "not permitted" state); disabled users are hidden until "show disabled" is ticked; creating a user posts `createUser` and shows the new row; disabling a user asks for a plain confirm naming the person and **says the account is disabled, not deleted, and their entries are kept**; the page is gated by `DesktopOnly`.

- [ ] **Step 2: Run and watch fail**

```bash
pnpm --filter @frc/client exec vitest run src/components src/features/admin
```

Expected: `Failed to resolve import "./DesktopOnly"`.

- [ ] **Step 3: Implement**

`apps/client/src/components/DesktopOnly.tsx`:

```tsx
import { useEffect, useState, type ReactNode } from 'react';

const QUERY = '(min-width: 1024px)';

/** SPEC-FINAL 17.2: builders unlock at 1024 px; anything narrower gets one clear panel. */
export function DesktopOnly({ what, children }: { what: string; children: ReactNode }) {
  const [wide, setWide] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const listener = () => setWide(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  if (wide) return <>{children}</>;

  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-lg font-semibold">This needs a computer</h1>
      <p className="mt-2 text-[var(--text-muted)]">
        {what} is built sitting down, on a screen at least 1024 pixels wide. Phones do the
        competition job — entering, browsing and reading — and this is not one of those.
      </p>
    </div>
  );
}
```

`apps/client/src/components/Skeleton.tsx` — **skeletons, not spinners** (§17.8). Lists and tables render a `<Skeleton rows={n} />` of grey bars at the row height they are about to fill, so the page does not jump when the data lands. A spinner is permitted **only** for a genuinely indeterminate single action (a submit in flight), never for a list. Its test asserts: `role="status"` with `aria-busy`, the requested number of bars, no `animate-spin` anywhere in the component, and that it respects `prefers-reduced-motion` by dropping the shimmer rather than the layout.

`apps/client/src/components/StateMessage.tsx` — one component, six variants (`no-data`, `form-not-published`, `offline-needs-server`, `failed`, `no-results`, `conflicts-waiting`), each a centred glyph, one bold line of what happened, one muted line of why, and **exactly one primary action**. The `offline-needs-server` variant's muted line always says **the data is safe on the device** — that is the sentence that stops someone re-entering a match. No raw error codes are ever rendered.

`apps/client/src/components/ConfirmDialog.tsx` — the single destructive pattern of §17.8: names the object, states what is lost as a count, and puts the destructive verb on the primary button. A `typeToConfirm` prop switches on type-to-confirm, which is used **only** for multi-record irreversibles (delete a season, delete a form version, wipe local device data).

`UsersPage.tsx` / `UserDetailPage.tsx` — the table lists full name, username, role and status; a row opens the detail page; the detail page has a role `<select>`, a "reset password" action that shows the new password once for the admin to hand over and a "must change at next login" checkbox, and a "disable account" action behind `ConfirmDialog` whose body reads *"Disabling keeps everything they scouted, with their name on it. It is not a delete."*

- [ ] **Step 4: Run and watch pass**

```bash
pnpm --filter @frc/client exec vitest run && pnpm typecheck && pnpm lint
```

Expected: every suite green, including the new file(s) from this task.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(client): add user administration, the desktop gate and the shared state components"
```

---

# Phase 1 C — seasons, events, teams, roster, matches (§20.2.3)

---

## Task 1.18: The season image manifest, and the season / event / active-context use cases

**Files:**
- Create: `apps/client/public/seasons/2026/field.webp` — the real game image for the current season
- Create: `scripts/season-images.mjs`, `packages/shared/src/season/manifest.ts` (generated)
- Create: `apps/server/src/core/commands/seasons.ts`, `apps/server/src/core/commands/events.ts`
- Create: `apps/server/src/core/queries/context.ts`
- Create: `apps/server/src/core/commands/seasons.test.ts`, `apps/server/src/core/commands/events.test.ts`
- Modify: `packages/shared/src/index.ts` (export the manifest), root `package.json` (the two `season:images` scripts), `.github/workflows/ci.yml` (the drift check)
- Modify: `apps/server/src/routes/registry.ts`, `apps/server/src/repos/store.ts`, `apps/server/src/test/fake-context.ts` (implement `setActiveContext` and the season/event stubs)

**Interfaces:**
- Produces: `SEASON_IMAGE_MANIFEST` — the generated list of committed game-image paths, imported by both apps; `createSeason`, `updateSeason`, `setActiveSeason`, `createEvent`, `updateEvent`, `reorderEvents`, `setActiveEvent`, `getActiveContext`, `listSeasons`, `listEvents`. (`deleteSeason` / `deleteEvent` are task 1.60.)

**Why the image manifest is in this task.** §6.4 says a season cannot be created without a game image that resolves, so `createSeason` has to check something. That something is a generated list of the `.webp` files actually committed under `apps/client/public/seasons/` — the server has no filesystem to look at, and §16.7 forbids uploading the image anywhere. Generating the list and consuming it in the same task keeps both halves verifiable in one diff. Task 1.23 then renders the image on the client.

**Rules (SPEC-FINAL §6.3, §6.4, §3.1, §16.7).** All admin-only. The active context is the **`app_settings` singleton**, and `active_event_id` may be null while a brand-new season has no events yet. `createSeason` **validates that `field_image_path` resolves** — a season cannot be created without a game image that exists. `reorderEvents` changes display order only and **never re-weights aggregates**.

- [ ] **Step 1: Commit the game image and generate the manifest**

Put the season's game image at `apps/client/public/seasons/2026/field.webp` (WebP, the full field from the season's game manual, no larger than ~400 KB — it is precached on every device). Then:

`scripts/season-images.mjs` walks `apps/client/public/seasons` and writes `packages/shared/src/season/manifest.ts`:

```ts
// GENERATED by `pnpm season:images`. Do not edit.
export const SEASON_IMAGE_MANIFEST = ['seasons/2026/field.webp'] as const;
export type SeasonImagePath = (typeof SEASON_IMAGE_MANIFEST)[number];
```

The script itself, in full:

```js
#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEASONS_DIR = join(ROOT, 'apps/client/public/seasons');
const TARGET = join(ROOT, 'packages/shared/src/season/manifest.ts');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function render() {
  let files = [];
  try {
    files = walk(SEASONS_DIR)
      .filter((f) => f.endsWith('.webp'))
      .map((f) => relative(join(ROOT, 'apps/client/public'), f).split('\\').join('/'))
      .sort();
  } catch {
    files = [];
  }
  const entries = files.map((f) => `  '${f}',`).join('\n');
  return [
    '// GENERATED by `pnpm season:images`. Do not edit.',
    '// SPEC-FINAL 16.7: the database stores only the path string; this list is what',
    '// makes the server able to refuse a season whose image is not committed.',
    `export const SEASON_IMAGE_MANIFEST = [\n${entries}\n] as const;`,
    '',
    'export type SeasonImagePath = (typeof SEASON_IMAGE_MANIFEST)[number];',
    '',
  ].join('\n');
}

const rendered = render();
if (process.argv.includes('--check')) {
  const current = readFileSync(TARGET, 'utf8');
  if (current !== rendered) {
    console.error('drift: packages/shared/src/season/manifest.ts is stale.');
    console.error('Run `pnpm season:images` and commit the result.');
    process.exit(1);
  }
} else {
  writeFileSync(TARGET, rendered, 'utf8');
  console.warn(`wrote ${TARGET}`);
}
```

Add to the root `package.json`: `"season:images": "node scripts/season-images.mjs"` and `"season:images:check": "node scripts/season-images.mjs --check"`.

Add `export * from './season/manifest';` to `packages/shared/src/index.ts` — without it, `images.test.ts`'s `import { SEASON_IMAGE_MANIFEST } from '@frc/shared'` does not resolve.

**Also modify `.github/workflows/ci.yml`** (add it to this task's Files list), inserting a step beside `env:example:check`:

```yaml
      - name: Season image manifest has not drifted
        run: pnpm season:images:check
```

```bash
pnpm season:images && pnpm --filter @frc/client exec vitest run src/season 2>/dev/null || true
cat packages/shared/src/season/manifest.ts
```

Expected: `wrote .../packages/shared/src/season/manifest.ts`, and the file lists exactly `'seasons/2026/field.webp'`.

- [ ] **Step 2: Write the failing tests**

`apps/server/src/core/commands/seasons.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '@frc/shared';
import { createSeason, setActiveSeason, updateSeason } from './seasons';
import { makeFakeContext, type FakeContext } from '../../test/fake-context';

const admin: Caller = { kind: 'user', userId: 'u-a', role: 'admin' };
const lead: Caller = { kind: 'user', userId: 'u-l', role: 'lead' };
const service: Caller = { kind: 'service', label: 'mcp' };

const image = 'seasons/2026/field.webp'; // present in SEASON_IMAGE_MANIFEST (task 1.23)

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
});

describe('seasons (SPEC-FINAL 6.4)', () => {
  it('creates a season with a year, a game name and a resolving image path', async () => {
    const season = await createSeason(
      admin,
      { year: 2026, game_name: 'CRESCENDO', field_image_path: image },
      ctx,
    );
    expect(ctx.seasons.get(season.id)).toMatchObject({
      year: 2026,
      game_name: 'CRESCENDO',
      field_image_path: image,
    });
  });

  it('refuses a duplicate year', async () => {
    await createSeason(admin, { year: 2026, game_name: 'A', field_image_path: image }, ctx);
    await expect(
      createSeason(admin, { year: 2026, game_name: 'B', field_image_path: image }, ctx),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('refuses an image path that does not resolve, naming the file to commit', async () => {
    await expect(
      createSeason(admin, { year: 2028, game_name: 'C', field_image_path: 'seasons/2028/field.webp' }, ctx),
    ).rejects.toThrow(/apps\/client\/public\/seasons\/2028\/field\.webp/);
  });

  it('refuses every one of these to a lead', async () => {
    await expect(createSeason(lead, { year: 2027, game_name: 'D', field_image_path: image }, ctx))
      .rejects.toMatchObject({ code: 'forbidden' });
    await expect(updateSeason(lead, { season_id: 'se-1', game_name: 'E' }, ctx))
      .rejects.toMatchObject({ code: 'forbidden' });
    await expect(setActiveSeason(lead, { season_id: 'se-1' }, ctx))
      .rejects.toMatchObject({ code: 'forbidden' });
  });

  it('sets the active season and leaves active_event_id null when the season has no events', async () => {
    const season = await createSeason(admin, { year: 2026, game_name: 'F', field_image_path: image }, ctx);
    const context = await setActiveSeason(admin, { season_id: season.id }, ctx);
    expect(context).toEqual({ active_season_id: season.id, active_event_id: null });
  });

  it('rejects a service caller', async () => {
    await expect(createSeason(service, { year: 2029, game_name: 'G', field_image_path: image }, ctx))
      .rejects.toMatchObject({ code: 'forbidden' });
  });
});
```

`apps/server/src/core/commands/events.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '@frc/shared';
import { createEvent, listEvents, reorderEvents, setActiveEvent } from './events';
import { makeFakeContext, type FakeContext } from '../../test/fake-context';

const admin: Caller = { kind: 'user', userId: 'u-a', role: 'admin' };

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
  ctx.seasons.set('se-1', {
    id: 'se-1', year: 2026, game_name: 'X', field_image_path: 'seasons/2026/field.webp',
  } as never);
  ctx.seasons.set('se-2', {
    id: 'se-2', year: 2027, game_name: 'Y', field_image_path: 'seasons/2026/field.webp',
  } as never);
});

describe('events (SPEC-FINAL 6.2, 6.3)', () => {
  it('creates an event with the next sort_order in its season', async () => {
    const first = await createEvent(admin, { season_id: 'se-1', name: 'Week 1' }, ctx);
    const second = await createEvent(admin, { season_id: 'se-1', name: 'Week 3' }, ctx);
    expect(first.sort_order).toBe(1);
    expect(second.sort_order).toBe(2);
  });

  it('refuses two events with the same name in one season', async () => {
    await createEvent(admin, { season_id: 'se-1', name: 'Week 1' }, ctx);
    await expect(createEvent(admin, { season_id: 'se-1', name: 'Week 1' }, ctx))
      .rejects.toMatchObject({ code: 'conflict' });
  });

  it('reorders events and changes nothing but sort_order', async () => {
    const a = await createEvent(admin, { season_id: 'se-1', name: 'Week 1' }, ctx);
    const b = await createEvent(admin, { season_id: 'se-1', name: 'Week 3' }, ctx);
    await reorderEvents(admin, { season_id: 'se-1', event_ids: [b.id, a.id] }, ctx);
    expect(ctx.events.get(b.id)!.sort_order).toBe(1);
    expect(ctx.events.get(a.id)!.sort_order).toBe(2);
    expect(ctx.events.get(a.id)!.name).toBe('Week 1');
  });

  it('sets the active event and its season together, so the two can never disagree', async () => {
    const event = await createEvent(admin, { season_id: 'se-2', name: 'Champs' }, ctx);
    const context = await setActiveEvent(admin, { event_id: event.id }, ctx);
    expect(context).toEqual({ active_season_id: 'se-2', active_event_id: event.id });
  });

  it('reports not-found for an event that does not exist', async () => {
    await expect(setActiveEvent(admin, { event_id: 'nope' }, ctx))
      .rejects.toMatchObject({ code: 'not-found' });
  });

  it('lists events in sort_order, which is what makes the season slope view read left to right', async () => {
    const a = await createEvent(admin, { season_id: 'se-1', name: 'Week 1' }, ctx);
    const b = await createEvent(admin, { season_id: 'se-1', name: 'Week 3' }, ctx);
    await reorderEvents(admin, { season_id: 'se-1', event_ids: [b.id, a.id] }, ctx);
    const listed = await listEvents(admin, { season_id: 'se-1' }, ctx);
    expect(listed.items.map((e) => e.name)).toEqual(['Week 3', 'Week 1']);
  });
});
```

- [ ] **Step 3: Run and watch fail**

```bash
pnpm --filter @frc/server exec vitest run src/core/commands/seasons.test.ts src/core/commands/events.test.ts
```

Expected: `Failed to resolve import "./seasons"`.

- [ ] **Step 4: Implement the image-path rules**

In `apps/server/src/core/commands/seasons.ts` (task 1.18), `createSeason` and `updateSeason` refuse a `field_image_path` that is not in `SEASON_IMAGE_MANIFEST`, with the message *"commit apps/client/public/<path> and redeploy the client first"*.

**And `updateSeason` refuses to change `field_image_path` at all once the season has entries** (§16.7: *the image is immutable once entries exist* — every stored `{x, y}` is normalized against that exact image, so swapping it silently re-frames all historical spatial data). The message says what to do instead: *"a new image means a new filename and a new form version — create the new form version, do not swap the image."* Its test:

```ts
  it('refuses to swap a season image once entries exist, naming the alternative', async () => {
    ctx.entryCountsBySeason.set('se-1', 40);
    await expect(
      updateSeason(admin, { season_id: 'se-1', field_image_path: 'seasons/2027/field.webp' }, ctx),
    ).rejects.toThrow(/new form version/i);
  });

  it('still allows the game name to be corrected on a season with entries', async () => {
    ctx.entryCountsBySeason.set('se-1', 40);
    await expect(updateSeason(admin, { season_id: 'se-1', game_name: 'CRESCENDO' }, ctx))
      .resolves.toBeTruthy();
  });
```

(`entryCountsBySeason` joins the FakeContext map list in task 1.3, and `Store.countDeleteImpact` already reads the same underlying count on the real store.)

Add to the `workbox.globPatterns` in `vite.config.ts`: `'seasons/**/*.webp'` is already covered by the `webp` extension added in task 0.5 — assert it in the manifest test.

Add to `docs/ops/SETUP.md`'s *New-season checklist*, as step 1: **commit `apps/client/public/seasons/<year>/field.webp`, run `pnpm season:images`, and redeploy the client — the season cannot be created until that image is live.**

- [ ] **Step 5: Implement the rest**

Each function follows the same five lines: `assertCan(caller, 'manage_events')` → parse the Zod input → check the invariant → write through `ctx.store` → return the row. `setActiveEvent` writes **both** `active_event_id` and `active_season_id` in one update, so the singleton can never hold a mismatched pair:

```ts
export async function setActiveEvent(
  caller: Caller,
  input: { event_id: string },
  ctx: UseCaseContext,
): Promise<ActiveContext> {
  assertCan(caller, 'manage_events');
  const event = await ctx.store.getEvent(input.event_id);
  if (!event) throw new AppError('not-found', 'no such event');
  return ctx.store.setActiveContext({
    active_season_id: event.season_id,
    active_event_id: event.id,
  });
}
```

`getActiveContext` is a query every role — and a `service` caller — may call.

- [ ] **Step 6: Run and watch pass**

```bash
pnpm --filter @frc/server exec vitest run && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(server): add season, event and active-context use cases"
```

---

## Task 1.19: Server — teams, the event roster, matches and `ensureMatch`

**Files:**
- Create: `apps/server/src/core/commands/teams.ts`, `apps/server/src/core/commands/matches.ts`
- Create: `apps/server/src/core/queries/roster.ts`
- Create: `apps/server/src/core/commands/teams.test.ts`, `apps/server/src/core/commands/matches.test.ts`
- Modify: `apps/server/src/routes/registry.ts`, `apps/server/src/core/commands/syncPush.ts`

**Interfaces:**
- Produces: `createTeam`, `updateTeam`, `setEventRoster`, `listTeams`, `listEventRoster`, `createMatch`, `updateMatch`, `setMatchTeams`, `deleteMatch`, `listMatches`, and **`ensureMatch`** — the bare auto-creation of §6.4, available to **any authenticated user**.

**Rules.** A team number is **global and permanent**; its name is editable. `setEventRoster` soft-deletes removals so the tombstone propagates through sync. `createMatch` supports **bulk creation** by count. `deleteMatch` is **blocked when the match has entries** (the FK is `on delete restrict`) and the error says so. `ensureMatch` creates **event + type + number only**, is a **no-op if the match exists**, and **cannot set teams, edit or delete** — it is not the admin capability.

- [ ] **Step 1: Write the failing tests**

`apps/server/src/core/commands/matches.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '@frc/shared';
import { createMatch, deleteMatch, ensureMatch, setMatchTeams } from './matches';
import { makeFakeContext, type FakeContext } from '../../test/fake-context';

const admin: Caller = { kind: 'user', userId: 'u-a', role: 'admin' };
const lead: Caller = { kind: 'user', userId: 'u-l', role: 'lead' };
const scouter: Caller = { kind: 'user', userId: 'u-s', role: 'scouter' };

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
  ctx.events.set('ev-1', { id: 'ev-1', season_id: 'se-1', name: 'E', sort_order: 1 } as never);
  ctx.roster.set('ev-1', ['t-1', 't-2']);
});

describe('matches (SPEC-FINAL 6.4)', () => {
  it('creates a single match and refuses a duplicate (event, type, number)', async () => {
    await createMatch(admin, { event_id: 'ev-1', match_type: 'qualification', number: 1 }, ctx);
    await expect(createMatch(admin, { event_id: 'ev-1', match_type: 'qualification', number: 1 }, ctx))
      .rejects.toMatchObject({ code: 'conflict' });
  });

  it('creates qualification matches in bulk from a count, skipping ones that exist', async () => {
    await createMatch(admin, { event_id: 'ev-1', match_type: 'qualification', number: 3 }, ctx);
    const result = await createMatch(admin, { event_id: 'ev-1', match_type: 'qualification', count: 5 }, ctx);
    expect(result.created).toBe(4);
    expect([...ctx.matches.values()].map((m) => m.number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('fills the six alliance slots from the roster and allows slots to be left empty', async () => {
    const match = await createMatch(admin, { event_id: 'ev-1', match_type: 'qualification', number: 1 }, ctx);
    await setMatchTeams(admin, {
      match_id: match.id,
      slots: [
        { alliance: 'red', station: 1, team_id: 't-1' },
        { alliance: 'blue', station: 3, team_id: 't-2' },
      ],
    }, ctx);
    expect(ctx.matchTeams.get(`${match.id}:red:1`)!.team_id).toBe('t-1');
    expect(ctx.matchTeams.has(`${match.id}:red:2`)).toBe(false);
  });

  it('refuses a station outside 1..3 and an alliance outside red and blue', async () => {
    const match = await createMatch(admin, { event_id: 'ev-1', match_type: 'qualification', number: 1 }, ctx);
    await expect(
      setMatchTeams(admin, { match_id: match.id, slots: [{ alliance: 'red', station: 4, team_id: 't-1' }] }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      setMatchTeams(admin, {
        match_id: match.id,
        slots: [{ alliance: 'green', station: 1, team_id: 't-1' } as never],
      }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('refuses a team that is not on the event roster', async () => {
    const match = await createMatch(admin, { event_id: 'ev-1', match_type: 'qualification', number: 1 }, ctx);
    await expect(
      setMatchTeams(admin, { match_id: match.id, slots: [{ alliance: 'red', station: 1, team_id: 't-99' }] }, ctx),
    ).rejects.toThrow(/roster/i);
  });

  it('blocks deleting a match that has entries, and says to correct the number instead', async () => {
    const match = await createMatch(admin, { event_id: 'ev-1', match_type: 'qualification', number: 1 }, ctx);
    ctx.entryCountsByMatch.set(match.id, 6);
    await expect(deleteMatch(admin, { match_id: match.id }, ctx)).rejects.toThrow(/6 entries/);
    await expect(deleteMatch(admin, { match_id: match.id }, ctx)).rejects.toThrow(/correct the match number/i);
  });

  it('lets a scouter call ensureMatch, and it is a no-op when the match already exists', async () => {
    const id = '00000000-0000-4000-8000-000000000099';
    const first = await ensureMatch(scouter, { id, event_id: 'ev-1', match_type: 'qualification', number: 42 }, ctx);
    expect(first).toEqual({ id, created: true });
    const again = await ensureMatch(
      scouter,
      { id: '00000000-0000-4000-8000-000000000098', event_id: 'ev-1', match_type: 'qualification', number: 42 },
      ctx,
    );
    expect(again).toEqual({ id, created: false });
  });

  it('never lets ensureMatch set teams, rename or delete', async () => {
    const id = '00000000-0000-4000-8000-000000000097';
    await ensureMatch(scouter, { id, event_id: 'ev-1', match_type: 'qualification', number: 7 }, ctx);
    expect(Object.keys(ctx.matches.get(id)!).sort()).toEqual(
      ['event_id', 'id', 'match_type', 'number'].sort(),
    );
  });

  it('refuses createMatch, setMatchTeams and deleteMatch to a lead', async () => {
    await expect(createMatch(lead, { event_id: 'ev-1', match_type: 'qualification', number: 2 }, ctx))
      .rejects.toMatchObject({ code: 'forbidden' });
    await expect(setMatchTeams(lead, { match_id: 'm-1', slots: [] }, ctx))
      .rejects.toMatchObject({ code: 'forbidden' });
    await expect(deleteMatch(lead, { match_id: 'm-1' }, ctx))
      .rejects.toMatchObject({ code: 'forbidden' });
  });
});
```

`apps/server/src/core/commands/teams.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '@frc/shared';
import { createTeam, setEventRoster, updateTeam } from './teams';
import { listEventRoster } from '../queries/roster';
import { makeFakeContext, type FakeContext } from '../../test/fake-context';

const admin: Caller = { kind: 'user', userId: 'u-a', role: 'admin' };
const lead: Caller = { kind: 'user', userId: 'u-l', role: 'lead' };

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
  ctx.events.set('ev-1', { id: 'ev-1', season_id: 'se-1', name: 'E', sort_order: 1 } as never);
});

describe('teams and the event roster (SPEC-FINAL 6.4, 3.1)', () => {
  it('creates a team from a number and a name', async () => {
    const team = await createTeam(admin, { number: 2096, name: 'ROBACTIVE' }, ctx);
    expect(ctx.teams.get(team.id)).toMatchObject({ number: 2096, name: 'ROBACTIVE' });
  });

  it('keeps team numbers globally unique', async () => {
    await createTeam(admin, { number: 2096, name: 'ROBACTIVE' }, ctx);
    await expect(createTeam(admin, { number: 2096, name: 'Clone' }, ctx))
      .rejects.toMatchObject({ code: 'conflict' });
  });

  it('edits the name and never the number, because a team number is permanent', async () => {
    const team = await createTeam(admin, { number: 2096, name: 'Robactive' }, ctx);
    await updateTeam(admin, { team_id: team.id, name: 'ROBACTIVE' }, ctx);
    expect(ctx.teams.get(team.id)!.name).toBe('ROBACTIVE');
    await expect(updateTeam(admin, { team_id: team.id, number: 1 } as never, ctx))
      .rejects.toMatchObject({ code: 'invalid' });
  });

  it('adds teams to the roster and lists them', async () => {
    const a = await createTeam(admin, { number: 2096, name: 'A' }, ctx);
    const b = await createTeam(admin, { number: 1577, name: 'B' }, ctx);
    await setEventRoster(admin, { event_id: 'ev-1', team_ids: [a.id, b.id] }, ctx);
    const roster = await listEventRoster(admin, { event_id: 'ev-1' }, ctx);
    expect(roster.items.map((r) => r.team_id).sort()).toEqual([a.id, b.id].sort());
  });

  it('soft-deletes a removal so the tombstone propagates through sync', async () => {
    const a = await createTeam(admin, { number: 2096, name: 'A' }, ctx);
    await setEventRoster(admin, { event_id: 'ev-1', team_ids: [a.id] }, ctx);
    await setEventRoster(admin, { event_id: 'ev-1', team_ids: [] }, ctx);
    const row = [...ctx.eventTeams.values()].find((r) => r.team_id === a.id)!;
    expect(row.deleted_at).not.toBeNull();
    expect((await listEventRoster(admin, { event_id: 'ev-1' }, ctx)).items).toEqual([]);
  });

  it('clears the tombstone when a removed team is added back, rather than making a second row', async () => {
    const a = await createTeam(admin, { number: 2096, name: 'A' }, ctx);
    await setEventRoster(admin, { event_id: 'ev-1', team_ids: [a.id] }, ctx);
    await setEventRoster(admin, { event_id: 'ev-1', team_ids: [] }, ctx);
    await setEventRoster(admin, { event_id: 'ev-1', team_ids: [a.id] }, ctx);
    const rows = [...ctx.eventTeams.values()].filter((r) => r.team_id === a.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deleted_at).toBeNull();
  });

  it('refuses all three to a lead', async () => {
    await expect(createTeam(lead, { number: 1, name: 'X' }, ctx)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(updateTeam(lead, { team_id: 't-1', name: 'X' }, ctx)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(setEventRoster(lead, { event_id: 'ev-1', team_ids: [] }, ctx))
      .rejects.toMatchObject({ code: 'forbidden' });
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
pnpm --filter @frc/server exec vitest run src/core/commands/matches.test.ts
```

- [ ] **Step 3: Implement**

`ensureMatch` is the only one gated on `ensure_match` rather than `manage_events`:

```ts
export const ensureMatchInput = z.object({
  id: z.string().uuid(),          // client-generated, so an offline device cannot collide
  event_id: z.string().uuid(),
  match_type: z.enum(['practice', 'qualification', 'playoff']),
  number: z.number().int().positive(),
});

/**
 * SPEC-FINAL 6.4: a system action, not an admin capability. Without it a scouter at a
 * venue with an incomplete schedule could not record a match at all. It rides the
 * outbox like any other create and works offline.
 */
export async function ensureMatch(
  caller: Caller,
  input: z.infer<typeof ensureMatchInput>,
  ctx: UseCaseContext,
): Promise<{ id: string; created: boolean }> {
  assertCan(caller, 'ensure_match');
  const existing = await ctx.store.findMatch(input.event_id, input.match_type, input.number);
  if (existing) return { id: existing.id, created: false };
  await ctx.store.insertMatch({
    id: input.id,
    event_id: input.event_id,
    match_type: input.match_type,
    number: input.number,
  });
  return { id: input.id, created: true };
}
```

and `syncPush`'s `applyBareMatch` now calls `ensureMatch` instead of writing the row itself, so there is exactly one implementation of the rule.

- [ ] **Step 4: Run and watch pass**

```bash
pnpm --filter @frc/server exec vitest run && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(server): add team, roster and match management with ensureMatch"
```

---
## Task 1.20: Client — the admin management page: seasons and events

**Files:**
- Create: `apps/client/src/features/admin/ManagePage.tsx`, `apps/client/src/features/admin/SeasonsPanel.tsx`, `apps/client/src/features/admin/EventsPanel.tsx`
- Create: `apps/client/src/features/admin/SeasonsPanel.test.tsx`, `apps/client/src/features/admin/EventsPanel.test.tsx`
- Modify: `apps/client/src/routes.tsx`

**`apps/client/src/data/rpc.ts` already exists** — task 1.15 created it for the login and change-password screens. This task only uses it.

**Interfaces:**
- Produces: `rpc.call('createSeason', input)` — the typed client derived from the registry; `<ManagePage />` at `/admin/manage`, desktop-only, with tabs *Seasons · Events · Teams & roster · Matches* (the last two land in task 1.21).

- [ ] **Step 1: Write the failing tests**

`apps/client/src/features/admin/SeasonsPanel.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SeasonsPanel } from './SeasonsPanel';

const seasons = [
  { id: 's-1', year: 2026, game_name: 'CRESCENDO', field_image_path: 'seasons/2026/field.webp' },
  { id: 's-2', year: 2027, game_name: 'NEXT GAME', field_image_path: 'seasons/2027/field.webp' },
];

function harness(overrides: Partial<Record<string, unknown>> = {}) {
  const call = vi.fn(async (name: string) => {
    if (name === 'listSeasons') return { items: seasons, next_cursor: null };
    if (name === 'getActiveContext') return { active_season_id: 's-1', active_event_id: null };
    return { id: 's-3', year: 2028, game_name: 'NEW', field_image_path: 'seasons/2028/field.webp' };
  });
  return { call, ...overrides };
}

describe('SeasonsPanel', () => {
  it('lists seasons newest first and marks the active one', async () => {
    render(<SeasonsPanel rpc={harness()} />);
    const rows = await screen.findAllByRole('row');
    expect(rows[1]).toHaveTextContent('2027');
    expect(rows[2]).toHaveTextContent('2026');
    expect(rows[2]).toHaveTextContent(/active/i);
  });

  it('creates a season from year, game name and image path', async () => {
    const rpc = harness();
    const user = userEvent.setup();
    render(<SeasonsPanel rpc={rpc} />);
    await user.click(await screen.findByRole('button', { name: /new season/i }));
    await user.type(screen.getByLabelText(/year/i), '2028');
    await user.type(screen.getByLabelText(/game name/i), 'NEW');
    await user.type(screen.getByLabelText(/game image path/i), 'seasons/2028/field.webp');
    await user.click(screen.getByRole('button', { name: /create season/i }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('createSeason', {
        year: 2028,
        game_name: 'NEW',
        field_image_path: 'seasons/2028/field.webp',
      }),
    );
  });

  it('shows the server error when the image path does not resolve, without a raw code', async () => {
    const rpc = harness({
      call: vi.fn(async (name: string) => {
        if (name === 'listSeasons') return { items: seasons, next_cursor: null };
        if (name === 'getActiveContext') return { active_season_id: 's-1', active_event_id: null };
        throw Object.assign(new Error('commit apps/client/public/seasons/2028/field.webp first'), { code: 'invalid' });
      }),
    });
    const user = userEvent.setup();
    render(<SeasonsPanel rpc={rpc} />);
    await user.click(await screen.findByRole('button', { name: /new season/i }));
    await user.type(screen.getByLabelText(/year/i), '2028');
    await user.type(screen.getByLabelText(/game name/i), 'NEW');
    await user.type(screen.getByLabelText(/game image path/i), 'seasons/2028/field.webp');
    await user.click(screen.getByRole('button', { name: /create season/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/commit apps\/client\/public\/seasons\/2028\/field\.webp/);
    expect(alert).not.toHaveTextContent('invalid');
  });

  it('sets the active season', async () => {
    const rpc = harness();
    const user = userEvent.setup();
    render(<SeasonsPanel rpc={rpc} />);
    await user.click(await screen.findByRole('button', { name: /make 2027 active/i }));
    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith('setActiveSeason', { season_id: 's-2' }));
  });
});
```

`apps/client/src/features/admin/EventsPanel.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EventsPanel } from './EventsPanel';

const events = [
  { id: 'e-1', season_id: 's-1', name: 'Week 1', sort_order: 1 },
  { id: 'e-2', season_id: 's-1', name: 'Week 3', sort_order: 2 },
];

const rpcFor = () => ({
  call: vi.fn(async (name: string) => {
    if (name === 'listEvents') return { items: events, next_cursor: null };
    if (name === 'getActiveContext') return { active_season_id: 's-1', active_event_id: 'e-1' };
    return {};
  }),
});

describe('EventsPanel', () => {
  it('lists events in sort_order', async () => {
    render(<EventsPanel seasonId="s-1" rpc={rpcFor()} />);
    const rows = await screen.findAllByRole('row');
    expect(rows[1]).toHaveTextContent('Week 1');
    expect(rows[2]).toHaveTextContent('Week 3');
  });

  it('moves an event down and sends the whole new order', async () => {
    const rpc = rpcFor();
    const user = userEvent.setup();
    render(<EventsPanel seasonId="s-1" rpc={rpc} />);
    await user.click(await screen.findByRole('button', { name: /move week 1 down/i }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('reorderEvents', { season_id: 's-1', event_ids: ['e-2', 'e-1'] }),
    );
  });

  it('says plainly that reordering changes display order only', async () => {
    render(<EventsPanel seasonId="s-1" rpc={rpcFor()} />);
    expect(await screen.findByText(/display order only/i)).toBeInTheDocument();
    expect(screen.getByText(/never re-weights/i)).toBeInTheDocument();
  });

  it('sets the active event', async () => {
    const rpc = rpcFor();
    const user = userEvent.setup();
    render(<EventsPanel seasonId="s-1" rpc={rpc} />);
    await user.click(await screen.findByRole('button', { name: /make week 3 the default/i }));
    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith('setActiveEvent', { event_id: 'e-2' }));
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
pnpm --filter @frc/client exec vitest run src/features/admin
```

Expected: `Failed to resolve import "./SeasonsPanel"`.

- [ ] **Step 3: Implement the two panels**

`SeasonsPanel` renders a table (year, game name, image path, active marker, actions), a "New season" form with three labelled inputs, and one `role="alert"` line that shows **the server's message**, never its code. `EventsPanel` renders the events of a season ordered by `sort_order`, with up/down buttons that send the whole `event_ids` array to `reorderEvents`, a "make the default" action per row, and a permanent note: *"Reordering changes display order only. It never re-weights aggregates — every event counts equally."*

`ManagePage` wraps both in `<DesktopOnly what="season, event, roster and match management">` and a tab strip.

- [ ] **Step 4: Run and watch pass**

```bash
pnpm --filter @frc/client exec vitest run && pnpm typecheck && pnpm lint
```

Expected: every suite green, including the new file(s) from this task.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(client): add the admin management page for seasons and events"
```

---

## Task 1.21: Client — the admin management page: teams, roster and matches

**Files:**
- Create: `apps/client/src/features/admin/TeamsPanel.tsx`, `apps/client/src/features/admin/MatchesPanel.tsx`
- Create: `apps/client/src/features/admin/TeamsPanel.test.tsx`, `apps/client/src/features/admin/MatchesPanel.test.tsx`
- Modify: `apps/client/src/features/admin/ManagePage.tsx`

**Interfaces:**
- Produces: the roster editor (global team registry + this event's `event_teams`) and the match editor (bulk-create by count, then fill the six slots from the roster, slots may stay empty).

- [ ] **Step 1: Write the failing tests**

`apps/client/src/features/admin/TeamsPanel.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TeamsPanel } from './TeamsPanel';

const teams = [
  { id: 't-1', number: 2096, name: 'ROBACTIVE' },
  { id: 't-2', number: 1577, name: 'Steampunk' },
];

const rpcFor = (roster = ['t-1']) => ({
  call: vi.fn(async (name: string) => {
    if (name === 'listTeams') return { items: teams, next_cursor: null };
    if (name === 'listEventRoster') return { items: roster.map((id) => ({ team_id: id })), next_cursor: null };
    return {};
  }),
});

describe('TeamsPanel', () => {
  it('marks which teams are on this event roster', async () => {
    render(<TeamsPanel eventId="ev-1" rpc={rpcFor()} />);
    expect(await screen.findByRole('checkbox', { name: /2096 ROBACTIVE/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /1577 Steampunk/ })).not.toBeChecked();
  });

  it('sends the whole roster when a team is added', async () => {
    const rpc = rpcFor();
    const user = userEvent.setup();
    render(<TeamsPanel eventId="ev-1" rpc={rpc} />);
    await user.click(await screen.findByRole('checkbox', { name: /1577 Steampunk/ }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('setEventRoster', { event_id: 'ev-1', team_ids: ['t-1', 't-2'] }),
    );
  });

  it('creates a team with a number and a name', async () => {
    const rpc = rpcFor();
    const user = userEvent.setup();
    render(<TeamsPanel eventId="ev-1" rpc={rpc} />);
    await user.type(await screen.findByLabelText(/team number/i), '5987');
    await user.type(screen.getByLabelText(/team name/i), 'Galaxia');
    await user.click(screen.getByRole('button', { name: /add team/i }));
    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith('createTeam', { number: 5987, name: 'Galaxia' }));
  });

  it('says that a team number is permanent and only the name can change', async () => {
    render(<TeamsPanel eventId="ev-1" rpc={rpcFor()} />);
    expect(await screen.findByText(/number is permanent/i)).toBeInTheDocument();
  });
});
```

`apps/client/src/features/admin/MatchesPanel.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MatchesPanel } from './MatchesPanel';

const matches = [{ id: 'm-1', event_id: 'ev-1', match_type: 'qualification', number: 1 }];
const roster = [{ team_id: 't-1', number: 2096, name: 'ROBACTIVE' }];

const rpcFor = () => ({
  call: vi.fn(async (name: string) => {
    if (name === 'listMatches') return { items: matches, next_cursor: null };
    if (name === 'listEventRoster') return { items: roster, next_cursor: null };
    if (name === 'deleteMatch') throw Object.assign(new Error('this match has 6 entries — correct the number or delete the entries first'), { code: 'conflict' });
    return {};
  }),
});

describe('MatchesPanel', () => {
  it('creates qualification matches in bulk from a count', async () => {
    const rpc = rpcFor();
    const user = userEvent.setup();
    render(<MatchesPanel eventId="ev-1" rpc={rpc} />);
    await user.clear(await screen.findByLabelText(/how many qualification matches/i));
    await user.type(screen.getByLabelText(/how many qualification matches/i), '60');
    await user.click(screen.getByRole('button', { name: /create matches/i }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('createMatch', { event_id: 'ev-1', match_type: 'qualification', count: 60 }),
    );
  });

  it('fills a station from the roster and allows a slot to be left empty', async () => {
    const rpc = rpcFor();
    const user = userEvent.setup();
    render(<MatchesPanel eventId="ev-1" rpc={rpc} />);
    await user.selectOptions(await screen.findByLabelText(/red 1/i), 't-1');
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('setMatchTeams', {
        match_id: 'm-1',
        slots: [{ alliance: 'red', station: 1, team_id: 't-1' }],
      }),
    );
    expect(screen.getByLabelText(/red 2/i)).toHaveValue('');
  });

  it('shows the server message when a match with entries cannot be deleted', async () => {
    const user = userEvent.setup();
    render(<MatchesPanel eventId="ev-1" rpc={rpcFor()} />);
    await user.click(await screen.findByRole('button', { name: /delete match 1/i }));
    await user.click(await screen.findByRole('button', { name: /^delete$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/has 6 entries/);
  });
});
```

- [ ] **Step 2: Run and watch fail, then implement, then re-run**

```bash
pnpm --filter @frc/client exec vitest run src/features/admin
```

Expected first: `Failed to resolve import "./TeamsPanel"`. After implementing: every suite green, including the new file(s) from this task.

`TeamsPanel` shows the global team list with a roster checkbox per row, a small "add team" form, and the standing note *"A team number is permanent. Only the name can change."* `MatchesPanel` shows a bulk-create control ("How many qualification matches?"), then a table of matches with six `<select>` slots each — red 1–3 and blue 1–3 — populated from the roster and defaulting to empty, plus a delete action behind `ConfirmDialog` that surfaces the server's refusal verbatim.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(client): add roster and match management to the admin page"
```

---

## Task 1.22: Client — the context / landing page

**Files:**
- Create: `apps/client/src/features/context/ContextPage.tsx`, `apps/client/src/features/context/ContextPage.test.tsx`
- Create: `apps/client/src/features/context/sessionOverride.ts`
- Modify: `apps/client/src/routes.tsx`, `apps/client/src/features/shell/AppShell.tsx`

**Interfaces:**
- Produces: `<ContextPage />` at `/context` — the app's landing page; `sessionOverride` — an in-memory-only override of the active event.

**Rules (SPEC-FINAL §6.3, §17.9).** The app **always opens to the admin default**. A user may switch the season/event they are working in, but the switch is **session-only and never persisted** — reopening the app returns to the admin default. **Only the admin default is cached for offline use.** The switcher lives on this dedicated page the user deliberately opens, **never in the header or nav**, because a wrong context silently misattributes data. **Any action that switches the active event is disabled offline.** **No new entry may be created while an override is in effect.** The page reads as a calm document, not a control panel: a card grid, most recent first — seasons, then that season's events — with the version string quiet in the footer.

- [ ] **Step 1: Write the failing test**

`apps/client/src/features/context/ContextPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/data/db';
import { ContextPage } from './ContextPage';
import { sessionOverride } from './sessionOverride';

beforeEach(async () => {
  await db.delete();
  await db.open();
  sessionOverride.clear();
  await db.rows.bulkPut([
    { entity: 'app_settings', id: 'true', active_season_id: 's-1', active_event_id: 'e-1' },
    { entity: 'seasons', id: 's-1', year: 2026, game_name: 'CRESCENDO' },
    { entity: 'events', id: 'e-1', season_id: 's-1', name: 'Week 1', sort_order: 1 },
    { entity: 'events', id: 'e-2', season_id: 's-1', name: 'Week 3', sort_order: 2 },
  ]);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

describe('ContextPage (SPEC-FINAL 6.3)', () => {
  it('shows the admin default as the current context', async () => {
    render(<ContextPage />);
    expect(await screen.findByText(/Week 1/)).toBeInTheDocument();
    expect(screen.getByText(/current/i)).toBeInTheDocument();
  });

  it('offers seasons and events as a card grid, not a dropdown', async () => {
    render(<ContextPage />);
    expect(await screen.findAllByRole('button', { name: /week/i })).toHaveLength(2);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('holds an override in memory only and never writes it anywhere', async () => {
    const user = userEvent.setup();
    render(<ContextPage />);
    await user.click(await screen.findByRole('button', { name: /week 3/i }));
    expect(sessionOverride.get()).toBe('e-2');
    const dump = JSON.stringify(await db.meta.toArray());
    expect(dump).not.toContain('e-2');
  });

  it('warns that an override is session-only and blocks new entries', async () => {
    const user = userEvent.setup();
    render(<ContextPage />);
    await user.click(await screen.findByRole('button', { name: /week 3/i }));
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent(/only for this session/i);
    expect(notice).toHaveTextContent(/cannot create new entries/i);
  });

  it('disables every switch while offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<ContextPage />);
    expect(await screen.findByRole('button', { name: /week 3/i })).toBeDisabled();
    expect(screen.getByText(/only the default competition is available offline/i)).toBeInTheDocument();
  });

  it('shows the app version quietly in the footer', async () => {
    render(<ContextPage />);
    expect(await screen.findByText(/^version /i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
pnpm --filter @frc/client exec vitest run src/features/context
```

Expected: `Failed to resolve import "./ContextPage"`.

- [ ] **Step 3: Implement**

`apps/client/src/features/context/sessionOverride.ts`:

```ts
let overriddenEventId: string | null = null;
const listeners = new Set<(id: string | null) => void>();

/**
 * SPEC-FINAL 6.3: session-only and never persisted, on the server or on the device.
 * Reopening the app returns to the admin default. While an override is in effect the
 * client asks the server for computed results and no new entry may be created.
 */
export const sessionOverride = {
  get: (): string | null => overriddenEventId,
  set(eventId: string): void {
    overriddenEventId = eventId;
    for (const listener of listeners) listener(eventId);
  },
  clear(): void {
    overriddenEventId = null;
    for (const listener of listeners) listener(null);
  },
  subscribe(listener: (id: string | null) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function entryCreationAllowed(): boolean {
  return overriddenEventId === null;
}
```

`ContextPage` reads the cached `app_settings`, `seasons` and `events`, renders the default as a "current" card, then a grid of season cards (most recent first) each expanding to its events in `sort_order`. Every non-default card is `disabled` while `!navigator.onLine`, with the muted line *"Only the default competition is available offline."* Choosing one calls `sessionOverride.set` and renders a `role="status"` banner: *"You are looking at Week 3 only for this session. You cannot create new entries here, and reopening the app returns to Week 1."* The footer prints `version {clientConfig().appVersion}`.

`AppShell` subscribes to `sessionOverride` and disables the "Scout" nav entry while one is active.

**Three more things `AppShell` owns, each one line of SPEC-FINAL that has nowhere else to live:**

```tsx
// 9.1 — a new version NEVER auto-reloads. It activates on the next cold start; all we
// do is say so, quietly, and let the scouter finish the match.
const [updateReady, setUpdateReady] = useState(false);
useEffect(() => {
  void registerServiceWorker(() => setUpdateReady(true), browserAdapter());
}, []);

// 9.3 — a delta pull runs on app open, SCREEN ENTRY, pull-to-refresh, manual refresh,
// reconnect, and the 45-second auto-refresh. Screen entry and pull-to-refresh are the
// two that are easy to forget, and 10 calls needing a restart to see a change a caching
// bug to design out.
const { pathname } = useLocation();
useEffect(() => {
  if (navigator.onLine) void run(false);
}, [pathname]);

// 9.3 — if the server says the event is gone, the cache is wiped and the notice NAMES it.
if (outcome.status === 'event-gone') {
  setGoneNotice(`${eventName} no longer exists. Its data has been removed from this device.`);
}
```

The update hint renders as one muted line in the footer — *"An update is ready. It will apply next time you open the app."* — with **no reload button**, because there is nothing safe for that button to do mid-match. Pull-to-refresh is a `touchstart`/`touchmove` handler on the scroll container that calls the same `run(false)`; there is exactly one sync path and everything routes through it.

`AppShell.test.tsx` asserts each: the hint appears when `registerServiceWorker` reports an update and there is no control that reloads; navigating between two routes triggers a pull; a pull-to-refresh gesture triggers one; and `event-gone` renders a notice containing the event's name and empties `db.rows` for it.

- [ ] **Step 4: Run and watch pass**

```bash
pnpm --filter @frc/client exec vitest run && pnpm typecheck && pnpm lint
```

Expected: every suite green, including the new file(s) from this task.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(client): add the context landing page with a session-only event override"
```

---

## Task 1.23: Rendering the season game image, and failing loudly without it

**Files:**
- Create: `apps/client/src/season/images.ts`, `apps/client/src/season/images.test.ts`
- Create: `apps/client/src/season/FieldImage.tsx`, `apps/client/src/season/FieldImage.test.tsx`
- Modify: `apps/client/vite.config.ts` (precache `seasons/**/*.webp`), `docs/ops/SETUP.md` (new-season checklist line)

**Consumes:** `SEASON_IMAGE_MANIFEST` and the committed `.webp`, both from task 1.18.

**Interfaces:**
- Produces: `isKnownSeasonImage(path)`, `imageUrlFor(path)`; `<FieldImage path alt />` — renders the image, or the **fail-loud** missing-image state.

**Rules (SPEC-FINAL §16.7).** No Supabase Storage and no binary uploads anywhere in v1. The image is a **static client asset** at `apps/client/public/seasons/<year>/field.webp`; the database stores **only the path string**. The service worker **precaches it with the app shell**, which is what makes offline position and cycle-path entry work at no cost to the offline budget. **Adding a season needs a commit and a redeploy** — a line in the new-season checklist. **A missing image must fail loudly** — an explicit error, never a blank canvas that quietly records meaningless coordinates. (The *immutable once entries exist* half of §16.7 is enforced by `updateSeason`, task 1.18.)

- [ ] **Step 1: Write the failing tests**

`apps/client/src/season/images.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEASON_IMAGE_MANIFEST } from '@frc/shared';
import { imageUrlFor, isKnownSeasonImage } from './images';

describe('the season image manifest (SPEC-FINAL 16.7)', () => {
  it('names only files that are actually committed', () => {
    for (const path of SEASON_IMAGE_MANIFEST) {
      expect(existsSync(join(import.meta.dirname, '../../public', path)), path).toBe(true);
    }
  });

  it('recognises a committed path and rejects one that is not', () => {
    expect(isKnownSeasonImage(SEASON_IMAGE_MANIFEST[0]!)).toBe(true);
    expect(isKnownSeasonImage('seasons/1999/field.webp')).toBe(false);
    expect(isKnownSeasonImage('../../etc/passwd')).toBe(false);
  });

  it('serves the image from the app origin, so the service worker can precache it', () => {
    expect(imageUrlFor('seasons/2026/field.webp')).toBe('/seasons/2026/field.webp');
  });
});
```

`apps/client/src/season/FieldImage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FieldImage } from './FieldImage';

describe('FieldImage', () => {
  it('renders the game image when the path is a committed one', () => {
    render(<FieldImage path="seasons/2026/field.webp" alt="2026 field" />);
    expect(screen.getByRole('img', { name: '2026 field' })).toHaveAttribute('src', '/seasons/2026/field.webp');
  });

  it('fails loudly for a missing image and never renders a blank canvas', () => {
    render(<FieldImage path="seasons/1999/field.webp" alt="1999 field" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/game image is missing/i);
    expect(alert).toHaveTextContent('seasons/1999/field.webp');
    expect(alert).toHaveTextContent(/commit it and redeploy/i);
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
pnpm --filter @frc/client exec vitest run src/season
```

Expected: `Failed to resolve import "./images"`.

- [ ] **Step 3: Implement**

`apps/client/src/season/images.ts`:

```ts
import { SEASON_IMAGE_MANIFEST } from '@frc/shared';

export function isKnownSeasonImage(path: string): boolean {
  return (SEASON_IMAGE_MANIFEST as readonly string[]).includes(path);
}

export function imageUrlFor(path: string): string {
  return `/${path}`;
}
```

`apps/client/src/season/FieldImage.tsx`:

```tsx
import type { ImgHTMLAttributes } from 'react';
import { imageUrlFor, isKnownSeasonImage } from './images';

/**
 * SPEC-FINAL 16.7: a missing image must fail loudly. The position picker and cycle-path
 * fields show an explicit error, never a blank canvas that quietly records meaningless
 * coordinates — every stored {x, y} is normalized against this exact image.
 */
export function FieldImage({
  path,
  alt,
  ...rest
}: { path: string; alt: string } & ImgHTMLAttributes<HTMLImageElement>) {
  if (!isKnownSeasonImage(path)) {
    return (
      <div role="alert" className="rounded-lg border border-[var(--danger)] p-4 text-sm">
        <p className="font-semibold">This season's game image is missing.</p>
        <p className="text-[var(--text-muted)]">
          The season points at <code>{path}</code>, which is not in this build. Commit it and
          redeploy the client. Field-position and cycle-path fields cannot be recorded until then.
        </p>
      </div>
    );
  }
  return <img src={imageUrlFor(path)} alt={alt} {...rest} />;
}
```

- [ ] **Step 4: Run and watch pass**

```bash
pnpm --filter @frc/client exec vitest run src/season && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task in the client; the server's season tests now pass their image-path cases.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add the season game-image pipeline with a fail-loud missing-image state"
```

---
# Phase 1 D — the form builder (§20.2.4)

---

## Task 1.24: Shared — the full field-type catalogue and its validator

**Files:**
- Modify: `packages/shared/src/forms/types.ts`, `packages/shared/src/forms/validate.ts`, `packages/shared/src/forms/validate.test.ts`
- Create: `packages/shared/src/forms/config.ts`, `packages/shared/src/forms/config.test.ts`

**Interfaces:**
- Produces: `FieldType` widened to the full SPEC-FINAL §5.2 catalogue — `counter · number · toggle · single_select · multi_select · rating · short_text · long_text · timer · event_log · position · cycle_path · computed · section`; `FIELD_TYPE_CONFIG` — one Zod schema per type's `config` (§5.3); `validateFieldDefinition(field)`; `validateEntryData` extended to every type.

**The three use-case-layer constraints of §3.3** are implemented here so both sides share them:
- `type !== 'section'` → `description`, `unit`, `phase` and `direction` are **required and non-empty**;
- `type === 'section'` → all seven semantic-metadata columns are null;
- `is_ordinal` is non-null **only** for `single_select` and `multi_select`.

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/forms/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FIELD_TYPES, validateFieldDefinition } from './config';
import type { FormFieldDefinition } from './types';

const field = (over: Partial<FormFieldDefinition>): FormFieldDefinition => ({
  id: 'f', key: 'k', label: 'L', help_text: null, type: 'counter', section: null,
  display_order: 1, required: false, default_value: null, config: {},
  visibility_condition: null, deprecated: false, description: 'what it means',
  unit: 'count', phase: 'auto', direction: 'higher_is_better', category: null,
  expected_range: null, include_in_ai_context: null, is_ordinal: null,
  ...over,
});

describe('the field-type catalogue (SPEC-FINAL 5.2)', () => {
  it('ships all fourteen types and no Photo field', () => {
    expect([...FIELD_TYPES]).toEqual([
      'counter', 'number', 'toggle', 'single_select', 'multi_select', 'rating',
      'short_text', 'long_text', 'timer', 'event_log', 'position', 'cycle_path',
      'computed', 'section',
    ]);
    expect(FIELD_TYPES).not.toContain('photo');
  });
});

describe('semantic metadata (SPEC-FINAL 3.3, 5.4)', () => {
  it('requires description, unit, phase and direction on every data field', () => {
    for (const missing of ['description', 'unit', 'phase', 'direction'] as const) {
      const issues = validateFieldDefinition(field({ [missing]: null }));
      expect(issues.map((i) => i.path), missing).toContain(missing);
    }
  });

  it('rejects an empty-string description as firmly as a null one', () => {
    expect(validateFieldDefinition(field({ description: '   ' }))).not.toEqual([]);
  });

  it('requires all seven semantic columns to be null on a section', () => {
    expect(validateFieldDefinition(field({ type: 'section', description: null, unit: null, phase: null, direction: null }))).toEqual([]);
    expect(validateFieldDefinition(field({ type: 'section', unit: 'count', description: null, phase: null, direction: null }))).not.toEqual([]);
  });

  it('allows is_ordinal only on the two select types', () => {
    const options = { options: [{ value: 'a', label: 'A' }] };
    expect(validateFieldDefinition(field({ type: 'single_select', unit: 'enum', is_ordinal: true, config: options }))).toEqual([]);
    expect(validateFieldDefinition(field({ type: 'multi_select', unit: 'enum', is_ordinal: false, config: options }))).toEqual([]);
    expect(validateFieldDefinition(field({ type: 'counter', is_ordinal: true }))).not.toEqual([]);
  });

  it('checks the per-type config shape of SPEC-FINAL 5.3', () => {
    expect(validateFieldDefinition(field({ type: 'rating', unit: 'count', config: { max: 5, style: 'stars' } }))).toEqual([]);
    expect(validateFieldDefinition(field({ type: 'rating', unit: 'count', config: { style: 'dial' } }))).not.toEqual([]);
    expect(validateFieldDefinition(field({ type: 'cycle_path', unit: 'coordinate', config: { max_points_per_cycle: 6, mirror_axis: 'horizontal' } }))).toEqual([]);
    expect(validateFieldDefinition(field({ type: 'position', unit: 'coordinate', config: { multi_point: true, mirror_axis: 'sideways' } }))).not.toEqual([]);
    expect(validateFieldDefinition(field({ type: 'timer', unit: 'seconds', config: { allow_unsure: true } }))).toEqual([]);
  });

  it('requires a non-empty option list on both select types', () => {
    expect(validateFieldDefinition(field({ type: 'single_select', unit: 'enum', is_ordinal: false, config: { options: [] } }))).not.toEqual([]);
  });

  it('refuses a key that is not a safe permanent identifier', () => {
    expect(validateFieldDefinition(field({ key: 'auto notes' }))).not.toEqual([]);
    expect(validateFieldDefinition(field({ key: 'auto_notes_2' }))).toEqual([]);
  });
});
```

Add to `packages/shared/src/forms/validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { FormFieldDefinition } from './types';
import { validateEntryData } from './validate';

const f = (over: Partial<FormFieldDefinition>): FormFieldDefinition => ({
  id: 'f', key: 'k', label: 'L', help_text: null, type: 'counter', section: null, display_order: 1,
  required: false, default_value: null, config: {}, visibility_condition: null, deprecated: false,
  description: 'x', unit: 'count', phase: 'auto', direction: 'neutral', category: null,
  expected_range: null, include_in_ai_context: null, is_ordinal: null, ...over,
});

const ok = (field: FormFieldDefinition, value: unknown) =>
  validateEntryData([field], 'played', { [field.key]: value }).ok;

describe('validateEntryData over the whole catalogue', () => {
  it('accepts a rating inside its configured max and rejects one above it', () => {
    const rating = f({ key: 'skill', type: 'rating', config: { max: 5, style: 'stars' } });
    expect(ok(rating, 4)).toBe(true);
    expect(ok(rating, 6)).toBe(false);
    expect(ok(rating, 0)).toBe(false);
  });

  it('accepts a timer as seconds, and accepts its absence when the scouter is unsure', () => {
    const timer = f({ key: 'climb_time', type: 'timer', unit: 'seconds', config: { allow_unsure: true } });
    expect(ok(timer, 12.5)).toBe(true);
    expect(ok(timer, -1)).toBe(false);
    expect(validateEntryData([timer], 'played', {}).ok).toBe(true);
  });

  it('accepts an event log as {type, t} taps with a known type, in ascending t', () => {
    const log = f({
      key: 'events', type: 'event_log', unit: 'count',
      config: { event_types: [{ value: 'score', label: 'Score' }, { value: 'miss', label: 'Miss' }] },
    });
    expect(ok(log, [{ type: 'score', t: 10 }, { type: 'miss', t: 20 }])).toBe(true);
    expect(ok(log, [{ type: 'score', t: 20 }, { type: 'score', t: 10 }])).toBe(false);
    expect(ok(log, [{ type: 'defence', t: 10 }])).toBe(false);
  });

  it('accepts a position as normalized {x, y} pairs inside 0..1', () => {
    const single = f({ key: 'shot', type: 'position', unit: 'coordinate', config: { multi_point: false, mirror_axis: 'horizontal' } });
    const many = f({ key: 'shots', type: 'position', unit: 'coordinate', config: { multi_point: true, mirror_axis: 'horizontal' } });
    expect(ok(single, { x: 0.25, y: 0.75 })).toBe(true);
    expect(ok(many, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(true);
    expect(ok(single, [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }])).toBe(false);
  });

  it('rejects a position outside 0..1, because coordinates are normalized to the image', () => {
    const point = f({ key: 'shot', type: 'position', unit: 'coordinate', config: { multi_point: false, mirror_axis: 'none' } });
    expect(ok(point, { x: 1.4, y: 0.5 })).toBe(false);
    expect(ok(point, { x: -0.1, y: 0.5 })).toBe(false);
  });

  it('accepts a cycle path as a list of cycles and caps points per cycle', () => {
    const path = f({ key: 'cycles', type: 'cycle_path', unit: 'coordinate', config: { max_points_per_cycle: 3, mirror_axis: 'none' } });
    expect(ok(path, [[{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }]])).toBe(true);
    expect(ok(path, [[{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }, { x: 0.4, y: 0.4 }]])).toBe(false);
  });

  it('accepts a computed key without validating it — the engine writes that value, never the scouter', () => {
    const computed = f({ key: 'total', type: 'computed', unit: 'points', config: { expression: null, result_type: 'float' }, required: true });
    expect(validateEntryData([computed], 'played', { total: 17 }).ok).toBe(true);
    expect(validateEntryData([computed], 'played', {}).ok).toBe(true);
  });

  it('ignores a section entirely — it holds no data and is never required', () => {
    const section = f({ key: 'auto_header', type: 'section', required: true, description: null, unit: null, phase: null, direction: null });
    expect(validateEntryData([section], 'played', {}).ok).toBe(true);
  });

  it('accepts a multi select whose values are all in the option list, and rejects one that is not', () => {
    const multi = f({
      key: 'defended', type: 'multi_select', unit: 'enum', is_ordinal: false,
      config: { options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
    });
    expect(ok(multi, ['a', 'b'])).toBe(true);
    expect(ok(multi, [])).toBe(true);
    expect(ok(multi, ['a', 'c'])).toBe(false);
  });
});
```


- [ ] **Step 2: Run and watch fail**

```bash
pnpm vitest run packages/shared/src/forms
```

Expected: `Failed to resolve import "./config"`.

- [ ] **Step 3: Implement**

`packages/shared/src/forms/config.ts`:

```ts
import { z } from 'zod';
import type { FormFieldDefinition } from './types';

export const FIELD_TYPES = [
  'counter', 'number', 'toggle', 'single_select', 'multi_select', 'rating',
  'short_text', 'long_text', 'timer', 'event_log', 'position', 'cycle_path',
  'computed', 'section',
] as const;

export type FieldTypeName = (typeof FIELD_TYPES)[number];

const option = z.object({ value: z.string().min(1), label: z.string().min(1) });
const mirrorAxis = z.enum(['none', 'horizontal', 'vertical', 'both']);
const numericRange = { min: z.number().optional(), max: z.number().optional(), step: z.number().positive().optional() };

/** SPEC-FINAL 5.3, one schema per type. */
export const FIELD_TYPE_CONFIG: Record<FieldTypeName, z.ZodType> = {
  counter: z.object(numericRange).strict(),
  number: z.object(numericRange).strict(),
  toggle: z.object({}).strict(),
  single_select: z.object({ options: z.array(option).min(1), is_ordinal: z.boolean().optional() }).strict(),
  multi_select: z.object({ options: z.array(option).min(1), is_ordinal: z.boolean().optional() }).strict(),
  rating: z.object({ max: z.number().int().positive().default(5), style: z.enum(['stars', 'slider']) }).strict(),
  short_text: z.object({ max_length: z.number().int().positive().optional() }).strict(),
  long_text: z.object({ max_length: z.number().int().positive().optional() }).strict(),
  // SPEC-FINAL 5.3: allow_unsure is "always true in v1", so it defaults to true and
  // cannot be set to false — but a field that omits it entirely is still valid.
  timer: z.object({ allow_unsure: z.literal(true).default(true) }).strict(),
  event_log: z.object({ event_types: z.array(option).min(1) }).strict(),
  position: z.object({ multi_point: z.boolean(), mirror_axis: mirrorAxis }).strict(),
  cycle_path: z.object({
    max_points_per_cycle: z.number().int().positive().default(6),
    mirror_axis: mirrorAxis,
  }).strict(),
  computed: z.object({ expression: z.unknown(), result_type: z.enum(['float', 'string']) }).strict(),
  section: z.object({}).strict(),
};

export type DefinitionIssue = { path: string; message: string };

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;
const SEMANTIC_COLUMNS = [
  'description', 'unit', 'phase', 'direction', 'category', 'expected_range', 'include_in_ai_context',
] as const;

const blank = (value: unknown): boolean =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

/**
 * The three constraints SPEC-FINAL 3.3 leaves to the use-case layer, because they
 * depend on the field's type. Both the server and the builder call this, so a rule
 * cannot drift between them.
 */
export function validateFieldDefinition(field: FormFieldDefinition): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];

  if (!KEY_PATTERN.test(field.key)) {
    issues.push({
      path: 'key',
      message: 'a key is permanent: lowercase letters, digits and underscores, starting with a letter',
    });
  }

  if (field.type === 'section') {
    for (const column of SEMANTIC_COLUMNS) {
      if (field[column] !== null && field[column] !== undefined) {
        issues.push({ path: column, message: 'a section holds no data and carries no semantic metadata' });
      }
    }
  } else {
    for (const required of ['description', 'unit', 'phase', 'direction'] as const) {
      if (blank(field[required])) {
        issues.push({
          path: required,
          message: `${required} is required on every data field and cannot be backfilled later`,
        });
      }
    }
  }

  const ordinalAllowed = field.type === 'single_select' || field.type === 'multi_select';
  if (!ordinalAllowed && field.is_ordinal !== null && field.is_ordinal !== undefined) {
    issues.push({ path: 'is_ordinal', message: 'is_ordinal applies only to single and multi select' });
  }

  const schema = FIELD_TYPE_CONFIG[field.type as FieldTypeName];
  if (!schema) {
    issues.push({ path: 'type', message: `unknown field type '${field.type}'` });
  } else {
    const parsed = schema.safeParse(field.config);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({ path: `config.${issue.path.join('.')}`, message: issue.message });
      }
    }
  }

  return issues;
}
```

`packages/shared/src/forms/types.ts`: replace the four-member `FieldType` with `export type FieldType = FieldTypeName;` re-exported from `./config`, and add the payload shapes:

```ts
export type EventLogTap = { type: string; t: number };
export type Point = { x: number; y: number };
export type CyclePath = Point[];
```

`packages/shared/src/forms/validate.ts`: extend the `switch` with the ten new cases. The rules that are not obvious:

```ts
      case 'number': // identical to counter, including the 15.1 expected_range block
      case 'rating': {
        const max = typeof field.config.max === 'number' ? field.config.max : 5;
        if (typeof value !== 'number' || value < 1 || value > max) { /* wrong-type */ }
        break;
      }
      case 'timer': {
        // Nullable via the "unsure — no time" toggle: it submits no value rather than a
        // wrong number (SPEC-FINAL 5.2). A null arrives as an absent key and is handled
        // by the `missing` branch above.
        if (typeof value !== 'number' || value < 0) { /* wrong-type */ }
        break;
      }
      case 'event_log': {
        const allowed = new Set((field.config.event_types as SelectOption[] ?? []).map((o) => o.value));
        if (!Array.isArray(value)) { /* wrong-type */ break; }
        let previous = -Infinity;
        for (const tap of value as EventLogTap[]) {
          if (!allowed.has(tap.type) || typeof tap.t !== 'number' || tap.t < previous) { /* wrong-type */ }
          previous = tap.t;
        }
        break;
      }
      case 'position': {
        const points = Array.isArray(value) ? (value as Point[]) : [value as Point];
        if (points.some((p) => !inUnitSquare(p))) { /* wrong-type: coordinates are normalized 0..1 */ }
        if (field.config.multi_point !== true && points.length > 1) { /* wrong-type */ }
        break;
      }
      case 'cycle_path': {
        const cap = typeof field.config.max_points_per_cycle === 'number' ? field.config.max_points_per_cycle : 6;
        const cycles = value as CyclePath[];
        if (!Array.isArray(cycles) || cycles.some((c) => c.length > cap || c.some((p) => !inUnitSquare(p)))) {
          /* wrong-type */
        }
        break;
      }
      case 'computed':
      case 'section':
        break; // computed values are written by the engine; a section holds no data
```

`validateEntryData` also **skips `computed` and `section` in the required check**, and `unknown-field` no longer fires for a computed key present in `data` (the client writes it at submit time — §5.7).

- [ ] **Step 4: Run and watch pass**

```bash
pnpm vitest run packages/shared && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): widen the field catalogue to all fourteen types with per-type config rules"
```

---

## Task 1.25: Shared — computed-field expressions

**Files:**
- Create: `packages/shared/src/forms/expression.ts`, `packages/shared/src/forms/expression.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `type Expr`, `exprSchema`, `evaluateExpr(expr, values): number | string | null`, `validateExpr(expr, fields): DefinitionIssue[]`.

**Rules (SPEC-FINAL §5.7).** A small typed tree, not free text. `result_type` is `float` or `string`. **Operands must be the same type** — numeric operands take `+ - * /`, string operands take `concat` only; mixing is a builder-time validation error. **Division by zero yields `null`, and a null operand propagates.** A computed field **may not reference another computed field** and may not reference a field from another form. Computed fields are **not scored**.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/forms/expression.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Expr } from './expression';
import { evaluateExpr, exprSchema, validateExpr } from './expression';
import type { FormFieldDefinition } from './types';

const f = (key: string, type: FormFieldDefinition['type'], unit: FormFieldDefinition['unit']): FormFieldDefinition => ({
  id: key, key, label: key, help_text: null, type, section: null, display_order: 1, required: false,
  default_value: null, config: type === 'computed' ? { expression: null, result_type: 'float' } : {},
  visibility_condition: null, deprecated: false, description: 'x', unit, phase: 'auto',
  direction: 'neutral', category: null, expected_range: null, include_in_ai_context: null, is_ordinal: null,
});

const fields = [f('auto', 'counter', 'count'), f('teleop', 'counter', 'count'), f('note', 'short_text', 'text'), f('derived', 'computed', 'count')];

const add: Expr = { kind: 'op', op: '+', left: { kind: 'field', key: 'auto' }, right: { kind: 'field', key: 'teleop' } };

describe('computed expressions (SPEC-FINAL 5.7)', () => {
  it('parses the three node kinds and nothing else', () => {
    expect(exprSchema.safeParse(add).success).toBe(true);
    expect(exprSchema.safeParse({ kind: 'call', fn: 'sqrt' }).success).toBe(false);
  });

  it('evaluates arithmetic over field values', () => {
    expect(evaluateExpr(add, { auto: 3, teleop: 4 })).toBe(7);
  });

  it('concatenates strings', () => {
    const expr: Expr = { kind: 'op', op: 'concat', left: { kind: 'field', key: 'note' }, right: { kind: 'literal', value: '!' } };
    expect(evaluateExpr(expr, { note: 'ok' })).toBe('ok!');
  });

  it('yields null on division by zero', () => {
    const expr: Expr = { kind: 'op', op: '/', left: { kind: 'field', key: 'auto' }, right: { kind: 'field', key: 'teleop' } };
    expect(evaluateExpr(expr, { auto: 5, teleop: 0 })).toBeNull();
  });

  it('propagates a null operand through the whole expression', () => {
    expect(evaluateExpr(add, { auto: 3 })).toBeNull();
    const nested: Expr = { kind: 'op', op: '*', left: add, right: { kind: 'literal', value: 2 } };
    expect(evaluateExpr(nested, { auto: 3 })).toBeNull();
  });

  it('refuses mixed operand types at build time', () => {
    const mixed: Expr = { kind: 'op', op: '+', left: { kind: 'field', key: 'auto' }, right: { kind: 'field', key: 'note' } };
    expect(validateExpr(mixed, fields)).not.toEqual([]);
  });

  it('refuses concat on numbers and arithmetic on strings', () => {
    const badConcat: Expr = { kind: 'op', op: 'concat', left: { kind: 'field', key: 'auto' }, right: { kind: 'field', key: 'teleop' } };
    const badMath: Expr = { kind: 'op', op: '-', left: { kind: 'field', key: 'note' }, right: { kind: 'literal', value: 'x' } };
    expect(validateExpr(badConcat, fields)).not.toEqual([]);
    expect(validateExpr(badMath, fields)).not.toEqual([]);
  });

  it('refuses a reference to another computed field — no chaining in v1', () => {
    const chained: Expr = { kind: 'op', op: '+', left: { kind: 'field', key: 'derived' }, right: { kind: 'literal', value: 1 } };
    expect(validateExpr(chained, fields)[0]?.message).toMatch(/another computed field/i);
  });

  it('refuses a reference to a key that is not in this form', () => {
    const stranger: Expr = { kind: 'field', key: 'from_another_form' };
    expect(validateExpr(stranger, fields)).not.toEqual([]);
  });

  it('accepts a valid expression', () => {
    expect(validateExpr(add, fields)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and watch fail, then implement**

```bash
pnpm vitest run packages/shared/src/forms/expression.test.ts
```

`packages/shared/src/forms/expression.ts`:

```ts
import { z } from 'zod';
import type { DefinitionIssue } from './config';
import type { FormFieldDefinition } from './types';

export type Expr =
  | { kind: 'field'; key: string }
  | { kind: 'literal'; value: number | string }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' | 'concat'; left: Expr; right: Expr };

export const exprSchema: z.ZodType<Expr> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal('field'), key: z.string().min(1) }).strict(),
    z.object({ kind: z.literal('literal'), value: z.union([z.number(), z.string()]) }).strict(),
    z.object({
      kind: z.literal('op'),
      op: z.enum(['+', '-', '*', '/', 'concat']),
      left: exprSchema,
      right: exprSchema,
    }).strict(),
  ]),
);

export type ExprValue = number | string | null;

/** SPEC-FINAL 5.7. Division by zero yields null, and a null operand propagates. */
export function evaluateExpr(expr: Expr, values: Record<string, unknown>): ExprValue {
  switch (expr.kind) {
    case 'literal':
      return expr.value;
    case 'field': {
      const value = values[expr.key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') return value;
      return null;
    }
    case 'op': {
      const left = evaluateExpr(expr.left, values);
      const right = evaluateExpr(expr.right, values);
      if (left === null || right === null) return null;

      if (expr.op === 'concat') {
        if (typeof left !== 'string' || typeof right !== 'string') return null;
        return left + right;
      }
      if (typeof left !== 'number' || typeof right !== 'number') return null;
      switch (expr.op) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return right === 0 ? null : left / right;
      }
    }
  }
}

const NUMERIC_UNITS = new Set(['count', 'seconds', 'points']);

function staticType(expr: Expr, byKey: Map<string, FormFieldDefinition>): 'float' | 'string' | 'invalid' {
  switch (expr.kind) {
    case 'literal':
      return typeof expr.value === 'number' ? 'float' : 'string';
    case 'field': {
      const field = byKey.get(expr.key);
      if (!field) return 'invalid';
      if (field.type === 'computed') return 'invalid';
      if (field.type === 'toggle') return 'float';
      return NUMERIC_UNITS.has(field.unit ?? '') ? 'float' : 'string';
    }
    case 'op': {
      const left = staticType(expr.left, byKey);
      const right = staticType(expr.right, byKey);
      if (left === 'invalid' || right === 'invalid' || left !== right) return 'invalid';
      if (expr.op === 'concat') return left === 'string' ? 'string' : 'invalid';
      return left === 'float' ? 'float' : 'invalid';
    }
  }
}

export function validateExpr(expr: Expr, fields: FormFieldDefinition[]): DefinitionIssue[] {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const issues: DefinitionIssue[] = [];

  const walk = (node: Expr): void => {
    if (node.kind === 'field') {
      const field = byKey.get(node.key);
      if (!field) {
        issues.push({ path: 'expression', message: `'${node.key}' is not a field on this form` });
      } else if (field.type === 'computed') {
        issues.push({
          path: 'expression',
          message: `a computed field may not reference another computed field ('${node.key}')`,
        });
      }
    }
    if (node.kind === 'op') {
      walk(node.left);
      walk(node.right);
    }
  };
  walk(expr);

  if (issues.length === 0 && staticType(expr, byKey) === 'invalid') {
    issues.push({
      path: 'expression',
      message: 'operands must be the same type: numbers take + − × ÷, strings take concat',
    });
  }
  return issues;
}
```

- [ ] **Step 3: Run and watch pass, then commit**

```bash
pnpm vitest run packages/shared && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(shared): add the typed computed-field expression tree and evaluator"
```

---

## Task 1.26: Shared — conditional field visibility

**Files:**
- Create: `packages/shared/src/forms/visibility.ts`, `packages/shared/src/forms/visibility.test.ts`

**Interfaces:**
- Produces: `isVisible(field, values): boolean`; `visibleFields(fields, values): FormFieldDefinition[]`.

**Rules (SPEC-FINAL §5.8).** Simple rules only: *show this field if `<field_key> <op> <value>`*, `op ∈ { =, ≠, >, <, ≥, ≤ }`. **One condition per field.** Not a general expression language. **A hidden field records no value.**

- [ ] **Step 1: Write the failing test**

`packages/shared/src/forms/visibility.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { FormFieldDefinition } from './types';
import { isVisible, visibleFields } from './visibility';

const base: FormFieldDefinition = {
  id: 'f', key: 'k', label: 'L', help_text: null, type: 'counter', section: null, display_order: 1,
  required: false, default_value: null, config: {}, visibility_condition: null, deprecated: false,
  description: 'x', unit: 'count', phase: 'auto', direction: 'neutral', category: null,
  expected_range: null, include_in_ai_context: null, is_ordinal: null,
};

describe('conditional visibility (SPEC-FINAL 5.8)', () => {
  it('shows a field with no condition', () => {
    expect(isVisible(base, {})).toBe(true);
  });

  it('applies every one of the six operators', () => {
    const cases: [FormFieldDefinition['visibility_condition'], Record<string, unknown>, boolean][] = [
      [{ field_key: 'climbed', op: '=', value: true }, { climbed: true }, true],
      [{ field_key: 'climbed', op: '=', value: true }, { climbed: false }, false],
      [{ field_key: 'climbed', op: '!=', value: true }, { climbed: false }, true],
      [{ field_key: 'notes', op: '>', value: 3 }, { notes: 4 }, true],
      [{ field_key: 'notes', op: '<', value: 3 }, { notes: 4 }, false],
      [{ field_key: 'notes', op: '>=', value: 4 }, { notes: 4 }, true],
      [{ field_key: 'notes', op: '<=', value: 4 }, { notes: 4 }, true],
    ];
    for (const [condition, values, expected] of cases) {
      expect(isVisible({ ...base, visibility_condition: condition }, values), JSON.stringify(condition)).toBe(expected);
    }
  });

  it('hides a field whose controlling value is absent', () => {
    expect(isVisible({ ...base, visibility_condition: { field_key: 'climbed', op: '=', value: true } }, {})).toBe(false);
  });

  it('strips the values of hidden fields, because a hidden field records no value', () => {
    const fields = [
      { ...base, key: 'climbed', type: 'toggle' as const, unit: 'boolean' as const },
      { ...base, key: 'climb_time', visibility_condition: { field_key: 'climbed', op: '=' as const, value: true } },
    ];
    const shown = visibleFields(fields, { climbed: false, climb_time: 12 });
    expect(shown.map((f) => f.key)).toEqual(['climbed']);
  });

  it('never treats a condition as a chain — one condition per field', () => {
    const fields = [
      { ...base, key: 'a', type: 'toggle' as const, unit: 'boolean' as const },
      { ...base, key: 'b', visibility_condition: { field_key: 'a', op: '=' as const, value: true } },
      { ...base, key: 'c', visibility_condition: { field_key: 'b', op: '>' as const, value: 0 } },
    ];
    // b is hidden, but c is judged only on b's raw value, not on b's visibility.
    expect(visibleFields(fields, { a: false, b: 5 }).map((f) => f.key)).toEqual(['a', 'c']);
  });
});
```

- [ ] **Step 2: Run and watch fail, then implement**

```ts
import type { FormFieldDefinition, VisibilityCondition } from './types';

function compare(left: unknown, op: VisibilityCondition['op'], right: unknown): boolean {
  switch (op) {
    case '=': return left === right;
    case '!=': return left !== right;
    default: {
      if (typeof left !== 'number' || typeof right !== 'number') return false;
      switch (op) {
        case '>': return left > right;
        case '<': return left < right;
        case '>=': return left >= right;
        case '<=': return left <= right;
      }
    }
  }
}

/** SPEC-FINAL 5.8: one condition per field, never a general expression language. */
export function isVisible(field: FormFieldDefinition, values: Record<string, unknown>): boolean {
  const condition = field.visibility_condition;
  if (!condition) return true;
  const controlling = values[condition.field_key];
  if (controlling === undefined) return false;
  return compare(controlling, condition.op, condition.value);
}

export function visibleFields(
  fields: FormFieldDefinition[],
  values: Record<string, unknown>,
): FormFieldDefinition[] {
  return fields.filter((field) => isVisible(field, values));
}
```

- [ ] **Step 3: Run, then commit**

```bash
pnpm vitest run packages/shared && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(shared): add conditional field visibility"
```

---
## Task 1.27: Server — form and form-version use cases

**Files:**
- Create: `apps/server/src/core/commands/forms.ts`, `apps/server/src/core/commands/forms.test.ts`
- Modify: `apps/server/src/repos/store.ts`, `apps/server/src/routes/registry.ts`, `apps/server/src/test/fake-context.ts`

**Interfaces:**
- Produces: `createForm`, `updateForm` (the in-place edits), `saveDraftFields`, `publishFormVersion`, `restoreFormVersion`, `deleteFormVersion`, `deleteForm`, `importForm`, `exportForm`.

**The versioning rules, exactly (SPEC-FINAL §5.1, §3.3).**
- A new version is created **only by a structural change**: adding a field, removing/deprecating a field, or changing a field's **type**.
- These are **in-place edits that create no version**: `label`, help text, `min`/`max`/`step`, `expected_range`, display order, section, semantic metadata, scoring, and `timer_config`. A range change applies to new entries only and never retroactively invalidates data already collected.
- **Field keys are permanent.** A rename attempt is an error, not a silent new field.
- A version is created as a **draft** (`published_at is null`) and edited freely. **Publishing** stamps `published_at` and, if it is the newest version, points `forms.active_version_id` at it.
- A version becomes **locked** the moment the first entry binds to it; a locked version's field **structure** can never change again — a structural edit **forks a new draft version** instead.
- `restoreFormVersion` points `active_version_id` at an older published version **without creating a new one**.
- **Deleting a single form version that has entries bound to it is blocked**, and no confirmation text overrides it. Deleting the whole form is an admin cascade that takes its entries with it (task 1.60).
- **Offline form editing is not allowed**; all of these are admin-only, online-only use cases.

- [ ] **Step 1: Write the failing test**

`apps/server/src/core/commands/forms.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '@frc/shared';
import {
  createForm, deleteFormVersion, exportForm, importForm, publishFormVersion,
  restoreFormVersion, saveDraftFields, updateForm,
} from './forms';
import { makeFakeContext, type FakeContext } from '../../test/fake-context';

const admin: Caller = { kind: 'user', userId: 'u-a', role: 'admin' };
const lead: Caller = { kind: 'user', userId: 'u-l', role: 'lead' };

const counter = (key: string, over: Record<string, unknown> = {}) => ({
  key, label: key, type: 'counter', display_order: 1, required: false,
  config: { min: 0, max: 10, step: 1 }, description: 'x', unit: 'count',
  phase: 'auto', direction: 'higher_is_better', ...over,
});

let ctx: FakeContext;
let formId: string;
let draftId: string;

beforeEach(async () => {
  ctx = makeFakeContext();
  const form = await createForm(admin, { season_id: 'se-1', kind: 'match', name: 'Match' }, ctx);
  formId = form.id;
  draftId = form.draft_version_id;
});

describe('form versioning (SPEC-FINAL 5.1)', () => {
  it('creates a form with an empty draft version 1 and no active version yet', () => {
    expect(ctx.forms.get(formId)!.active_version_id).toBeNull();
    expect(ctx.formVersions.get(draftId)!.published_at).toBeNull();
  });

  it('refuses everything here to a lead', async () => {
    await expect(createForm(lead, { season_id: 'se-1', kind: 'super', name: 'S' }, ctx)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(saveDraftFields(lead, { form_version_id: draftId, fields: [] }, ctx)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(publishFormVersion(lead, { form_version_id: draftId }, ctx)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('publishes a draft and points the form at it', async () => {
    await saveDraftFields(admin, { form_version_id: draftId, fields: [counter('auto_notes')] }, ctx);
    await publishFormVersion(admin, { form_version_id: draftId }, ctx);
    expect(ctx.formVersions.get(draftId)!.published_at).not.toBeNull();
    expect(ctx.forms.get(formId)!.active_version_id).toBe(draftId);
  });

  it('refuses to publish a version whose fields fail the semantic-metadata rule', async () => {
    await expect(
      saveDraftFields(admin, { form_version_id: draftId, fields: [counter('bad', { description: '' })] }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('accepts an in-place label, help-text, range and metadata edit on a LOCKED version with no new version', async () => {
    await saveDraftFields(admin, { form_version_id: draftId, fields: [counter('auto_notes')] }, ctx);
    await publishFormVersion(admin, { form_version_id: draftId }, ctx);
    ctx.formVersions.get(draftId)!.is_locked = true;

    const result = await saveDraftFields(admin, {
      form_version_id: draftId,
      fields: [counter('auto_notes', {
        label: 'הערות אוטונומי', help_text: 'תספור', config: { min: 0, max: 20, step: 1 },
        expected_range: { min: 0, max: 20 }, display_order: 3, section: 'Auto', category: 'scoring',
      })],
    }, ctx);

    expect(result.new_version_id).toBeNull();
    expect(ctx.formFields.get(`${draftId}:auto_notes`)!.label).toBe('הערות אוטונומי');
    expect(ctx.formVersions.size).toBe(1);
  });

  it('forks a new draft version when a field is ADDED to a locked version', async () => {
    await saveDraftFields(admin, { form_version_id: draftId, fields: [counter('auto_notes')] }, ctx);
    await publishFormVersion(admin, { form_version_id: draftId }, ctx);
    ctx.formVersions.get(draftId)!.is_locked = true;

    const result = await saveDraftFields(admin, {
      form_version_id: draftId,
      fields: [counter('auto_notes'), counter('teleop_notes', { phase: 'teleop', display_order: 2 })],
    }, ctx);

    expect(result.new_version_id).not.toBeNull();
    expect(ctx.formVersions.get(result.new_version_id!)!.published_at).toBeNull();
    expect(ctx.formVersions.get(result.new_version_id!)!.version_no).toBe(2);
  });

  it('forks a new draft version when a field TYPE changes on a locked version', async () => {
    await saveDraftFields(admin, { form_version_id: draftId, fields: [counter('auto_notes')] }, ctx);
    await publishFormVersion(admin, { form_version_id: draftId }, ctx);
    ctx.formVersions.get(draftId)!.is_locked = true;

    const result = await saveDraftFields(admin, {
      form_version_id: draftId,
      fields: [counter('auto_notes', { type: 'number' })],
    }, ctx);
    expect(result.new_version_id).not.toBeNull();
  });

  it('marks a removed field deprecated in the new version instead of dropping it', async () => {
    await saveDraftFields(admin, { form_version_id: draftId, fields: [counter('a'), counter('b', { display_order: 2 })] }, ctx);
    await publishFormVersion(admin, { form_version_id: draftId }, ctx);
    ctx.formVersions.get(draftId)!.is_locked = true;

    const result = await saveDraftFields(admin, { form_version_id: draftId, fields: [counter('a')] }, ctx);
    const carried = ctx.formFields.get(`${result.new_version_id}:b`)!;
    expect(carried.deprecated).toBe(true);
  });

  it('never renames a key — it is an error, not a silent new field', async () => {
    await saveDraftFields(admin, { form_version_id: draftId, fields: [counter('auto_notes')] }, ctx);
    await expect(
      saveDraftFields(admin, { form_version_id: draftId, fields: [counter('AUTO NOTES')] }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('restores an older published version without creating a new one', async () => {
    await saveDraftFields(admin, { form_version_id: draftId, fields: [counter('a')] }, ctx);
    await publishFormVersion(admin, { form_version_id: draftId }, ctx);
    ctx.formVersions.get(draftId)!.is_locked = true;
    const forked = await saveDraftFields(admin, { form_version_id: draftId, fields: [counter('a'), counter('b', { display_order: 2 })] }, ctx);
    await publishFormVersion(admin, { form_version_id: forked.new_version_id! }, ctx);

    const before = ctx.formVersions.size;
    await restoreFormVersion(admin, { form_version_id: draftId }, ctx);
    expect(ctx.forms.get(formId)!.active_version_id).toBe(draftId);
    expect(ctx.formVersions.size).toBe(before);
  });

  it('blocks deleting a version that has entries bound to it, and says why', async () => {
    ctx.entryCountsByVersion.set(draftId, 4);
    await expect(deleteFormVersion(admin, { form_version_id: draftId }, ctx)).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(deleteFormVersion(admin, { form_version_id: draftId }, ctx)).rejects.toThrow(/4 entries/);
  });

  it('edits timer_config in place, creating no version', async () => {
    await updateForm(admin, {
      form_id: formId,
      timer_config: { phases: [{ phase: 'auto', seconds: 15 }, { phase: 'teleop', seconds: 135 }] },
    }, ctx);
    expect((ctx.forms.get(formId)!.timer_config as { phases: unknown[] }).phases).toHaveLength(2);
    expect(ctx.formVersions.size).toBe(1);
  });

  it('round-trips a form definition through export and import as JSON', async () => {
    await saveDraftFields(admin, { form_version_id: draftId, fields: [counter('auto_notes')] }, ctx);
    await publishFormVersion(admin, { form_version_id: draftId }, ctx);
    const json = await exportForm(admin, { form_id: formId }, ctx);

    const imported = await importForm(admin, { season_id: 'se-2', definition: json }, ctx);
    const exportedAgain = await exportForm(admin, { form_id: imported.id }, ctx);
    expect(exportedAgain.fields).toEqual(json.fields);
    expect(exportedAgain.timer_config).toEqual(json.timer_config);
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
pnpm --filter @frc/server exec vitest run src/core/commands/forms.test.ts
```

Expected: `Failed to resolve import "./forms"`.

- [ ] **Step 3: Implement**

The heart of the task is one pure function that decides whether a save is structural, and it is worth reading twice:

```ts
import { validateFieldDefinition, type FormFieldDefinition } from '@frc/shared';

export type FieldDraft = Omit<FormFieldDefinition, 'id'>;

/**
 * SPEC-FINAL 5.1. A new version is created ONLY by a structural change: adding a field,
 * removing (deprecating) a field, or changing a field's type. Everything else — label,
 * help text, min/max/step, expected_range, display order, section, semantic metadata,
 * scoring, timer_config — is an in-place edit that creates no version.
 */
export function isStructuralChange(
  current: FormFieldDefinition[],
  next: FieldDraft[],
): boolean {
  const currentLive = current.filter((f) => !f.deprecated);
  const currentByKey = new Map(currentLive.map((f) => [f.key, f]));
  const nextKeys = new Set(next.map((f) => f.key));

  for (const field of next) {
    const existing = currentByKey.get(field.key);
    if (!existing) return true;                 // a field was added
    if (existing.type !== field.type) return true; // a field's type changed
  }
  for (const field of currentLive) {
    if (!nextKeys.has(field.key)) return true;  // a field was removed
  }
  return false;
}
```

`saveDraftFields` then reads:

1. `assertCan(caller, 'manage_forms')`.
2. Validate every field with `validateFieldDefinition`; any issue → `AppError('invalid', …)` listing them.
3. Reject a key that is not in the current version **and** collides with a deprecated key from an earlier version, because keys are permanent across the whole form.
4. Load the target version. If it is **not locked**, write the fields in place and return `{ new_version_id: null }`.
5. If it **is locked** and `isStructuralChange` is false, write the in-place columns only (`label`, `help_text`, `config`, `expected_range`, `display_order`, `section`, `description`, `unit`, `phase`, `direction`, `category`, `include_in_ai_context`, `is_ordinal`, `required`, `default_value`, `visibility_condition`) and return `{ new_version_id: null }`.
6. If it is locked and the change **is** structural, create version `max(version_no) + 1` as a **draft**, copy every field of the locked version into it, apply the new field set, **mark every carried-over field that is absent from the new set `deprecated: true`**, and return its id.

`publishFormVersion` stamps `published_at = now()` and, when the version is the newest by `version_no`, sets `forms.active_version_id`. `restoreFormVersion` refuses an unpublished version and otherwise only moves the pointer. `deleteFormVersion` counts bound entries first and throws `AppError('invalid', "this version has 4 entries bound to it and cannot be deleted; delete the form to remove them, or leave it")`. `exportForm` / `importForm` serialise `{ kind, name, timer_config, fields, scoring_rules }` — no ids, no season, so a definition is portable.

- [ ] **Step 4: Run and watch pass, then commit**

```bash
pnpm --filter @frc/server exec vitest run && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(server): add form versioning with the structural-change rule and JSON export/import"
```

---

## Task 1.28: Server — scoring rules and the form read queries

**Files:**
- Create: `apps/server/src/core/commands/scoring.ts`, `apps/server/src/core/commands/scoring.test.ts`
- Create: `apps/server/src/core/queries/forms.ts`, `apps/server/src/core/queries/forms.test.ts`
- Modify: `apps/server/src/routes/registry.ts`

**Interfaces:**
- Produces: `setScoringRules`; `getForm`, `getFormVersion`, `getFormDictionary`.

**Rules (SPEC-FINAL §3.4, §4.1, §4.2).** Scoring is keyed by **`(form_id, field_key)`**, not by version, because field keys are permanent — editing a field carries its scoring across versions automatically. **Points are non-negative**; penalties and fouls are recorded as data but never subtracted. Only these types are scored: toggle (`points` if true), counter and number (`points` × value), single select (`option_points[selected]`), multi select (Σ `option_points[each selected]`). **Everything else holds no `scoring_rules` row.** Saving a scoring change **does not touch `form_versions`**.

`getFormDictionary` is the machine-readable field dictionary (§16.8's obligation 1): for each live field, its key, label, type, unit, phase, direction, category, expected range, `include_in_ai_context`, option list and points.

- [ ] **Step 1: Write the failing test**

`apps/server/src/core/commands/scoring.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '@frc/shared';
import { setScoringRules } from './scoring';
import { makeFakeContext, type FakeContext } from '../../test/fake-context';

const admin: Caller = { kind: 'user', userId: 'u-a', role: 'admin' };
const lead: Caller = { kind: 'user', userId: 'u-l', role: 'lead' };

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
  ctx.formFields.set('fv-1:auto_notes', { key: 'auto_notes', type: 'counter', form_version_id: 'fv-1' } as never);
  ctx.formFields.set('fv-1:climb', { key: 'climb', type: 'single_select', form_version_id: 'fv-1',
    config: { options: [{ value: 'none', label: 'None' }, { value: 'high', label: 'High' }] } } as never);
  ctx.formFields.set('fv-1:notes', { key: 'notes', type: 'long_text', form_version_id: 'fv-1' } as never);
  ctx.forms.set('f-1', { id: 'f-1', season_id: 'se-1', kind: 'match', active_version_id: 'fv-1', timer_config: { phases: [] } } as never);
});

describe('setScoringRules (SPEC-FINAL 4.1)', () => {
  it('stores points per unit for a counter', async () => {
    await setScoringRules(admin, { form_id: 'f-1', rules: [{ field_key: 'auto_notes', points: 5 }] }, ctx);
    expect(ctx.scoringRules.get('f-1:auto_notes')!.points).toBe(5);
  });

  it('stores option points for a select', async () => {
    await setScoringRules(admin, {
      form_id: 'f-1',
      rules: [{ field_key: 'climb', points: 0, option_points: { none: 0, high: 10 } }],
    }, ctx);
    expect(ctx.scoringRules.get('f-1:climb')!.option_points).toEqual({ none: 0, high: 10 });
  });

  it('refuses negative points anywhere', async () => {
    await expect(setScoringRules(admin, { form_id: 'f-1', rules: [{ field_key: 'auto_notes', points: -1 }] }, ctx))
      .rejects.toMatchObject({ code: 'invalid' });
    await expect(setScoringRules(admin, { form_id: 'f-1', rules: [{ field_key: 'climb', points: 0, option_points: { high: -2 } }] }, ctx))
      .rejects.toMatchObject({ code: 'invalid' });
  });

  it('refuses a rule on an unscorable type', async () => {
    await expect(setScoringRules(admin, { form_id: 'f-1', rules: [{ field_key: 'notes', points: 1 }] }, ctx))
      .rejects.toThrow(/long_text/);
  });

  it('refuses an option that is not in the field option list', async () => {
    await expect(setScoringRules(admin, { form_id: 'f-1', rules: [{ field_key: 'climb', points: 0, option_points: { moon: 5 } }] }, ctx))
      .rejects.toThrow(/moon/);
  });

  it('does not touch form_versions — a scoring change never creates a version', async () => {
    const before = ctx.formVersionWrites;
    await setScoringRules(admin, { form_id: 'f-1', rules: [{ field_key: 'auto_notes', points: 5 }] }, ctx);
    expect(ctx.formVersionWrites).toBe(before);
  });

  it('is keyed by (form_id, field_key), so it carries across versions', async () => {
    await setScoringRules(admin, { form_id: 'f-1', rules: [{ field_key: 'auto_notes', points: 5 }] }, ctx);
    expect([...ctx.scoringRules.keys()]).toEqual(['f-1:auto_notes']);
  });

  it('refuses a lead', async () => {
    await expect(setScoringRules(lead, { form_id: 'f-1', rules: [] }, ctx)).rejects.toMatchObject({ code: 'forbidden' });
  });
});
```

`apps/server/src/core/queries/forms.test.ts` asserts that `getFormVersion` returns the fields in `display_order` with their scoring attached; that a `service` caller may call all three; and that `getFormDictionary` returns one row per live field carrying key, label, type, unit, phase, direction, category, expected range, `include_in_ai_context`, options and points — and **excludes deprecated fields**.

- [ ] **Step 2: Run, implement, re-run, commit**

```bash
pnpm --filter @frc/server exec vitest run && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(server): add the scoring-model editor and the form read queries"
```

---

## Task 1.29: Client — the form builder shell

**Files:**
- Create: `apps/client/src/features/builder/BuilderPage.tsx`, `apps/client/src/features/builder/FieldPalette.tsx`, `apps/client/src/features/builder/BuilderCanvas.tsx`, `apps/client/src/features/builder/useBuilderState.ts`
- Create: `packages/shared/src/forms/version.ts` — `isStructuralChange`, **moved** out of `apps/server/src/core/commands/forms.ts`
- Modify: `apps/server/src/core/commands/forms.ts` (import it from `@frc/shared` instead of defining it), `packages/shared/src/index.ts`
- Create: `apps/client/src/features/builder/BuilderPage.test.tsx`, `apps/client/src/features/builder/useBuilderState.test.ts`
- Modify: `apps/client/src/routes.tsx`, `apps/client/package.json` (add `"@dnd-kit/core": "^6.1.0"`, `"@dnd-kit/sortable": "^9.0.0"`)

**Interfaces:**
- Produces: `<BuilderPage formId>` at `/admin/forms/:formId`, wrapped in `<DesktopOnly what="the form builder">`; `useBuilderState` — the local edit model with `addField`, `selectField`, `updateField`, `reorder`, `removeField`, `dirty`, `save`.

**Layout (SPEC-FINAL §5.9, §17.9).** Three panes: **field palette** (the type catalogue, dragged onto the canvas) → **canvas** (the ordered field list, drag-reorderable, grouped by section) → **settings pane** (task 1.30). Plus a live preview at phone width, a raw-JSON editor behind an "advanced" toggle, and export/import (task 1.31).

- [ ] **Step 1: Write the failing test**

`apps/client/src/features/builder/useBuilderState.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBuilderState } from './useBuilderState';

const initial = {
  form_id: 'f-1', version_id: 'fv-1', is_locked: false,
  timer_config: { phases: [] },
  fields: [
    { id: 'a', key: 'auto_notes', label: 'Auto notes', type: 'counter', display_order: 1, required: false, config: {}, section: null, help_text: null, default_value: null, visibility_condition: null, deprecated: false, description: 'x', unit: 'count', phase: 'auto', direction: 'higher_is_better', category: null, expected_range: null, include_in_ai_context: null, is_ordinal: null },
  ],
};

describe('useBuilderState', () => {
  it('adds a field of the chosen type with a generated unique key and no metadata yet', () => {
    const { result } = renderHook(() => useBuilderState(initial));
    act(() => result.current.addField('rating'));
    const added = result.current.fields.at(-1)!;
    expect(added.type).toBe('rating');
    expect(added.key).not.toBe('auto_notes');
    expect(added.description).toBeNull();
    expect(result.current.selectedKey).toBe(added.key);
  });

  it('reports the new field as incomplete until its semantic metadata is filled', () => {
    const { result } = renderHook(() => useBuilderState(initial));
    act(() => result.current.addField('rating'));
    expect(result.current.issuesFor(result.current.selectedKey!)).not.toEqual([]);
    act(() => result.current.updateField(result.current.selectedKey!, {
      description: 'driver skill', unit: 'count', phase: 'post_match', direction: 'higher_is_better',
      config: { max: 5, style: 'stars' },
    }));
    expect(result.current.issuesFor(result.current.selectedKey!)).toEqual([]);
  });

  it('reorders fields and renumbers display_order contiguously', () => {
    const { result } = renderHook(() => useBuilderState(initial));
    act(() => result.current.addField('toggle'));
    act(() => result.current.reorder(1, 0));
    expect(result.current.fields.map((f) => f.display_order)).toEqual([1, 2]);
    expect(result.current.fields[0]!.type).toBe('toggle');
  });

  it('never lets a key be edited once the field exists', () => {
    const { result } = renderHook(() => useBuilderState(initial));
    act(() => result.current.updateField('auto_notes', { key: 'renamed' } as never));
    expect(result.current.fields[0]!.key).toBe('auto_notes');
  });

  it('marks the state dirty on any change and clean after save', async () => {
    const { result } = renderHook(() => useBuilderState(initial));
    expect(result.current.dirty).toBe(false);
    act(() => result.current.addField('toggle'));
    expect(result.current.dirty).toBe(true);
  });

  it('warns that a structural change on a locked version will fork a new version', () => {
    const { result } = renderHook(() => useBuilderState({ ...initial, is_locked: true }));
    act(() => result.current.addField('toggle'));
    expect(result.current.willForkNewVersion).toBe(true);
  });

  it('does not warn for an in-place label edit on a locked version', () => {
    const { result } = renderHook(() => useBuilderState({ ...initial, is_locked: true }));
    act(() => result.current.updateField('auto_notes', { label: 'הערות' }));
    expect(result.current.willForkNewVersion).toBe(false);
  });
});
```

`apps/client/src/features/builder/BuilderPage.test.tsx` asserts: the three panes are present at 1280 px; the palette lists all fourteen types and no Photo; the canvas groups fields under their section headings; clicking a canvas row selects it in the settings pane; the page renders the desktop-only panel at 640 px; a banner shows while the version is locked, saying a structural edit will create a new version and an in-place edit will not.

- [ ] **Step 2: Run, implement, re-run**

`useBuilderState` holds `fields` as an array, computes `willForkNewVersion` by calling the **same `isStructuralChange`** helper (moved to `packages/shared/src/forms/version.ts` in this task so both sides share it), validates with `validateFieldDefinition`, and refuses key edits outright. `FieldPalette` renders one draggable button per `FIELD_TYPES` entry with a one-line description. `BuilderCanvas` is a `@dnd-kit/sortable` list with an explicit drag handle, grouped by `section`, each row showing the label, the type and a red dot when `issuesFor(key)` is non-empty.

```bash
pnpm install && pnpm --filter @frc/client exec vitest run src/features/builder && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(client): add the three-pane form builder shell with a sortable canvas"
```

---

## Task 1.30: Client — the builder settings pane

**Files:**
- Create: `apps/client/src/features/builder/SettingsPane.tsx`, `apps/client/src/features/builder/MetadataFields.tsx`, `apps/client/src/features/builder/ScoringFields.tsx`, `apps/client/src/features/builder/ConfigFields.tsx`, `apps/client/src/features/builder/MirrorPreview.tsx`
- Create: `apps/client/src/features/builder/SettingsPane.test.tsx`

**Interfaces:**
- Produces: the one pane holding **configuration, semantic metadata and scoring together**, so metadata is filled *while* the field is created (SPEC-FINAL §5.4, §4.2, §17.9).

**What the pane must show and enforce.** The four required semantic attributes are marked required and block save while blank, with the reason stated once: *"This cannot be added later. Nobody goes back and describes 80 fields."* `is_ordinal` appears only for the two select types and, when on, states that **the option order is the rank, worst → best**. `expected_range` says it drives the hard entry-time block. Scoring appears only for the five scorable types, with option-by-option points for selects, and is **disabled with an explanation for every other type**. Position and cycle-path fields show a **mirroring preview** over the season game image so the admin can verify the axis (§5.6).

- [ ] **Step 1: Write the failing test**

`apps/client/src/features/builder/SettingsPane.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsPane } from './SettingsPane';

const field = (over: Record<string, unknown> = {}) => ({
  id: 'a', key: 'auto_notes', label: 'Auto notes', type: 'counter', display_order: 1, required: false,
  config: { min: 0, max: 10, step: 1 }, section: null, help_text: null, default_value: null,
  visibility_condition: null, deprecated: false, description: null, unit: null, phase: null,
  direction: null, category: null, expected_range: null, include_in_ai_context: null, is_ordinal: null,
  ...over,
});

describe('SettingsPane (SPEC-FINAL 5.4, 4.2)', () => {
  it('shows the key as permanent and not editable', () => {
    render(<SettingsPane field={field()} allFields={[field()]} onChange={vi.fn()} />);
    expect(screen.getByText('auto_notes')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^key$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/permanent/i)).toBeInTheDocument();
  });

  it('marks the four semantic attributes required and says they cannot be backfilled', () => {
    render(<SettingsPane field={field()} allFields={[field()]} onChange={vi.fn()} />);
    for (const label of [/description/i, /unit/i, /phase/i, /direction/i]) {
      expect(screen.getByLabelText(label)).toBeRequired();
    }
    expect(screen.getByText(/cannot be added later/i)).toBeInTheDocument();
  });

  it('offers scoring for a counter, as points per unit', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SettingsPane field={field()} allFields={[field()]} onChange={onChange} />);
    await user.type(screen.getByLabelText(/points per unit/i), '5');
    expect(onChange).toHaveBeenCalled();
  });

  it('offers one point box per option for a single select', () => {
    render(
      <SettingsPane
        field={field({ type: 'single_select', unit: 'enum', is_ordinal: true, config: { options: [
          { value: 'none', label: 'None' }, { value: 'high', label: 'High' },
        ] } })}
        allFields={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/points for None/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/points for High/i)).toBeInTheDocument();
  });

  it('explains why a long text field has no scoring instead of hiding it silently', () => {
    render(<SettingsPane field={field({ type: 'long_text', unit: 'text' })} allFields={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/long text fields are not scored/i)).toBeInTheDocument();
  });

  it('shows is_ordinal only for selects and states that list order is the rank', () => {
    const { rerender } = render(<SettingsPane field={field()} allFields={[]} onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/ordered/i)).not.toBeInTheDocument();
    rerender(
      <SettingsPane field={field({ type: 'single_select', unit: 'enum', config: { options: [{ value: 'a', label: 'A' }] } })} allFields={[]} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText(/ordered/i)).toBeInTheDocument();
    expect(screen.getByText(/worst .* best/i)).toBeInTheDocument();
  });

  it('shows a mirroring preview for a position field', () => {
    render(
      <SettingsPane
        field={field({ type: 'position', unit: 'coordinate', config: { multi_point: false, mirror_axis: 'horizontal' } })}
        allFields={[]}
        onChange={vi.fn()}
        seasonImagePath="seasons/2026/field.webp"
      />,
    );
    expect(screen.getByRole('img', { name: /mirroring preview/i })).toBeInTheDocument();
    expect(screen.getByText(/blue is mirrored/i)).toBeInTheDocument();
  });

  it('offers one visibility condition, never a list', async () => {
    const user = userEvent.setup();
    render(<SettingsPane field={field()} allFields={[field(), field({ key: 'climbed', type: 'toggle' })]} onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /show this field only when/i }));
    expect(screen.getAllByLabelText(/when field/i)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /add another condition/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, implement, re-run, commit**

```bash
pnpm --filter @frc/client exec vitest run src/features/builder && pnpm typecheck && pnpm lint
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(client): add the builder settings pane with metadata, config and inline scoring"
```

---

## Task 1.31: Client — live preview, the raw-JSON editor and export/import

**Files:**
- Create: `apps/client/src/features/builder/LivePreview.tsx`, `apps/client/src/features/builder/RawJsonEditor.tsx`, `apps/client/src/features/builder/ImportExport.tsx`
- Create: `apps/client/src/features/builder/LivePreview.test.tsx`, `apps/client/src/features/builder/RawJsonEditor.test.tsx`

**Interfaces:**
- Produces: a preview rendering the form **at phone width** with the real `FieldInput` — imported, never duplicated; an "advanced" raw-JSON editor that round-trips the definition and refuses invalid JSON with a line number; export to a `.json` file and import from one.

**Scope note.** At this point `FieldInput` still renders the four walking-skeleton types from task 1.7; task 1.33 widens it to all fourteen and the preview picks that up for free, because it imports the component rather than reimplementing it. This task's tests therefore use a four-type fixture form. Do not widen `FieldInput` here.

- [ ] **Step 1: Write the failing tests**

`LivePreview.test.tsx` asserts: the preview renders inside a 390 px-wide frame; it uses the same `FieldInput` the scouter sees, so a counter shows as −/value/+ and never as a text box; conditional fields appear and disappear as the preview is filled; **nothing typed in the preview is ever submitted or drafted**.

`RawJsonEditor.test.tsx` asserts: it opens closed, behind an "Advanced" toggle; editing valid JSON updates the builder state; invalid JSON shows one message naming the position and leaves the state untouched; a definition that fails `validateFieldDefinition` is refused with the field key named.

- [ ] **Step 2: Run, implement, re-run**

`ImportExport` serialises exactly what `exportForm` returns and downloads it as `form-<kind>-<season>.json`; import reads a file, parses, validates, and shows a diff summary — *"adds 3 fields, changes 1 type, removes 0"* — before it is applied, because an import is a structural change and will fork a version.

```bash
pnpm --filter @frc/client exec vitest run src/features/builder && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(client): add the builder live preview, raw JSON editor and form import/export"
```

---

## Task 1.32: The match-timer configuration editor

**Files:**
- Create: `packages/shared/src/forms/timer.ts`, `packages/shared/src/forms/timer.test.ts`
- Create: `apps/client/src/features/builder/TimerConfigEditor.tsx`, `apps/client/src/features/builder/TimerConfigEditor.test.tsx`

**Interfaces:**
- Produces: `timerConfigSchema`, `type TimerConfig`, `matchEndSeconds(config)`, `phaseAt(config, t)`; `<TimerConfigEditor />` in the builder.

**Rules (SPEC-FINAL §8.4).** `forms.timer_config` is shaped `{"phases": [{"phase": "auto", "seconds": 15}, …]}`, using **the same phase vocabulary as field metadata**. Phases run **consecutively in list order**. **Match end (`t_end`) is the sum of the phase durations.** Editing durations is an **in-place edit and creates no form version**. **An empty `phases` list means the form has no timer and the sticky timer is not rendered.**

- [ ] **Step 1: Write the failing test**

`packages/shared/src/forms/timer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { matchEndSeconds, phaseAt, timerConfigSchema } from './timer';

const standard = { phases: [
  { phase: 'auto', seconds: 15 },
  { phase: 'teleop', seconds: 135 },
  { phase: 'endgame', seconds: 30 },
] };

describe('timer_config (SPEC-FINAL 8.4)', () => {
  it('accepts the standard shape and an empty phase list', () => {
    expect(timerConfigSchema.parse(standard)).toEqual(standard);
    expect(timerConfigSchema.parse({ phases: [] }).phases).toEqual([]);
  });

  it('uses the same phase vocabulary as field metadata', () => {
    expect(timerConfigSchema.safeParse({ phases: [{ phase: 'halftime', seconds: 10 }] }).success).toBe(false);
  });

  it('refuses a zero or negative duration', () => {
    expect(timerConfigSchema.safeParse({ phases: [{ phase: 'auto', seconds: 0 }] }).success).toBe(false);
  });

  it('computes match end as the sum of the phase durations', () => {
    expect(matchEndSeconds(standard)).toBe(180);
  });

  it('has no match end when there are no phases', () => {
    expect(matchEndSeconds({ phases: [] })).toBeNull();
  });

  it('reports which phase a moment falls in, consecutively and in list order', () => {
    expect(phaseAt(standard, 0)).toBe('auto');
    expect(phaseAt(standard, 14.9)).toBe('auto');
    expect(phaseAt(standard, 15)).toBe('teleop');
    expect(phaseAt(standard, 149)).toBe('teleop');
    expect(phaseAt(standard, 150)).toBe('endgame');
    expect(phaseAt(standard, 180)).toBeNull();
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { z } from 'zod';

export const timerConfigSchema = z.object({
  phases: z.array(
    z.object({
      phase: z.enum(['auto', 'teleop', 'endgame', 'post_match']),
      seconds: z.number().positive(),
    }),
  ),
});

export type TimerConfig = z.infer<typeof timerConfigSchema>;

/** t_end is the sum of the phase durations; null means this form has no timer. */
export function matchEndSeconds(config: TimerConfig): number | null {
  if (config.phases.length === 0) return null;
  return config.phases.reduce((total, phase) => total + phase.seconds, 0);
}

export function phaseAt(config: TimerConfig, t: number): TimerConfig['phases'][number]['phase'] | null {
  let elapsed = 0;
  for (const phase of config.phases) {
    if (t < elapsed + phase.seconds) return phase.phase;
    elapsed += phase.seconds;
  }
  return null;
}
```

`TimerConfigEditor` renders one row per phase with a phase `<select>` and a seconds input, add/remove/reorder, a live total reading *"match ends at 180 s (3:00)"*, and the standing note *"Changing these is an in-place edit. It never creates a new form version."* An empty list shows *"This form has no match timer. The sticky timer will not be shown."*

- [ ] **Step 3: Run and commit**

```bash
pnpm vitest run packages/shared && pnpm --filter @frc/client exec vitest run src/features/builder && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task in shared; every suite green, including the new file(s) from this task in the client.

```bash
git add -A && git commit -m "feat: add the match-timer configuration model and its builder editor"
```

---
# Phase 1 E — the data-entry runtime (§20.2.5)

This group replaces the walking skeleton's four-type entry screen with the real one. Nothing here changes the outbox, the sync protocol or the submit path — only what the scouter sees and touches.

---

## Task 1.33: The entry renderer — every simple field type

**Files:**
- Modify: `apps/client/src/features/entry/FieldInput.tsx`
- Create: `apps/client/src/features/entry/FieldInput.test.tsx`
- Create: `apps/client/src/features/entry/inputs/NumberInput.tsx`, `RatingInput.tsx`, `MultiSelectInput.tsx`, `ShortTextInput.tsx`, `ComputedValue.tsx`, `SectionHeading.tsx`
- Create: `apps/client/src/features/entry/useUndoable.ts`, `apps/client/src/features/entry/useUndoable.test.ts`

**Interfaces:**
- Produces: `FieldInput` covering `counter · number · toggle · single_select · multi_select · rating · short_text · long_text · computed · section`; `useUndoable(value, onChange)` — the undo stack behind **every repeatable input**.

**§8.2 names five repeatable inputs, not three.** Counters, event-log taps and position points are the obvious ones; **multi-select** and **timer reset** are the two usually forgotten. A multi-select's undo pops the last option toggled — not a clear-all — and the timer's reset is undoable back to the accumulated value it had before, so a mis-tap during a match is recoverable. Both go through the same `useUndoable`, and `FieldInput.test.tsx` carries a case for each.

**Rules.** Counters stay a wide **− / value / +** triplet and never a text input. Ratings render as **1–5 stars or a slider** per `config.style`. A computed field is **read-only** and recomputed as the scouter types (§5.7). A section renders as a heading and holds no value. Every target is **≥ 48 × 48 px with ≥ 8 px between adjacent targets**, and every label and free-text field carries `dir="auto"`.

- [ ] **Step 1: Write the failing tests**

`apps/client/src/features/entry/useUndoable.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useUndoable } from './useUndoable';

describe('useUndoable (SPEC-FINAL 8.2)', () => {
  it('undoes the last change and nothing more', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useUndoable(0, onChange));
    act(() => result.current.set(1));
    act(() => result.current.set(2));
    act(() => result.current.undo());
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('reports whether there is anything to undo', () => {
    const { result } = renderHook(() => useUndoable(0, vi.fn()));
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.set(1));
    expect(result.current.canUndo).toBe(true);
  });

  it('clears back to the initial value', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useUndoable(0, onChange));
    act(() => result.current.set(5));
    act(() => result.current.clear());
    expect(onChange).toHaveBeenLastCalledWith(0);
    expect(result.current.canUndo).toBe(false);
  });
});
```

`apps/client/src/features/entry/FieldInput.test.tsx` — one `describe` per type, each asserting the interaction and the accessibility floor:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FormFieldDefinition } from '@frc/shared';
import { FieldInput } from './FieldInput';

const f = (over: Partial<FormFieldDefinition>): FormFieldDefinition => ({
  id: 'f', key: 'k', label: 'Label', help_text: null, type: 'counter', section: null,
  display_order: 1, required: false, default_value: null, config: {}, visibility_condition: null,
  deprecated: false, description: 'x', unit: 'count', phase: 'auto', direction: 'neutral',
  category: null, expected_range: null, include_in_ai_context: null, is_ordinal: null, ...over,
});

describe('FieldInput across the catalogue', () => {
  it('renders a number field with min, max and step and no counter buttons', () => {
    render(<FieldInput field={f({ key: 'n', type: 'number', label: 'Cycles', config: { min: 0, max: 9, step: 0.5 } })} value={2} onChange={vi.fn()} />);
    const input = screen.getByLabelText('Cycles');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '9');
    expect(input).toHaveAttribute('step', '0.5');
    expect(screen.queryByRole('button', { name: /plus one/i })).not.toBeInTheDocument();
  });

  it('renders a rating as five star buttons when style is stars', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FieldInput field={f({ key: 'r', type: 'rating', label: 'Driver', config: { max: 5, style: 'stars' } })} value={null} onChange={onChange} />);
    const stars = screen.getAllByRole('radio');
    expect(stars).toHaveLength(5);
    await user.click(stars[3]!);
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('renders a rating as a slider when style is slider, labelled with its value', () => {
    render(<FieldInput field={f({ key: 'r', type: 'rating', label: 'Driver', config: { max: 5, style: 'slider' } })} value={3} onChange={vi.fn()} />);
    const slider = screen.getByRole('slider', { name: 'Driver' });
    expect(slider).toHaveValue('3');
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('toggles a multi-select option on and off and reports the whole array', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const field = f({ key: 'm', type: 'multi_select', label: 'Roles', config: { options: [{ value: 'a', label: 'Defence' }, { value: 'b', label: 'Scoring' }] } });
    const { rerender } = render(<FieldInput field={field} value={[]} onChange={onChange} />);
    await user.click(screen.getByRole('checkbox', { name: 'Defence' }));
    expect(onChange).toHaveBeenLastCalledWith(['a']);
    rerender(<FieldInput field={field} value={['a']} onChange={onChange} />);
    await user.click(screen.getByRole('checkbox', { name: 'Defence' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('renders a computed field read-only, recomputed from its expression as siblings change', () => {
    const computed = f({
      key: 'total', type: 'computed', label: 'Total', unit: 'points',
      config: { result_type: 'float', expression: { kind: 'op', op: '+', left: { kind: 'field', key: 'a' }, right: { kind: 'field', key: 'b' } } },
    });
    const { rerender } = render(<FieldInput field={computed} value={undefined} onChange={vi.fn()} siblingValues={{ a: 2, b: 3 }} />);
    expect(screen.getByLabelText('Total')).toHaveTextContent('5');
    rerender(<FieldInput field={computed} value={undefined} onChange={vi.fn()} siblingValues={{ a: 2, b: 8 }} />);
    expect(screen.getByLabelText('Total')).toHaveTextContent('10');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders a section as a heading with no input at all', () => {
    render(<FieldInput field={f({ key: 's', type: 'section', label: 'Autonomous', description: null, unit: null, phase: null, direction: null })} value={undefined} onChange={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Autonomous' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('gives every tappable control the tap-target class, which carries the 48 px floor', () => {
    render(<FieldInput field={f({ key: 'c', type: 'counter', label: 'Notes' })} value={0} onChange={vi.fn()} />);
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain('tap-target');
    }
  });

  it('sets dir="auto" on every label and on every free-text input', () => {
    render(<FieldInput field={f({ key: 't', type: 'long_text', label: 'הערות', unit: 'text' })} value="" onChange={vi.fn()} />);
    expect(screen.getByText('הערות')).toHaveAttribute('dir', 'auto');
    expect(screen.getByRole('textbox')).toHaveAttribute('dir', 'auto');
  });
});
```


- [ ] **Step 2: Run, implement, re-run, commit**

```bash
pnpm --filter @frc/client exec vitest run src/features/entry && pnpm typecheck && pnpm lint
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(client): render every simple field type in the entry runtime with undo"
```

---

## Task 1.34: The sticky match timer, the Timer field and the Event-log field

**Files:**
- Create: `apps/client/src/features/entry/MatchTimer.tsx`, `apps/client/src/features/entry/MatchTimer.test.tsx`
- Create: `apps/client/src/features/entry/inputs/TimerInput.tsx`, `apps/client/src/features/entry/inputs/EventLogInput.tsx`
- Create: `apps/client/src/features/entry/inputs/EventLogInput.test.tsx`
- Create: `apps/client/src/features/entry/matchClock.ts`, `apps/client/src/features/entry/matchClock.test.ts`

**Interfaces:**
- Produces: `<MatchTimer config />` — pinned to the top, visible while scrolling; `matchClock` — the single source of `t = 0`; `<TimerInput>` — an accumulating stopwatch, **editable after stop** and **nullable via an "unsure — no time" toggle**; `<EventLogInput>` — scouter-defined event buttons storing `{type, t}` taps, **deletable before submit**.

**Rules (SPEC-FINAL §8.4, §5.5).** The timer is started by a **manual "Start match" button**; there is no field hookup. It is **display-only guidance**: it does not open or close phase sections, does not lock or gate any field, and does not auto-submit. It supplies `t = 0` for event-log taps and the match-end boundary for the final derived cycle. **Un-timed:** if the timer was never started, the **first tap in the field defines `t = 0`** and all later taps are seconds from it.

- [ ] **Step 1: Write the failing tests**

`apps/client/src/features/entry/matchClock.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchClock } from './matchClock';

beforeEach(() => {
  vi.useFakeTimers();
  matchClock.reset();
});

describe('matchClock (SPEC-FINAL 5.5, 8.4)', () => {
  it('is not running until the Start match button is pressed', () => {
    expect(matchClock.isRunning()).toBe(false);
    expect(matchClock.elapsed()).toBeNull();
  });

  it('measures seconds from the press', () => {
    matchClock.start();
    vi.advanceTimersByTime(12_500);
    expect(matchClock.elapsed()).toBeCloseTo(12.5, 1);
  });

  it('gives an event-log field t=0 at the first tap when the timer was never started', () => {
    expect(matchClock.tapTime('shots')).toBe(0);
    vi.advanceTimersByTime(8_000);
    expect(matchClock.tapTime('shots')).toBeCloseTo(8, 1);
  });

  it('gives every field the same origin once the timer is running', () => {
    matchClock.start();
    vi.advanceTimersByTime(5_000);
    expect(matchClock.tapTime('shots')).toBeCloseTo(5, 1);
    expect(matchClock.tapTime('pickups')).toBeCloseTo(5, 1);
  });

  it('reports whether the entry was timed, which is what decides the cycle derivation', () => {
    expect(matchClock.wasTimed()).toBe(false);
    matchClock.start();
    expect(matchClock.wasTimed()).toBe(true);
  });
});
```

`apps/client/src/features/entry/MatchTimer.test.tsx` asserts: it is not rendered at all when `timer_config.phases` is empty; it shows the current phase and the countdown within it; it is `position: sticky` at the top; pressing "Start match" starts it and the button becomes "Restart"; **it never disables a field, never opens or closes a section and never submits** (asserted by rendering it inside a full `EntryPage` and checking that every input stays enabled past `t_end`).

`EventLogInput.test.tsx` asserts: one button per configured event type, each ≥ 48 px; a tap appends `{type, t}` with `t` from `matchClock`; taps are listed newest first with a delete button each; deleting removes only that tap; the taps array stays sorted ascending by `t`.

- [ ] **Step 2: Implement**

`apps/client/src/features/entry/matchClock.ts`:

```ts
type Origin = { at: number; timed: boolean };

let origin: Origin | null = null;

/**
 * SPEC-FINAL 5.5. Timed: t = 0 is the moment "Start match" was pressed. Un-timed: the
 * FIRST TAP in the entry defines t = 0, and all later taps are seconds from it — which
 * is why there is no first cycle from match start and no final open cycle in that case.
 */
export const matchClock = {
  start(): void {
    origin = { at: Date.now(), timed: true };
  },
  reset(): void {
    origin = null;
  },
  isRunning(): boolean {
    return origin?.timed === true;
  },
  wasTimed(): boolean {
    return origin?.timed === true;
  },
  elapsed(): number | null {
    return origin === null ? null : (Date.now() - origin.at) / 1000;
  },
  /** Returns the t to store for a tap, establishing the un-timed origin if needed. */
  tapTime(_fieldKey: string): number {
    if (origin === null) {
      origin = { at: Date.now(), timed: false };
      return 0;
    }
    return (Date.now() - origin.at) / 1000;
  },
};
```

`TimerInput` is an accumulating stopwatch with start/stop, a **number input enabled once stopped** so a late stop can be corrected, and an "unsure — no time" checkbox that clears the value and submits nothing rather than a wrong number. **Its reset is undoable** (§8.2) — `useUndoable` restores the accumulated value, because resetting a timer by accident two minutes into a match is otherwise unrecoverable.

- [ ] **Step 3: Run and commit**

```bash
pnpm --filter @frc/client exec vitest run src/features/entry && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(client): add the sticky match timer, the timer field and the event log"
```

---

## Task 1.35: Spatial fields — the position picker and the cycle path

**Files:**
- Create: `packages/shared/src/forms/mirror.ts`, `packages/shared/src/forms/mirror.test.ts`
- Create: `apps/client/src/features/entry/inputs/PositionInput.tsx`, `apps/client/src/features/entry/inputs/CyclePathInput.tsx`
- Create: `apps/client/src/features/entry/inputs/PositionInput.test.tsx`, `apps/client/src/features/entry/inputs/CyclePathInput.test.tsx`

**Interfaces:**
- Produces: `normalizeForAlliance(point, alliance, mirrorAxis)` and `denormalizeForAlliance(...)`; `<PositionInput>` — tap the game image, storing normalized `{x, y}` in 0–1, one point or a list; `<CyclePathInput>` — tap an **ordered sequence** of points per cycle, an entry holding a **list of cycles**, capped at `max_points_per_cycle` (default 6).

**Rules (SPEC-FINAL §5.6, §5.2).** The **red** alliance keeps raw coordinates; the **blue** alliance is mirrored on the field's configured `mirror_axis`, so both map to a single canonical frame. Cycle paths are **low fidelity by design** — a rough sketch, not a trajectory. Undo is available: undo last point, clear all. A **missing image fails loudly** and no coordinate may be recorded (task 1.23's `FieldImage`).

- [ ] **Step 1: Write the failing test**

`packages/shared/src/forms/mirror.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { denormalizeForAlliance, normalizeForAlliance } from './mirror';

const p = { x: 0.25, y: 0.75 };

describe('alliance normalization (SPEC-FINAL 5.6)', () => {
  it('leaves red coordinates untouched on every axis', () => {
    for (const axis of ['none', 'horizontal', 'vertical', 'both'] as const) {
      expect(normalizeForAlliance(p, 'red', axis)).toEqual(p);
    }
  });

  it('mirrors blue on the configured axis', () => {
    expect(normalizeForAlliance(p, 'blue', 'none')).toEqual(p);
    expect(normalizeForAlliance(p, 'blue', 'horizontal')).toEqual({ x: 0.75, y: 0.75 });
    expect(normalizeForAlliance(p, 'blue', 'vertical')).toEqual({ x: 0.25, y: 0.25 });
    expect(normalizeForAlliance(p, 'blue', 'both')).toEqual({ x: 0.75, y: 0.25 });
  });

  it('round-trips, so a stored point can be drawn back where it was tapped', () => {
    for (const axis of ['none', 'horizontal', 'vertical', 'both'] as const) {
      const stored = normalizeForAlliance(p, 'blue', axis);
      expect(denormalizeForAlliance(stored, 'blue', axis)).toEqual(p);
    }
  });

  it('keeps every coordinate inside the unit square', () => {
    for (const axis of ['none', 'horizontal', 'vertical', 'both'] as const) {
      const out = normalizeForAlliance({ x: 0, y: 1 }, 'blue', axis);
      expect(out.x).toBeGreaterThanOrEqual(0);
      expect(out.x).toBeLessThanOrEqual(1);
      expect(out.y).toBeGreaterThanOrEqual(0);
      expect(out.y).toBeLessThanOrEqual(1);
    }
  });
});
```

with the implementation:

```ts
import type { Point } from './types';

export type MirrorAxis = 'none' | 'horizontal' | 'vertical' | 'both';

/**
 * SPEC-FINAL 5.6: red keeps raw coordinates, blue is mirrored, so both alliances map
 * to one canonical frame. The transform is its own inverse, which is what makes
 * denormalize a call to the same function.
 */
export function normalizeForAlliance(point: Point, alliance: 'red' | 'blue', axis: MirrorAxis): Point {
  if (alliance === 'red' || axis === 'none') return { x: point.x, y: point.y };
  const flipX = axis === 'horizontal' || axis === 'both';
  const flipY = axis === 'vertical' || axis === 'both';
  return { x: flipX ? 1 - point.x : point.x, y: flipY ? 1 - point.y : point.y };
}

export const denormalizeForAlliance = normalizeForAlliance;
```

`PositionInput.test.tsx` asserts: a tap at the centre of a 400 × 200 box stores `{x: 0.5, y: 0.5}`; a blue-alliance tap on a `horizontal` field stores the mirrored x; a single-point field replaces its point on a second tap while a `multi_point` field appends; "undo last point" and "clear all" work; a field whose season image is missing renders the fail-loud panel and **records nothing**.

`CyclePathInput.test.tsx` asserts: taps append to the current cycle in order; "end cycle" starts a new one; the entry value is an array of arrays; a cycle refuses a seventh point at the default cap and says so; undo removes the last point of the current cycle.

- [ ] **Step 2: Run, implement, re-run, commit**

```bash
pnpm vitest run packages/shared && pnpm --filter @frc/client exec vitest run src/features/entry && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task in shared; every suite green, including the new file(s) from this task in the client.

```bash
git add -A && git commit -m "feat: add the position picker and cycle path with alliance mirroring"
```

---

## Task 1.36: The entry form's rules — phases, status, conditions, range block, confirmation

**Files:**
- Modify: `apps/client/src/features/entry/EntryPage.tsx`, `apps/client/src/features/entry/EntryPage.test.tsx`, `apps/client/src/routes.tsx`
- Create: `apps/client/src/features/entry/PhaseSection.tsx`, `apps/client/src/features/entry/ConfirmSummary.tsx`
- Create: `apps/client/src/features/entry/SuperEntryPage.tsx`, `apps/client/src/features/entry/SuperEntryPage.test.tsx`

**Interfaces:**
- Produces: the finished entry screen — collapsible phase sections a scouter can **open, close and reopen at will** (not one-way paging), the mandatory robot status **before** the scoring fields, conditional fields per §5.8, the hard range block on submit, and the confirmation summary of the whole entry.

- [ ] **Step 1: Add the failing tests**

```tsx
  it('orders sections Autonomous, Teleop, Endgame, Post-match by the fields phase metadata', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    const headings = (await screen.findAllByRole('group')).map((g) => g.textContent);
    expect(headings.join('|')).toMatch(/Autonomous[\s\S]*Teleop[\s\S]*Endgame[\s\S]*Post-match/);
  });

  it('lets a section be closed and reopened, and is not one-way paging', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    const auto = await screen.findByRole('group', { name: /autonomous/i });
    await user.click(within(auto).getByRole('button', { name: /autonomous/i }));
    expect(screen.queryByText('Auto notes')).not.toBeInTheDocument();
    await user.click(within(auto).getByRole('button', { name: /autonomous/i }));
    expect(await screen.findByText('Auto notes')).toBeInTheDocument();
  });

  it('recomputes a computed field as its operands change, without the scouter typing it', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    await user.click(await screen.findByRole('button', { name: 'Auto notes plus one' }));
    expect(screen.getByLabelText('Total points')).toHaveTextContent('5');
  });

  it('shows a conditional field when its condition becomes true and hides it again', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    expect(screen.queryByText('Climb time')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Climbed' }));
    expect(await screen.findByText('Climb time')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Climbed' }));
    expect(screen.queryByText('Climb time')).not.toBeInTheDocument();
  });

  it('records no value for a field that is hidden at submit time', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    await user.click(screen.getByRole('checkbox', { name: 'Climbed' }));
    await user.type(screen.getByLabelText('Climb time'), '9');
    await user.click(screen.getByRole('checkbox', { name: 'Climbed' }));
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));
    await waitFor(async () => {
      const [op] = await pending(10);
      expect(op!.payload.data).not.toHaveProperty('climb_time');
    });
  });

  it('keeps breakdown_seconds visible only for broke_down, and keeps all fields visible with it', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /broke down/i }));
    expect(screen.getByLabelText(/breakdown time/i)).toBeInTheDocument();
    expect(await screen.findByText('Auto notes')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /played/i }));
    expect(screen.queryByLabelText(/breakdown time/i)).not.toBeInTheDocument();
  });

  it('blocks submit and lists every out-of-range field, not just the first', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    for (let i = 0; i < 11; i += 1) await user.click(screen.getByRole('button', { name: 'Auto notes plus one' }));
    for (let i = 0; i < 41; i += 1) await user.click(screen.getByRole('button', { name: 'Teleop notes plus one' }));
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Auto notes/);
    expect(alert).toHaveTextContent(/Teleop notes/);
    expect(await pending(10)).toHaveLength(0);
  });

  it('summarises every phase section in the confirmation, including empty ones', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    const dialog = await screen.findByRole('dialog');
    for (const phase of ['Autonomous', 'Teleop', 'Endgame', 'Post-match']) {
      expect(dialog).toHaveTextContent(phase);
    }
  });

  it('returns to a fresh manual selection after a successful submit', async () => {
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(<EntryPage {...props} onSubmitted={onSubmitted} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
  });
```

(The fixture in `beforeEach` gains a `teleop_notes` counter with `expected_range` 0–40, a `climbed` toggle, a `climb_time` number whose `visibility_condition` is `{field_key:'climbed', op:'=', value:true}`, and a `total` computed field of `auto_notes * 5`.)


- [ ] **Step 2: Implement**

**The super-scouting entry point (SPEC-FINAL §8.1).** A second, separate route at `/super`, because a super record is one per **(team, event)**, not per match. It asks for three things and no more:

1. the active season's `super` form, resolved by `kind` — never chosen by the scouter;
2. the **team**, from the event roster;
3. **no match, no alliance, no robot status.** `validateEntryShape` enforces all four nulls on both sides.

```tsx
/**
 * SPEC-FINAL 8.1: if a super entry for that (team, event) already exists ON THIS DEVICE,
 * open it for editing rather than starting a second one. The duplicate path of 9.5 is for
 * the case this device cannot see — two devices, both offline — not for this one.
 */
async function openOrCreate(eventId: string, teamId: string) {
  const existing = (await cachedRows('scouting_entries')).find(
    (e) =>
      e.event_id === eventId &&
      e.form_kind === 'super' &&
      e.team_id === teamId &&
      e.deleted_at == null,
  );
  return existing ? { rowId: String(existing.id), data: existing.data as Record<string, unknown> } : null;
}
```

It renders the same `PhaseSection` / `FieldInput` stack as the match form — a super form's fields carry `phase` metadata like any other — and submits through the same `submitEntry` with `formKind: 'super'`, `matchId: null`, `alliance: null`, `robotStatus: null`, and `rowId` set when it is editing.

`SuperEntryPage.test.tsx` asserts: the team picker lists the event roster; **no** match, alliance or robot-status control renders anywhere on the page; submitting enqueues one operation carrying `form_kind: 'super'` with all four of those null; opening a team that already has a super entry on this device **loads its values and updates that row** rather than creating a second; and the confirmation summary names the team and the event but no match.

`EntryPage` composes: `RobotStatusPicker` → (breakdown seconds) → `MatchTimer` (when `timer_config.phases` is non-empty) → `PhaseSection` per phase, each rendering `visibleFields(fieldsInPhase, data)` → the sticky "Review entry" bar → `ConfirmSummary`. Computed fields are evaluated on every change with `evaluateExpr` and written into `data` so they reach the payload (§5.7). Hidden fields are stripped from `data` before validation and submit, because **a hidden field records no value**.

- [ ] **Step 3: Run and commit**

```bash
pnpm --filter @frc/client exec vitest run src/features/entry && pnpm typecheck && pnpm lint
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(client): finish the entry form rules — phases, conditions, range block, confirmation"
```

---

## Task 1.37: Drafts, recovery and practice mode

**Files:**
- Create: `apps/client/src/features/entry/practice.ts`, `apps/client/src/features/entry/practice.test.ts`
- Create: `apps/client/src/features/entry/DraftRecovery.tsx`, `apps/client/src/features/entry/DraftRecovery.test.tsx`
- Modify: `apps/client/src/features/entry/useDraft.ts`, `apps/client/src/features/entry/submitEntry.ts` (become a no-op in practice mode), `apps/client/src/features/shell/AppShell.tsx`, `apps/client/src/routes.tsx` (the practice-mode entry point)

**Interfaces:**
- Produces: `practiceMode` — a session flag routing drafts to the `practice_drafts` store; `<DraftRecovery />` — the "you have an unfinished entry" offer on next open.

**Rules (SPEC-FINAL §8.3, §8.5).** Every interaction writes a local draft immediately; the draft survives a browser crash, a dead battery and an accidental back-swipe, and is **offered for recovery on next open**. An explicit submit promotes the draft into the sync outbox and clears it. Practice entries are **marked as practice, never written to `scouting_entries`, and never enter the outbox**; their drafts go to a **separate store** which is **cleared on exit from practice mode and on app start**.

- [ ] **Step 1: Write the failing test**

`apps/client/src/features/entry/practice.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/data/db';
import { pending } from '@/data/outbox';
import { practiceMode } from './practice';
import { submitEntry } from './submitEntry';

const base = {
  fields: [], eventId: 'ev-1', formVersionId: 'fv-1', formKind: 'match' as const,
  matchId: 'm-1', teamId: 't-1', alliance: 'red' as const, authorUserId: 'u-1',
  robotStatus: 'played' as const, data: {},
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  practiceMode.exit();
});

describe('practice mode (SPEC-FINAL 8.5)', () => {
  it('writes nothing to scouting_entries and nothing to the outbox', async () => {
    practiceMode.enter();
    await submitEntry(base);
    expect(await pending(10)).toHaveLength(0);
    expect(await db.rows.where('entity').equals('scouting_entries').count()).toBe(0);
  });

  it('writes practice drafts to their own store', async () => {
    practiceMode.enter();
    await db.practiceDrafts.put({ key: 'k', row_id: '', payload: { a: 1 }, updated_at: 'now' });
    expect(await db.drafts.count()).toBe(0);
    expect(await db.practiceDrafts.count()).toBe(1);
  });

  it('clears the practice store on exit', async () => {
    practiceMode.enter();
    await db.practiceDrafts.put({ key: 'k', row_id: '', payload: {}, updated_at: 'now' });
    await practiceMode.exit();
    expect(await db.practiceDrafts.count()).toBe(0);
  });

  it('clears the practice store on app start, whatever happened last time', async () => {
    await db.practiceDrafts.put({ key: 'k', row_id: '', payload: {}, updated_at: 'now' });
    await practiceMode.clearOnStart();
    expect(await db.practiceDrafts.count()).toBe(0);
  });

  it('leaves real drafts and a real outbox completely alone', async () => {
    await submitEntry(base);
    practiceMode.enter();
    await practiceMode.exit();
    expect(await pending(10)).toHaveLength(1);
  });
});
```

`DraftRecovery.test.tsx` asserts: a saved draft is offered by team and match with its age; accepting reopens the entry with the values restored; dismissing deletes that draft only; nothing is offered when there is no draft; **practice drafts are never offered**.

- [ ] **Step 2: Implement, run and commit**

```bash
pnpm --filter @frc/client exec vitest run src/features/entry && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(client): add draft recovery and practice mode"
```

---

## Task 1.38: Arena comfort — themes, large text, wake lock, haptics

**Files:**
- Create: `apps/client/src/features/settings/theme.ts`, `apps/client/src/features/settings/theme.test.ts`
- Create: `apps/client/src/features/settings/SettingsPage.tsx`, `apps/client/src/features/settings/SettingsPage.test.tsx`
- Create: `apps/client/src/features/entry/useWakeLock.ts`, `apps/client/src/lib/haptics.ts`, `apps/client/src/lib/haptics.test.ts`
- Modify: `apps/client/src/features/entry/FieldInput.tsx` (haptics on tap), `apps/client/src/features/entry/EntryPage.tsx` (wake lock)

**Interfaces:**
- Produces: `theme.set('dark' | 'outdoor')` persisted per device; `textScale.set(1 | 1.15 | 1.3 | 1.5)` — an **in-app multiplier on top of the OS text size**; `useWakeLock()` — no dimming mid-match; `haptics.tap()`.

**Rules (SPEC-FINAL §8.6, §17.4, §17.7).** **Two themes only** — dark (default) and the outdoor high-contrast theme, which *is* the light theme. There is no ordinary light theme. All type is in relative units and **no layout may break at 200%**. Both portrait and landscape, on phones and tablets: a wider screen places fields side by side; a phone stacks them.

- [ ] **Step 1: Write the failing tests**

`apps/client/src/features/settings/theme.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/data/db';
import { textScale, theme } from './theme';

beforeEach(async () => {
  await db.delete();
  await db.open();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.removeProperty('--text-scale');
});

describe('theme (SPEC-FINAL 17.4)', () => {
  it('defaults to dark', async () => {
    await theme.apply();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('offers exactly two themes and no ordinary light theme', () => {
    expect(theme.options).toEqual(['dark', 'outdoor']);
  });

  it('persists the choice on this device and reapplies it after a reload', async () => {
    await theme.set('outdoor');
    await theme.apply();
    expect(document.documentElement.dataset.theme).toBe('outdoor');
  });
});

describe('text scale (SPEC-FINAL 8.6, 17.7)', () => {
  it('is a multiplier on top of the OS size, not a replacement', async () => {
    await textScale.set(1.3);
    await textScale.apply();
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.3');
  });

  it('offers four steps and refuses anything outside them', async () => {
    expect(textScale.options).toEqual([1, 1.15, 1.3, 1.5]);
    await expect(textScale.set(3 as never)).rejects.toThrow();
  });
});
```

`haptics.test.ts` asserts it calls `navigator.vibrate` when available and is a silent no-op when it is not — never a thrown error on iOS.

`SettingsPage.test.tsx` asserts: both themes are offered with a preview swatch; the four text steps are offered; the device wipe action is present and gated (task 1.49 implements it); the page works at any viewport width.

- [ ] **Step 2: Implement, run and commit**

`useWakeLock` requests `navigator.wakeLock.request('screen')` on mount, re-requests on `visibilitychange`, and releases on unmount, wrapped in a try/catch because Safari may refuse. `haptics.tap()` calls `navigator.vibrate?.(10)`.

```bash
pnpm --filter @frc/client exec vitest run && pnpm typecheck && pnpm lint
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(client): add the two themes, large-text option, wake lock and haptics"
```

---
# Phase 1 F — the sync protocol (§20.2.6)

The outbox, the push endpoint, the delta pull and hydration already exist from group A. This group adds the parts that only matter when two devices disagree — and they are the parts that are impossible to debug at a venue, which is why they are one of the two non-negotiable test suites (§18.4).

---

## Task 1.39: Shared — the conflict policy, as pure functions

**Files:**
- Create: `packages/shared/src/sync/conflict.ts`, `packages/shared/src/sync/conflict.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `logicalKeyOf(entry)`; `classifyPush({ operation, existingRow, duplicateRow }): PushDecision`; `type PushDecision`; `latestWins(a, b)`.

**The policy, exactly (SPEC-FINAL §9.5).**

| Case | Behaviour |
|---|---|
| **Fast-forward** — `base_version` matches, or the `row_id` is new | Apply, bump `version`, **last-write-wins, no review**. |
| **Divergence** — `base_version` is stale | **The copy with the greater `client_updated_at` becomes the live value** — the latest wins, regardless of which arrived first. The other copy is written in full to `sync_conflicts` (`kind = 'divergence'`) and the row is flagged. **No automatic field-level merge.** |
| **Duplicate** — a *different* `row_id` already exists, not deleted, with the same logical key | **Both rows are accepted and kept**, linked by a `sync_conflicts` row (`kind = 'duplicate'`). Until resolved, the engine uses only the row with the greatest `client_updated_at`. |
| **Parent deleted** | Reject with `parent-deleted`. |

The logical key, matched null-safely: `match` → `(event_id, form_kind, team_id, match_id)`; `super` → `(event_id, form_kind, team_id)` with `match_id` null on both sides.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/sync/conflict.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Operation } from './operation';
import { classifyPush, latestWins, logicalKeyOf } from './conflict';

const op = (over: Partial<Operation> = {}): Operation => ({
  op_id: 'o-1', entity: 'scouting_entry', row_id: 'r-1', action: 'update', base_version: 2,
  payload: { event_id: 'ev-1', form_kind: 'match', team_id: 't-1', match_id: 'm-1', data: { a: 1 } },
  author_user_id: 'u-1',
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:05:00.000Z',
  seq: 1, ...over,
});

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r-1', version: 2, event_id: 'ev-1', form_kind: 'match', team_id: 't-1', match_id: 'm-1',
  client_updated_at: '2026-11-14T09:03:00.000Z', deleted_at: null, ...over,
});

describe('the logical key (SPEC-FINAL 9.5)', () => {
  it('is (event, kind, team, match) for a match entry', () => {
    expect(logicalKeyOf({ event_id: 'e', form_kind: 'match', team_id: 't', match_id: 'm' })).toBe('e|match|t|m');
  });

  it('drops the match for a super entry, so two null match_ids compare equal', () => {
    expect(logicalKeyOf({ event_id: 'e', form_kind: 'super', team_id: 't', match_id: null })).toBe('e|super|t|');
    expect(logicalKeyOf({ event_id: 'e', form_kind: 'super', team_id: 't', match_id: null }))
      .toBe(logicalKeyOf({ event_id: 'e', form_kind: 'super', team_id: 't', match_id: undefined }));
  });
});

describe('classifyPush', () => {
  it('fast-forwards a create of a new row', () => {
    expect(classifyPush({ operation: op({ action: 'create', base_version: null }), existingRow: null, duplicateRow: null }))
      .toMatchObject({ kind: 'fast-forward', nextVersion: 1 });
  });

  it('fast-forwards an update whose base version matches, bumping the version', () => {
    expect(classifyPush({ operation: op(), existingRow: row(), duplicateRow: null }))
      .toMatchObject({ kind: 'fast-forward', nextVersion: 3 });
  });

  it('flags a divergence when the base version is stale', () => {
    const decision = classifyPush({ operation: op({ base_version: 1 }), existingRow: row({ version: 3 }), duplicateRow: null });
    expect(decision.kind).toBe('divergence');
  });

  it('makes the greater client_updated_at the live value, whichever arrived first', () => {
    const incomingIsNewer = classifyPush({
      operation: op({ base_version: 1, client_updated_at: '2026-11-14T09:09:00.000Z' }),
      existingRow: row({ version: 3, client_updated_at: '2026-11-14T09:04:00.000Z' }),
      duplicateRow: null,
    });
    expect(incomingIsNewer).toMatchObject({ kind: 'divergence', winner: 'incoming' });

    const existingIsNewer = classifyPush({
      operation: op({ base_version: 1, client_updated_at: '2026-11-14T09:01:00.000Z' }),
      existingRow: row({ version: 3, client_updated_at: '2026-11-14T09:04:00.000Z' }),
      duplicateRow: null,
    });
    expect(existingIsNewer).toMatchObject({ kind: 'divergence', winner: 'existing' });
  });

  it('preserves the losing copy in full, with its author and its client timestamp', () => {
    const decision = classifyPush({
      operation: op({ base_version: 1, author_user_id: 'u-2', client_updated_at: '2026-11-14T09:01:00.000Z' }),
      existingRow: row({ version: 3, client_updated_at: '2026-11-14T09:04:00.000Z' }),
      duplicateRow: null,
    });
    expect(decision.kind === 'divergence' && decision.superseded).toMatchObject({
      payload: { data: { a: 1 } },
      author_id: 'u-2',
      client_updated_at: '2026-11-14T09:01:00.000Z',
      base_version: 1,
    });
  });

  it('never merges fields', () => {
    const decision = classifyPush({
      operation: op({ base_version: 1, payload: { ...op().payload, data: { b: 2 } } }),
      existingRow: row({ version: 3, data: { a: 1 } }),
      duplicateRow: null,
    });
    expect(decision.kind === 'divergence' && decision.live.data).toEqual({ b: 2 });
  });

  it('keeps BOTH rows on a duplicate and links them', () => {
    const decision = classifyPush({
      operation: op({ action: 'create', base_version: null, row_id: 'r-2' }),
      existingRow: null,
      duplicateRow: row({ id: 'r-1' }),
    });
    expect(decision).toMatchObject({ kind: 'duplicate', nextVersion: 1, duplicateRowId: 'r-1' });
  });

  it('is not a duplicate when the other row is soft-deleted', () => {
    const decision = classifyPush({
      operation: op({ action: 'create', base_version: null, row_id: 'r-2' }),
      existingRow: null,
      duplicateRow: row({ id: 'r-1', deleted_at: '2026-11-14T09:00:00.000Z' }),
    });
    expect(decision.kind).toBe('fast-forward');
  });

  it('is not a duplicate of itself', () => {
    const decision = classifyPush({
      operation: op({ action: 'create', base_version: null, row_id: 'r-1' }),
      existingRow: null,
      duplicateRow: row({ id: 'r-1' }),
    });
    expect(decision.kind).toBe('fast-forward');
  });
});

describe('latestWins', () => {
  it('picks the greater client_updated_at, and the first argument on a tie', () => {
    const a = { client_updated_at: '2026-11-14T09:05:00.000Z', id: 'a' };
    const b = { client_updated_at: '2026-11-14T09:04:00.000Z', id: 'b' };
    expect(latestWins(a, b).id).toBe('a');
    expect(latestWins(b, a).id).toBe('a');
    expect(latestWins(a, { ...b, client_updated_at: a.client_updated_at }).id).toBe('a');
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
pnpm vitest run packages/shared/src/sync/conflict.test.ts
```

Expected: `Failed to resolve import "./conflict"`.

- [ ] **Step 3: Implement**

`packages/shared/src/sync/conflict.ts`:

```ts
import type { Operation } from './operation';

export type LogicalRow = {
  event_id: string;
  form_kind: string;
  team_id: string;
  match_id?: string | null;
};

/**
 * SPEC-FINAL 9.5, matched with SQL's null-safe `is not distinct from` semantics so
 * super entries — where match_id is null on both sides — compare correctly.
 */
export function logicalKeyOf(row: LogicalRow): string {
  const match = row.form_kind === 'match' ? (row.match_id ?? '') : '';
  return `${row.event_id}|${row.form_kind}|${row.team_id}|${match}`;
}

export type StampedRow = Record<string, unknown> & { client_updated_at: string };

/** The latest entered wins, in the duplicate rule and the divergence rule alike. */
export function latestWins<T extends StampedRow>(a: T, b: T): T {
  return b.client_updated_at > a.client_updated_at ? b : a;
}

export type ExistingRow = Record<string, unknown> & {
  id: string;
  version: number;
  client_updated_at: string;
  deleted_at: string | null;
};

export type SupersededCopy = {
  payload: Record<string, unknown>;
  author_id: string;
  client_updated_at: string;
  base_version: number | null;
};

export type PushDecision =
  | { kind: 'fast-forward'; nextVersion: number; live: Record<string, unknown> }
  | {
      kind: 'divergence';
      nextVersion: number;
      winner: 'incoming' | 'existing';
      live: Record<string, unknown>;
      superseded: SupersededCopy;
    }
  | {
      kind: 'duplicate';
      nextVersion: number;
      live: Record<string, unknown>;
      duplicateRowId: string;
    };

export function classifyPush(input: {
  operation: Operation;
  existingRow: ExistingRow | null;
  duplicateRow: ExistingRow | null;
}): PushDecision {
  const { operation, existingRow, duplicateRow } = input;
  const incoming = { ...operation.payload, client_updated_at: operation.client_updated_at };

  if (existingRow === null) {
    const isRealDuplicate =
      duplicateRow !== null && duplicateRow.id !== operation.row_id && duplicateRow.deleted_at === null;
    if (isRealDuplicate) {
      // Both rows are accepted and kept, linked by a sync_conflicts row (9.5).
      return { kind: 'duplicate', nextVersion: 1, live: incoming, duplicateRowId: duplicateRow.id };
    }
    return { kind: 'fast-forward', nextVersion: 1, live: incoming };
  }

  if (operation.base_version === existingRow.version) {
    return { kind: 'fast-forward', nextVersion: existingRow.version + 1, live: incoming };
  }

  // Genuine divergence: two edits branched from the same ancestor on different devices.
  const incomingWins = operation.client_updated_at > existingRow.client_updated_at;
  const superseded: SupersededCopy = incomingWins
    ? {
        payload: stripServerColumns(existingRow),
        author_id: String(existingRow.scouter_id ?? ''),
        client_updated_at: existingRow.client_updated_at,
        base_version: existingRow.version,
      }
    : {
        payload: operation.payload,
        author_id: operation.author_user_id,
        client_updated_at: operation.client_updated_at,
        base_version: operation.base_version,
      };

  return {
    kind: 'divergence',
    nextVersion: existingRow.version + 1,
    winner: incomingWins ? 'incoming' : 'existing',
    // No automatic field-level merge, ever. One whole payload wins.
    live: incomingWins ? incoming : stripServerColumns(existingRow),
    superseded,
  };
}

function stripServerColumns(row: Record<string, unknown>): Record<string, unknown> {
  const { version: _v, created_at: _c, updated_at: _u, ...rest } = row;
  return rest;
}
```

- [ ] **Step 4: Run and commit**

```bash
pnpm vitest run packages/shared && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(shared): implement the conflict policy as pure functions"
```

---

## Task 1.40: Server — the full push semantics

**Files:**
- Modify: `apps/server/src/core/commands/syncPush.ts`, `apps/server/src/core/commands/syncPush.test.ts`
- Modify: `apps/server/src/repos/store.ts` and `apps/server/src/test/fake-context.ts` (replace the `findByLogicalKey`, `parentsExist` and `insertConflict` stubs — all three are already declared by task 1.3)

**Interfaces:**
- Produces: `syncPush` returning `divergence`, `duplicate` and `rejected: parent-deleted`, and writing the matching `sync_conflicts` rows.

- [ ] **Step 1: Add the failing tests**

```ts
  it('returns divergence with a conflict id and keeps the latest client_updated_at live', async () => {
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    // another device edits from the same ancestor
    const res = await syncPush(scouter, { device_id: 'd-2', operations: [op({
      op_id: 'op-diverged', base_version: 1, action: 'update',
      client_updated_at: '2026-11-14T09:09:00.000Z',
      payload: { ...op().payload, data: { auto_notes: 9 } },
    })] }, ctx);
    await syncPush(scouter, { device_id: 'd-3', operations: [op({
      op_id: 'op-loser', base_version: 1, action: 'update',
      client_updated_at: '2026-11-14T09:07:00.000Z',
      payload: { ...op().payload, data: { auto_notes: 4 } },
    })] }, ctx);

    expect(res.results[0]).toMatchObject({ status: 'applied' });
    const conflicts = [...ctx.conflicts.values()];
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ kind: 'divergence', entity: 'scouting_entry', row_id: 'e-1' });
    expect(conflicts[0]!.superseded_payload).toMatchObject({ data: { auto_notes: 4 } });
    expect(ctx.rows.scouting_entries.get('e-1')!.data).toEqual({ auto_notes: 9 });
  });

  it('divergence is still an ack, so the client may prune the operation', async () => {
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    const res = await syncPush(
      scouter,
      { device_id: 'd-2', operations: [op({
        op_id: 'op-2', action: 'update', base_version: 1,
        client_updated_at: '2026-11-14T09:09:00.000Z',
      })] },
      ctx,
    );
    await syncPush(
      scouter,
      { device_id: 'd-3', operations: [op({
        op_id: 'op-3', action: 'update', base_version: 1,
        client_updated_at: '2026-11-14T09:07:00.000Z',
      })] },
      ctx,
    );
    void res;
    const conflicted = [...ctx.conflicts.values()][0]!;
    expect(conflicted.kind).toBe('divergence');
    // isAck() is what the client consults, and it treats divergence as a cloud ack.
    expect(isAck('divergence')).toBe(true);
  });

  it('keeps both rows on a duplicate and links them with a conflict', async () => {
    await syncPush(scouter, { device_id: 'd-1', operations: [op({ row_id: 'e-1' })] }, ctx);
    const res = await syncPush(scouter, { device_id: 'd-2', operations: [op({
      op_id: 'op-dup', row_id: 'e-2', client_updated_at: '2026-11-14T09:08:00.000Z',
    })] }, ctx);

    expect(res.results[0]).toMatchObject({ status: 'duplicate', row_id: 'e-2', duplicate_row_id: 'e-1' });
    expect(ctx.rows.scouting_entries.has('e-1')).toBe(true);
    expect(ctx.rows.scouting_entries.has('e-2')).toBe(true);
    expect([...ctx.conflicts.values()][0]).toMatchObject({ kind: 'duplicate' });
  });

  it('treats two super entries for the same (event, team) as duplicates, with match_id null on both', async () => {
    const superOp = (rowId: string, opId: string) => op({
      op_id: opId, row_id: rowId,
      payload: { ...op().payload, form_kind: 'super', match_id: null, alliance: null, robot_status: null },
    });
    await syncPush(scouter, { device_id: 'd-1', operations: [superOp('s-1', 'o-s1')] }, ctx);
    const res = await syncPush(scouter, { device_id: 'd-2', operations: [superOp('s-2', 'o-s2')] }, ctx);
    expect(res.results[0]).toMatchObject({ status: 'duplicate', duplicate_row_id: 's-1' });
  });

  it('rejects with parent-deleted when the event, season, match or form version is gone', async () => {
    ctx.missingParents.add('ev-1');
    const res = await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'parent-deleted' });
    expect(ctx.rows.scouting_entries.size).toBe(0);
  });

  it('writes one conflict row per event so the review queue can be scoped and read offline', async () => {
    await syncPush(scouter, { device_id: 'd-1', operations: [op({ row_id: 'e-1' })] }, ctx);
    await syncPush(
      scouter,
      { device_id: 'd-2', operations: [op({ op_id: 'op-dup2', row_id: 'e-2' })] },
      ctx,
    );
    const conflict = [...ctx.conflicts.values()][0]!;
    expect(conflict.event_id).toBe('ev-1');
    expect(conflict.resolved_at ?? null).toBeNull();
  });
```

- [ ] **Step 2: Implement**

`applyEntry` becomes: parent check → **the task 1.14 authorization block, unchanged** → duplicate lookup → `classifyPush` → write the live row → write the conflict row when the decision is not fast-forward → `markApplied` → return the matching `PushResult`.

> **Keep 1.14's guard.** The fragment below starts at the parent check and says nothing about ownership or the five-minute window. That is because **neither changes** — the `scouter`-role ownership check and the `withinSelfEditWindow` / `edit-window-expired` branch stay exactly where task 1.14 put them, between the parent check and the duplicate lookup. If 1.14's five tests go red while you are doing this task, you deleted them. Put them back.

```ts
  if (!(await ctx.store.parentsExist({
    event_id: String(payload.event_id),
    match_id: payload.match_id === null ? null : String(payload.match_id),
    form_version_id: formVersionId,
  }))) {
    return rejected(op.op_id, 'parent-deleted', 'the event, match or form version no longer exists');
  }

  const duplicate =
    op.action === 'create'
      ? await ctx.store.findByLogicalKey(logicalKeyOf(payload as LogicalRow))
      : null;

  // Both rows come back as StoredRow, which promises only { id, version }. An entry row
  // always carries client_updated_at and deleted_at as well; asserting it here is
  // narrower and more honest than widening StoredRow for every table in the schema.
  const decision = classifyPush({
    operation: op,
    existingRow: existing as ExistingRow | null,
    duplicateRow: duplicate as ExistingRow | null,
  });

  await ctx.store.putRow('scouting_entry', op.row_id, {
    ...decision.live,
    id: op.row_id,
    version: decision.nextVersion,
    client_created_at: existing?.client_created_at ?? op.client_created_at,
    deleted_at: null,
  });
  await ctx.store.markApplied(op.op_id);

  if (decision.kind === 'fast-forward') {
    return { op_id: op.op_id, status: 'applied', row_id: op.row_id, new_version: decision.nextVersion };
  }

  const conflictId = crypto.randomUUID();
  if (decision.kind === 'divergence') {
    await ctx.store.insertConflict({
      id: conflictId,
      event_id: String(payload.event_id),
      entity: 'scouting_entry',
      row_id: op.row_id,
      kind: 'divergence',
      superseded_payload: decision.superseded.payload,
      superseded_author_id: decision.superseded.author_id,
      superseded_client_updated_at: decision.superseded.client_updated_at,
      base_version: decision.superseded.base_version,
    });
    return { op_id: op.op_id, status: 'divergence', row_id: op.row_id, new_version: decision.nextVersion, conflict_id: conflictId };
  }

  await ctx.store.insertConflict({
    id: conflictId,
    event_id: String(payload.event_id),
    entity: 'scouting_entry',
    row_id: op.row_id,
    kind: 'duplicate',
    duplicate_row_id: decision.duplicateRowId,
  });
  return {
    op_id: op.op_id, status: 'duplicate', row_id: op.row_id,
    new_version: decision.nextVersion, conflict_id: conflictId,
    duplicate_row_id: decision.duplicateRowId,
  };
```

- [ ] **Step 3: Run and commit**

```bash
pnpm --filter @frc/server exec vitest run && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(server): add divergence, duplicate and parent-deleted to the push protocol"
```

---

## Task 1.41: Server — `listConflicts` and `resolveConflict`

**Files:**
- Create: `apps/server/src/core/queries/conflicts.ts`, `apps/server/src/core/commands/resolveConflict.ts`
- Create: `apps/server/src/core/commands/resolveConflict.test.ts`, `apps/server/src/core/queries/conflicts.test.ts`
- Modify: `apps/server/src/routes/registry.ts`

**Interfaces:**
- Produces: `listConflicts(caller, { event_id, limit, cursor })` — the review queue with **both copies and a field-by-field diff**, showing the team, the match, **both authors' names** and both client timestamps; `resolveConflict(caller, { conflict_id, resolution })` — **lead or admin only**.

**Resolutions (SPEC-FINAL §9.5).** A **divergence** resolves by keeping the live copy or restoring the superseded one. A **duplicate** resolves by soft-deleting one of the two rows. Resolution sets `resolved_at` and `resolved_by`. A row has an open conflict **exactly while it has an unresolved `sync_conflicts` row** — there is no `conflict_state` column.

- [ ] **Step 1: Write the failing test**

`apps/server/src/core/commands/resolveConflict.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '@frc/shared';
import { resolveConflict } from './resolveConflict';
import { makeFakeContext, type FakeContext } from '../../test/fake-context';

const scouter: Caller = { kind: 'user', userId: 'u-s', role: 'scouter' };
const lead: Caller = { kind: 'user', userId: 'u-l', role: 'lead' };

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
  ctx.rows.scouting_entries.set('e-1', {
    id: 'e-1', version: 4, event_id: 'ev-1', data: { auto_notes: 9 },
    client_updated_at: '2026-11-14T09:09:00.000Z', deleted_at: null, scouter_id: 'u-s',
  } as never);
  ctx.rows.scouting_entries.set('e-2', {
    id: 'e-2', version: 1, event_id: 'ev-1', data: { auto_notes: 3 },
    client_updated_at: '2026-11-14T09:08:00.000Z', deleted_at: null, scouter_id: 'u-s',
  } as never);
  ctx.conflicts.set('c-div', {
    id: 'c-div', event_id: 'ev-1', entity: 'scouting_entry', row_id: 'e-1', kind: 'divergence',
    superseded_payload: { data: { auto_notes: 4 } }, superseded_author_id: 'u-s',
    superseded_client_updated_at: '2026-11-14T09:07:00.000Z', base_version: 1, resolved_at: null,
  } as never);
  ctx.conflicts.set('c-dup', {
    id: 'c-dup', event_id: 'ev-1', entity: 'scouting_entry', row_id: 'e-2', kind: 'duplicate',
    duplicate_row_id: 'e-1', resolved_at: null,
  } as never);
});

describe('resolveConflict (SPEC-FINAL 9.5)', () => {
  it('refuses a scouter — a flagged row is not settled until a lead or admin acts', async () => {
    await expect(resolveConflict(scouter, { conflict_id: 'c-div', resolution: { keep: 'live' } }, ctx))
      .rejects.toMatchObject({ code: 'forbidden' });
    expect(ctx.conflicts.get('c-div')!.resolved_at).toBeNull();
  });

  it('keeps the live copy and records who resolved it', async () => {
    await resolveConflict(lead, { conflict_id: 'c-div', resolution: { keep: 'live' } }, ctx);
    const conflict = ctx.conflicts.get('c-div')!;
    expect(conflict.resolved_at).not.toBeNull();
    expect(conflict.resolved_by).toBe('u-l');
    expect(ctx.rows.scouting_entries.get('e-1')!.data).toEqual({ auto_notes: 9 });
  });

  it('restores the superseded copy in full and bumps the version', async () => {
    await resolveConflict(lead, { conflict_id: 'c-div', resolution: { keep: 'superseded' } }, ctx);
    const row = ctx.rows.scouting_entries.get('e-1')!;
    expect(row.data).toEqual({ auto_notes: 4 });
    expect(row.version).toBe(5);
  });

  it('resolves a duplicate by soft-deleting the row that was not chosen', async () => {
    await resolveConflict(lead, { conflict_id: 'c-dup', resolution: { keep_row_id: 'e-1' } }, ctx);
    expect(ctx.rows.scouting_entries.get('e-2')!.deleted_at).not.toBeNull();
    expect(ctx.rows.scouting_entries.get('e-1')!.deleted_at).toBeNull();
    expect(ctx.conflicts.get('c-dup')!.resolved_at).not.toBeNull();
  });

  it('refuses to keep a row that is not one of the two linked rows', async () => {
    await expect(resolveConflict(lead, { conflict_id: 'c-dup', resolution: { keep_row_id: 'e-9' } }, ctx))
      .rejects.toMatchObject({ code: 'invalid' });
  });

  it('refuses the wrong resolution shape for the conflict kind', async () => {
    await expect(resolveConflict(lead, { conflict_id: 'c-div', resolution: { keep_row_id: 'e-1' } }, ctx))
      .rejects.toMatchObject({ code: 'invalid' });
  });

  it('is idempotent-safe: resolving an already-resolved conflict is refused, not silently redone', async () => {
    await resolveConflict(lead, { conflict_id: 'c-div', resolution: { keep: 'live' } }, ctx);
    await expect(resolveConflict(lead, { conflict_id: 'c-div', resolution: { keep: 'superseded' } }, ctx))
      .rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects a service caller', async () => {
    await expect(resolveConflict({ kind: 'service', label: 'mcp' }, { conflict_id: 'c-div', resolution: { keep: 'live' } }, ctx))
      .rejects.toMatchObject({ code: 'forbidden' });
  });
});
```

`apps/server/src/core/queries/conflicts.test.ts` asserts: the queue returns only unresolved conflicts by default; each item carries team number and name, match number, **both authors' full names**, both client timestamps, and a `diff` array of `{field_key, live, superseded}` for a divergence or `{field_key, a, b}` for a duplicate; it is bounded and paginated; every role may read it (resolution is what is gated); a `service` caller may read it.

- [ ] **Step 2: Run, implement, re-run, commit**

```bash
pnpm --filter @frc/server exec vitest run && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(server): add the conflict review queue and resolveConflict"
```

---

## Task 1.42: Client — parent-deleted records and the discarded-records log

**Files:**
- Create: `apps/client/src/data/discarded.ts`, `apps/client/src/data/discarded.test.ts`
- Create: `apps/client/src/features/sync/DiscardedNotice.tsx`, `apps/client/src/features/sync/DiscardedLogPage.tsx`
- Modify: `apps/client/src/data/outbox.ts` (handle `parent-deleted`), `apps/client/src/data/sync.ts`

**Interfaces:**
- Produces: `recordDiscarded(op, row)` and `listDiscarded()`; the dismissible notice; the read-only log page at `/sync/discarded`.

**Rules (SPEC-FINAL §9.7).** On `parent-deleted` the client **hard-deletes the local record and its outbox operation**. Before doing so it raises a **dismissible notice listing exactly what was discarded** — team, match, form kind, scouter, timestamp — so the loss is visible rather than silent, and writes it to a local, read-only **"discarded records" log kept for the life of the install**. **This is the only path in the product that destroys data a scouter typed**, and it runs only after an admin has hard-deleted the parent object.

- [ ] **Step 1: Write the failing test**

`apps/client/src/data/discarded.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/data/db';
import { ackResults, enqueue, pending } from './outbox';
import { listDiscarded } from './discarded';

const op = {
  op_id: 'o-1', entity: 'scouting_entry' as const, row_id: 'e-1', action: 'create' as const,
  base_version: null,
  payload: { event_id: 'ev-1', match_id: 'm-1', team_id: 't-1', form_kind: 'match', scouter_id: 'u-1' },
  author_user_id: 'u-1',
  client_created_at: '2026-11-14T09:00:00.000Z', client_updated_at: '2026-11-14T09:00:00.000Z', seq: 1,
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.rows.bulkPut([
    { entity: 'teams', id: 't-1', number: 2096, name: 'ROBACTIVE' },
    { entity: 'matches', id: 'm-1', event_id: 'ev-1', match_type: 'qualification', number: 12 },
    { entity: 'users', id: 'u-1', full_name: 'Seed Scouter' },
  ]);
});

describe('parent-deleted (SPEC-FINAL 9.7)', () => {
  it('hard-deletes the local record and its outbox operation', async () => {
    await enqueue(op);
    await db.rows.put({ entity: 'scouting_entries', id: 'e-1', event_id: 'ev-1' });
    await ackResults([{ op_id: 'o-1', status: 'rejected', reason: 'parent-deleted' }]);

    expect(await pending(10)).toHaveLength(0);
    expect(await db.rows.get(['scouting_entries', 'e-1'])).toBeUndefined();
  });

  it('writes what was discarded to the local log, naming team, match, kind, scouter and time', async () => {
    await enqueue(op);
    await ackResults([{ op_id: 'o-1', status: 'rejected', reason: 'parent-deleted' }]);
    const [entry] = await listDiscarded();
    expect(entry!.summary).toMatchObject({
      team: '2096 ROBACTIVE', match: 'Qualification 12', form_kind: 'match', scouter: 'Seed Scouter',
    });
    expect(entry!.reason).toMatch(/deleted by an admin/i);
  });

  it('keeps the log for the life of the install and never prunes it', async () => {
    await enqueue(op);
    await ackResults([{ op_id: 'o-1', status: 'rejected', reason: 'parent-deleted' }]);
    await db.close();
    await db.open();
    expect(await listDiscarded()).toHaveLength(1);
  });

  it('does NOT discard on any other rejection — those stay local for a human to look at', async () => {
    for (const reason of ['invalid', 'forbidden', 'edit-window-expired'] as const) {
      await db.delete(); await db.open();
      await enqueue(op);
      await ackResults([{ op_id: 'o-1', status: 'rejected', reason }]);
      expect(await pending(10), reason).toHaveLength(1);
      expect(await listDiscarded(), reason).toHaveLength(0);
    }
  });
});
```

- [ ] **Step 2: Implement, run and commit**

`ackResults` grows one branch: on `rejected` with `reason === 'parent-deleted'`, delete the outbox row, delete the cached row, delete the sync-state row, and append a `discarded` record whose `summary` is resolved from the cache. Every other rejection **leaves the record local** and surfaces it on the sync page.

```bash
pnpm --filter @frc/client exec vitest run src/data && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(client): handle parent-deleted records and keep a local discarded log"
```

---

## Task 1.43: Client — the sync page

**Files:**
- Create: `apps/client/src/features/sync/SyncPage.tsx`, `apps/client/src/features/sync/SyncPage.test.tsx`
- Modify: `apps/client/src/routes.tsx`

**Interfaces:**
- Produces: `/sync` — what synced, what is pending, when the last successful sync was, a manual **"sync now"** button, the rejected-operation list, a link to the discarded log, and the two guarded actions of tasks 1.48 and 1.49.

**Reference (SPEC-FINAL §17.9, Obsidian Sync):** the indicator names the state in words plus a count; there is a place to look listing what synced and what didn't; **conflicts are an explicit worklist you can finish**, not a passive warning.

- [ ] **Step 1: Write the failing test**

`apps/client/src/features/sync/SyncPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, setMeta } from '@/data/db';
import { enqueue } from '@/data/outbox';
import { SyncPage } from './SyncPage';

const op = (rowId: string) => ({
  op_id: `o-${rowId}`, entity: 'scouting_entry' as const, row_id: rowId, action: 'create' as const,
  base_version: null, payload: { team_id: 't-1', match_id: 'm-1' }, author_user_id: 'u-1',
  client_created_at: '2026-11-14T09:00:00.000Z', client_updated_at: '2026-11-14T09:00:00.000Z', seq: 1,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.rows.bulkPut([
    { entity: 'teams', id: 't-1', number: 2096, name: 'ROBACTIVE' },
    { entity: 'matches', id: 'm-1', event_id: 'ev-1', match_type: 'qualification', number: 12 },
  ]);
});

describe('SyncPage (SPEC-FINAL 9.10)', () => {
  it('shows the pending count and lists each pending record by team and match', async () => {
    await enqueue(op('e-1'));
    render(<SyncPage eventId="ev-1" syncNow={vi.fn()} />);
    expect(await screen.findByText(/1 waiting to sync/i)).toBeInTheDocument();
    expect(screen.getByText(/2096 ROBACTIVE/)).toBeInTheDocument();
    expect(screen.getByText(/Qualification 12/)).toBeInTheDocument();
  });

  it('shows when the last successful sync was, in DD/MM/YYYY and 24-hour time', async () => {
    await setMeta('sync.last_success_at', '2026-11-14T09:31:02.000Z');
    render(<SyncPage eventId="ev-1" syncNow={vi.fn()} />);
    expect(await screen.findByText(/14\/11\/2026/)).toBeInTheDocument();
  });

  it('says plainly that nothing is lost when there is nothing to sync', async () => {
    render(<SyncPage eventId="ev-1" syncNow={vi.fn()} />);
    expect(await screen.findByText(/everything on this device has reached the cloud/i)).toBeInTheDocument();
  });

  it('runs a manual sync when asked', async () => {
    const syncNow = vi.fn(async () => ({ status: 'ok' as const, pushed: 1, pulled: 2 }));
    const user = userEvent.setup();
    render(<SyncPage eventId="ev-1" syncNow={syncNow} />);
    await user.click(await screen.findByRole('button', { name: /sync now/i }));
    await waitFor(() => expect(syncNow).toHaveBeenCalled());
  });

  it('lists rejected operations for a human to look at, and never retries them silently', async () => {
    await enqueue(op('e-2'));
    await db.meta.put({ key: 'sync.rejections', value: [{ row_id: 'e-2', reason: 'invalid', detail: 'auto_notes is outside its expected range' }] });
    render(<SyncPage eventId="ev-1" syncNow={vi.fn()} />);
    expect(await screen.findByText(/outside its expected range/i)).toBeInTheDocument();
    expect(screen.getByText(/needs a person to look at it/i)).toBeInTheDocument();
  });

  it('links to the conflict worklist with its open count', async () => {
    await db.rows.put({ entity: 'sync_conflicts', id: 'c-1', event_id: 'ev-1', resolved_at: null });
    render(<SyncPage eventId="ev-1" syncNow={vi.fn()} />);
    expect(await screen.findByRole('link', { name: /1 conflict waiting/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement, run and commit**

```bash
pnpm --filter @frc/client exec vitest run src/features/sync && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(client): add the sync page with pending, rejected and last-sync detail"
```

---

## Task 1.44: Client — the conflict-review screen

**Files:**
- Create: `apps/client/src/features/sync/ConflictsPage.tsx`, `apps/client/src/features/sync/ConflictDiff.tsx`, `apps/client/src/features/sync/ConflictsPage.test.tsx`
- Modify: `apps/client/src/routes.tsx`

**Interfaces:**
- Produces: `/conflicts` — the worklist. It works at **any viewport width** (§17.2: it cannot wait for a laptop).

**Rules (SPEC-FINAL §9.5, §9.6).** The queue shows, for each item, the **team, the match, both authors' names, both client timestamps and a field-by-field diff**. Resolution requires a **lead or admin**; a scouter can read the queue but not resolve. **The queue is readable offline** — `sync_conflicts` is cached — but **resolving requires connectivity**, because resolution is a server command that must settle the row for everyone. Offline, the queue shows what is waiting and says resolution needs a connection.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/data/db';
import { ConflictsPage } from './ConflictsPage';

const divergence = {
  id: 'c-1', kind: 'divergence', team: '2096 ROBACTIVE', match: 'Qualification 12',
  live: { author: 'Dana Levi', client_updated_at: '2026-11-14T09:09:00.000Z', data: { auto_notes: 9, teleop_notes: 4 } },
  superseded: { author: 'Noa Cohen', client_updated_at: '2026-11-14T09:07:00.000Z', data: { auto_notes: 4, teleop_notes: 4 } },
  labels: { auto_notes: 'Auto notes', teleop_notes: 'Teleop notes' },
};

const duplicate = {
  id: 'c-2', kind: 'duplicate', team: '1577 Steampunk', match: 'Qualification 3',
  rows: [
    { row_id: 'e-1', author: 'Dana Levi', client_updated_at: '2026-11-14T09:00:00.000Z', data: { auto_notes: 1 } },
    { row_id: 'e-2', author: 'Noa Cohen', client_updated_at: '2026-11-14T09:05:00.000Z', data: { auto_notes: 3 } },
  ],
  labels: { auto_notes: 'Auto notes' },
};

const rpcFor = (resolve = vi.fn(async () => ({}))) => ({
  call: vi.fn(async (name: string) => {
    if (name === 'listConflicts') return { items: [divergence, duplicate], next_cursor: null };
    if (name === 'resolveConflict') return resolve();
    return {};
  }),
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

describe('ConflictsPage (SPEC-FINAL 9.5, 9.6)', () => {
  it('lists open conflicts with team, match, both authors and both client timestamps', async () => {
    render(<ConflictsPage eventId="ev-1" role="lead" rpc={rpcFor()} />);
    const item = await screen.findByRole('article', { name: /2096 ROBACTIVE/ });
    expect(item).toHaveTextContent('Qualification 12');
    expect(item).toHaveTextContent('Dana Levi');
    expect(item).toHaveTextContent('Noa Cohen');
    expect(item).toHaveTextContent('14/11/2026 09:09');
    expect(item).toHaveTextContent('14/11/2026 09:07');
  });

  it('shows a field-by-field diff and marks only the fields that differ', async () => {
    render(<ConflictsPage eventId="ev-1" role="lead" rpc={rpcFor()} />);
    const item = await screen.findByRole('article', { name: /2096 ROBACTIVE/ });
    expect(within(item).getByRole('row', { name: /Auto notes/ })).toHaveAttribute('data-differs', 'true');
    expect(within(item).getByRole('row', { name: /Teleop notes/ })).toHaveAttribute('data-differs', 'false');
  });

  it('offers keep-live and restore-superseded for a divergence', async () => {
    const rpc = rpcFor();
    const user = userEvent.setup();
    render(<ConflictsPage eventId="ev-1" role="lead" rpc={rpc} />);
    const item = await screen.findByRole('article', { name: /2096 ROBACTIVE/ });
    await user.click(within(item).getByRole('button', { name: /restore the other copy/i }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('resolveConflict', { conflict_id: 'c-1', resolution: { keep: 'superseded' } }),
    );
  });

  it('offers keep-this-one for each of the two rows of a duplicate', async () => {
    const rpc = rpcFor();
    const user = userEvent.setup();
    render(<ConflictsPage eventId="ev-1" role="lead" rpc={rpc} />);
    const item = await screen.findByRole('article', { name: /1577 Steampunk/ });
    expect(within(item).getAllByRole('button', { name: /keep this one/i })).toHaveLength(2);
    await user.click(within(item).getAllByRole('button', { name: /keep this one/i })[1]!);
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('resolveConflict', { conflict_id: 'c-2', resolution: { keep_row_id: 'e-2' } }),
    );
  });

  it('lets a scouter read the queue but disables every resolve action, saying who can', async () => {
    render(<ConflictsPage eventId="ev-1" role="scouter" rpc={rpcFor()} />);
    expect(await screen.findByRole('article', { name: /2096 ROBACTIVE/ })).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: /keep|restore/i })) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByText(/a lead or an admin resolves these/i)).toBeInTheDocument();
  });

  it('reads from the cache while offline and disables resolving, saying a connection is needed', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await db.rows.put({ entity: 'sync_conflicts', id: 'c-1', event_id: 'ev-1', resolved_at: null, kind: 'divergence' });
    render(<ConflictsPage eventId="ev-1" role="lead" rpc={rpcFor()} />);
    expect(await screen.findByText(/resolving needs a connection/i)).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: /keep|restore/i })) {
      expect(button).toBeDisabled();
    }
  });

  it('removes an item from the worklist once it is resolved, and shows a finished state at zero', async () => {
    const user = userEvent.setup();
    let listed = [divergence];
    const rpc = {
      call: vi.fn(async (name: string) => {
        if (name === 'listConflicts') return { items: listed, next_cursor: null };
        listed = [];
        return {};
      }),
    };
    render(<ConflictsPage eventId="ev-1" role="lead" rpc={rpc} />);
    const item = await screen.findByRole('article', { name: /2096 ROBACTIVE/ });
    await user.click(within(item).getByRole('button', { name: /keep the current copy/i }));
    expect(await screen.findByText(/nothing left to review/i)).toBeInTheDocument();
  });

  it('renders at 375 px as well as at 1280 px, because it cannot wait for a laptop', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    render(<ConflictsPage eventId="ev-1" role="lead" rpc={rpcFor()} />);
    expect(await screen.findByRole('article', { name: /2096 ROBACTIVE/ })).toBeInTheDocument();
    expect(screen.queryByText(/needs a computer/i)).not.toBeInTheDocument();
  });
});
```


- [ ] **Step 2: Implement, run and commit**

`ConflictDiff` compares the two `data` payloads key by key, renders each row as *label · live value · superseded value* with the differing rows marked, and uses `formatMetric`/`formatCount` so a number reads the same here as everywhere else. Resolving calls `resolveConflict` through the RPC client and then re-pulls.

```bash
pnpm --filter @frc/client exec vitest run src/features/sync && pnpm typecheck && pnpm lint
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(client): add the conflict-review worklist with a field-by-field diff"
```

---

## Task 1.45: Client — the offline capability matrix

**Files:**
- Create: `apps/client/src/data/offlineCapability.ts`, `apps/client/src/data/offlineCapability.test.ts`
- Create: `apps/client/src/components/OfflineGate.tsx`
- Modify: every route and action listed in the matrix below

**Interfaces:**
- Produces: `isAvailableOffline(capability): boolean` — SPEC-FINAL §9.6 as data; `<OfflineGate capability>` — wraps an action and, while offline, disables it and renders the `offline-needs-server` state whose muted line always says **the data is safe on the device**.

**The matrix, verbatim from §9.6.**

| Capability | Offline |
|---|---|
| Create a scouting entry, and the 5-minute self-edit | **editable** |
| Bare match auto-creation while scouting an unlisted number | **editable** |
| Pick lists (admin), including reorder | **editable** *(feature is phase 2; the flag ships now)* |
| Do-not-pick — admin add/edit/remove, and a lead's addition | **editable** *(phase 2)* |
| The alliance bracket, including declines | **editable** *(phase 2)* |
| Statistics, rankings, metrics | **viewable**, computed on-device from raw entries |
| Saved dashboards | **viewable** from cache; saving or editing needs connectivity |
| A lead's draft statistics page | **creatable** offline, discarded on exit |
| The conflict-review queue | **readable**; **resolving requires connectivity** |
| Form definition editing | **not available** |
| User management | **not available** |
| Switching the active event, and any cross-event view | **not available** |
| Season, event, match and roster management | **not available** |
| Resolving conflicts | **not available** |

- [ ] **Step 1: Write the failing test**

`apps/client/src/data/offlineCapability.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isAvailableOffline, OFFLINE_CAPABILITY } from './offlineCapability';

describe('the offline capability matrix (SPEC-FINAL 9.6)', () => {
  it('allows entry creation, the self-edit and bare match auto-creation', () => {
    for (const capability of ['create_entry', 'self_edit_entry', 'ensure_match'] as const) {
      expect(isAvailableOffline(capability), capability).toBe(true);
    }
  });

  it('allows alliance-selection editing, which all rides the same outbox', () => {
    for (const capability of ['edit_pick_list', 'add_do_not_pick', 'edit_alliance_bracket'] as const) {
      expect(isAvailableOffline(capability), capability).toBe(true);
    }
  });

  it('allows reading statistics and saved dashboards, and creating a draft dashboard', () => {
    for (const capability of ['view_statistics', 'view_saved_dashboard', 'create_draft_dashboard', 'read_conflicts'] as const) {
      expect(isAvailableOffline(capability), capability).toBe(true);
    }
  });

  it('refuses everything that needs the server', () => {
    for (const capability of [
      'save_dashboard', 'edit_form', 'manage_users', 'switch_active_event',
      'cross_event_view', 'manage_events', 'resolve_conflict',
    ] as const) {
      expect(isAvailableOffline(capability), capability).toBe(false);
    }
  });

  it('covers every capability the app gates on, with no silent default', () => {
    expect(Object.keys(OFFLINE_CAPABILITY).length).toBeGreaterThanOrEqual(14);
    // @ts-expect-error a capability that is not in the matrix must not typecheck
    expect(() => isAvailableOffline('invented')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement, run and commit**

`OfflineGate` renders its children enabled while online, and while offline renders them disabled with a `StateMessage variant="offline-needs-server"` beneath: *"This needs a connection. Everything you have entered is safe on this device and will sync when you are back online."*

```bash
pnpm --filter @frc/client exec vitest run && pnpm typecheck && pnpm lint
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(client): encode the offline capability matrix and gate every server-only action"
```

---
# Phase 1 G — QR fallback transfer and the device wipe (§20.2.7)

The venue workflow this exists for: **a central tablet collects scouters' data by QR inside the arena, and a runner carries that tablet outside every few matches to sync it to the cloud.**

---

## Task 1.46: Shared — the QR frame codec

**Files:**
- Create: `packages/shared/src/qr/codec.ts`, `packages/shared/src/qr/codec.test.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/package.json` (add `"fflate": "^0.8.2"`)

**Interfaces:**
- Produces: `encodeBatch(operations): Uint8Array[]` — the frames; `newCollector()` with `add(frame)`, `progress()`, `isComplete()`, `result()`; `QR_FRAME_BYTES = 2300`, `QR_HEADER_BYTES = 12`, `QR_BATCH_MAX_OPERATIONS = 200`, `QR_FRAMES_PER_SECOND = 5`.

**The encoding, exactly (SPEC-FINAL §9.8, D12).** Payload = the sender's pending outbox operations as JSON. Compression = **`fflate` raw deflate**. Framing = the compressed byte stream split into frames of **2,300 bytes**. Frame header = **12 bytes: 4-byte batch id, 2-byte frame index, 2-byte frame count, 4-byte CRC32 of the *whole* compressed payload**. The receiver collects frames by index and completes when it holds all N; **order does not matter**, and because the sender loops indefinitely a frame missed on one pass is caught on the next. A batch is capped at **200 operations** and larger backlogs split into consecutive batches, each with its own batch id.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/qr/codec.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Operation } from '../sync/operation';
import {
  encodeBatch, newCollector, QR_BATCH_MAX_OPERATIONS, QR_FRAME_BYTES, QR_HEADER_BYTES,
} from './codec';

const op = (i: number): Operation => ({
  op_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  entity: 'scouting_entry',
  row_id: `00000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`,
  action: 'create',
  base_version: null,
  payload: {
    event_id: 'ev-1', form_kind: 'match', team_id: `t-${i % 30}`, match_id: `m-${i % 20}`,
    alliance: i % 2 ? 'red' : 'blue', robot_status: 'played',
    data: { auto_notes: i % 5, teleop_notes: (i * 7) % 19, notes: 'הרובוט היה איטי' },
  },
  author_user_id: '00000000-0000-4000-8000-000000000006',
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  seq: i,
});

describe('QR codec (SPEC-FINAL 9.8)', () => {
  it('uses the documented parameters', () => {
    expect(QR_FRAME_BYTES).toBe(2300);
    expect(QR_HEADER_BYTES).toBe(12);
    expect(QR_BATCH_MAX_OPERATIONS).toBe(200);
  });

  it('round-trips a batch through frames', () => {
    const operations = Array.from({ length: 40 }, (_, i) => op(i));
    const frames = encodeBatch(operations);
    const collector = newCollector();
    for (const frame of frames) collector.add(frame);
    expect(collector.isComplete()).toBe(true);
    expect(collector.result()).toEqual(operations);
  });

  it('completes regardless of frame order, which is what makes a cyclic display work', () => {
    const operations = Array.from({ length: 60 }, (_, i) => op(i));
    const frames = encodeBatch(operations);
    const collector = newCollector();
    for (const frame of [...frames].reverse()) collector.add(frame);
    expect(collector.isComplete()).toBe(true);
    expect(collector.result()).toHaveLength(60);
  });

  it('ignores a repeated frame, so looping the display forever is harmless', () => {
    const frames = encodeBatch([op(1), op(2)]);
    const collector = newCollector();
    collector.add(frames[0]!);
    collector.add(frames[0]!);
    expect(collector.progress()).toEqual({ collected: 1, total: frames.length });
  });

  it('keeps every frame inside the QR byte budget', () => {
    for (const frame of encodeBatch(Array.from({ length: 200 }, (_, i) => op(i)))) {
      expect(frame.byteLength).toBeLessThanOrEqual(QR_FRAME_BYTES + QR_HEADER_BYTES);
    }
  });

  it('produces roughly nine to thirteen frames for a realistic backlog of a hundred entries', () => {
    const frames = encodeBatch(Array.from({ length: 100 }, (_, i) => op(i)));
    expect(frames.length).toBeGreaterThanOrEqual(4);
    expect(frames.length).toBeLessThanOrEqual(20);
  });

  it('refuses a batch above the 200-operation cap', () => {
    expect(() => encodeBatch(Array.from({ length: 201 }, (_, i) => op(i)))).toThrow(/200/);
  });

  it('rejects a frame from another batch', () => {
    const a = encodeBatch([op(1)]);
    const b = encodeBatch([op(2)]);
    const collector = newCollector();
    collector.add(a[0]!);
    expect(() => collector.add(b[0]!)).toThrow(/different batch/i);
  });

  it('refuses a payload whose CRC does not match, rather than handing back nonsense', () => {
    const frames = encodeBatch([op(1)]);
    const corrupted = new Uint8Array(frames[0]!);
    corrupted[corrupted.length - 1] ^= 0xff;
    const collector = newCollector();
    collector.add(corrupted);
    expect(() => collector.result()).toThrow(/checksum/i);
  });

  it('survives Hebrew text, because the payload is bytes and not base64', () => {
    const operations = [op(1)];
    const collector = newCollector();
    for (const frame of encodeBatch(operations)) collector.add(frame);
    expect((collector.result()[0]!.payload.data as { notes: string }).notes).toBe('הרובוט היה איטי');
  });
});
```

- [ ] **Step 2: Run and watch fail, then implement**

`packages/shared/src/qr/codec.ts`:

```ts
import { deflateSync, inflateSync } from 'fflate';
import type { Operation } from '../sync/operation';

export const QR_FRAME_BYTES = 2300;
export const QR_HEADER_BYTES = 12;
export const QR_BATCH_MAX_OPERATIONS = 200;
export const QR_FRAMES_PER_SECOND = 5;

function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

/** 12-byte header: batch id (4) · frame index (2) · frame count (2) · CRC32 of the whole payload (4). */
function writeHeader(view: DataView, batchId: number, index: number, count: number, crc: number): void {
  view.setUint32(0, batchId, false);
  view.setUint16(4, index, false);
  view.setUint16(6, count, false);
  view.setUint32(8, crc, false);
}

export function encodeBatch(operations: Operation[], batchId = Math.floor(Math.random() * 0xffffffff)): Uint8Array[] {
  if (operations.length > QR_BATCH_MAX_OPERATIONS) {
    throw new Error(`a QR batch holds at most ${QR_BATCH_MAX_OPERATIONS} operations`);
  }
  const json = new TextEncoder().encode(JSON.stringify(operations));
  const compressed = deflateSync(json, { level: 9 });
  const crc = crc32(compressed);
  const count = Math.max(1, Math.ceil(compressed.byteLength / QR_FRAME_BYTES));

  return Array.from({ length: count }, (_, index) => {
    const slice = compressed.subarray(index * QR_FRAME_BYTES, (index + 1) * QR_FRAME_BYTES);
    const frame = new Uint8Array(QR_HEADER_BYTES + slice.byteLength);
    writeHeader(new DataView(frame.buffer), batchId, index, count, crc);
    frame.set(slice, QR_HEADER_BYTES);
    return frame;
  });
}

export type Collector = {
  add(frame: Uint8Array): void;
  progress(): { collected: number; total: number | null };
  isComplete(): boolean;
  result(): Operation[];
};

export function newCollector(): Collector {
  let batchId: number | null = null;
  let total: number | null = null;
  let crc: number | null = null;
  const frames = new Map<number, Uint8Array>();

  return {
    add(frame: Uint8Array): void {
      if (frame.byteLength < QR_HEADER_BYTES) throw new Error('frame is too short to be a batch frame');
      const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
      const id = view.getUint32(0, false);
      if (batchId === null) {
        batchId = id;
        total = view.getUint16(6, false);
        crc = view.getUint32(8, false);
      } else if (id !== batchId) {
        throw new Error('that code belongs to a different batch — finish this one or start again');
      }
      frames.set(view.getUint16(4, false), frame.slice(QR_HEADER_BYTES));
    },
    progress: () => ({ collected: frames.size, total }),
    isComplete: () => total !== null && frames.size === total,
    result(): Operation[] {
      if (total === null || frames.size !== total) throw new Error('the batch is not complete yet');
      const parts = Array.from({ length: total }, (_, i) => frames.get(i));
      if (parts.some((p) => p === undefined)) throw new Error('the batch is not complete yet');
      const compressed = new Uint8Array(parts.reduce((n, p) => n + p!.byteLength, 0));
      let offset = 0;
      for (const part of parts) {
        compressed.set(part!, offset);
        offset += part!.byteLength;
      }
      if (crc32(compressed) !== crc) {
        throw new Error('checksum failed — scan the batch again');
      }
      return JSON.parse(new TextDecoder().decode(inflateSync(compressed))) as Operation[];
    },
  };
}
```

- [ ] **Step 3: Run and commit**

```bash
pnpm install && pnpm vitest run packages/shared && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(shared): add the deflate + framed QR codec with CRC verification"
```

---

## Task 1.47: Client — the QR sender

**Files:**
- Create: `apps/client/src/features/qr/QrSendPage.tsx`, `apps/client/src/features/qr/QrSendPage.test.tsx`
- Modify: `apps/client/package.json` (add `"qrcode": "^1.5.4"`, `"@types/qrcode": "^1.5.5"`), `apps/client/src/routes.tsx`

**Interfaces:**
- Produces: `/sync/qr/send` — renders the pending outbox as frames and **cycles them at 5 frames per second, 1…N, 1…N, indefinitely** until the sender stops.

**Rules.** QR parameters: **version 40, error-correction level M, byte mode** (binary — no base64 expansion). **The sender keeps its outbox pending**: a QR scan is a backup hop, not a confirmed sync, so the data now exists on both devices and is strictly more durable.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/data/db';
import { enqueue } from '@/data/outbox';
import { pending } from '@/data/outbox';
import { QrSendPage } from './QrSendPage';

const toCanvas = vi.fn(async () => undefined);
vi.mock('qrcode', () => ({ default: { toCanvas: (...args: unknown[]) => toCanvas(...args) } }));

const op = (i: number) => ({
  op_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  entity: 'scouting_entry' as const,
  row_id: `00000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`,
  action: 'create' as const, base_version: null,
  payload: { event_id: 'ev-1', team_id: 't-1', match_id: 'm-1', form_kind: 'match', data: { auto_notes: i } },
  author_user_id: '00000000-0000-4000-8000-000000000006',
  client_created_at: '2026-11-14T09:00:00.000Z', client_updated_at: '2026-11-14T09:00:00.000Z', seq: i,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  toCanvas.mockClear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('QrSendPage (SPEC-FINAL 9.8)', () => {
  it('says plainly when there is nothing to send', async () => {
    render(<QrSendPage />);
    expect(await screen.findByText(/everything on this device has already reached the cloud/i)).toBeInTheDocument();
    expect(toCanvas).not.toHaveBeenCalled();
  });

  it('splits a backlog above 200 operations into consecutive batches with their own ids', async () => {
    for (let i = 0; i < 205; i += 1) await enqueue(op(i));
    render(<QrSendPage />);
    expect(await screen.findByText(/batch 1 of 2/i)).toBeInTheDocument();
  });

  it('renders a QR code in byte mode at error-correction level M', async () => {
    await enqueue(op(1));
    render(<QrSendPage />);
    await waitFor(() => expect(toCanvas).toHaveBeenCalled());
    const [, segments, options] = toCanvas.mock.calls[0]!;
    expect((segments as { mode: string }[])[0]!.mode).toBe('byte');
    expect(options).toMatchObject({ errorCorrectionLevel: 'M', version: 40 });
  });

  it('advances one frame every 200 ms and wraps from the last frame back to the first', async () => {
    for (let i = 0; i < 60; i += 1) await enqueue(op(i));
    render(<QrSendPage />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/frame 1 of \d+/i));
    const total = Number(screen.getByRole('status').textContent!.match(/of (\d+)/)![1]);
    vi.advanceTimersByTime(200 * (total - 1));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(`frame ${total} of ${total}`));
    vi.advanceTimersByTime(200);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(`frame 1 of ${total}`));
  });

  it('keeps every pending operation in the outbox after sending — a scan is not an ack', async () => {
    await enqueue(op(1));
    render(<QrSendPage />);
    vi.advanceTimersByTime(5000);
    expect(await pending(10)).toHaveLength(1);
  });

  it('stops cleanly and releases the timer when the page unmounts', async () => {
    await enqueue(op(1));
    const { unmount } = render(<QrSendPage />);
    await waitFor(() => expect(toCanvas).toHaveBeenCalled());
    const before = toCanvas.mock.calls.length;
    unmount();
    vi.advanceTimersByTime(2000);
    expect(toCanvas.mock.calls.length).toBe(before);
  });
});
```


- [ ] **Step 2: Implement, run and commit**

The page reads `pending(QR_BATCH_MAX_OPERATIONS)`, calls `encodeBatch`, renders `QRCode.toCanvas(canvas, [{ data: frame, mode: 'byte' }], { errorCorrectionLevel: 'M', version: 40 })`, and steps the index on a `setInterval(1000 / QR_FRAMES_PER_SECOND)`. It never calls `ackResults`.

```bash
pnpm install && pnpm --filter @frc/client exec vitest run src/features/qr && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(client): add the QR sender with a cyclic five-per-second frame display"
```

---

## Task 1.48: Client — the QR receiver and disposal on ack

**Files:**
- Create: `apps/client/src/features/qr/QrReceivePage.tsx`, `apps/client/src/features/qr/QrReceivePage.test.tsx`
- Create: `apps/client/src/data/qrReceive.ts`, `apps/client/src/data/qrReceive.test.ts`
- Modify: `apps/client/src/data/outbox.ts`, `apps/client/package.json` (add `"@zxing/browser": "^0.1.5"`)

**Interfaces:**
- Produces: `receiveOperations(operations)` — writes each received operation into **both** the receiver's local dataset **and** its outbox, marked `origin: 'qr'`; `discardReceivedQrData()` — the manual escape hatch; the scanning page at `/sync/qr/receive` using `@zxing/browser` continuous scan from the rear camera.

**Rules (SPEC-FINAL §9.8).** QR transfer is **additive and idempotent**: copies keep their **original UUIDs, author and client timestamps** and are **never re-authored**. The receiver pushes them under its own bearer, and `syncPush` authorizes each against its own `author_user_id`. **Disposal is on ack, not on a timer**: a record with `origin: 'qr'` is discarded from the receiving device the moment its cloud acknowledgment arrives — **never before**. On ack the copy is removed from the outbox and its marker cleared; **the row itself stays in the local dataset** as an ordinary cached row, so the collector tablet's own statistics stay correct. The escape hatch removes every `origin: 'qr'` record and is **refused for any record without a cloud ack**, reporting how many it would refuse and stopping rather than partially clearing.

**One representation detail this task must get right.** "Clear the `origin: 'qr'` marker on ack" and "the escape hatch removes every `origin: 'qr'` record" cannot both read the same field, or a batch that has just been acked becomes invisible to the escape hatch. So the sync-state record carries **two** things:

```ts
{ row_id, sync_state, acked_at, origin, received_by_qr }
```

`origin` is what the **outbox** consults and is cleared on ack, exactly as §9.8 says. `received_by_qr` is a permanent fact about where the row came from, and it is what **"discard received QR data"** selects on. The wipe guard reads `sync_state`, as it always did.

- [ ] **Step 1: Write the failing test**

`apps/client/src/data/qrReceive.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Operation } from '@frc/shared';
import { db } from './db';
import { ackResults, pending, syncStateOf } from './outbox';
import { discardReceivedQrData, receiveOperations } from './qrReceive';

const foreign = (rowId: string): Operation => ({
  op_id: `o-${rowId}`, entity: 'scouting_entry', row_id: rowId, action: 'create', base_version: null,
  payload: { event_id: 'ev-1', team_id: 't-1', match_id: 'm-1', form_kind: 'match', data: { auto_notes: 2 } },
  author_user_id: 'u-other',
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  seq: 7,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('QR receive (SPEC-FINAL 9.8)', () => {
  it('writes each operation into the dataset AND the outbox, marked origin qr', async () => {
    await receiveOperations([foreign('e-1')]);
    expect(await db.rows.get(['scouting_entries', 'e-1'])).toBeDefined();
    expect(await pending(10)).toHaveLength(1);
    expect((await syncStateOf('e-1'))!.origin).toBe('qr');
  });

  it('never re-authors a copy', async () => {
    await receiveOperations([foreign('e-1')]);
    const [op] = await pending(10);
    expect(op!.author_user_id).toBe('u-other');
    expect(op!.row_id).toBe('e-1');
    expect(op!.client_created_at).toBe('2026-11-14T09:00:00.000Z');
  });

  it('is idempotent: scanning the same batch twice changes nothing', async () => {
    await receiveOperations([foreign('e-1')]);
    await receiveOperations([foreign('e-1')]);
    expect(await pending(10)).toHaveLength(1);
    expect(await db.rows.where('entity').equals('scouting_entries').count()).toBe(1);
  });

  it('drops the copy from the outbox on ack but keeps the row in the dataset', async () => {
    await receiveOperations([foreign('e-1')]);
    await ackResults([{ op_id: 'o-e-1', status: 'applied', row_id: 'e-1', new_version: 1 }]);
    expect(await pending(10)).toHaveLength(0);
    expect(await db.rows.get(['scouting_entries', 'e-1'])).toBeDefined();
    expect((await syncStateOf('e-1'))!.origin).toBe('local');
  });

  it('never discards a QR copy before its ack, however long that takes', async () => {
    await receiveOperations([foreign('e-1')]);
    const result = await discardReceivedQrData();
    expect(result).toEqual({ discarded: 0, refused: 1 });
    expect(await pending(10)).toHaveLength(1);
  });

  it('discards acked QR copies when asked, and stops rather than partially clearing', async () => {
    await receiveOperations([foreign('e-1'), foreign('e-2')]);
    await ackResults([{ op_id: 'o-e-1', status: 'applied', row_id: 'e-1', new_version: 1 }]);
    const result = await discardReceivedQrData();
    expect(result).toEqual({ discarded: 0, refused: 1 });
    await ackResults([{ op_id: 'o-e-2', status: 'applied', row_id: 'e-2', new_version: 1 }]);
    expect(await discardReceivedQrData()).toEqual({ discarded: 2, refused: 0 });
  });

  it('leaves the device’s own records alone', async () => {
    await db.rows.put({ entity: 'scouting_entries', id: 'mine', event_id: 'ev-1' });
    await db.syncState.put({ row_id: 'mine', sync_state: 'acked', acked_at: 'now', origin: 'local' });
    await receiveOperations([foreign('e-1')]);
    await ackResults([{ op_id: 'o-e-1', status: 'applied', row_id: 'e-1', new_version: 1 }]);
    await discardReceivedQrData();
    expect(await db.rows.get(['scouting_entries', 'mine'])).toBeDefined();
  });
});
```

- [ ] **Step 2: Implement, run and commit**

`QrReceivePage` runs `BrowserQRCodeReader.decodeFromVideoDevice` with `facingMode: 'environment'`, feeds every decoded byte array into a `Collector`, shows *"frames 7 of 11"* and a clear **batch complete** state, then calls `receiveOperations(collector.result())`.

```bash
pnpm install && pnpm --filter @frc/client exec vitest run && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(client): add the QR receiver with ack-gated disposal of transferred copies"
```

---

## Task 1.49: Client — the lead-approved device wipe

**Files:**
- Create: `apps/client/src/features/settings/DeviceWipe.tsx`, `apps/client/src/features/settings/DeviceWipe.test.tsx`
- Create: `apps/client/src/data/wipe.ts`, `apps/client/src/data/wipe.test.ts`

**Interfaces:**
- Produces: `wipeDevice(code)` — refused unless the code matches `VITE_DEVICE_WIPE_CODE` **and** every record on the device has a cloud ack.

**Rules (SPEC-FINAL §9.9).** The code is a guard against accidents, **not a secret** — a client-side build variable is visible in the bundle, and this is accepted. **The wipe is refused for any record without a cloud ack**, so it can never destroy unsynced data; if unacked records exist the action reports how many and refuses. It is a multi-record irreversible, so it uses **type-to-confirm** (§17.8).

- [ ] **Step 1: Write the failing test**

`apps/client/src/data/wipe.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { enqueue } from './outbox';
import { wipeDevice } from './wipe';

vi.mock('@/config', () => ({ clientConfig: () => ({ apiBaseUrl: 'x', deviceWipeCode: '2096', appVersion: 'v' }) }));

const op = {
  op_id: 'o-1', entity: 'scouting_entry' as const, row_id: 'e-1', action: 'create' as const,
  base_version: null, payload: {}, author_user_id: 'u-1',
  client_created_at: '2026-11-14T09:00:00.000Z', client_updated_at: '2026-11-14T09:00:00.000Z', seq: 1,
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('wipeDevice (SPEC-FINAL 9.9)', () => {
  it('refuses a wrong code', async () => {
    await expect(wipeDevice('0000')).resolves.toMatchObject({ ok: false, reason: 'wrong-code' });
  });

  it('refuses while any record lacks a cloud ack, and says how many', async () => {
    await enqueue(op);
    await expect(wipeDevice('2096')).resolves.toMatchObject({ ok: false, reason: 'unacked', unacked: 1 });
    expect(await db.outbox.count()).toBe(1);
  });

  it('wipes the dataset, the drafts and the watermark when everything is acked', async () => {
    await db.rows.put({ entity: 'scouting_entries', id: 'e-1', event_id: 'ev-1' });
    await db.syncState.put({ row_id: 'e-1', sync_state: 'acked', acked_at: 'now', origin: 'local' });
    await db.drafts.put({ key: 'k', row_id: '', payload: {}, updated_at: 'now' });

    await expect(wipeDevice('2096')).resolves.toMatchObject({ ok: true });
    expect(await db.rows.count()).toBe(0);
    expect(await db.drafts.count()).toBe(0);
    expect(await db.meta.get('sync.watermark')).toBeUndefined();
  });

  it('keeps the discarded-records log, which is kept for the life of the install', async () => {
    await db.discarded.put({ id: 'd-1', discarded_at: 'now', reason: 'x', summary: {} });
    await wipeDevice('2096');
    expect(await db.discarded.count()).toBe(1);
  });
});
```

- [ ] **Step 2: Implement, run and commit**

`DeviceWipe` sits on the settings page behind `ConfirmDialog typeToConfirm`, shows the unacked count live, and disables the confirm button entirely while it is above zero, with the line *"4 records on this device have not reached the cloud. Sync first — this action will not run."*

```bash
pnpm --filter @frc/client exec vitest run && pnpm typecheck && pnpm lint
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(client): add the lead-approved device wipe, refused while anything is unacked"
```

---

# Phase 1 H — browse and search (§20.2.8)

---

## Task 1.50: Server — the browse and search queries

**Files:**
- Create: `apps/server/src/core/queries/search.ts`, `apps/server/src/core/queries/search.test.ts`
- Modify: `apps/server/src/routes/registry.ts`, `apps/server/src/repos/store.ts`, `apps/server/src/test/fake-context.ts` (implement `seedSmallSeason` and `softDelete`, and the four query stubs)

**Interfaces:**
- Produces: `searchTeams`, `listTeamEvents`, `queryEntries`, `getEntry` — all bounded and paginated, all callable by every role and by a `service` caller.

**Rules.** `searchTeams` searches **all teams in the season** by number or name, and marks a team **in the active event** with its rank (§13.2). `listTeamEvents` returns the events a team **has entries at** — that is what powers the cross-event jump. `queryEntries` lists entries of **one event only**, **both `match` and `super` kinds with a kind filter**, searchable by team name, team number, match number and scouter name, each row carrying the entry's **scouted points**. `getEntry` returns one entry fully rendered with its derived score and the **scouter's name** (§18.5: query outputs keep scouter names; no redaction).

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '@frc/shared';
import { getEntry, listTeamEvents, queryEntries, searchTeams } from './search';
import { makeFakeContext, type FakeContext } from '../../test/fake-context';

const scouter: Caller = { kind: 'user', userId: 'u-s', role: 'scouter' };
const service: Caller = { kind: 'service', label: 'mcp' };

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
  ctx.seedSmallSeason(); // se-1, ev-1 (active) and ev-2, teams t-1..t-3, entries e-1..e-12
});

describe('searchTeams (SPEC-FINAL 13.2)', () => {
  it('matches by number and by name, across the whole season', async () => {
    expect((await searchTeams(scouter, { query: '2096' }, ctx)).items.map((t) => t.id)).toContain('t-1');
    expect((await searchTeams(scouter, { query: 'robactive' }, ctx)).items.map((t) => t.id)).toContain('t-1');
  });

  it('marks teams in the active event with their rank and leaves others unranked', async () => {
    const items = (await searchTeams(scouter, { query: '' }, ctx)).items;
    expect(items.find((t) => t.id === 't-1')!.rank).toBe(1);
    expect(items.find((t) => t.id === 't-3')!.rank).toBeNull();
  });

  it('is bounded and paginated, and never returns the whole registry at once', async () => {
    const page = await searchTeams(scouter, { query: '', limit: 2 }, ctx);
    expect(page.items).toHaveLength(2);
    expect(page.next_cursor).not.toBeNull();
  });
});

describe('listTeamEvents', () => {
  it('returns only events where we hold entries for that team', async () => {
    const events = await listTeamEvents(scouter, { team_id: 't-1' }, ctx);
    expect(events.items.map((e) => e.id)).toEqual(['ev-1']);
  });
});

describe('queryEntries (SPEC-FINAL 13.3)', () => {
  it('returns entries of one event only, never another', async () => {
    const result = await queryEntries(scouter, { event_id: 'ev-1' }, ctx);
    expect(result.items.every((e) => e.event_id === 'ev-1')).toBe(true);
  });

  it('filters by form kind, and returns both kinds when unfiltered', async () => {
    const matchOnly = await queryEntries(scouter, { event_id: 'ev-1', form_kind: 'match' }, ctx);
    expect(matchOnly.items.every((e) => e.form_kind === 'match')).toBe(true);
    const both = await queryEntries(scouter, { event_id: 'ev-1' }, ctx);
    expect(new Set(both.items.map((e) => e.form_kind)).size).toBe(2);
  });

  it('matches a scouter name, a team name, a team number and a match number', async () => {
    for (const query of ['Seed Scouter', 'ROBACTIVE', '2096', '3']) {
      expect((await queryEntries(scouter, { event_id: 'ev-1', query }, ctx)).items.length, query).toBeGreaterThan(0);
    }
  });

  it('never returns a soft-deleted entry', async () => {
    ctx.softDelete('e-1');
    const result = await queryEntries(scouter, { event_id: 'ev-1' }, ctx);
    expect(result.items.map((e) => e.id)).not.toContain('e-1');
  });

  it('carries each row scouted points, computed by the shared engine', async () => {
    const result = await queryEntries(scouter, { event_id: 'ev-1' }, ctx);
    const played = result.items.find((e) => e.robot_status === 'played')!;
    expect(typeof played.scouted_points).toBe('number');
    const noShow = result.items.find((e) => e.robot_status === 'no_show');
    if (noShow) expect(noShow.scouted_points).toBeNull();
  });
});

describe('getEntry (SPEC-FINAL 13.4, 18.5)', () => {
  it('returns every field value by phase, the score, and the scouter full name', async () => {
    const entry = await getEntry(scouter, { entry_id: 'e-1' }, ctx);
    expect(entry.scouter_name).toBe('Seed Scouter');
    expect(entry.phases.map((p) => p.phase)).toEqual(['auto', 'teleop', 'endgame', 'post_match']);
    expect(typeof entry.scouted_points).toBe('number');
  });

  it('returns not-found for a soft-deleted entry', async () => {
    ctx.softDelete('e-1');
    await expect(getEntry(scouter, { entry_id: 'e-1' }, ctx)).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('the service caller', () => {
  it('may call all four, because they are queries', async () => {
    await expect(searchTeams(service, { query: '' }, ctx)).resolves.toBeTruthy();
    await expect(listTeamEvents(service, { team_id: 't-1' }, ctx)).resolves.toBeTruthy();
    await expect(queryEntries(service, { event_id: 'ev-1' }, ctx)).resolves.toBeTruthy();
    await expect(getEntry(service, { entry_id: 'e-1' }, ctx)).resolves.toBeTruthy();
  });
});
```


- [ ] **Step 2: Implement, run, commit**

The rule that matters here: **SQL fetches rows, the shared engine computes the score.** `queryEntries` filters and pages in SQL over typed columns, then hands the rows to `scoreEntry` from `packages/shared` (task 1.54). Nothing flattens the JSONB in the database.

```bash
pnpm --filter @frc/server exec vitest run && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(server): add team search, entry search and entry read queries"
```

---

## Task 1.51: Client — the team search page

**Files:**
- Create: `apps/client/src/features/teams/TeamSearchPage.tsx`, `apps/client/src/features/teams/TeamSearchPage.test.tsx`, `apps/client/src/features/teams/CrossEventJump.tsx`
- Modify: `apps/client/src/routes.tsx`

**Interfaces:**
- Produces: `/teams` — search all teams in the season by number or name.

**Rules (SPEC-FINAL §13.2).** A team **in the active event** shows a **small side rank badge**, and the **top 3 carry a medal icon**; teams not in the active event show no rank. A team in the active event gets a button to its team page. A team **not** in the active event gets a **differently-styled button** → pick from the **events that team competed at** → an **"are you sure?" confirmation** → on yes, switch the active event as a **session-only override** and land on that team's page. **The whole cross-event path is disabled offline.**

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionOverride } from '@/features/context/sessionOverride';
import { TeamSearchPage } from './TeamSearchPage';

const teams = [
  { id: 't-1', number: 2096, name: 'ROBACTIVE', rank: 1, in_active_event: true },
  { id: 't-2', number: 1577, name: 'Steampunk', rank: 3, in_active_event: true },
  { id: 't-3', number: 5987, name: 'Galaxia', rank: 9, in_active_event: true },
  { id: 't-4', number: 3339, name: 'BumbleB', rank: null, in_active_event: false },
];

const rpcFor = () => ({
  call: vi.fn(async (name: string) => {
    if (name === 'searchTeams') return { items: teams, next_cursor: null };
    if (name === 'listTeamEvents') return { items: [{ id: 'ev-2', name: 'Week 3' }], next_cursor: null };
    return {};
  }),
});

const navigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<object>('react-router-dom')),
  useNavigate: () => navigate,
}));

beforeEach(() => {
  navigate.mockClear();
  sessionOverride.clear();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

describe('TeamSearchPage (SPEC-FINAL 13.2)', () => {
  it('filters as you type, by number and by name', async () => {
    const user = userEvent.setup();
    render(<TeamSearchPage rpc={rpcFor()} />);
    await user.type(await screen.findByLabelText(/search teams/i), '1577');
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    await user.clear(screen.getByLabelText(/search teams/i));
    await user.type(screen.getByLabelText(/search teams/i), 'galax');
    await waitFor(() => expect(screen.getByText('Galaxia')).toBeInTheDocument());
  });

  it('shows a rank badge only for teams in the active event', async () => {
    render(<TeamSearchPage rpc={rpcFor()} />);
    const inEvent = await screen.findByRole('listitem', { name: /2096/ });
    expect(within(inEvent).getByLabelText(/rank 1/i)).toBeInTheDocument();
    const outside = screen.getByRole('listitem', { name: /3339/ });
    expect(within(outside).queryByLabelText(/rank/i)).not.toBeInTheDocument();
  });

  it('shows a medal on the top three and on nobody else', async () => {
    render(<TeamSearchPage rpc={rpcFor()} />);
    expect(await screen.findAllByLabelText(/medal/i)).toHaveLength(2); // ranks 1 and 3 are present, 9 is not
    expect(within(screen.getByRole('listitem', { name: /5987/ })).queryByLabelText(/medal/i)).not.toBeInTheDocument();
  });

  it('opens the team page directly for a team in the active event', async () => {
    const user = userEvent.setup();
    render(<TeamSearchPage rpc={rpcFor()} />);
    await user.click(await screen.findByRole('button', { name: /open 2096/i }));
    expect(navigate).toHaveBeenCalledWith('/teams/t-1');
  });

  it('offers the events a team competed at for a team outside the active event', async () => {
    const user = userEvent.setup();
    render(<TeamSearchPage rpc={rpcFor()} />);
    await user.click(await screen.findByRole('button', { name: /3339 competed elsewhere/i }));
    expect(await screen.findByRole('button', { name: 'Week 3' })).toBeInTheDocument();
  });

  it('asks are you sure before switching, and does nothing if the answer is no', async () => {
    const user = userEvent.setup();
    render(<TeamSearchPage rpc={rpcFor()} />);
    await user.click(await screen.findByRole('button', { name: /3339 competed elsewhere/i }));
    await user.click(await screen.findByRole('button', { name: 'Week 3' }));
    expect(await screen.findByRole('dialog', { name: /are you sure/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(sessionOverride.get()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('sets a session-only override on yes and lands on the team page', async () => {
    const user = userEvent.setup();
    render(<TeamSearchPage rpc={rpcFor()} />);
    await user.click(await screen.findByRole('button', { name: /3339 competed elsewhere/i }));
    await user.click(await screen.findByRole('button', { name: 'Week 3' }));
    await user.click(await screen.findByRole('button', { name: /switch for this session/i }));
    expect(sessionOverride.get()).toBe('ev-2');
    expect(navigate).toHaveBeenCalledWith('/teams/t-4');
  });

  it('disables the cross-event path entirely while offline, and says why', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<TeamSearchPage rpc={rpcFor()} />);
    expect(await screen.findByRole('button', { name: /3339 competed elsewhere/i })).toBeDisabled();
    expect(screen.getByText(/only the default competition is available offline/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement, run, commit**

```bash
pnpm --filter @frc/client exec vitest run src/features/teams && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(client): add the season-wide team search with rank badges and the cross-event jump"
```

---

## Task 1.52: Client — entry search and the entry preview page

**Files:**
- Create: `apps/client/src/features/entries/EntrySearchPage.tsx`, `apps/client/src/features/entries/EntryPreviewPage.tsx`
- Create: `apps/client/src/features/entries/EntrySearchPage.test.tsx`, `apps/client/src/features/entries/EntryPreviewPage.test.tsx`
- Modify: `apps/client/src/routes.tsx` (replace the walking skeleton's `/entries` with this)

**Interfaces:**
- Produces: `/entries` — dense list rows, filters as chips, search that filters as you type; `/entries/:id` — the read-only preview, **a full page, not a drawer**.

**Rules (SPEC-FINAL §13.3, §13.4).** The list covers the **active competition only**, **both kinds with a kind filter**, searchable by team name, team number, match number and scouter name, each row showing the entry's **scouted points**. The preview lays all field values out **by phase**, plus the scouted score, team, match, alliance, robot status, scouter, form kind and timestamp. A `no_show` or `disabled` entry shows its status and **no field rows at all** — not a wall of zeros.

- [ ] **Step 1: Write the failing tests, implement, run, commit**

```tsx
// EntrySearchPage.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EntrySearchPage } from './EntrySearchPage';

const items = [
  { id: 'e-1', form_kind: 'match', match_number: 12, team_number: 2096, team_name: 'ROBACTIVE', scouter_name: 'Seed Scouter', robot_status: 'played', scouted_points: 25 },
  { id: 'e-2', form_kind: 'super', match_number: null, team_number: 1577, team_name: 'Steampunk', scouter_name: 'Dana Levi', robot_status: null, scouted_points: null },
];

const rpcFor = () => ({ call: vi.fn(async () => ({ items, next_cursor: null })) });
const navigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<object>('react-router-dom')),
  useNavigate: () => navigate,
}));

describe('EntrySearchPage (SPEC-FINAL 13.3)', () => {
  it('lists entries of the active event with scouted points on each', async () => {
    render(<EntrySearchPage eventId="ev-1" rpc={rpcFor()} />);
    const row = await screen.findByRole('row', { name: /2096/ });
    expect(row).toHaveTextContent('25.00');
  });

  it('filters by kind with a chip, and shows both kinds when no chip is active', async () => {
    const rpc = rpcFor();
    const user = userEvent.setup();
    render(<EntrySearchPage eventId="ev-1" rpc={rpc} />);
    expect(await screen.findAllByRole('row')).toHaveLength(3); // header + two
    await user.click(screen.getByRole('button', { name: /^match$/i }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenLastCalledWith('queryEntries', expect.objectContaining({ form_kind: 'match' })),
    );
  });

  it('filters as you type by team name, team number, match number and scouter name', async () => {
    const rpc = rpcFor();
    const user = userEvent.setup();
    render(<EntrySearchPage eventId="ev-1" rpc={rpc} />);
    await user.type(await screen.findByLabelText(/search entries/i), 'Dana');
    await waitFor(() =>
      expect(rpc.call).toHaveBeenLastCalledWith('queryEntries', expect.objectContaining({ query: 'Dana' })),
    );
  });

  it('opens the preview as a full page and not a drawer', async () => {
    const user = userEvent.setup();
    render(<EntrySearchPage eventId="ev-1" rpc={rpcFor()} />);
    await user.click(await screen.findByRole('row', { name: /2096/ }));
    expect(navigate).toHaveBeenCalledWith('/entries/e-1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

// EntryPreviewPage.test.tsx
const entry = {
  id: 'e-1', team: '2096 ROBACTIVE', match: 'Qualification 12', alliance: 'red',
  robot_status: 'played', form_kind: 'match', scouter_name: 'Seed Scouter',
  scouted_points: 25, client_updated_at: '2026-11-14T09:31:02.000Z',
  phases: [
    { phase: 'auto', fields: [{ key: 'auto_notes', label: 'Auto notes', value: 3 }] },
    { phase: 'teleop', fields: [] },
    { phase: 'endgame', fields: [] },
    { phase: 'post_match', fields: [{ key: 'notes', label: 'הערות', value: 'הרובוט היה איטי' }] },
  ],
};

describe('EntryPreviewPage (SPEC-FINAL 13.4)', () => {
  it('lays field values out by phase, with the section headings in order', async () => {
    render(<EntryPreviewPage rpc={{ call: async () => entry }} entryId="e-1" />);
    const headings = (await screen.findAllByRole('heading', { level: 2 })).map((h) => h.textContent);
    expect(headings).toEqual(['Autonomous', 'Teleop', 'Endgame', 'Post-match']);
  });

  it('shows the status and no field rows at all for a no-show, never zeros', async () => {
    const noShow = { ...entry, robot_status: 'no_show', scouted_points: null, phases: [] };
    render(<EntryPreviewPage rpc={{ call: async () => noShow }} entryId="e-1" />);
    expect(await screen.findByText(/no show/i)).toBeInTheDocument();
    expect(screen.queryByRole('definition')).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders Hebrew note values with dir=auto so they read right to left', async () => {
    render(<EntryPreviewPage rpc={{ call: async () => entry }} entryId="e-1" />);
    expect(await screen.findByText('הרובוט היה איטי')).toHaveAttribute('dir', 'auto');
  });

  it('formats the timestamp as DD/MM/YYYY and 24-hour local time', async () => {
    render(<EntryPreviewPage rpc={{ call: async () => entry }} entryId="e-1" />);
    expect(await screen.findByText(/14\/11\/2026/)).toBeInTheDocument();
  });
});
```

```bash
pnpm --filter @frc/client exec vitest run src/features/entries && pnpm typecheck && pnpm lint
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(client): add entry search and the full-page entry preview"
```

---

## Task 1.53: Client — the team page

**Files:**
- Create: `apps/client/src/features/teams/TeamPage.tsx`, `apps/client/src/features/teams/TeamHeader.tsx`, `apps/client/src/features/teams/MatchByMatchTable.tsx`, `apps/client/src/features/teams/NotesList.tsx`
- Create: `apps/client/src/features/teams/TeamPage.test.tsx`

**Interfaces:**
- Produces: `/teams/:teamId` — the fixed, always-available team page.

**Required content (SPEC-FINAL §13.1).** A **sticky team header** (number, name, headline metric, rank badge), a **horizontal tab strip**, then stat rows as **label → value → inline bar**, readable in one thumb scroll. Beyond the dashboard's charts: **all metrics for the team**; a **match-by-match table** (match number, robot status, scouted score, the metric columns; a row opens that entry's preview); **progression charts** (per-match line view with the view-time metric selector); **notes** — the values of that team's **Long-text fields** across its entries at the event, newest first, each labelled with its match, its field label and its scouter; and **reliability counts** — breakdowns, no-shows, disabled, availability rate. **There are no photos on this page.**

*The charts on this page consume the engine built in tasks 1.54–1.56 and the `getTeamStats` query of task 1.57; build this task after them.*

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TeamPage } from './TeamPage';

const stats = {
  team: { id: 't-1', number: 2096, name: 'ROBACTIVE', rank: 1 },
  headline: { label: 'Average points', value: 15.5 },
  metrics: [
    { key: 'avg_points', label: 'Average points', value: 15.5, domain: { min: 0, max: 30 }, direction: 'higher_is_better' },
    { key: 'auto_notes', label: 'Auto notes', value: 2.25, domain: { min: 0, max: 10 }, direction: 'higher_is_better' },
  ],
  matches: [
    { entry_id: 'e-1', match_number: 1, robot_status: 'played', scouted_points: 10, columns: { auto_notes: 2 } },
    { entry_id: 'e-2', match_number: 2, robot_status: 'no_show', scouted_points: null, columns: {} },
  ],
  notes: [
    { field_label: 'הערות', value: 'הרובוט היה איטי', match_number: 2, scouter_name: 'Dana Levi', client_updated_at: '2026-11-14T10:00:00.000Z' },
    { field_label: 'הערות', value: 'good climb', match_number: 1, scouter_name: 'Seed Scouter', client_updated_at: '2026-11-14T09:00:00.000Z' },
  ],
  reliability: { breakdowns: 0, no_shows: 1, disabled: 0, availability_rate: 0.5 },
};

const navigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<object>('react-router-dom')),
  useNavigate: () => navigate,
}));

const rpcFor = (payload = stats) => ({ call: vi.fn(async () => payload) });

describe('TeamPage (SPEC-FINAL 13.1)', () => {
  it('shows a sticky header with the team number, name, headline metric and rank badge', async () => {
    render(<TeamPage teamId="t-1" rpc={rpcFor()} />);
    const header = await screen.findByRole('banner');
    expect(header).toHaveTextContent('2096');
    expect(header).toHaveTextContent('ROBACTIVE');
    expect(header).toHaveTextContent('15.50');
    expect(within(header).getByLabelText(/rank 1/i)).toBeInTheDocument();
    expect(getComputedStyle(header).position).toBe('sticky');
  });

  it('lists every metric as label, value and an inline bar', async () => {
    render(<TeamPage teamId="t-1" rpc={rpcFor()} />);
    const row = await screen.findByRole('row', { name: /Auto notes/ });
    expect(row).toHaveTextContent('2.25');
    expect(within(row).getByRole('meter')).toBeInTheDocument();
  });

  it('shows a match-by-match row per match the team has an entry for', async () => {
    render(<TeamPage teamId="t-1" rpc={rpcFor()} />);
    const table = await screen.findByRole('table', { name: /match by match/i });
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header + two
    expect(within(table).getByRole('row', { name: /no show/i })).toHaveTextContent('—');
  });

  it('opens that entry preview when a match row is clicked', async () => {
    const user = userEvent.setup();
    render(<TeamPage teamId="t-1" rpc={rpcFor()} />);
    const table = await screen.findByRole('table', { name: /match by match/i });
    await user.click(within(table).getAllByRole('row')[1]!);
    expect(navigate).toHaveBeenCalledWith('/entries/e-1');
  });

  it('lists long-text notes newest first, each with its match, field label and scouter', async () => {
    render(<TeamPage teamId="t-1" rpc={rpcFor()} />);
    const notes = await screen.findAllByRole('listitem', { name: /note/i });
    expect(notes[0]).toHaveTextContent('הרובוט היה איטי');
    expect(notes[0]).toHaveTextContent('Dana Levi');
    expect(notes[0]).toHaveTextContent('2');
  });

  it('renders Hebrew notes with dir=auto', async () => {
    render(<TeamPage teamId="t-1" rpc={rpcFor()} />);
    expect(await screen.findByText('הרובוט היה איטי')).toHaveAttribute('dir', 'auto');
  });

  it('shows breakdowns, no-shows, disabled and the availability rate', async () => {
    render(<TeamPage teamId="t-1" rpc={rpcFor()} />);
    const panel = await screen.findByRole('group', { name: /reliability/i });
    expect(panel).toHaveTextContent('0');
    expect(panel).toHaveTextContent('1');
    expect(panel).toHaveTextContent('50%');
  });

  it('renders no photo and no image placeholder anywhere', async () => {
    render(<TeamPage teamId="t-1" rpc={rpcFor()} />);
    await screen.findByRole('banner');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows the empty state when the team has no entries at this event', async () => {
    const empty = { ...stats, metrics: [], matches: [], notes: [], reliability: { breakdowns: 0, no_shows: 0, disabled: 0, availability_rate: null } };
    render(<TeamPage teamId="t-1" rpc={rpcFor(empty)} />);
    expect(await screen.findByText(/no entries for this team yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement, run, commit**

```bash
pnpm --filter @frc/client exec vitest run src/features/teams && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(client): add the team page with stats, match-by-match, notes and reliability"
```

---
# Phase 1 I — basic statistics (§20.2.9)

**One metric implementation, in TypeScript, in `packages/shared`** (SPEC-FINAL §11.1). It runs unchanged in the browser (offline) and on the server (online). There is no second implementation and no metric logic in SQL. Wrong numbers are worse than no numbers, so this is one of the two non-negotiable test suites (§18.4).

---

## Task 1.54: The engine — scoring, robot status and the canonical entry

**Files:**
- Create: `packages/shared/src/engine/types.ts`, `packages/shared/src/engine/score.ts`, `packages/shared/src/engine/select.ts`
- Create: `packages/shared/src/engine/score.test.ts`, `packages/shared/src/engine/select.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `type EngineEntry`, `type ScoringRule`; `scoreField(field, rule, value): number`; `scoreEntry(entry, fields, rules): number | null`; `canonicalEntries(entries)` — one per `(team, match, form kind)`, latest `client_updated_at` wins; `entriesForAggregates(entries)` — qualification only, live only, canonical only, status rule applied.

**The scoring rules, verbatim (SPEC-FINAL §4.1).** Toggle → `points` if true. Counter and Number → `points` × value. Single select → `option_points[selected]`. Multi select → Σ `option_points[each selected]`. **Everything else is not scored and holds no rule.** Points are non-negative; **penalties and fouls are recorded as data but never subtracted**. **A robot's scouted score is the sum of its field points.** **Scores are always derived, never stored** — correcting the model re-scores all history immediately.

**The status rule, verbatim (SPEC-FINAL §11.3).** `played` and `broke_down` are **included** — a robot that played then died genuinely underperformed, and its partial data is real observed performance. `no_show` and `disabled` are **excluded entirely, never counted as zero**.

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/engine/score.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { FormFieldDefinition } from '../forms/types';
import { scoreEntry, scoreField } from './score';
import type { ScoringRule } from './types';

const field = (key: string, type: FormFieldDefinition['type'], config: Record<string, unknown> = {}): FormFieldDefinition => ({
  id: key, key, label: key, help_text: null, type, section: null, display_order: 1, required: false,
  default_value: null, config, visibility_condition: null, deprecated: false, description: 'x',
  unit: 'count', phase: 'auto', direction: 'higher_is_better', category: null, expected_range: null,
  include_in_ai_context: null, is_ordinal: null,
});

const rule = (field_key: string, points: number, option_points: Record<string, number> | null = null): ScoringRule =>
  ({ field_key, points, option_points });

const options = { options: [{ value: 'none', label: 'None' }, { value: 'high', label: 'High' }] };

describe('scoreField (SPEC-FINAL 4.1)', () => {
  it('gives a toggle its points when true and zero when false', () => {
    expect(scoreField(field('t', 'toggle'), rule('t', 2), true)).toBe(2);
    expect(scoreField(field('t', 'toggle'), rule('t', 2), false)).toBe(0);
  });

  it('multiplies a counter and a number by their points per unit', () => {
    expect(scoreField(field('c', 'counter'), rule('c', 5), 3)).toBe(15);
    expect(scoreField(field('n', 'number'), rule('n', 0.5), 4)).toBe(2);
  });

  it('reads option points for a single select', () => {
    expect(scoreField(field('s', 'single_select', options), rule('s', 0, { none: 0, high: 10 }), 'high')).toBe(10);
  });

  it('sums option points for a multi select', () => {
    expect(scoreField(field('m', 'multi_select', options), rule('m', 0, { none: 1, high: 10 }), ['none', 'high'])).toBe(11);
  });

  it('scores nothing at all for every unscorable type', () => {
    for (const type of ['rating', 'timer', 'event_log', 'position', 'cycle_path', 'short_text', 'long_text', 'computed', 'section'] as const) {
      expect(scoreField(field('x', type), rule('x', 5), 3), type).toBe(0);
    }
  });

  it('treats a missing value as zero points, not as a null score', () => {
    expect(scoreField(field('c', 'counter'), rule('c', 5), undefined)).toBe(0);
  });

  it('treats an unknown option as zero rather than throwing', () => {
    expect(scoreField(field('s', 'single_select', options), rule('s', 0, { high: 10 }), 'moon')).toBe(0);
  });

  it('never returns a negative score, because penalties are data and not deductions', () => {
    expect(scoreField(field('c', 'counter'), rule('c', 0), 5)).toBe(0);
  });
});

describe('scoreEntry', () => {
  const fields = [field('auto', 'counter'), field('climb', 'single_select', options), field('notes', 'long_text')];
  const rules = [rule('auto', 5), rule('climb', 0, { none: 0, high: 10 })];

  it('sums the field points of one robot', () => {
    expect(scoreEntry({ robot_status: 'played', data: { auto: 3, climb: 'high', notes: 'x' } } as never, fields, rules)).toBe(25);
  });

  it('scores a broke_down robot on the data it did record', () => {
    expect(scoreEntry({ robot_status: 'broke_down', data: { auto: 1 } } as never, fields, rules)).toBe(5);
  });

  it('returns null, never zero, for a no-show or a disabled robot', () => {
    expect(scoreEntry({ robot_status: 'no_show', data: {} } as never, fields, rules)).toBeNull();
    expect(scoreEntry({ robot_status: 'disabled', data: {} } as never, fields, rules)).toBeNull();
  });

  it('ignores a field that has no scoring rule', () => {
    expect(scoreEntry({ robot_status: 'played', data: { notes: 'long note' } } as never, fields, rules)).toBe(0);
  });

  it('recomputes a computed field at read time, so an expression fix repairs history', () => {
    const computed = field('total', 'computed');
    computed.config = {
      result_type: 'float',
      expression: { kind: 'op', op: '*', left: { kind: 'field', key: 'auto' }, right: { kind: 'literal', value: 2 } },
    };
    // the stored payload carries a STALE value from an older expression
    const entry = { robot_status: 'played', data: { auto: 3, total: 999 } } as never;
    const hydrated = hydrateComputed(entry.data, [field('auto', 'counter'), computed]);
    expect(hydrated.total).toBe(6);
  });

  it('re-scores immediately when the model changes, because nothing is stored', () => {
    const entry = { robot_status: 'played', data: { auto: 3 } } as never;
    expect(scoreEntry(entry, fields, [rule('auto', 5)])).toBe(15);
    expect(scoreEntry(entry, fields, [rule('auto', 2)])).toBe(6);
  });
});
```

`packages/shared/src/engine/select.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { canonicalEntries, entriesForAggregates } from './select';
import type { EngineEntry } from './types';

const entry = (over: Partial<EngineEntry>): EngineEntry => ({
  id: 'e', form_version_id: 'fv-1', form_kind: 'match', event_id: 'ev-1', match_id: 'm-1',
  team_id: 't-1', alliance: 'red', scouter_id: 'u-1', robot_status: 'played', data: {},
  client_created_at: '2026-11-14T09:00:00.000Z', client_updated_at: '2026-11-14T09:00:00.000Z',
  deleted_at: null, match_type: 'qualification', match_number: 1, event_sort_order: 1,
  ...over,
});

describe('canonicalEntries (SPEC-FINAL 11.6)', () => {
  it('keeps one entry per (team, match, form kind)', () => {
    const result = canonicalEntries([entry({ id: 'a' }), entry({ id: 'b', team_id: 't-2' })]);
    expect(result).toHaveLength(2);
  });

  it('reads only the greatest client_updated_at when two duplicates exist', () => {
    const result = canonicalEntries([
      entry({ id: 'a', client_updated_at: '2026-11-14T09:00:00.000Z' }),
      entry({ id: 'b', client_updated_at: '2026-11-14T09:08:00.000Z' }),
    ]);
    expect(result.map((e) => e.id)).toEqual(['b']);
  });

  it('separates a match entry from a super entry for the same team', () => {
    const result = canonicalEntries([entry({ id: 'a' }), entry({ id: 'b', form_kind: 'super', match_id: null })]);
    expect(result).toHaveLength(2);
  });

  it('never returns a soft-deleted entry', () => {
    expect(canonicalEntries([entry({ id: 'a', deleted_at: '2026-11-14T10:00:00.000Z' })])).toEqual([]);
  });
});

describe('entriesForAggregates (SPEC-FINAL 11.2, 11.3)', () => {
  it('keeps only qualification matches, absolutely', () => {
    const result = entriesForAggregates([
      entry({ id: 'q', match_type: 'qualification' }),
      entry({ id: 'p', match_type: 'practice', match_id: 'm-2' }),
      entry({ id: 'f', match_type: 'playoff', match_id: 'm-3' }),
    ]);
    expect(result.map((e) => e.id)).toEqual(['q']);
  });

  it('includes played and broke_down', () => {
    const result = entriesForAggregates([
      entry({ id: 'a', robot_status: 'played' }),
      entry({ id: 'b', robot_status: 'broke_down', match_id: 'm-2' }),
    ]);
    expect(result.map((e) => e.id).sort()).toEqual(['a', 'b']);
  });

  it('excludes no_show and disabled entirely, and never as a zero', () => {
    const result = entriesForAggregates([
      entry({ id: 'a', robot_status: 'no_show' }),
      entry({ id: 'b', robot_status: 'disabled', match_id: 'm-2' }),
    ]);
    expect(result).toEqual([]);
  });

  it('applies the duplicate rule before the status rule, so the latest entry decides', () => {
    const result = entriesForAggregates([
      entry({ id: 'old', robot_status: 'played', client_updated_at: '2026-11-14T09:00:00.000Z' }),
      entry({ id: 'new', robot_status: 'no_show', client_updated_at: '2026-11-14T09:05:00.000Z' }),
    ]);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
pnpm vitest run packages/shared/src/engine
```

Expected: `Failed to resolve import "./score"`.

- [ ] **Step 3: Implement**

`packages/shared/src/engine/types.ts`:

```ts
import type { FormFieldDefinition, RobotStatus } from '../forms/types';

export type ScoringRule = {
  field_key: string;
  points: number;
  option_points: Record<string, number> | null;
};

/** One scouting entry, joined to the skeleton columns the engine needs. */
export type EngineEntry = {
  id: string;
  form_version_id: string;
  form_kind: 'match' | 'super';
  event_id: string;
  match_id: string | null;
  team_id: string;
  alliance: 'red' | 'blue' | null;
  scouter_id: string;
  robot_status: RobotStatus | null;
  breakdown_seconds?: number | null;
  data: Record<string, unknown>;
  client_created_at: string;
  client_updated_at: string;
  deleted_at: string | null;
  /** joined from matches / events */
  match_type: 'practice' | 'qualification' | 'playoff' | null;
  match_number: number | null;
  event_sort_order: number;
};

export type EngineForm = {
  fields: FormFieldDefinition[];
  rules: ScoringRule[];
};
```

`packages/shared/src/engine/score.ts`:

```ts
import type { FormFieldDefinition } from '../forms/types';
import type { EngineEntry, ScoringRule } from './types';

const SCORABLE = new Set(['toggle', 'counter', 'number', 'single_select', 'multi_select']);

/** SPEC-FINAL 4.1. Points are never negative and never subtracted. */
export function scoreField(field: FormFieldDefinition, rule: ScoringRule | undefined, value: unknown): number {
  if (!rule || !SCORABLE.has(field.type)) return 0;

  switch (field.type) {
    case 'toggle':
      return value === true ? Math.max(0, rule.points) : 0;
    case 'counter':
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, rule.points * value)
        : 0;
    case 'single_select':
      return typeof value === 'string' ? Math.max(0, rule.option_points?.[value] ?? 0) : 0;
    case 'multi_select':
      return Array.isArray(value)
        ? value.reduce<number>((sum, option) =>
            sum + Math.max(0, rule.option_points?.[String(option)] ?? 0), 0)
        : 0;
    default:
      return 0;
  }
}

/**
 * SPEC-FINAL 5.7: a Computed field's value is written into the entry's data payload at
 * submit time AND RECOMPUTED BY THE ENGINE WHENEVER THE ENTRY IS READ, so correcting an
 * expression repairs history. Every read path — scoreEntry, getEntry, queryEntries,
 * getTeamStats — goes through this first.
 */
export function hydrateComputed(
  data: Record<string, unknown>,
  fields: FormFieldDefinition[],
): Record<string, unknown> {
  const out = { ...data };
  for (const field of fields) {
    if (field.type !== 'computed') continue;
    const expr = field.config.expression as Expr | null | undefined;
    out[field.key] = expr ? evaluateExpr(expr, out) : null;
  }
  return out;
}

/**
 * A robot's scouted score is the sum of its field points (SPEC-FINAL 4.1). A no-show or
 * disabled robot has no score at all — null, never zero (11.3).
 */
export function scoreEntry(
  entry: Pick<EngineEntry, 'robot_status' | 'data'>,
  fields: FormFieldDefinition[],
  rules: ScoringRule[],
): number | null {
  if (entry.robot_status === 'no_show' || entry.robot_status === 'disabled') return null;
  const byKey = new Map(rules.map((r) => [r.field_key, r]));
  // Computed fields are re-derived here, never trusted from the stored payload (5.7).
  const data = hydrateComputed(entry.data, fields);
  return fields.reduce((total, field) => total + scoreField(field, byKey.get(field.key), data[field.key]), 0);
}
```

`packages/shared/src/engine/select.ts`:

```ts
import { logicalKeyOf } from '../sync/conflict';
import type { EngineEntry } from './types';

/**
 * SPEC-FINAL 11.6: one canonical entry per (team, match, form kind). When two devices
 * produced two anyway, both rows are kept and the engine reads only the one with the
 * greatest client_updated_at, so statistics never double-count.
 */
export function canonicalEntries(entries: EngineEntry[]): EngineEntry[] {
  const best = new Map<string, EngineEntry>();
  for (const entry of entries) {
    if (entry.deleted_at !== null) continue;
    const key = logicalKeyOf(entry);
    const current = best.get(key);
    if (!current || entry.client_updated_at > current.client_updated_at) best.set(key, entry);
  }
  return [...best.values()];
}

/**
 * The population every aggregate runs over. Order matters and is fixed:
 * duplicates resolve first, then qualification-only, then the robot-status rule.
 */
export function entriesForAggregates(entries: EngineEntry[]): EngineEntry[] {
  return canonicalEntries(entries)
    // Only qualification matches ever feed an aggregate. Not configurable (11.2).
    .filter((e) => e.form_kind !== 'match' || e.match_type === 'qualification')
    // no_show and disabled are excluded entirely, never counted as zero (11.3).
    .filter((e) => e.robot_status !== 'no_show' && e.robot_status !== 'disabled');
}
```

- [ ] **Step 4: Run and commit**

```bash
pnpm vitest run packages/shared && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(shared): add the scoring engine, the canonical-entry rule and the status rule"
```

---

## Task 1.55: The engine — aggregations

**Files:**
- Create: `packages/shared/src/engine/aggregate.ts`, `packages/shared/src/engine/aggregate.test.ts`

**Interfaces:**
- Produces: `aggregate(values, aggregation, options, direction): number | null | Distribution`; `type Aggregation`; `applyFilters(entries, filters, fields)`.

**The semantics that are not self-evident (SPEC-FINAL §11.2), verbatim.**

| Aggregation | Definition |
|---|---|
| `rate` | `count(values matching rate_condition) / count(values)`, a fraction rendered as a whole-number percentage. On a scored field the default condition is **points > 0** — the mission-success rule. |
| `percentile` | The **linear-interpolated** percentile at `aggregation_options.percentile` over the team's own values. |
| `slope` | **Ordinary least-squares** slope of value against **match sequence index** (1…n). Requires ≥ 2 points; fewer yields null. |
| `best` / `worst` | **Direction-aware.** `higher_is_better` → best = max, worst = min; `lower_is_better` swaps them; `neutral` makes them **unavailable** and the builder does not offer them. |
| `mode` | The most frequent value. Ties resolve to the option **earliest in the field's option list**, or the smallest value for numerics. |
| `distribution` | Counts per distinct value, ordered by the field's option list for selects and ascending for numerics. |
| `stddev` | **Population** standard deviation. Requires ≥ 2 values; fewer yields null. |

**Degenerate input: every aggregation returns `null` on an empty value set, and null renders as the grey "—", never as zero.** Minimum sample size is 1; the engine guards only against empty input and division by zero.

**Evaluation order (fixed):** scope → qualification-only → robot-status rule → `field_filters` → `exclude_match_numbers` → `last_n_matches` → aggregation.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/engine/aggregate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { aggregate } from './aggregate';

const n = [4, 8, 15, 16, 23, 42];

describe('aggregations (SPEC-FINAL 11.2)', () => {
  it('computes the plain ones', () => {
    expect(aggregate(n, 'avg')).toBeCloseTo(18, 6);
    expect(aggregate(n, 'median')).toBeCloseTo(15.5, 6);
    expect(aggregate(n, 'sum')).toBe(108);
    expect(aggregate(n, 'min')).toBe(4);
    expect(aggregate(n, 'max')).toBe(42);
    expect(aggregate(n, 'count')).toBe(6);
  });

  it('uses the POPULATION standard deviation and needs at least two values', () => {
    expect(aggregate([2, 4, 4, 4, 5, 5, 7, 9], 'stddev')).toBeCloseTo(2, 6);
    expect(aggregate([5], 'stddev')).toBeNull();
  });

  it('interpolates a percentile linearly', () => {
    expect(aggregate([1, 2, 3, 4], 'percentile', { percentile: 50 })).toBeCloseTo(2.5, 6);
    expect(aggregate([1, 2, 3, 4], 'percentile', { percentile: 25 })).toBeCloseTo(1.75, 6);
    expect(aggregate([1, 2, 3, 4], 'percentile', { percentile: 100 })).toBe(4);
  });

  it('computes rate as a 0..1 fraction, defaulting to points greater than zero', () => {
    expect(aggregate([0, 5, 0, 10], 'rate')).toBeCloseTo(0.5, 6);
    expect(aggregate([1, 2, 3, 4], 'rate', { rate_condition: { op: '>=', value: 3 } })).toBeCloseTo(0.5, 6);
  });

  it('computes the ordinary least-squares slope against the match sequence index', () => {
    expect(aggregate([1, 2, 3, 4], 'slope')).toBeCloseTo(1, 6);
    expect(aggregate([4, 3, 2, 1], 'slope')).toBeCloseTo(-1, 6);
    expect(aggregate([7], 'slope')).toBeNull();
  });

  it('makes best and worst direction-aware, and unavailable for neutral', () => {
    expect(aggregate(n, 'best', undefined, 'higher_is_better')).toBe(42);
    expect(aggregate(n, 'worst', undefined, 'higher_is_better')).toBe(4);
    expect(aggregate(n, 'best', undefined, 'lower_is_better')).toBe(4);
    expect(aggregate(n, 'worst', undefined, 'lower_is_better')).toBe(42);
    expect(aggregate(n, 'best', undefined, 'neutral')).toBeNull();
  });

  it('resolves a mode tie to the earliest option in the field list, and to the smallest numeric', () => {
    expect(aggregate(['high', 'none', 'high', 'none'], 'mode', { option_order: ['none', 'high'] })).toBe('none');
    expect(aggregate([3, 1, 3, 1], 'mode')).toBe(1);
  });

  it('orders a distribution by the option list for selects and ascending for numerics', () => {
    expect(aggregate(['high', 'none', 'high'], 'distribution', { option_order: ['none', 'high'] })).toEqual([
      { value: 'none', count: 1 },
      { value: 'high', count: 2 },
    ]);
    expect(aggregate([3, 1, 3], 'distribution')).toEqual([
      { value: 1, count: 1 },
      { value: 3, count: 2 },
    ]);
  });

  it('returns null on an empty value set for EVERY aggregation, never zero', () => {
    for (const aggregation of ['avg', 'median', 'sum', 'min', 'max', 'count', 'stddev', 'percentile', 'rate', 'slope', 'best', 'worst', 'mode', 'distribution'] as const) {
      expect(aggregate([], aggregation, { percentile: 50 }), aggregation).toBeNull();
    }
  });

  it('works on a sample of one, because the minimum sample size is one', () => {
    expect(aggregate([7], 'avg')).toBe(7);
    expect(aggregate([7], 'rate')).toBe(1);
  });

  it('ignores null values rather than treating them as zero', () => {
    expect(aggregate([4, null, 8] as never, 'avg')).toBeCloseTo(6, 6);
  });
});
```

plus a `describe('applyFilters')` block asserting the fixed evaluation order, `exclude_match_numbers`, `last_n_matches` ordering by event `sort_order` then match number, and `field_filters` with all six operators.

- [ ] **Step 2: Implement**

`packages/shared/src/engine/aggregate.ts` — the shape:

```ts
export type Aggregation =
  | 'avg' | 'median' | 'sum' | 'min' | 'max' | 'count' | 'stddev'
  | 'percentile' | 'rate' | 'slope' | 'best' | 'worst' | 'mode' | 'distribution';

export type AggregationOptions = {
  percentile?: number;
  rate_condition?: { op: '=' | '!=' | '>' | '<' | '>=' | '<='; value: unknown };
  option_order?: string[];
};

export type DistributionBucket = { value: unknown; count: number };
export type AggregateResult = number | string | null | DistributionBucket[];

export function aggregate(
  raw: unknown[],
  aggregation: Aggregation,
  options?: AggregationOptions,
  direction: 'higher_is_better' | 'lower_is_better' | 'neutral' = 'higher_is_better',
): AggregateResult {
  const values = raw.filter((v) => v !== null && v !== undefined);
  if (values.length === 0) return null;                 // never zero (11.2)
  ...
}
```

with `numbers()` narrowing to finite numbers, `percentileOf` doing linear interpolation between the two neighbouring ranks, `slopeOf` doing least squares against the index `1…n`, `stddevOf` using the **population** divisor `n`, and `best`/`worst` returning `null` for `neutral`.

- [ ] **Step 3: Run and commit**

```bash
pnpm vitest run packages/shared && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(shared): add the aggregation catalogue with its exact degenerate-input rules"
```

---

## Task 1.56: The engine — cycles, reliability and the cross-version guard

**Files:**
- Create: `packages/shared/src/engine/cycles.ts`, `packages/shared/src/engine/cycles.test.ts`
- Create: `packages/shared/src/engine/reliability.ts`, `packages/shared/src/engine/reliability.test.ts`
- Create: `packages/shared/src/engine/versions.ts`, `packages/shared/src/engine/versions.test.ts`

**Interfaces:**
- Produces: `deriveCycles(taps, eventType, timed, tEnd)` → `{ count, durations, timeToFirst }`; `reliabilityFor(entries)` → `{ breakdowns, no_shows, disabled, available, missed, availability_rate }`; `resolveFieldAcrossVersions(key, versions)` → `{ ok: true; field } | { ok: false; reason: 'type-changed' | 'absent' }`.

**Cycle derivation, verbatim (SPEC-FINAL §5.5).** Cycles are derived **per event type**.

| Case | Cycles |
|---|---|
| **Timed** | `cycle₁ = t₁ − 0`, then `cycleₖ = tₖ − tₖ₋₁`, and the **final open cycle closes automatically at match end**: `cycle_last = t_end − tₙ`. |
| **Un-timed** | `t₁ = 0` by definition, so there is **no first cycle from match start and no final open cycle**. The series is `cycleₖ = tₖ − tₖ₋₁` for k = 2…n — one fewer cycle, and no zero-length artefact. |

**Reliability (SPEC-FINAL §11.3).** Per team: breakdowns (`broke_down`), no-shows, disabled, and **availability rate = available / (available + missed)**. These are shown alongside performance metrics and are a **first-class input to alliance selection**. **Standard deviation is displayed but is never a ranking sort key.**

**Cross-version aggregation (SPEC-FINAL §11.7).** Entries under different versions aggregate through shared field **keys**. If a key's **type differs** between versions inside the window, the engine **refuses that metric** — the UI renders *"cannot calculate this metric — field type changed between versions"*. If a metric references a field **absent from the active version**, the UI renders *"cannot calculate this metric"*. **It never silently mixes types.**

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/engine/cycles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deriveCycles } from './cycles';

const taps = [
  { type: 'score', t: 10 }, { type: 'pickup', t: 12 },
  { type: 'score', t: 25 }, { type: 'score', t: 40 },
];

describe('cycle derivation (SPEC-FINAL 5.5)', () => {
  it('derives per event type, ignoring other types entirely', () => {
    const result = deriveCycles(taps, 'score', true, 150);
    expect(result.count).toBe(3);
  });

  it('timed: the first cycle runs from match start and the last closes at match end', () => {
    const result = deriveCycles(taps, 'score', true, 150);
    expect(result.durations).toEqual([10, 15, 15, 110]);
    expect(result.timeToFirst).toBe(10);
  });

  it('un-timed: no first cycle from match start and no final open cycle', () => {
    const unTimed = [{ type: 'score', t: 0 }, { type: 'score', t: 15 }, { type: 'score', t: 30 }];
    const result = deriveCycles(unTimed, 'score', false, null);
    expect(result.durations).toEqual([15, 15]);
    expect(result.timeToFirst).toBeNull();
    expect(result.count).toBe(3);
  });

  it('un-timed produces exactly one fewer cycle than timed, with no zero-length artefact', () => {
    const same = [{ type: 'score', t: 0 }, { type: 'score', t: 20 }];
    expect(deriveCycles(same, 'score', false, null).durations).toEqual([20]);
    expect(deriveCycles(same, 'score', true, 100).durations).toEqual([0, 20, 80]);
  });

  it('handles a single tap in each case', () => {
    const one = [{ type: 'score', t: 30 }];
    expect(deriveCycles(one, 'score', true, 150).durations).toEqual([30, 120]);
    expect(deriveCycles([{ type: 'score', t: 0 }], 'score', false, null).durations).toEqual([]);
  });

  it('returns an empty series for an event type with no taps', () => {
    const result = deriveCycles(taps, 'defence', true, 150);
    expect(result).toEqual({ count: 0, durations: [], timeToFirst: null });
  });

  it('has no final open cycle when the timed match end is unknown', () => {
    expect(deriveCycles(taps, 'score', true, null).durations).toEqual([10, 15, 15]);
  });
});
```

`reliability.test.ts` asserts the four counts and the rate, that a team with no entries yields `null` rather than `0`, and that `broke_down` counts as **available and flagged**, not as missed.

`versions.test.ts` asserts: a key with the same type across two versions resolves to the active version's field; a key whose **type** changed yields `{ ok: false, reason: 'type-changed' }`; a key absent from the active version yields `{ ok: false, reason: 'absent' }`; a **label** change across versions is not a problem, because keys are what aggregate.

- [ ] **Step 2: Implement**

```ts
export type CycleSeries = { count: number; durations: number[]; timeToFirst: number | null };

/** SPEC-FINAL 5.5. Timed and un-timed are genuinely different series, not a special case. */
export function deriveCycles(
  taps: { type: string; t: number }[],
  eventType: string,
  timed: boolean,
  tEnd: number | null,
): CycleSeries {
  const times = taps.filter((tap) => tap.type === eventType).map((tap) => tap.t).sort((a, b) => a - b);
  if (times.length === 0) return { count: 0, durations: [], timeToFirst: null };

  const durations: number[] = [];
  if (timed) {
    durations.push(times[0]!);                                  // cycle 1 from match start
    for (let i = 1; i < times.length; i += 1) durations.push(times[i]! - times[i - 1]!);
    if (tEnd !== null) durations.push(tEnd - times[times.length - 1]!); // the final open cycle
  } else {
    // t1 = 0 by definition: no first cycle from match start, no final open cycle.
    for (let i = 1; i < times.length; i += 1) durations.push(times[i]! - times[i - 1]!);
  }

  return { count: times.length, durations, timeToFirst: timed ? times[0]! : null };
}
```

- [ ] **Step 3: Run and commit**

```bash
pnpm vitest run packages/shared && pnpm typecheck && pnpm lint
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(shared): add cycle derivation, reliability counts and the cross-version guard"
```

---

## Task 1.57: Server — `getTeamStats` and `rankTeams`

**Files:**
- Create: `apps/server/src/core/queries/stats.ts`, `apps/server/src/core/queries/stats.test.ts`
- Modify: `apps/server/src/routes/registry.ts`, `apps/server/src/repos/store.ts`, `apps/server/src/test/fake-context.ts` (implement `seedRankingFixture`, `duplicateEntry` and `changeFieldTypeBetweenVersions`)

**Interfaces:**
- Produces: `getTeamStats(caller, { team_id, scope })` — all metrics for one team over a scope, plus the **match-by-match series** and its **notes**; `rankTeams(caller, { event_id })` — the **fixed** phase 1 ranking table.

**Phase 1 ships a fixed ranking table (SPEC-FINAL §13.5, D18):** the **canonical basic rank**, the **average scouted score**, and the **four reliability figures**, with **column sort and no weighting**. The admin-built columns, the weighting mode and the presets arrive in phase 2 with the metric builder they depend on. **Do not build weighting here.**

**The canonical basic rank (§11.5):** the **status-aware average points per match** — the mean of a team's scored match entries, with `no_show` and `disabled` excluded and never counted as zero. It is the default sort on every ranked view.

- [ ] **Step 1: Write the failing test**

`apps/server/src/core/queries/stats.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '@frc/shared';
import { getTeamStats, rankTeams } from './stats';
import { makeFakeContext, type FakeContext } from '../../test/fake-context';

const lead: Caller = { kind: 'user', userId: 'u-l', role: 'lead' };
const service: Caller = { kind: 'service', label: 'mcp' };

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
  // t-1: three qualification entries scoring 10, 20 and a no-show.
  // t-2: two qualification entries scoring 12 and 12, one of them broke_down.
  // t-3: one practice entry only.
  ctx.seedRankingFixture();
});

describe('rankTeams — the fixed phase 1 table (SPEC-FINAL 13.5, 11.5)', () => {
  it('ranks by the status-aware average points per match, descending, by default', async () => {
    const table = await rankTeams(lead, { event_id: 'ev-1' }, ctx);
    expect(table.rows.map((r) => r.team_id)).toEqual(['t-1', 't-2', 't-3']);
    expect(table.rows[0]!.average_points).toBeCloseTo(15, 6);
  });

  it('excludes a no-show from the mean rather than averaging in a zero', async () => {
    const table = await rankTeams(lead, { event_id: 'ev-1' }, ctx);
    expect(table.rows.find((r) => r.team_id === 't-1')!.average_points).toBeCloseTo(15, 6);
  });

  it('includes a broke_down entry, because its partial data is real observed performance', async () => {
    const table = await rankTeams(lead, { event_id: 'ev-1' }, ctx);
    expect(table.rows.find((r) => r.team_id === 't-2')!.average_points).toBeCloseTo(12, 6);
  });

  it('excludes practice and playoff matches from every figure', async () => {
    const table = await rankTeams(lead, { event_id: 'ev-1' }, ctx);
    expect(table.rows.find((r) => r.team_id === 't-3')!.average_points).toBeNull();
  });

  it('counts a duplicated (team, match) once, using the latest client_updated_at', async () => {
    ctx.duplicateEntry('t-1-match-1', { scoreDelta: 100, newer: true });
    const table = await rankTeams(lead, { event_id: 'ev-1' }, ctx);
    expect(table.rows.find((r) => r.team_id === 't-1')!.matches_counted).toBe(2);
  });

  it('returns the four reliability figures and the availability rate per team', async () => {
    const row = (await rankTeams(lead, { event_id: 'ev-1' }, ctx)).rows.find((r) => r.team_id === 't-1')!;
    expect(row).toMatchObject({ breakdowns: 0, no_shows: 1, disabled: 0 });
    expect(row.availability_rate).toBeCloseTo(2 / 3, 6);
  });

  it('returns null, not zero, for a team with no qualification entries', async () => {
    const row = (await rankTeams(lead, { event_id: 'ev-1' }, ctx)).rows.find((r) => r.team_id === 't-3')!;
    expect(row.average_points).toBeNull();
    expect(row.availability_rate).toBeNull();
  });

  it('sorts by any column on request, and never by standard deviation', async () => {
    const byReliability = await rankTeams(lead, { event_id: 'ev-1', sort_by: 'availability_rate' }, ctx);
    expect(byReliability.rows[0]!.availability_rate).toBeGreaterThanOrEqual(
      byReliability.rows[1]!.availability_rate ?? 0,
    );
    await expect(rankTeams(lead, { event_id: 'ev-1', sort_by: 'stddev' } as never, ctx))
      .rejects.toMatchObject({ code: 'invalid' });
  });

  it('returns no weighting inputs at all in phase 1', async () => {
    const table = await rankTeams(lead, { event_id: 'ev-1' }, ctx);
    expect(table).not.toHaveProperty('weights');
    expect(table).not.toHaveProperty('contributions');
  });
});

describe('getTeamStats (SPEC-FINAL 13.1)', () => {
  it('returns the match-by-match series in match-number order', async () => {
    const stats = await getTeamStats(lead, { team_id: 't-1', scope: { mode: 'event', event_id: 'ev-1' } }, ctx);
    expect(stats.matches.map((m) => m.match_number)).toEqual([1, 2, 3]);
  });

  it('returns the long-text notes newest first with match, field label and scouter', async () => {
    const stats = await getTeamStats(lead, { team_id: 't-1', scope: { mode: 'event', event_id: 'ev-1' } }, ctx);
    expect(stats.notes[0]).toMatchObject({ field_label: 'Notes', scouter_name: 'Seed Scouter' });
    expect(stats.notes[0]!.client_updated_at >= stats.notes[1]!.client_updated_at).toBe(true);
  });

  it('refuses a metric whose field type changed between versions, with that message', async () => {
    ctx.changeFieldTypeBetweenVersions('auto_notes');
    const stats = await getTeamStats(lead, { team_id: 't-1', scope: { mode: 'event', event_id: 'ev-1' } }, ctx);
    const broken = stats.metrics.find((m) => m.field_key === 'auto_notes')!;
    expect(broken.value).toBeNull();
    expect(broken.unavailable_reason).toBe('type-changed');
  });

  it('is bounded and paginated, and a service caller may call it', async () => {
    await expect(getTeamStats(service, { team_id: 't-1', scope: { mode: 'event', event_id: 'ev-1' } }, ctx))
      .resolves.toBeTruthy();
    const stats = await getTeamStats(lead, { team_id: 't-1', scope: { mode: 'event', event_id: 'ev-1' }, limit: 2 }, ctx);
    expect(stats.matches.length).toBeLessThanOrEqual(2);
  });
});
```


- [ ] **Step 2: Implement, run, commit**

Both use cases fetch rows with SQL (through the store) and hand them to the **same shared engine** the browser runs. Neither contains a formula.

```bash
pnpm --filter @frc/server exec vitest run && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(server): add getTeamStats and the fixed phase 1 ranking query"
```

---

## Task 1.58: Client — the fixed ranking table

**Files:**
- Create: `apps/client/src/features/ranking/RankingPage.tsx`, `apps/client/src/features/ranking/RankingPage.test.tsx`
- Modify: `apps/client/src/routes.tsx`, `apps/client/package.json` (add `"@tanstack/react-table": "^8.20.5"`)

**Interfaces:**
- Produces: `/ranking` — the fixed table, computed **on-device from cached raw entries while offline** and from `rankTeams` while online.

**Layout (SPEC-FINAL §13.5, §17.9).** Column sort, column visibility, **sticky header**, **no pagination** for a 50-team event. A rank column, **medals on the top 3**, **no zebra striping**, numbers **right-aligned and tabular**. Reliability is one of the sortable columns. **Standard deviation is displayed but is never a sort key.** No weighting mode in phase 1.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RankingPage } from './RankingPage';

const rows = Array.from({ length: 50 }, (_, i) => ({
  team_id: `t-${i}`, team_number: 1000 + i, team_name: `Team ${1000 + i}`,
  average_points: i === 49 ? null : 50 - i,
  stddev: 2 + (i % 3),
  breakdowns: i % 4, no_shows: i % 5, disabled: 0,
  availability_rate: i === 49 ? null : 1 - (i % 5) / 10,
  matches_counted: i === 49 ? 0 : 10,
}));

const rpcFor = () => ({ call: vi.fn(async () => ({ rows })) });

beforeEach(() => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

describe('RankingPage — the fixed phase 1 table (SPEC-FINAL 13.5)', () => {
  it('lists every team with rank, average points and the reliability figures', async () => {
    render(<RankingPage eventId="ev-1" rpc={rpcFor()} />);
    const first = await screen.findByRole('row', { name: /Team 1000/ });
    expect(first).toHaveTextContent('50.00');
    expect(within(first).getByLabelText(/breakdowns/i)).toBeInTheDocument();
    expect(within(first).getByLabelText(/availability/i)).toHaveTextContent('100%');
  });

  it('puts a medal on the top three and on nobody else', async () => {
    render(<RankingPage eventId="ev-1" rpc={rpcFor()} />);
    expect(await screen.findAllByLabelText(/medal/i)).toHaveLength(3);
  });

  it('sorts by a column when its header is clicked, and reverses on a second click', async () => {
    const user = userEvent.setup();
    render(<RankingPage eventId="ev-1" rpc={rpcFor()} />);
    const header = await screen.findByRole('columnheader', { name: /average points/i });
    await user.click(header);
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    await user.click(header);
    expect(header).toHaveAttribute('aria-sort', 'descending');
  });

  it('offers no sort at all on the standard-deviation column', async () => {
    const user = userEvent.setup();
    render(<RankingPage eventId="ev-1" rpc={rpcFor()} />);
    const header = await screen.findByRole('columnheader', { name: /consistency/i });
    expect(header).not.toHaveAttribute('aria-sort');
    await user.click(header);
    expect(header).not.toHaveAttribute('aria-sort');
  });

  it('renders numbers right-aligned and tabular', async () => {
    render(<RankingPage eventId="ev-1" rpc={rpcFor()} />);
    const cell = within(await screen.findByRole('row', { name: /Team 1000/ })).getByText('50.00');
    expect(cell.className).toContain('tabular-nums');
    expect(cell.className).toContain('text-right');
  });

  it('shows an em dash for a team with no qualification entries, never a zero', async () => {
    render(<RankingPage eventId="ev-1" rpc={rpcFor()} />);
    const last = await screen.findByRole('row', { name: /Team 1049/ });
    expect(last).toHaveTextContent('—');
    expect(last).not.toHaveTextContent('0.00');
  });

  it('renders every row without pagination for fifty teams', async () => {
    render(<RankingPage eventId="ev-1" rpc={rpcFor()} />);
    expect(await screen.findAllByRole('row')).toHaveLength(51);
    expect(screen.queryByRole('navigation', { name: /pagination/i })).not.toBeInTheDocument();
  });

  it('computes from the local cache while offline and says the figures are from this device', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<RankingPage eventId="ev-1" rpc={{ call: async () => { throw new Error('offline'); } }} />);
    expect(await screen.findByText(/computed from the data on this device/i)).toBeInTheDocument();
  });

  it('shows no weighting controls, because they arrive in phase 2', async () => {
    render(<RankingPage eventId="ev-1" rpc={rpcFor()} />);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /weight/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement, run, commit**

```bash
pnpm install && pnpm --filter @frc/client exec vitest run src/features/ranking && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(client): add the fixed phase 1 ranking table"
```

---

## Task 1.59: Client — value shading and the progression chart

**Files:**
- Create: `packages/shared/src/engine/shading.ts`, `packages/shared/src/engine/shading.test.ts`
- Create: `apps/client/src/components/ShadedValue.tsx`, `apps/client/src/features/teams/ProgressionChart.tsx`
- Create: `apps/client/src/components/ShadedValue.test.tsx`
- Modify: `apps/client/package.json` (add `"recharts": "^2.13.3"`), `apps/client/src/features/ranking/RankingPage.tsx`, `apps/client/src/features/teams/TeamPage.tsx`

**Interfaces:**
- Produces: `shadeFor(value, domain, direction)` → a token-based colour and a lightness, or `null` for no value; `<ShadedValue>`; `<ProgressionChart>` — the per-match line view with the view-time metric selector.

**Rules (SPEC-FINAL §12.6).** Colour-scaled **light red (worst) → light green (best)**, **per column / per metric**, driven by `direction`. Domain: a declared `expected_range` when there is one; the **observed min–max under the current scope and filters** for unbounded numerics; **fixed 0–100 %** for rates; **option rank** for ordinal enums; **no scale at all** for `direction: neutral`. `lower_is_better` **inverts** the scale. **No data renders as a distinct grey "—" and is excluded from the column's domain.** **All-equal or a single row falls back to a flat mid-colour** — inferring "best" from one data point would be dishonest. The ramp must vary **lightness monotonically** so it degrades to a legible light→dark ramp, **and the numeric value is always printed in the cell**.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { shadeFor } from './shading';

const domain = { kind: 'range' as const, min: 0, max: 10 };

describe('value shading (SPEC-FINAL 12.6)', () => {
  it('maps the worst value to red and the best to green for higher_is_better', () => {
    expect(shadeFor(0, domain, 'higher_is_better')!.position).toBe(0);
    expect(shadeFor(10, domain, 'higher_is_better')!.position).toBe(1);
  });

  it('inverts the scale for lower_is_better, so green is low', () => {
    expect(shadeFor(0, domain, 'lower_is_better')!.position).toBe(1);
    expect(shadeFor(10, domain, 'lower_is_better')!.position).toBe(0);
  });

  it('returns no scale at all for neutral', () => {
    expect(shadeFor(5, domain, 'neutral')).toBeNull();
  });

  it('uses a declared expected_range as the domain, not the observed values', () => {
    const declared = { kind: 'range' as const, min: 0, max: 100 };
    expect(shadeFor(10, declared, 'higher_is_better')!.position).toBeCloseTo(0.1, 6);
  });

  it('fixes the domain at 0 to 1 for a rate, because absolute level matters', () => {
    expect(shadeFor(0.5, { kind: 'rate' }, 'higher_is_better')!.position).toBeCloseTo(0.5, 6);
  });

  it('uses option rank for an ordinal enum, top of the list being the lowest rank', () => {
    const ordinal = { kind: 'ordinal' as const, options: ['none', 'park', 'low', 'high'] };
    expect(shadeFor('none', ordinal, 'higher_is_better')!.position).toBe(0);
    expect(shadeFor('high', ordinal, 'higher_is_better')!.position).toBe(1);
  });

  it('returns null for a missing value, which the caller renders as the grey em dash', () => {
    expect(shadeFor(null, domain, 'higher_is_better')).toBeNull();
    expect(shadeFor(undefined, domain, 'higher_is_better')).toBeNull();
  });

  it('falls back to a flat mid colour when min equals max', () => {
    const flat = shadeFor(7, { kind: 'range', min: 7, max: 7 }, 'higher_is_better')!;
    expect(flat.position).toBe(0.5);
    expect(flat.flat).toBe(true);
  });

  it('varies lightness monotonically across the ramp, so it survives colour blindness', () => {
    const lightnesses = [0, 0.25, 0.5, 0.75, 1].map(
      (p) => shadeFor(p * 10, domain, 'higher_is_better')!.lightness,
    );
    const ascending = lightnesses.every((l, i) => i === 0 || l > lightnesses[i - 1]!);
    const descending = lightnesses.every((l, i) => i === 0 || l < lightnesses[i - 1]!);
    expect(ascending || descending).toBe(true);
  });

  it('never emits brand yellow, which is reserved and never appears in data ink', () => {
    for (let v = 0; v <= 10; v += 1) {
      expect(shadeFor(v, domain, 'higher_is_better')!.background.toUpperCase()).not.toContain('FFEA07');
    }
  });
});
```

`ShadedValue.test.tsx` adds one case: **the numeric value is always printed in the cell**, whatever the shading, including when `shadeFor` returns null.

`ShadedValue.test.tsx` asserts the numeric value is **always printed**, whatever the shading.

- [ ] **Step 2: Implement, run, commit**

`shadeFor` returns `{ background: string; text: string }` computed in OKLCH from the `--shade-worst`/`--shade-mid`/`--shade-best` tokens, so the ramp is defined once and both themes inherit it. `ProgressionChart` is a Recharts `LineChart` over match number with the metric selector of §12.5 above it.

```bash
pnpm install && pnpm vitest run packages/shared && pnpm --filter @frc/client exec vitest run && pnpm typecheck && pnpm lint
```

Expected: every suite green, including the new file(s) from this task in shared; every suite green, including the new file(s) from this task in the client.

```bash
git add -A && git commit -m "feat: add value shading and the per-match progression chart"
```

---
# Phase 1 J — admin delete (§20.2.10)

---

## Task 1.60: Server — deleting a season, an event and a form

**Files:**
- Create: `apps/server/src/core/commands/deletes.ts`, `apps/server/src/core/commands/deletes.test.ts`
- Create: `apps/server/src/core/queries/deleteImpact.ts`
- Create: `packages/db/test/deletes.itest.ts` — the ON DELETE RESTRICT ordering, against the real dev database
- Modify: `apps/server/src/routes/registry.ts`, `apps/server/src/repos/store.ts`

**Interfaces:**
- Produces: `deleteSeason`, `deleteEvent`, `deleteForm`, `deleteFormVersion` (already in task 1.27, re-registered here), `deleteMatch`, `deleteEntry`; and `getDeleteImpact(caller, { kind, id })` — the **exact counts** the confirmation names.

**Rules, verbatim (SPEC-FINAL §3.9).**
- **Hard cascade delete** applies to `seasons`, `events` and `forms`, is **admin-only and irreversible**. Deleting a season deletes its events, their matches and entries, its forms, all their versions, its metrics, dashboards and presets. Deleting an event deletes its matches, entries, pick lists, do-not-pick rows and alliance bracket. Deleting a form deletes its versions, its fields, its scoring rules and **every entry bound to it**.
- **Deleting a single form version that has entries bound to it is blocked**, and **no confirmation text overrides it**. Deleting the parent is a cascade, not an orphaning, which is why one is allowed and the other is not.
- **Deleting a match that has entries is blocked.** Correct the match number instead, or delete the entries first.
- **The active season and the active event cannot be deleted.** Switch the active context first.
- **Confirmation names the damage** — exact counts, and the admin types the object's name to proceed.
- **Back up first**: the delete screen instructs the admin to run `supabase db dump` before proceeding.
- `deleteEntry` is a **lead/admin soft delete**. Scouters never hard-delete entries.

- [ ] **Step 1: Write the failing test**

`apps/server/src/core/commands/deletes.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '@frc/shared';
import { deleteEntry, deleteEvent, deleteForm, deleteSeason } from './deletes';
import { getDeleteImpact } from '../queries/deleteImpact';
import { makeFakeContext, type FakeContext } from '../../test/fake-context';

const admin: Caller = { kind: 'user', userId: 'u-a', role: 'admin' };
const lead: Caller = { kind: 'user', userId: 'u-l', role: 'lead' };
const scouter: Caller = { kind: 'user', userId: 'u-s', role: 'scouter' };

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
  ctx.seedSmallSeason(); // se-1 with ev-1, ev-2, one form, two versions, 12 entries
});

describe('admin delete (SPEC-FINAL 3.9)', () => {
  it('reports the exact damage before anything is deleted', async () => {
    const impact = await getDeleteImpact(admin, { kind: 'season', id: 'se-1' }, ctx);
    expect(impact).toMatchObject({
      events: 2, matches: 4, entries: 12, forms: 1, form_versions: 2,
      metrics: 0, dashboards: 0, weight_presets: 0,
    });
    expect(ctx.rows.scouting_entries.size).toBe(12);
  });

  it('requires the object name to be typed back exactly', async () => {
    ctx.setActiveContext(null, null); // the active-season guard fires first, by design
    await expect(deleteSeason(admin, { season_id: 'se-1', confirm_name: 'wrong' }, ctx))
      .rejects.toMatchObject({ code: 'invalid' });
    expect(ctx.seasons.has('se-1')).toBe(true);
  });

  it('cascades a season to its events, matches, entries, forms, versions and analysis rows', async () => {
    ctx.setActiveContext(null, null);
    await deleteSeason(admin, { season_id: 'se-1', confirm_name: 'SEED GAME 1999' }, ctx);
    expect(ctx.seasons.has('se-1')).toBe(false);
    expect(ctx.events.size).toBe(0);
    expect(ctx.rows.scouting_entries.size).toBe(0);
    expect(ctx.formVersions.size).toBe(0);
  });

  it('refuses to delete the active season, and says to switch the context first', async () => {
    await expect(deleteSeason(admin, { season_id: 'se-1', confirm_name: 'SEED GAME 1999' }, ctx))
      .rejects.toThrow(/switch the active/i);
  });

  it('refuses to delete the active event', async () => {
    await expect(deleteEvent(admin, { event_id: 'ev-1', confirm_name: 'Seed District Event' }, ctx))
      .rejects.toThrow(/switch the active/i);
  });

  it('cascades a form to its versions, fields, scoring rules and every entry bound to it', async () => {
    await deleteForm(admin, { form_id: 'f-1', confirm_name: 'Seed match form' }, ctx);
    expect(ctx.formVersions.size).toBe(0);
    expect(ctx.scoringRules.size).toBe(0);
    expect(ctx.rows.scouting_entries.size).toBe(0);
  });

  it('refuses every delete to a lead and a scouter', async () => {
    for (const caller of [lead, scouter]) {
      await expect(deleteSeason(caller, { season_id: 'se-1', confirm_name: 'x' }, ctx)).rejects.toMatchObject({ code: 'forbidden' });
      await expect(deleteForm(caller, { form_id: 'f-1', confirm_name: 'x' }, ctx)).rejects.toMatchObject({ code: 'forbidden' });
    }
  });

  it('soft-deletes an entry for a lead, keeping the row and its tombstone', async () => {
    await deleteEntry(lead, { entry_id: 'e-1' }, ctx);
    const row = ctx.rows.scouting_entries.get('e-1')!;
    expect(row.deleted_at).not.toBeNull();
    expect(row.version).toBe(2);
  });

  it('never lets a scouter delete an entry, their own included', async () => {
    await expect(deleteEntry(scouter, { entry_id: 'e-1' }, ctx)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('rejects a service caller from every one of these', async () => {
    const service: Caller = { kind: 'service', label: 'mcp' };
    await expect(deleteEvent(service, { event_id: 'ev-2', confirm_name: 'x' }, ctx)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(deleteEntry(service, { entry_id: 'e-1' }, ctx)).rejects.toMatchObject({ code: 'forbidden' });
  });
});
```

- [ ] **Step 2: Implement, run, commit**

Every delete follows the same four lines: `assertCan(caller, 'delete_objects')` → refuse if it is the active season or event → require `confirm_name` to equal the object's name **exactly** → perform the delete. `getDeleteImpact` counts each affected table with `select(..., { head: true, count: 'exact' })` so the confirmation can name real numbers.

**The one thing the cascade cannot do by itself.** `scouting_entries.match_id` is `on delete restrict` (§3.5, migration 0003) — deliberately, so that deleting a *match* with entries is blocked. But deleting an **event** cascades to `matches`, and that restrict then fires and aborts the whole delete. The same happens one level up for a season. So the store's `deleteEvent` and `deleteSeason` remove the entries **first**, in one explicit order, and only then delete the parent:

```ts
  async deleteEvent(id: string): Promise<void> {
    // entries before matches: match_id is ON DELETE RESTRICT and would block the cascade
    await db.from('scouting_entries').delete().eq('event_id', id);
    await db.from('events').delete().eq('id', id);   // cascades matches, pick lists, bracket
  },

  async deleteSeason(id: string): Promise<void> {
    const { data: events } = await db.from('events').select('id').eq('season_id', id);
    const eventIds = (events ?? []).map((e) => e.id);
    if (eventIds.length > 0) {
      await db.from('scouting_entries').delete().in('event_id', eventIds);
    }
    await db.from('seasons').delete().eq('id', id);  // cascades events, forms, metrics, dashboards
  },
```

`deleteFormCascade` has the mirror problem and the mirror fix: `scouting_entries.form_version_id` is `on delete cascade`, so deleting the form is enough — but its entries may also be the last thing holding a match, and that is fine, because a match with no entries deletes cleanly.

**This is exactly the class of bug an in-memory fake cannot catch**, so this task carries an integration test as well:

`packages/db/test/deletes.itest.ts` builds a small season with two events, four matches and twelve entries against the **dev** project, calls the real `deleteEvent` and then the real `deleteSeason`, and asserts that both succeed and leave no orphan rows behind. Run it with `pnpm --filter @frc/db test:integration test/deletes.itest.ts`.

```bash
pnpm --filter @frc/server exec vitest run && pnpm typecheck
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(server): add the admin cascade deletes with an impact count and a typed confirmation"
```

---

## Task 1.61: Client — the destructive-action surface

**Files:**
- Create: `apps/client/src/features/admin/DeleteDialog.tsx`, `apps/client/src/features/admin/DeleteDialog.test.tsx`
- Modify: `apps/client/src/features/admin/SeasonsPanel.tsx`, `EventsPanel.tsx`, `MatchesPanel.tsx`, `apps/client/src/features/builder/BuilderPage.tsx`, `apps/client/src/features/entries/EntryPreviewPage.tsx`

**Interfaces:**
- Produces: one dialog used by every cascade delete, driven by `getDeleteImpact`.

**Rules (SPEC-FINAL §17.8).** One confirm dialog everywhere: it **names the object**, **states what is lost as a count** ("this deletes 4 entries"), and puts the **destructive verb on the primary button**. **Type-to-confirm only for multi-record irreversibles** — delete a season, delete a form version, wipe local device data. **Plain confirm for single records.** **Undo instead of a dialog wherever undo is possible.** **An action that would orphan collected data is blocked, not confirmed**, and no confirmation text overrides it.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeleteDialog } from './DeleteDialog';

const impact = { events: 2, matches: 4, entries: 12, forms: 1, form_versions: 2 };

describe('DeleteDialog (SPEC-FINAL 17.8)', () => {
  it('names the object and the exact counts it will destroy', async () => {
    render(<DeleteDialog kind="season" name="CRESCENDO 2026" impact={impact} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('CRESCENDO 2026');
    expect(dialog).toHaveTextContent('12 entries');
    expect(dialog).toHaveTextContent('4 matches');
  });

  it('requires the name to be typed for a season, a form and a form version', async () => {
    for (const kind of ['season', 'form', 'form_version'] as const) {
      const { unmount } = render(<DeleteDialog kind={kind} name="X" impact={impact} onConfirm={vi.fn()} onCancel={vi.fn()} />);
      expect(screen.getByLabelText(/type the name to confirm/i)).toBeInTheDocument();
      unmount();
    }
  });

  it('uses a plain confirm with no typing for a single entry', () => {
    render(<DeleteDialog kind="entry" name="Qualification 12 · 2096" impact={{ entries: 1 }} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByLabelText(/type the name/i)).not.toBeInTheDocument();
  });

  it('puts the destructive verb on the primary button, not "OK"', () => {
    render(<DeleteDialog kind="season" name="X" impact={impact} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /delete season/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^ok$/i })).not.toBeInTheDocument();
  });

  it('tells the admin to run supabase db dump first', () => {
    render(<DeleteDialog kind="season" name="X" impact={impact} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/supabase db dump/)).toBeInTheDocument();
  });

  it('shows a blocked panel with no confirm control when the delete would orphan data', () => {
    render(<DeleteDialog kind="form_version" name="v1" impact={impact} blocked="this version has 4 entries bound to it" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/4 entries bound to it/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/type the name/i)).not.toBeInTheDocument();
  });

  it('disables the confirm button until the typed name matches exactly, including case', async () => {
    const user = userEvent.setup();
    render(<DeleteDialog kind="season" name="CRESCENDO" impact={impact} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const button = screen.getByRole('button', { name: /delete season/i });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/type the name to confirm/i), 'crescendo');
    expect(button).toBeDisabled();
    await user.clear(screen.getByLabelText(/type the name to confirm/i));
    await user.type(screen.getByLabelText(/type the name to confirm/i), 'CRESCENDO');
    expect(button).toBeEnabled();
  });

  it('closes without deleting when cancelled, and calls nothing', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<DeleteDialog kind="season" name="X" impact={impact} onConfirm={onConfirm} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement, run, commit**

```bash
pnpm --filter @frc/client exec vitest run src/features/admin && pnpm typecheck && pnpm lint
```

Expected: every suite green, including the new file(s) from this task.

```bash
git add -A && git commit -m "feat(client): add the single destructive-action pattern for every cascade delete"
```

---

# Phase 1 K — the smoke suite and the gate (§20.2.11)

---

## Task 1.62: The full CI smoke suite

**Files:**
- Modify: `apps/server/smoke/slice.smoke.ts` → rename to `apps/server/smoke/wiring.smoke.ts` and extend
- Create: `apps/server/smoke/fixtures.ts`
- Modify: `.github/workflows/ci.yml` (nothing structural — the step already exists)

**Interfaces:**
- Produces: the tier-2 suite of SPEC-FINAL §18.4 — **"is the app still wired together?"** — exercising the **real client → server → database path** end to end rather than mocking it, so a broken connection, a renamed environment variable, a missing migration or a dropped route **fails the build instead of failing at an event**.

**It covers exactly (§18.4):** authentication and session · load the active competition · load a form version · **submit an entry and read it back** · run one metric over it · the `/health` endpoint's database read. It runs against the **dev** Supabase project — never production — inside a **namespaced `CI` season that the suite creates and tears down**. It is **deliberately shallow**: it proves the wiring; behaviour is tier 1's job.

- [ ] **Step 1: Write the tests**

```ts
  it('auth: login with the seeded CI account returns a usable token', async () => {
    const res = await fetch(`${base}/api/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: ids.username, password: CI_PASSWORD }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; user: { role: string } };
    expect(body.user.role).toBe('admin');
    token = body.token;
  });

  it('auth: an unauthenticated call to a registry route is refused with 401', async () => {
    const res = await fetch(`${base}/api/listUsers`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('unauthenticated');
  });

  it('context: getActiveContext returns a season and an event', async () => {
    const res = await fetch(`${base}/api/getActiveContext`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: '{}',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty('active_season_id');
  });

  it('metric: rankTeams returns the CI team with the average points that entry implies', async () => {
    const res = await fetch(`${base}/api/rankTeams`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ event_id: ids.event }),
    });
    expect(res.status).toBe(200);
    const table = (await res.json()) as { rows: { team_id: string; average_points: number | null }[] };
    const row = table.rows.find((r) => r.team_id === ids.team)!;
    // one entry, ci_counter = 4, one point per unit
    expect(row.average_points).toBeCloseTo(4, 6);
  });
```

with `let token = '';` and `const CI_PASSWORD = 'ci-smoke-pass-1';` declared at module scope, and the `beforeAll` fixture creating the CI user with `bcryptjs.hashSync(CI_PASSWORD, 10)` and role `admin`.


- [ ] **Step 2: Run against the preview deployment and in CI**

```bash
SMOKE_API_BASE_URL=https://<preview-server-host> \
SMOKE_SUPABASE_URL=https://<dev-ref>.supabase.co \
SMOKE_SUPABASE_SERVICE_ROLE_KEY=<from your local .env> \
pnpm --filter @frc/server exec vitest run --config vitest.smoke.config.ts
```

Expected: every suite green, with the new file(s) from this task among them. Then push and confirm the CI `Smoke suite` step prints the same.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: grow the smoke suite to the full client-server-database wiring check"
```

---

## Task 1.63: `RUNBOOK.md` for the event, and the offline verification

**Files:**
- Modify: `docs/ops/RUNBOOK.md`
- Create: `docs/ops/OFFLINE-CHECK.md`

**Interfaces:**
- Produces: the venue checklist filled in with what this build actually does, and a one-page offline verification procedure to run **on a real phone with the network actually off, before every event** (SPEC-FINAL §18.4, §20.4).

**`OFFLINE-CHECK.md` — the exact procedure.** Fourteen numbered steps, each with the expected result written next to it:

1. Install the PWA to the home screen from the production URL. → The trefoil icon appears; the name reads "Scouting".
2. Open it online and let it hydrate. → The indicator reads `online`; the context page names the active event.
3. Enable airplane mode. Force-quit the app. Cold-start it. → It opens in under 3 seconds and says it is working from data on the device.
4. Open the entry screen for a robot. → The form renders with every field and the sticky timer.
5. Enter 10 match entries for 10 different robots, using every field type at least once. → The indicator reads `offline · 10 unsynced`.
6. Mid-entry, force-quit and reopen. → The draft is offered for recovery with its values intact.
7. Mark one robot a no-show. → No fields are shown, and the confirmation summary lists the status and nothing else.
8. Try to open the form builder. → The "this needs a computer" panel, or the offline panel, and never a half-working builder.
9. Try to switch the active event. → Disabled, saying only the default competition is available offline.
10. Open the ranking table. → It computes from the device and says the figures are from this device.
11. Open the sync page. → 10 pending, each named by team and match; last successful sync shown in `DD/MM/YYYY`.
12. From a second device, send those entries by QR; scan them on the first. → "batch complete", and the entries appear in the receiver's list; **the sender's outbox is still 10 pending**.
13. Disable airplane mode. → Within a few seconds the indicator reads `online` with no count, and the sync page shows a fresh successful sync.
14. On a laptop, open the ranking table. → The 10 entries are there and the numbers match what was entered.
15. **Measure the two §18.1 targets while you are there.** Tap a counter with the phone's dev tools open: the value must change in **under 100 ms** — it is a local state update, so anything slower is a re-render bug, not a network one. Then submit an entry with the network on and watch the sync page: the entry must reach the server **within 2 seconds** of connectivity. Record both numbers in the results log; a regression here is invisible until it is infuriating.

Any step that fails is a release blocker. Record the date, the device and the result at the bottom of the file each time it is run.

- [ ] **Step 1: Write both documents**
- [ ] **Step 2: Run the procedure on a real phone and record the result**
- [ ] **Step 3: Verify the heading check still passes**

```bash
pnpm docs:check && pnpm vitest run scripts/check-docs.test.ts
```

Expected: `ops documentation complete`; every suite green, including the new file(s) from this task.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "docs(ops): finish the runbook and add the offline verification procedure"
```

---

## Task 1.64: The phase 1 gate rehearsal

**Files:**
- Modify: `docs/ops/RUNBOOK.md` (record the result)

**Interfaces:**
- Produces: the gate itself. **No code.**

**The gate, verbatim (SPEC-FINAL §20.4).**

> **A student who has never seen the app enters 10 real match entries on a real phone in airplane mode, syncs, and the ranking table is correct.** No help, no coaching, watched not assisted.
>
> *(Ten matches of rehearsal data against a real form at a test event — not the practice mode of §8.5, whose entries are never stored, and not `match_type = 'practice'`, which is excluded from aggregates.)*
>
> Plus: the full smoke suite green in CI, `RUNBOOK.md` written, and the offline path verified with the network actually off.

- [ ] **Step 1: Prepare**

Create a real season, a real event, a real roster and a real published match form through the admin pages — not the seed script. Create 10 qualification matches. Hand a student a phone with the PWA installed and hydrated, and nothing else.

- [ ] **Step 2: Watch, do not help**

Write down every place they hesitate. That list is the phase 2 backlog's first page, whatever else is on it.

- [ ] **Step 3: Check the numbers yourself**

```bash
# on a laptop, against the same event
curl -s -X POST https://<server-host>/api/rankTeams \
  -H 'content-type: application/json' -H "authorization: Bearer $TOKEN" \
  -d '{"event_id":"<event-id>"}' | head -c 600
```

Expected: one row per team, `average_points` matching a hand calculation from the ten entries, no-shows excluded rather than averaged as zero.

- [ ] **Step 4: Record the result**

Append to `docs/ops/RUNBOOK.md`: the date, who ran it, how long the ten entries took, what they hesitated on, and pass or fail. **A fail is not a bug list — it is the gate not passing**, and phase 2 does not start.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "docs(ops): record the phase 1 gate rehearsal result"
```

---

# Phase 2 — Analysis

**Headings only.** Phase 2 is re-planned in full task detail **after the phase 1 gate passes** (SPEC-FINAL §20.8), because what the gate rehearsal reveals changes what phase 2 should be.

The order below is SPEC-FINAL §20.2's order. The gate is §20.4: *a strategy lead builds a metric and a chart unaided, and a pick list survives being edited offline and synced.*

**Schedule checkpoint (§20.6).** The phase 1 gate should pass by **~2026-10-20**. **If it has not passed by 2026-11-01, phase 2 is cut to the metric builder and the configurable ranking dashboard** — everything below those two waits. Phase 1's fixed ranking table already works, so a cut ships a usable ranking either way. v1 ships on **2026-11-20** with less analysis rather than late with more.

1. **Metric builder and metric storage** — the menu builder of §11.2 (field(s) → aggregation → filters), `createMetric` / `updateMetric` / `deleteMetric`, and the `metrics` table that already exists from task 0.11.
2. **The chart and dashboard builder** — the chart set of §12.2, the closed dimension vocabulary of §12.3, the 12-column grid of §12.4, the view-time metric selector and expand-to-stack of §12.5, and the mobile density rules of §12.10. Including the **heatmap, field-position scatter and cycle-path renderings** of phase 1's spatial data.
3. **The configurable ranking dashboard, the weighting mode and the weight-preset builder** — §13.5's min–max normalisation, the `1 − normalized` inversion, the 0.5 rule for a missing metric and for a column where min equals max, the contribution breakdown, and the presets — **replacing phase 1's fixed table**.
4. **Team compare** — §13.6: the head-to-head scoreboard for 2 teams, radar + table for 3–6.
5. **Match preview** — §13.7: mirrored alliances, the summed-average prediction, contributions, margin, reliability and no-show flags.
6. **Operational statistics** — §12.7's meta-metric catalogue over the same builder.
7. **Pick list, do-not-pick list and alliance bracket** — §14 in full: two lists per event, seeding from a weight preset, drag-reorder against the **list-level version** of §14.7, round detection, live cross-off derived from `alliance_slots`, declines, and the lead's do-not-pick addition. The schema exists from task 0.12 and the outbox entities from task 1.1; the feature does not.
8. **The built-in dashboards and the dashboards hub** — §12.8's five built-ins, one row per kind per season, each reachable in context from its home page, plus the hub that prompts for a parameterized built-in's input.

Nothing else. **Appendix A of SPEC-FINAL stays out of scope**, in phase 2 as in phase 1.

---
# Appendix P1 — Decisions taken while planning

Every row is a place where `SPEC-FINAL.md` was too unspecific to write actual code from, and a decision was taken so the plan would not contain a placeholder. Each one is deliberately **boring and reversible**, and each is consistent with a decision SPEC-FINAL already made elsewhere. **Overturn any of them before the build starts** — changing one later costs a task, not a rewrite.

| # | The gap | The decision | Where it lands |
|---|---|---|---|
| P1 | SPEC-FINAL names no test runner | **Vitest** for unit, integration and smoke tests. No Playwright: §18.4 puts full end-to-end journeys and UI rendering tests explicitly out of scope | Task 0.1; every task's test command |
| P2 | No lint or format toolchain named | **ESLint 9 flat config + typescript-eslint + Prettier**, one config at the repo root | Task 0.1 |
| P3 | No router named | **React Router 7**, declarative routes only — no data-router loaders, because all reads go through the cache or the RPC client | Task 1.8 |
| P4 | No table library named beyond "TanStack Table" for the data table (§12.2) | **TanStack Table v8** for the ranking table too, so there is one table implementation | Tasks 1.58, 1.53 |
| P5 | No drag-and-drop library named | **`@dnd-kit`** (core + sortable) — used by the builder canvas now and the pick list in phase 2 | Task 1.29 |
| P6 | No JWT library named (§7.5 names only HS256) | **`jose`** — pure JS, no native build on Vercel Functions, the same reasoning §7.5 gives for `bcryptjs` | Task 1.11 |
| P7 | Tailwind major version unstated | **Tailwind v4** with a CSS-first `@theme` block mapping the §17.4 tokens; shadcn/ui components added through its CLI | Task 0.4 |
| P8 | "Self-hosted and subset" fonts, no mechanism (§17.6) | **`@fontsource-variable/inter` and `@fontsource/noto-sans-hebrew`** as npm dependencies, imported in CSS. No CDN, and the woff2 files are precached | Task 0.5 |
| P9 | Database access mechanism from the server unstated | **`@supabase/supabase-js` with the service-role key** over PostgREST, not a direct Postgres connection — one dependency, no connection pooling to reason about on serverless | Task 0.3 |
| P10 | Nothing describes how a use case reaches the database in a testable way | A narrow **`Store` interface** in `core/context.ts`, with one Supabase implementation and one in-memory implementation for tests. **Use cases never import `supabase-js`** | Task 1.3 |
| P11 | §16.4 says the typed client is derived from the registry but names no HTTP shape | **`POST /api/<useCaseName>`** for every registry entry, plus the three routes SPEC-FINAL names explicitly: `GET /health`, `GET /sync/pull`, `POST /sync/push` | Task 1.12 |
| P12 | No error envelope or status mapping | `{ error: { code, message, details } }` with a fixed `AppError.code → HTTP status` table | Tasks 0.2, 1.12 |
| P13 | "Bounded, paginated" with no convention (§16.4) | `{ items, next_cursor }`, `limit` default **50**, hard cap **200** | Task 1.13 onward |
| P14 | `op_id` is "the idempotency key" but nothing says where it is remembered (§9.3.1) | A small **`applied_operations(op_id, applied_at)`** table. Replaying a batch returns `noop` from it | Task 1.3, migration `20260904090000` |
| P15 | The pull is "paged by `next_cursor`" with no cursor shape (§9.3) | Entities walked in the fixed §9.3 order; each queried **ordered by `updated_at` ascending**; cursor = base64 `{entityIndex, offset}`; page budget **2000 rows** | Task 1.4 |
| P16 | `watermark = max(updated_at) − 5 s` is ambiguous across pages | Each page returns the max over **its own** rows minus 5 s; **the client keeps the greatest and commits it only when `complete: true`** | Task 1.4, task 1.6 |
| P17 | §9.2 lists what is cached but not how each child table is scoped | A `PULL_SCOPES` table: event-scoped, season-scoped or global, with child tables scoped through their parent's id list | Task 1.4 |
| P18 | The token carries a `role` claim and the database carries one too | **The role comes from the database at the edge**, never from the token, so a role change takes effect immediately instead of in 30 days | Task 1.12 |
| P19 | §20.2 says the walking skeleton needs no auth, but `syncPush` takes a caller | The skeleton's HTTP edge builds the caller from the **first operation's `author_user_id`** — the permanent per-operation rule of §7.5, not a stopgap. Task 1.14 replaces one line with the bearer token | Tasks 1.3, 1.14 |
| P20 | "Rate-limited by username" with no limit (§16.5) | **10 attempts per 5 minutes per username**, in-memory per function instance, documented as best-effort. With ~11 users that is the right size | Task 1.11 |
| P21 | Login failure messages unspecified | **The same message for an unknown username and a wrong password**, so the API does not enumerate accounts | Task 1.11 |
| P22 | Nothing prevents the admin disabling the last admin | `disableUser` **refuses to disable the last enabled admin**. A boring guard against locking yourself out of your own install | Task 1.13 |
| P23 | §7.6 says the server compares the two client timestamps, but not whose `client_created_at` | **The stored row's** `client_created_at`, not the operation's — otherwise a client could widen its own window by resending a fresher one | Task 1.14 |
| P24 | §7.5 says the token lives in IndexedDB but not where | Dexie `meta` table, key **`auth.session`**, holding `{ user, token, offline }` | Task 1.15 |
| P25 | §7.5 says the offline password is "held in memory only" with no mechanism | A **module-level variable** in `pendingCredential.ts`. It dies with the tab, which is exactly the lifetime the spec asks for, and it is never a Dexie row | Task 1.16 |
| P26 | §3.1 lists `updated_at` on `app_settings` but the §3 convention says every table has both | **Both columns on every table**, `app_settings` included | Task 0.8 |
| P27 | §3.2 shows `username text not null unique` *and* asks for a `lower(username)` unique index | **Only the `lower(username)` unique index.** Two overlapping constraints would let `Alice` and `alice` disagree about which one failed | Task 0.9 |
| P28 | `forms.active_version_id` and `form_versions.form_id` reference each other | `forms` is created without the foreign key; it is added by **`alter table` after `form_versions` exists** | Task 0.9 |
| P29 | Migration file naming unstated | `packages/db/supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`, applied by the Supabase CLI | Tasks 0.8 – 0.12 |
| P30 | §6.4 says a season "cannot be created without a game image path that resolves", but the server has no filesystem | A **generated `SEASON_IMAGE_MANIFEST`** in `packages/shared`, written by `pnpm season:images` from the committed files and drift-checked in CI. The server validates against it | Task 1.23 |
| P31 | §8.3 says a draft is written per entry but names no key | **`${form_version_id}:${match_id}:${team_id}`** — stable across a reload and unique per robot per match | Task 1.7 |
| P32 | `device_id` on `/sync/push` has no source | Generated once with `crypto.randomUUID()` and stored in Dexie `meta` under `device.id` | Task 1.8 |
| P33 | §10's 45-second refresh has no mechanism | A `setInterval` in `AppShell` calling the **same `syncNow`** the manual button calls, so there is one sync path and not two | Task 1.8 |
| P34 | §6.3's session-only override has no representation | A **module-level variable** with a subscribe hook, plus `entryCreationAllowed()` which the entry route checks | Task 1.22 |
| P35 | §9.5 names the resolutions but not their input shape | `{ keep: 'live' \| 'superseded' }` for a divergence, `{ keep_row_id }` for a duplicate; **resolving an already-resolved conflict is refused**, not silently redone | Task 1.41 |
| P36 | §17.8 requires the confirmation to "name the damage" but Appendix C has no use case for it | A new query, **`getDeleteImpact`**, returning the exact per-table counts | Task 1.60 |
| P37 | Appendix C lists `updateForm` but nothing that writes a version's fields | A new command, **`saveDraftFields`**, which is where the structural-change rule of §5.1 lives | Task 1.27 |
| P38 | §5.9 requires JSON export/import but Appendix C has no use case | Two new use cases, **`exportForm` and `importForm`**, serialising `{ kind, name, timer_config, fields, scoring_rules }` with no ids, so a definition is portable between seasons | Task 1.27 |
| P39 | §12.6 defines the shading ramp in words | Implemented in **OKLCH between three CSS tokens** (`--shade-worst`, `--shade-mid`, `--shade-best`) so lightness varies monotonically and both themes inherit one definition | Task 1.59 |
| P40 | §17.4 lists ten tokens; the functional colours of the same section have none | Added `--status-played/-broke-down/-disabled/-no-show`, `--danger`, `--warning`, `--sync-offline/-syncing/-online` and the three shading tokens, all defined in both themes | Task 0.4 |
| P41 | §19.3 puts "apply migrations to dev" in the pipeline that also runs on a PR into `main` | The migration step runs **only on a push to `develop`**. A pull request into `main` runs everything else and touches no database | Task 0.15 |
| P42 | Nothing keeps `.env.example`, the ops docs and the image manifest honest | Three cheap CI steps: **`env:example:check`, `docs:check`, `season:images --check`** | Tasks 0.6, 0.7, 0.15, 1.23 |
| P43 | §19.7's seed script has no fixture identity | **Deterministic UUIDs** (`00000000-0000-4000-8000-…`) exported from `packages/db`, three seeded users `seed_scouter` / `seed_lead` / `seed_admin`, password `seedpass1`. **No personal identity anywhere**, per §19.8 | Task 0.14 |
| P44 | Nothing stops the seed being pointed at production | It **refuses to run** unless `SUPABASE_URL` contains `SUPABASE_DEV_PROJECT_REF` | Task 0.14 |
| P45 | §9.8's CRC32 has no named library | Implemented in ~10 lines in `packages/shared/src/qr/codec.ts`. A dependency for a checksum is not worth the supply chain | Task 1.46 |
| P46 | §9.8 does not say what a batch id is | A random unsigned 32-bit integer, written into the 12-byte frame header | Task 1.46 |
| P47 | §9.9 does not say whether the wipe clears the discarded-records log | **It does not.** §9.7 says that log is kept for the life of the install, and a wipe is not an install | Task 1.49 |
| P48 | §5.2's Timer field is "nullable via an unsure toggle" — null or absent? | **Absent from `data`.** It submits no value rather than a wrong number, and an absent key is what every other optional field does | Task 1.24 |
| P49 | §5.7 says a computed value is written into `data` at submit time, which would trip the unknown-key check | Computed keys are **known keys, exempt from the required check**, and are recomputed by the engine at read time so an expression correction repairs history | Task 1.24 |
| P50 | `ensureMatch` creates a row offline, so the id must exist before the server sees it | The **client generates the uuid** and passes it in, exactly as it does for an entry — an offline device can never collide | Task 1.19 |
| P51 | The walking skeleton's `/entries` page and the real entry search would collide | The skeleton's page **is replaced** by the entry search in task 1.52, not kept alongside it | Tasks 1.8, 1.52 |
| P52 | The pull budget number is not in the spec | **2000 rows per page.** One district event is ~700 entries, so a first pull is one or two pages | Task 1.4 |
| P53 | §9.6's offline matrix is prose | Encoded as **data** in `offlineCapability.ts`, with a test that every gated capability is in the table, so nothing can be gated by an unwritten assumption | Task 1.45 |
| P54 | The phase 2 alliance-selection outbox entities exist in §9.4 but the feature is phase 2 | The **entity names and the offline flags ship in phase 1** (tasks 1.1, 1.45); `syncPush` rejects them as `invalid` until phase 2 implements them | Tasks 1.1, 1.40 |

---

# Appendix P2 — Use-case coverage

Every row of SPEC-FINAL's Appendix C, and the task that builds it. Rows marked **phase 2** are deliberately absent from this plan.

## Queries

| Use case | Task |
|---|---|
| `getActiveContext` | 1.18 |
| `syncPull` | 1.4 |
| `listSeasons` / `listEvents` | 1.18 |
| `listTeams` / `listEventRoster` / `listMatches` | 1.19 |
| `listUsers` | 1.13 |
| `searchTeams` | 1.50 |
| `listTeamEvents` | 1.50 |
| `queryEntries` | 1.50 |
| `getEntry` | 1.50 |
| `getForm` / `getFormVersion` / `getFormDictionary` | 1.28 |
| `getTeamStats` | 1.57 |
| `rankTeams` | 1.57 (**fixed** table only — §13.5, D18) |
| `listConflicts` | 1.41 |
| `health` | 0.3 |
| `compareTeams` · `getMatchPreview` · `getOperationalStats` | **phase 2** |
| `listMetrics` / `getMetric` · `listDashboards` / `getDashboard` · `listWeightPresets` | **phase 2** |
| `getPickLists` / `getDoNotPick` / `getAllianceBracket` | **phase 2** |
| `getDeleteImpact` *(added — see P36)* | 1.60 |

## Commands

| Use case | Task |
|---|---|
| `login` / `refreshToken` | 1.11, 1.12 |
| `changeOwnPassword` | 1.13 |
| `createUser` / `setUserRole` / `resetPassword` / `disableUser` | 1.13 |
| `createSeason` / `updateSeason` / `setActiveSeason` | 1.18 |
| `createEvent` / `updateEvent` / `reorderEvents` / `setActiveEvent` | 1.18 |
| `createTeam` / `updateTeam` / `setEventRoster` | 1.19 |
| `createMatch` / `updateMatch` / `setMatchTeams` / `deleteMatch` | 1.19 |
| `ensureMatch` | 1.19 |
| `createForm` / `updateForm` / `publishFormVersion` / `restoreFormVersion` / `deleteFormVersion` | 1.27 |
| `saveDraftFields` · `exportForm` / `importForm` *(added — see P37, P38)* | 1.27 |
| `setScoringRules` | 1.28 |
| `upsertEntry` | via `syncPush` (1.3, 1.14, 1.40) — every entry write rides the outbox |
| `deleteEntry` | 1.60 |
| `deleteSeason` / `deleteEvent` / `deleteForm` | 1.60 |
| `resolveConflict` | 1.41 |
| `syncPush` | 1.3, 1.14, 1.40 |
| `createMetric` / `updateMetric` / `deleteMetric` | **phase 2** |
| `saveDashboard` / `updateDashboard` / `deleteDashboard` | **phase 2** |
| `saveWeightPreset` / `deleteWeightPreset` | **phase 2** |
| `createPickList` / `setPickListOrder` / `reseedPickList` | **phase 2** |
| `addPickListEntry` / `removePickListEntry` / `setPickListNote` | **phase 2** |
| `addDoNotPick` / `editDoNotPick` / `removeDoNotPick` | **phase 2** |
| `initialiseBracket` / `setAllianceSlot` / `recordDecline` / `removeDecline` | **phase 2** |

**`upsertEntry` note.** SPEC-FINAL lists it as a command, and §9.4 says **every local mutation is appended to the outbox**. Building a second, non-outbox write path for entries would give two ways to create an entry and two places for the conflict rules to live. So `syncPush` **is** the `upsertEntry` transport, and the client's `submitEntry` is its caller. If a non-outbox entry write is ever needed — a CLI backfill, say — it is a thin wrapper over the same `applyEntry` function.

---

# Appendix P3 — What this plan deliberately does not build

Cross-checked against SPEC-FINAL Appendix A. If a build chat proposes any of these, the task is wrong.

- No external import of any kind — no TBA, no FRC Events API, no file import, **no `source` field on entries**. The official-result columns exist and are **never populated**, and their UI is hidden entirely while they are null.
- No OPR, DPR, CCWM, win rate, average ranking points or schedule strength. No scouted-vs-official comparison.
- No scouter assignments, no coverage matrix.
- **No photo field, no robot or pit photos, no Supabase Storage, no binary upload, no uploadable field image.** The team page has no photos.
- No generated per-form-version SQL views; nothing flattens JSONB in the database.
- No Supabase Realtime, no WebSockets, no live match view, no presence, no notifications, no device-to-device local-network sync.
- No chart, table or dashboard export in any format. No chart drill-down. No next-year re-map wizard. No full-text notes search. No multi-season team-history view. No outlier or distribution flagging. **No scouter reliability score** (decided against, not deferred). No redundant/double scouting or agreement measurement. No bulk-fix tools.
- **No printable views and no print stylesheets.** No blank paper backup form.
- **No ordinary light theme** — only dark and the outdoor high-contrast theme.
- No pit forms, human-player forms, or any form kind beyond `match` and `super`.
- No global search omnibox. No custom domain. No error or usage monitoring.
- No in-app export, restore or backup automation. No per-entry edit history. No user audit log. No self-service password reset. No multi-tenant support.
- No `show_on_team_card` or "quick summary" per-field flag. No per-field per-phase scoring. No versioning of metrics, of the scoring model, or of the ranking and compare metric sets.
- No pick-list history and no ordering snapshots.
- **No MCP endpoint, transport or auth. No LLM API call, AI panel, prompt engineering or generated insight.** The four §16.8 obligations are built — semantic metadata, the transport-agnostic use-case layer with Zod schemas and descriptions, the explicit `caller` argument with the read-only `service` kind, and bounded pre-aggregated query output — and nothing more. `include_in_ai_context` is stored and unused.

---

# Appendix P4 — Decisions taken during verification

The plan was checked by **three** passes: one reading `SPEC-FINAL.md` and the plan side by side for missing requirements, one reading the plan alone as the engineer who has to run it, and — after the first round of fixes was applied — a third checking that those fixes had actually landed and had not broken anything. The third pass was worth running: it found that **nine of the twenty-seven fixes claimed below had been mis-applied, half-applied or falsely reported**, including two that made the plan worse than before. Those are corrected here and marked.

These are the decisions the three passes forced. They continue Appendix P1's numbering.

| # | The gap | The decision | Where it lands |
|---|---|---|---|
| P55 | The plan was written in POSIX shell; the machine is Windows | **Every command runs in Git Bash**, stated once at the top. Three specific PowerShell hazards are named: env-var prefixes, `>` writing UTF-16, and `$VAR` expansion. `db:types` uses `--output` rather than `>` for exactly that reason | Preamble; task 0.8 |
| P56 | `new URL(...).pathname` breaks on a Windows path containing spaces and Hebrew | **`fileURLToPath` everywhere**, in all four scripts that resolve a path | Tasks 0.6, 0.7, 0.8, 0.13, 0.14 |
| P57 | ESLint 9 loads `eslint.config.js` per the nearest package type | **`"type": "module"` on the root `package.json`** | Task 0.1 |
| P58 | Turborepo 2 runs in strict env mode and would hide `VITE_*` from the build | **`globalEnv`** listing the five variables the build legitimately reads | Task 0.1 |
| P59 | `prettier --check .` would fail on the hand-formatted spec and this plan | **`.prettierignore`** covering `docs/`, the lockfile and both generated files | Task 0.1 |
| P60 | `scripts/` was in no Vitest project, so two suites would never run | **A third workspace project, `scripts`**, and CI's `pnpm test` therefore covers them | Task 0.1 |
| P61 | Cumulative "N tests passed" figures go stale and become noise | **No cumulative counts.** The failing run names the file and the error; the passing run expects every suite green | Preamble; every task |
| P62 | `AppDeps` would have grown a required field in task 1.3, breaking every existing `createApp` call and its tests | **`routes?: Hono[]` exists from task 0.3**, empty until something fills it | Task 0.3 |
| P63 | Nothing composed the real `Store` into the two entry points, so the deployed sync routes could never work | **One `composition.ts`**, imported by `api/index.ts` and `dev-server.ts` and by nothing else. Tasks 1.3, 1.4 and 1.12 extend that one function | Tasks 0.3, 1.3 |
| P64 | The `Store` interface would have grown a method per task, breaking both implementations each time | **The whole phase-1 `Store` is declared in task 1.3**, with both implementations starting as loud `not implemented` stubs. Later tasks replace stubs; none widens the interface | Task 1.3 |
| P65 | The same problem for the test fake | **The complete `FakeContext` shape is declared in task 1.3**, every map constructed empty and every fixture helper throwing until its task lands | Task 1.3 |
| P66 | The `applied_operations` ledger was created by a phase 1 migration, which would have invalidated the committed database types | **Moved into migration 0003**, so phase 1 adds no migrations at all and the type drift check can be absolute | Tasks 0.10, 1.3 |
| P67 | A fixture with the same `config` range and `expected_range` could not distinguish the two rules | **The fixture ranges differ** (`config` 0–99, `expected_range` 0–10), and each rule has its own case | Task 1.2 |
| P68 | The three §3.5 cross-column entry constraints were enforced nowhere on the server | **`validateEntryShape` in `packages/shared`**, called by both `submitEntry` and `syncPush`. A QR-relayed operation reaches the server without passing through a client, so the client check alone was never enough | Task 1.3 |
| P69 | `hydrate` reported `cached` on the strength of any rows at all | It reads the **hydrated-event watermark**, so a first pull that stopped at page 1 of 3 reports `blocked` rather than rendering a form from a partial definition | Task 1.6 |
| P70 | `teams` was pulled globally rather than season-scoped | Scoped to **every team on any of the season's rosters or with an entry there**, exactly as §9.2 words it | Task 1.4 |
| P71 | A module-singleton rate limiter made the login tests interfere with each other | **`loginLimiter` is exported and has `reset()`**, called in `beforeEach` | Task 1.11 |
| P72 | §16.5 requires **both** unauthenticated routes to be rate-limited; only `login` was | **`refreshToken` shares the same limiter**, keyed by the username in the presented token | Task 1.12 |
| P73 | `applyEntry` rewrote `scouter_id` on every write, so a lead's correction reassigned authorship | **`scouter_id` is set on create and preserved on update** | Task 1.14 |
| P74 | `origin: 'qr'` was both cleared on ack and used to select records for the escape hatch | **Two fields**: `origin` (cleared on ack, read by the outbox) and `received_by_qr` (permanent, read by "discard received QR data") | Task 1.48 |
| P75 | `deleteEvent` and `deleteSeason` would abort, because `scouting_entries.match_id` is `on delete restrict` | **Entries are deleted first, explicitly**, and the task carries an integration test against the real database — an in-memory fake cannot catch this class of bug | Task 1.60 |
| P76 | §16.7's "the image is immutable once entries exist" was not enforced anywhere | **`updateSeason` refuses to change `field_image_path` on a season that has entries**, naming the alternative | Tasks 1.18, 1.23 |
| P77 | The season image manifest could drift silently | **`pnpm season:images:check` in CI**, beside the other two drift checks | Tasks 0.15, 1.23 |
| P78 | The registry test asserted on an empty registry | **The registry ships with its first three entries**, and one deliberately brittle test lists them — every later task that registers a use case updates it | Task 1.12 |
| P79 | `SEED_FIELDS` was a heterogeneous `as const` array, so `f.points` did not typecheck | **An explicit `SeedField` type** with nulls where a value does not apply | Task 0.14 |
| P80 | The seed declared a super form and never created one | **The super form, its version and its two fields are seeded**, so both v1 form kinds exist in dev | Task 0.14 |
| P81 | Task 0.15's expected output contradicted its own fallback note about nothing being deployed | The task now says plainly: **open the branch, do task 0.17, then merge and watch it go green** | Task 0.15 |

**Round three — fixes to the fixes.** Every row below is a defect the third pass found in the work recorded above it.

| # | What round two got wrong | The correction |
|---|---|---|
| P82 | **P68 was half-applied.** `syncPush` called `validateEntryShape`; `submitEntry` kept an ad-hoc check that tested one of the three §3.5 rules | `submitEntry` calls the same shared function. Task 1.7 |
| P83 | **P65 was false.** Task 1.23's new tests used `ctx.entryCountsBySeason`, which no task declared — and a parenthetical asserted it did | `Store.countEntriesBySeason` and `FakeContext.entryCountsBySeason` declared in task 1.3, like everything else |
| P84 | **P64 was false for five tasks.** 1.11, 1.13, 1.18, 1.27 and 1.40 still listed `core/context.ts` as a file to modify; 1.11 re-declared `StoredFullUser` **without `created_at`** | All five now replace stubs in `repos/store.ts` and the fake. The interface is declared once, in 1.3 |
| P85 | **P74 never reached the code.** `received_by_qr` was described in task 1.48's prose and declared nowhere | Declared in task 1.5's `SyncStateRecord`, indexed in Dexie, and set by `enqueue` and `ackResults` |
| P86 | **The 1.23 → 1.18 exception was circular.** 1.23 *modified* `seasons.ts`, which 1.18 *creates* | Task 1.18 absorbs the whole image-manifest contract — asset, generator, manifest, shared export, CI check — and consumes it in the same diff. 1.23 keeps the client half. The preamble's exception table drops to one row |
| P87 | **Task 0.14's field ids collided.** Deriving them from the version id by `slice(0, -3)` collapsed all three versions onto one id set; the upserts overwrote each other and the **match form ended with no fields**, silently | A `SEED.formField(versionIndex, fieldIndex)` allocator, plus a test asserting both match versions keep their five fields |
| P88 | Task 0.14 used `SEED_SUPER_FIELDS` without importing it | Imported |
| P89 | **Task 1.13's `createUser` returned the store row**, bcrypt hash included, and failed its own test | One `toPublicUser` mapper that every user-returning use case goes through |
| P90 | **Task 1.40 was about to delete task 1.14's edit-window guard.** Its `applyEntry` rewrite started at the parent check and never mentioned the ownership or `edit-window-expired` branches | An explicit "keep 1.14's guard" note, naming what happens if 1.14's tests go red |
| P91 | Task 1.12's dispatcher called a four-argument handler with three, and the registry imported a `loginOutput` schema that did not exist | `config` is passed; `loginOutput` is exported from `login.ts` as a Zod object |
| P92 | Task 1.12 registered `changeOwnPassword`, whose module task **1.13** creates | The registry ships `login` + `refreshToken`; 1.13 adds the rest and updates the brittle key test |
| P93 | **128 tests across 14 tasks were bare `it('name');` lines** — legal Vitest *todos*, reported green — while Appendix P5 claimed every test file was complete | All 14 written out. P5 now says so accurately, and says what it got wrong |
| P94 | Three tasks each claimed to replace the sync `callerFor`, and one comment pointed at a client-side task | Task 1.12 owns it, in `composition.ts`. 1.3's comment and 1.14's duplicate instruction corrected |
| P95 | `supabaseStore` was typed `: Store` and implemented 6 of 65 methods | Both implementations spread the same `stubsFor([...])`, defined once in `repos/store.ts` |

---

# Appendix P5 — Known gaps in this plan

Written so that nothing is hidden. Everything below is a **deliberate remaining weakness**, not an oversight, and each line says what it would cost to close.

### 1. Some UI tasks specify a component by contract, not by code

**Every test file in this plan is now written out in full.** An earlier revision of this appendix claimed that and was wrong — 128 tests across 14 tasks were bare `it('name');` lines, which Vitest treats as *todo* and reports green. They are written. If you find another one, it is a bug in this plan, not a style.

What remains is narrower: **these tasks give the component's file, props, DOM structure, ARIA roles and exact copy, and a complete test file, but describe the render body in prose rather than printing it** — **1.17** (`StateMessage`, `ConfirmDialog`, the users pages), **1.20 – 1.22** (the admin panels and the context page), **1.29 – 1.31** (the builder shell, settings pane and preview), **1.34**, **1.37**, **1.38**, **1.42 – 1.44**, **1.51 – 1.53**, **1.58**, **1.59**, **1.61**.

Why this is tolerable: the tests assert on roles, labels, copy and behaviour, so an agent that satisfies them has little room to invent. Why it is still a gap: the diff will be less predictable than for the server, database and engine tasks, and the review will take longer.

**If you want them closed**, the cheapest route is one planning chat per group (C, D, E, H) that expands only those tasks, using the finished ones — 1.7, 1.8, 1.23, 1.33 — as the house style. That is four chats, and it can happen while phase 0 is being built.

### 2. Everything else in this appendix is closed

The three sections that used to sit here — the two sketched entry points, the eight loose §17 details, and the half-built typed client — have been written out. They are listed here so the record of what was closed, and when, is not lost:

| Was | Now | Where |
|---|---|---|
| Super-scouting entry point sketched in prose | The `/super` route, the roster picker, the four-nulls rule and the **open-the-existing-one** behaviour, with its test file | Task 1.36 |
| Client half of bare-match auto-creation missing entirely | `SelectRobotPage` is a number input, not a dropdown: an unknown match number is created through the outbox, offline, with the notice and the test | Task 1.8 |
| Skeletons, not spinners | `Skeleton.tsx`, with a test that there is no spinner in it and that it respects `prefers-reduced-motion` | Task 1.17 |
| The "update ready" hint never rendered | One muted footer line, **and no reload button** — there is nothing safe for that button to do mid-match | Task 1.8 |
| Delta pull missing on screen entry and pull-to-refresh | Both wired to the same single `run(false)` path as every other trigger | Task 1.8 |
| The "this event no longer exists" notice | Rendered, and it names the event | Task 1.8 |
| Undo missing on multi-select and timer reset | Both through `useUndoable`; §8.2 names five repeatable inputs and now all five have it | Tasks 1.33, 1.34 |
| Computed fields never recomputed at read time | `hydrateComputed`, called by every read path, so fixing an expression repairs history | Task 1.54 |
| The 100 ms tap and 2 s sync targets unmeasured | Step 15 of the offline check, with both numbers recorded in the log | Task 1.63 |
| Typed client half-built | `packages/shared/src/api` holds the schema map both sides import; `rpc.call` is typed per use case | Task 1.15 |

**Practice mode's entry point** is the one §3 row still open: `practiceMode.enter()` exists and is tested, but no route or toggle calls it. It belongs in task 1.37 and is a few lines.

**"All metrics for the team" in phase 1** is the other: task 1.57's `getTeamStats` says "all metrics" without saying which, since the metric builder is phase 2. Pin it when you build 1.57 — the honest phase-1 answer is the fixed ranking columns plus one row per scorable field.

---

*End of plan. Phase 2 is re-planned in full task detail after the phase 1 gate passes.*
