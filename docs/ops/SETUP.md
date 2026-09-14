# Setup — standing up this project from nothing

Written for someone who has never seen this repository before. Every section is a
procedure you can execute, not a summary you have to interpret. If a step does not
work exactly as written, that is a bug in this document — fix the document, not
just your machine.

**Read it top to bottom, and run it top to bottom with three exceptions**, each
flagged where it occurs:

- **Supabase — dev project**, step 6 pastes credentials into a Vercel project that
  does not exist until two sections later. Create both Vercel projects first, then
  come back.
- **Migrations by CLI** and **Backup: `supabase db dump`** both run against
  `packages/db`, which does not exist until the first post-gate build task. Read
  them now; you cannot run them until then.

**Read `docs/ops/ENVIRONMENT.md` beside this file.** It is the worksheet: every
variable, where it comes from, and a tick box. This document tells you what to do;
that one records that you did it. Tick the boxes as you go.

## The two rules that override everything else

1. **No secret value is ever written into this repository, a commit message, a
   chat message, or a screenshot.** Secrets are typed into a dashboard, in a
   browser, and nowhere else. The only things ever said aloud are the non-secret
   identifiers: the two Supabase project refs and the four deployment URLs.
2. **Nothing may depend on a personal identity** (SPEC-FINAL §19.8). No personal
   email in code, in config, in seed data, or as the running app's only admin.
   Every account must be transferable to a team-owned account without a rewrite.

## Before you start

You need, on your machine:

- **Node 22** and **pnpm 9**. Check with `node -v` and `pnpm -v`.
- **Git**, and on Windows, **Git Bash**. Every command in this file and in
  `docs/plans/IMPLEMENTATION-PLAN.md` is written for a POSIX shell. PowerShell
  breaks three of them specifically: `VAR=value pnpm …` env-var prefixes are a
  parse error, `>` redirection writes UTF-16 and silently corrupts generated
  files, and `mkdir -p` / `cp` / `$VAR` do not behave the same way.
- A **password manager**. You will be handed several values that must not be
  written down anywhere else.

Then:

```bash
git clone https://github.com/roboactive-scouting/super-scouting.git
```

```bash
pnpm install && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
```

All of it must pass before you provision anything. If it does not, stop and fix
that first — you cannot tell a broken deployment from a broken checkout otherwise.

## Running it locally

`ENVIRONMENT.md` §5 is the one part of the worksheet that lives nowhere but your
own machine. Two files, both git-ignored, both copied from a committed template:

```bash
cp apps/server/.env.example apps/server/.env && cp apps/client/.env.example apps/client/.env
```

Then fill them in:

- `apps/server/.env` — the **dev** Supabase project's URL and service-role key, a
  locally-generated `AUTH_JWT_SECRET`, and `ALLOWED_ORIGIN=http://localhost:5173`.
- `apps/client/.env` — `VITE_API_BASE_URL=http://localhost:3000` and any
  `VITE_DEVICE_WIPE_CODE`. Leave `VITE_APP_VERSION` empty; the build fills it in.

**Local always points at the dev Supabase project. Never production.** Both `.env`
files are matched by `.gitignore`'s `.env.*` rule and cannot be committed; the
`.env.example` templates beside them are generated from `ENVIRONMENT.md` by
`pnpm env:example` and are the only version that belongs in the repository.

You cannot do this until the two Supabase projects exist and `apps/server` has
something to talk to, so come back here after the provisioning sections below.

## Accounts to create

Four accounts, five things inside them. `ENVIRONMENT.md` §6 is the register of who
owns what today and what it must be transferred to; keep it current as you work.

| # | Account | What you create in it |
|---|---|---|
| 1 | **GitHub** | The repository, its Actions secrets, and the keep-alive workflow. |
| 2 | **Supabase** | **Two** projects: `frc-scouting-dev` and `frc-scouting-prod`. |
| 3 | **Vercel** | **Two** projects: one for `apps/client`, one for `apps/server`. |
| 4 | A shared **password manager** vault | Every secret below. Nothing else holds them. |

Procedure:

1. Create or obtain access to a **team-owned** Google account, and use it for
   Supabase and Vercel. Do not sign up with a personal account "for now" — rule 2
   above exists because "for now" is how a project ends up locked to a graduate.
2. GitHub is already an organisation: **`roboactive-scouting`**, public repository
   **`super-scouting`**. Hand over by adding organisation owners, not by
   transferring a personal repository.
3. Record the owner of each account in `ENVIRONMENT.md` §6 and tick its box.

**Current state, for reference:** GitHub, the dev Supabase project and the prod
Supabase project already exist and are ticked in §6. Both Vercel projects do not
exist yet — and cannot be created until the scaffold below is pushed. See the two
Vercel sections for why that ordering is not negotiable.

## Supabase — dev project

This is the project development, preview deployments and CI all point at. It is the
only project CI is ever allowed to touch.

1. Supabase dashboard → **New project**.
2. Name it **`frc-scouting-dev`**.
3. Region: **the one nearest the team**. This project uses `eu-central-1`
   (Frankfurt). Both projects must be in the same region.
4. Supabase generates a **database password**. **Save it into the password manager
   immediately** — the dashboard will not show it again. It never goes in this repo.
5. Project Settings → General → copy the **project ref**. It is not a secret.
   This project's ref is **`oqvoqddoizhhwvjwejtm`**. Record it in
   `ENVIRONMENT.md` §3 against `SUPABASE_DEV_PROJECT_REF`.
6. Project Settings → API → copy the **Project URL** and the **`service_role` key**.
   Do not paste them into a terminal, an editor, or a chat. Go straight to the
   Vercel **server** project and paste them into its **Preview** environment as
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. (That project does not exist yet
   the first time through — come back to this step after **Vercel — server project**.)
7. Tick the `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` rows in
   `ENVIRONMENT.md` §2. **Do not tick the §4 Server/Preview row yet** — that row
   means "the whole of §2", all seven variables, and you have set two of them. It
   gets ticked at the end of **Vercel — server project**.

The `service_role` key bypasses every access control in the database. The server
alone holds it; it is never in a client bundle, a workflow file, or a browser.

## Supabase — production project

Identical procedure, one project over, feeding the **Production** environment.

1. Supabase dashboard → **New project**, named **`frc-scouting-prod`**, in the same
   region as dev (`eu-central-1`).
2. Save its **database password** into the password manager. It is a *different*
   password from dev's, and it must stay different.
3. Its project ref is **`ezrgtroyofuxkkktnino`**. Not a secret.
4. Project Settings → API → copy the **Project URL** and the **`service_role` key**
   into the Vercel **server** project's **Production** environment.
5. As above, **do not tick the §4 Server/Production row yet** — it means all seven
   §2 variables, and you have set two.

**The standing rule: CI never touches this project.** Its ref and its password are
deliberately absent from `ENVIRONMENT.md` §3, and its name must never appear in a
file under `.github/workflows/`. If you ever find yourself adding a
`SUPABASE_PROD_*` GitHub secret, stop — the thing you are trying to do is wrong.

Production migrations are applied by hand, from your machine, as one deliberate
command. See the next section.

## Migrations by CLI

Migrations are SQL files in `packages/db/supabase/migrations/`, committed to the
repository and applied by the Supabase CLI. **A schema is never hand-edited in the
Supabase dashboard.** A change made in the dashboard exists in no migration, so the
next `db push` either reverts it or collides with it, and nobody can tell which.

There is no `supabase` binary installed globally on any machine here. Invoke it
through the workspace, or with `pnpm dlx` before `packages/db` exists.

**One-time, per machine:**

```bash
pnpm dlx supabase@latest login
```

This opens a browser and stores an account-wide access token. It is not per-project.

**Dev — normally you do not run this by hand.** CI applies dev migrations on every
push to `develop` — see the migration step under `.github/workflows/`. To do it manually:

```bash
pnpm --filter @frc/db exec supabase link --project-ref oqvoqddoizhhwvjwejtm && pnpm --filter @frc/db exec supabase db push
```

`link` will ask for the dev database password. Take it from the password manager.

**Production — always by hand, never automatically:**

```bash
pnpm --filter @frc/db exec supabase link --project-ref ezrgtroyofuxkkktnino && pnpm --filter @frc/db exec supabase db push
```

Run it, watch the output, and read the list of migrations it says it will apply
*before* confirming. This is deliberately a human action taken at a deliberate
moment: a merge on a Friday evening must not be able to alter the database on a
competition Saturday morning.

**After a production push, immediately re-link back to dev** so that a later
absent-minded `db push` cannot reach production:

```bash
pnpm --filter @frc/db exec supabase link --project-ref oqvoqddoizhhwvjwejtm
```

> `packages/db` — the package holding the migrations, the generated database
> types and the dev seed — is created by the first build task after the
> provisioning gate. Until then the `pnpm --filter @frc/db` commands above have
> nothing to run against, and there are no migrations to apply.

## Vercel — client project

**Do the scaffold before the import. This ordering is a hard constraint, not a
preference.**

Vercel validates the **Root Directory** against the repository tree at import time.
A path that does not exist in the branch it is reading cannot even be typed into
the field — the import is refused. So the Vercel project **cannot be created** until
`apps/client/` exists on a branch that has been pushed to GitHub.

(Verified by hand on 2026-09-14, on this repository, with this account. It is not
an inference from the documentation.)

The order is therefore:

1. The pre-gate scaffold lands, so `apps/client/` and `apps/server/` exist in the
   tree.
2. That branch is pushed to GitHub.
3. **Then** both Vercel projects are imported.

If you import first, you will get a project pointed at the repository root, which
builds nothing useful, and you will have to fix the Root Directory afterwards.

Once the scaffold is pushed:

1. Vercel → **Add New → Project** → import `roboactive-scouting/super-scouting`.
2. **Root Directory: `apps/client`.** Set it in the import dialog, not afterwards.
3. **Framework Preset: Vite.**
4. **Node.js Version: 22.**
5. Leave the build and install commands alone — Vercel's Vite preset runs
   `pnpm install` and `pnpm build` from the root directory, which is what we want.
   (Unlike the server, the client has **no `apps/client/vercel.json`** at this
   point; one is added later, when both deployments are wired together and proved.
   Until then the preset defaults are what actually apply.)
6. Environment variables — set all three from `ENVIRONMENT.md` §1, **per
   environment**:

   | Variable | Production | Preview |
   |---|---|---|
   | `VITE_API_BASE_URL` | the **production** server deployment URL | the **preview** server deployment URL |
   | `VITE_DEVICE_WIPE_CODE` | a code you choose | a code you choose |
   | `VITE_APP_VERSION` | leave unset — injected at build time from the git short SHA | leave unset |

   `VITE_DEVICE_WIPE_CODE` is **not a secret**: it ships inside the JavaScript
   bundle and anyone can read it. It is an accident guard so that a lead cannot
   wipe a device by mis-tapping, not a security control. Do not reuse a password
   for it.

   `VITE_APP_VERSION` is deliberately left unset. `apps/client/vite.config.ts`
   injects it at build time from `VERCEL_GIT_COMMIT_SHA`, so a value typed here
   would only go stale and start lying about which build is on a device.
   **`ENVIRONMENT.md` §4 currently lists it among the variables to set on both
   Client rows; §1 correctly marks it *(auto)*. §1 is right and §4 is stale** —
   set the other two and tick the row.

7. Deploy, then record the client's deployment URLs. Tick the two Client rows in
   `ENVIRONMENT.md` §4 and the Vercel client row in §6.

There is a chicken-and-egg here and it is fine: the client needs the server's URL
and the server needs the client's. Import both projects first, take the URLs Vercel
assigns, then fill in `VITE_API_BASE_URL` and `ALLOWED_ORIGIN` and redeploy both.

## Vercel — server project

**The same hard ordering constraint applies.** `apps/server/` must exist on a pushed
branch before this project can be imported at all; Vercel refuses a Root Directory
that is not in the tree. Scaffold first, import second.

1. Vercel → **Add New → Project** → import the same repository again.
2. **Root Directory: `apps/server`.**
3. **Framework Preset: Other.**
4. **Node.js Version: 22.** `apps/server/vercel.json` pins the function runtime to
   `nodejs22.x`; the project setting must agree with it.
5. Environment variables — the whole of `ENVIRONMENT.md` §2, **per environment**:

   | Variable | Production | Preview |
   |---|---|---|
   | `SUPABASE_URL` | **prod** project URL | **dev** project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | **prod** service-role key | **dev** service-role key |
   | `AUTH_JWT_SECRET` | a fresh secret | a **different** fresh secret |
   | `AUTH_TOKEN_TTL_DAYS` | `30` | `30` |
   | `AUTH_TOKEN_REFRESH_AFTER_DAYS` | `7` | `7` |
   | `ALLOWED_ORIGIN` | the **production** client URL | the **preview** client URL |
   | `NODE_ENV` | set by Vercel — leave it alone | set by Vercel |

   Generate each `AUTH_JWT_SECRET` separately:

   ```bash
   openssl rand -base64 48
   ```

   Paste the output straight into the Vercel field and close the terminal. Two
   different environments get two different secrets, so that a leaked preview token
   is worthless against production.

   **Preview and local always point at the dev Supabase project. Never production.**

6. Deploy, then confirm the server is actually alive:

   ```bash
   curl -s https://<server-host>/health
   ```

   Expected: `{"status":"ok","database":"ok","time":"..."}`.

   **A `database: error` means two different things depending on when you see it.**
   Before the schema has been migrated, it is correct and expected: `/health` reads
   the `app_settings` table, and no migration has created it yet. Once migrations
   have been applied, the same response means what `RUNBOOK.md` says it means — the
   Supabase project is paused or unreachable. If you are reading this during first
   provisioning, you are in the first case.

   > On a Windows machine where an antivirus intercepts HTTPS, Git Bash's own
   > `curl` has no CA bundle and fails every TLS handshake with "unable to get
   > local issuer certificate". Use `/c/Windows/System32/curl.exe` instead, or
   > fetch it from Node. The failure is your shell's, not the server's.

7. Record the server's deployment URLs. **Now** tick the two Server rows in
   `ENVIRONMENT.md` §4 — all seven §2 variables are set in both environments — and
   the Vercel server row in §6.

## GitHub Actions secrets

Settings → Secrets and variables → Actions → **New repository secret**. Eight of
them, all listed in `ENVIRONMENT.md` §3. Every one is named `*_DEV_*` or points at
dev, and that is deliberate: **CI is only ever allowed to reach the dev project**,
so there is no production credential here to leak or to fire by accident.

| Secret | Where you get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens. Account-wide, so keep it tight. |
| `SUPABASE_DEV_PROJECT_REF` | Supabase → the **dev** project → Settings → General. Not secret. |
| `SUPABASE_DEV_DB_PASSWORD` | The dev database password you saved when you created the project. |
| `SMOKE_API_BASE_URL` | The dev or preview **server** deployment URL. |
| `SMOKE_SUPABASE_URL` | The **dev** project's URL. Not secret. |
| `SMOKE_SUPABASE_SERVICE_ROLE_KEY` | The **dev** project's service-role key. |
| `HEALTHCHECK_DEV_URL` | The dev server's `/health` URL. |
| `HEALTHCHECK_PROD_URL` | The production server's `/health` URL. |

The last one is the single exception that names production, and it is a read-only
`GET /health` against a public endpoint — it holds no credential and can change
nothing. It exists because the twice-weekly keep-alive workflow has to keep *both*
Supabase projects from hitting the free-tier idle pause.

Tick each row in `ENVIRONMENT.md` §3 as you set it.

## Backup: `supabase db dump`

There is no in-app export. **This dump is the only copy of a season that exists
outside the live database.** Accept that plainly: if the Supabase project is lost
and there is no recent dump, the season is gone.

**`supabase db dump` with no flags dumps the schema and none of the rows.** A
backup that is only a schema is not a backup. You need **two** files, and the
`--data-only` one is the one that holds the season:

```bash
mkdir -p ~/frc-backups && pnpm --filter @frc/db exec supabase link --project-ref ezrgtroyofuxkkktnino
```

```bash
pnpm --filter @frc/db exec supabase db dump -f ~/frc-backups/prod-schema-$(date +%Y-%m-%d).backup.sql
```

```bash
pnpm --filter @frc/db exec supabase db dump --data-only --use-copy -f ~/frc-backups/prod-data-$(date +%Y-%m-%d).backup.sql
```

Then link back to dev, so the next `db push` cannot reach production by accident:

```bash
pnpm --filter @frc/db exec supabase link --project-ref oqvoqddoizhhwvjwejtm
```

Do the same against `oqvoqddoizhhwvjwejtm` for a dev dump when you need one.

**Open the data file and look at it before you trust it.** It should be megabytes
of `COPY` statements, not a few kilobytes of `CREATE TABLE`. If it is small, you
ran the schema command twice.

> The Supabase CLI runs `pg_dump` in a container, so `db dump` may require Docker
> to be running. Prove the whole procedure once, on a quiet day, before an event
> depends on it — not at 7am on a competition Saturday.

**Where the files go:** off-platform and off this machine — the team drive, or the
password manager's file storage. `~/frc-backups/` above is a staging directory
outside the repository, deliberately: `pnpm --filter @frc/db exec` runs with its
working directory inside `packages/db/`, so a bare `-f something.sql` writes the
dump **into the working tree**, where it is untracked but perfectly committable and
contains every user row. `.gitignore` carries a `*.backup.sql` rule as a second
line of defence — it cannot be `*.sql`, because the migrations in
`packages/db/supabase/migrations/` are `.sql` files that must be committed — but do
not rely on it. Write the file outside the repository in the first place.

**When it is not optional:**

- Before **every** event. It is a line in `RUNBOOK.md`'s pre-event checklist.
- At the end of **every** season, before anything is deleted.
- Before any account transfer, and before any production migration that drops or
  renames a column.

## New-season checklist

In this order. Steps 2 onward are done in the running app; step 1 is a commit.

1. **Ship the field image first.** Commit
   `apps/client/public/seasons/<year>/field.webp`, run `pnpm season:images`, and
   **redeploy the client**. The season cannot be created until that image is live —
   the app fails loudly rather than rendering a season with no field.
2. **Create the season**, pointing at that exact image path.
3. **Create the events**, in competition order.
4. **Build and publish both forms** — the `match` form and the `super` form.
   Remember that a published form version is immutable and that field `key`s are
   permanent: labels can be corrected later, keys never. Capture the semantic
   metadata (`description`, `unit`, `phase`, `direction`) on every field as you
   create it — it cannot be backfilled.
5. **Set the active context** to the season and the first event.
6. **Create the event roster and the match schedule.**

Then run the pre-event checklist in `RUNBOOK.md` before the first competition.

## Maintenance and handover checklist

**Who holds what today** lives in `ENVIRONMENT.md` §6, and it is the first thing to
update when a person leaves. It is a table, not prose, precisely so that nobody has
to remember.

**Monthly, about five minutes:**

- [ ] One `GET /health` against both the production and the dev server. Both should
      answer `{"status":"ok","database":"ok",...}`.
- [ ] One `supabase db dump` of production, saved off-platform.
- [ ] Open the Supabase free-tier usage page for both projects and look at database
      size and egress. The keep-alive workflow prevents the idle pause; it does not
      prevent running out of quota.
- [ ] Confirm the twice-weekly keep-alive workflow has actually been running.
      GitHub disables scheduled workflows on a repository with no activity for 60
      days, silently.

**What a new maintainer reads, in this order:**

1. `docs/spec/SPEC-FINAL.md` — what the system is and why.
2. This file — how to stand it up.
3. `docs/ops/RUNBOOK.md` — what to do when it breaks at 9am on a Saturday.

**Where the archive of _why_ lives:** `docs/spec/frc-scouting-app-spec.md`, whose
decision log records not just what was chosen but the reasoning and the rejected
alternative. Read it before reversing a decision that looks odd; most of them look
odd for a reason that is written down.

## Account transfer checklist

Move things in this order. Each step breaks something predictable; the order is
chosen so that what breaks is easy to see and easy to fix.

**1. GitHub first — the repository and its Actions secrets.**

- The repository is already owned by the `roboactive-scouting` organisation, so the
  handover is adding organisation owners, not a transfer.
- **Actions secrets do not follow a repository transfer.** If the repository ever
  does move to a different owner, all eight secrets in §3 must be re-added by hand.
- After this step: CI will fail on the first push until the secrets are back. That
  failure is the signal that the step is incomplete — do not skip past it.
- Before continuing to step 2, re-verify `GET /health` on **both** environments.
  Nothing here should have changed them; if something has, you want to know now,
  while only one thing has moved.

**2. Supabase — both projects.**

- Transfer the projects to the new owning organisation. **Transfer, do not recreate.**
- If a project is _recreated_ rather than transferred, its **service-role key and
  its project ref both change**. Every one of these then has to be re-entered: the
  Vercel server project's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in both
  environments, `SUPABASE_DEV_PROJECT_REF` and `SUPABASE_DEV_DB_PASSWORD` and
  `SMOKE_SUPABASE_*` in GitHub, and the refs written into this document.
- Take a `supabase db dump` of production **before** starting this step.
- After this step: re-run `GET /health` on both environments. A `database: error`
  means the server is still pointed at the old project.

**3. Vercel — both projects, last.**

- **Environment variables are not carried by a Vercel project transfer.** Every
  variable in §4, in both environments, on both projects, must be re-entered by
  hand. Have `ENVIRONMENT.md` open and untick the boxes before you start so you can
  tick them back as you go.
- The deployment URLs may change. If they do, `VITE_API_BASE_URL` on the client and
  `ALLOWED_ORIGIN` on the server both have to be updated to match, and both
  projects redeployed — a stale `ALLOWED_ORIGIN` is a CORS failure that looks like
  a dead API.
- After this step: `GET /health` on both servers, then load the client and sign in.

**After all three steps**, re-verify `/health` on both environments one more time,
run `pnpm docs:check` and `pnpm env:example:check`, and update `ENVIRONMENT.md` §6
so it says who owns each account now.
