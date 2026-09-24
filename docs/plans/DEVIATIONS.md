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

---

## Task 0.5 — `virtual:pwa-register` cannot resolve under Vitest

**Plan said:** `apps/client/src/pwa.ts` contains

```ts
const { registerSW } = await import('virtual:pwa-register');
```

and step 5 expects `pnpm --filter @frc/client exec vitest run` green.

**What was wrong:** `virtual:pwa-register` is a *virtual* module invented by the `VitePWA` plugin, and that plugin is configured in `vite.config.ts`. Vitest loads `vitest.config.ts`, a separate config that never mentions VitePWA, so the specifier resolves to nothing:

```
FAIL  src/pwa.test.ts [ src/pwa.test.ts ]
Error: Failed to resolve import "virtual:pwa-register" from "src/pwa.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/dev/frc-scouting/apps/client/src/pwa.ts:23:42
```

The import is inside `browserAdapter()`, which no test calls — but Vite resolves imports at transform time, so the whole module fails to load and takes all three `pwa.test.ts` cases with it. Task 0.5 cannot be green as written.

**What I did instead:** left `src/pwa.ts` exactly as the plan wrote it — it is correct for the real build, which does load the plugin — and confined the fix to test configuration. Added `apps/client/src/test/pwa-register-stub.ts` (a `registerSW` that returns a resolved promise, with a comment explaining why it exists) and aliased the virtual specifier to it in `vitest.config.ts`, next to the existing `@` alias. `src/test/` is already where the client's test harness lives, alongside `setup.ts`.

The alternative — loading VitePWA inside `vitest.config.ts` — was rejected: it would generate a service worker and a precache manifest on every test run, for one dynamic import that no test exercises.

**Risk:** The stub silently satisfies the import, so if `browserAdapter()`'s real contract ever drifts from `registerSW({ immediate, onNeedRefresh })`, the tests will not notice. The registration behaviour that actually matters — no auto-reload, ever — is tested against the injected `PwaAdapter`, not against this stub, so the part SPEC-FINAL 9.1 cares about is still covered.

---

## Task 0.5 — `tsconfig.app.json` type reference restored here

**Plan said:** task 0.5's file list names `vite.config.ts`, `index.html`, `package.json` and `src/styles/index.css` as the files it modifies.

**What was wrong:** incomplete, as a consequence of the task 0.4 entry above. `src/pwa.ts` imports `virtual:pwa-register`, whose types come from `vite-plugin-pwa/client`.

**What I did instead:** added `"vite-plugin-pwa/client"` back to `types` in `apps/client/tsconfig.app.json` in this commit, the same one that installs the package. `pnpm typecheck` is green across all four projects.

**Risk:** None.

---

## Task 0.5 — the build output list differs from the plan's prediction

**Plan said:** Expected: the build prints `PWA v0.21.x` and lists `dist/sw.js` and `dist/manifest.webmanifest` among the emitted files.

**What was wrong:** half right. The build prints

```
PWA v0.21.2
mode      generateSW
precache  26 entries (1574.19 KiB)
files generated
  dist/sw.js
  dist/workbox-2fbc6a65.js
```

`dist/manifest.webmanifest` is **not** in that list — vite-plugin-pwa 0.21.2 lists only the service worker and its Workbox chunk there.

**What I did instead:** verified the manifest directly rather than trusting the summary line. `dist/manifest.webmanifest` exists, contains the exact SPEC-FINAL 17.8 identity (`"name":"ROBACTIVE Scouting"`, `"short_name":"Scouting"`, `"display":"standalone"`, both colours `#0A0A0B`, `"orientation":"any"`, all three icons with the maskable variant), is referenced from `dist/index.html`, and appears in `dist/sw.js`'s precache list. Both Apple touch icon links are in the built HTML too. All 26 precache entries include the `woff2` faces.

**Risk:** None. Logged because the plan's expected output is the thing a reviewer checks against, and it does not match reality.

---

## Task 0.5 — `frontend-design` again, and what was deliberately not added

**Plan said:** implement `<Logo />` on its `--brand-plate` plate.

**What was wrong:** nothing.

**What I did instead:** kept the plan's component exactly. Recorded here only to confirm the override held for a second task: no hover treatment, no entrance transition and no ambient effect was added to the logo, the shell, or the install surface — the skill's *Leverage motion deliberately* paragraph proposes all three, and the global constraints forbid them on the data-entry path. The component reads `--brand-plate` and `--brand` through the `.brand-plate` class; no hex appears anywhere in `Logo.tsx`. Brand yellow is confined to the near-black plate in both themes, so §17.4's 1.23:1-on-white hazard cannot occur.

**Risk:** None.

---

## Task 0.6 — `--check` was proved to fail, not assumed to

**Plan said:** step 4 expects `pnpm env:example:check` to exit 0 and print nothing.

**What was wrong:** nothing, but as with the ESLint guard in task 0.2, a check that has only ever been seen passing is not yet known to work. This one is the CI gate that stops a real secret reaching the repo (task 0.15 runs it), so it is worth more than an assumption.

**What I did instead:** appended a fake filled-in line to `apps/server/.env.example` and re-ran the check:

```
drift: C:\dev\frc-scouting\apps\server\.env.example does not match docs/ops/ENVIRONMENT.md
Run `pnpm env:example` and commit the result.
exit=1
```

Then regenerated and confirmed it goes green again. Also confirmed the two things that actually matter about this generator:

- **No worksheet value leaked.** §2's `SUPABASE_URL` row holds both real project URLs in its value columns. Neither appears in the output — `grep -rnE "supabase\.co|eyJ|https://"` over both generated files prints nothing, and step 5's `clean: names and placeholders only` is the real output, not a prediction.
- **`.gitignore` behaves as intended in both directions.** `git status` tracks both `.env.example` files, and `git check-ignore -v apps/server/.env` reports `.gitignore:7:.env` — a real `.env` cannot be committed by accident.

No plan file was changed.

**Risk:** None.

---

## Task 0.6 — `docs/ops/ENVIRONMENT.md` was read and never written

**Plan said:** the generator reads §1 and §2 of the worksheet.

**What was wrong:** nothing. Recorded because a parallel session owns that file for the duration of this run.

**What I did instead:** read §1 and §2 only. The file was never staged, edited or reverted, and `git status -- docs/ops/ENVIRONMENT.md` is empty at this commit. The §3 table — which has gained a "Value (non-secret only)" column and some filled-in non-secret values — is not parsed: `parseSection` stops at the next `\n## ` heading, so the client section ends at `## 2.` and the server section ends at `## 3.`. Confirmed by the generated output, which contains exactly the seven server and three client variables from §1 and §2 and nothing from §3.

**Risk:** None. If §3 is ever renumbered so that a `## ` heading stops separating the tables, the server section would swallow it; the `--check` drift gate would catch that on the next CI run rather than silently emitting GitHub Actions secret names into a `.env.example`.

---

## Task 0.7 — the failing-first run fails one step earlier than predicted

**Plan said:** Step 2 — Expected: `ENOENT: no such file or directory, open 'docs/ops/SETUP.md'`.

**What was wrong:** step 1 creates only `scripts/check-docs.test.ts`, and that test imports `./check-docs.mjs`, which step 3 creates. So the first run cannot reach the `readFileSync` that produces the ENOENT; it dies at module resolution:

```
FAIL |scripts| scripts/check-docs.test.ts [ scripts/check-docs.test.ts ]
Error: Failed to load url ./check-docs.mjs (resolved id: ./check-docs.mjs) in
C:/dev/frc-scouting/scripts/check-docs.test.ts. Does the file exist?
```

**What I did instead:** ran it in two stages so both reds were actually observed. First the resolution failure above; then, after writing `scripts/check-docs.mjs` but before writing the documents, the red the plan predicted:

```
→ ENOENT: no such file or directory, open 'C:\dev\frc-scouting\docs\ops\SETUP.md'
Test Files  1 failed | 1 passed (2)
Tests  2 failed | 7 passed (9)
```

Only then were the two documents written. No plan step was skipped or reordered.

**Risk:** None.

---

## Task 0.7 — `docs:check` was proved to fail

**Plan said:** step 6 expects `ops documentation complete`.

**What was wrong:** nothing. Same reasoning as the task 0.2 and 0.6 entries: a green check that has never been seen red is not yet evidence.

**What I did instead:** renamed `## New-season checklist` to `## New season checklist` in a scratch copy and re-ran:

```
docs/ops/SETUP.md is missing sections: New-season checklist
exit=1
```

Restored the file and confirmed `ops documentation complete` again. The heading list is genuinely enforced, and it is exact-match — a section renamed by one hyphen is caught.

**Risk:** Exact-match means a legitimate future rename of a section has to be made in two places, `check-docs.mjs` and the document. That is the intended behaviour: the point of the check is that a required section cannot be dropped quietly.

---

## Task 0.7 — the Vercel Root Directory ordering constraint

**Plan said:** nothing about it. The plan's Vercel sections (step 5, items 5 and 6) describe the settings to enter but not when the projects can be created.

**What was wrong:** an omission with real consequences. Vercel validates the Root Directory against the repository tree at import time and refuses a path that is not there — the value cannot even be typed. Both Vercel projects are therefore **impossible to create** until `apps/client/` and `apps/server/` exist on a branch that has been pushed. Verified by hand on 2026-09-14 against this repository and this account; not inferred from documentation.

**What I did instead:** wrote it into both Vercel sections of `SETUP.md` as a hard ordering constraint with its own heading-level emphasis and a three-step order (scaffold → push → import), not as a footnote. Both sections also say what goes wrong if you import first: a project rooted at the repository root that builds nothing, needing the Root Directory fixed afterwards.

**Risk:** None. It removes a failure mode from the provisioning gate rather than adding one.

---

## Task 0.7 — the review pass found a backup procedure that would not have backed anything up

**Plan said:** step 5, item 8 — "**Backup: `supabase db dump`** — the exact command, where to save the file, and the standing rule that it is a checklist line before every event and at the end of every season."

**What was wrong:** I wrote the command as the plan and `RUNBOOK.md` both spell it — a bare `supabase db dump -f <file>` — and a subagent review caught that this is **schema-only**. Verified directly:

```
$ npx -y supabase@latest db dump --help
DESCRIPTION
  Dumps data or schemas from the remote database.
FLAGS
  --data-only              Dumps only data records.
  --use-copy               Use copy statements in place of inserts.
```

So the one documented safety net — which `SETUP.md` itself calls "the only copy of a season that exists outside the live database" — would have produced a file containing the table definitions and none of the entries. Silently, with no error, and nobody would find out until a restore was attempted.

Two further defects in the same section, also from the review and also verified:

- **The dump landed inside the repository.** `pnpm --filter @frc/db exec` runs with its working directory set to the package — confirmed: `pnpm --filter @frc/server exec node -e "console.log(process.cwd())"` prints `C:\dev\frc-scouting\apps\server`. So `-f "name.sql"` writes into `packages/db/`, in the working tree.
- **And the document claimed git would stop that, which was false.** `.gitignore` as written by task 0.1 has no `*.sql` rule — `grep -n sql .gitignore` matched nothing. A student following the document literally would have done the exact thing the document forbids while being told they could not.

**What I did instead:** rewrote the section. Two dumps, schema and `--data-only --use-copy`, both written to `~/frc-backups/` outside the repository; a "look at the file before you trust it — megabytes of `COPY`, not kilobytes of `CREATE TABLE`" check; and the deleted false claim replaced with the real reason the path matters. Added a narrow `*.backup.sql` rule to `.gitignore` as a second line of defence, with a comment saying why it is **not** `*.sql`: `packages/db/supabase/migrations/*.sql` must stay committable. Proved both halves:

```
$ git check-ignore -v packages/db/prod-data-2026-09-14.backup.sql
.gitignore:14:*.backup.sql	packages/db/prod-data-2026-09-14.backup.sql
$ git check-ignore -v packages/db/supabase/migrations/0001_init.sql
(no match — migration NOT ignored, correct)
```

Also added a note that the CLI shells `pg_dump` into a container and may need Docker, and that the procedure should be proved once on a quiet day rather than at an event.

**Risk:** **`RUNBOOK.md` still says the bare command**, at its pre-event checklist line "Run `supabase db dump` and save the file off-platform." The plan gives `RUNBOOK.md` as verbatim text and I did not alter it, so the two ops documents now disagree: `SETUP.md` is right and `RUNBOOK.md` is wrong on the single most consequential command in the project. **That line needs fixing, and it is the one thing from this run I would fix first.** It was left alone here only because rewriting a document the plan supplies verbatim is a larger call than a deviation entry should make on its own.

---

## Task 0.7 — six further review findings, fixed

**Plan said:** various parts of step 5's eleven items.

**What was wrong:** the same review pass found six smaller defects. Each was verified before acting; none is a plan error except the first.

1. **`apps/client/vercel.json` does not exist.** Plan item 5 says the client's "build and install commands come from `apps/client/vercel.json`". `ls apps/*/vercel.json` returns only `apps/server/vercel.json`; the client one is created by the final phase-0 task, *after* the Vercel import the sentence appears in. So the plan's own sentence is false at the moment a reader executes it. Rewrote it to describe what actually applies — Vercel's Vite preset defaults — and to say the file arrives later. The server section was already correct and names a file that exists.
2. **Local `.env` files were never covered.** `ENVIRONMENT.md` §5 was the only worksheet section `SETUP.md` never cross-referenced, so a reader could follow the whole document and still not be able to run `pnpm dev`. Added a **Running it locally** section: copy both `.env.example` files, what to put in each, and "local always points at dev, never production".
3. **"Follow it top to bottom" was contradicted by three of its own sections.** Scoped the opening promise to name all three exceptions up front instead of discovering them mid-document.
4. **Premature tick instructions.** Two steps told the reader to tick `ENVIRONMENT.md` §4's Server rows after setting two of the seven variables those rows stand for. Since ticking the worksheet *is* the whole handshake, a premature tick is a false completeness signal. Moved both ticks to the end of **Vercel — server project**.
5. **`VITE_APP_VERSION` disagreement between the two ops documents.** `ENVIRONMENT.md` §4 lists it among the variables to set on both Client rows; §1 marks it *(auto)*, and `apps/client/vite.config.ts` does inject it from `VERCEL_GIT_COMMIT_SHA`. §1 is right and §4 is stale. I may not edit `ENVIRONMENT.md` during this run, so `SETUP.md` now says which of the two is correct and why, rather than silently contradicting the worksheet the reader is ticking.
6. **`database: error` means two different things.** `SETUP.md` said it was expected before migrations; `RUNBOOK.md` says it means the project is paused. Both are true in their own era. Added the disambiguation to `SETUP.md`, since `RUNBOOK.md` is verbatim.

Separately, replaced every bare plan-task number (`task 0.8`, `task 0.15`, `task 0.16`, `task 1.23`) with a description of the thing itself. `SETUP.md` is written for a maintainer arriving years from now, and `IMPLEMENTATION-PLAN.md` is a phase-0 artefact whose numbering will mean nothing to them.

**What I did instead:** all six fixed in `SETUP.md`; `pnpm docs:check` still prints `ops documentation complete`, the scripts suite is 9/9, and neither document contains a JWT-shaped or Supabase-key-shaped string.

**Risk:** Finding 5 leaves a known disagreement standing in `ENVIRONMENT.md` §4. It should be corrected there — by the session that owns that file — and the paragraph in `SETUP.md` removed once it is.

---

## Task 0.7 — what the review pass confirmed rather than changed

**Plan said:** step 4 supplies `RUNBOOK.md` verbatim; steps 1 and 3 supply the checker and its test verbatim.

**What was wrong:** nothing, and it is worth recording that this was checked rather than assumed. The review extracted the fenced `RUNBOOK.md` block from the plan and compared it byte for byte with the delivered file: identical, `md5 bb919bed357525432256ff63c973549e` on both. `scripts/check-docs.mjs` and `scripts/check-docs.test.ts` are verbatim from the plan. Every `ENVIRONMENT.md` cross-reference in `SETUP.md` points at the right section, all ten variable names match `ENVIRONMENT.md` and SPEC-FINAL Appendix B exactly, all eight GitHub secrets match §3, both project refs are correct throughout, and the `/health` response shape quoted in the document matches `apps/server/src/app.ts` exactly.

**Risk:** None.

---

## Provisioning gate — Vercel rejects `functions.runtime: "nodejs22.x"`

**Plan said:** `apps/server/vercel.json`, delivered in task 0.5, contains
`"functions": { "api/index.ts": { "runtime": "nodejs22.x" } }`, and `SETUP.md`
told the reader that this pins the function runtime and that the Vercel project
setting must agree with it.

**What was wrong:** importing `apps/server` as a Vercel project fails the build
before it reaches any application code:

```
Vercel CLI 59.16.0
> Detected Turbo. Adjusting default settings...
Error: Function Runtimes must have a valid version, for example `now-php@1.0.0`.
```

Vercel parses `functions[].runtime` as the npm package name of a **community**
runtime and requires an explicit version. `nodejs22.x` is not one, so the whole
deployment is refused. The key was never exercised before now because task 0.5
could not deploy — the Vercel projects did not exist until the gate.

**What I did instead:** removed the `functions` block. `apps/server/vercel.json`
now holds only the catch-all rewrite to `/api/index`. The Node version is pinned
by the project's **Node.js Version** setting plus the `engines` field described in
the entry below. Corrected the `SETUP.md` paragraph that asserted the removed
behaviour, and recorded the error text there so the next reader does not restore
the key.

**Risk:** The function's Node version is now governed only by the Vercel project
setting and `apps/server/package.json`'s `engines`. Neither is enforced by a test.
The `/health` check in the final phase-0 task is what proves the function actually
runs; until it passes, the runtime is unverified.

---

## Provisioning gate — Vercel defaults to Node 24 and ignores the root `engines`

**Plan said:** nothing. Both Vercel sections of `SETUP.md` listed "Node.js
Version: 22" as an import-dialog step.

**What was wrong:** two separate errors. Node.js Version is a **project setting**,
not an import-dialog field, so the first build always runs on Vercel's default —
currently Node 24. And Vercel reads the `package.json` at the project's **Root
Directory**, so the root `package.json`'s `"node": ">=22.0.0 <23"` was never
consulted; `apps/client/package.json` and `apps/server/package.json` declared no
`engines` at all. The client's first deploy therefore ran `pnpm install` on Node
24, which `engine-strict=true` rejected:

```
ERR_PNPM_UNSUPPORTED_ENGINE  Unsupported environment (bad pnpm and/or Node.js version)
Expected version: >=22.0.0 <23
Got: v24.19.0
```

**What I did instead:** added `"engines": { "node": ">=22.0.0 <23" }` to both
`apps/client/package.json` and `apps/server/package.json`, so the constraint lives
in the repository rather than only in dashboard state that a project transfer
resets. `pnpm install` and `pnpm typecheck` both still pass and the lockfile is
unchanged. Rewrote both `SETUP.md` steps to say the setting is post-import and
must be changed before the first deploy.

**Risk:** None to the code. The `engines` field is additive and the versions match
the root manifest exactly. If Vercel later changes where it reads `engines` from,
the dashboard setting is still there as the second line of defence.

---

## Provisioning gate — the scaffold had to reach `main`, not just a pushed branch

**Plan said:** `SETUP.md` states the Vercel projects cannot be imported until
`apps/client/` and `apps/server/` exist "on a branch that has been pushed to
GitHub", verified by hand on 2026-09-14.

**What was wrong:** the constraint is narrower than that. Vercel's Root Directory
browser reads the repository's **default branch**. All nine phase-0 commits were on
`feat/phase-0`, pushed; `main` and `develop` held only `CLAUDE.md` and `docs/`. The
`apps` directory was simply absent from the import dialog's directory picker, and
the path cannot be typed past validation.

**What I did instead:** fast-forwarded `develop` and then `main` to `feat/phase-0`
at the user's explicit instruction. Both were clean fast-forwards — `feat/phase-0`
already contained both. The scaffold has to reach `main` regardless, since `main`
is Vercel's Production Branch and the Production deployments build from it.

**Risk:** `main` now carries unreviewed scaffold. Acceptable here because nothing
is deployed from it yet and phase 0's purpose is to stand that up, but it means the
phase-0 branch was never reviewed as a pull request. `SETUP.md`’s wording has been corrected to say
**default branch** rather than "a pushed branch".

---

## Provisioning gate — the "Other" preset demands a `public/` directory

**Plan said:** nothing. `apps/server/vercel.json` and `Framework Preset: Other`
were expected to be sufficient for an API-only project.

**What was wrong:** the server build completed and then failed:

```
WARNING  no output files found for task @frc/server#build. Please check your `outputs` key in `turbo.json`
WARNING  no output files found for task @frc/shared#build. Please check your `outputs` key in `turbo.json`
Error: No Output Directory named "public" found after the Build completed.
```

The **Other** preset looks for a static output directory named `public` once the
build command finishes. `apps/server` produces no static output whatsoever — its
`build` is `tsc --noEmit` and the deployable artefact is the `api/index.ts`
serverless function. The two Turbo warnings are the same fact observed one layer up
and are not themselves errors.

**What I did instead:** committed `apps/server/public/.gitkeep`, an empty directory
whose file explains why it must stay. Documented it as a numbered step in
`SETUP.md`'s server section so nobody deletes it as clutter.

Rejected alternatives: overriding the Build Command to empty (would stop `tsc`
running on deploy, losing a real check), and setting `outputDirectory` to `.`
(would publish `apps/server`'s source tree as static assets — unreachable behind
the catch-all rewrite today, but one rewrite change away from being served).

**Risk:** An empty committed directory is the kind of thing a tidying pass deletes.
The `.gitkeep` text and the `SETUP.md` step are the only guards. If it is ever
removed, the symptom is this exact deployment failure.

---

## Provisioning gate — every branch deployed on both Vercel projects

**Plan said:** nothing about which branches deploy.

**What was wrong:** Vercel builds every pushed branch by default, on both projects.
Pushing one commit to `feat/phase-0`, `develop` and `main` in a single round — done
here so that Vercel would pick up a fix — produced six deployments. The repository
also carries roughly twenty historical `spec/*` branches, any of which would produce
two more if touched. The user asked for this to stop.

**What I did instead:** an **Ignored Build Step** override on each project,
restricting builds to `main` and `develop`, with a new `SETUP.md` section recording
the command and the inverted exit-code convention (`exit 1` builds, `exit 0` skips)
that makes it easy to get exactly backwards.

Also changed how this run pushes: `feat/phase-0` only, with `develop` and `main`
fast-forwarded when a deployment is actually wanted, rather than all three every
time.

**Risk:** Two branches are the floor, not a preference — `main` is the Production
Branch and the `develop` alias is what `SMOKE_API_BASE_URL` and the client's Preview
`VITE_API_BASE_URL` resolve to. Restricting further would break the smoke suite. If
a future task needs a preview from a topic branch, the condition must be widened
rather than the override removed.

---

## Provisioning gate — ESM resolution fails for every relative import on Vercel

**Plan said:** `apps/server` uses `"type": "module"` with
`moduleResolution: "Bundler"` inherited from `tsconfig.base.json`, and therefore
extensionless relative imports throughout — `import { buildApp } from
'../src/composition'`.

**What was wrong:** correct locally, fatal when deployed. The function crashed at
module load on every request:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'/var/task/apps/server/src/composition' imported from
/var/task/apps/server/api/index.js
```

Because the package is `"type": "module"`, Vercel transpiles `api/index.ts` rather
than bundling it, so the emitted JavaScript keeps the extensionless specifier and
hands it to Node's ESM resolver — which, unlike a bundler, requires an explicit
extension. `moduleResolution: "Bundler"` is an accurate description of the local
toolchain and a false one of the deployment.

The symptom is indistinguishable from a bad environment variable: both produce
`500 FUNCTION_INVOCATION_FAILED` as plain text with no JSON body, because
`api/index.ts` calls `buildApp()` at module scope. Only the runtime log separates
them. Worth knowing before spending an hour re-checking Vercel's env var UI.

**What I did instead:** added an explicit `.js` extension to all twelve relative
imports under `apps/server/src` and `apps/server/api`. Under `Bundler` resolution a
`.js` specifier resolves to the sibling `.ts` file, so typecheck, vitest and `tsx`
are unaffected — 53 tests, typecheck, lint and format all green before the push.

Confirmed fixed against both deployed environments:

```
Prod    503 {"status":"error","database":"error","message":"Could not find the table 'public.app_settings' in the schema cache"}
Preview 503 {"status":"error","database":"error","message":"Could not find the table 'public.app_settings' in the schema cache"}
```

That 503 is the expected pre-migration state and it proves the environment
variables are right: the function authenticated against Supabase and got a genuine
schema error back.

**Risk — this fix does not generalise, and the next case is already scheduled.**
It covers *relative* imports only. `apps/server/package.json` declares
`@frc/shared` as a dependency but no source file imports it yet. SPEC-FINAL §16.1
requires that import — `packages/shared` is the single validation source for both
sides — and `@frc/shared` resolves to TypeScript source (`main: ./src/index.ts`).
Node cannot import a `.ts` file from `node_modules`, and no extension fixes it. The
first phase 1 task that shares a schema between client and server will reproduce
this failure in a form that looks completely different.

The durable fix is to bundle the function at build time with esbuild, inlining
`@frc/shared` and every relative import. Deferred to a post-gate task at the user's
direction rather than changed mid-provisioning.

---

## Task 0.8 — `pnpm dlx supabase init` replaced by `npx -y supabase@latest`

**Plan said:** `cd packages/db && pnpm dlx supabase init && cd ../..`, then
`pnpm --filter @frc/db exec supabase login` and
`pnpm --filter @frc/db exec supabase link --project-ref <dev-project-ref>`.

**What was wrong:** nothing about `pnpm dlx` itself; the constraint is this run's
own standing machine note — no `supabase` binary exists locally until
`packages/db/package.json` is written and `pnpm install` resolves its own
`devDependencies`, so the run's instruction is to invoke the CLI via
`npx -y supabase@latest` (pinned 2.117.0) up to that point, never `pnpm dlx`. The
account is already logged in account-wide, so the `login` step was skipped —
confirmed rather than assumed: `npx -y supabase@latest projects list` returned both
projects (`frc-scouting-dev` and `frc-scouting-prod`, both `ACTIVE_HEALTHY`) with no
prompt of any kind.

**What I did instead:** ran `npx -y supabase@latest init --workdir packages/db`.
Once `packages/db/package.json` existed and `pnpm install` had resolved the local
`supabase` devDependency, every later invocation went through the package's own
scripts — `pnpm --filter @frc/db db:push`, `pnpm --filter @frc/db test:integration`
— exactly as the plan's `package.json` specifies, with no further `npx` calls.

**Risk:** None.

---

## Task 0.8 — the failing-first error is a schema-cache miss, not `42P01`

**Plan said:** Step 3 — Expected: every test fails with
`relation "public.seasons" does not exist` (PostgREST code `42P01`).

**What was wrong:** nothing of substance, same class of drift as the task 0.1
entry above. This project's PostgREST layer reports a missing table before the
migration as a schema-cache miss instead:

```
{
  "code": "PGRST205",
  "details": null,
  "hint": null,
  "message": "Could not find the table 'public.match_teams' in the schema cache",
}
```

**What I did instead:** accepted it — same tables, same cause (no migration applied
yet), same red across all 7 assertions.

**Risk:** None.

---

## Task 0.8 — neither `supabase link` nor `supabase db push` asked for a database password

**Plan said:** nothing directly in the task itself, but `SETUP.md`'s dev-project
section states "`link` will ask for the dev database password. Take it from the
password manager," and `ENVIRONMENT.md` §5 lists the dev connection string as
unset until this task fills it in.

**What was wrong:** on Supabase CLI 2.117.0, neither
`supabase link --project-ref oqvoqddoizhhwvjwejtm` nor `supabase db push` prompted
for a password at any point, run non-interactively with `< /dev/null`. Both printed
`Initialising login role...` / `Connecting to remote database...` and completed
using the account-wide access token alone — the CLI now appears to provision a
scoped role through the Management API rather than requiring the project's static
database password for a project this account already owns. This matters beyond
convenience: Claude is never permitted to type, receive, or handle a database
password, so if this version *had* prompted, task 0.8 would have stopped here for
the password to be entered by hand in a real terminal, not by this run.

**What I did instead:** ran both commands unmodified. Verified the result rather
than assumed it, the same standard as the task 0.6/0.7 entries:
`packages/db/supabase/.temp/project-ref` (git-ignored, not read aloud) holds
`oqvoqddoizhhwvjwejtm`; `supabase db push --dry-run` before the real push reported
`"upToDate":true` against the then-empty schema; the real push then reported
`"migrations":["20260903090000_skeleton.sql"]` and
`"message":"Finished supabase db push."`; and the integration suite went from 7
failing to 7 passing immediately after. No password was seen, typed, or requested
at any point. Ticked the "Dev Supabase database connection string" row in
`ENVIRONMENT.md` §5, since linking is what that row was waiting on; left the
production row unticked — production is never linked from this run.

**Risk:** `SETUP.md`'s dev-project section still tells the next reader to expect a
password prompt that, on this CLI version, never appears. Worth a documentation
fix, but not one to make unilaterally mid-run, on the same reasoning as the task
0.7 `RUNBOOK.md` finding: flagged here rather than silently rewritten.

---

## Task 0.8 — `supabase init`'s generated `.temp/` fails `format:check`

**Plan said:** nothing about `.prettierignore`; `packages/db/supabase/config.toml`
is the only generated file the task names.

**What was wrong:** `supabase init` also writes `packages/db/supabase/.temp/`
(linked-project metadata, cached CLI/service versions), not itself named by the
plan and made of Prettier-checkable JSON. `pnpm format:check` flagged
`packages/db/supabase/.temp/linked-project.json`, even though
`packages/db/supabase/.gitignore` — also generated by `supabase init` — already
excludes the whole `.temp/` directory from git.

**What I did instead:** added `**/supabase/.temp/**` to the root `.prettierignore`,
next to the existing `**/dist/` and `**/.turbo/` generated-output entries. Same
class of fix: content this repository doesn't author and has no reason to format.

**Risk:** None.

---

## Task 0.9 — the same class of failing-first and print-width drift recurs

**Plan said:** Step 2 — Expected: `relation "public.users" does not exist`; and
`packages/db/test/forms.itest.ts` transcribed verbatim, including several lines
over 100 characters (e.g. the `dup`/`other`/`bad` form inserts and the two
`unit`/`phase`/`direction` assertions inside `constrains the semantic-metadata
vocabularies`).

**What was wrong:** both already-logged patterns repeated exactly. The failing-first
read was the same `PGRST205` schema-cache miss as task 0.8's entry, not `42P01`, on
all 10 assertions this time (`users`/`forms`/`form_versions`/`form_fields`/
`scoring_rules` all absent together). And several plan-quoted lines exceeded
`printWidth: 100`, so `pnpm format:check` failed on `forms.itest.ts` after the
migration was applied and the suite was already green.

**What I did instead:** accepted the failing-first read for the same reason as
task 0.8. Ran `pnpm format` for the width violations rather than hand-wrapping
every line up front; re-ran `pnpm --filter @frc/db test:integration` afterward —
17/17 green, unchanged assertions, only line breaks moved.

**Risk:** None.

---

## Task 0.10 — same failing-first and print-width drift, third occurrence

**Plan said:** Step 2 — Expected: `relation "public.scouting_entries" does not
exist`; `packages/db/test/entries.itest.ts` transcribed verbatim, including
several lines over 100 characters (the three vocabulary-restriction assertions in
particular).

**What was wrong:** identical to the task 0.8 and 0.9 entries — a `PGRST205`
schema-cache miss across all 10 assertions instead of `42P01` on the first run,
and `pnpm format:check` failing on `entries.itest.ts` after the migration landed
and the suite was green.

**What I did instead:** same handling as both prior tasks: accepted the
failing-first read, ran `pnpm format`, re-ran `pnpm --filter @frc/db
test:integration` — 27/27 green across all three integration files, unchanged
assertions. Not treating this as a new finding; recording it because the run
brief calls a trivial, repeated deviation worth logging every time rather than
once.

**Risk:** None.

---

## Task 0.11 — the failing-first error, fourth occurrence

**Plan said:** Step 2 — Expected: `relation "public.metrics" does not exist`.

**What was wrong:** same `PGRST205` schema-cache-miss pattern as tasks 0.8–0.10,
across all 6 assertions.

**What I did instead:** accepted it, same reasoning as before. This time the test
file was pre-wrapped to `printWidth: 100` before the first run, so `pnpm
format:check` passed on the first attempt with no follow-up `pnpm format` needed —
the only one of the four migration tasks so far where that was true.

**Risk:** None.

---

## Task 0.12 — the failing-first error, fifth occurrence, and one more print-width miss

**Plan said:** Step 2 — Expected: `relation "public.pick_lists" does not exist`.

**What was wrong:** the same `PGRST205` schema-cache-miss pattern as every
migration task so far, across all 9 assertions. One plan-quoted line (the
`alliance_slots` empty-slot object literal) also exceeded `printWidth: 100` after
being copied verbatim, despite the rest of the file having been pre-wrapped.

**What I did instead:** accepted the failing-first read; ran `pnpm format` for the
one remaining width violation and re-ran `pnpm --filter @frc/db test:integration`
— 42/42 green across all five migrations. This is the last schema migration
before the checkpoint: every table in SPEC-FINAL §3 now exists in the dev
project, migrations 0001–0005 applied in order, nothing hand-edited in the
Supabase dashboard.

**Risk:** None.

---

## Task 0.13 — `supabase gen types typescript` dropped the `--output` flag

**Plan said:** `packages/db/package.json`'s `db:types` script is
`supabase gen types typescript --linked --schema public --output src/database.types.ts`,
with an explicit callout: "`db:types` uses `--output`, not `>`. Shell redirection
writes UTF-16 on Windows, and the drift check in task 0.13 would then never
match."

**What was wrong:** on Supabase CLI 2.117.0, `gen types` no longer has a
file-writing `--output` flag at all. `--output`/`-o` is now a global flag meaning
"output format of status variables" (`env`/`pretty`/`json`/`toml`/`yaml`/`table`/
`csv`), and passing a file path to it fails outright:

```
{"_tag":"Error","error":{"code":"InvalidValue","message":"Invalid value for flag --output: \"src/database.types.ts\". Expected: \"env\" | \"pretty\" | \"json\" | \"toml\" | \"yaml\" | \"table\" | \"csv\""}}
```

Confirmed via `supabase gen types typescript --help`: the current flag set has no
file-output option, only `--local`/`--linked`/`--db-url`/`--project-id`/`--lang`/
`--schema`/`--swift-access-control`/`--postgrest-v9-compat`/`--query-timeout`.
Output only ever goes to stdout now.

**What I did instead:** changed the script to
`supabase gen types typescript --linked --schema public > src/database.types.ts`,
then verified the exact hazard the plan warned about does **not** apply here
before trusting it: dumped the redirected file's leading bytes with `od -An
-tx1`, and it starts `65 78 70 6f 72 74 20 74 79 70 65 20 4a 73 6f 6e` —
`export type Json` in plain ASCII/UTF-8, no BOM, no UTF-16 surrogate pairs. This
run's standing instruction is that every command runs in Git Bash, never
PowerShell or cmd.exe; the plan's UTF-16 warning is a `cmd.exe`/PowerShell
`Out-File` behavior (its default encoding is UTF-16LE with a BOM) and does not
apply to Git Bash's POSIX `>`, which writes bytes as given. task 0.13's own drift
test (`types-drift.itest.ts`) never used `--output` either — it always shelled
out to bare `supabase gen types typescript --linked --schema public` and compared
stdout — so the test file needed no change and passed unmodified.

**Risk:** if this repository is ever built or maintained from a literal
PowerShell/cmd session instead of Git Bash — against this run's own standing
instruction — regenerating types the same way could reintroduce a UTF-16 file
that silently fails the drift test. Worth a one-line callout in `SETUP.md` if a
maintainer ever asks "why does `pnpm --filter @frc/db db:types` fail on my
machine," but not changed here since `SETUP.md` already mandates Git Bash for
every command.

---

## Task 0.13 — `apps/server/src/db/client.ts` given the same `.js`-extension fix as the rest of the server

**Plan said:** `import type { ServerConfig } from '../config';` (no extension).

**What was wrong:** nothing new — this is the same ESM-under-Vercel hazard
already fixed across the rest of `apps/server` and logged at the provisioning
gate ("ESM resolution fails for every relative import on Vercel"). Writing this
file with the plan's literal extensionless import would have reintroduced the
exact `ERR_MODULE_NOT_FOUND` that fix eliminated.

**What I did instead:** wrote `'../config.js'`, consistent with every other
relative import in `apps/server`. The new `import type { Database } from
'@frc/db'` needed no extension and needs no bundler-inlining fix either, unlike
the `@frc/shared` case flagged at the gate: it is a type-only import
(`import type`), which `verbatimModuleSyntax` erases completely at compile time,
so no runtime `import` of `@frc/db` is ever emitted for Node to resolve.

**Risk:** None.

---

## Task 0.14 — the failing-first error text, same Vite-wording drift as task 0.1

**Plan said:** Step 2 — Expected: `Failed to resolve import "../src/seed/fixtures"`.

**What was wrong:** same class of drift already logged at task 0.1 — Vitest
2.1.9/Vite 5.4.21 word an unresolvable relative import as `Failed to load url
../src/seed/seed (resolved id: ../src/seed/seed) ... Does the file exist?`, and it
resolved `../src/seed/seed` (the second, later import in the test file) before
ever reaching `../src/seed/fixtures`, since Vite fails the whole module graph at
the first unresolvable specifier it hits while transforming, not necessarily in
source order.

**What I did instead:** accepted it — same missing files, same cause.

**Risk:** None.

---

## Task 0.14 — two real type errors in the plan's `seed.ts`, not cosmetic

**Plan said:**

```ts
for (const [versionIndex, [versionId, fields]] of [
  [SEED.formVersionOld, SEED_FIELDS],
  [SEED.formVersion, SEED_FIELDS],
  [SEED.superFormVersion, SEED_SUPER_FIELDS],
].entries()) {
```

and, in `fixtures.ts`, `config: Record<string, unknown>;` on `SeedField`.

**What was wrong:** both are genuine `tsc --noEmit` failures under this repo's
`strict: true` + `noUncheckedIndexedAccess`, not formatting noise:

1. The inline array literal `[[id, fields], [id, fields], [id, fields]]` infers as
   `(string | SeedField[])[][]`, not a tuple array — TypeScript does not infer
   tuple types for array literals without an explicit annotation or `as const`.
   Destructuring `[versionId, fields]` then types both `versionId` and `fields` as
   `string | SeedField[]`, and `fields.map(...)` fails:
   ```
   src/seed/seed.ts(138,7): error TS18048: 'fields' is possibly 'undefined'.
   src/seed/seed.ts(138,14): error TS2339: Property 'map' does not exist on type
     'string | SeedField[]'. Property 'map' does not exist on type 'string'.
   src/seed/seed.ts(138,19): error TS7006: Parameter 'f' implicitly has an 'any' type.
   src/seed/seed.ts(138,22): error TS7006: Parameter 'i' implicitly has an 'any' type.
   ```
2. `SeedField.config: Record<string, unknown>` is not assignable to the generated
   `form_fields.config` column type (`Json | undefined`), because `unknown` is not
   a member of the closed `Json` union and TypeScript will not structurally widen
   an index signature past it:
   ```
   src/seed/seed.ts(139,7): error TS2345: Argument of type '{ ...; config:
     Record<string, unknown>; ... }[]' is not assignable to parameter of type
     'RejectExcessProperties<{ ...; config?: Json | undefined; ...}>[]'.
     Types of property 'config' are incompatible.
       Type 'Record<string, unknown>' is not assignable to type 'Json | undefined'.
   ```
   This one only surfaces now, in task 0.14, because it is the first task where
   `SeedField.config` values actually flow into a `Database['public']['Tables'][...]
   ['Insert']`-typed call — the generated types this depends on did not exist
   before task 0.13.

**What I did instead:** two minimal, behavior-preserving fixes:

1. Hoisted the array literal into a locally declared, explicitly-typed
   `const versionFieldSets: [string, SeedField[]][] = [...]`, then iterate
   `versionFieldSets.entries()`. Same three pairs, same order, same runtime
   values — only the type annotation changed.
2. Imported `type { Json } from '../database.types'` in `fixtures.ts` and changed
   `SeedField.config` from `Record<string, unknown>` to `Record<string, Json>`.
   Every existing `config` literal in `SEED_FIELDS`/`SEED_SUPER_FIELDS` (numbers,
   booleans, nested string/object arrays) is already plain JSON, so no fixture
   value changed — only the type became precise enough to describe what was
   already there.

Verified rather than assumed: `pnpm typecheck` is clean across all five packages
after both fixes, `pnpm seed` still prints `dev database seeded`, and
`pnpm --filter @frc/db test:integration test/seed.itest.ts` is 10/10 green with
the same assertions as the plan's literal test file (which was not touched).

**Risk:** None — the seeded data is byte-identical to what the plan's version
would have produced if it had compiled. Worth noting for phase 1: any future
fixture object typed as `Record<string, unknown>` and passed into a `jsonb`
column will hit the same `Json` mismatch; `Record<string, Json>` (or a cast at
the call site) is the pattern to reach for.

---

## Task 0.15 — no `feat/ci` branch, no pull request; committed straight to `feat/phase-0`

**Plan said:** Step 3 — `git checkout develop && git pull && git checkout -b
feat/ci`, commit there, push it; Step 5 — `gh pr create --base develop ... && gh
pr merge --squash && gh run watch`.

**What was wrong:** nothing about the plan; this is the same standing departure
already logged at task 0.1 — the run executes a back-to-back sequence of tasks on
a single branch, one commit per task, no per-task branches and no pull requests,
per this run's explicit instructions. Opening a real PR into `develop` here would
also be the first PR this run has created, and the run brief only pre-authorizes
that for the deployment tasks, not silently for CI.

**What I did instead:** wrote `.github/workflows/ci.yml`, `scripts/smoke.mjs` and
`.github/workflows/README.md` and committed them to `feat/phase-0`, same as every
task before this one. To actually produce "the first CI run with real secrets" —
which the run brief asks to be reported at this checkpoint — the workflow file
has to exist on a ref GitHub will build from. Since no PR is being opened, that
means fast-forwarding `develop` to `feat/phase-0` and pushing it, which fires the
`push: branches: [develop]` trigger directly with no PR involved. `main` was left
untouched.

Checked first, not assumed: the plan's own Step 4 says CI cannot go green until
something is deployed, because the smoke step calls a live `/health`. That
reasoning predates this run's actual state — tasks 0.8–0.12 already pushed every
migration to the dev project directly, and the Preview server has been live and
pointed at dev since the provisioning gate. A direct check before touching
anything: `GET https://frc-scouting-server-git-develop-roboactive.vercel.app/health`
already returns `200 {"status":"ok","database":"ok",...}`, with no redeploy of
any kind. So this run's version of task 0.15 does not need to wait for task
0.17 the way the plan assumes — confirmed by running the smoke script itself
locally against that URL before pushing anything (`smoke ok: GET .../health ->
200 ...`), and by running `pnpm build` locally with CI's exact env vars
(`VITE_API_BASE_URL` = the preview server URL, `VITE_DEVICE_WIPE_CODE =
ci-build-placeholder`) — both apps built clean.

**Risk:** pushing to `develop` triggers real Vercel Preview builds on both
projects (2 deployments), a cost this run has otherwise avoided by staying on
`feat/phase-0`. Accepted here because it is the only way to produce a real CI run
to report at the checkpoint, and because task 0.17 will need the same push
regardless.

---

## Task 0.15 — the `no output files found` Turbo warning now also fires for `@frc/db` and `@frc/server`

**Plan said:** nothing new; this is the same cosmetic warning already logged at
task 0.3 for `@frc/shared#build`.

**What was wrong:** nothing. `pnpm build` (run locally with CI's env vars, to
prove the "Build both apps" CI step before pushing) printed the identical
`no output files found for task ...#build` warning for `@frc/db` and
`@frc/server` too — both packages' `build` script is `tsc --noEmit`, same as
`@frc/shared`, so the same `turbo.json` `outputs: ["dist/**", ...]` declaration
can never be satisfied for any of them.

**What I did instead:** left it exactly as the task 0.3 entry did — cosmetic,
no functional effect, not a fix this task has a mandate to make.

**Risk:** unchanged from the task 0.3 entry: recurring log noise, revisit only if
a package genuinely needs `outputs` to be accurate.

---

## Task 0.15 — the first real CI run failed at "Apply migrations to the dev project": `SUPABASE_ACCESS_TOKEN` rejected by the Supabase CLI

**Plan said:** Step 5 — Expected: every step green, `Apply migrations to the dev
project` prints `Remote database is up to date.`

**What was wrong:** on GitHub Actions run `35493674874` (push to `develop`,
commit `59e157a`), every step up to and including `Typecheck` passed —
checkout, pnpm setup, Node setup, `pnpm install --frozen-lockfile`,
`pnpm env:example:check`, `pnpm docs:check`, `pnpm lint`, `pnpm typecheck`. The
next step, `Apply migrations to the dev project`, failed immediately:

```
Invalid access token format. Must be like `sbp_0102...1920`.
Try rerunning the command with --debug to troubleshoot the error.
undefined
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: supabase link --project-ref *** --password ***
##[error]Process completed with exit code 1.
```

This is the Supabase CLI's own format check on `SUPABASE_ACCESS_TOKEN`, run
before any network call — it never reached the dev project at all. `Unit tests`,
`Smoke suite` and `Build both apps` were then skipped as a consequence, not
because anything in this run's own code is wrong: every one of those was already
verified locally in this task, against the same real deployment, before pushing
— `pnpm test` (53/53), the smoke script by hand against
`https://frc-scouting-server-git-develop-roboactive.vercel.app/health` (`smoke
ok: ... -> 200 {"status":"ok","database":"ok",...}`), and `pnpm build` with CI's
exact env vars, all green.

**What I did instead:** nothing to the secret, and nothing to the workflow file.
The standing rule this run operates under is absolute: never see, request, or
guess at a secret value. The GitHub secret named `SUPABASE_ACCESS_TOKEN` exists
(§3 already has it ticked from a prior session), but whatever value is currently
stored there does not parse as a Supabase personal access token
(`sbp_`-prefixed). That could be a stale, truncated, or mistyped value, or a
token that was later revoked and re-issued without updating the secret — none of
which is distinguishable from outside, and none of which this run is positioned
to fix. `ci.yml` reads it by name exactly as the plan specifies
(`${{ secrets.SUPABASE_ACCESS_TOKEN }}`), matching every other secret reference
in the file.

**Risk:** CI cannot apply migrations to dev, or reach the "Unit tests" step
onward, until `SUPABASE_ACCESS_TOKEN` is corrected in **Settings → Secrets and
variables → Actions** with a valid token from **Supabase → Account → Access
Tokens** (the same source `SETUP.md`'s GitHub Actions secrets section already
names). This is the checkpoint failure to report and hand back, per the run
brief.

**Resolved** the same day. The user generated a new **project-scoped** Supabase
access token (Resource access: Project → `frc-scouting-dev` only, not the
organization and not `frc-scouting-prod`; Database: full access; Project: read),
in the `sbp_...` format the CLI's own error message names, and updated the
GitHub secret. Re-running the same job (`gh run rerun 35493674874 --failed`,
job id `106035166137`) went fully green: `Apply migrations to the dev
project` → `Finished supabase link.` / `Remote database is up to date.`;
`Unit tests` → 53/53; `Smoke suite` → `smoke ok: GET ***/health -> 200
{"status":"ok","database":"ok","time":"2026-09-20T06:34:50.779Z"}`; `Build both
apps` → green. Nothing in `ci.yml` or `scripts/smoke.mjs` was changed to reach
this — the fix was entirely the secret's value, as diagnosed. Worth noting for
whoever reads this later: the new project-scoped token type worked fine with
CLI 2.117.0, so the "legacy token" fallback mentioned when this was first raised
was never needed.

---

## Task 0.16 — `workflow_dispatch` cannot be tested yet; the workflow isn't on the default branch

**Plan said:** Step 2 — `gh workflow run keepalive.yml && sleep 20 && gh run list
--workflow=keepalive.yml --limit 1`. Expected: both matrix jobs succeed; each log
line shows `{"status":"ok","database":"ok","time":"..."}`.

**What was wrong:** GitHub's API refuses to dispatch a `workflow_dispatch`
workflow unless that workflow file exists on the repository's **default
branch**, regardless of which `--ref` you ask it to run against. This
repository's default branch is `main`, which does not have `keepalive.yml` yet
— it only exists on `feat/phase-0` at this point, matching this run's
established branching approach (see the task 0.1 and 0.15 entries). Pushing
`feat/phase-0` to origin and dispatching against it failed immediately:

```
HTTP 404: workflow keepalive.yml not found on the default branch
(https://api.github.com/repos/roboactive-scouting/super-scouting/actions/workflows/keepalive.yml)
```

Pushing to `main` now, purely to unlock dispatch, was rejected as a way to
verify this task: `main` is Production, task 0.17 is what's supposed to move it
forward, and doing that early — before the esbuild-bundling task this run has
already been told to add — would deploy production ahead of that fix existing.

**What I did instead:** verified the workflow's actual logic directly instead of
through the GitHub Actions dispatch machinery, using `/c/Windows/System32/curl.exe`
(Git Bash's own `curl` has no CA bundle on this machine — see the Avast note)
with the exact same flags the workflow uses:

```
$ curl.exe --fail --silent --show-error --max-time 30 https://frc-scouting-server-git-develop-roboactive.vercel.app/health
{"status":"ok","database":"ok","time":"2026-09-20T06:38:22.734Z"}   → exit 0

$ curl.exe --fail --silent --show-error --max-time 30 https://frc-scouting-server.vercel.app/health
curl: (22) The requested URL returned error: 503   → exit 22
```

The dev leg behaves exactly as the workflow assumes: `--fail` exits 0, the body
contains `"database":"ok"`, the `grep -q` would pass. The production leg
correctly fails `--fail` with exit 22, because the production Supabase project
has never been migrated in this run — deliberately: production migrations are a
manual, by-hand command outside CI's reach (§19.4), and this run has no mandate
to run one. So the plan's "both matrix jobs succeed" expectation does not hold
**yet**, for a reason that has nothing to do with this workflow being wrong.

**Risk:** real `workflow_dispatch` verification of `keepalive.yml` (and its
availability for the twice-weekly schedule) is deferred until this branch
reaches `main` — which task 0.17 does regardless. The production leg will keep
failing on every real run (scheduled or dispatched) until someone runs the
by-hand production migration; that failure is correct and expected, not a bug
to chase, and `fail-fast: false` on the matrix means the dev leg's success is
never masked by it.

**Resolved.** `main` was fast-forwarded to this branch at the user's explicit
instruction ("push to production") after the user ran the by-hand production
migration themselves. With `keepalive.yml` now on the default branch,
`gh workflow run keepalive.yml` dispatched for real
(run `35502860795`) — **both matrix legs passed**: `ping (dev,
HEALTHCHECK_DEV_URL)` and `ping (production, HEALTHCHECK_PROD_URL)`, each in
3s. The plan's original "both matrix jobs succeed" expectation from task 0.16
Step 2 now holds exactly as written; nothing about the workflow needed to
change.

---

## Post-checkpoint — production migrated by hand, then `main` fast-forwarded, both by explicit instruction

**Plan said:** task 0.17 step 3's parenthetical — "or push to `main` through a
reviewed PR once CI is green" — and the standing instruction for this run said
not to open a PR or touch `main` without being told.

**What happened:** after the 0.8–0.17 report, the user ran the production
migration themselves, by hand, in their own Git Bash session — not through this
agent, consistent with the standing rule that Claude never touches production.
`pnpm --filter @frc/db exec supabase link --project-ref ezrgtroyofuxkkktnino`,
then `db push` (confirmed the exact 5-migration list before applying), then
re-linked back to `oqvoqddoizhhwvjwejtm`. Verified after the fact with a
read-only `GET /health`: `https://frc-scouting-server.vercel.app/health` →
`200 {"status":"ok","database":"ok",...}`.

The user then said "push to production" explicitly. `git push origin
feat/phase-0:main` (fast-forward, verified an ancestor relationship first, same
pattern already used twice for `develop`) — no PR, since none was asked for.
Both Vercel Production deployments redeployed automatically; confirmed via the
`/sw.js` `Cache-Control` header (only present since this session's
`apps/client/vercel.json`) appearing on `https://frc-scouting-client.vercel.app`,
and `/health` on the production server unchanged and still `200`.

**Risk:** none identified. `main`, `develop`, and `feat/phase-0` are now all at
the same commit (`473b5c5`). The phase 0 gate's remaining open items are the
ones only the user can close: the phone/airplane-mode install test, and a
fresh, independent read-through of `SETUP.md`.

---

## Post-checkpoint — the service worker was built and deployed but never actually registered; the phone test surfaced it

**Plan said:** nothing in tasks 0.8–0.17; this is a latent gap in task 0.5's
deliverable from an earlier session, outside this run's assigned range, found
only because the user attempted the real phone/airplane-mode test task 0.17
step 5 asks for.

**What was wrong:** the user installed the production client to an iPhone home
screen, went into airplane mode, and Safari refused to open it at all
("Safari cannot open the app because the iPhone is not connected to the
Internet") — not a degraded shell, no shell at all. Reading `apps/client/src/
main.tsx` found the cause: `apps/client/src/pwa.ts` fully implements and unit
tests `registerServiceWorker()` / `browserAdapter()` (three passing tests in
`pwa.test.ts`, all exercising the "never auto-reload" contract), but **nothing
in the real application ever called either function.** `main.tsx` rendered
`<App />` and stopped. `vite.config.ts` sets `injectRegister: null`
deliberately, so `vite-plugin-pwa` was never going to inject its own
registration script either — the app was always meant to call it manually, and
that call was simply missing. Net effect: `dist/sw.js` built and deployed
correctly (confirmed by the task-0.5 deviation entry's own build-output check),
but no browser ever told itself to install it, so there was no offline cache at
all, on any deployment, since task 0.5 landed. `grep -rn
"registerServiceWorker\|browserAdapter" apps/client/src` before the fix matched
only the two definitions in `pwa.ts` — zero call sites.

**What I did instead:** added the missing call to `apps/client/src/main.tsx`,
right after the initial render:
```tsx
void registerServiceWorker(() => {
  console.warn('an update is ready — it will apply on the next cold start');
}, browserAdapter());
```
Deliberately minimal: SPEC-FINAL 9.1's real "discreet hint" UI belongs to a
future task once the app shell exists to host it — phase 0's shell is a
placeholder heading and a version string, and inventing a toast/banner
component now would be scope creep this fix doesn't need. `console.warn` is
allowed by the existing `no-console` rule and is enough to prove the callback
fires; a later phase 1/2 task should replace it with real UI without touching
the registration call itself.

**A second, previously-invisible bug surfaced immediately from actually
building this path for real:** `pnpm --filter @frc/client build` failed —
`[vite-plugin-pwa:build] Rollup failed to resolve import "workbox-window" from
"/@vite-plugin-pwa/virtual:pwa-register"`. `workbox-window` was never wired
into any real production bundle before, because nothing reachable from the
real entry point (`main.tsx`) ever imported `pwa.ts` — Rollup had no reason to
resolve `virtual:pwa-register`'s own dependency graph, so a missing dependency
was invisible until this exact fix made the import path live. Confirmed the
cause before fixing it: `vite-plugin-pwa`'s own `package.json` lists
`workbox-window: ^7.3.0` as a **peer** dependency, which pnpm's strict linking
does not hoist into a consumer automatically — it was present in the pnpm
store (pulled in transitively) but not resolvable from `apps/client`'s own
`node_modules` view. Added `"workbox-window": "^7.3.0"` to
`apps/client/package.json`'s real `dependencies` (it ships in the production
bundle, so it belongs there, not in `devDependencies`).

**Verified, not assumed:** `pnpm --filter @frc/client build` now succeeds and
emits two new chunks that did not exist before —
`dist/assets/virtual_pwa-register-*.js` and
`dist/assets/workbox-window.prod.es5-*.js` — and `grep -l "an update is ready"
apps/client/dist/assets/*.js` matches the main bundle, confirming the
registration call is genuinely shipped, not merely present in source. Full
workspace suite re-run clean afterward: 54/54 tests, typecheck, lint,
`format:check` all green.

**Risk:** this fix has **not yet been proven against a real device** — that
verification is the user's next step, re-attempting the same install/airplane-
mode test now that the underlying bug is fixed, and it needs a fresh
deployment (this fix was committed but not yet pushed to `develop`/`main` as
of this entry). Also worth flagging forward: this bug existed, undetected, in
every deployment since task 0.5 — including the one already-passed automated
verification of that task — because nothing in the test suite exercises
`main.tsx` itself calling the registration function; `pwa.test.ts` only proves
`registerServiceWorker` behaves correctly *if* called. A future task should
consider a lightweight assertion (even just a grep-based check, or an
integration test against the built `dist/` output) that the entry point
actually wires up service worker registration, so this class of "unit-tested
but never invoked" gap can't recur silently.

---

## New task, added at the run's own direction — bundle `apps/server`'s function with esbuild before phase 1 needs `@frc/shared`

**Plan said:** nothing — this task does not exist in `IMPLEMENTATION-PLAN.md`.
It was added because the run's own briefing required it: the provisioning-gate
deviation "ESM resolution fails for every relative import on Vercel" fixed every
*relative* import in `apps/server` with an explicit `.js` extension, but flagged
that the fix does not generalise — `@frc/shared` resolves to TypeScript source
(`main: ./src/index.ts`), Node cannot import `.ts` from `node_modules`, and no
extension fixes that. Nothing imports `@frc/shared` yet, so it was latent, not
broken; SPEC-FINAL §16.1 requires phase 1 to import it as the single validation
source for both sides, which would reproduce the failure the moment it does.

**What I did:** moved the Vercel function's actual code out of
`apps/server/api/index.ts` into `apps/server/src/handler.ts` (identical content,
now a normal `src` file), and added `apps/server/scripts/build-function.mjs`,
which runs esbuild against it:

```js
await build({
  entryPoints: [`${root}/src/handler.ts`],
  outfile: `${root}/api/index.js`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: ['hono', '@supabase/supabase-js', 'zod'],
});
```

`external` names only the real npm dependencies — the ones Vercel's own file
tracing already includes from `node_modules` for the currently-deployed
function. Everything else (every file under `apps/server/src`, and `@frc/shared`
the moment phase 1 imports it) gets inlined into one self-contained
`apps/server/api/index.js`. `apps/server/api/index.ts` is deleted from the
repository; `apps/server/api/` now holds only this generated file, which is
git-ignored (`apps/server/api/*.js`, `apps/server/api/*.js.map`) the same way
`dist/` is — Vercel regenerates it on every build via `apps/server/package.json`
`"build": "tsc --noEmit && node scripts/build-function.mjs"`, wired into
`apps/server/vercel.json`'s new `buildCommand` (`pnpm turbo run build
--filter=@frc/server`, matching the pattern `apps/client/vercel.json` already
used). `apps/server/tsconfig.json`'s `include` dropped `"api"` — there is no
more hand-authored TypeScript there — and its `lint` script dropped the now
non-existent `api` argument, matching `packages/db`'s
`--no-error-on-unmatched-pattern` precedent. `turbo.json`'s `build` task
`outputs` gained `api/*.js` and `api/*.js.map`, which also incidentally makes
the "no output files found" Turbo warning (logged at tasks 0.3 and 0.15) stop
firing for `@frc/server` specifically, since it now has a real build artifact.

**Verified, not assumed, in three steps:**

1. **The bundle itself.** `pnpm --filter @frc/server build` produced
   `api/index.js` (3.2kb) and `api/index.js.map` (7.4kb).
   `grep -nE "from ['\"]\.\.?/|require\(['\"]\.\."` over the output matched
   nothing — no relative or workspace specifier survived; only `hono`,
   `hono/vercel`, `hono/cors`, `zod` and `@supabase/supabase-js` remain as
   `import` statements, and the file ends with `export { GET, OPTIONS, POST,
   config };`, exactly the four names Vercel's Node function runtime needs.
2. **The bundle actually runs.** Imported it directly in Node with fake
   (non-secret, obviously-fake) env vars and called the exported `GET` against a
   real `Request`:
   ```
   exports: [ 'GET', 'OPTIONS', 'POST', 'config' ]
   status: 503
   body: {"status":"error","database":"error","message":"TypeError: fetch failed"}
   ```
   The 503 is correct and expected — `https://example.supabase.co` isn't a real
   host — and it is the right kind of failure: a network error from inside the
   real routing/handler/CORS/config chain, not `ERR_MODULE_NOT_FOUND`, which is
   the failure this task exists to prevent.
3. **A real deployment**, against the actual dev-linked Preview server —
   recorded in the task 0.17 entry below, since that is where the push happens.

**Alternatives rejected:** letting Vercel's own zero-config Node builder keep
transpiling `api/*.ts` file-by-file (today's behaviour) was rejected because
it is exactly the mechanism that cannot resolve `@frc/shared`'s TS entry point,
no matter how its imports are spelled. Using Vercel's Build Output API v3
directly (hand-writing `.vercel/output/functions/api/index.func/`) was
considered and rejected as more machinery than this problem needs — esbuild
bundling to a plain `api/*.js` file works with Vercel's existing zero-config
detection unmodified, because a `.js` file needs no further transpilation, only
the same node_modules tracing already proven to work today.

**Risk:** the `external` list in `build-function.mjs` has to be kept in sync
with `apps/server/package.json`'s real npm dependencies by hand — if a future
task adds a new npm dependency to `apps/server` and forgets to add it to
`external`, esbuild will silently inline it instead (larger bundle, not a
correctness bug, but worth knowing). Conversely, forgetting to add a *new
workspace package* to `apps/server`'s dependencies would fail loudly at
bundle time (esbuild can't resolve it), which is the safer failure direction.

---

## Same task — first deployment attempt 404'd: Vercel compiles committed `api/` source directly, never a build script's output

**Plan said:** nothing that anticipates this; this is a consequence of solving
the task above the way the user directed ("bundle at build time"), discovered
only by deploying it for real, which the instruction also required.

**What was wrong:** the first version of this fix generated `apps/server/api/
index.js` as a **build-time side effect** — via `apps/server/package.json`'s
`build` script, invoked through a custom `buildCommand` added to
`apps/server/vercel.json` (`cd ../.. && pnpm turbo run build
--filter=@frc/server`) — and git-ignored the generated file, the same pattern
already used for `dist/`. Pushed to `develop` to test for real. Both Vercel
deployments reported **success** (confirmed via `gh api
.../commits/<sha>/status`), but the live URL 404'd:
```
$ curl --fail --silent --show-error https://frc-scouting-server-git-develop-roboactive.vercel.app/health
HTTP/1.1 404 Not Found
X-Vercel-Error: NOT_FOUND
```
Reasoning it through against the provisioning-gate's own earlier finding makes
the cause clear in hindsight: that finding's exact symptom — Vercel's runtime
throwing on an unresolved relative import inside `api/index.ts` — is only
possible if Vercel is compiling that **checked-into-git** file itself, using its
own internal builder, completely independent of whatever `apps/server`'s own
`package.json` `build` script does. A custom Build Command in the "Other" preset
governs static output (`outputDirectory`) only; Vercel's zero-config Node
function builder discovers and compiles `api/*.ts`/`api/*.js` from the
repository as committed, before or regardless of that command. Since
`apps/server/api/index.ts` had been deleted and nothing replaced it in git —
only a git-ignored file that existed solely inside Vercel's own build
container after the Build Command ran — Vercel's function builder found zero
functions to deploy for that path.

**What I did instead:** stopped generating the bundle as a git-ignored build
artifact and started **committing** it instead, exactly like this repository
already does for `packages/db/src/database.types.ts`: generated by a script,
committed, and drift-checked rather than trusted to always be fresh.
- Reverted the `apps/server/vercel.json` `buildCommand`/`installCommand`
  addition entirely — back to just the rewrite, matching `SETUP.md`'s explicit
  "leave the build command alone" for this project. It was a plausible
  contributing guess before the real cause was confirmed, and turned out to be
  unnecessary once the actual problem was understood; no reason to keep
  unexplained config once its justification is gone.
- Un-ignored `apps/server/api/*.js`/`*.js.map`, and excluded them from Prettier
  the same way `database.types.ts` is (`.prettierignore`).
- Made the bundle's own output byte-for-byte deterministic regardless of
  invocation directory: added `absWorkingDir` to the esbuild call in
  `build-function.mjs`, because esbuild embeds source-relative comments
  (`// src/handler.ts` vs `// apps/server/src/handler.ts`) that otherwise differ
  depending on whether the script is invoked from `apps/server` or the repo
  root. Verified by running it both ways and diffing — identical only after
  this fix.
- Added `apps/server/src/bundle-drift.test.ts`, the same drift-check pattern as
  `packages/db/test/types-drift.itest.ts`: regenerates the bundle and asserts
  it equals the committed copy, byte for byte. This is what stands in for CI
  actually rebuilding and redeploying: if `src/handler.ts` (or anything it
  imports) changes and someone forgets to regenerate + commit the bundle, the
  unit-test suite fails on every branch, not just at deploy time.

**Verified against a real deployment, the second time.** Pushed the committed
bundle to `develop`; both Vercel deployments succeeded, and this time:
```
$ curl -s https://frc-scouting-server-git-develop-roboactive.vercel.app/health
{"status":"ok","database":"ok","time":"2026-09-20T06:59:21.433Z"}
```
The preview client (`https://frc-scouting-client-git-develop-roboactive.vercel.app`)
still answers `200` too — untouched by any of this, confirmed rather than assumed.

**Risk:** the committed bundle is now a second copy of logic that also exists as
readable TypeScript in `apps/server/src/`. The drift test is the only thing
keeping them honest; if that test is ever skipped or its `expect` weakened, the
deployed function can silently diverge from the reviewed source. This is the
same tradeoff `database.types.ts` already accepted in this repository, applied
to a second file for the same reason.

---

## Same task — CI's smoke suite raced the Vercel deployment it depends on and lost, twice

**Plan said:** nothing about ordering; `ci.yml`'s `Smoke suite` step
unconditionally calls `pnpm smoke` against `SMOKE_API_BASE_URL` right after the
migrations/unit-tests steps, on every push to `develop`.

**What was wrong:** GitHub Actions and Vercel are two independent systems that
both react to the same `git push` with no ordering guarantee between them. CI's
steps up to and including `Smoke suite` finish in well under a minute; the
Vercel deployment for the *same commit* — client and server, both projects —
took several minutes. On the two pushes in this task that changed
server-deployable code (the esbuild bundling change, then its fix), CI's smoke
step ran and failed against a not-yet-live deployment before Vercel had
finished:
```
smoke failed: GET ***/health -> 404 {"error":{"code":"404","message":"The page could not be found"}}
```
confirmed as a pure timing race and not a real regression by checking
`gh api .../commits/<sha>/status`: Vercel reported the deployment `success`
about three minutes *after* CI's smoke step had already run and failed. On the
task 0.15 push, by contrast, nothing server-deployable had changed, so CI's
smoke check happened to hit the already-stable prior deployment and passed —
the race was there from the start, just not visible until a push actually
changed what gets deployed.

**What I did instead:** re-ran the same failed CI job after confirming the
deployment was live (`gh run rerun <id> --failed`) — same commit, same code,
now green, which is itself the proof this was timing and not a defect. Did not
add a wait-for-deployment step or a smoke retry loop to `ci.yml`: that is a
real gap in the plan's CI design, but changing the pipeline's behavior beyond
what a task specifies is a bigger call than this run has a mandate to make
unilaterally, and phase 0's remaining tasks do not depend on it.

**Risk:** every future push to `develop` that changes `apps/client` or
`apps/server` source risks the same false-red smoke failure, purely from
CI outrunning Vercel. Worth a real fix before this stops being tolerable —
either a step that polls the deployment URL until it changes /
returns 200 before running `pnpm smoke`, or triggering CI from a Vercel
deployment webhook instead of `push`. Flagging it here rather than fixing it
is itself the deviation.

---

## New task, added ahead of task 1.1 at the run's own direction — poll the deployment healthy before the smoke suite runs

**Plan said:** nothing — `IMPLEMENTATION-PLAN.md` does not have a task for
this. It exists because the phase-0 "CI's smoke suite raced the Vercel
deployment it depends on and lost, twice" entry above flagged the gap and
explicitly deferred the fix, and this run's brief requires it closed before
task 1.1, because task 1.9 (later in this same phase) is itself a smoke test
that would inherit the same false-negative risk.

**What was wrong:** `.github/workflows/ci.yml`'s `Smoke suite` step called
`pnpm smoke` unconditionally right after the migrations/unit-tests steps, with
no wait for the matching Vercel deployment (client + server, both projects)
to actually finish. CI's own steps finish in well under a minute; the
deployment can take several minutes. This produced two real false-failures in
phase 0, both already logged and both resolved only by manually re-running the
CI job after confirming the deployment was live.

**What I did instead:** added `scripts/wait-for-deploy.mjs`, which polls
`GET {SMOKE_API_BASE_URL}/health` every 10 seconds for up to 8 minutes and
succeeds as soon as it sees `200` with `status: 'ok'` and `database: 'ok'`;
exits 1 with the last response seen if the deadline passes. Wired it in as a
new `Wait for deployment to be live` step in `ci.yml`, positioned immediately
before `Smoke suite`, reading the same `SMOKE_API_BASE_URL` secret and with no
`if:` gate — matching `Smoke suite`, which also runs unconditionally. Added a
`wait:deploy` script to the root `package.json` alongside the existing `smoke`
script. Verified locally (not against any real Supabase/Vercel project): with
`SMOKE_API_BASE_URL` unset, it fails immediately with the same message
`scripts/smoke.mjs` already uses; pointed at an unreachable host with a
shortened timeout override, it retries with a progress line each attempt and
then exits 1 with a clear timeout diagnostic, no hang and no unhandled
exception. `pnpm test` (54/54), `pnpm typecheck`, `pnpm lint` and
`pnpm format:check` all green afterward.

**Risk:** this proves the endpoint is *live and healthy*, not that it is
serving *this exact* commit — Vercel's `/health` response carries no commit
SHA, so a still-warm previous deployment could in principle let this step
pass before the new one is actually live, on a rolling update. That is a
known, accepted limitation rather than something this task attempts to solve;
it directly fixes the specific failure mode already observed (a deployment
that hadn't started yet at all, answering 404), which is the case that has
actually happened twice. The 8-minute budget is a first estimate, not
measured against real deploy timings post-merge — worth revisiting if it
proves too tight or unnecessarily long once this has run for real on
`develop`.

---

## Task 1.2 — `buildEntryDataSchema` is named in the plan's Interfaces line but never implemented anywhere in the task's own text

**Plan said:** the task's "Interfaces → Produces" line lists `buildEntryDataSchema(fields)` — described as "the runtime-generated validator of SPEC-FINAL §16.4" — as a produced export, alongside `validateEntryData`.

**What was wrong:** nothing else in the task mentions it. Step 1's failing test never imports or calls a `buildEntryDataSchema`, and Step 3's implementation code defines and exports only `validateEntryData` (plus `isDeadRobot`, `ValidationIssue`, `ValidationResult`, and the supporting types in `types.ts`). There is no code anywhere in the task for a function by that name to be transcribed from.

**What I did instead:** implemented exactly what Step 1's tests exercise and Step 3's code shows — `validateEntryData` and its supporting types — and did not invent a `buildEntryDataSchema` function to satisfy the Interfaces line. Adding unrequested code on the strength of one summary line, with no test and no implementation to match it against, would be exactly the kind of invented scope this run's standing rules warn against.

**Risk:** if a later task's plan text (task 1.24, which "widens the same union and the same function" per task 1.2's own scope note) assumes `buildEntryDataSchema` already exists as a named export from `@frc/shared`, that reference will fail to compile. Worth checking task 1.24's own text for this name before it starts; right now `packages/shared` has no such symbol, only `validateEntryData`.

---

## Task 1.3 — `packages/shared/src/index.ts`'s export line for `entryShape.ts` was not given literally

**Plan said:** the Files list names `packages/shared/src/index.ts` as modified by this task, and `syncPush.ts`'s own import list needs `validateEntryShape` from `@frc/shared`, but no code block shows the actual export line to add.

**What was wrong:** nothing — an omission, not a contradiction.

**What I did instead:** added `export * from './forms/entryShape';`, placed alphabetically between `./format` and `./forms/types`, matching the file's existing style.

**Risk:** None.

---

## Task 1.3 — `entryShape.test.ts` was specified in prose, not code

**Plan said:** "`packages/shared/src/forms/entryShape.test.ts` covers each branch: a complete match entry passes; each of the three missing match columns fails with its own message; a clean super entry passes; each of the four columns a super entry must not carry fails; `broke_down` without seconds fails; seconds without `broke_down` fails; and `no_show` with null seconds passes" — prose only, no literal test code given, unlike every other test file in tasks 1.1–1.3.

**What was wrong:** nothing to fix; the task just requires writing a test file from a description rather than transcribing one.

**What I did instead:** wrote 12 `it(...)` cases against that description, in this codebase's existing Vitest house style (`describe`/`it`, `expect(...).toBe(...)`, no snapshots — following `packages/shared/src/forms/validate.test.ts`'s precedent). One case needed a judgment call: a super entry with `breakdown_seconds` set but `robot_status` still `null` legitimately trips **two** `validateEntryShape` rules at once (`'a super entry has no breakdown time'` and `'breakdown time is recorded only when the robot broke down'`), so that test asserts both messages are present, not exactly one.

**Risk:** None — this reflects `validateEntryShape`'s actual (and correct) behavior; a future reader of the test file has the reasoning documented here rather than needing to re-derive it.

---

## Task 1.3 — `repos/store.ts`'s `supabaseStore` and `test/fake-context.ts`'s fake `store` need an explicit `as Store` cast the plan's code doesn't show

**Plan said:** both files return an object literal (a handful of real methods plus `...stubsFor([...])`) typed as `: Store` (for `supabaseStore`) or assigned via `Object.assign(fake, { now, store: {...} })` (for the fake), with no type assertion anywhere.

**What was wrong:** neither compiles as literally written. `stubsFor(names: string[])` returns `Record<string, () => Promise<never>>`, which only contributes a string index signature to the spread object literal's *inferred* type — TypeScript does not see that the spread's 59 runtime entries satisfy `Store`'s 59 named members, and reports the object literal as missing all of them. Separately, in the fake, `Object.assign`'s generic inference does not flow `FakeContext`'s `store: Store` field back in as a contextual type for a nested object literal, so every method inside the inline `store: {...}` had implicit-`any` parameters (`TS7006`).

**What I did instead:** in `repos/store.ts`, added `} as Store;` to the returned object literal. In `fake-context.ts`, pulled the `store` object out into its own `const store = {...} as Store` built before the `Object.assign` call, then passed `store` into `Object.assign(fake, { now: () => fake.nowValue, store })`. Verified the narrower cast (`as Store`, not `as unknown as Store`) is sufficient in both places — TypeScript's "comparable" check for a type assertion accepts it once every declared member's arity and shape actually line up.

**Risk:** None functionally — both are compile-time-only fixes; the runtime shape (explicit methods + `stubsFor` spread) is exactly as the plan specifies.

---

## Task 1.3 — `fake-context.ts`'s `getFormFields()` needed a declared parameter to keep the `as Store` cast valid

**Plan said:** `async getFormFields() { return SKELETON_FIELDS; }` — zero parameters, ignoring the argument entirely since the skeleton fixture always returns the same fields.

**What was wrong:** `Store.getFormFields` is declared `getFormFields(formVersionId: string): Promise<FormFieldDefinition[]>`. A zero-arg function is normally an acceptable subtype for plain assignment, but it was enough by itself — verified in isolation with a minimal repro — to flip TypeScript's "sufficient overlap" heuristic for the `as Store` cast to false across the *entire* 65-method object literal, even though every other method (stubbed or real) matched fine.

**What I did instead:** gave it a parameter it still ignores: `async getFormFields(_formVersionId) { return SKELETON_FIELDS; }`, matching the underscore-prefix convention this codebase already uses for intentionally-unused parameters.

**Risk:** None — behavior is identical; the fixture still always returns `SKELETON_FIELDS` regardless of which form version is asked for, exactly as the plan intended for the walking skeleton.

---

## Task 1.3 — `repos/store.ts`'s `putRow` needs a cast at the Supabase call site, the same `Record<string, unknown>`-vs-generated-type gap as task 0.14

**Plan said:** `await db.from(TABLE[entity]).upsert({ ...row, id });` with `row: Record<string, unknown>`, no cast.

**What was wrong:** does not compile. Each table in `TABLE` has its own generated Supabase insert type (`RejectExcessProperties<...>`), and a generic `Record<string, unknown>` cannot satisfy that union structurally — the same class of gap already documented in this file for task 0.14's seed script (`Record<string, unknown>` flowing into a place expecting the generated `Json`/insert shape).

**What I did instead:** followed that entry's own prescribed pattern — a narrow cast at the one Supabase-facing call site: `.upsert({ ...row, id } as never)` — rather than loosening `Store.putRow`'s own signature, which stays `Record<string, unknown>` for every caller.

**Risk:** Low, and isolated to this one line. `putRow` is meant to accept an arbitrary already-validated row for any `SyncEntity`, so a fully-typed per-table union at the `Store` interface level isn't practical here; the cast defers to Postgres/PostgREST to reject a genuinely malformed row at runtime, same as `upsert` already would for any caller passing the wrong shape.

---

## Task 1.4 — `GET /sync/pull`, mounted exactly as the plan specifies, would 401 on every request forever

**Plan said:** `apps/server/src/routes/sync.ts`'s new pull route calls `const caller = await deps.callerFor(c.req.raw, null);` — a hardcoded `null` fallback user id, always, since a pull request carries no operations to derive an author from. This is literal plan text, unchanged from what task 1.3's own implementer already flagged (see this task's own entry above, "Notable for task 1.4") without fixing, since it was out of task 1.3's file scope.

**What was wrong:** `apps/server/src/composition.ts`'s `callerFor` (built in task 1.3) is:
```ts
callerFor: async (_request, fallbackUserId) => {
  if (!fallbackUserId) return null;
  ...
}
```
With `fallbackUserId` always `null` for pull, this returns `null` unconditionally, before ever touching the request or the store. The route then always responds `401 {"error":{"code":"unauthenticated", ...}}`. There is no input that would make it succeed, until task 1.12 replaces this function with real bearer-token auth — which defeats the walking skeleton's whole premise (SPEC-FINAL §20.3: a real end-to-end proof, including a real deployed pull, before auth exists at all).

**What I did instead:** confirmed `syncPull`'s own use-case code never inspects caller identity (`void caller; // every role, and a service caller, may replicate` — it takes `caller` only to match every other use case's signature). Changed the `!fallbackUserId` branch in `composition.ts` to authenticate as a service caller instead of failing outright:
```diff
-          if (!fallbackUserId) return null;
+          // `fallbackUserId` is only ever null for GET /sync/pull (a pull carries no
+          // operations to derive an author from). syncPull's own doc comment says
+          // every role, and a service caller, may replicate — it never inspects the
+          // caller's identity — so authenticate it as a service caller here rather
+          // than unconditionally failing every pull until task 1.12 lands real
+          // bearer-token auth and replaces this whole function anyway.
+          if (!fallbackUserId) return { kind: 'service', label: 'sync-pull' };
```
The non-null branch (push's own behavior) is untouched. `apps/server/src/composition.ts` is not in task 1.4's own Files list — this is a deliberate, logged exception to that boundary, made because the alternative (an endpoint the plan itself specifies but that can never succeed) is worse than the small scope expansion.

**Risk:** Low. `syncPull` cannot behave differently based on this, since it ignores caller identity entirely; push is unaffected since it always supplies a non-null `fallbackUserId`. The externally visible effect: until task 1.12 lands real auth, `GET /sync/pull` is reachable by anyone who can reach the endpoint at all, with no authentication — true of the whole walking-skeleton phase already (push has the same property for whichever `author_user_id` a caller chooses to claim) and explicitly the point of this phase. Checked for downstream coupling to the exact label `'sync-pull'` or to `caller.kind === 'service'` for the pull path specifically — found none; task 1.12 replacing this whole function deletes this branch along with the rest, exactly as its own comment already anticipates.

---

## Task 1.4 — `repos/pull.ts`: a dynamic table name needs a narrow cast, the same generic-vs-generated-type gap as tasks 0.14 and 1.3

**Plan said:** `let query = db.from(spec.table).select('*')...` where `spec.table` comes from the `PULL_SCOPES` lookup table, typed as a plain `string`.

**What was wrong:** does not compile. `SupabaseClient<Database>.from()` requires a literal `keyof Database['public']['Tables']`, not a widened `string` — `spec.table` spans all 24 generated table row shapes at once, so it cannot be that literal union.

**What I did instead:** the same pattern already established for `store.ts`'s `putRow` (this file, task 1.3 entry above): a narrow cast at the one dynamic call site, `db.from(spec.table as never)`, with a comment pointing at the precedent. Every literal `.from('matches')`-style call inside `parentIds` (the same file) needed no cast and stayed fully type-checked.

**Risk:** Low, same shape as the already-accepted `putRow` pattern. Runtime correctness rests on `PULL_SCOPES`'s table name strings matching real table names, which was checked directly against `packages/db/src/database.types.ts` (all 24 `PULL_ENTITY_KEYS` present as real tables).

---

## Task 1.5 — `outbox.test.ts`'s plan-quoted lines exceed the print width, same recurring class as tasks 0.3/0.9/0.10/0.12

**Plan said:** `apps/client/src/data/outbox.test.ts` transcribed verbatim, including three lines over 100 characters (the `ackResults` call in "keeps a delete of a row the server already knows about", the `result` object literal in "prunes on every acking status...", and the `ackResults` call in "NEVER prunes on a rejection...").

**What was wrong:** same as every prior occurrence logged in this file: `pnpm format:check` failed on the test file once written verbatim, since `.prettierrc.json`'s `printWidth: 100` disagrees with the plan's own line breaks.

**What I did instead:** wrote the file verbatim first, confirmed the failing-first run and the implementation both matched the plan exactly, then ran `npx prettier --write apps/client/src/data/outbox.test.ts`. Only line breaks moved (the three lines above were wrapped onto multiple lines); no assertion or value changed. Re-ran `pnpm --filter @frc/client exec vitest run src/data` afterward — 8/8 still green — and `pnpm format:check` / `pnpm lint` both clean.

**Risk:** None.

---

## Task 1.5 — everything else matched the plan exactly

**Plan said:** Step 2 (test setup / `vitest.config.ts` `setupFiles`) is already done by task 0.4; the failing-first error is predicted as `Failed to resolve import "./db"`; `db.ts` and `outbox.ts` are given as literal, complete code.

**What was wrong:** nothing. Step 2 was confirmed as a genuine no-op (`apps/client/src/test/setup.ts` and `apps/client/vitest.config.ts` already had the exact content the plan shows). The failing-first run reproduced the plan's predicted error text exactly, unlike most prior tasks' failing-first entries in this file. `db.ts` and `outbox.ts` were transcribed verbatim with no compile or runtime adjustment needed — `@frc/shared` already exports `Operation`, `isAck`, `PushResult` and `PullEntityKey` from `packages/shared/src/index.ts` (tasks 1.1–1.4), so no export line needed adding there. `@testing-library/user-event`, `fake-indexeddb` and `@testing-library/jest-dom` were all already present in `apps/client/package.json` from task 0.4; only `dexie` was missing and was added as specified.

**What I did instead:** implemented as written. `pnpm --filter @frc/client exec vitest run src/data` is 8/8 green, the full client suite is 28/28 green (6 files), and `pnpm typecheck` is clean across all four packages.

**Risk:** None.

---

## Task 1.6 — `sync.test.ts`'s `emptyEntities` cast fails `tsc -b` even though vitest passes

**Plan said:** `const emptyEntities = Object.fromEntries(PULL_ENTITY_KEYS.map((k) => [k, []])) as PullResponse['entities'];`

**What was wrong:** `pnpm --filter @frc/client exec vitest run src/data/sync.test.ts` reproduced the plan's predicted failing-first error exactly (`Failed to resolve import "./sync"`), and after implementation the full suite passed under vitest (esbuild transpilation only, no structural type-check). `pnpm typecheck` then failed with `tsc -b --force`: TS2352, "Conversion of type '{ [k: string]: never[]; }' to type 'Record<...24 keys..., Record<string, unknown>[]>' may be a mistake because neither type sufficiently overlaps with the other." `Object.fromEntries` on a `[string, never[]][]` array infers an index-signature type with `never[]` values, which TypeScript's single-step `as` refuses to narrow directly to the 24-key literal-union record type.

**What I did instead:** changed the one line to cast through `unknown` first — `as unknown as PullResponse['entities']` — which is the standard, narrowly-scoped escape hatch for exactly this "types don't sufficiently overlap" situation. No other line changed, no runtime behavior changed (this is test-fixture construction only), and all 24 `PULL_ENTITY_KEYS` are still populated with `[]` at runtime same as before.

**Risk:** None. Confirmed `pnpm --filter @frc/client exec vitest run src/data` still 19/19 green and `pnpm typecheck` clean across all four packages after the change.

---

## Task 1.6 — plan-quoted files fail `format:check`, same recurring class as tasks 0.3/0.9/0.10/0.12/1.5

**Plan said:** `api.ts`, `sync.ts` and `sync.test.ts` transcribed verbatim from the plan.

**What was wrong:** `pnpm format:check` flagged all three files (`ApiError`'s multi-parameter constructor, several inline object literals in `sync.ts`'s pull loop, and a number of single-line test bodies/objects in `sync.test.ts` exceeding the project's Prettier config).

**What I did instead:** wrote the files verbatim first, confirmed the failing-first run and passing run both matched the plan's logic exactly, then ran `npx prettier --write` on the three files. Only whitespace/line-wrapping moved (e.g. `ApiError`'s constructor parameters each on their own line, several object literals reflowed across lines); no identifier, assertion, or value changed. Re-ran `pnpm --filter @frc/client exec vitest run src/data` (19/19 green), `pnpm typecheck` (clean), and `pnpm lint` (clean) afterward.

**Risk:** None.

---

## Task 1.6 — everything else matched the plan exactly

**Plan said:** `api.ts`, `sync.ts`, `connection.ts` given as literal, complete code; `sync.test.ts` given as a literal, complete test suite; failing-first error predicted as `Failed to resolve import "./sync"`.

**What was wrong:** nothing else. `connection.ts` needed no adjustment at all (not even formatting). `@frc/shared` already exports `PullResponse`, `PushResponse`, `PullRequest`, `PushRequest`, `MAX_OPERATIONS_PER_PUSH`, `PULL_ENTITY_KEYS` and `PullEntityKey` from `packages/shared/src/sync/protocol.ts` via `index.ts`, so no export line needed adding there. `apps/client/src/config.ts`'s `ClientConfig` type matched what `api.ts` expects with no changes.

**What I did instead:** implemented as written (module-line fixes above aside). `pnpm --filter @frc/client exec vitest run src/data` is 19/19 green (2 files: `outbox.test.ts` 8, `sync.test.ts` 11), and `pnpm typecheck` / `pnpm lint` are clean across all four packages.

**Risk:** None.

---

## Task 1.7 — `submitEntry.test.ts`'s expected-range fixture collides with its own config range, so the assertion could never pass

**Plan said:** the `fields` fixture in `apps/client/src/features/entry/submitEntry.test.ts` gives the one counter field both `config: { min: 0, max: 10, step: 1 }` and `expected_range: { min: 0, max: 10 }` — identical bounds — and the test "refuses a value outside the expected range (SPEC-FINAL 15.1)" submits `auto_notes: 11` and asserts the rejection `.rejects.toThrow(/expected range/i)`.

**What was wrong:** `validateEntryData` (task 1.2, `packages/shared/src/forms/validate.ts`, out of this task's file list) checks the field's own `config.min`/`config.max` first and `break`s out of the `counter` case on failure, before ever reaching the `expected_range` check below it. With `config.max` and `expected_range.max` both `10`, a value of `11` always fails the config check first, so the thrown message is `"Auto notes must be between 0 and 10"` (`out-of-config-range`) and never contains the text "expected range". Ran it to confirm rather than assuming: `expected [Function] to throw error matching /expected range/i but got 'Auto notes must be between 0 and 10'`. Task 1.2's own `validate.test.ts` documents exactly this hazard in a comment on its fixture — "The config range is the input's own limit; expected_range is the narrower sanity band that blocks a submit (SPEC-FINAL 15.1). They are deliberately different here so each rule is tested on its own" — and keeps `config.max: 99` against `expected_range.max: 10` for that reason. The task 1.7 fixture didn't follow that precedent.

**What I did instead:** widened only this task's own test fixture — `config: { min: 0, max: 10, step: 1 }` → `config: { min: 0, max: 99, step: 1 }`, `expected_range` left at `{ min: 0, max: 10 }` — matching task 1.2's established pattern instead of touching `validate.ts`, which is outside this task's file list and already correctly tested on its own terms. `auto_notes: 11` now passes the config check (≤ 99) and fails only the expected-range check, so the thrown message is `"Auto notes is outside its expected range (0–10)"`, matching `/expected range/i`. No other assertion in the file depends on the old bound (all other submitted values in this file are 0–3, in range under both old and new bounds). `EntryPage.test.tsx`'s analogous fixture was left untouched — its own assertion only checks the alert contains `/Auto notes/`, which the config-range message already satisfied, so it needed no change and stayed a byte-for-byte transcription of the plan.

**Risk:** None. The fix is confined to one line of my own test fixture; `packages/shared/src/forms/validate.ts` and its own test suite are untouched.

---

## Task 1.7 — `EntryPage.test.tsx`'s `field()` helper does not typecheck under strict mode

**Plan said:** `apps/client/src/features/entry/EntryPage.test.tsx`'s `field()` helper is `(over: Record<string, unknown>) => ({ entity: 'form_fields' as const, form_version_id: 'fv-1', required: false, deprecated: false, config: {}, ...over })`, with no return type and no cast, and every call site supplies `id` only through `over`.

**What was wrong:** `db.rows.bulkPut(...)` requires `CachedRow[]`, and `CachedRow` requires a named `id: string`. Spreading a value statically typed `Record<string, unknown>` into an object literal does not give the result a named `id` property as far as the type checker is concerned — only an index signature would, and TypeScript does not treat that as satisfying a required named property on `CachedRow`. `pnpm typecheck` failed on both `bulkPut` call sites: `Property 'id' is missing in type '{ entity: "form_fields"; ...}' but required in type 'CachedRow'`. This never surfaces under `vitest` (esbuild transpilation only), the same class of gap already logged for task 1.6's `emptyEntities` cast.

**What I did instead:** imported `type { CachedRow }` from `@/data/db` and cast the helper's return value through `unknown` first — `(...) as unknown as CachedRow` — the same narrowly-scoped escape hatch used for the task 1.6 finding, for the same reason (a single-step `as CachedRow` still fails with "neither type sufficiently overlaps with the other"). Runtime behavior is unchanged: every call site still supplies a real `id` via `over` at runtime, exactly as the plan intended; only the static type of the helper's return value changed.

**Risk:** None. Confirmed `pnpm --filter @frc/client exec vitest run src/features/entry` is 15/15 green and `pnpm typecheck` is clean across all four packages after the change.

---

## Task 1.7 — plan-quoted files fail `format:check`, same recurring class as tasks 0.3/0.9/0.10/0.12/1.5/1.6

**Plan said:** `EntryPage.tsx` and `submitEntry.test.ts` transcribed verbatim (aside from the two fixes above).

**What was wrong:** `pnpm format:check` flagged both files — several multi-argument calls and JSX attribute lists in `EntryPage.tsx`, and several single-line `submitEntry(...)` calls in `submitEntry.test.ts` exceeding `printWidth: 100`.

**What I did instead:** wrote the files verbatim first, confirmed the failing-first run and the passing run both matched the plan's logic exactly, then ran `npx prettier --write` on the two files. Only line breaks moved; no assertion, value, or JSX structure changed. Re-ran `pnpm --filter @frc/client exec vitest run src/features/entry` (15/15 green) and the full client suite (`pnpm --filter @frc/client exec vitest run`, 54/54 green across 9 files) afterward, plus `pnpm typecheck`, `pnpm lint` and `pnpm format:check`, all clean.

**Risk:** None.

---

## Task 1.7 — everything else matched the plan exactly

**Plan said:** `cache.ts`, `submitEntry.ts`, `useDraft.ts`, `FieldInput.tsx`, `RobotStatusPicker.tsx` given as literal, complete code (aside from the `EntryPage.tsx` formatting above); `submitEntry.test.ts` and `EntryPage.test.tsx` given as literal, complete test suites (aside from the two fixture/typing fixes above); `@testing-library/user-event` to be added to `apps/client` devDependencies; failing-first error predicted as `Failed to resolve import "./submitEntry"` and `"./EntryPage"`.

**What was wrong:** nothing else. `@testing-library/user-event@^14.5.2` was already present in `apps/client/package.json` from task 0.4 (confirmed by reading the file before starting), so no `package.json` change was needed at all this task — `git status` shows only `cache.ts` and the seven `features/entry/*` files as new. `@frc/shared` already exports `validateEntryData`, `validateEntryShape`, `selectOptions`, `FormFieldDefinition`, `RobotStatus` and `PullEntityKey` from tasks 1.1–1.4, so no export line needed adding there. The failing-first run reproduced the plan's predicted error text exactly for both files.

**What I did instead:** implemented as written (fixture, cast and formatting fixes above aside). `pnpm --filter @frc/client exec vitest run src/features/entry` is 15/15 green (7 in `submitEntry.test.ts`, 8 in `EntryPage.test.tsx`), the full client suite is 54/54 green across 9 files, and `pnpm typecheck`, `pnpm lint` and `pnpm format:check` are all clean across all four packages.

**Risk:** None.

---

## Task 1.8 — `SelectRobotPage.tsx`'s own prose contradicts its own literal code on what the bare-match payload holds

**Plan said:** two things about the same payload, in the same task, that disagree. The prose immediately above the code block says bare-match creation "creates the minimal row — event, type, number, nothing else" (SPEC-FINAL 6.4), and the prose describing `SelectRobotPage.test.tsx` (also plan text, since that test file is prose-only) says the create "enqueues exactly one `entity: 'match'` create whose payload holds only `event_id`, `match_type` and `number`". But the literal Step 3 code for `ensureMatchLocally` builds `const payload = { id: rowId, event_id: eventId, match_type: matchType, number: parsed };` — four keys, not three — and reuses that same `payload` object as the outbox operation's `payload` field.

**What was wrong:** the literal code and the plan's own repeated, explicit prose about the same code disagree. Checked whether `id` in the payload is load-bearing anywhere downstream: `apps/server/src/core/commands/syncPush.ts`'s `applyBareMatch` destructures only `{ event_id, match_type, number }` from `op.payload` and takes the row's id from `op.row_id`, never `payload.id` — so the extra key is inert on the server, and the local optimistic write (`db.rows.put`) can just as easily get its `id` from `rowId` directly instead of via the payload spread.

**What I did instead:** followed the prose (repeated twice, and matching the server's actual contract) over the literal code's extra key. `payload` is now exactly `{ event_id, match_type, number }`; the local `matches` row and the in-memory `matches` state both get `id: rowId` added explicitly (`const localMatch: MatchRow = { id: rowId, ...payload }`) rather than relying on the payload carrying it. Wrote `SelectRobotPage.test.tsx` (prose-only, see below) to assert the narrower, three-key payload, which is what actually runs.

**Risk:** Low. The change is confined to `ensureMatchLocally`'s payload construction; the operation's `row_id` (which the server actually uses) is unchanged, and the local optimistic write still produces an identical `matches` row. If a later task's plan text assumes `payload.id` exists on a bare-match create op specifically, that assumption doesn't hold anymore — worth checking before relying on it.

---

## Task 1.8 — `routes.tsx`'s literal code doesn't compile as written, and never wires the `/sync` route the task's own Interfaces line promises

**Plan said:** the Interfaces line for this task lists the routes produced as `/`, `/entry/:matchId/:teamId`, `/entries`, and `/sync`. The literal `routes.tsx` code block renders `<SelectRobotPage eventId={eventId} />` with no `authorUserId`, even though `SelectRobotPage`'s own literal signature (same task) requires `authorUserId: string` as a non-optional prop.

**What was wrong:** two separate gaps. (1) `<SelectRobotPage eventId={eventId} />` is a straight compile error — a required prop is missing — and the task's own "Other seed ids you may need" note points directly at the fix (`SEED.scouter`, "useful if you need a hardcoded `authorUserId` fallback ... since there is no login yet in phase 1A"), confirming this was meant to be wired, not omitted. (2) no `/sync` route, and no component for one, appears anywhere in this task's Files list or its literal code — the Interfaces line names a route this task never builds.

**What I did instead:** added a module-level `AUTHOR_USER_ID` constant in `routes.tsx` — the literal seed id `00000000-0000-4000-8000-000000000006` (`SEED.scouter` from `packages/db/src/seed/fixtures.ts`; not imported from `@frc/db`, since the client depends only on `@frc/shared`) — and passed it to both `<SelectRobotPage>` and `<EntryRoute>` (the latter needs it too, to satisfy `EntryPage`'s required `authorUserId` prop; see the next entry). Did not add a `/sync` route or any component for it: nothing in this task's Files list, Step 1 tests, or Step 3 code calls for one, and inventing a route with no backing component or test would be exactly the kind of scope invention task 1.2's precedent (this file, above) already warns against. `/sync` is left for whichever later task actually specifies it.

**Risk:** Low for the `authorUserId` fix — it only supplies a value the code already required and had nowhere else to get in phase 1A. None for declining to build `/sync` — no other file in this task references that path.

---

## Task 1.8 — `SelectRobotPage.test.tsx` and `EntryRoute.tsx` were specified in prose, not code; three judgment calls

**Plan said:** both files are described only in prose (no literal code given), unlike `ConnectionIndicator.tsx`/`.test.tsx`, `EntriesPage.tsx`/`.test.tsx`, `AppShell.tsx`, `SelectRobotPage.tsx` and `routes.tsx`, all given literally. The task's own top-level instructions call out exactly this and ask for the resulting judgment calls to be logged here, same as task 1.3's precedent for `entryShape.test.ts`.

**What was wrong:** nothing to fix — three genuine design decisions needed making, each with no single obviously-correct answer:

1. **Threading `alliance` from `SelectRobotPage` to `EntryRoute`.** Chose a query parameter over router `state`: `navigate(\`/entry/${matchId}/${team.id}?alliance=${alliance}\`)`, read back in `EntryRoute` via `useSearchParams().get('alliance')` (defaulting to `'red'` if absent or malformed). Router `state` is lost on a hard reload or a re-opened tab; venue connectivity is zero per this project's own gotchas, and a scouter's tab surviving a reload mid-match is exactly the case that must not lose which alliance they picked. A query param survives that.
2. **How `SelectRobotPage.test.tsx` avoids real routing.** Mocked `react-router-dom`'s `useNavigate` (`vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }))`) rather than wrapping the component in a real `MemoryRouter` + a second route to observe navigation. This is the first component in the codebase to use `react-router-dom`, so there's no existing precedent either way; mocking keeps `SelectRobotPage` mounted across the "same unknown number chosen twice" test (which needs two sequential picks without a real route swap unmounting the component in between) and keeps the test's assertions about *what path it would navigate to* direct or exact string equality, rather than inferring it from a second rendered route's own display.
3. **`EntryRoute`'s active-season lookup.** Resolves the match-kind form via `app_settings`'s `active_season_id` (cached `app_settings` row, first one) rather than the specific event's own `season_id` (also available, via cached `events`), for consistency with `App.tsx`'s own analogous pattern (this same task) of reading `active_event_id` off cached `app_settings`. Added a hardcoded fallback of `00000000-0000-4000-8000-000000000001` (`SEED.season`) for the same reason `App.tsx` falls back to `SEED.event` — nothing has synced into `app_settings` yet on a brand-new device's very first render before hydration completes, even though `AppShell` normally blocks that case with its `blocked`/`loading` states first.

**What I did instead:** wrote `SelectRobotPage.test.tsx` against the description in full — roster-list-once-alliance-chosen (via `toBeDisabled()`/`toBeEnabled()` on the fieldset's own disabled state, since the roster actually renders regardless of alliance but is inert until one is picked), known-number navigates with zero enqueues, unknown-number shows the `role="status"` notice and enqueues exactly one minimal `entity: 'match'` create plus a local `matches` row, the same unknown number chosen twice yields one match not two, slot-narrowing with a whole-roster fallback, and the full flow under `navigator.onLine === false`. Wrote `EntryRoute.tsx` to resolve `matchId`/`teamId` from `useParams`, look up labels from cached `matches`/`teams`, resolve the form version as above, and render `<EntryPage>` (or a "Loading…" placeholder until everything resolves).

**Risk:** Low on all three. (1) is confined to how one value crosses one route boundary in a walking skeleton explicitly documented as not-the-final-routing-design. (2) is test-only; it exercises the same `SelectRobotPage` behavior a `MemoryRouter`-based test would, just without needing a second dummy route component. (3)'s choice of `app_settings.active_season_id` over `events.season_id` is a genuine judgment call — if a later task's design intends the event's own season to govern which form is active (rather than a single global "current season" setting), this lookup would need to change; worth confirming against SPEC-FINAL before phase 1B's multi-event handling, if that's ever a possibility this app needs to support.

---

## Task 1.8 — plan-quoted files fail `format:check`, same recurring class as tasks 0.3/0.9/0.10/0.12/1.5/1.6/1.7

**Plan said:** `ConnectionIndicator.test.tsx` and `AppShell.tsx` transcribed verbatim; `SelectRobotPage.tsx` transcribed verbatim aside from the payload and navigation fixes logged above.

**What was wrong:** `pnpm format:check` flagged all three files — a wrapped `waitFor` callback in `ConnectionIndicator.test.tsx`, a wrapped paragraph in `AppShell.tsx`'s blocked-state copy, and the destructured `SelectRobotPage` prop list plus a wrapped `.filter(...).map(...)` chain and paragraph text in `SelectRobotPage.tsx` — all exceeding `printWidth: 100`.

**What I did instead:** wrote the files first, confirmed the failing-first run and the passing run both matched, then ran `npx prettier --write` on the three files. Only line breaks moved; no assertion, value, or JSX structure changed. Re-ran the full client suite and `pnpm typecheck` / `pnpm lint` / `pnpm format:check` afterward, all clean.

**Risk:** None.

---

## Task 1.8 — everything else matched the plan exactly

**Plan said:** `ConnectionIndicator.tsx`, `EntriesPage.tsx`, `AppShell.tsx` given as literal, complete code (aside from the payload/prop fixes above, which are scoped to `SelectRobotPage.tsx`/`routes.tsx` only); `ConnectionIndicator.test.tsx` and `EntriesPage.test.tsx` given as literal, complete test suites; failing-first errors predicted as `Failed to resolve import "./ConnectionIndicator"` and `"./EntriesPage"` (and, by the same pattern, `"./SelectRobotPage"` for the prose-only test this task also required writing).

**What was wrong:** nothing else. `@frc/shared`'s `formatCount`, `formatDate`, `formatTime` needed no changes. `apps/client/package.json` had neither `react-router-dom` nor `@tanstack/react-query` yet (confirmed by reading the file before starting), so both were added as specified; no other dependency change was needed. `App.tsx`'s replacement (prose-only, per the task) reads `app_settings.active_event_id` from `cachedRows('app_settings')` and falls back to `SEED.event` (`00000000-0000-4000-8000-000000000002`) exactly as described, then renders `<RouterProvider router={buildRouter(eventId)} />`. The three failing-first errors reproduced exactly.

**What I did instead:** implemented as written (fixes and judgment calls above aside). `pnpm install` succeeded with no lockfile conflicts. `pnpm --filter @frc/client exec vitest run` is 67/67 green across 12 files (7 new: `ConnectionIndicator.test.tsx` 3, `EntriesPage.test.tsx` 3, `SelectRobotPage.test.tsx` 7 — the other 4 new source files, `AppShell.tsx`, `EntryRoute.tsx`, `routes.tsx` and `App.tsx`, have no dedicated test file of their own per this task's Files list, and are exercised indirectly through the files that do). `pnpm typecheck`, `pnpm lint` and `pnpm format:check` are all clean across all four packages.

---

## Task 1.9 — Vercel reported `frc-scouting-client`'s deployment as "Canceled by Ignored Build Step" for a `develop` push that should have built

**Plan said:** nothing about this directly; the build-chat instructions for the deploy-then-verify step expected two fresh Preview deployments (client and server) once `feat/phase-1a-skeleton` was fast-forwarded onto `develop`, since 1.3–1.8 had never been deployed before.

**What was wrong:** `gh api repos/roboactive-scouting/super-scouting/commits/<sha>/status` showed `Vercel – frc-scouting-client` as `success` / `"Canceled by Ignored Build Step"` immediately after the push — i.e. the status GitHub Actions/Vercel reported claimed the client build was **skipped**. `docs/ops/ENVIRONMENT.md` §19's Ignored Build Step script only gates on `VERCEL_GIT_COMMIT_REF` (`main`/`develop` build, everything else skips), so a push whose ref is `develop` should never be skipped, and this push touched `apps/client/**` across all five commits since `origin/develop`'s prior tip. Taking the status literally would have meant the task was blocked (stale client preview, nothing to verify).

**What I did instead:** did not trust the status string. Fetched the deployed client's `index.html`, found its hashed JS bundle (`/assets/index-DQezEDlu.js`), fetched that bundle, and grepped it for the pushed commit's short SHA (`0f8b5a2`) — found at a byte offset inside the bundle, i.e. `VITE_APP_VERSION` (injected from `VERCEL_GIT_COMMIT_SHA` at build time per `apps/client/vite.config.ts`, see `ENVIRONMENT.md` line 283) matched this push exactly. The client **did** rebuild; only the GitHub commit-status label was wrong or stale (most likely a race between an earlier, genuinely-skipped status write and the real build's own completion webhook landing after it). Proceeded with verification once the fingerprint match confirmed the live bundle was current.

**Risk:** Low for this task — the fingerprint check is conclusive and is now the standard way to confirm a client preview is current, cheaper than trusting the commit-status API. Worth a note for whoever debugs a real "build skipped" incident later: the GitHub commit-status context for `frc-scouting-client` is not fully reliable evidence on its own: check the deployed bundle's embedded commit SHA before concluding a preview is stale.

---

## Task 1.9 — executed code only; the airplane-mode rehearsal and its `RUNBOOK.md` result are outstanding by design

**Plan said:** Step 3 ("Run the airplane-mode rehearsal by hand") is part of task 1.9's own five steps, ending with "Record the result — pass or fail, with what broke — in `docs/ops/RUNBOOK.md` under *Pre-event checklist*", before Step 4 (wire into CI) and Step 5 (commit).

**What was wrong:** nothing — this was an explicit instruction for this build chat: the rehearsal (install on a physical phone, airplane mode, cold start, three entries, reconnect, confirm sync, check the laptop's `/entries`) is the maintainer's own hands-on step, not something to attempt, simulate, or mark done from this session.

**What I did instead:** completed Step 1 (`apps/server/smoke/slice.smoke.ts`, `apps/server/vitest.smoke.config.ts`, transcribed from the plan verbatim and reformatted by `prettier --write` to satisfy `format:check`), attempted Step 2 locally and confirmed the suite loads, imports `@frc/shared`'s `PullResponse`/`PushResponse` types cleanly, and fails at its own env-var guard (not a syntax or type error) when `SMOKE_API_BASE_URL`/`SMOKE_SUPABASE_URL`/`SMOKE_SUPABASE_SERVICE_ROLE_KEY` are unset — could not run it against the live preview from this shell because the Supabase service-role key is a GitHub Actions secret, not present locally, and is never to be typed into a chat, a file, or a command line. Completed Step 4 (root `smoke` script now chains `scripts/smoke.mjs` and `vitest run --config vitest.smoke.config.ts`, confirmed by running `pnpm smoke` and observing it fail at the same first-missing-env-var line as before the change, i.e. the chain is wired correctly). Left Step 3 unticked and did not touch `docs/ops/RUNBOOK.md`'s *Pre-event checklist* — there is no rehearsal result yet to record. `pnpm typecheck`, `pnpm lint`, `pnpm test` (155/155) and `pnpm format:check` are all clean with these changes in place.

**Risk:** None for the code delivered. The gap is the rehearsal itself, which is explicitly the maintainer's to run; CI's `Smoke suite` step (now exercising this full suite via the GitHub Actions secrets) is the only proof of Step 2 available from this session, and its result should be checked once the `develop` push's CI run completes.

---

**Risk:** None beyond what's already logged above. One test run showed a benign React `act(...)` warning on `SelectRobotPage.test.tsx`'s "shows a notice…" case (a `setMatches` call landing after that test's own assertions had already run) — it did not fail the test or affect any assertion, and is left as-is rather than restructured, consistent with this file's practice of not touching passing, in-scope test behavior to silence console noise alone.

---

## Task 1.8 — `AppShell` rendered child routes during the transient `loading` hydration state, so a fresh device showed an empty roster until reloaded

**Plan said:** `AppShell` holds `useState<HydrationState | 'loading'>('loading')`, runs `hydrate()` once on mount, and returns an early panel when the result is `blocked`. The plan named the three `HydrationState` outcomes (`fresh`, `cached`, `blocked`) and what each should render, but said nothing about what the shell renders during the `loading` state that exists before any of them arrive.

**What was wrong:** with only a `blocked` guard, every other value of `state` — including `'loading'` — fell through to the shell and `<Outlet />`, so child routes mounted against an empty IndexedDB while the first pull was still in flight. `SelectRobotPage` reads the cache in a `useEffect` keyed `[eventId]`, which never changes, so it never re-read once hydration completed. Observed on the live preview deployment on a fresh device: the robot list was empty and the page claimed "Match 1 is not on this device yet" while 20 matches, 30 teams and 30 event_teams were landing in IndexedDB; a page reload fixed it completely. The data, the `entity` index, `app_settings.active_event_id` and the `eventId` prop were all confirmed correct — the only defect was the render ordering. All 155 tests were green through this, because every component test seeds `db.rows` in `beforeEach` and then renders: no unit test ever simulated a device whose cache is still empty at mount, which is the only condition that exposes it.

**What I did instead:** added a `state === 'loading'` guard immediately before the `blocked` one, returning a small first-load panel ("Loading the competition onto this device", plus one line saying it happens once and takes a few seconds) in the same plain-language voice as the `blocked` panel — static text only, no spinner or other decorative animation, colour from the §17.4 tokens (`--text-muted`) with no hard-coded hex, and `dir="auto"` on both text nodes. `blocked` and `cached` behaviour is untouched. Rejected `<Outlet key={state} />`, which would also fix today's symptom: it works by remounting every child whenever `state` changes, and the shell's 45-second auto-refresh and `online` handler will change state on a live screen in later phases, which would silently discard a part-filled entry form. The guard defers the first mount instead of repeating it. Added `apps/client/src/features/shell/AppShell.test.tsx` — the first test file for this component — covering all three states through a real `MemoryRouter` with a stub index route: children stay unmounted while a deliberately-deferred `hydrate()` promise is pending and appear once it resolves `fresh`, children render under the cached-data notice for `cached`, and neither shell nor children render for `blocked`. Confirmed it fails (2 of 3 cases) with the guard stashed and passes with it. Suite is 158/158; `pnpm typecheck`, `pnpm lint` and `pnpm format:check` clean (`AppShell.tsx` needed one `prettier --write` pass for `printWidth`, the same recurring class logged above).

**Risk:** Low. The change is one early return in one component and cannot affect an already-hydrated device, since `loading` is left within a tick of the first `hydrate()` settling. The one behavioural consequence worth knowing: on a device with a good connection but a slow first pull, the very first paint after the splash is now this panel rather than an empty roster — which is the intent. Worth carrying forward into phase 1B: any other component that reads the cache once in a mount-time `useEffect` keyed on something that never changes has the same latent shape, and the shell guard protects it only for the *first* hydration, not for data that arrives on a later 45-second refresh. A live-query read (Dexie's `liveQuery`, or React Query over the cache) is the real fix for that class and should be considered when the entry screens stop being a walking skeleton.

---

## Task A — `POST /sync/push` returned 500 for every bare-match operation

**Plan said:** remove `version` from the bare-match upsert and from the match noop paths (return `new_version: 1`); wrap each `applyOne` so a throw becomes a per-operation rejection carrying the message; add bare-match coverage against the fake store and in `apps/server/smoke/slice.smoke.ts`. Do not add a `version` column to `matches`.

**What was wrong:** `applyBareMatch` upserted `version: 1` into `public.matches`, which has no such column (migration `20260903090000_skeleton.sql`, the `create table public.matches` block). `putRow` throws on the PostgREST error and the route had no catch. Reproduced against the develop preview before the fix, one brand-new bare-match operation for a practice match on the active event:

```
push status: 500 | body: Internal Server Error
db row: null
```

The brief says no test exercised the bare-match path. That is not quite right: `syncPush.test.ts` had two bare-match cases ("creates a bare match row…", "is a noop when the bare match already exists"). They passed because the fake store's `putRow` accepted any key, and the noop fixture itself seeded `version: 1` on a match. So the fake modelled a schema that does not exist. CI's smoke suite stayed green too, because it seeds its match straight through the Supabase client and only ever pushes a `scouting_entry`. 158 unit tests and a green smoke run, and no test ever sent a bare match to a real `matches` table.

**What I did instead:** as planned in `syncPush.ts`. The catch maps a throw to `rejected(op_id, 'invalid', 'unexpected server error: <message>')`. I chose `invalid` over a new reason so the shared `REJECTION_REASONS` protocol stays as it is, and a rejection is never an ack (`outbox.ts` `ackResults`), so the op stays queued and retries rather than being lost. `test/fake-context.ts` now has a `MATCH_COLUMNS` allowlist that matches the migration. Its `putRow` throws PostgREST's own message (`Could not find the '<col>' column of 'matches' in the schema cache`) for any other key, and the matches maps are typed `FakeMatchRow` (no `version`). I added four unit tests: the exact written row, op_id replay, bare match plus entry in one batch, and a thrown store error becoming a rejection with its detail while the next op still applies. Against the old `syncPush.ts`, 6 of 17 fail. Against the fix, 17/17 pass. The smoke suite gains a case that pushes a bare match and its entry together, reads the match row back through the service client and sees both in `/sync/pull`.

**Risk:** ensureMatch's noop is keyed on `row_id`, but SPEC-FINAL Appendix C's `ensureMatch` row ("a no-op if the match exists") and the `unique (event_id, match_type, number)` constraint key it on the logical triple. If two devices offline both auto-create the same unlisted match number, each picks its own uuid. The second device's bare match then hits the unique constraint. It now comes back as a rejection with the Postgres message instead of a 500, but it is still a rejection, and that device's entry FKs to a match id that never lands, so it stays rejected in the outbox. The fix needs the server to resolve by logical key and the client to re-point `match_id`, which is outside this task. Flagged for the rehearsal and for task 1.40.

---

## Task B — the robot picker is a native `<select>`

**Plan said:** replace the list of roster buttons in `SelectRobotPage.tsx` with a native `<select>`, and keep the narrowing: that alliance's `match_teams` robots when they exist, the full event roster when they don't.

**What was wrong:** nothing in the brief. It just leaves open how a select starts the entry. A tapped button navigated straight away. A select that navigates from `onChange` would fire on the platform picker's own change event, and iOS and Android fire that at different moments (on the wheel versus on "Done"). A scout scrolling past the wrong team could land in its entry by accident.

**What I did instead:** the select only chooses the robot. A separate full-width **Start entry** button (48 px `tap-target`, the same brand-plate style as **Review entry**) starts it. Until a match number and an alliance are set, the select is disabled and its placeholder reads "Choose a match and alliance first". The narrowing logic is unchanged. If a chosen robot drops off the list because the match or alliance changed, it is derived away rather than left selected. `dir="auto"` sits on each option. The seven existing picker tests now choose through the combobox and **Start entry**. The first one also asserts the element is a real `SELECT`, disabled before an alliance is chosen. 162/162.

**Risk:** Low. It adds one tap per entry. That is deliberate: a native picker's change event is not a reliable "I mean it".

---

## Task C — the picker never offers a robot this device already scouted in the match

**Plan said:** move the duplicate check into the picker. A robot with an entry for the selected match on this device shows as already scouted and can't start a second one. Follow SPEC-FINAL §8.1's super-entry rule: open the existing entry if the §7.6 five-minute self-edit window allows it, otherwise say plainly it is scouted and locked. Leave cross-device duplicates alone and keep the submit-time check as the backstop.

**What was wrong:** three gaps the brief leaves open. (1) The app had no way to edit an entry. `submitEntry` accepted a `rowId`, but `EntryPage` never loaded an existing entry or passed one. (2) There are no roles on the device in phase 1A, and every author is the seeded scouter (`routes.tsx`), so "own entry" and "lead edits any time" (§7.2) can't be told apart. (3) "Cached rows" also covers entries pulled from other devices. The submit-time backstop already refused those.

**What I did instead:** a new `features/entry/localEntries.ts` holds the logical-key predicate, `SELF_EDIT_WINDOW_MS` and `canSelfEdit`. The picker and `submitEntry`'s backstop now share that predicate, so the picker can never offer something submit would refuse. Scouted robots get a suffix in the select. Inside the window it reads "already scouted, editable until HH:MM", and the button becomes **Edit the existing entry**, which navigates with the entry's own recorded alliance and enqueues no match op. Outside the window it reads "already scouted, locked" and the option is `disabled`. `EntryRoute` now looks up the local entry itself. It passes the entry to `EntryPage` as `existing`, which prefills from it (an unsent draft wins as the newer copy), edits under the entry's own `form_version_id` and submits an `update` to the same row. If the entry is locked, the route renders a plain panel instead: "already scouted … locked — ask a lead", plus **Back to scouting**. That covers a stale screen or a typed URL. `EntryPage` re-checks the window at submit and refuses with "This entry is locked — ask a lead to change it." (§7.6's wording). On (2), I applied the strict scouter rule to everyone, so another scout's cached entry shows as locked. On (3), pulled rows count because the backstop already counted them. Nothing server-side changed, and two offline devices still both create, which leaves that case to §9.5 / task 1.40. I added nine tests: five in the picker, two for `EntryPage` edit and lock, and a new `EntryRoute.test.tsx` covering the locked panel and the open-for-edit path. 171/171.

**Risk:** The client doesn't lock the UI live at the five-minute mark, which §7.6 asks for. The window is checked when the picker renders, when the route opens and at submit. A live lock belongs with the phase 1E entry runtime. The server does not enforce `edit-window-expired` yet either. Once login and roles land, `canSelfEdit` has to let leads and admins through (§7.2). Today it locks them out of other scouts' entries on the device.

---

## Task D — submit returns to the scout page and says what was saved

**Plan said:** this fixes a defect against SPEC-FINAL §8.1 ("Submit returns to a fresh manual selection"). On success, go back to the scout page and confirm the save, naming the match and team and saying the entry is safe on the device, queued rather than sent. On failure, stay on the entry screen with the entry intact and show the reason where the scout is looking. Never say "synced" on submit.

**What was wrong:** `EntryRoute` never passed `onSubmitted`, so a successful submit just closed the review sheet and left the scout on the filled-in form with no message. That is how three entries were believed saved when none were: the server was returning 500s (Task A) and the screen gave no sign either way. The failure message was a plain red line at the very bottom of a full-screen sheet that scrolls, below the whole field list.

**What I did instead:** `EntryRoute` now navigates to `/` with `replace: true`, so Back can't reopen a form that has already been saved, and passes `{ saved: { matchLabel, teamLabel, edited } }` in router state. `SelectRobotPage` mounts fresh, which is §8.1's fresh selection, and renders a static `role="status"` panel: "Entry saved on this device" ("Changes saved…" after an edit), the match · team, and "It is queued to send and stays safe here with no network." It never mentions sync; the connection indicator owns that. There is no entrance animation (§17). On failure, the sheet's buttons now sit in a `sticky bottom-0` footer, and the alert renders inside it directly above **Submit entry**. It starts with "Not saved.", uses `--text` inside a 2 px `--danger` border (not danger-coloured text) so it clears AA in both themes, has `dir="auto"`, and takes focus. The sheet stays open and the values stay. I also dropped a doubled 16 px button gap (`tap-row` plus `gap-2`) back to §17.7's 8 px. `SelectRobotPage`'s cache read became one `Promise.all` with one state update. Before, it made five sequential reads and a new route-level test's teardown raced them (`DatabaseClosedError: Database has been closed`, unhandled). I added four tests: the notice with its no-"synced" wording, no notice on an ordinary visit, the failed-submit alert focused inside the same sticky footer as Submit with values kept, and an `EntryRoute` → `/` round trip showing the notice over an empty match number with the op queued. 175/175.

**Risk:** Low. The notice lives in history state, so a reload of `/` right after a submit shows it once more; it disappears on the next navigation. `frontend-design` vs §17: the skill pushes a distinctive palette, typography and orchestrated motion. §17.4 (tokens only), §17.9 (craft, not identity) and §17's no-decorative-animation rule on the data-entry path override it. I took only its copy guidance: name the result ("Not saved.", "Entry saved on this device") and don't apologise. I did not check this on a physical phone.

## Task 1.10 — add `record_alliance_bracket` to the capability matrix

**Plan said:** `CAPABILITIES` should encode exactly the capability names listed in the task-1.10 code block (`view_all_data` … `delete_objects`), with no capability for the alliance bracket.

**What was wrong:** SPEC-FINAL §7.2's admin row reads "Build / reorder pick lists; edit or remove do-not-pick entries; record the alliance bracket" — three admin-only actions in one row, but the plan's `CAPABILITIES` object only has a key for the pick-list/do-not-pick pair (`manage_pick_lists`, `edit_do_not_pick`). Recording the alliance bracket had no capability key at all, so a later use case would have nothing to `assertCan` against.

**What I did instead:** per orchestrator instruction, added `record_alliance_bracket: ADMIN` to `CAPABILITIES`, immediately after `edit_do_not_pick`, and added it to the admin-only loop in `permissions.test.ts` (merged into the existing "reserves … to the admin" test rather than a new one, to keep the test count aligned with the matrix). Every other capability name is unchanged from the plan's code block.

**Risk:** Low. Purely additive — no existing capability name, behavior, or export changed. A later task that builds a "record alliance bracket" use case or admin-only UI control should gate on `can(caller, 'record_alliance_bracket')`.

---

## Task 1.10 — doc comment on `CAPABILITIES` warning query use cases off `can()`

**Plan said:** no comment beyond the one-line "SPEC-FINAL 7.2, as data. Checked in the use-case layer and read by the UI."

**What was wrong:** nothing failed, but the plan is silent on a foot-gun: SPEC-FINAL §7.2/§16.5 say a `service` caller is not a user and holds none of these roles, yet is still allowed to call **query** use cases. Because `can()` returns `false` for a service caller on every capability including `view_all_data`, a future query use case that gates itself with `assertCan(caller, 'view_all_data')` (the seemingly obvious choice, since that's the capability that reads as "may view data") would silently lock every service caller out of reads §16.5 explicitly grants it.

**What I did instead:** per orchestrator instruction, expanded the doc comment on `CAPABILITIES` in `packages/shared/src/auth/permissions.ts` to state this explicitly: the matrix governs users only, `can(service, x)` is always false by design, and a query use case must not gate itself on `can(caller, 'view_all_data')` for that reason — it should either skip the capability check or test `isUser`/`isService` directly. `can()`'s behavior itself is unchanged; this is a comment-only addition.

**Risk:** None to current behavior. The value is preventive, for whoever writes the first query use case in a later task.

---

## Task 1.10 — boundary tests for `withinSelfEditWindow`

**Plan said:** the two tests in `permissions.test.ts`'s self-edit-window `describe` block that compare timestamps four/six minutes apart, plus the `canEditEntry` ownership and role tests. No test at the exact 300000 ms boundary, no test for negative elapsed time, no test for an unparsable timestamp.

**What was wrong:** nothing failed — the plan's `withinSelfEditWindow` implementation (`elapsed >= 0 && elapsed <= SELF_EDIT_WINDOW_MS`) already happens to return `false` for `NaN` comparisons (since any comparison with `NaN` is `false`) and already treats the boundary as inclusive. But none of that was under test, so a future refactor (e.g. switching to `Date.parse` with different NaN handling, or changing `<=` to `<`) could silently change the 5-minute-exactly and malformed-input behavior without a red test catching it.

**What I did instead:** per orchestrator instruction, added: (1) a test asserting `withinSelfEditWindow` is `true` at exactly 300000 ms elapsed and `false` at 300001 ms; (2) a test asserting `false` for a negative elapsed time (`client_updated_at` before `client_created_at`) and for an unparsable timestamp string on either argument. Also made the implementation's NaN handling explicit (`Number.isNaN` guard) rather than relying on the incidental `NaN` comparison behavior, and documented both cases in the function's doc comment, so the guarantee is intentional rather than accidental.

**Risk:** None — the implementation's observable behavior for all previously-passing cases is unchanged; the `Number.isNaN` guard is equivalent to the prior implicit behavior for the inputs in scope, just explicit.

---

## Task 1.11 — escape LIKE wildcards in `getUserByUsername`, and keep only the exact match

**Plan said:** `getUserByUsername` runs `.ilike('username', usernameLower).maybeSingle()` and returns the row.

**What was wrong:** In Postgres `ILIKE`, `%` and `_` are wildcards and `\` is the escape, so the raw username is a pattern. A read-only probe against the dev project (`frc-scouting-dev`, printing usernames only) showed: `seed_lea_` matched `["seed_lead"]` and `seed%` matched `["seed_scouter","seed_lead","seed_admin"]`. So a login as `seed_lea_` looks up `seed_lead`, and varying the pattern sidesteps the per-username rate limit. The probe also showed that PostgREST rewrites `*` to `%` before Postgres sees it: `seed*lead` matched `["seed_lead"]`, and `seed\*lead` matched `[]`, because `\*` arrives as `\%` (a literal percent sign). There is no way to express a literal `*` in a PostgREST ilike filter. With escaping, `seed\_lea\_` matched `[]` and `SEED\_LEAD` matched `["seed_lead"]`, as intended.

**What I did instead:** Per orchestrator instruction, I added and exported the pure helper `escapeLikePattern` in `apps/server/src/repos/store.ts`. It escapes `\`, `%` and `_`. Going past the instruction, it maps `*` to `_`, a single-character wildcard and the only way to make a `*` in a stored username match. Because of that `*` case, the query uses `.limit(10)` instead of `.maybeSingle()`, and the method keeps only the row where `row.username.toLowerCase() === usernameLower`. That filter is also the defence-in-depth check the orchestrator asked for. `.maybeSingle()` was dropped so two wildcard hits cannot become a PGRST116 "multiple rows" error. Without a `*`, the escaped pattern matches at most one row, because `lower(username)` is unique. `apps/server/src/repos/store.test.ts` is new. It unit-tests the helper and the method against a minimal stand-in for the supabase-js chain: the escaped pattern is sent, a non-exact row returns null, the exact match is picked from several hits, and a DB error throws. Mutation check: returning `rows[0]` instead of the exact match turned the two exact-match tests red.

**Risk:** Low. A username with more than 10 `*`-wildcard neighbours would fail to log in, which is not a realistic case with ~11 users. JS `toLowerCase()` and Postgres case folding can disagree for some non-ASCII letters (e.g. Turkish dotted I). A username like that could fail the exact-match check, and the user would get "wrong password". Rejected alternative: a Postgres function or generated `username_lower` column queried with `.eq`. That needs a migration, which is outside this task.

---

## Task 1.11 — `getUserByUsername` throws on a database error

**Plan said:** `const { data } = await db.from('users')…maybeSingle(); return data ?? null;`, which ignores `error`.

**What was wrong:** When the query fails, `data` is null. A database outage would then look exactly like an unknown user, and `login` would answer 401 "that username and password do not match" instead of 500. That is the same discarded-error trap as the seed's silent `.like()` failure (BUILD-CONTEXT §10).

**What I did instead:** Per orchestrator instruction, `if (error) throw new Error(error.message);` goes before any use of `data`. A test proves it rejects with the PostgREST message. Mutation check: discarding `error` turned that test red.

**Risk:** None. The error message is PostgREST's text, which contains no credentials.

---

## Task 1.11 — `verifyToken` validates claims with Zod instead of casting

**Plan said:** `return payload as unknown as SessionClaims;`, with `SessionClaims` as a hand-written type.

**What was wrong:** A token signed with the right secret but the wrong shape (no `role`, a `role` of `superuser`, no `iat`) passed verification and reached the caller typed as valid. `role` drives every authorization decision, and `shouldRefresh` does arithmetic on `iat`.

**What I did instead:** Per orchestrator instruction, the payload is parsed with a Zod schema: `sub` and `username` are non-empty strings, `role` ∈ scouter|lead|admin, and `iat` and `exp` are integers. `SessionClaims` is now `z.infer` of that schema, and its shape is unchanged. A mismatch throws `Error('session token claims are malformed')`, and the message carries no claim values. Only the five claims are returned, because Zod strips unknown keys. `algorithms: ['HS256']` stays pinned. I added tests that prove the negatives: another secret, an expired token (built with `SignJWT` and a past `exp`), an unsigned `alg: none` token (built with `jose`'s `UnsecuredJWT`, with a check that its signature segment is empty), a signed token missing `role`, a signed token with an unknown role, a signed token with no `iat`, and extra claims being stripped. Mutation check: returning the raw payload on a parse failure turned the three claim-shape tests red.

**Risk:** None to valid tokens. `issueToken` always sets all five claims.

---

## Task 1.11 — unknown usernames pay for a bcrypt comparison against a fixed dummy hash

**Plan said:** `if (!user) throw wrong;` before `verifyPassword`, so an unknown username returns without running bcrypt.

**What was wrong:** The message is the same for both failures, but the timing is not. A wrong password costs a cost-10 bcrypt round, about 50–100 ms here, and an unknown username costs nothing, so the response time reveals which usernames exist.

**What I did instead:** Per orchestrator instruction, `apps/server/src/auth/password.ts` exports `DUMMY_PASSWORD_HASH`, a hard-coded cost-10 bcrypt hash of 32 random bytes that were discarded after hashing. `login` always calls `verifyPassword(input.password, user?.password_hash ?? DUMMY_PASSWORD_HASH)` and throws the same `unauthenticated` error when either the user or the match is missing. I hard-coded the hash instead of generating it at module load because generating needs bcryptjs's random source. Once bundled into ESM, that source is unavailable (see Risk), and a load-time throw would take the whole function down. New `password.test.ts` asserts the dummy is a well-formed `$2a$10$` hash, that `getRounds` is 10, and that it verifies neither `''` nor `seedpass1`. `login.test.ts` spies on `verifyPassword` with a pass-through `vi.mock` and proves it is called once, with the dummy hash, for an unknown user. Mutation check: replacing the dummy with `''` turned that test red.

**Risk:** None from the dummy hash itself, since no password verifies against it. Separately, and not yet live: `bcryptjs` and `jose` are not in `scripts/build-function.mjs`'s `external` list. Nothing in `src/handler.ts`'s import graph reaches `login` yet, so the bundle contains neither today. Once task 1.12 mounts `login`, esbuild inlines bcryptjs into the ESM bundle. bcryptjs's `require("crypto")` then becomes esbuild's `__require` shim, which throws under ESM, and its WebCrypto fallback reads `self.crypto`, which Node does not define. I checked this with a throwaway esbuild bundle that used the same `platform: 'node'`, `format: 'esm'` settings. With bcryptjs inlined, `verifyPassword` worked, but `hashPassword` rejected with `Invalid string / salt: Not a string`. With `external: ['bcryptjs']`, `hashPassword` returned a 60-character hash. Task 1.12 should add `'bcryptjs'` and `'jose'` to `external`.

---

## Task 1.11 — `shouldRefresh` takes an optional clock

**Plan said:** `shouldRefresh(claims, config)`, reading `Date.now()` directly.

**What was wrong:** Nothing failed. But task 1.12's `callerFor` runs with an injected clock, and without this parameter it would have to recompute token age itself or read wall-clock time.

**What I did instead:** Per orchestrator instruction, the signature is `shouldRefresh(claims, config, now: () => number = Date.now)`, with `now` in milliseconds. The brief's two tests pass unchanged, and a new test drives the 7-day boundary with an injected clock.

**Risk:** None. The parameter is optional.

---

## Task 1.11 — `.js` extensions, `const` in the rate-limit test, formatting, and one lint fix

**Plan said:** The code blocks import `'../config'`, `'./token'` and similar with no extension. The first rate-limit test declares `let time = 0` and never reassigns it. The login test is written as in the brief.

**What was wrong:** `apps/server` is `"type": "module"` (BUILD-CONTEXT §6), so every relative import needs `.js`. `let` that is never reassigned breaks `prefer-const`, which typescript-eslint's recommended config turns on. My pass-through `vi.mock` first typed `importOriginal` with an inline type import and got the lint error: ``11:46  error  `import()` type annotations are forbidden  @typescript-eslint/consistent-type-imports``. `prettier --check` also flagged `apps/server/src/core/commands/login.test.ts` and `apps/server/src/repos/store.ts`.

**What I did instead:** I added `.js` to every relative import, used `const time = 0` in that one test, used `import type * as PasswordModule` for the mock's type, and ran prettier on only the files I touched. The brief's assertions are unchanged. On top of them, `rateLimit.test.ts` gained a `reset()` test, `login.test.ts` gained five tests (dummy-hash comparison, disabled account plus wrong password gives `unauthenticated`, a rate-limit bucket shared across case and whitespace variants, a rate-limited attempt skipping both the lookup and bcrypt, and identical messages for wrong password and unknown user), and `token.test.ts` gained the negatives listed above. The fake's `getUserByUsername` scans `usersByName.values()` for a case-insensitive exact match instead of reading the map by key, so it behaves like the Supabase store whatever key a test uses. `@types/bcryptjs` went into `devDependencies`, and `bcryptjs` and `jose` into `dependencies`. The resolved versions are bcryptjs 2.4.3, jose 5.10.0 and @types/bcryptjs 2.4.6.

**Risk:** None.

**Follow-up (task 1.11):** the plan's "rejects the wrong password with the same message as an unknown user" test created `wrong` and `missing` together and awaited them one at a time, so `missing` could reject while unobserved (`AppError: that username and password do not match`, an unhandled rejection that made `pnpm test` exit 1 on a timing-dependent basis once the dummy-hash compare was added); both calls now go through one `Promise.allSettled`, asserting the same `unauthenticated` code and identical messages.

---

## Task 1.12 — `bcryptjs` and `jose` are external to the function bundle

**Plan said:** Nothing. `scripts/build-function.mjs` keeps `external: ['hono', '@supabase/supabase-js', 'zod']`.

**What was wrong:** This task mounts `login`, which puts bcryptjs in `src/handler.ts`'s import graph for the first time. Inlined into the ESM bundle, bcryptjs's `require("crypto")` becomes esbuild's `__require` shim, which throws under ESM, and `hashPassword` rejects with `Invalid string / salt: Not a string` (found in task 1.11, see its entry).

**What I did instead:** Per orchestrator instruction, added `'bcryptjs'` and `'jose'` to `external`, with a comment saying why. After `pnpm --filter @frc/server build`, `api/index.js` carries `import bcrypt from "bcryptjs";` and `import { jwtVerify, SignJWT } from "jose";` rather than their source. A node one-liner that imports `bcryptjs` the same way from `apps/server` hashed and verified a throwaway string.

**Risk:** Both are `dependencies` of `@frc/server`, so Vercel's file tracing ships them from `node_modules` exactly as it already does for `hono`. It is not proven on a deployment until `develop` moves.

---

## Task 1.12 — `refreshToken` looks the user up by `claims.sub`, via a new `Store.getFullUser`

**Plan said:** `ctx.store.getUserByUsername(claims.username.toLowerCase())`, with the limiter keyed by `claims.username`.

**What was wrong:** Keyed by username, a token issued before an admin renamed a user resolves to whoever holds that username now. That is a session moving from one person to another. `Store` had no method returning a `StoredFullUser` by id (`getUser` returns only id, role and disabled_at). The `Store` doc comment says a task wanting a method not on the list has drifted from the plan.

**What I did instead:** Per orchestrator instruction, added `getFullUser(id: string): Promise<StoredFullUser | null>` to `Store`, implemented in `repos/store.ts` (select by `id`, throw on a PostgREST error) and in `test/fake-context.ts` (reads `usersById`, which the fake already declared but no method read). `refreshToken` verifies, then takes the limiter on `claims.username.toLowerCase()`, then calls `getFullUser(claims.sub)`. New `refreshToken.test.ts` refuses a disabled user (`forbidden`), an unknown `sub`, an expired token and a token signed with another secret (all `unauthenticated`). It proves a renamed user whose old name now belongs to someone else refreshes as the original user with the new name, that `getUserByUsername` is never called, that a rate-limited refresh skips the lookup, and that twenty badly signed tokens do not spend the user's bucket. Mutation check: switching back to `getUserByUsername(claims.username.toLowerCase())` turned six of the nine cases red, including the rename case.

**Risk:** `Store` grew by one method outside its "fixed now" list. No later task's list changes.

---

## Task 1.12 — `callerFor`: injected clock straight into `shouldRefresh`, strict Bearer parsing, database errors propagate

**Plan said:** `header.startsWith('Bearer ') ? header.slice(7) : ''`. It computed `stale` from the injected clock *and* called `shouldRefresh(claims, config)` on wall-clock time, OR-ing the two. It re-issued with `claims.username`. `supabaseStore().getUser` ignored the PostgREST `error`.

**What was wrong:** The duplicated staleness computation meant the injected clock could only force a refresh, never suppress one, so a test could not prove the clock is honoured. `startsWith('Bearer ')` rejects `bearer x`, although the scheme is case-insensitive (RFC 9110 §11.1). A swallowed PostgREST error made `getUser` return null during a database blip. That became a 401 "sign in again", and a client could discard a perfectly good token.

**What I did instead:** Per orchestrator instruction:
- `shouldRefresh(claims, config, options.now)` is the only staleness check.
- The header must match `/^bearer (\S+)$/i`: any case, exactly one space, one token.
- `StoredUser` carries no username, so the re-issued token uses **the claims' username**. Nothing authorizes on it.
- `getUser` throws on `error`, and `callerFor` lets it propagate, so the route answers 500.

The `store` parameter is typed `Pick<Store, 'getUser'>` in place of the brief's local `UserLookup` type. The brief's five tests pass. New tests cover:
- another secret, an expired token, and an empty `Bearer `
- scheme case, double space, tab, `Basic`, a bare token and trailing junk
- a clock set back to issue time suppressing the refresh
- the re-issued token's `sub`/role/username
- a throwing `getUser` rejecting

`store.test.ts` proves `getUser` and `getFullUser` throw on a PostgREST error. Mutation checks: dropping the disabled check turned four tests red across callerFor, RPC and both sync routes, and dropping the injected clock turned two red.

**Risk:** A renamed user's sliding token keeps the old `username` claim until the next login. It is informational only, but it keys `refreshToken`'s rate-limit bucket.

---

## Task 1.12 — `RegistryEntry` is a discriminated union; nothing fabricates a `service` caller

**Plan said:** One `RegistryEntry` type with `unauthenticated?: true` and `handler(caller, input, ctx, config)`. `rpc.ts` set `let caller: Caller = { kind: 'service', label: 'unauthenticated' }` to call `login`, and the registry wrapped both handlers as `(_caller, input, ctx, config) => login(input as never, ctx, config)`.

**What was wrong:** SPEC-FINAL §16.5 says of the `service` caller: "Nothing in v1 constructs one". The brief's `rpc.ts` constructed one on every login.

**What I did instead:** Per orchestrator instruction:
- `RegistryEntry = AuthenticatedEntry | UnauthenticatedEntry`.
  - `AuthenticatedEntry` keeps the brief's exact `handler(caller, input: never, ctx, config)` and `unauthenticated?: never`, so later rows fit unchanged.
  - `UnauthenticatedEntry` has `unauthenticated: true` and `handler(input: never, ctx, config)`, so `login` and `refreshToken` are registered as themselves.
- The registry tests keep all four brief cases. The service-caller loop passes four arguments, `(service, {} as never, {} as never, {} as never)`. The brief passed three, which does not typecheck against a four-parameter handler.
- `grep -rn "kind: 'service'" apps/server/src --include=*.ts | grep -v test` prints nothing.

**Risk:** The service-caller loop is vacuous until task 1.13 registers the first authenticated command. It iterates nothing today.

---

## Task 1.12 — authenticate before parsing, on RPC and sync routes; `rpcRoutes` takes an optional registry

**Plan said:** `rpc.ts` parsed the body first and returned 400 before looking at the token. `sync.ts` parsed first too, and derived its caller from the first operation's `author_user_id` through the `fallbackUserId` parameter.

**What was wrong:** An anonymous caller could learn the input schema from 400 messages, and a no-token request did not get 401 regardless of its body.

**What I did instead:** Per orchestrator instruction, an authenticated RPC route calls `callerFor` first and returns 401 before reading the body. I applied the same order to `/sync/push` and `/sync/pull`, which was not in the instruction, for consistency.
- `SyncRouteDeps.callerFor` is `(request: Request) => Promise<CallerResult>`, and `fallbackUserId` is deleted.
- A non-null `refreshedToken` sets `X-Refreshed-Token` on both sync routes.
- The sync 401 message changed from `no caller` to `sign in again`, the same as RPC.
- `rpcRoutes(ctx, config, registry = REGISTRY)` takes an optional registry. This was the smallest honest way to prove the bearer check on an RPC route with only two unauthenticated entries registered. `rpc.test.ts` mounts a test-only `whoami` entry through the real `rpcRoutes` and the real `callerFor`.
- `composition.ts` exports `mountedRoutes(ctx, config)`, which `buildApp` uses, so `app.test.ts` drives the deployed wiring over the fake store instead of a copy of it.
- The walking-skeleton `callerFor` and its comment are deleted.
- Status map, error body and the 500 body `{code:'invalid', message:'that did not work'}` are verbatim from the brief. The brief's `STATUS: Record<string, number>` is typed `Record<string, ContentfulStatusCode>`, because Hono's `c.json` does not accept a bare `number`.

**Risk:** An unexpected exception in a sync route (a database error in `callerFor`, or `syncPull`'s `not-found` AppError, which that route has never mapped) reaches Hono's default handler. That handler answers `500` with a plain-text body, not the JSON error shape.

---

## Task 1.12 — `loginInput`, `loginOutput`, `refreshTokenInput` live in `packages/shared/src/api/auth.ts`

**Plan said:** Each schema is exported from its use case's module in `core/`, with `refreshTokenInput` defined in `refreshToken.ts` with its own `import { z } from 'zod'`.

**What was wrong:** Nothing failed, but the brief's own "Where the schemas live" paragraph and §16.1 make `packages/shared` the single validation source. Schemas defined in `apps/server` cannot be imported by the client.

**What I did instead:** Per orchestrator instruction, all three schemas and `LoginInput`/`LoginOutput`/`RefreshTokenInput` are defined in `packages/shared/src/api/auth.ts` (zod only, extensionless) and exported from `packages/shared/src/index.ts`. `login.ts` and `refreshToken.ts` import them and re-export them, so `import { loginInput } from './login.js'` keeps working. New `packages/shared/src/api/auth.test.ts` checks the input rules and that `loginOutput` strips a `password_hash`. The browser-safe test covers the new file automatically.

**Risk:** None.

---

## Task 1.12 — the smoke suite logs in with a per-run bcrypt password

**Plan said:** "update the smoke suite from task 1.9 to log in first and send a bearer on both sync calls". The CI user was inserted with `password_hash: 'x'`.

**What was wrong:** No password verifies against `'x'`, so the CI user could not log in.

**What I did instead:** Per orchestrator instruction:
- The suite generates `crypto.randomUUID()` as the password and stores `await bcrypt.hash(pw, 10)`.
- It throws if that user insert fails, which it previously ignored.
- It logs in through `POST ${base}/api/login` in `beforeAll`, throwing with the HTTP status only on failure, and sends `Authorization: Bearer <token>` on every sync call.
- Three new cases: pull with no token → 401, push with no token → 401, login with a wrong password → 401.
- Neither the password nor the token is printed.

I ran the suite against a local dev server on the dev database, through a scratchpad wrapper that loads `apps/server/.env` with dotenv, refuses unless `SUPABASE_URL` contains `oqvoqddoizhhwvjwejtm`, and passes the key to a spawned vitest only through its environment.

**Risk:** Not yet run against preview. Preview still serves the old code until `develop` moves. The wrong-password case spends one of the CI user's ten rate-limit attempts, which is harmless for a per-run user.

---

## Task 1.12 — `.js` extensions, formatting, a shared test-token helper

**Plan said:** The code blocks import `'../config'`, `'./token'` and similar, with no extension. `callerFor.test.ts` builds its own tokens with `issueToken` only.

**What was wrong:** `apps/server` is `"type": "module"` (BUILD-CONTEXT §6). The expired-token and over-seven-days negatives need a token with a chosen `iat`/`exp`, which `issueToken` cannot mint.

**What I did instead:**
- Every relative import in `apps/server/src` carries `.js`.
- Added `apps/server/src/test/tokens.ts`, whose `tokenAt(user, config, { issuedDaysAgo, expiresInDays })` signs a session-shaped HS256 token with explicit times. `callerFor.test.ts`, `refreshToken.test.ts`, `rpc.test.ts` and `app.test.ts` use it.
- Ran prettier on only the touched files.

**Risk:** None.

---

## Task 1.12 — the seed's password hash was not a hash of seedpass1

**Plan said:** nothing directly — this was reported as a pre-existing bug. `packages/db/src/seed/fixtures.ts` set `SEED.passwordHash` to `'$2a$10$Vv3nJXsX0G2xh0m0Y6mCkuJ0iH5wLZ0Q0y2xJ4bqz2s5g3lI1nqhK'`, commented as the bcrypt hash of `seedpass1` at cost 10 (from commit `e8da097`, written before login existed).

**What was wrong:** it is not a hash of `seedpass1`. `bcrypt.compare('seedpass1', '$2a$10$Vv3nJXsX0G2xh0m0Y6mCkuJ0iH5wLZ0Q0y2xJ4bqz2s5g3lI1nqhK')` resolves `false` — verified directly with `bcryptjs` before touching anything. The hash was hand-typed and nothing caught it because `/api/login` did not exist until this phase. All three seeded users (`seed_scouter`, `seed_lead`, `seed_admin`) were unable to log in with the documented dev password.

**What I did instead:**
- Generated a real cost-10 `bcryptjs` hash of `seedpass1` from `apps/server` (`node --input-type=module -e "import b from 'bcryptjs'; console.log(await b.hash('seedpass1', 10))"`) and confirmed `bcrypt.compare('seedpass1', <new hash>)` resolves `true` before writing it anywhere.
- Replaced `SEED.passwordHash` in `packages/db/src/seed/fixtures.ts` with the real hash; the comment above it was already accurate wording, so it was left as-is.
- Added `packages/db/src/seed/fixtures.test.ts`: asserts `SEED.passwordHash` matches `/^\$2[ab]\$10\$/` and that `bcrypt.compare('seedpass1', SEED.passwordHash)` resolves `true`. Real `bcrypt.compare` output: `true`.
- Added `bcryptjs@^2.4.3` and `@types/bcryptjs@^2.4.6` as devDependencies of `packages/db` — same versions `apps/server` already carries — and ran `pnpm install` at the repo root. Installed cleanly, no version conflicts. The test lives in `packages/db`, next to the fixture; `apps/server` was not touched.
- Confirmed `apps/server/.env`'s `SUPABASE_URL` contains the dev project ref (`oqvoqddoizhhwvjwejtm`), not the production one (`ezrgtroyofuxkkktnino`), via an `awk` field check that prints only `true`/`false` — no value was echoed. Then ran `pnpm seed` from the repo root, which upserted the dev database with the corrected hash. Output: `dev database seeded`.
- Proved it against the running local server (`http://localhost:3000`, not started or stopped by this task): `POST /api/login` for `seed_scouter`, `seed_lead`, `seed_admin` with password `seedpass1` all returned `200` with `user.role` of `scouter`, `lead`, `admin` respectively. No token was printed.
- `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check` all green: 41 test files / 286 tests passed (including the new fixture test), typecheck clean across all 4 packages, lint clean, format:check clean.
- Nothing under `apps/server/src` was touched, so no bundle rebuild was needed.

**Risk:** Any environment seeded before this fix (any dev database, or a CI/local run that ran `pnpm seed` against dev prior to this change) has the old, non-matching hash sitting in its `users` rows and those seed logins will still fail until `pnpm seed` is re-run there. This does not apply to production — production is never seeded (SPEC-FINAL 19.4) and was not touched or contacted by this task.

---

## Task 1.13 — the user wire schemas live in packages/shared, with the password rule

**Plan said:** define `createUserInput`, the other inputs and the `PublicUser` type in `apps/server/src/core/commands/users.ts`, with `MIN_PASSWORD_LENGTH` imported from `apps/server/src/auth/password.ts`.

**What was wrong:** Nothing failed. But the client half (1.15–1.17) must validate with the same objects (SPEC-FINAL 16.1), and it cannot import from `apps/server`. A schema in shared cannot import the server's `MIN_PASSWORD_LENGTH` either.

**What I did instead:** Per orchestrator instruction:
- Every input and output schema is in the new `packages/shared/src/api/users.ts` (zod only, extensionless), exported from `packages/shared/src/index.ts`. That covers `publicUser`, `createUserInput`, `setUserRoleInput`, `resetPasswordInput`, `disableUserInput`, `changeOwnPasswordInput`, `listUsersInput`, `listUsersOutput`, their types, `PublicUser`, `usernameSchema`, `passwordSchema`, `userRoleSchema`, `USERNAME_PATTERN`, `LIST_USERS_DEFAULT_LIMIT` and `LIST_USERS_MAX_LIMIT`.
- The field schemas are named `usernameSchema`/`passwordSchema`/`userRoleSchema`, not the plan's local `password`, because a bare `password` or `username` exported from the shared index would collide with later exports.
- `MIN_PASSWORD_LENGTH` moved to shared. `auth/password.ts` re-exports it, so `import { MIN_PASSWORD_LENGTH } from '../auth/password.js'` still works.
- `users.ts` and `listUsers.ts` import the schemas and re-export them.
- Input types are `z.input<…>`, not `z.infer`, so `must_change` and `include_disabled` stay optional for callers. `user_id` is `z.string().min(1)`, not `.uuid()`, because the fake's fixture ids (`u-scouter`) are not uuids. `publicUser.id` is `z.string()` for the same reason.
- New `packages/shared/src/api/users.test.ts`. The browser-safe test covers the new file automatically.

**Risk:** None. `publicUser` is a non-strict `z.object`, so the RPC layer's `entry.output.parse(output)` strips a `password_hash` even if one ever reached it. The shared test proves that.

---

## Task 1.13 — validation throws AppError('invalid'), and the use cases validate their own input

**Plan said:** `const parsed = createUserInput.parse(input);`

**What was wrong:** `.parse` throws a raw `ZodError`. That reaches rpc.ts's catch as a non-AppError, which returns a 500 and `console.error`s it. The brief's own test expects `{ code: 'invalid' }` for a short password.

**What I did instead:** Per orchestrator instruction, a `parseInput(schema, input)` helper, exported from `users.ts` and reused by `listUsers.ts`. It calls `safeParse` and throws `AppError('invalid', '<path>: <message>; …')`. Zod's issue messages name the field and the rule, never the received string, so no password is echoed; a test proves it for `resetPassword`. The use cases re-validate even though the RPC edge already has, because the CLI transport calls them directly. The order is always authorize, then validate: a lead with a malformed body still gets `forbidden`, and a service caller gets `forbidden` before anything touches ctx.

**Risk:** None.

---

## Task 1.13 — changeOwnPassword: strict input, current password, per-user rate limit

**Plan said:** "`changeOwnPassword` … an `isUser` check that operates only on `caller.userId`". There was no rate limit, the input was not strict, and nothing was said about a wrong current password.

**What was wrong:** Nothing failed. But a non-strict schema silently drops a `user_id`, which hides a client bug. Without a limit, a stolen token could brute-force the account's current password through this endpoint.

**What I did instead:** Per orchestrator instruction:
- `changeOwnPasswordInput` is `.strict()`, so an extra `user_id` is `invalid`.
- The steps run in this order:
  1. A service caller is rejected with `forbidden` before anything else.
  2. The input is parsed.
  3. `changeOwnPasswordLimiter.take(caller.userId)` runs. It is a new `makeRateLimiter({ limit: 10, windowMs: 5 * 60_000 })`, exported with `reset()`. Over the limit returns `rate-limited`.
  4. `getFullUser(caller.userId)` runs. A missing user is `unauthenticated`; a disabled one is `forbidden`.
  5. `verifyPassword(current_password)` runs. A wrong password is `unauthenticated`.
  6. The new hash is written and `must_change_password` is set to `false`.
- The limit is spent after parsing, so a malformed request costs no attempt and no bcrypt round.
- The tests cover: acts on the caller only; a user_id is rejected; a wrong current password changes nothing; the 11th attempt is rate-limited even with the right password; another user's bucket is unaffected; a disabled account is refused.

**Risk:** `unauthenticated` maps to HTTP 401, the same status as a dead token. See the report's section 5: the client must not treat this 401 as "sign in again".

---

## Task 1.13 — username rules, and a unique violation from the store is a conflict

**Plan said:** `username: z.string().min(1).max(40)`, then `.trim().toLowerCase()`, then a `getUserByUsername` pre-check that throws `conflict`.

**What was wrong:** Nothing failed. But the pre-check alone races: two admins creating the same name can both pass it, and the loser's insert then fails on `users_username_lower_idx` as a raw error, which is a 500. The plan's schema also accepted `*` and `%`, and `*` cannot be matched literally by login's `ilike` lookup, because PostgREST rewrites it to `%` (see `escapeLikePattern`). It also accepted whitespace and control characters.

**What I did instead:** Per orchestrator instruction:
- `usernameSchema` trims and lowercases, then requires `/^[\p{L}\p{N}._-]{1,40}$/u`. That admits any script's letters (Hebrew is tested) plus digits, `.`, `_` and `-`, and rejects `*`, `%`, whitespace and control characters as `invalid`.
- The pre-check stays, for the friendly message. Every write to `users` also goes through `writeUser()`, which turns an error with `code === '23505'` into `AppError('conflict')` and rethrows anything else untouched.
- The Supabase store's user methods throw through a new exported `dbError(error)`. It keeps `message` and `code` only, **never `details`**, because a failed write's `details` can contain the whole row, hash included, and rpc.ts logs non-AppErrors.
- The fake's `insertUser`/`updateUser` throw the same shaped error (`code: '23505'`, the constraint name in the message) when another row holds the lowercased name.
- Tested by stubbing `getUserByUsername` to return null so the pre-check misses and the fake's index fires. Also tested: another store error passes through, and the Supabase store keeps the code and drops the details.
- No use case in this task changes a username, so the only 23505 path today is `createUser`. `writeUser` wraps every `updateUser` call anyway, so a later rename gets the mapping for free.

**Risk:** Usernames are not NFC-normalized, to stay byte-consistent with `login`'s trim-and-lowercase. A decomposed accented Latin letter (letter plus combining mark) is therefore rejected, because `\p{M}` is not in the class. Hebrew without niqqud is unaffected.

---

## Task 1.13 — the last-admin guard also covers role changes

**Plan said:** only `disableUser` "refuses to disable the last enabled admin".

**What was wrong:** Demoting the last admin locks the install out just as surely as disabling them.

**What I did instead:** Per orchestrator instruction, `assertNotLastEnabledAdmin` runs in both `setUserRole` (when an enabled admin is given another role) and `disableUser`. It uses `countEnabledAdmins()`, which is now implemented in both stores. A disabled admin does not count. Tests: demoting the last admin is `invalid` and the role is unchanged; demoting is allowed once another enabled admin exists; a disabled extra admin does not satisfy the guard. A same-role `setUserRole` and a repeat `disableUser` are no-ops that return the user, and the latter keeps the original `disabled_at`.

**Risk:** The guard is check-then-write, not a database constraint. Two admins demoting or disabling each other at the same instant could both pass it. With about 11 users and one or two admins, that is accepted. Closing it would need a trigger.

---

## Task 1.13 — the fake has one source of truth for users

**Plan said:** "Modify … `apps/server/src/test/fake-context.ts`". The fake had a `users` map (`StoredUser`, read by `getUser` and so by `callerFor`) and separate `usersById`/`usersByName` maps (`StoredFullUser`), none of them linked.

**What was wrong:** A `disableUser` or `setUserRole` through the fake store would write `usersById`, while `callerFor` read `users`. So the "disabling takes effect on the next request" guarantee could not be tested at all. The brief's tests also read `ctx.usersById.get('u-scouter')` and disable `u-admin`, neither of which existed as a full record.

**What I did instead:** Per orchestrator instruction, with the least invasive shape:
- `usersById` (a plain `Map`) is the only store of users. It is seeded with full records for `u-scouter`, `u-lead` and the new `u-admin`: usernames `scouter`/`lead`/`admin`, and `password_hash` = `DUMMY_PASSWORD_HASH`, against which nothing verifies.
- `users` is now a `UserView extends Map<string, StoredUser>` over it. `get` projects the full record down to a StoredUser. `set(id, { id, role, disabled_at })` merges into an existing record, or creates a placeholder whose username is its id. So every existing `ctx.users.set(...)` call, and 1.14's, keeps working unchanged.
- `usersByName` is a `UsersByNameView` over the same map, keyed by lowercased username. `set(name, user)` stores the user under its own id.
- The field types on `FakeContext` are unchanged.
- The fake's `getUserByUsername` iterates `usersById`.
- New `USER_COLUMNS` check: like `MATCH_COLUMNS`, a phantom column such as `email` fails in the fake the way PostgREST would.
- Two integration-style tests in `users.test.ts` run `callerFor` over the same fake store: an admin disables a user, and that user's still validly signed token then gets `caller === null`; after a role change, the old token's caller carries the new role.

**Risk:** Low. Every existing suite passes unchanged. A test that expected `u-admin` to be unknown, or `usersById` to start empty, would now fail; none exists.

---

## Task 1.13 — Store.listUsers takes a keyset `after` and returns no hash; ordered by `username`

**Plan said:** `context.ts` declared `listUsers(options: { includeDisabled; limit; cursor?: string }): Promise<StoredFullUser[]>`, and said that interface is fixed. The brief said the query must "select an explicit column list that omits `password_hash`". The orchestrator asked for ordering by `lower(username)` then `id`.

**What was wrong:** A select without `password_hash` cannot honestly return `StoredFullUser[]`. The type would promise a field that is not there. PostgREST can order only by a column, not by the expression `lower(username)`, unless a migration adds a generated column or a view.

**What I did instead:**
- New `StoredPublicUser = Omit<StoredFullUser, 'password_hash'>` in `context.ts`, which `listUsers` returns. `toPublicUser` takes a `StoredPublicUser`; a `StoredFullUser` is assignable to it.
- The opaque cursor stays in the use case, as `syncPull`'s does: base64url of UTF-8 JSON (`btoa` throws on a Hebrew username). The store receives the decoded `after?: { username; id }`.
- The Supabase store selects `id, username, full_name, role, must_change_password, disabled_at, created_at`. It adds `.is('disabled_at', null)` unless asked, and `.gt('username', after.username)`, then `.order('username').order('id').limit(n)`.
- It orders by the `username` column, not `lower(username)`. Every write path now stores the name lowercased, so the two agree for every row the app creates. Keyset on `username` alone is exact because the unique index on `lower(username)` makes `username` itself unique. Ordering and `gt` use the same collation, so pages have no gaps or repeats. The fake orders by `(lower(username), id)` with a tuple comparison.
- `limit` defaults to 50. A larger request is **clamped** to 200, not rejected, because `next_cursor` already says there is more. `limit < 1` is `invalid`. The use case asks the store for `limit + 1` rows, so the last page never comes back empty with a stale cursor.
- Tests: two pages with no duplicate and no gap; an evenly dividing count ends with no empty page; a cursor that ends on a Hebrew name; `include_disabled`; `JSON.stringify(result)` contains no `$2`, and neither do the store's rows; scouter, lead, admin and service can all call it; the default and the clamp.
- Supabase-store unit tests (recording chain) cover the column list, the filters, the order, the limit, and `countEnabledAdmins`.

**Risk:** A legacy row with an uppercase username, inserted outside the app, would sort by its raw case. Pagination would still be gap-free, and the order would only look slightly off.

---

## Task 1.13 — `.js` extensions, a global `crypto`, formatting, registry, HTTP tests

**Plan said:** the test and implementation snippets import `'../../auth/password'`, `'./users'` and `'../context'` with no extension. The registry test lists eight names. The brief gave no HTTP-level test.

**What was wrong:** `apps/server` is `"type": "module"` (BUILD-CONTEXT §6). The brief's test lines exceed prettier's 100-column width.

**What I did instead:**
- Every relative import in the new server files carries `.js`.
- `crypto.randomUUID()` is the Node 22 global; nothing is imported.
- Prettier was run on only the touched files, which reflowed the brief's test without changing an assertion.
- All six entries are registered in `REGISTRY` with their shared schemas; each output is `publicUser` or `listUsersOutput`.
- `rpc.test.ts`:
  - The brittle test now expects the eight names.
  - A new case asserts there are exactly five authenticated commands, so the service-rejection loop can no longer pass vacuously.
- `app.test.ts` tests `POST /api/createUser` through `mountedRoutes` and the fake store:
  - a lead's valid bearer gets 403 `forbidden` and nothing is created;
  - no bearer gets 401;
  - an admin gets 200, and the body contains neither `password_hash` nor `$2`;
  - a case-variant duplicate gets 409.
- The two "other 59 methods" comments in `repos/store.ts` and `test/fake-context.ts` now say "remaining", since the count changed.

**Risk:** None.

---

## Task 1.13 — a wrong current password is 400, not 401

**Plan said:** nothing; the first 1.13 pass, per the orchestrator's earlier instruction, made a wrong `current_password` in `changeOwnPassword` throw `AppError('unauthenticated')`. **What was wrong:** `unauthenticated` maps to HTTP 401, which the client half must be able to read as exactly "your token is dead, sign in again" — a mistyped current password would have ended a good session. **What I did instead:** Per orchestrator decision, a wrong current password now throws `AppError('invalid', 'the current password is not right')` (HTTP 400). The missing-self case stays `unauthenticated`, because that token really is no good. `users.test.ts` now expects `invalid` for the wrong-password and rate-limit-warmup cases, and `app.test.ts` proves `POST /api/changeOwnPassword` with a valid bearer and a wrong current password answers 400 `{"error":{"code":"invalid",…}}`. The earlier 1.13 changeOwnPassword entry's step 5 and Risk line are superseded by this one. **Risk:** None; the rate limit per user still applies to wrong guesses.
