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

---

## Task 0.3 — the `eslint-disable` in `dev-server.ts` is itself a lint warning

**Plan said:**

```ts
serve({ fetch: buildApp().fetch, port: 3000 }, (info) => {
  // eslint-disable-next-line no-console
  console.warn(`server listening on http://localhost:${info.port}`);
});
```

**What was wrong:** task 0.1's own `no-console` rule is `['warn', { allow: ['warn', 'error'] }]`, so `console.warn` was never a violation. ESLint 9 reports unused suppressions by default, and `pnpm lint` printed:

```
C:\dev\frc-scouting\apps\server\src\dev-server.ts
  5:3  warning  Unused eslint-disable directive (no problems were reported from 'no-console')
```

**What I did instead:** deleted the comment. `console.warn` stays. `pnpm lint` is then silent.

**Risk:** None. If a later task tightens `no-console` to disallow `warn`, this line becomes a real warning and will need the directive back.

---

## Task 0.3 — two long test lines pre-wrapped to the print width

**Plan said:** in `apps/server/src/app.test.ts`,

```ts
    const res = await app().request('/health', { headers: { Origin: 'https://client.example.com' } });
```

**What was wrong:** 102 characters, over `printWidth: 100`. Same class of problem as the `vitest.workspace.ts` entry above.

**What I did instead:** wrote it wrapped the way Prettier wants, so `pnpm format:check` was green the first time rather than needing a follow-up `pnpm format`. Assertions unchanged.

**Risk:** None.

---

## Task 0.3 — Turborepo warns that `@frc/shared#build` produces no output

**Plan said:** `turbo.json` declares `"build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".vercel/output/**"] }`, and `packages/shared`'s `build` script is `tsc --noEmit`.

**What was wrong:** nothing breaks, but `pnpm typecheck` (which depends on `^build`) prints on every run:

```
WARNING  no output files found for task @frc/shared#build. Please check your `outputs` key in `turbo.json`
```

`--noEmit` writes nothing, so the declared `outputs` can never be satisfied.

**What I did instead:** left both files exactly as the plan wrote them. The warning is cosmetic and the alternative — special-casing `outputs` per package, or making shared emit `dist/` — is a design change this task has no mandate for.

**Risk:** Recurring noise in every build log from here on, which is the kind of warning people learn to scroll past. If a later task needs `packages/shared` to emit real build output, this is the line to revisit.

---

## Task 0.4 — `tsconfig.app.json` references a package task 0.5 installs

**Plan said:** `"types": ["vite/client", "vite-plugin-pwa/client", "node"]`, and step 5 expects `pnpm typecheck` clean.

**What was wrong:** `vite-plugin-pwa` is not a dependency until task 0.5. `pnpm typecheck` failed:

```
error TS2688: Cannot find type definition file for 'vite-plugin-pwa/client'.
  The file is in the program because:
    Entry point of type library 'vite-plugin-pwa/client' specified in compilerOptions
```

A forward dependency: task 0.4 cannot be green on its own as written.

**What I did instead:** wrote `"types": ["vite/client", "node"]` in task 0.4 and added `"vite-plugin-pwa/client"` back in task 0.5, in the same commit that installs the package. Task 0.5's stated file list does not mention `tsconfig.app.json`; it does now.

**Risk:** None once both tasks have landed. If task 0.5 is ever skipped or reordered, the PWA client types go missing silently — `import.meta.env` still typechecks, but `virtual:pwa-register` would not. Task 0.5 has a test that fails in that case.

---

## Task 0.4 — Prettier lowercases CSS hex, and the token test asserts uppercase

**Plan said:** `apps/client/src/styles/tokens.css` — **hex digits uppercase, exactly as the test asserts** — with `expect(css).toContain('--bg: #0A0A0B')`, and step 5/6 requiring the whole workspace green including `pnpm format:check`.

**What was wrong:** Prettier normalises hex colours in CSS to lowercase and has no option not to. So `pnpm format` turns `#0A0A0B` into `#0a0a0b`, which fails `tokens.test.ts`; and leaving the file uppercase fails `pnpm format:check`. The two instructions in the same task cannot both hold.

**What I did instead:** added `apps/client/src/styles/tokens.css` to `.prettierignore`, with a comment saying why. That keeps the file a byte-exact transcription of the SPEC-FINAL 17.4 table, which is the only reason the test's "uses the exact spec values" assertion means anything. The precedent already exists in that file — it exempts `packages/db/src/database.types.ts` and `packages/shared/src/season/manifest.ts` for the same reason: generated or transcribed content whose exact bytes matter.

The alternative — lowercase both the CSS and the assertions — was rejected because it silently breaks the byte-match with the spec table, which is the thing a reviewer diffs against.

Note that the *built* CSS is lowercase anyway (`--bg:#0a0a0b` in `dist/assets/index-*.css`); Lightning CSS normalises it. CSS hex is case-insensitive, so this is purely about the source file.

**Risk:** `tokens.css` is no longer auto-formatted. It is a 60-line list of custom properties, so there is little for Prettier to do, but a future hand-edit will not be tidied. If a later task adds real CSS logic to this file rather than tokens, move that CSS elsewhere rather than dropping the ignore.

---

## Task 0.4 — three source lines over the print width

**Plan said:** the one-line forms in `apps/client/src/config.test.ts` (101 chars) and `apps/client/vite.config.ts`.

**What was wrong:** over `printWidth: 100`, so `pnpm format:check` failed. Same class as the earlier entries.

**What I did instead:** `pnpm format`. Behaviour unchanged; re-ran the client suite afterwards, 10 tests green.

**Risk:** None.

---

## Task 0.4 — `[RAISED BY ME]` `--border` fails the SPEC-FINAL 17.7 contrast floor in the dark theme

**Plan said:** transcribe the SPEC-FINAL 17.4 table verbatim — `--border: #3F3F46` on `--bg: #0A0A0B` in the dark theme.

**What was wrong:** the plan transcribed it correctly. **The spec contradicts itself.** §17.7 requires "**3:1 for UI boundaries** and chart strokes, in both themes. A token pair that fails is a bug, not a preference." I measured every §17.4 pair. All pass except this one, and only in the dark theme:

| Pair (dark theme) | Ratio | Floor |
|---|---|---|
| `--border #3F3F46` on `--bg #0A0A0B` | **1.89:1** | 3:1 |
| `--border #3F3F46` on `--surface #18181B` | **1.70:1** | 3:1 |
| `--border #3F3F46` on `--surface-raised #27272A` | **1.43:1** | 3:1 |

Everything else clears its floor: `--text` 18.96, `--text-muted` 7.72 on `--bg` and 6.91 on `--surface`, `--brand` on `--brand-plate` 16.04, every status colour 3.82–8.69, the whole shading ramp 3.06–5.03. The outdoor theme passes across the board, `--border` included at 7.73.

**What I did instead:** **nothing — I kept `#3F3F46`.** The palette is fixed at exact hex by §17.4 and the run brief is explicit that inventing a second palette is the one way this work can damage the project. Changing a spec-fixed token on my own authority is not a deviation I get to make. This is logged as a finding for a human decision instead.

For whoever decides: the fix is to lighten `--border` in the dark theme only. Roughly `#6E6E76` is the first value that clears 3:1 against `--bg` (3.92:1), and it would clear it against `--surface` and `--surface-raised` too. That is a visibly lighter hairline than `#3F3F46` and changes the feel of every card edge and table rule in the app, which is exactly why it is not my call.

Worth noting before anyone panics: WCAG 1.4.11 applies to boundaries that are the *only* way a control or its state is conveyed — input outlines, unfilled buttons, selected rows. A purely decorative divider between two surfaces is out of scope. So the honest reading is that §17.7 as written is stricter than WCAG actually requires, and the decision is whether to relax the §17.7 sentence or lighten the token. Either way it should be settled before task 1.7 puts real bordered inputs on a tablet in an arena.

**Risk:** If neither is done, the app ships with input and card boundaries at 1.7:1 in its default theme on the exact devices §18.1 targets, and §17.7 remains a rule the codebase violates on line one — which teaches everyone to ignore it.

---

## Task 0.4 — what the `frontend-design` skill was and was not used for

**Plan said:** the global constraints require the skill "for craft, never for identity" (§17.9), with its *Ground it in the subject* section and its 4–6-hex-palette / 2+-typeface step excluded.

**What was wrong:** nothing. Recorded so the exclusions are auditable rather than assumed.

**What I did instead:** applied *Restraint and self-critique* (the contrast audit above is that section doing its job), *Structure is information*, and *More on writing in design* — under which the placeholder shell keeps plain sentence-case copy and no invented marketing voice. Did **not** apply *Ground it in the subject* or the palette/typeface step: §17.4 fixes ten tokens plus the status and ramp sets at exact hex in two themes, and §17.6 fixes Inter and Noto Sans Hebrew.

**One line of the skill disagreed with §17 and lost:** "*Leverage motion deliberately. Think about where and if animation can serve the subject: a page-load sequence, a scroll-triggered reveal, hover micro-interactions, ambient atmosphere.*" The global constraints forbid all four on the data-entry path. No animation of any kind was added in this task or the next.

**Risk:** None.
