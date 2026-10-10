# Contract for every Phase 1 E implementer subagent

Repo: `C:\dev\frc-scouting`, branch `feat/phase-1e` (already checked out — do not switch,
create or push branches; do not commit — the orchestrator commits). Use Git Bash syntax for
every command (the Bash tool). Single working copy: no worktrees.

## Read first (binding)
1. `docs/ops/BUILD-CONTEXT.md` — all of it. §7 architecture rules, §10 verification, §11
   `DEVIATIONS.md` format, **§12 UI standard in full** (shadcn/ui from `components/ui`, no
   placeholder or marketing copy, screenshots via `pnpm --filter @frc/client e2e` and
   `e2e/shoot.ts` at 1440 and 375 px, in both themes the app offers — `light` and `outdoor`
   (`[data-theme]` in `apps/client/src/styles/theme.css`) — with realistic fixture data).
2. Your task brief (path given in the dispatch) — your requirements, exact values verbatim.
3. The design folder(s) named in the dispatch: README.md, the final PNGs (look at them with
   the Read tool) and the `.html` source where you need exact sizes. `docs/design/THEME.md`
   "Locked components" for every part you build.
4. The files the brief touches, and the existing primitives in `apps/client/src/components/ui/`.

## Stale names in the plan (the plan predates the redesign build)
`components/entry` **does not exist**. Map the plan's names to the code:
- `CounterControl` → `Counter` (`components/ui/counter.tsx`)
- `ToggleField` → `Switch` (`components/ui/switch.tsx`)
- `ChoiceGroup` → `OptionButtons` (`components/ui/option-buttons.tsx`)
- `StickyActionBar` → `ActionBar`; `Badge` → `Tag`; `Notice` → `components/ui/notice`;
  `SectionHeader` → whatever the code uses for a section title (search), or a heading element.
A new shared primitive goes in `components/ui/` beside its siblings (kebab-case file name),
not in a new `components/entry/` folder. Log each such mapping you rely on in `DEVIATIONS.md`.

## Rules that bite
- **UF.18:** nothing a `FieldInput` draws may switch on the window's width (`sm:` … `2xl:`,
  `max-*:`). Lay out by container width (`@container` + `@lg:` etc.), as `option-buttons.tsx`
  does. `FieldInput.test.tsx` already enforces this for existing types — extend it to yours.
- Touch targets ≥ 48 × 48 px, ≥ 8 px apart; `dir="auto"` on every label and free-text input.
- Motion respects `prefers-reduced-motion`. `styles/classes.test.ts` forbids palette colours,
  retired tokens and unguarded motion classes — colours come from theme tokens only. Any new
  colour token gets a value in **both** `light` and `outdoor`, and outdoor values must meet
  WCAG AA (4.5:1 text, 3:1 UI boundaries) in sunlight-contrast terms like the existing ones.
- Initial JS bundle ≤ 212 KB gzip: run `pnpm build && pnpm bundle:check` at the end. Heavy,
  rarely-used UI (a map pop-up) should be lazy-loaded if it threatens the budget.
- `packages/shared` is browser-safe. The client never imports `@supabase/supabase-js`.
- TDD: write the brief's tests first, run them, see them fail for the right reason, then
  implement.
- **Prove the negatives** named in your dispatch with a test each.
- `docs/plans/DEVIATIONS.md` is **append-only** (BUILD-CONTEXT §11). Append one entry per
  departure from the plan's literal steps, including trivial ones and rejected alternatives,
  with the real error text where something failed. Never edit existing entries.
- Do not do the next task's work.

## This machine is throttled (read before running any test)
The CPU is pinned at ~17 % of nominal today (a bcrypt compare takes ~1.7 s). The stock
`pnpm test` takes ~25–40 min and fails ~200+ tests **only by timeout** on an unchanged tree.
So, for verification only:
- Single files while iterating: `pnpm --filter @frc/client exec vitest run --config node_modules/.cache/slow/vitest.slow.config.ts <paths>`
  (git-ignored wrapper: the real client config plus 180 s test timeouts and a 30 s Testing
  Library `asyncUtilTimeout`). For shared/server: `pnpm vitest run --testTimeout=180000 <paths>`.
- The full suite: `bash node_modules/.cache/slowtest.sh <an empty dir in the scratchpad>` —
  the same files as `pnpm test`, with those waits; it prints the counts. Run it once, at the end.
- **Never** change a committed config, timeout or test to cope with the slowness, and never
  add `asyncUtilTimeout`/`testTimeout` to the repo. A test that is only slow is not your bug;
  a test that fails for any reason other than a timeout is.
- Run long commands in the background and wait for them; keep e2e runs to the specs you touch
  (`pnpm --filter @frc/client e2e <spec>`), with a generous timeout.

## Before you report
Run, from the repo root, and read the output:
```
bash node_modules/.cache/slowtest.sh <scratch dir>     # stands in for `pnpm test`, see above
pnpm typecheck && pnpm lint && pnpm format:check && pnpm docs:check
pnpm build && pnpm bundle:check
pnpm --filter @frc/client e2e <the specs you added or changed>
```
(`pnpm format` fixes formatting.) Look at every screenshot you produced with the Read tool and
compare it against the final design image at the same width. Fix what differs, or log why.

## Report
Write the full report to the report-file path given in the dispatch, with exactly:
1. **Files created/modified** — paths only.
2. **The interface later tasks depend on** — exported names and signatures.
3. **Test output** — verbatim summary lines (Test Files / Tests counts) of each command above.
4. **Deviations** — the entries you appended to `DEVIATIONS.md` (titles).
5. **Screens** — each screenshot file, its route/state, and how it compares with the design
   (what matches, what falls short and why).
6. **Anything you noticed that affects a later task** — even outside your scope. This is the
   most valuable line.

Return to the orchestrator only: status (DONE / DONE_WITH_CONCERNS / BLOCKED), a one-line test
summary, and concerns. Never ask the user anything — make the call and log it.
