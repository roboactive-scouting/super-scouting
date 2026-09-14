# Deviations from `IMPLEMENTATION-PLAN.md`

Every departure from the plan's literal steps during the phase 0 pre-gate run
(tasks 0.1 – 0.7), in execution order. Trivial entries are included deliberately:
an unlogged deviation is worse than a noisy log.

Run context: Windows 11, Git Bash, Node v22.12.0, pnpm 9.12.3, repo at
`C:\dev\frc-scouting`, branch `feat/phase-0` cut from `develop` at `17c713c`.

---

## Task 0.1 — branch names and sequence

**Plan said:** `git checkout main && git pull && git checkout -b develop && git push -u origin develop && git checkout -b feat/monorepo-scaffold`

**What was wrong:** `develop` already exists and is pushed (it is at `17c713c`, ahead of `main`). Re-creating it from `main` would have discarded the provisioning work already merged there. The run is also executing seven tasks back to back rather than one per chat, so seven `feat/<slug>` branches would be seven branches with nothing to merge between them.

**What I did instead:** `git checkout develop && git pull && git checkout -b feat/phase-0`, and every task 0.1 – 0.7 commits to `feat/phase-0`. One commit per task, each with the task's exact commit message. No push, no pull request. This was directed explicitly in the run instructions.

**Risk:** None to the code. Review is a seven-commit branch instead of seven branches; each commit is still one task and still individually reviewable.

---

## Task 0.1 — `engine-strict=true` rejects the current `typescript-eslint`

**Plan said:** `.npmrc` contains `engine-strict=true`, and `package.json` pins `"eslint": "^9.14.0"`, `"@eslint/js": "^9.14.0"`, `"typescript-eslint": "^8.13.0"`.

**What was wrong:** `pnpm install` failed outright:

```
ERR_PNPM_UNSUPPORTED_ENGINE  Unsupported environment (bad pnpm and/or Node.js version)
This error happened while installing the dependencies of typescript-eslint@8.70.0
 at @typescript-eslint/parser@8.70.0
 at @typescript-eslint/visitor-keys@8.70.0
Your Node version is incompatible with "eslint-visitor-keys@5.0.1".
Expected version: ^20.19.0 || ^22.13.0 || >=24
Got: v22.12.0
```

The caret ranges resolve to the current 8.70.0 / 10.x line, whose transitive `eslint-visitor-keys@5` raised its Node floor to `^22.13.0`. This machine is pinned at Node v22.12.0 and must not be reinstalled. `engine-strict=true` — which the plan wants, so that a Node 20 machine fails loudly — turns that into a hard install failure.

**What I did instead:** narrowed the three ESLint-toolchain carets to tildes so they resolve to the exact minor line the plan names: `"@eslint/js": "~9.14.0"`, `"eslint": "~9.14.0"`, `"typescript-eslint": "~8.13.0"`. `engine-strict=true` is kept unchanged. Install then resolved `eslint 9.14.0`, `typescript-eslint 8.13.0` and succeeded. Node was not touched and nothing was deleted.

**Risk:** ESLint 9.14.0 is flagged deprecated by npm ("no longer supported"), so no upstream security patches for the linter. It is a dev-only dependency that never ships. The same Node-floor collision is likely to recur in tasks 0.3 – 0.5 (Vite, Tailwind, Hono and friends have all moved past Node 22.12 in places); each recurrence will need the same narrowing and will be logged here. The real fix is a Node 22.13+ upgrade, which is out of scope for this run.

---

## Task 0.1 — `vitest.workspace.ts` exceeds the Prettier print width

**Plan said:**

```ts
export default ['packages/*', 'apps/*', { test: { name: 'scripts', include: ['scripts/**/*.test.ts'] } }];
```

**What was wrong:** that is 105 characters, and `.prettierrc.json` — written by the same task — sets `printWidth: 100`. Step 6 requires `pnpm format:check` to pass, so the two files as written contradict each other.

**What I did instead:** wrote the same value in Prettier's own formatting, across four lines. Semantically identical.

**Risk:** None.

---

## Task 0.1 — single-line JSON objects in both `package.json` files

**Plan said:** `"engines": { "node": ">=22.0.0 <23" }`, `"exports": { ".": "./src/index.ts" }`, `"devDependencies": { "typescript": "^5.6.3", "vitest": "^2.1.4" }` — each on one line.

**What was wrong:** Prettier always expands a JSON object onto multiple lines, so `pnpm format:check` failed on `package.json` and `packages/shared/package.json`.

**What I did instead:** ran `pnpm format`, which expanded them. Values unchanged.

**Risk:** None.

---

## Task 0.1 — `CLAUDE.md` line endings, and the missing `.gitattributes`

**Plan said:** `.prettierignore` ignores `docs/`, `pnpm-lock.yaml`, two generated sources and the build directories. The plan lists no `.gitattributes`.

**What was wrong:** `pnpm format:check` failed on `CLAUDE.md`. The cause was line endings, not prose: the file was CRLF in the working tree because `git config core.autocrlf` is `true` on this machine, while Prettier defaults to `endOfLine: "lf"`. Left alone, every file this run creates would come back as CRLF on the next fresh clone and `format:check` would fail on all of them — including in CI.

**What I did instead:** two changes. Added `.gitattributes` containing `* text=auto eol=lf`, so checkouts are LF regardless of the machine's `core.autocrlf`; this also protects the `>`-redirection / UTF-16 hazard the plan already warns about under **Shell**. Then normalised the working-tree copy of `CLAUDE.md` to LF. The index already held LF, so that produced a zero-byte content diff — `git diff CLAUDE.md` is empty. `CLAUDE.md` was not reformatted and `docs/` was not touched; `git status` showed no churn anywhere else after `.gitattributes` was added.

**Risk:** `.gitattributes` is a file the plan does not know about, so a later task that rewrites repository config could drop it without noticing. If it is dropped, `format:check` starts failing on a fresh Windows clone. Low, and loud when it happens.

---

## Task 0.1 — the failing-first error text differs from the plan's prediction

**Plan said:** Expected: `FAIL packages/shared/src/version.test.ts` — `Failed to resolve import "./version"`.

**What was wrong:** nothing of substance. Vitest 2.1.9 / Vite 5.4.21 words the same failure differently:

```
FAIL |@frc/shared|  src/version.test.ts [ packages/shared/src/version.test.ts ]
Error: Failed to load url ./version (resolved id: ./version) in C:/dev/frc-scouting/packages/shared/src/version.test.ts. Does the file exist?
```

**What I did instead:** accepted it — same file, same cause (the module does not exist yet), same red.

**Risk:** None. Noted only because later tasks quote expected error strings too, and they should be read as "this failure, in this file", not as literal text to match.

---

## Task 0.2 — the `Caller` union in `caller.ts` is not Prettier-formatted

**Plan said:**

```ts
export type Caller =
  | { kind: 'user'; userId: string; role: Role }
  | { kind: 'service'; label: string };
```

**What was wrong:** Prettier collapses that onto one line, because the collapsed form is 84 characters and fits inside `printWidth: 100`. `pnpm format:check` therefore failed on `packages/shared/src/caller.ts`.

**What I did instead:** ran `pnpm format` and kept Prettier's single-line union. The type is identical; only the line breaks moved. Re-ran the shared suite afterwards to confirm the reformat broke nothing — 13 tests, all green.

**Risk:** None. Worth knowing only because the plan quotes source it did not run Prettier over, so the same one-line collapse will keep happening in later tasks.

---

## Task 0.2 — the ESLint guard was proved, not assumed

**Plan said:** Step 4 inserts a `no-restricted-imports` / `no-restricted-globals` block scoped to `files: ['packages/shared/src/**/*.ts']`, and step 5 verifies with `pnpm lint`, which passes whether or not the new block is reachable.

**What was wrong:** nothing was wrong, but the stated verification cannot fail. `packages/shared`'s lint script is `eslint src` run from inside `packages/shared`, while the flat-config pattern is written repo-root-relative. If the base path did not resolve to the repo root, the guard would silently match nothing and `pnpm lint` would still be green — the browser-safety rule would exist and enforce nothing.

**What I did instead:** wrote a throwaway `packages/shared/src/__guard-probe.ts` importing `node:path`, ran `pnpm --filter @frc/shared lint`, and saw it rejected:

```
1:1  error  'node:path' import is restricted from being used by a pattern.
            packages/shared must stay browser-safe (SPEC-FINAL 16.1)  no-restricted-imports
```

then deleted the probe. The guard is reachable from the package-local script. Nothing about the plan's config was changed.

**Risk:** None. Recorded because "the rule is in the file" and "the rule fires" are different claims, and only the second one is worth anything.
