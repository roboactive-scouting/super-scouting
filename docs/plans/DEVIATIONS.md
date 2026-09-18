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
