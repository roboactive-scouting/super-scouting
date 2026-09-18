# Environment & secrets worksheet

**What this is.** The editable inventory of every variable and secret the platform needs. Fill in the **non-secret** columns as you provision things; leave every secret blank here forever.

**Status:** template — nothing provisioned yet. Provisioning happens in **phase 0**, following `SETUP.md`.

**This file is committed.** The two `apps/*/.env.example` files that phase 0 creates are generated from it, and they hold names and placeholders only, exactly as this file does.

---

## The one rule

> **No secret value is ever written in this file, in any file in this repo, in a commit message, or in a chat message.**

A secret exists in exactly two places: the dashboard that issued it (Supabase, GitHub), and the dashboard that consumes it (Vercel, GitHub Actions). It travels between them by copy-paste in your browser and nowhere else.

**What that means for how we work together:**

| Question | Answer |
|---|---|
| Do I send Claude the secret values? | **No. Never.** Not the service-role key, not the JWT secret, not the database password. There is no situation in this project where Claude needs one. |
| What does Claude actually need? | Only the **non-secret** column below — the Supabase project refs, the Vercel URLs. And only when a task actually uses them. |
| Can Claude verify the setup is correct without them? | **Partly.** Claude can verify *completeness* statically — that every variable the code reads is declared in `.env.example`, that CI references only secrets that exist, that no secret is reachable from the client bundle. Claude **cannot** verify a value is correct; only running it can, which is what the `/health` endpoint and the CI smoke suite are for. |
| How do I tell Claude a secret is set? | Tick the **Set?** box below. That is the whole handshake. |
| What if a secret leaks into the repo or a chat? | Rotate it immediately in the issuing dashboard, then update the two consumers. A rotated secret is a five-minute problem; a leaked one that stays valid is not. |

---

## 1. Client — `apps/client/.env.example`

The client holds **no Supabase credentials at all**, not even the anon key. All traffic goes through the server API.

| Variable | What it is | Where you get it | Secret? | Dev / Preview value | Production value | Set? |
|---|---|---|---|---|---|:---:|
| `VITE_API_BASE_URL` | Base URL of the server API | The server's Vercel project URL | No | ` ` | ` ` | ☐ |
| `VITE_DEVICE_WIPE_CODE` | The code a lead types to wipe a device's offline data | You choose it | **No** — it ships in the JS bundle and is visible to anyone. It is an accident guard, not a security control. | `WIPE2096` | `WIPE2096` | ☐ |
| `VITE_APP_VERSION` | The version string shown on the context page | Injected at build time from the git short SHA — not typed by hand | No | *(auto)* | *(auto)* | ☐ |

## 2. Server — `apps/server/.env.example`

Everything secret lives here. Server-side only. Never in a client bundle, never committed.

| Variable | What it is | Where you get it | Secret? | Dev / Preview value | Production value | Set? |
|---|---|---|---|---|---|:---:|
| `SUPABASE_URL` | Project REST URL | Supabase → Project Settings → API | No | `https://oqvoqddoizhhwvjwejtm.supabase.co` | `https://ezrgtroyofuxkkktnino.supabase.co` | ☐ |
| `SUPABASE_SERVICE_ROLE_KEY` | Full database access | Supabase → Project Settings → API | **YES** | *(never written here)* | *(never written here)* | ☐ |
| `AUTH_JWT_SECRET` | HS256 signing secret for session tokens | Generate: `openssl rand -base64 48`. **A different one per environment.** | **YES** | *(never written here)* | *(never written here)* | ☐ |
| `AUTH_TOKEN_TTL_DAYS` | Session lifetime. Default `30` | Configuration | No | `30` | `30` | ☐ |
| `AUTH_TOKEN_REFRESH_AFTER_DAYS` | Re-issue a token older than this. Default `7` | Configuration | No | `7` | `7` | ☐ |
| `ALLOWED_ORIGIN` | The client origin permitted by CORS | The client's Vercel project URL | No | ` ` | ` ` | ☐ |
| `NODE_ENV` | `development` / `production` | Set by the platform | No | *(auto)* | *(auto)* | ☐ |

## 3. GitHub Actions secrets

Needed by CI, by the dev migration step, and by the keep-alive workflow. Set at **Settings → Secrets and variables → Actions**.

| Secret | Used by | Where you get it | Secret? | Value (non-secret only) | Set? |
|---|---|---|---|---|:---:|
| `SUPABASE_ACCESS_TOKEN` | `supabase` CLI login in CI | Supabase → Account → Access Tokens | **YES** | *(never written here)* | ☑ |
| `SUPABASE_DEV_PROJECT_REF` | `supabase link` to the dev project | Supabase → Project Settings → General | No, but keep it here | `oqvoqddoizhhwvjwejtm` | ☐ |
| `SUPABASE_DEV_DB_PASSWORD` | `supabase db push` to dev | Set when you created the dev project | **YES** | *(never written here)* | ☑ |
| `SMOKE_API_BASE_URL` | Smoke suite target | The dev or preview server deployment URL | No | ` ` | ☐ |
| `SMOKE_SUPABASE_URL` | Smoke suite `CI` season setup/teardown | Dev project | No | `https://oqvoqddoizhhwvjwejtm.supabase.co` | ☐ |
| `SMOKE_SUPABASE_SERVICE_ROLE_KEY` | Same | Dev project | **YES** | *(never written here)* | ☐ |
| `HEALTHCHECK_DEV_URL` | Twice-weekly keep-alive | `https://<dev-server>/health` | No | ` ` | ☐ |
| `HEALTHCHECK_PROD_URL` | Twice-weekly keep-alive | `https://<prod-server>/health` | No | ` ` | ☐ |

**Production is deliberately absent from this table.** CI never touches the production Supabase project — production migrations are applied by hand, one deliberate CLI command, from your machine.

## 4. Vercel environment variables

Set per project, per environment, in the Vercel dashboard.

| Project | Environment | Variables | Points at | Done? |
|---|---|---|---|:---:|
| Client | Production | `VITE_API_BASE_URL`, `VITE_DEVICE_WIPE_CODE`, `VITE_APP_VERSION` | production server | ☐ |
| Client | Preview | `VITE_API_BASE_URL`, `VITE_DEVICE_WIPE_CODE`, `VITE_APP_VERSION` | dev/preview server | ☐ |
| Server | Production | the whole of §2 | **prod** Supabase project | ☐ |
| Server | Preview | the whole of §2 | **dev** Supabase project | ☐ |

**Preview and local always point at the dev Supabase project. Never production.**

## 5. Local only — not in any dashboard

| Item | Purpose | Where it lives | Set? |
|---|---|---|:---:|
| Dev Supabase database connection string | Local migrations, and `supabase db dump` for the manual backup | Your own machine's environment or Supabase CLI config. **Never committed.** | ☐ |
| Production Supabase database connection string | The manual production migration command, and the pre-event `supabase db dump` | Same. **Never committed.** | ☐ |
| `apps/server/.env` | Local dev run and the integration-test harness: **dev** Supabase URL and service-role key, a local-only `AUTH_JWT_SECRET` (distinct from both Vercel ones), `ALLOWED_ORIGIN=http://localhost:5173` | Your machine only. Matched by `.gitignore`’s `.env` rule; never committed. | ☑ |
| `apps/client/.env` | Local dev run: `VITE_API_BASE_URL=http://localhost:3000`, `VITE_DEVICE_WIPE_CODE`. `VITE_APP_VERSION` left empty — the build injects it. | Same. | ☑ |

---

## 6. Accounts to provision

Each must be transferable to a team-owned account later, so **nothing may depend on a personal identity** — no personal email in code, config, seed data, or as the running app's only admin.

| Account | Purpose | Owner today | Transfer target | Done? |
|---|---|---|---|:---:|
| GitHub | The repository, CI, the keep-alive workflow | `roboactive-scouting` (GitHub org, public repo `super-scouting`) | already org-owned — hand over by adding org owners | ☑ |
| Supabase — **dev** project | Development, preview, CI. Project `frc-scouting-dev`, ref `oqvoqddoizhhwvjwejtm`, region `eu-central-1` (Frankfurt) | team Google account | team-owned | ☑ |
| Supabase — **prod** project | Production. Project `frc-scouting-prod`, ref `ezrgtroyofuxkkktnino`, region `eu-central-1` (Frankfurt) | team Google account | team-owned | ☑ |
| Vercel — client project | The PWA | ` ` | team-owned | ☐ |
| Vercel — server project | The API | ` ` | team-owned | ☐ |

The transfer checklist — what to move, in what order, and what breaks if it isn't — lives in `SETUP.md`.
