# Build context — binding rules for every build chat

**This file is binding.** A build chat reads it before touching anything, and follows
it even where it contradicts a skill, a habit, or a plausible-looking shortcut.

It exists because every fact below was learned the expensive way — a failed
deployment, a leaked key, an evening lost to a 500 with no message. None of it is
guessable from the code. Re-deriving any of it costs hours.

**When a fact here changes, change it here.** This file is the one copy. A prompt that
restates a rule instead of pointing at this file will go stale the first time the rule
moves, and nothing will catch it.

---

## 1. The machine

- Repo: `C:\dev\frc-scouting`. Moved out of OneDrive — nothing under OneDrive is live.
- Windows 11. **Every command runs in Git Bash** (`C:\Program Files\Git\bin\bash.exe`).
  The terminal panel opens **PowerShell by default** — check before assuming.
  **Never tell the user to run bare `bash`**; on Windows 11 that can hit WSL.
- Node **v22.12.0**, pnpm **9.12.3**, `gh` **2.97.0** (authenticated). `openssl`
  available in Git Bash.
- **Avast intercepts HTTPS on this machine. Git Bash's own `curl` has no CA bundle and
  fails every TLS handshake** with "unable to get local issuer certificate". Use
  `node -e "fetch(...)"` or `/c/Windows/System32/curl.exe`. A `curl` failure here is
  the shell's, not the server's.
- **Do not install Docker.** Disk is tight. `supabase db dump` wants it; that is a
  documented limitation, not a task to solve.
- No local `supabase` binary. Always `npx -y supabase@latest`.
- **The agent's Bash tool is not the user's terminal**, even though both see the same
  project directory. Never conclude from the agent's environment that a global tool
  exists on the user's machine — that has already been wrong once. The Code-tab "Run"
  button on a bash block executes in the **agent's** environment, not the user's, which
  matters for anything that must never run through an agent.

## 2. Identifiers — all non-secret

| Thing | Value |
|---|---|
| GitHub | `roboactive-scouting/super-scouting`, public, default branch `main` |
| Supabase **dev** | `frc-scouting-dev`, ref `oqvoqddoizhhwvjwejtm`, `eu-central-1` |
| Supabase **prod** | `frc-scouting-prod`, ref `ezrgtroyofuxkkktnino`, `eu-central-1` |
| Vercel scope | `roboactive` |
| Vercel projects | `frc-scouting-client`, `frc-scouting-server` |
| Client Production | `https://frc-scouting-client.vercel.app` |
| Client Preview | `https://frc-scouting-client-git-develop-roboactive.vercel.app` |
| Server Production | `https://frc-scouting-server.vercel.app` |
| Server Preview | `https://frc-scouting-server-git-develop-roboactive.vercel.app` |

Preview URLs are the **stable `develop` branch aliases**, never per-deployment URLs.
Per-deployment URLs go stale on the next push and must not be written into a secret,
a config file or a workflow.

## 3. Secrets

**Never print a secret, never ask the user for one, never write one into a file, a
commit message, or a chat message.** The only things said aloud are the two Supabase
refs, the Vercel scope, and the four URLs above.

**Never `source` or `.` an `.env` file.** Sourcing executes it as a shell script, and
an unquoted value lands verbatim in a "command not found" error. That leaked the dev
service-role key once already and forced a rotation. If a process needs the server
environment, let it read the file itself — `packages/db/src/seed/run.ts` shows the
dotenv pattern, including the guard that refuses to run against production — or parse
it explicitly. **Never put a key on a command line.**

To inspect an `.env` without exposing values:

```bash
awk -F'=' '{v=substr($0, index($0,"=")+1); print $1 "=" (length(v) ? "<set, " length(v) " chars>" : "<EMPTY>")}' apps/server/.env
```

`VITE_DEVICE_WIPE_CODE` is `WIPE2096` and is **explicitly not a secret** — it ships in
the client bundle and is an accident guard, not a security control (SPEC-FINAL §9.9).

The seed's three dev users are `seed_scouter`, `seed_lead`, `seed_admin`, password
**`seedpass1`** (bcrypt cost 10), committed in `packages/db/src/seed/fixtures.ts`. Dev
only, and deliberately not a secret.

## 4. Environments and the production boundary

1. **CI never touches the production Supabase project.** `ezrgtroyofuxkkktnino` appears
   in exactly two files — `ENVIRONMENT.md` and `SETUP.md` — and in Vercel's Production
   scope. Never in a workflow, a script, or a GitHub secret. **Production has no GitHub
   secret at all, and that absence is deliberate.**
2. **Production migrations are applied by hand**, by the user, as one deliberate
   command. Never scripted, never in CI, never by an agent.
3. **Preview, local and CI always point at the dev project.** Never production.
4. The Supabase personal access token is account-wide. Nothing about it distinguishes
   dev from prod — **the ref is the only boundary**.

`AUTH_JWT_SECRET`, `AUTH_TOKEN_TTL_DAYS` (30) and `AUTH_TOKEN_REFRESH_AFTER_DAYS` (7)
are set in all three environments: local `apps/server/.env`, Vercel Preview, Vercel
Production. **All three `AUTH_JWT_SECRET` values are different, on purpose** — a token
minted locally will not validate against preview, and a preview token will not
validate against production. That is the design. Do not "fix" it.

## 5. Vercel — things that will waste a day if you do not know them

- **Only `main` and `develop` deploy.** Each project has an Ignored Build Step
  override:
  ```bash
  if [ "$VERCEL_GIT_COMMIT_REF" = "main" ] || [ "$VERCEL_GIT_COMMIT_REF" = "develop" ]; then exit 1; else exit 0; fi
  ```
  **The exit codes are inverted and this is not a typo: `exit 1` builds, `exit 0`
  skips.** Getting them the wrong way round silently disables the two branches that
  matter. Widening this also requires widening CORS — `ALLOWED_ORIGIN` is a **single
  origin**, so a preview from any other branch fails CORS and presents as a dead API.
- Pushing the same commit to a topic branch *and* `develop` produces a deployment for
  each. **GitHub commit statuses attach to a SHA, not a branch**, so the skipped
  topic-branch deployment's "Canceled by Ignored Build Step" label can appear on a
  commit that `develop` really did build. Verify by fingerprinting the deployed bundle
  for the commit SHA, not by reading the status label.
- **Preview Deployment Protection is off on both projects and must stay off.**
  Re-enabling it returns `302` to `vercel.com/sso-api` for every caller without a
  browser session, which kills the CI smoke suite, the keep-alive workflow, and every
  preview client→server call — all three presenting as a broken API.
- **`apps/server/public/` is an intentionally empty committed directory.** The "Other"
  framework preset fails the deployment without a static output directory. Do not
  delete it.
- **`apps/server/vercel.json` carries no `functions.runtime` key.** Vercel parses
  `functions[].runtime` as a community runtime package name and demands an explicit
  version; `nodejs22.x` is rejected with `Function Runtimes must have a valid version`.
  The file holds only the catch-all rewrite.
- **Node 22 is pinned by `engines` in `apps/client/package.json` and
  `apps/server/package.json`**, plus the dashboard setting. Vercel reads the
  `package.json` at the project's **Root Directory**, not the repository root, and
  defaults new projects to whatever its current default is. `.npmrc` has
  `engine-strict=true`, so a mismatch fails `pnpm install` outright.
- Vercel's Root Directory browser reads the repository's **default branch**, not any
  pushed branch.

## 6. The server function is bundled, not transpiled

`apps/server/src/handler.ts` is the source. `apps/server/scripts/build-function.mjs`
bundles it — inlining every relative import and `@frc/shared` — into
`apps/server/api/index.js`, **which is committed to git deliberately**: Vercel's Node
function builder only ever compiles what is checked into `api/`, and never sees a
build script's output.

**Any change under `apps/server/src/**` requires `pnpm --filter @frc/server build` and
the regenerated `apps/server/api/index.js` committed in the same diff**, or
`apps/server/src/bundle-drift.test.ts` fails CI.

Related: `apps/server` is `"type": "module"`, and **every relative import carries an
explicit `.js` extension**. `tsconfig.base.json` sets `moduleResolution: "Bundler"`,
under which a `.js` specifier resolves to the sibling `.ts` file, so local tooling is
unaffected. Without the extension the deployed function dies at module load with
`ERR_MODULE_NOT_FOUND` — which is indistinguishable from a bad environment variable,
because both surface as a plain-text `500 FUNCTION_INVOCATION_FAILED` with no body.
Only the Vercel runtime log separates them.

## 7. Architecture rules that a task can silently break

- **`packages/shared` is browser-safe**: no Node built-ins, no `@supabase/supabase-js`,
  no `process.env`. Enforced by an ESLint rule and a test.
- **All client traffic goes through the server API.** The client never imports
  `@supabase/supabase-js` and holds no Supabase credentials, not even the anon key.
- **Every use case takes `caller` as its first argument**, and authorization reads that
  argument and nothing else — never the Hono context or ambient request state
  (SPEC-FINAL §16.5). `login` and `refreshToken` are the only exemptions.
- **Push authorization is per operation, against `op.author_user_id`, not against the
  bearer** (§7.5). That is what makes a shared collector tablet work.
- **No Postgres RLS.** Authorization lives in the use-case layer.
- **A dead or no-show robot never records zeros** (§11.3).
- **`main` is barred from receiving phase 1A until the bearer token lands**
  (SPEC §19.4): the slice is unauthenticated, and `main` deploys to a public
  production URL backed by the production Supabase project.

## 8. Dev database

- `pnpm seed` is **idempotent** and deletes seeded entries it no longer writes.
- `pnpm db:clean` removes rows outside the deterministic seed id space
  (`00000000-0000-4000-8000-…`) — the litter rehearsals and smoke runs leave behind —
  from `scouting_entries` and `matches`, and now also non-seed `users` (e.g. a disabled
  `probe_*` account from a role probe).
  It deliberately leaves `applied_operations` alone: clearing that ledger would let an
  already-applied operation replay as a new write.
- Both refuse to run against production.
- **Matches 16–20 are deliberately left unscouted**, so a rehearsal has somewhere to
  scout. The entry screen refuses a second entry for a robot already scouted on this
  device (§6.2), and a fully seeded event leaves nowhere to work.

## 9. How a build chat runs

Load **`executing-plans`** for discipline and **`subagent-driven-development`** for
delegation.

**Precedence when they disagree: the chat's prompt first, then this file, then
`executing-plans`, then `subagent-driven-development`.** Say out loud which
instruction was set aside and why, rather than silently picking one.

- The chat is an **orchestrator**: it spawns one subagent per task, **sequentially**,
  and does not write application code itself. The phase groups are dependency chains —
  parallel fan-out is wrong, and the single working copy (`CLAUDE.md` §11) makes it
  unsafe anyway.
- The orchestrator **verifies rather than trusts**: reads the diff, re-runs the suite,
  reads the output. A subagent has already reported a green suite for a fix that a
  mutation test then showed was untested.
- **The orchestrator commits**, one commit per task, with the plan's exact message.
- Push the topic branch freely. **Say so before fast-forwarding `develop`** — it costs
  two Vercel deployments. Never push `main` without explicit instruction.

### Subagent contract

Give every subagent this:

> Read the task's section of `docs/plans/IMPLEMENTATION-PLAN.md` and the files it
> touches before writing anything. Implement exactly that task — not the next one.
> Run `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check` and paste the
> real output. Do not commit; the orchestrator commits.
>
> Report back exactly this, and nothing else:
> 1. **Files created/modified** — paths only.
> 2. **The interface later tasks depend on** — exported names and signatures.
> 3. **Test output** — verbatim, including counts.
> 4. **Deviations** — anything where the plan was wrong or impossible, in the
>    `DEVIATIONS.md` format, appended to that file by you.
> 5. **Anything you noticed that affects a later task** — say it even if it is outside
>    your task's scope. This is the most valuable line in the report.

## 10. Verification standard

Run the command, read the output, **then** report. Never claim something works without
having seen it work. A failing suite stops the run.

- For anything deployed, prove it from **outside** a browser session — read the served
  bundle or the HTTP response, not the dashboard. A logged-in browser passes checks
  that a CI runner will fail.
- For anything **security-shaped, prove the negative.** A token check that never
  rejects passes every happy-path test. Show that a missing token, a token signed with
  a different secret, an expired token and an unpermitted role are each refused.
- When a result contradicts an assumption, **check the assumption before theorising**.
  The seed's silent `.like()` failure on a `uuid` column looked like a logic bug for
  three attempts because the error was being discarded.

## 11. `DEVIATIONS.md`

`docs/plans/DEVIATIONS.md` is **append-only**. Never replace, reflow or re-order
existing entries.

One entry per departure from the plan's literal steps, in execution order:

```
## Task N.N — <short title>

**Plan said:** …

**What was wrong:** …   ← paste the real error text, not a paraphrase

**What I did instead:** …

**Risk:** …
```

Include trivial entries. An unlogged deviation is worse than a noisy log. Record
rejected alternatives and why — the next reader's instinct will be the option that was
already tried.
