# FRC Scouting Platform — Design Specification (Living Document)

**Status:** DRAFT v0.35 — **topics 1–20 CLOSED; `SPEC-FINAL.md` written.** Every feature topic plus the system architecture, the deployment/operations model, the non-functional requirements and the delivery plan. Core forks decided (storage, versioning, offline stats, stack, access model, language, roles/auth, data-entry UX, offline-first & sync, realtime deferred → 45s refresh, dashboards & visualisation, search/ranking/browse, data quality, alliance selection, repo layout & services, environments & operations, performance/testing/privacy/deletion, phasing & delivery). **v1 = phases 0–2, due 2026-11-20** (§19.1). Topic 14 is closed as **deferred in full to §24**, and topic 20 as **setup only** with the LLM connection parked. **No live questions remain.** `docs/spec/SPEC-FINAL.md` (v1.0, 2026-09-02) is the distilled build input; **it carries 32 consolidation decisions (its Appendix D) that resolve gaps this document left unstated, and it supersedes this document wherever the two differ on a v1 requirement.** `docs/plans/IMPLEMENTATION-PLAN.md` (v1.1, 2026-09-03) covers phases 0–1 in full task detail and phase 2 as headings. **The spec phase is complete; the build phase begins at the provisioning gate.**
**Last updated:** 2026-09-03 (v0.35)
**Owner:** (your name / team number)
**Destination:** this document, once all topics are CLOSED, becomes the input spec for Claude Code to generate an implementation plan.

---

## 0. How to use this document

### 0.1 Structure

The document is split into **topics** (sections 2–19). Every topic contains:

- **Confirmed requirements** — things you already told me, restated precisely. These are locked unless you change them.
- **Proposed decisions** — my recommendation where a decision is needed, with the alternatives and trade-offs. Nothing here is locked until you say so.
- **Open questions** — numbered `Q<section>.<n>` so we can reference them in chat (e.g. "Q4.3: option B").

### 0.2 Topic status

| # | Topic | Status |
|---|-------|--------|
| 1 | Product vision & scope | CLOSED |
| 2 | FRC domain model & glossary | CLOSED |
| 3 | Dynamic forms — the core architecture decision | CLOSED |
| 4 | Seasons, competitions & events | CLOSED |
| 5 | Users, roles, authentication & permissions | CLOSED |
| 6 | Scouting data entry (runtime UX) | CLOSED |
| 7 | Offline-first & synchronisation | CLOSED |
| 8 | Realtime & live updates | CLOSED — realtime → §24; v1 uses 45s refresh |
| 9 | Statistics engine & computed metrics | CLOSED |
| 10 | Dynamic dashboards, graphs & visualisations | CLOSED |
| 11 | Search, ranking & browse | CLOSED |
| 12 | Alliance selection & pick list | CLOSED |
| 13 | Data quality, integrity & scouter reliability | CLOSED |
| 14 | External data integration (TBA / FRC Events API) | CLOSED — deferred in full to §24 |
| 15 | System architecture, repo layout & services | CLOSED |
| 16 | UI/UX design system & responsive behaviour | CLOSED |
| 17 | Non-functional requirements | CLOSED |
| 18 | Deployment, environments & operations | CLOSED |
| 19 | Delivery phases & priorities | CLOSED — v1 = phases 0–2, due 2026-11-20 |
| 20 | AI insights, LLM integration & MCP readiness | CLOSED — setup only; MCP/LLM connection parked |

### 0.3 Working agreement

- We close topics one at a time. When a topic is closed I move its decisions from "proposed" to "confirmed", set the status to **CLOSED**, and log it in section 21.
- If I think you are forgetting something important, I will raise it whether or not you asked. Items I raise on my own initiative are marked **[RAISED BY ME]**.
- I will not write application code until the spec is approved and an implementation plan exists.

---

## 1. Product vision & scope

### 1.1 Confirmed requirements

- A **scouting platform for an FRC team** that is **year-agnostic**: the app must never need a code change to support a new game season. Everything game-specific is configuration created inside the app.
- The team can **create, edit and delete the data-collection forms** (which act as the "tables" representing each year's game) from inside the app UI.
- Data is **organised by season and event**. **Forms belong to a season** (a season may hold several — match / super / …), and every event in that season uses them (Q3.6). *(amended 2026-08-17)*
- Users can **search and analyse data per competition**, and also **aggregated across all competitions in the same year**.
- Users can build **statistics and visualisation pages dynamically from the UI**, choosing chart types and pointing at specific form fields.
- Separate **client** and **server** projects, in **one repository**, but as **two independently deployed services**.
- **Offline capable**: at a venue with no internet the app loads existing data, allows changes, and syncs when connectivity returns.
- **Responsive**: must look and work well on both phone and desktop.
- Database: **Supabase**.
- **Optimistic local UI**: a user's own action appears instantly on their own device with no manual refresh (except while offline). *(confirmed 2026-08-14)*
- **Cross-device live push** (another device's changes appearing without a refresh) is **deferred to nice-to-have** — see topic 8 and §24 (Q15.1).
- Deployment: **Vercel** for both client and server.
- Features to include: team search, form management, ranking, statistics (details per topic below).
- **Single-team install.** Built only for our team; multi-tenant/multi-org is out of scope (Q1.4). *(confirmed 2026-08-14)*
- **Team & events.** This is **FRC team 2096**, competing in the **FIRST Israel district** plus the **FIRST Championship**. The event model covers district events, championship divisions, and internal scrimmages — **each as a regular flat event, no division hierarchy** (Q4.3, resolved 2026-08-17). *(confirmed 2026-08-15, Q1.2)*
- **Scale at a competition.** Peak concurrent use is roughly **8 scouters + 2 strategy leads + 1 admin (~11 people)**. This is small — it confirms the JSONB storage model (§3) and the all-through-server access model (§15) are safe, and keeps realtime/scale targets modest (§17). *(confirmed 2026-08-15, Q1.1)*
- **Replaces a prior app** that failed on exactly the two headline requirements: it **did not work offline** and was **not versatile across seasons**. Offline-first (§7) and year-agnostic forms (§3) are therefore the primary, non-negotiable design drivers, validated by lived pain. *(confirmed 2026-08-15, Q1.3)*
- **Low-maintenance, multi-season lifespan.** Maintained by a **team mentor**, not a rotating student. The system must run season after season with **minimal intervention** ("if it works, nobody should need to touch it"). This favours boring, well-documented technology over clever solutions, and makes a **maintenance/handover checklist a v1 deliverable** — what to check, renew (keys, tokens, plan limits) and update at the start of each season and when the maintainer eventually leaves. Connects to Q18.5 (account ownership survives handover). *(confirmed 2026-08-15, Q1.6)*
- ~~**Target completion 2026-10-01**~~ **Superseded 2026-09-01 on topic 19 close: v1 (phases 0–2) is due 2026-11-20** (§19.1). The original 2026-10-01 was set before the full scope was known and is no longer the working date. *(confirmed 2026-08-15, Q1.5; revised 2026-09-01, Q19.2)*

### 1.2 Confirmed decisions

*(Confirmed 2026-08-15 on closing topic 1.)*

**Primary success criterion.** *"During a competition, the team's scouters can each record their assigned robot per match on a phone with no internet, and within 60 seconds of regaining connectivity the strategy lead sees updated team rankings on a laptop."* If that works, the product works.

**Explicit non-goals for v1:**

- Not a public/multi-tenant SaaS for other teams (single-team install — Q1.4 closed).
- No native iOS/Android app — a PWA installable to the home screen.
- No live-video or camera-based automatic scouting.
- No integration with the FMS/field systems.

### 1.3 Open questions

- ~~**Q1.1** — How many people use this at a competition, roughly?~~ ✓ **CLOSED 2026-08-15: ~8 scouters + 2 leads + 1 admin (~11 peak)** (§1.1).
- ~~**Q1.2** — What is your **team number and district/region**?~~ ✓ **CLOSED 2026-08-15: team 2096, FIRST Israel district + FIRST Championship (with divisions)** (§1.1).
- ~~**Q1.3** — What are you using today, and what fails about it?~~ ✓ **CLOSED 2026-08-15: a prior app that failed offline and wasn't year-agnostic — the two primary design drivers** (§1.1).
- ~~**Q1.4** **[RAISED BY ME]** — Should the system support **multiple teams/organisations** in one deployment (multi-tenant), or is it strictly your team?~~ ✓ **CLOSED 2026-08-14: single team** (§1.1).
- ~~**Q1.5** — Is there a hard deadline?~~ ✓ **CLOSED 2026-08-15: soft target 2026-10-01, not hard** (§1.1).
- ~~**Q1.6** **[RAISED BY ME]** — Who maintains this after you?~~ ✓ **CLOSED 2026-08-15: a team mentor; must be low-maintenance and multi-season, with a handover/maintenance checklist as a v1 deliverable** (§1.1).

---

## 2. FRC domain model & glossary

### 2.1 Why this section exists **[RAISED BY ME]**

You said "year-agnostic", which is right — but there is a set of concepts that is *stable across every FRC season*. Modelling those as first-class entities (rather than as fields inside a dynamic form) is what makes the app genuinely reusable. If team number or match number lives inside the flexible JSON blob, then ranking, search and cross-season comparison all break. So we split the world in two:

**Fixed skeleton (hard-coded, same every year):**

| Entity | Meaning |
|---|---|
| Season | A year, e.g. 2026. Has one game and one **scoring model** (below). |
| Event / Competition | A specific competition — district event, championship division, or internal scrimmage — **each modelled as a regular, flat event**; identified by **name + year**; belongs to a season. No division hierarchy (Q4.3). |
| Team | An FRC team: **team number + team name only**. Global, spans seasons. |
| Match | A match at an event: type (practice / qualification / playoff), match number, the 3 red teams, the 3 blue teams, and a **reserved nullable official result** (score / RP / W-L). Only **qualification** matches feed metric aggregates (Q2.6). |
| Scouter (User) | A person entering data. |
| Scouting Entry | One observation: one scouter, one team, one match, one form version → a payload of answers. Covers all **6 robots per match, including team 2096's own** (Q2.3). |

**Flexible layer (created by you in the app, differs every year):**

| Entity | Meaning |
|---|---|
| Form | The game-specific questionnaire ("2026 match scouting"). |
| Form Version | An immutable snapshot of a form's fields. |
| Field | One question: type, label, validation, section, conditional logic. |
| Scoring model | Maps each field's raw value → game points (boolean → points if true, counter/number → points per unit, single/multi-select → points per selected option). **Points are non-negative and defined per field per phase** (a field may score differently in auto/teleop/endgame). A **mission is successful when its points > 0** (no separate predicate). A robot's scouted score is the **sum of its field points**; a match/alliance total is the sum across its robots (no alliance-level bonus/threshold points). Edited **inline in the form builder** (editing a field carries its scoring with it, keyed by field) but stored **separately from the form version** — a scoring change is **never** a new form version and never invalidates entries. *(amended 2026-09-02, SPEC-FINAL consolidation)* **The scoring model is not versioned at all**: there is one current model per season, edited in place. Because every score is derived, the latest model always re-scores all history, so prior versions could never be read and the "own timeline" wording is withdrawn. Entries store **raw observations only**; the score is always **derived**, so a corrected model re-scores all history. Game-specific, **not backfillable**; the metric engine (topic 9) implements it. **[RAISED BY ME → confirmed]** |
| Metric | A computed value derived from fields and the scoring model (e.g. "total game pieces = auto + teleop"). |
| Dashboard / Chart | A saved visualisation configuration referencing fields and metrics. |

### 2.2 Confirmed requirements

- **Fixed/flexible split confirmed** (Q2.1). Fixed schema: Season, Event, Team, Match, Scouter, Scouting Entry — each entry carries structured foreign keys plus a flexible game payload. Event = **name + year**; Team = **number + name only**.
- **Team numbers are global and stable** — team 2096 in 2024 and 2026 is the same team, so multi-season history works for free.
- **Season scoring model** (Q2.1, Q2.8 — fully closed). A field's raw value maps to game points (boolean → points if true; counter/number → points per unit; single/multi-select → points per selected option). Rules: **points are non-negative** — penalties are recorded but never subtracted (Q2.8b); **points are defined per field per phase** so a field can score differently in auto/teleop/endgame (Q2.8a); a **mission counts as successful when its points > 0** (Q2.8c); a robot's scouted score is the **sum of its field points** and a match/alliance total is the sum across robots (Q2.8e); **no alliance-level bonus/threshold points** (Q2.8f). Points are **entered inline in the form builder** but held in a **scoring model versioned independently of the form version**: entries store **raw observations only** and the score is **derived**, so **a scoring change never creates a new form version** and never invalidates collected data (Q2.8d). Captured at field-creation time (same non-backfillable gotcha as semantic metadata, §3.3). Topic 9 implements the engine.
- **Form kinds in v1: Match scouting + Super scouting only** (Q2.2). Pit / human / other remain addable later through the `kind` field; not built in v1.

| Form kind | One record per | Purpose |
|---|---|---|
| Match scouting | (team, match) | Quantitative performance in a match. |
| Super scouting / qualitative | **(team, event)** — one record per team per event *(amended 2026-09-02, SPEC-FINAL consolidation)* | Driver skill, defence, penalties, breakdowns — the subjective read. |

- **Scouting coverage** (Q2.3): all **6 robots per match, including our own**; one match-scouter per robot. With ~8 scouters (topic 1), the ~2 beyond the six field robots do super scouting.
- **No per-alliance records** (Q2.4): everything is attributed per robot.
- **Official match results** (Q2.5): schema is **reserved now as nullable** (score / RP / W-L) so no migration is needed when TBA import (§24) lands; until populated the **UI hides official-result displays entirely — it must never render an empty score box.**
- **Match inclusion in metrics** (Q2.6): practice and playoff matches are stored under their event and viewable on the search/forms page, but are **excluded from all metric aggregates**; only **qualification** matches are computed.
- **Own robot = a regular robot** (Q2.7, Q2.9): team 2096's robot is scouted exactly like any other of the 6 (Q2.3); there is **no separate reliability/mechanism/notes log**.

### 2.3 Resolved & spun-out questions

- ~~**Q2.1**~~ ✓ **CLOSED:** fixed/flexible split accepted; Event = name+year, Team = number+name. Season **scoring model** added (§2.1–§2.2).
- ~~**Q2.2**~~ ✓ **CLOSED:** match + super scouting only in v1.
- ~~**Q2.3**~~ ✓ **CLOSED:** all 6 robots incl. our own, one scouter each; spare scouters super-scout.
- ~~**Q2.4**~~ ✓ **CLOSED:** no per-alliance data.
- ~~**Q2.5**~~ ✓ **CLOSED:** reserve nullable official-result schema; UI never shows empty score boxes.
- ~~**Q2.6**~~ ✓ **CLOSED:** practice + playoff stored & searchable, excluded from metrics; qualification only.
- ~~**Q2.7 / Q2.9**~~ ✓ **CLOSED:** our own robot is scouted as a regular robot — no separate tracking log.

**Q2.8 — scoring model.** ✓ **FULLY CLOSED 2026-08-17.** A field's raw value maps to points (boolean → points-if-true; counter/number → points-per-unit; single/multi-select → points-per-selected-option), entered inline in the builder but stored in a scoring model versioned independently of the form; entries hold raw observations and the score is derived. Topic 9 implements the engine.
- ~~**Q2.8a**~~ ✓ **CLOSED:** points are defined **per field per phase** — a field may score differently in auto/teleop/endgame. **AMENDED 2026-09-02 (SPEC-FINAL consolidation): superseded — one score per field.** The dangling question this answer left open (how per-phase points coexist with the single required `phase` tag) is resolved by dropping per-phase scoring: a field has exactly one score and exactly one phase, and a game element that scores differently in two phases is modelled as **two fields**. Confirmed by the user on 2026-09-02 as how they intend to build forms; it is also the only reading consistent with the single `phase` metadata value.
- ~~**Q2.8b**~~ ✓ **CLOSED:** **no negative points** — penalties/fouls are recorded but never subtracted from the score.
- ~~**Q2.8c**~~ ✓ **CLOSED:** a mission is **successful when its points > 0**; no separate predicate.
- ~~**Q2.8d**~~ ✓ **CLOSED:** a scoring change is an **in-place edit of the scoring model — never a new form version**; because scores are derived, a corrected model re-scores all history.
- ~~**Q2.8e**~~ ✓ **CLOSED:** a robot's scouted score = **sum of its field points**; match/alliance total = sum across robots; this is what reconciles against the reserved official result (Q2.5).
- ~~**Q2.8f**~~ ✓ **CLOSED:** **no** alliance-level bonus/threshold points (RP thresholds, coopertition) in the scouted score.

---

## 3. Dynamic forms — the core architecture decision

> This is the single most important decision in the project. Everything else — offline sync, statistics, graphs, performance — is downstream of it. I want to close this topic first.

### 3.1 Confirmed requirements

- Forms are created, edited and deleted from inside the app by an admin.
- A form represents the game for a given year and is linked to competitions.
- Form fields are the targets that charts and statistics point at.
- **Storage model: Option A — one `scouting_entries` table with a JSONB payload** (Q3.1). Validators and casts are **generated from the field definitions**, not hand-written per form. *(confirmed 2026-08-14)* **Amended 2026-08-31 (topic 15 close, C1): the generated per-form-version SQL views are dropped from v1 → §24.** Flattening the JSONB into typed fields happens **only in the shared TypeScript engine**; nothing in v1 reads a view, and generating them would require runtime `CREATE VIEW` (see §15.1).
- **Immutable form versioning** (Q3.2). A new version is created only by *structural* changes — adding, removing/deprecating, or retyping a field. Editing a field's **label** or **range/min-max** happens in place and does **not** create a version; a range change applies to new entries only and **never retroactively invalidates data already collected**. Field `key`s are permanent. *(confirmed 2026-08-14)*
- **Semantic field metadata captured at field-creation time** (Q3.9). `description`, `unit`, `phase` and `direction` are **required** per field; `category`, `expected_range`, `include_in_ai_context` are optional. It cannot be backfilled and it drives the generated validators/views, chart labels and default sort (and is the LLM data dictionary later). *(confirmed 2026-08-14)*
- **Field type catalogue** (Q3.3). All catalogue types ship **except Photo** (deferred): Counter, Number, Toggle, Single select, Multi select, Rating, Short text, Long text, Timer, Event log, Field-position picker, **Cycle path**, Computed, Section. *(confirmed 2026-08-17; Cycle path added 2026-08-20)*
  - **Timer** values are **editable after stop** (correct a late stop) and **nullable via an "unsure — no time" toggle** (submit no value instead of a wrong number).
  - **Event log** records **timestamped taps** — scouter-defined event buttons, each tap stored as `{type, t}` where `t` is seconds from a "match start" tap; enables counts and cycle-time analysis; taps are deletable before submit.
  - **Field-position picker** stores normalized `{x, y}` in 0–1 on the **season's uploaded game image** (one point or a list per entry). It carries **per-field alliance normalization**: the red alliance keeps raw coordinates; the blue alliance is mirrored — **horizontally, vertically, or both (configurable, with builder preview)** — so both alliances map to one canonical frame. This requires each entry to know its alliance. Shown in analytics as a heatmap/scatter over the game image.
  - **Cycle path** (Q3.3, added 2026-08-20). Captures a robot's cycle **routes** on the game image: the scouter taps an **ordered sequence of points** per cycle (e.g. pickup → score), and an entry holds a **list of cycles**. **Low fidelity by design** — a small **capped number of points per cycle** (target ≤ ~6) so the payload stays light; this is a rough sketch, not a precise trajectory. Uses the **same per-field alliance normalization** as the field-position picker (points stored as normalized `{x, y}` in 0–1, blue mirrored to the canonical frame). Rendered in analytics as **arrowed polylines** over the game image.
- **Form builder UI** (Q3.4). A **list-based builder + live-preview pane**; raw-JSON editing behind an "advanced" toggle. Design it cleanly. *(confirmed 2026-08-17)*
- **Version model** (Q3.5). A form has one **main/active version** plus **restorable secondary version snapshots**. Statistics always compute against the **main version**; a metric that references a field **absent from the main version** renders **"cannot calculate this metric"** until it is fixed/edited. Entries collected under other versions still aggregate through shared field `key`s. *(confirmed 2026-08-17)*
- **Form scope** (Q3.6). A **form belongs to a season**, not a competition. A season may hold several forms (match / super / …); every event in that season uses them. *(confirmed 2026-08-17)*
- **Delete semantics** (Q3.7). Deleting a form is a **cascade delete behind an explicit warning**, available to the **admin only**. *(confirmed 2026-08-17)*
- ~~**Team-card flag** (Q3.8). Each field carries a **`show_on_team_card`** boolean…~~ **WITHDRAWN 2026-09-02 (SPEC-FINAL consolidation).** There is no `show_on_team_card` flag and no per-field "quick summary" flag. The team page (§10.2, §11.2) is the team view and is built from metrics, so the per-field flag has no surface to drive. *(confirmed 2026-08-17; withdrawn 2026-09-02)*
- **Conditional logic.** Simple rules only — `show this field if <field> <op> <value>`. No form-duplication feature; export/import of a form definition as JSON is retained. *(confirmed 2026-08-17)*
- **Every field is scoutable offline.** No per-field offline flag — offline is the normal operating mode, so all fields work offline. *(confirmed 2026-08-17)*

### 3.2 The three ways to build this

**Option A — One entries table with a JSONB payload (my recommendation).**

```
forms(id, season_id, kind, name, ...)
form_versions(id, form_id, version_no, published_at, is_locked)
form_fields(id, form_version_id, key, label, type, config, order, section, ...)
scouting_entries(
  id uuid,                -- generated on the client
  form_version_id,
  event_id, match_id, team_number, scouter_id,
  data jsonb,             -- { "auto_high_goals": 3, "climbed": true, ... }
  created_at, updated_at, client_updated_at, deleted_at
)
```

- Pros: no schema changes at runtime; one code path for everything; trivially syncable offline; trivial to add/remove/reorder fields; a single security policy covers all forms; Postgres indexes JSONB well (GIN, or expression indexes on hot fields).
- Cons: aggregate queries need casts (`(data->>'auto_high_goals')::numeric`); no database-level type enforcement — validation lives in the app and in a check function; slightly slower than native columns at very large scale.
- Mitigation for the cons: generate a **per-form-version SQL view** that flattens the JSONB into typed columns. Charts and statistics then query a normal-looking table. Optionally materialise it for speed. *(Amended 2026-08-31, topic 15 close: **deferred → §24**. Creating those views at form-publish time means the server issues DDL against the live database, which puts part of the schema outside the repo's migrations and duplicates the shared engine's flattening. The cons are instead absorbed by the TS engine, which already reads the JSONB directly — online and offline.)*

**Option B — A real Postgres table per form (runtime DDL).**

- Pros: native types and indexes; the cleanest possible analytics SQL.
- Cons: the app needs privileges to run `CREATE TABLE` / `ALTER TABLE` in production, which with Supabase means handing the service-role key a lot of power — a real security concern; every new table needs its own row-level-security policies generated correctly or your data is exposed; deleting a field means either a destructive `DROP COLUMN` or dead columns forever; cross-form and cross-season queries need dynamic SQL; the offline client has to mirror an unknown, changing schema locally. This is the option that looks most natural and causes the most pain.

**Option C — EAV (entity–attribute–value): one row per answer.**

- Pros: typed value columns; fully flexible.
- Cons: pivoting back into rows-per-entry is painful and slow; row count explodes (60 fields × 6 robots × 100 matches ≈ 36,000 rows per event); offline sync at row granularity is fiddly.

**Recommendation: Option A**, with generated flattening views for analytics. It gives you Option B's query ergonomics without the operational risk. *(Views since deferred → §24; the shared TS engine is the one flattening path — see §15.1.)*

**The MCP requirement (topic 20) strengthens this.** With Option A there is *one* stable table shape plus a machine-readable field dictionary, so an LLM discovers this year's game by reading one document. With Option B the model would have to discover N unknown tables with unknown column names every season, and any tool that queries them has to generate dynamic SQL — which is both fragile and the classic injection surface. Option A is meaningfully easier to expose safely to a model.

### 3.3 Proposed decisions

**Form versioning is immutable.** This is the thing people forget and regret. If you edit a form after scouting has started, previously collected entries must remain interpretable. So:

- Editing a *published* form creates **version N+1**; existing entries stay bound to version N.
- Field `key` values are permanent identifiers — you can rename the *label* freely, never the key.
- Deleting a field marks it deprecated in the new version; historical data is retained.
- Statistics that span versions must map fields explicitly (a field present in v1 but not v2 is either excluded or treated as null — we need a rule; see Q3.5).

**Field type catalogue (draft).** These are the field types I think an FRC form needs. Cut freely.

| Type | Notes |
|---|---|
| Counter | Big +/− buttons. The workhorse of match scouting on a phone. |
| Number | Free numeric with min/max/step. |
| Toggle / boolean | Did it climb, did it break down. |
| Single select | Radio / segmented control (e.g. climb level: none/low/high). |
| Multi select | Checkboxes (e.g. which scoring locations used). |
| Rating | 1–5 stars or slider, for subjective scouting. |
| Short text | Free text, indexed for search. |
| Long text / notes | Comments. |
| Timer / stopwatch | Accumulate time (e.g. time spent defending). **Editable after stop; nullable via an "unsure" toggle.** |
| Event log | Scouter-defined event buttons; each tap stored as `{type, t}` seconds from a "match start" tap. Enables cycle-time analysis. |
| Field position picker | Tap the season's game image; stores normalized `{x,y}` (0–1). **Per-field alliance normalization: red = raw, blue = mirrored H/V/both (configurable, with preview).** Shot-location heatmaps. |
| Cycle path | Tap an **ordered, low-fidelity list of points per cycle** (capped ≤ ~6; a list of cycles per entry) on the season game image; same alliance normalization as the position picker. Rendered as arrowed polylines. |
| ~~Photo~~ | **Deferred — not in v1.** |
| Computed | Read-only, derived from other fields by a formula. |
| Section / header | Layout only, no data. |

**Field configuration per field:** key, label, help text, type, required, default value, min/max, options list, section/page, display order, visibility condition, whether it appears in the quick summary, **`show_on_team_card`** (Q3.8), and — for the field-position picker — the **alliance-normalization axis** (none / horizontal / vertical / both). *(No per-field offline flag — **every field is scoutable offline**.)*

**Semantic metadata per field — added because of the MCP/LLM requirement (topic 20). [RAISED BY ME]**

An LLM cannot reason about a field called `f_17` holding the number `3`. For the AI stage to work at all, every field needs machine-readable meaning attached at the moment you create it in the form builder:

| Attribute | Example | Why the LLM needs it |
|---|---|---|
| `description` | "Game pieces scored in the upper goal during autonomous" | The only thing that tells the model what the number means. |
| `unit` | count / seconds / points / boolean / enum | Prevents nonsense comparisons and lets it phrase answers correctly. |
| `phase` | auto / teleop / endgame / post-match | "How is this team in auto?" requires knowing which fields are auto. |
| `direction` | higher_is_better / lower_is_better / neutral | Without it the model can't tell a good team from a bad one. "Fouls: 8" is bad; "Climbs: 8" is good. |
| `category` | scoring / defence / reliability / movement / driver skill | Enables "find me a defensive robot" without hard-coding this year's game. |
| `expected_range` | 0–9 | Lets the model recognise an implausible value instead of reporting it as fact. |
| `include_in_ai_context` | true / false | Lets you exclude noisy or private fields from anything sent to a model. |

This is a small addition to the form builder now and effectively impossible to backfill later — nobody will go back and describe 80 fields for three past seasons. It is also useful independent of AI: the same metadata drives chart axis labels, units in tables, default sort direction, and validation warnings. This is why I want it decided in topic 3, not topic 20.

**Scoring attributes (from topic 2).** Fields that contribute to the game score carry non-negative point value(s) — per enum option and per phase where relevant — captured here at creation time for the same non-backfillable reason. This is the **season scoring model** (§2.1, Q2.8 closed); success is derived as points > 0, not a separate predicate. Topic 9 implements the engine.

**Conditional logic:** simple rules only — `show this field if <field> <op> <value>`. Not a general expression language.

**Form portability:** export/import a form definition as JSON so it can be shared or version-controlled. *(No "duplicate last year's form" feature — dropped Q3.3 close.)*

### 3.4 Open questions

- ~~**Q3.1** — Do you accept **Option A (JSONB)**?~~ ✓ **CLOSED 2026-08-14: yes, Option A** (§3.1).
- ~~**Q3.2** — Do you accept **immutable form versioning**?~~ ✓ **CLOSED 2026-08-14: yes; label/range edits in place** (§3.1).
- ~~**Q3.3** — Which field types do you want, incl. field-position picking and event logs?~~ ✓ **CLOSED 2026-08-17: full catalogue except Photo (deferred); position picker uses the season game image with per-field alliance normalization; timer editable + nullable; event log = timestamped taps** (§3.1).
- ~~**Q3.4** — How is the form built in the UI?~~ ✓ **CLOSED 2026-08-17: list builder + live-preview pane; raw-JSON behind an advanced toggle** (§3.1).
- ~~**Q3.5** — What happens to a metric whose field only exists in some versions?~~ ✓ **CLOSED 2026-08-17: one main/active version + restorable snapshots; stats run on the main version; a metric on a missing field shows "cannot calculate this metric"** (§3.1).
- ~~**Q3.6** **[RAISED BY ME]** — Form↔competition relationship?~~ ✓ **CLOSED 2026-08-17: a form belongs to a season (not a competition); a season may hold several forms; all its events use them** (§3.1).
- ~~**Q3.7** **[RAISED BY ME]** — What does "delete a form" mean?~~ ✓ **CLOSED 2026-08-17: cascade delete behind an explicit warning, admin-only** (§3.1).
- ~~**Q3.8** **[RAISED BY ME]** — Per-field "show on team card" flag?~~ ✓ **CLOSED 2026-08-17: yes — `show_on_team_card` boolean per field** (§3.1).
- ~~**Q3.9** **[RAISED BY ME]** — Do you accept the **semantic metadata** block as part of every field, and which attributes are required?~~ ✓ **CLOSED 2026-08-14: yes; description/unit/phase/direction required, rest optional** (§3.1).
- ~~**Q3.10** **[RAISED BY ME]** — LLM-suggested field metadata from a pasted game manual?~~ ✓ **CLOSED 2026-08-17: wanted, deferred → §24 nice-to-have.**

---

## 4. Seasons, competitions & events

### 4.1 Confirmed requirements

- Data is organised by season and event name.
- **Forms belong to a season**, not an individual event; every event in the season uses the season's form(s) (Q3.6). *(amended 2026-08-17)*
- Search/filter data by event, and by all events within one season.
- **Active context (season + event).** The app has one app-wide active context. The **admin sets the default** (the `is_active` event and its season; season only if no event exists yet) and the app always **opens to it**. *(Q4.1, confirmed 2026-08-17)*
- A user may switch the season/event they are working in, but the switch is **session-only — not persisted**; reopening returns to the admin default. **Only the admin default is cached for offline use**; user overrides are never stored.
- The active context governs **both what the user browses and which event new scouting entries attach to**. Because a wrong context silently misattributes data, the switcher lives on a **dedicated context/landing page the user deliberately opens — never in the always-visible header/nav** (§16).
- **No event types — every event is a regular flat event** (Q4.2). No `type` field: district event, championship division, off-season and internal scrimmage are all just events (consistent with Q4.3, no division hierarchy). *(confirmed 2026-08-18)*
- **Events are weighted equally when aggregating across a season** (Q4.4). No event-level recency/weighting — a later event does not count more than an earlier one. *(confirmed 2026-08-18)*
- **No external data import in v1** (Q4.5). We do not import another team's data or scout from a stream, so there is **no data-import path and no `source` field on entries**. (Distinct from the deferred TBA/FRC schedule/result import — Q14.1, §24.) *(confirmed 2026-08-18)*
- **Data model** (Q4.2 close): `seasons(year, game_name, field_image_url)` → `events(id, season_id, name, code?, is_active, sort_order)`. `code` (the official event key, e.g. `2026isde1`) is **nullable and unused for now** — reserved only for the deferred TBA import (§24); `type`, `start_date`, `end_date` and `location` are **not modelled** (no import populates them). *(confirmed 2026-08-18)*
- **Aggregation scopes available everywhere:** single event, season (all events), multi-season / all-time, and a custom set of events. *(confirmed 2026-08-18)*
- **Events carry an admin-orderable `sort_order` within their season** *(added 2026-08-20 for Topic 9)*. Default = creation order; the admin can reorder a season's events, and all season-spanning stats/charts render competitions in this order (the full-season slope view, §9). **[RAISED BY ME]** — not in the original Q4.2 model; required by the year-view trend requirement. Reordering is display order only; it does **not** re-weight aggregates (Q4.4 unchanged).

### 4.2 Open questions

- ~~**Q4.1**~~ ✓ **CLOSED 2026-08-17:** global admin-set default context (season + event); users may override for the **session only** (not saved; only the default is cached offline); switcher on a dedicated page, not the header (§4.1, §16).
- ~~**Q4.2**~~ ✓ **CLOSED 2026-08-18:** no event types — every event is a regular flat event; `type` field dropped.
- ~~**Q4.3**~~ ✓ **CLOSED 2026-08-17:** flat event list — a championship division is just a regular event; no division hierarchy modelled.
- ~~**Q4.4**~~ ✓ **CLOSED 2026-08-18:** events weighted **equally** across a season; no event-level recency weighting.
- ~~**Q4.5**~~ ✓ **CLOSED 2026-08-18:** no external import in v1 — no data-import path, no `source` field on entries. `code` kept nullable; `start_date`/`end_date`/`location`/`type` dropped from the events model.

---

## 5. Users, roles, authentication & permissions

### 5.1 Confirmed requirements

- **Three global roles: Scouter, Lead, Admin** (Q5.1). Roles are **global**, not per-event; there is **no viewer/mentor role**. *(confirmed 2026-08-18)*
- **All data is visible to every role** (Q5.1, Q5.4). Scouters, leads and admins can view everything — statistics, dashboards, teams, forms and entries. No bias-hiding of aggregates from scouters. *(confirmed 2026-08-18)*
- **Form *templates* are admin-only; form *entries* are open to all** (Q5.1, reaffirms Q3.1/Q3.7). Creating, uploading/importing, editing and deleting a form *template* (definition/version) is **admin-only**. Submitting scouting *entries* against a form is open to **all users** — the normal scouting flow. *(confirmed 2026-08-18)*
- **Login: admin-provisioned username + password** (Q5.2). The admin creates each account and hands out its username and password. No self-service password reset in v1 — the admin re-issues. *(confirmed 2026-08-18)*
- **Only the admin creates users** (Q5.6); no self-registration.
- **Only the admin promotes/demotes** a user between Scouter / Lead / Admin (Q5.2).
- **Only the admin deletes users** (Q5.7). Deleting a user removes their access but **never deletes anything they created** — their scouting entries and any content remain, with authorship preserved. *(confirmed 2026-08-18)*
- **Scouters may edit their own entry for 5 minutes** after they create it; once the 5-minute window passes the row **locks** for them and only a Lead or Admin can change it (Q5.3). The window is measured from the entry's **client creation timestamp**, so it behaves **identically offline and online** — it is enforced on-device by the client clock, not at sync time. Scouters do **not** hard-delete entries — removal is a Lead/Admin action (soft-delete, §7.3). Leads and Admins may edit/manage any entry at any time. *(confirmed 2026-08-18)*
- **Offline session persistence: ~30 days, refreshed on use** (Q5.2). A scouter authenticates once (e.g. on Wi-Fi at the hotel) and stays logged in offline through the whole event. *(decided-by-Claude 2026-08-18)*
- **Switch-scouter quick action on shared devices** (Q5.8). Shared team tablets get a fast "switch scouter" action instead of full logout/login, and **every entry records the scouter who actually entered it**. *(confirmed 2026-08-18)*
- **No user audit log** (Q5.5). The app keeps no who-did-what-when log of user actions. *(confirmed 2026-08-18)* *(Entry edit-history was resolved on Topic 13 close: **no full per-entry history** either — routine edits overwrite last-write-wins; only §7.3 divergence preserves the superseded copy.)*
- **Authorization is enforced in the server use-case layer and surfaced in the UI — not in the database** (Q5.1 close). **No Postgres Row-Level Security, no per-row policies.** Because all traffic already goes through the server API (Q15.1, the single control point), each use case checks the caller's role and the UI hides or disables actions a role may not perform. *(confirmed 2026-08-18)*

### 5.2 Role & permission matrix (confirmed)

| Capability | Scouter | Lead | Admin |
|---|:---:|:---:|:---:|
| Log in; view all data (stats, dashboards, teams, forms, entries) | ✓ | ✓ | ✓ |
| Submit scouting entries; edit **own** entries (≤ 5 min, then locked) | ✓ | ✓ | ✓ |
| Manage **all** entries (edit / fix / reassign / soft-delete others') | — | ✓ | ✓ |
| Add a team to the **do-not-pick** list (reason required); may not edit or remove one (§12.2) | — | ✓ | ✓ |
| Create a **draft statistics page** on the active competition (session-only, not saved, discarded on exit) | — | ✓ | ✓ |
| Create / edit / **save** statistics & dashboards (persistent) | — | — | ✓ |
| Create / upload / edit / delete **form templates** | — | — | ✓ |
| Manage events & the active-context default (§4.1) | — | — | ✓ |
| Build / reorder **pick lists**; edit or remove do-not-pick entries; record the **alliance bracket** (§12.2) | — | — | ✓ |
| Create / delete users; promote / demote roles | — | — | ✓ |

The **draft statistics page** (Lead) is an ephemeral dashboard scoped to the current active competition: built during a session, viewable live, **never persisted to the database**, and discarded on **exit — defined as logout or closing the app/tab**. It is held in session-scoped memory, so it **survives navigation between pages within the session** but is gone once the lead logs out or the app closes (and can be dismissed manually). Persistent/saved statistics are admin-only. See Topic 10 (§10.2) for the dashboard mechanics; this fixes only who may create ephemeral vs. saved ones.

This matrix governs **users**. A non-human caller (`kind: 'service'`, §20.1) is not a user, holds none of these roles, has no row in the users table, and may call **query** use cases only.

### 5.3 Resolved questions

- ~~**Q5.1**~~ ✓ **CLOSED 2026-08-18:** three global roles (scouter/lead/admin), no viewer/mentor, not per-event; matrix §5.2; form templates admin-only, entries open to all.
- ~~**Q5.2**~~ ✓ **CLOSED 2026-08-18:** admin-provisioned username + password; admin promotes/demotes; ~30-day offline session.
- ~~**Q5.3**~~ ✓ **CLOSED 2026-08-18:** scouters edit own entries for **5 min** from creation (by client timestamp, offline & online), then the row locks; leads/admins anytime; scouters don't hard-delete.
- ~~**Q5.4**~~ ✓ **CLOSED 2026-08-18:** all data visible to all roles; no bias-hiding.
- ~~**Q5.5**~~ ✓ **CLOSED 2026-08-18:** no user audit log (entry edit-history resolved on Topic 13 close — no full per-entry history either).
- ~~**Q5.6**~~ ✓ **CLOSED 2026-08-18:** admin-only user creation; no self-registration.
- ~~**Q5.7**~~ ✓ **CLOSED 2026-08-18:** admin-only user deletion; deletion preserves everything the user created.
- ~~**Q5.8**~~ ✓ **CLOSED 2026-08-18:** switch-scouter quick action on shared devices; entries record the actual scouter.

**Topic 20 dependency resolved 2026-09-02 (Q20.6):** **no fourth role.** The three roles stand exactly as above. A future non-human caller is instead a `service` **caller kind** living outside the user model — no users row, not creatable or assignable by an admin, cannot log into the UI, read-only by construction (§20.1). Nothing in §5.1 or §5.2 changes.

---

## 6. Scouting data entry (runtime UX)

### 6.1 Why this matters more than it sounds **[RAISED BY ME]**

This is where 95% of the app's actual usage happens: a student standing in a loud arena, phone in one hand, watching a robot move fast, with 2 minutes and 30 seconds of match plus ~10 seconds between matches. If this screen is even slightly awkward, the data quality collapses and every graph downstream is worthless. I'd like to spend real time on this topic.

### 6.2 Confirmed requirements

- **Manual match selection in v1** (Q6.1). No assignment system in v1: the scouter **manually picks the match number and the team/robot** to scout. The schedule-driven assignment flow (auto-fill *"Match 34 — you are watching Red 2, team 1577"*) is **deferred to §24 nice-to-have**, gated on TBA/schedule import (§14). *(confirmed 2026-08-18)*
- **Station-based assignments when built** (Q6.2). When the assignment system lands it is **station-based / fixed positions** — the scouter at a fixed station always watches the same alliance slot (station 1 → Red 1). Recorded now so the deferred design is fixed. *(confirmed 2026-08-18)*
- **Collapsible phase sections** (Q6.3). The entry form is organised into phase sections (Autonomous → Teleop → Endgame → Post-match) that the scouter can **open, close, and return to at will** — not one-way paging. A scouter can reopen an earlier phase to fix a value. *(confirmed 2026-08-18)*
- **Sticky match timer** (Q6.4). A full-match timer is **pinned to the top of the screen and stays visible while scrolling**. Its **phases (auto / teleop / endgame) and their countdown durations are part of the form definition**, reusing the same phase vocabulary as field metadata (§3.3) and the scoring model (§2.2). A **manual "Start match" button** starts it (we cannot hook the field). The timer is **display-only guidance**: it does **not** open or close phase sections, does **not** lock or gate any field, and does **not** auto-submit — scouters open phases themselves. *(confirmed 2026-08-18)*
- **Mandatory robot status** (Q6.5). Every match entry carries a required top-level **`robot_status` ∈ {played, no-show, disabled, broke-down-at-T}**, chosen before the scoring fields. For **no-show** and **disabled** the scoring fields are **hidden — no zeros are ever entered**; the entry records only the status. `broke-down-at-T` also captures the breakdown time. *(confirmed 2026-08-18)*
  - **Statistics treatment.** Performance metrics (scores, piece counts, averages) **count `played` and `broke-down-at-T`** — a robot that played then died genuinely underperformed, so its partial data is real observed performance — and **exclude `no-show` and `disabled`** entirely (never counted as zero). A separate **reliability / availability metric** counts `played` + `broke-down-at-T` as *available* and `no-show` + `disabled` as *missed*, and flags breakdowns. Topic 9 implements this metric (§9.2). *(confirmed 2026-08-18)*
- **Both orientations, phones and tablets** (Q6.6). The data-entry UI works in **both portrait and landscape** and adapts its layout — a wider (landscape) screen, typical on a tablet/iPad held sideways, places fields side-by-side; a phone stacks them. Usable on **phones and tablets/iPads**. *(confirmed 2026-08-18)*
- **Arena-comfort features** (Q6.7). Ship all of: **large touch targets, an outdoor-readable high-contrast mode, a large-text option, haptic feedback on taps, screen-wake-lock (no dimming mid-match), thumb-reachable primary actions, and counters instead of the keyboard** wherever possible. *(confirmed 2026-08-18)*
- **Practice / training mode** (Q6.8). A mode to enter data against a **real form** without polluting the database: practice entries are marked as such and are **never stored or synced** — discarded on exit. *(confirmed 2026-08-18)*
- **Undo on all repeatable inputs.** Undo is available on **counters, event-log taps, field-position-picker points (undo last point / clear all), multi-select, and timer reset** — anywhere a stray or mistaken tap needs stepping back. *(confirmed 2026-08-18)*
- **Explicit submit.** Submitting is a deliberate action showing a **confirmation summary of the whole entry** before it commits; nothing reaches the shared data on a stray tap. In v1 (no assignments) submit returns to a fresh manual selection. *(confirmed 2026-08-18)*
- **Never lose data.** Every interaction writes a **local draft immediately** (IndexedDB, §7.3); the draft survives a browser crash, a dead battery, or an accidental back-swipe and is **recoverable**; an explicit submit promotes the draft into the sync outbox. *(confirmed 2026-08-18)*

### 6.3 Resolved questions

- ~~**Q6.1**~~ ✓ **CLOSED 2026-08-18:** manual match + team selection in v1; schedule-driven assignment system → §24 nice-to-have, gated on TBA import.
- ~~**Q6.2**~~ ✓ **CLOSED 2026-08-18:** when built, assignments are **station-based / fixed positions** (station 1 → Red 1).
- ~~**Q6.3**~~ ✓ **CLOSED 2026-08-18:** **collapsible phase sections**, openable/closable and reopenable — not one-way paging.
- ~~**Q6.4**~~ ✓ **CLOSED 2026-08-18:** **sticky top match timer**; phases + countdown durations are part of the form definition; manual "Start match"; **display-only** — never gates fields, opens phases, or auto-submits.
- ~~**Q6.5**~~ ✓ **CLOSED 2026-08-18:** mandatory top-level `robot_status` (played / no-show / disabled / broke-down-at-T); no-show & disabled hide the scoring fields (no zeros). Stats: performance metrics count `played` + `broke-down`, exclude `no-show` + `disabled`; a separate reliability/availability metric reads the status (Topic 9).
- ~~**Q6.6**~~ ✓ **CLOSED 2026-08-18:** both portrait and landscape; adaptive layout; phones and tablets/iPads.
- ~~**Q6.7**~~ ✓ **CLOSED 2026-08-18:** all arena-comfort features (large targets, high-contrast/outdoor mode, large text, haptics, screen-wake-lock, thumb-reachable actions, counters over keyboard).
- ~~**Q6.8**~~ ✓ **CLOSED 2026-08-18:** practice/training mode — real form, entries never stored/synced.

---

## 7. Offline-first & synchronisation

### 7.1 Confirmed requirements

- Works fully with no internet: loads existing data, allows changes.
- When internet returns, changes upload.
- **Statistics and rankings compute on-device while offline** (Q7.4). The metric engine runs in the browser from the shared `packages/shared` engine — the *same code* as server-side, so results cannot diverge. Metric calculations are expected to stay simple. *(confirmed 2026-08-14)*

### 7.2 The thing you must know about FRC venues **[RAISED BY ME]**

At official FRC events, **wireless communication in the pits and stands is heavily restricted** — the field's radio spectrum is protected, event WiFi is often unavailable or unusable, and cellular is frequently saturated by thousands of people in a metal arena. In practice, "offline" is not the exception at a competition; **it is the normal operating mode**. This inverts a normal app's design: the local database is the source of truth during an event, and the cloud is where it eventually lands.

Consequences we should decide on:

1. The app must be **installable as a PWA** and fully functional with the network switched off, including cold start (app shell cached, no network request required to boot).
2. Sync happens opportunistically whenever a connection appears, and there must be a **visible, trustworthy sync status** — how many entries are pending, when the last successful sync was, and a manual "sync now" button.
3. We need a **fallback transfer path** for when there is genuinely no internet all weekend. Realistic options: a phone hotspot used by one device at a time outside the pit area; a local WiFi network with a laptop acting as a hub; **QR code chains** (scouter's phone renders a QR, a central tablet scans it) — this is a proven FRC pattern and requires no network at all; or plain file export/import over USB or AirDrop.

### 7.3 Confirmed decisions

- **Local store:** IndexedDB (via Dexie or similar), scoped to the **active (admin-default) competition only** — its form definitions and versions, the team list, that event's raw entries (the source the on-device engine computes statistics from — no pre-computed values stored), the outbox, and **cached user records so scouters can log in and switch user offline** on a shared device. No multi-season/multi-event bulk caching on-device.
- **Client-generated UUIDs** for all records, so an offline device can create records that will never collide on upload.
- **Outbox / operation log** pattern: every local mutation is appended as an operation with a client timestamp and a monotonic counter; sync replays operations to the server; the server acknowledges and the client prunes.
- **Conflict policy — last-write-wins live; only genuine divergence goes to review** (optimistic concurrency). Every row carries a server-assigned **version** (revision counter). The **edit function is separate from sync**: each mutation records **the base version it started from**. On sync the server compares that base to the row's current version:
  - **Fast-forward** — base matches the DB, or the UUID is new: apply and bump the version, **last-write-wins, no review.** Covers every normal case — a scouter's own 5-min self-edit, a re-sync, a re-scanned QR batch.
  - **Divergence** — base is stale (two edits branched from the same ancestor on different devices): a **genuine conflict** → keep the **latest as the live value** so the app stays usable, **preserve the superseded version**, and flag the row for review. No automatic field-level merge. **The "review conflicts" screen requires a human decision from a lead *or* an admin** (both roles can resolve; a scouter cannot) — a flagged conflict is not considered settled until one of them acts.

  For form definitions, offline admin edits are **not allowed** — form changes require connectivity (avoiding two divergent form schemas). *(Q7.5, refined 2026-08-19.)*
- **Editable offline:** **scouting entries** (create + 5-min self-edit) and the **alliance-selection surfaces** — the admin-only **pick lists** and **alliance bracket**, plus a **lead's do-not-pick addition** — all syncing through the same outbox. *(Extended on Topic 12 close, §12.2.)* A pick-list **reorder** is a single operation stamped with the list's own version, not a per-row write (§12.2).
- **Statistics offline:** the **main statistics page works offline for viewing** — rankings and metrics are computed on-device from the raw entries — but **cannot be edited offline**. A lead's **draft statistics page can be created offline** and, as always, is **discarded on exit** (§5.2). **Saving** a persistent admin dashboard needs connectivity; a saved dashboard is viewable from cache offline but is built/edited only online. Offline stats naturally reflect only the entries the device currently holds — they become complete once it has gathered the others (sync or QR).
- **Not editable offline:** form definitions and user management.
- **Offline dataset — the full active competition, and it fits easily.** Offline analysis needs the real source data on the device: **all active-competition forms/versions, the user list, and every raw scouting entry** (the "statistics details"). **Nothing is pre-computed** — the on-device shared engine calculates each metric from the raw entries (matches §17.1: store raw, aggregate on the client). Feasibility is not a concern: with **no photos** (position fields store only normalized x,y coordinates), one event is a **few MB of JSON** (~600 match entries × ~1–2 KB plus super-scouting) — far within IndexedDB's limits, so it loads and indexes fast. The cache is bounded to the **active competition only** — no multi-season/multi-event bulk is held on-device.
- **Lead-approved local wipe.** A "clear this device's offline data" action gated behind a **constant code held by leads** — a safety valve to reset a misbehaving or handed-down device. The wipe is **refused for any record without a cloud ack** (durability rule below), so it can never destroy unsynced data.
- **Soft deletes** everywhere (`deleted_at`), because a delete that happened offline needs to propagate and win predictably.
- **Durability rule — never prune before a cloud ack:** a device discards a local record from its outbox **only** after receiving a server acknowledgment for that exact UUID. Nothing else — closing the app, a device handoff, a QR transfer, or the lead-approved wipe — ever removes an unacked record. This is the single load-bearing guarantee against data loss.
- **Fallback transfer = QR, in v1** (Q7.1): the sender batches all pending outbox entries, **compresses** them, and renders an **animated multi-frame QR** (fountain-coded, order-independent); a central tablet scans the whole batch in one continuous scan — not one code per entry. Matches the real workflow (Q7.2): a **central tablet collects scouters' data by QR, then a runner carries it outside the arena every few games to sync to the cloud.**
- **QR transfer is additive & idempotent:** scanning a device's animated-QR dump **copies** its records to the receiver with their **original UUIDs, scouter, and client timestamps** (not re-authored). The sender keeps its outbox pending — a QR scan is a backup hop, not a confirmed sync — so the data now exists on both devices and is strictly more durable. When either device (or both) later reaches the internet, each uploads independently; because the server keys on UUID, a second upload of the same record is an **idempotent upsert** resolved by the base-version rule above (no-op if identical, fast-forward if linear, flagged for review only on genuine divergence), never a duplicate. No device need be designated "the syncer," and re-scanning the same batch is harmless.

### 7.4 Resolved questions

- ~~**Q7.1** — Is QR-code transfer in scope for v1 or later?~~ ✓ **CLOSED 2026-08-19: in v1, as an animated + compressed multi-frame QR** (§7.3).
- ~~**Q7.2** — Any realistic connectivity at your events?~~ ✓ **CLOSED 2026-08-19: yes, outside the arena** — one tablet is walked out to sync every few games; QR feeds that tablet inside (§7.3).
- ~~**Q7.3** — Which entities must be editable offline?~~ ✓ **CLOSED 2026-08-19: scouting entries + pick list (admin-only)** editable offline; form defs / user mgmt / persisting dashboards not — but a lead's ephemeral draft stats page does work offline (§7.3). *(Topic 12 close extends the offline-editable set to the do-not-pick list and the alliance bracket, and allows a lead's do-not-pick addition offline — §12.2.)*
- ~~**Q7.4** — Should statistics and charts be computed on-device while offline?~~ ✓ **CLOSED 2026-08-14: yes — shared TS metric engine runs in the browser** (§7.1).
- ~~**Q7.5** — When two devices edited the same entry, who wins?~~ ✓ **CLOSED 2026-08-19: last-write-wins live via base-version check; only genuine divergence is flagged for lead/admin review, superseded version preserved** (§7.3).
- ~~**Q7.6** **[RAISED BY ME]** — Device-to-device sync on a local network?~~ → **§24 nice-to-have** (local-network hub, no internet; not USB).
- ~~**Q7.7** **[RAISED BY ME]** — How much local storage; photos?~~ ✓ **CLOSED 2026-08-19: cache the full active competition (a few MB — no photos, x,y coords only) so offline stats work; active-competition-only bound; lead-code local wipe** (§7.3).

---

## 8. Realtime & live updates

### 8.1 Confirmed requirements

- **No realtime / live push in v1 — periodic refresh instead** (Q8.1). Cross-device live updates (Supabase Realtime / WebSockets) are **nice-to-have** (§24). In v1 a device sees other devices' changes through the normal refresh triggers — re-querying on screen entry, pull-to-refresh, manual refresh, re-sync on reconnect — **plus a background auto-refresh every 45 seconds** on data-bearing screens while online. *(confirmed 2026-08-19)*
- **Optimistic local UI stays — core, not deferred.** A user's own action appears instantly on their own device with no manual refresh (except while offline). This is a *local* mechanism — the same one offline writes use (§7) — not cross-device push, so it is not part of the deferral. *(confirmed 2026-08-14)*
- **Connection-state indicator**, always visible, three states: **online / syncing / offline** (§7.2, §16). *(confirmed)*
- Needing a full app restart to see changes is a caching bug to design out (PWA: cache the shell, network-first for data). *(confirmed)*

### 8.2 Resolved questions

- ~~**Q8.1** — What genuinely needs to be live?~~ ✓ **CLOSED 2026-08-19: nothing is push-live in v1; a 45-second auto-refresh (plus the refresh triggers) covers cross-device propagation. Supabase Realtime → §24.**
- ~~**Q8.2** — Live "match in progress" view?~~ → **§24 nice-to-have** (requires connectivity often absent at a venue).
- ~~**Q8.3** **[RAISED BY ME]** — Presence (who's online / who hasn't submitted)?~~ → **§24 nice-to-have.**
- ~~**Q8.4** **[RAISED BY ME]** — Notifications?~~ → **§24 nice-to-have** (in-app vs. push decided then).

> **Dependency note — RESOLVED 2026-08-31 (Topic 12 close):** §12's **live cross-off** is instant on the **admin's own device** (optimistic local write), reaches **online viewers on the 45-second auto-refresh** or a manual refresh, and offline viewers only on sync. Because the pick list is **single-editor (admin-only)**, **the admin's device is the declared source of truth during alliance selection** and every other screen is advisory (§12.2).

---

## 9. Statistics engine & computed metrics

### 9.1 Confirmed requirements

- Statistics per game/form, viewable per competition or across all competitions of a year.
- Statistics feed the graph/visualisation pages.

**Confirmed at Topic 9 close (2026-08-20):**

- **Menu builder, no free-text formula language** (Q9.2). Metrics are built by choosing field(s) → aggregation → filters, with multi-field arithmetic (at least summing, e.g. `auto + teleop`) but no typed expression evaluator. When creating a statistic page you can also set a **display limit/target value** (the game's cap for that metric) to draw as a reference on the chart/table.
- **Match-subset selection, no recency weighting** (Q9.6). A metric may compute over **last N matches** and/or with **specific matches manually excluded** (or both); every included match counts equally (consistent with Q4.4).
- **Standard deviation is displayed, not a ranking order** (Q9.5). Consistency is available and shown next to averages, but the app does not sort/rank teams by it. **Reliability is a first-class ranking input** (robot-status handling, §9.2).
- **No cross-event percentile / z-score normalisation** (Q9.7). Percentile stays available as an ordinary aggregation over a team's own entries.
- **Minimum sample size = 1** (Q9.8). The engine only guards against empty/zero-division; it does not flag or refuse low-sample teams.
- **One canonical entry per (team, match)** (Q9.4). The normal path is edit/review of a single entry — no deliberate multi-scout redundancy in v1. The only collision is a sync conflict, resolved **last-write-wins live, superseded version preserved and flagged for lead/admin review** — identical to §7.3 (Q7.5). Statistics read the live value, so averages never double-count.

**Statistics pages (confirmed 2026-08-20; page/chart mechanics live in Topic 10):**

- **Team stat page** — reachable from a team's page; shows *that team's* stats over the **matches of the active competition** only. Fixed, always available.
- **General stat-page builder** — a separate route for pages spanning **many teams and/or a full season**. Per §5.2: **admins create *and save*** persistent pages; **leads create/explore but cannot save** (session-only draft pages, discarded on exit).
- **Full-season ordering** — competitions render in **creation order by default** so a metric's **slope from first to last competition** (and per-match-per-competition across the year) reads left-to-right; the admin can **reorder** competitions within a season. Backed by a persisted `sort_order` on events — see §4.1 amendment.
- Heatmap-per-match and cycle/event-log views raised in Q9.1 are **Topic 10 visualisation concerns**, driven by these same metrics.

### 9.2 Proposed decisions

**Two layers of statistics.**

*Layer 1 — Metric definitions (created in the app, per form):* a named, reusable calculation over form fields.

- Field combination via a **menu builder, not a typed formula language** (Q9.2): choose field(s) → aggregation → filters. Multi-field arithmetic is supported at least for summing (e.g. `total_pieces = auto_pieces + teleop_pieces`); there is **no free-text expression evaluator**.
- Aggregation over a team's entries: average, median, sum, min, max, count, standard deviation, percentile, rate (`count where condition / total`), trend/slope over match number, "last N matches" average, best/worst.
- Filters: exclude no-shows and disabled robots; only qualification matches; only a chosen date range or event set; **a match subset — last N matches and/or specific matches manually excluded** (Q9.6, no recency weighting).
- **Metrics are NOT versioned** *(amended 2026-09-02, SPEC-FINAL consolidation)* — they are edited in place and reusable across every chart, table and ranking. *(The earlier "versioned alongside forms" wording is withdrawn; it conflicted with §11.2's ranking and compare metric sets, which were already "edited in place, no versioning".)*

*Layer 2 — Derived FRC statistics from official results:* OPR, DPR, CCWM, win rate, average ranking points, schedule strength. These come from match scores, not from your scouting, and are a valuable cross-check. **Deferred → §24 nice-to-have (Q9.3), gated on TBA import (§14):** not built until official results are imported. (confirmed 2026-08-20)

**Robot-status handling (confirmed at Topic 6 close, Q6.5).** Every match entry carries a top-level `robot_status` ∈ {played, no-show, disabled, broke-down-at-T}. The engine applies a fixed rule: **performance metrics include `played` and `broke-down-at-T`** (partial data from a robot that died is real observed performance) and **exclude `no-show` and `disabled`** (they must never enter an average as zero). A first-class **reliability / availability metric** reads the same field — `played` + `broke-down-at-T` count as *available*, `no-show` + `disabled` as *missed*, with breakdowns flagged. This is why the status is a fixed skeleton field, not a form field.

**Reliability is surfaced and used, not just available (confirmed 2026-08-20).** The engine exposes explicit counts per team — **breakdowns** (`broke-down-at-T`), **no-shows** (`no-show`), **disabled** (`disabled`) — plus a derived **availability rate** = available / (available + missed). These counts are shown alongside performance metrics in the statistics, ranking and pick-list views, and reliability is a **first-class input to alliance selection**: a high scorer that frequently breaks down or no-shows must not out-rank a slightly lower but dependable robot. Standard deviation/consistency is displayed but never used to order rankings (Q9.5); reliability, by contrast, *is* a ranking input.

**Aggregation scopes (revised 2026-08-20, Q9-close):** **per team per competition**, **per team per match** (a team's per-match series within a competition), **per scouter per competition** (reliability), and **per team per season** (needed for the full-season/slope view). *(Per-team all-time, general per-match-across-robots, and per-scouter-per-match dropped.)*

**Where computation happens (RESTATED 2026-09-02, SPEC-FINAL consolidation).** The earlier wording — SQL views/functions online, TypeScript offline — contradicted §15.1's C1 decision (no generated views; flattening lives only in the shared TS engine) and would have produced the two implementations that C1 exists to prevent. **There is one metric implementation, in TypeScript, in `packages/shared`, and it runs unchanged in the browser and on the server.** The split is by *what the data is*: **SQL** handles the fixed skeleton — fetching, filtering, pagination, search and the operational meta-metrics, none of which touch the JSONB — and the **shared TS engine** handles everything that reads `data`, `robot_status` or the scoring model. The server fetches rows with SQL and hands them to the same engine the browser runs.

### 9.3 Open questions

- ~~**Q9.1** — What statistics do you *actually* use?~~ ✓ **CLOSED 2026-08-20:** all listed Layer-1 aggregations are first-class; everyday use is averages (game pieces) and success rates (e.g. climb). Heatmap-per-match and cycle/event-log views → Topic 10 (visualisation), same metrics.
- ~~**Q9.2** — Formula language or menu builder?~~ ✓ **CLOSED 2026-08-20:** menu builder, **no free-text formula language**; supports multi-field arithmetic (summing, e.g. `auto + teleop`) and a per-page display limit/target value (§9.1).
- ~~**Q9.3** — OPR/DPR/CCWM/EPA from official results?~~ ✓ **CLOSED 2026-08-20:** wanted → §24 nice-to-have (Layer 2), gated on TBA import (§14).
- ~~**Q9.4** **[RAISED BY ME]** — Duplicate (team, match) resolution?~~ ✓ **CLOSED 2026-08-20:** one canonical entry per (team, match) via edit/review — no deliberate redundancy; sync collisions resolved last-write-wins per §7.3 (Q7.5). No averaging of duplicates.
- ~~**Q9.5** **[RAISED BY ME]** — Consistency first-class in ranking?~~ ✓ **CLOSED 2026-08-20:** standard deviation is a **displayed** metric but **not** a ranking sort key; reliability (robot-status) *is* a first-class ranking input.
- ~~**Q9.6** — Recency weighting?~~ ✓ **CLOSED 2026-08-20:** **no** weighting; instead a selectable **match subset** — last N and/or manually excluded matches (§9.1/§9.2 filters).
- ~~**Q9.7** **[RAISED BY ME]** — Percentile / z-score cross-event normalisation?~~ ✓ **CLOSED 2026-08-20: no.** Percentile stays available as a plain aggregation.
- ~~**Q9.8** **[RAISED BY ME]** — Minimum sample size flag?~~ ✓ **CLOSED 2026-08-20:** minimum = **1** (guard against empty/zero-division only); no low-sample flag or refusal.

---

## 10. Dynamic dashboards, graphs & visualisations

**Status: CLOSED 2026-08-21 (Q10.1–Q10.10).** Confirmed requirements below; §10.2 holds the design detail; §10.3 records the closed questions.

### 10.1 Confirmed requirements

- Create statistics and graph pages **dynamically from inside the app**; point charts at specific form fields/metrics.
- **View scope: one event or the whole season (or a season subset).** Metric definitions are season-level and event-agnostic; **scope binds at the dashboard level** (§10.2).
- **Chart set for v1 (Q10.1): everything on the list, high-analysis, including pie/donut.** Bar (grouped/stacked), horizontal bar, line/progression, scatter, radar/spider, box plot, histogram, heatmap (field-position overlay and team×metric), pie/donut, data table with sorting + inline sparklines, single-number stat cards, **cycle-path overlay**, plus the added high-level extras in §10.2 (stacked area, bump/rank-over-time, bullet/target gauge, small-multiples).
- **Dashboards are shared team assets (Q10.2).** Any **saved** dashboard is visible to **all users**; **drafts are private to their session and never shared**. Saving is admin-only; leads build session-only drafts; scouters view. Draft-vs-saved and offline behaviour are unchanged from Topic 5 §5.2 / Topic 7 §7.3 (saving a dashboard needs connectivity; a lead's draft stats page works offline).
- **Built-in dashboards operate on the active event, or a selected event if changed** (season-wide where the view is a season view). The `scope.events` field stays in the config schema (per-event or per-season).
- **Charting library (Q10.6): Recharts** for all standard charts, with the **image overlays (field-position heatmap, cycle-path) and the team×metric heatmap-table hand-built in SVG/Canvas.** ECharts rejected as overkill for the dataset size; design quality is a first-class goal.
- **Mobile density (Q10.5):** when a chart's dimension is **all teams in the event/season**, the phone view shows **top-N and bottom-N** (default **top 8 + bottom 8**) with a "show all" expansion; when the view is **per-game / per-team / any non-all-teams slice, show everything**. **Per-team match views are designed for up to 14 matches** per team at an event.
- **View-time metric selector + expand-to-stack (Q10.9/Q10.10):** a chart can add or swap a metric that shares its **X dimension** (comparable axis/unit); "expand" stacks instances vertically, **capped at 4**.
- **Next-year form change (Q10.3):** a dashboard whose fields no longer exist is **read-only** (renders what it can, flags missing fields). A **re-map wizard** to the new form is **nice-to-have (§24)**.
- **Configurable operational (meta) statistics (Q10.9-ops):** the general/operational statistics page is **built with the same builder, not static**, pointed at **app-metadata data sources** instead of form fields (§10.2). Meta-field catalogue **finalized on Topic 13 close (2026-08-21)** — see §10.2.
- **Deferred to §24 nice-to-have:** export (PNG/CSV/Excel/PDF, Q10.4); drill-down click-through (Q10.7); scouted-vs-official comparison (Q10.8, gated on TBA import).

### 10.2 Design detail

**A chart is a saved configuration**, stored in the database, referencing a form version plus fields/metrics:

```
{
  type: "bar",
  scope: { season: 2026, events: ["2026isde1"], match_types: ["qual"] },
  dimension: { field: "team_number" },          // x axis / rows
  series: [ { metric: "avg_total_pieces" },      // y axis
            { metric: "avg_auto_pieces" } ],
  filters: [ { field: "robot_status", op: "=", value: "played" } ],
  sort: { by: "avg_total_pieces", dir: "desc" },
  limit: 20,
  options: { stacked: true, show_error_bars: true }
}
```

**Metric definitions are season-level and event-agnostic.** A metric/statistic definition never names an event — it is defined for the whole season. **Scope is bound at the dashboard level, not the metric level**, and is fixed when the dashboard is created to either (a) the **full season or a subset of it**, or (b) **exactly one event**. This applies identically to **draft** (lead) and **saved** (admin) dashboards. Some metrics are only meaningful on the current event in practice, but that is a property of the view's scope, not of the definition.

**Chart types (confirmed, Q10.1 — the full high-analysis set):** bar (grouped/stacked), horizontal bar, line (over match number — the progression chart), scatter (two metrics against each other, for finding complementary partners), radar/spider (multi-metric team comparison — very popular in FRC), box plot (distribution and consistency), histogram, heatmap (field position data, or team × metric), pie/donut, **data table** with sorting, inline sparklines and **value shading** (see below) — rendered as a **fixed-height scroll viewport (~8 rows visible) with a frozen header row and a sticky label/first column**, so a table of many scouters or teams stays readable without pushing the rest of the page down — single-number "stat cards", and **cycle-path overlay** (arrowed polylines of Cycle-path routes drawn over the game image, aggregable across matches/teams). **Added high-level extras:** **stacked area** (share of contribution over matches), **bump / rank-over-time** (how a team's ranking moves across the event), **bullet / target gauge** (value against the per-page display limit/target from §9.1), and **small-multiples** (the same chart repeated per team in a grid — the static sibling of expand-to-stack).

**Metrics are type-agnostic.** A metric works on **any field type** — counts, numbers, booleans, ratings, single/multi-select categories, and **time/durations** (Timer values and Event-log-derived cycle times) — with the aggregation menu offering the operations valid for that type (e.g. avg/median/min/max/stddev for numeric and time, rate/percentage for boolean, mode/distribution for categorical). Units and default sort come from the field's semantic metadata (§3.3).

**Dashboards** are ordered collections of charts on a responsive grid, saved with a name, scoped as above (season/subset or single event), and shareable by link. A dashboard has global filters (event, match type, team subset) that all its charts inherit unless overridden.

**Tile layout on the grid.** Charts are placed on a **12-column responsive grid**. Each tile picks a **width span** — e.g. a stat card = 3 columns (four per row), a standard chart = 6 (two per row), a wide chart/table = 12 — and tiles are **drag-reordered**. This is how you put, say, two stat cards on one row. On narrower screens the grid **reflows** to fewer columns and finally to a single stacked column (phone), preserving order. Keep the interaction simple: choose a size (small / medium / full) and drag; no free-pixel positioning.

**View-time metric selector + expand-to-stack.** A chart can expose an **interactive metric selector** (a dropdown shown while viewing, not only at build time) that adds or swaps a metric **sharing the chart's X dimension** (usually match/game) with a comparable axis/unit — e.g. a per-match progression chart on a team page swapping between teleop GP, auto GP, etc. An **"expand"** action stacks instances of the chart **vertically, capped at 4**, each showing a different metric from that pool, so multiple metrics are visible at once one below the other. This is a **view interaction**, not additional saved charts.

**Saved vs. draft dashboards (role split — see Topic 5 §5.2).** Creating and **saving** a persistent dashboard is **admin-only**. A **Lead** can build a **draft statistics page** using the same builder, scoped like any dashboard (season/subset or one event) — though **offline it can only compute over the cached active competition** (§7.3) — but it is **held in session memory only**: viewable live, **never written to the database**, and discarded on **exit** — defined as **logout or closing the app/tab**. It therefore **survives navigation between pages within the session** (the lead can leave it and come back) and can be dismissed manually, but nothing persists once the session ends. **Scouters** view dashboards but create neither kind.

**Builder UX:** pick a chart type → pick the dimension → add one or more series (field or metric + aggregation) → add filters → live preview → save. Aim for "understandable by a 15-year-old in 5 minutes", not Tableau.

**Standard pages that should exist out of the box** (rather than requiring everyone to build them from scratch):

- Team page: all metrics for one team, match-by-match table, progression charts, notes. *(No photos in v1 — Photo field deferred, §3.1.)*
- Ranking page: metrics table (admin-built, one per season) with column-sort and a weighted-composite mode. *(Full UX: §11.2.)*
- Compare page: 2–6 teams — head-to-head "final score" for 2, radar + table for 3–6. *(Full UX: §11.2.)*
- Match preview: six user-entered teams by alliance, with a summed-average score prediction and reliability flags. *(Full UX: §11.2.)*
- Coverage/quality page: which matches are missing data. *(→ §24, gated on TBA schedule import, per Topic 13.)*

Each of these is a **built-in dashboard**. It is reachable **in-context from its home page** — the **team dashboard** from a team page, the **ranking dashboard** (event-scoped) from the ranking page, the **compare dashboard** from the compare page — where the required input (team number, event, team set) is supplied automatically by that page.

**General Dashboards page (the hub).** A dedicated page lists **every dashboard for the active season**: the built-in dashboards above **plus** every admin-saved dashboard. From the hub the user opens any of them; because the hub has no page context, opening a parameterized built-in dashboard **prompts for its input** (e.g. enter a team number to view that team's dashboard for an event, or pick the teams for the compare dashboard) — the same input the dedicated page would otherwise pass in for you. **Admin-created saved dashboards are season-scoped** and appear in this list for the year they belong to.

**Two kinds of statistics (Q10.9-ops, closed 2026-08-21).** The app has (a) the **dynamic robot/team statistics** built by pointing charts at form fields, and (b) **operational (meta) statistics** — data *about the scouting itself*, not robot performance. **(b) is configurable, not static:** it uses the **same dashboard builder** with the **data source switched from form fields to app metadata.** Meta **dimensions**: scouter/user, match, event, form.

**Operational meta-metric catalogue — v1 (finalized on Topic 13 close, 2026-08-21):**

- **Entries submitted per user** — throughput / participation per scouter.
- **Entries submitted per match.**
- **Entries submitted per event / total.**
- **Conflicting-entry count** — the size of the §7.3 review-conflicts queue (genuine offline divergence awaiting lead/admin resolution). There is no separate *duplicate* count: last-write-wins means non-divergent duplicates never persist.
- **Super-scouting coverage** — of the matches that have any recorded entry, how many also have a super-scout entry. Denominator is *recorded* matches, so it needs no imported schedule.

**Deferred (→ §24, gated on TBA schedule import):** schedule-relative coverage — matches scouted vs. **scheduled**, robots covered of 6 per match, teams scouted of total, qualification matches recorded vs. remaining — and the **prebuilt coverage matrix** (Topic 13). Also dropped from v1: pending-sync/outbox count and last-sync time, active-forms-this-season, and fields-per-form (low value; the admin already knows the form structure).

**Meaningful value shading (all dashboards, confirmed 2026-08-21).** Every numeric cell/mark that carries a metric value is **color-scaled from light red (worst) to light green (best)**, so a table or heatmap reads at a glance. Scaling is **per column/metric** (each metric shaded within its own domain, since units differ) and is driven by the field's `direction` semantic metadata (§3), which already has the three states needed — **no schema change**. The domain per metric:

| Metric kind | Color domain |
|---|---|
| Numeric field with a declared `expected_range` | that declared min–max |
| Unbounded numeric (e.g. game pieces, no range) | observed min–max of the **values shown in that column under the dashboard's current scope + filters** — so the same team's value can shade differently on an event dashboard vs. a season dashboard, because the reference population changed |
| Percentage / rate (success rate, etc.) | fixed **0–100 %** (absolute level matters, not rank within the set) |
| **Ordinal enum** (e.g. climb level None→Deep) | option **rank by builder list order** (top of the list = lowest rank); aggregations (avg/median across matches) run on the rank index, so "avg climb level" is a colorable, sortable number |
| `direction: neutral` | **no scale** — flat single color (values aren't ordered good→bad, e.g. start position, robot number) |

`direction: lower_is_better` **inverts** any scale (green = low), covering climb time, cycle time, fouls, tip-over rate. **Capture-time convention:** for an ordinal enum, the admin must list options **worst → best** at field creation, because that order becomes the rank — it cannot be inferred later.

**Operational meta-metrics** have no field-level `direction` or `expected_range`, so they shade against the **observed min–max of the population shown** and default to **higher-is-better** (more entries / more coverage = green) — e.g. a team with 2 recorded matches shades red, one with 10 shades green, relative to that column.

**Shading edge cases (confirmed 2026-08-21):**

- **No data** — a cell with no value for that metric renders as a **distinct grey "—"** and is **excluded from the column's min/max domain**. Missing data must never look like a bad value (the confusion §13.1 warns about).
- **All-equal / single row** — when a column's min == max (every value identical, or only one row), shading falls back to a **flat mid-color**; inferring "best" or "worst" from one data point would be dishonest.
- **Colorblindness** — the red→green scale must also vary **lightness monotonically** (so it degrades to a legible light→dark ramp for red-green colorblind users, ~8% of males) **and the numeric value is always shown in the cell.** Color is a fast cue, never the only channel.

### 10.3 Closed questions

- ~~**Q10.1**~~ ✓ **Full high-analysis chart set incl. pie/donut, plus stacked-area, bump/rank, bullet-gauge, small-multiples** (§10.1/§10.2).
- ~~**Q10.2**~~ ✓ **Shared:** any saved dashboard is visible to all users; drafts are session-private, never shared; saving admin-only (§10.1, Topic 5 §5.2).
- ~~**Q10.3**~~ ✓ **Read-only** when fields no longer exist; **re-map wizard → §24 nice-to-have.**
- ~~**Q10.4**~~ ✓ **Export → §24 nice-to-have.**
- ~~**Q10.5**~~ ✓ **Top-8 + bottom-8 on phone for all-teams charts (show-all expansion); everything shown for per-game/per-team slices; per-team match views designed for up to 14 matches.**
- ~~**Q10.6**~~ ✓ **Recharts** for standard charts; **image overlays + team×metric heatmap hand-built in SVG/Canvas**; ECharts rejected as overkill.
- ~~**Q10.7**~~ ✓ **Drill-down → §24 nice-to-have.**
- ~~**Q10.8**~~ ✓ **Scouted-vs-official → §24 nice-to-have, gated on TBA import.**
- ~~**Q10.9**~~ ✓ **Metric selector/expand pool = metrics sharing the chart's X dimension** (comparable axis/unit).
- ~~**Q10.10**~~ ✓ **Expand-to-stack capped at 4.**
- ~~**Q10.9-ops**~~ ✓ **Operational stats are configurable via the same builder over app-metadata sources, not a static page** (§10.2); meta-field catalogue finalized at Topic 13 close. *(This is the original 2026-08-18 Q10.9 — "what belongs on the general stats page" — now answered: it's builder-driven, not a fixed page.)*

---

## 11. Search, ranking & browse

### 11.1 Confirmed requirements

- Search for teams and entries, rank teams, compare teams, and preview matches — via dedicated pages (§11.2).

### 11.2 Confirmed decisions

*(Confirmed 2026-08-21 on closing topic 11.)*

**Terminology.** A **"form"** in a user's words = a submitted **entry** (one robot's record for one match), which is distinct from the form **template** (§3). This section uses **entry** for the record.

**No global omnibox** — the browse/search surface is a set of **dedicated pages** (simpler, matches how the team thinks). The old single-search-box proposal is dropped.

**Canonical basic rank.** Everywhere a generic "rank" is needed, it is the **status-aware average points per match** — the mean of a team's *played* match scores, with **no-show / disabled robots excluded, never counted as 0** (Topic 6/9). This is the default sort on every ranked view.

**Event switching is offline-disabled.** Any action that switches the active competition is **disabled offline** — Topic 7 caches only the active competition, so another event's data (and a team's cross-event history) isn't on-device. This applies to every switch entry-point, including the one on the team search page below.

**The pages:**

**1. Team search page.** Searches **all teams in the season** by number or name. Each team in the **active event** shows a **small side rank badge**; the **top 3 get a medal icon**. Teams not in the active event show no rank.
- Team **in the active event** → button → that team's **statistics page** (the Topic 10 team dashboard).
- Team **not in the active event** → a **differently-styled button** → pick from the **events that team competed at** (events where we hold entries for it) → **"are you sure?" confirmation** → on yes, **switch the active event as a session-only override** (never saved as the admin default, per §4.1 — this is logged as an additional guarded override entry-point) and land on that team's stat page. Disabled offline (see above).

**2. Entry (form) preview page.** A read-only, nicely formatted rendering of a **single entry**: all field values laid out **by phase**, plus the entry's **scouted score (points)**, team, match, scouter, form kind, and timestamp.

**3. Entry (form) search page.** Lists entries of the **active competition only**, **both match and super kinds with a kind filter**. Searchable by **team name, team number, match number, scouter name**. Each row shows the entry's **scouted points**. Row / button → the entry preview page (2).

**4. Ranking page** *(also the Topic 10 §10.2 "ranking" built-in dashboard).* Backed by a single **admin-built ranking dashboard — one per season, edited in place (no versioning)** — that defines the table's metric **columns**. Layout: the **metrics table first**, then charts / other metrics below. **Only the table's built-in metrics** can drive **column-click reordering** and be weighted. **Reliability/availability** (Q9.5) is one of those selectable, sortable, weightable columns.
- **Weighting mode** (toggle): each metric is normalized **min-max to 0–1** (for a `lower_is_better` metric the normalized value is inverted as **`1 − normalized`**, so higher is always better), each is given a **weight** (auto-normalized — they need not sum to 1), and teams are ranked by the **weighted sum**. A per-team **contribution breakdown** shows how much each metric added to the final score.
- **Missing metric for a team:** the table cell shows a grey "—"; in the weighted composite it counts as **0.5** (the neutral midpoint) so it neither sinks nor inflates the team.
- **Weight presets:** an admin can **save named weight presets** (these seed the Topic 12 pick list); a lead can adjust weights live but **session-only**; **offline, weights can be changed but not saved** (Topic 7). Normalization population = the ranked teams under the dashboard scope (the active event by default).

**5. Compare page** *(Topic 10 §10.2 "compare" built-in).* Compares **up to 6 teams** on an **admin-built compare metric set (one per season, no versioning) computed over the active event**.
- **2 teams:** a "final-score" **head-to-head scoreboard** — a big avg-points headline per team, then per-metric rows with the better value highlighted.
- **3–6 teams:** **radar + table**, designed to a high visual standard.

**6. Match preview page** *(Topic 10 §10.2 "match preview" built-in).* The **user enters the six teams** (3 red + 3 blue) — v1 has no schedule (TBA deferred, §24); TBA later auto-fills them. Shows the six teams grouped by alliance with their key metrics.
- **Prediction:** each alliance's predicted score = the **sum of its three teams' status-aware avg points/match**; the higher total is the predicted winner; shows **each team's contribution and the predicted margin**.
- Also surfaces **per-robot reliability / no-show flags** and each team's **top strengths**.

### 11.3 Closed questions

- ~~**Q11.1**~~ ✓ **CLOSED 2026-08-21:** yes — composite **weighted ranking** on the ranking page (min-max 0–1 per metric, `1 − norm` for lower-is-better, weighted sum, per-team contribution breakdown, admin-saved presets that seed Topic 12).
- ~~**Q11.2**~~ ✓ **CLOSED 2026-08-21:** full-text **notes search → §24 nice-to-have** (needs a Postgres text index + an offline story).
- ~~**Q11.3**~~ ✓ **CLOSED 2026-08-21:** **no multi-season team-history view** — out of scope.
- ~~**Q11.4**~~ ✓ **CLOSED 2026-08-21:** **TBA public info on the team page → §24 nice-to-have**, gated on the TBA import.
- ~~Global search omnibox~~ ✓ **Dropped** in favour of dedicated search pages.

---

## 12. Alliance selection & pick list

**Status: CLOSED 2026-08-31 (Q12.1–Q12.3).** §12.1 keeps the rationale; §12.2 holds the confirmed decisions; §12.3 the data model; §12.4 the page design; §12.5 the closed questions.

### 12.1 Why I'm raising this **[RAISED BY ME]**

You didn't mention it, but it's the reason scouting exists. Everything the app collects over two days is spent in a 20-minute window where a lead must respond in seconds to "team 254 just got picked, who's next?". If the app doesn't support that moment, the data doesn't get used.

### 12.2 Confirmed decisions

*(Confirmed 2026-08-31 on closing topic 12.)*

**In scope for v1 (Q12.1),** and **moved from Phase 3 to Phase 2** (§19.1). The original Phase 3 bundled the pick list with the TBA/FRC import, which is deferred to §24 — but the pick list needs nothing TBA provides (no schedule, no official results), so leaving it there would have deferred it by association.

**Ownership — the admin owns everything, with exactly one exception (Q12.3).** No collaborative editing: **single editor, many viewers.**

- **Admin only:** create the pick lists, reorder them, add/remove teams, edit or remove do-not-pick entries, and record the alliance bracket.
- **Lead:** may **add a team to the do-not-pick list with a required reason** — and nothing else. A lead cannot reorder a pick list, cannot add or remove a team on one, and cannot edit or remove a do-not-pick entry (not even one they created).
- **Scouter and Lead:** read-only view of the pick lists, the do-not-pick list and the alliance bracket (consistent with §5.1 — all data is visible to every role).

**Two ordered pick lists per event: `first` and `second`.** Different criteria justify different lists (a first pick complements you; a second pick is often defensive or specialised). Each is an ordered list of teams built by **drag-reorder** and **seeded from a ranking weight preset** (§11.2): the admin picks a saved preset (or the ranking page's current live weights) and the list is generated in that weighted-composite order, then hand-adjusted. **Reseeding replaces the whole order and asks for confirmation first**, because it discards manual adjustments.

Each row shows: **rank position**, team number + name, the **canonical basic rank** (status-aware avg points/match, §11.2), the **reliability/availability counts** (breakdowns / no-shows / disabled, §9.2), the **seeding preset's metric columns**, and the team's **inline notes**.

**Second-pick round awareness.** The app tracks which round selection is in. While any alliance still has an empty `pick1` slot the **first-pick list** is the active list; once all 8 alliances have a first pick the app **switches to the second-pick list automatically** (manually overridable both ways). Only the active list is emphasised; the other stays viewable.

**Do-not-pick list — its own list, reason required, blocking by default.**

- Adding a team **requires a free-text reason** — no reason, no add. The author is recorded on the entry.
- **A team on the do-not-pick list cannot be added to a pick list.** The add action is **blocked**, showing the reason and who wrote it. To pick that team you must first remove them from the do-not-pick list.
- **Exception — the team is *already* on a pick list when it gets do-not-picked:** this is **flagged, never blocked**. The team stays exactly where it is in the order, is rendered with a warning marker, and a banner tells the admin to resolve it. A lead's addition therefore never fails and never silently reorders the admin's list.
- **One-tap removal, from the do-not-pick page itself.** Every row carries a remove action in place (inline confirm — no dialog chain, no navigating to another screen). Removing an entry **clears any pick-list flag it caused, immediately**.

**Alliance bracket — manual entry, synced when possible (Q12.2).** No import: TBA is deferred (§14 → §24) and the official feed lags by minutes, which is useless in a room where a pick happens every 30 seconds.

- **8 alliances × 3 robots** — `captain`, `pick1`, `pick2` — plus an optional **`backup`** slot per alliance.
- The admin enters each result manually as selection happens. Every entry **writes locally first** (optimistic local UI, §8.1) and **syncs immediately if there is internet, otherwise on the next sync** — the ordinary §7.3 outbox path. This matters because selection is watched from the stands, where there is usually no signal.
- **Declined pick.** A team that declines is recorded as **declined against that alliance**. It stays available to be picked later (or to become a captain) per FRC rules, and the app shows a "declined — alliance N" marker so nobody asks twice or wastes a pick.
- **Live cross-off.** As captains, picks, and backups are entered, every affected team is **struck through automatically across both pick lists**, so the top unstruck row is always the next available team.

**Cross-off propagation, with realtime deferred (§8.1).** On the **admin's own device** cross-off is instant (local optimistic write). **Viewers online** see it on the standard **45-second auto-refresh** or a manual refresh. **Viewers offline** see nothing until they sync. The operating rule is therefore explicit: **during selection the admin's device is the source of truth**, and every other screen is advisory. If cross-device realtime lands later (§24) it upgrades this with no design change.

**Offline behaviour.** Pick lists, the do-not-pick list and the alliance bracket are all **editable offline** and sync through the outbox. This **extends §7.3**, which previously said only "the admin-only pick list" — it now covers all three surfaces, and records that a **lead may add a do-not-pick entry offline** too.

**Reordering is one operation against a list-level version. [decided-by-Claude]** §7.3's last-write-wins is a *per-row* rule, but a pick list is an **ordering** — two devices reordering the same list offline would silently discard one person's entire reordering. So the `pick_lists` row carries **its own version**, and a drag-reorder writes the **whole ordering as a single operation** stamped with the base version it started from. Fast-forward → applied and the version bumps. Genuine divergence → the §7.3 **review-conflicts** queue with the superseded ordering preserved. Individual team rows (add / remove / edit note) remain ordinary last-write-wins rows. Single-editor ownership makes this rare; the guard exists so that when it happens, nobody loses an hour of ordering work.

**Printing stays deferred.** A printed pick list for the pit is standard practice, but it rides on the deferred export work (Q10.4 → §24), so **v1 is screen-only**. **Q16.4** (printable views) is now **closed — printing is out of scope**; only the blank paper backup form survives, in §24. **[RAISED BY ME]**

**No pick-list history and no ordering snapshots** — consistent with "no per-entry edit history" (§13.2) and "no user audit log" (§5.1). The bracket's `declined` markers are the only historical record the feature keeps.

### 12.3 Data model

```
pick_lists(id, event_id, kind ∈ {first, second}, seeded_from_preset_id?, version, updated_at)
pick_list_entries(id, pick_list_id, team_id, rank, note?, deleted_at?)

do_not_pick(id, event_id, team_id, reason /* required */, created_by, created_at, deleted_at?)

alliances(id, event_id, number 1..8)
alliance_slots(id, alliance_id, slot ∈ {captain, pick1, pick2, backup}, team_id?, deleted_at?)
alliance_declines(id, alliance_id, team_id, created_at)
```

`rank` is a per-list integer rewritten **wholesale** by a reorder operation (§12.2); `version` exists on `pick_lists` only — it is the ordering guard. Everything is scoped to one **event** (§4.1), client-UUID keyed, soft-deleted (`deleted_at`), and rides the §7.3 outbox. Cross-off state is **derived** from `alliance_slots`, never stored on the pick list — so a corrected bracket instantly corrects every list (same principle as derived scores, §2.2).

### 12.4 The pages

One **"Alliance selection"** area with three tab-switched pages:

1. **Pick list page** — the active-round list (first/second toggle plus automatic round detection), drag-reorder for the admin, automatic strikethrough for taken teams, do-not-pick warning markers, inline notes, a reseed-from-preset action, and a **compact "next available team" header** designed to be readable at arm's length in a loud arena.
2. **Do-not-pick page** — every flagged team with its reason and author, a **one-tap remove** per row, and an "add team" action available to leads as well as the admin.
3. **Alliance bracket page** — the 8 alliances × captain / pick1 / pick2 / backup grid; tap a slot to enter a team; declined markers shown against the alliance that was refused.

### 12.5 Closed questions

- ~~**Q12.1**~~ ✓ **CLOSED 2026-08-31:** **in scope for v1**, and **moved from Phase 3 to Phase 2** (§19.1) — it depends on nothing from the deferred TBA import.
- ~~**Q12.2**~~ ✓ **CLOSED 2026-08-31:** alliance-selection results are **entered manually**; each entry writes locally and **syncs immediately when online, otherwise on the next sync** (§7.3 outbox). No API import.
- ~~**Q12.3**~~ ✓ **CLOSED 2026-08-31:** **no collaborative editing** — the **admin edits, everyone else views**. Single exception: a **lead may add a do-not-pick entry with a required reason**, and may not edit or remove one.
- ~~Live cross-off assumes realtime~~ ✓ **Resolved:** cross-off is instant on the admin's device, reaches online viewers on the **45 s auto-refresh**, and offline viewers on sync; the admin's device is the declared source of truth during selection (closes the §8.2 dependency note).

---

## 13. Data quality, integrity & scouter reliability

### 13.1 Why I'm raising this **[RAISED BY ME]**

Scouting apps don't fail because of bad charts. They fail because 30% of the matches are missing, one scouter recorded the wrong robot, and someone entered 47 game pieces when the maximum possible is 9 — and nobody noticed until the pick list was being made. Detection has to be part of the product.

### 13.2 Confirmed decisions

*(Confirmed 2026-08-21 on closing topic 13.)*

- **Entry-time validation = hard range block only** (Q13.4). Submission is **blocked** only when a numeric value falls **outside the field's declared `expected_range`** (min/max set at field-creation time, §3). Fields without an `expected_range` have no block. **No cross-field rules and no outlier blocking** in v1 — reality is weirder than any rule, and a hard cross-field rule risks losing a legitimately unusual match.
- **Outlier / distribution flagging → §24 nice-to-have** (Q13.1). Advisory warnings for values far outside a team's or the event's distribution are wanted but deferred; nothing is ever auto-excluded or silently averaged out.
- **Coverage matrix → §24 nice-to-have, gated on TBA schedule import** (Q13.1). The matches × robot-stations grid cannot mark a cell "missing" without a master schedule, and v1 has no imported schedule (§14 → §24). It returns when TBA import lands.
- **No redundant-scouting feature** (Q13.2). Deliberate double-scouting of the same robot and agreement measurement are **not** built. If two entries for the same `(team, match)` ever exist (offline divergence), they are handled by the **existing §7.3 path**: last-write-wins live, and only genuine divergence is surfaced to the lead/admin **"review conflicts"** queue with the superseded version preserved. The **conflicting-entry count** meta-metric (§10.2) is simply the size of that queue.
- **No scouter reliability score** (Q13.3). Not computed, not displayed, not used for weighting — the team considers it socially counter-productive.
- **No dedicated bulk-fix tools** (Q13.5). The two operations that actually happen are covered by existing mechanisms: **reassigning an entry to the correct team = editing the team on that entry** (normal edit, within §5.2 edit permissions); **merging duplicates = resolving the §7.3 review-conflicts item**. Bulk match-number shifting and shift-deletion are **out of scope for v1**.
- **No full per-entry edit history** (resolves the dangling Q5.5 cross-reference). Routine edits **overwrite** last-write-wins; only §7.3 divergence preserves the superseded copy. This is consistent with "keep the last" (Q13.2) and with the no-audit-log decision (Q5.5).

**Net effect:** Topic 13 adds **no new v1 surface** beyond the hard range-block at entry (which rides on the already-required `expected_range`) and the **operational meta-metrics** finalized in §10.2. The richer integrity tooling (coverage matrix, outlier flags) is real but deferred behind TBA import.

### 13.3 Closed questions

- ~~**Q13.1**~~ ✓ **CLOSED 2026-08-21:** coverage matrix **and** outlier flagging → **§24 nice-to-have** (coverage matrix gated on TBA schedule import).
- ~~**Q13.2**~~ ✓ **CLOSED 2026-08-21:** no redundant-scouting feature; conflicts handled by the existing §7.3 review-conflicts path (keep last, preserve superseded).
- ~~**Q13.3**~~ ✓ **CLOSED 2026-08-21:** no scouter reliability score.
- ~~**Q13.4**~~ ✓ **CLOSED 2026-08-21:** hard block only on out-of-`expected_range` values; outlier warnings are advisory and deferred (§24).
- ~~**Q13.5**~~ ✓ **CLOSED 2026-08-21:** no dedicated bulk-fix tools; reassign = edit the entry's team, merge = resolve a review-conflict.

---

## 14. External data integration (TBA / FRC Events API)

**CLOSED 2026-09-01 — deferred in full to §24 nice-to-have. Nothing in this topic is in v1 scope.** The section is kept as the *recorded design* so that when the import is eventually built it starts from decisions rather than a blank page. Everything that depends on it is already gated elsewhere: schedule-driven scouter assignments (§6.2, Q6.2), Layer-2 official-result statistics (§9 → §24), scouted-vs-official comparison (Q10.8 → §24), the scouting coverage matrix (§13 → §24) and TBA public info on the team page (Q11.4 → §24). v1 therefore has **no external data source at all**: events, teams and matches are entered by hand (Q4.5 — no `source` field).

### 14.1 Why it is wanted **[RAISED BY ME]**

Manually typing 40 team numbers and 100 matches into an app at 8am on competition day is both miserable and error-prone, and it's unnecessary: **The Blue Alliance API** and the official **FRC Events API** provide the event list, team list, match schedule, and match results for free. This one integration removes most manual setup and enables schedule-driven assignment (topic 6) and result validation (topic 13). It is deferred, not rejected — it is the highest-value item in §24.

### 14.2 Recorded design for when it is built (**not v1 scope**)

- **Server-side integration** (API keys never in the browser) with a scheduled/triggered sync that imports: seasons, events, teams per event, match schedules, match results, and optionally team awards and photos.
- **Imported data is stored in our own tables**, so the app works offline and doesn't depend on a third party being reachable at the venue. Sync runs beforehand, at the hotel.
- **A manual fallback always remains**: paste/upload a schedule, or enter matches by hand — for an unofficial scrimmage, or when the API is unavailable. In v1 this fallback *is* the only path, so it must never be rebuilt later as a degraded mode of the import.
- **The API key is obtained when the feature is built** (Q14.2). A TBA read key is free from a TBA account; nothing needs requesting now. When it exists it is a **server-side-only** credential (§18.1) held in the server project's environment, and it is covered by the account transfer checklist of Q18.5 — nothing about it may depend on a personal identity.
- **Match results are imported, not only the schedule** (Q14.3) — scores, ranking points and winners. Schedule-only import would strand the two features that justify the work: Layer-2 statistics (OPR/DPR/CCWM) and scouted-vs-official validation.
- **Manual "sync now" plus an automatic sync whenever the device is online** (Q14.4), the automatic pass throttled and never blocking the UI. Venue connectivity is unreliable (§7.2), so the manual button is the guarantee and the automatic pass is the convenience — not the reverse.
- **A re-imported schedule reconciles; it never blindly overwrites** (Q14.5). Schedules change at events — replays, surrogate matches, delays. Rules recorded now: existing entries stay bound to the `(team, match)` they were collected against; a match whose teams changed or which disappeared is **flagged for human review**, never silently rewritten or deleted; **surrogate matches are marked** so the metric engine can exclude them; and a re-import is presented as a **diff to confirm**, not an automatic mutation.

### 14.3 Closed questions

- ~~**Q14.1** — Do you want this integration? TBA, the official FRC Events API, or both?~~ ✓ **CLOSED 2026-08-14: wanted, deferred → §24 nice-to-have.**
- ~~**Q14.2** — Do you have (or can you get) a TBA read API key?~~ ✓ **CLOSED 2026-09-01: obtained when the feature is built** — free, server-side only, covered by the Q18.5 transfer checklist (§14.2).
- ~~**Q14.3** — Should match **results** be imported, or only the schedule?~~ ✓ **CLOSED 2026-09-01: results too** (§14.2).
- ~~**Q14.4** — How often should it sync during an event?~~ ✓ **CLOSED 2026-09-01: manual "sync now" + throttled automatic sync when online** (§14.2).
- ~~**Q14.5** **[RAISED BY ME]** — Schedules **change** at events. Do you need to handle a re-imported schedule that conflicts with collected data?~~ ✓ **CLOSED 2026-09-01: yes — reconcile-and-flag, never blind overwrite; surrogates marked; re-import shown as a diff to confirm** (§14.2).

---

## 15. System architecture, repo layout & services

### 15.1 Confirmed requirements

- One repository, separate client and server projects, deployed as separate services.
- Supabase as the database.
- Deployment on Vercel.
- **TypeScript everywhere** (Q15.2, Q15.4). Client: **React + Vite** PWA. Server: **Node + Hono**. A shared `packages/shared` holds the metric engine, form-definition model and Zod schemas so the offline (browser) and server code paths are literally the same code. *(confirmed 2026-08-14)*
- **All traffic goes through the server API** (Q15.1) — no direct client→Supabase access on the hot path. Load is low, and this is clean now that cross-device realtime is deferred (topic 8, §24). *(confirmed 2026-08-14)*
- **Transport-agnostic use-case layer** (Q15.8): every operation is a named, typed, described use case (Zod in/out) in `packages/shared` / `server/core`; HTTP is the transport now, MCP mappable mechanically later. *(confirmed 2026-08-14)*
- **Dynamic-form validation is generated at runtime from the field definitions.** Hand-written Zod covers only the fixed skeleton and the use-case tool inputs/outputs; a new season's form needs no code change. *(confirmed 2026-08-14)*
- **Server framework: Hono. No tRPC** (Q15.3). The typed client is derived from the **use-case registry itself** — every use case already carries a Zod input schema, a Zod output schema and a plain-language description because MCP needs them, so end-to-end typing between client and server falls out for free. tRPC would be a second typing layer over that same registry and contributes nothing to the MCP mapping, which needs name + JSON Schema + description rather than a tRPC router. *(decided-by-Claude 2026-08-31)*
- **Generated Supabase database types, and Zod shared between client and server** (Q15.5). DB types are generated by the Supabase CLI and committed, so a migration that changes a column surfaces as a **compile error** rather than a runtime surprise; the Zod schemas in `packages/shared` are the single validation source for both sides. *(confirmed 2026-08-31)*
- **No Supabase Storage and no binary uploads in v1** (Q15.6). The **season game image ships as a static client asset** — `apps/client/public/seasons/<year>/field.webp` — committed to the repo and deployed with the client. The database stores **only the path string** on the season row, never the image. The service worker precaches it with the app shell, which is exactly what makes **offline** field-position and cycle-path entry work (Q15.12) at no cost to the §7.3 offline budget. *(confirmed 2026-08-31)*
  - **Consequence:** adding a season needs a commit and a redeploy. Acceptable — it happens once a year, months before an event — but it belongs in the new-season checklist in `docs/ops/SETUP.md` (§18.1).
  - **The image is immutable once entries exist.** Every stored `{x, y}` is normalized against that exact image, so swapping it silently re-frames all historical position and cycle-path data. A new image means a **new filename** and a new form version — the same family of rule as permanent field keys (§3.1).
  - **A missing image must fail loudly.** The position picker and cycle-path fields show an explicit error, never a blank canvas that quietly records meaningless coordinates.
- **A full development environment mirroring production** (Q15.7): a **separate dev Supabase project**, a **separate dev Vercel deployment**, and a local setup that runs both apps against the dev project. Development never touches production data — especially not while testing destructive features like "delete form" (§3.1 cascade delete). *(confirmed 2026-08-31)*
- **MCP transport = a route inside `apps/server`**, extractable to its own `apps/mcp` later (Q15.9). **Not built in v1** — the decision is recorded now only so the use-case layer is shaped correctly; the route itself belongs to phase 5. *(confirmed 2026-08-31)*
- **PWA update policy** (Q15.11). `vite-plugin-pwa` precaches the app shell and the season assets. A new version is **never applied by auto-reload**: it activates on the **next cold start**, the running app shows a discreet "update ready" hint, and a **version string is always visible** for diagnosing "my tablet behaves differently". A service worker that reloads the tab mid-match would destroy a scouter's screen at the one moment it matters. *(confirmed 2026-08-31)*
- **Deployment topology** (Q15.13). **Two Vercel projects from the one repository** — client as a static build, server as Vercel Functions. Client→server is therefore cross-origin, so **authentication uses a bearer token in an `Authorization` header, never cookies**, which sidesteps CORS credentials and `SameSite` entirely. *(confirmed 2026-08-31)*
- **Toolchain pinning** (Q15.14). **pnpm workspaces + Turborepo**; the pnpm version pinned via `packageManager`; **Node 22**; and the **Node runtime (not Edge)** for every server function, since the service-role Supabase client and the shared engine assume Node. A lint rule keeps `packages/shared` **browser-safe** — no Node built-ins, no service-role client — because the client bundles it. *(confirmed 2026-08-31)*
- **No generated per-form-version SQL views** (C1, amends §3.1). Flattening lives **only in the shared TypeScript engine**. Generating views at form-publish time would make the server run `CREATE VIEW` against the live database — putting part of the schema outside the repo's migrations (breaking "the schema is reproducible from the repo alone"), handing the app DDL privileges in production, and creating a **second** flattening implementation that will drift from the TS one and that nobody will test. Nothing in v1 reads them; ad-hoc SQL queries the JSONB directly. Deferred → §24. *(confirmed 2026-08-31)*

### 15.2 Architecture detail (confirmed)

**Repository layout** (monorepo with pnpm workspaces + Turborepo):

```
frc-scouting/
  apps/
    client/          # the PWA — React + Vite + TypeScript
      public/
        seasons/2027/field.webp   # the season game image: static, precached,
                                  # only its path is stored in the DB (Q15.6)
    server/          # API service — Node + Hono on Vercel Functions (Node runtime, not Edge)
  packages/
    shared/          # TypeScript types, Zod schemas, form-definition model,
                     # metric evaluation engine (shared by client offline + server).
                     # Browser-safe: no Node built-ins, no service-role client.
    db/              # Supabase migrations, generated DB types, seed data
  docs/
    spec/            # this document
    plans/           # implementation plans
    ops/             # SETUP.md (Supabase + Vercel setup) and .env.example (§18.1)
  .github/
    workflows/       # CI — lint, typecheck, test, build on every push to `develop`
```

A shared package is important here: the form model, the validation rules, and the metric engine must behave identically online and offline, and duplicating them in two languages guarantees drift.

**What is the server actually for?** *(Resolved — Q15.1.)* **All traffic goes through the server API; the client never calls Supabase directly.** The server (service role) owns every path:

| Path | Used for |
|---|---|
| Client → Server → Supabase (service role) | **Everything** — reads, scouting-entry writes, form creation/versioning and view generation, user provisioning and role changes, exports, aggregations, and (deferred) TBA/FRC imports. |

The earlier **hybrid** proposal (client → Supabase directly for reads + **realtime subscriptions**) was rejected. Its one real advantage was Supabase Realtime, and cross-device realtime is now **nice-to-have** (§8, §24). A single control point gives cleaner authorization (§5.2 use-case-layer checks, no RLS), easier auditing, and the mechanical MCP mapping. **Optimistic local UI stays** — the client applies its own writes instantly and reconciles on server confirm (§8.1) — and a **45-second refresh** covers cross-device propagation without WebSockets.

**Transport-agnostic service layer — required by the MCP goal. [RAISED BY ME]**

Because stage two is exposing this data to an LLM over MCP, the server must not be written as a pile of HTTP route handlers with logic inside them. Instead, every meaningful operation becomes a named, typed **use case** in `packages/shared` or a `server/core` module:

```
core/
  queries/    getTeamStats, rankTeams, compareTeams, getMatchSchedule,
              queryEntries, getCoverageReport, searchNotes, getFormDictionary
  commands/   createForm, publishFormVersion, upsertEntry, setPickList, importEvent
```

Each one has a Zod input schema, a Zod output schema, and a plain-language description.

**Every use case takes the caller as its first argument** *(Q20.16, confirmed 2026-09-02)*. The signature is `useCase(caller, input)`, where

```ts
type Caller =
  | { kind: 'user';    userId: string; role: 'scouter' | 'lead' | 'admin' }
  | { kind: 'service'; label: string }   // non-human, read-only: a future MCP session
```

Authorization (§5.1 — enforced here, not in the database) reads **that argument and nothing else**: never the Hono context, never a request object, never ambient state. Each transport builds the caller at its own edge: HTTP from the Q15.13 bearer token, MCP (phase 5) from its own token as a `service` caller, and the CLI as a **`user` caller naming an existing admin account**, passed by an explicit flag — CLI scripts run imports and backfills, which are `commands/`, and a `service` caller is rejected by every one of them (§20.1, Q20.6). The **dev seed script is not a use-case caller at all**: it is a database-level command in `packages/db` (§18.1) that writes rows directly, which is what lets it run in phase 0 before auth and roles exist (§19.2). This rule is what makes "transport-agnostic" true rather than aspirational: a use case that reaches for the HTTP request only ever works behind HTTP, so adding the MCP transport later would mean changing the signature, every call site and every test of every use case.

Three thin transports then sit on top of the same functions:

| Transport | Consumer |
|---|---|
| HTTP (Hono) | the web client |
| MCP tools | an LLM (Claude Desktop, Claude Code, or your own in-app agent) |
| CLI / scripts | imports, backfills, testing |

The pay-off is that MCP support becomes a mechanical mapping — a Zod schema converts directly to the JSON Schema an MCP tool advertises, and the description you already wrote becomes the tool description the model reads. If we don't do this, MCP means writing a second, parallel implementation of every query, and the two will drift.

**This registry is also why tRPC was rejected (Q15.3).** The typed client is generated from the same registry the MCP tools will be generated from, so tRPC would add a dependency and a router format on top of a layer that already provides end-to-end types — and it would still not emit the JSON Schema an MCP tool needs.

**Constraints to design around on Vercel:** serverless functions are stateless and time-limited, so no long-running import jobs — chunk them, or run them as Vercel Cron invocations. No local filesystem persistence. Cold starts exist, so don't put the scouter's critical path behind a rarely-called function.

### 15.3 Closed questions

- ~~**Q15.1** — Do you accept the **hybrid** access model, or all traffic through the server API?~~ ✓ **CLOSED 2026-08-14: all traffic through the server API** (§15.1).
- ~~**Q15.2** — Client framework: Vite + React SPA or Next.js?~~ ✓ **CLOSED 2026-08-14: React + Vite PWA** (§15.1).
- ~~**Q15.3** — Server framework, and do you want tRPC?~~ ✓ **CLOSED 2026-08-31: Hono, no tRPC** — the typed client comes from the use-case registry, which tRPC would only wrap (§15.1). *(decided-by-Claude)*
- ~~**Q15.4** — TypeScript everywhere?~~ ✓ **CLOSED 2026-08-14: yes** (§15.1).
- ~~**Q15.5** **[RAISED BY ME]** — Generated database types and shared Zod?~~ ✓ **CLOSED 2026-08-31: yes to both** (§15.1).
- ~~**Q15.6** **[RAISED BY ME]** — Where do file uploads go?~~ ✓ **CLOSED 2026-08-31: no uploads and no Supabase Storage in v1** — the season game image is a static client asset committed to the repo; the DB stores only its path (§15.1). Robot photos remain deferred (§3.1).
- ~~**Q15.7** **[RAISED BY ME]** — Do you need a local development setup that never touches production data?~~ ✓ **CLOSED 2026-08-31: yes — a full dev environment** (dev Supabase project + dev Vercel deployment + local run) (§15.1, §18.1).
- ~~**Q15.8** **[RAISED BY ME]** — Do you accept the **use-case / transport-agnostic service layer**?~~ ✓ **CLOSED 2026-08-14: yes** (§15.1).
- ~~**Q15.9** **[RAISED BY ME]** — Is the MCP server its own app or a route in the server app?~~ ✓ **CLOSED 2026-08-31: a route inside `apps/server`**, extractable later — and **built only when the MCP work itself happens** (phase 5), not in v1 (§15.1).
- ~~**Q15.10** **[RAISED BY ME]** — Generated per-form-version SQL views require runtime DDL, which contradicts "the schema is reproducible from the repo alone".~~ ✓ **CLOSED 2026-08-31: views dropped from v1 → §24**; the shared TS engine is the only flattening path (§15.1, amends §3.1).
- ~~**Q15.11** **[RAISED BY ME]** — How does a PWA update reach devices without disrupting a scouter?~~ ✓ **CLOSED 2026-08-31: precached shell, update on next cold start only, never an auto-reload, visible version string** (§15.1).
- ~~**Q15.12** **[RAISED BY ME]** — The season game image must be available offline or position-picking breaks.~~ ✓ **CLOSED 2026-08-31: solved by Q15.6** — as a static asset it is precached with the app shell, so no separate offline budget or cache path is needed (§15.1).
- ~~**Q15.13** **[RAISED BY ME]** — Vercel topology and the cross-origin consequence.~~ ✓ **CLOSED 2026-08-31: two Vercel projects from one repo; bearer token in a header, no cookies** (§15.1, §18.1).
- ~~**Q15.14** **[RAISED BY ME]** — Runtime and toolchain pinning.~~ ✓ **CLOSED 2026-08-31: pnpm + Turborepo, pinned pnpm, Node 22, Node runtime not Edge, `packages/shared` kept browser-safe by lint rule** (§15.1).

---

## 16. UI/UX design system & responsive behaviour

### 16.1 Confirmed requirements

**Language & direction**

- Must look good and work well on both phone and computer screens.
- **App chrome is English and LTR** (kept simple); **form content is Hebrew** — labels and free-text notes (Q16.2). Full-app RTL is **not** required, but every text node that can hold Hebrew (form labels, notes, and their appearance on chart axes, tables and team cards) must be bidi-correct (`dir="auto"`). Built in from the start, not retrofitted. *(confirmed 2026-08-14)*
- **The active-context (season/event) switcher lives on a dedicated context/landing page, not in the persistent header/nav** — so the working context can't be changed by accident mid-task (§4.1). *(confirmed 2026-08-17)*

**Device roles — what each screen size is *for***

- **Two distinct experiences, one codebase.** *Phone = data entry and competition use* (huge touch targets, minimal chrome, one task per screen, thumb-reachable actions); *computer = analysis and construction* (dense tables, multi-panel dashboards, keyboard shortcuts, hover detail). These are not the same UI scaled — they are different information densities and different jobs. *(confirmed 2026-09-01)*
- **The phone does the whole competition job**: create and edit entries (§6, within the 5-minute self-edit window of §5.1), view team statistics and saved dashboards / stat pages (§9, §10), search and browse teams and entries, the ranking table, compare, match preview (§11), view the pick list — and, for a lead, add a do-not-pick with its required reason (§12) — plus the sync and conflict surface (§7). *(confirmed 2026-09-01)*
- **The computer does everything, and is the only place the builders live**: the **form builder** (§3), the **dashboard builder** and the **stat-page / metric builder** (§9, §10), the **ranking-table and weight-preset builder** (§11.2), season and event creation (§4) and user administration (§5). This is the pre-competition work, done sitting down. *(confirmed 2026-09-01)*
- **Builder routes require a viewport ≥ 1024 px.** On anything narrower the route renders **one clear panel** — "this needs a computer", naming what it is and why — and never a cramped, half-working builder. A builder that half-works on a phone is worse than one that honestly refuses, because the failure lands on the person least able to recover from it. *(confirmed 2026-09-01)*
- **Two exceptions must work at any width, because they happen at a venue:** **alliance selection / pick-list editing** (§12 — the admin may be holding a phone in the stands) and **conflict review** (§7.3 — it cannot wait for a laptop). Both are designed narrow-first despite being admin tools. *(confirmed 2026-09-01)*
- **Device gating is not a permission.** It narrows *where* a capability is available; it never grants one. §5.2's role matrix remains the sole authority on *who* may do a thing — a scouter on a computer still cannot build a form, and the server-side use-case layer enforces that regardless of viewport (§15.2). **[RAISED BY ME]** *(confirmed 2026-09-01)*

**Look, brand & themes**

- **Team branding: ROBACTIVE, team #2096** (Q16.1). The logo is a distressed yellow radiation trefoil over the `ROB✕ACTIVE #2096` wordmark. Source and derived assets live in **`docs/brand/`** (inventory in §16.2). **Brand yellow is `#FFEA07`.** *(confirmed 2026-09-01)*
- **The app is not a black-and-yellow app** (Q16.1). The UI is a **neutral dark palette with brand yellow as the single accent** — used for the logo, the primary action, and the focus ring. Saturated yellow across large areas is fatiguing in an arena and leaves no colour left for meaning. *(confirmed 2026-09-01)*
- **Brand yellow is never text or an icon on a light surface.** `#FFEA07` on white is **1.23:1** — illegible; on the near-black surface it is **16:1**. The logo therefore always sits on a near-black plate (`#0A0A0B`), **including in the outdoor light theme**. *(confirmed 2026-09-01)*
- **Functional colour is independent of branding.** §10.2's red→green value shading, `robot_status` colours (§6.2), and the online / syncing / offline indicator (§8.1) are **meaning**, not decoration: brand yellow never appears in data ink, and the shading scale's mid-tone is a **desaturated grey-amber**, deliberately distinct from `#FFEA07`, so "average" can never be mistaken for a brand element. Warnings use **orange**, not amber, for the same separation. **[RAISED BY ME]** *(confirmed 2026-09-01)*
- **Two themes, not three** (Q16.10): **dark (default)** — scouting happens in dim arenas and it saves phone battery — and the **high-contrast "outdoor" theme** required by Q6.7, which is a light, maximum-contrast surface because sunlight legibility wants luminance, not dark mode. That theme *is* the light theme; an ordinary light mode is deferred to §24. *(confirmed 2026-09-01)*
- **Tailwind CSS + shadcn/ui.** Boring, documented, and the students who inherit this can read it. Every colour is a **CSS variable token** (§16.2), never a hard-coded hex in a component — that is what makes the second theme and any future re-brand a one-file change. *(confirmed 2026-09-01)*

**Typography**

- **Inter for app chrome, Noto Sans Hebrew for form content** (Q16.7), both **self-hosted in the repo and subset** — **no Google Fonts CDN**, because a font fetch that fails at a venue is a broken app. Inter carries no Hebrew glyphs at all, so without an explicit Hebrew face every Hebrew label silently falls back to an arbitrary system font and the form looks broken next to the English chrome. The two faces are matched on x-height so a mixed line does not visibly step. *(confirmed 2026-09-01)*

**Accessibility & arena floor** (Q16.10)

- **Minimum touch target 48×48 px** with at least 8 px between adjacent targets — the number that makes Q6.7's "usable with gloves" concrete.
- **WCAG AA: 4.5:1 for text, 3:1 for UI boundaries and chart strokes, in both themes.** A token pair that fails is a bug, not a preference.
- **OS text-size settings are respected** — all type in relative units; the large-text option of Q6.7 is an in-app multiplier on top, and no layout may break at 200%.
- **Visible focus ring on every interactive element** (brand yellow on dark, near-black on the outdoor theme), because §16.2's desktop keyboard shortcuts are useless without it.

**Install identity (PWA)** (Q16.9)

- Manifest name **"ROBACTIVE Scouting"**, short name **"Scouting"**, `display: standalone`, `theme_color`/`background_color` **`#0A0A0B`**, orientation unlocked (both, per Q6.6), icons generated from `docs/brand/` at 192/512 plus a **maskable 512 with a 24% safe zone** and a 180 px Apple touch icon. The **icon is the trefoil mark alone, never the wordmark** — the wordmark is unreadable below ~96 px, which is every size that matters on a home screen. Icons and manifest are precached with the app shell (Q15.6/Q15.11), and the visible version string of Q15.11 appears on the context/landing page. *(confirmed 2026-09-01)*

**Number, date & time formatting** (Q16.8)

- **Computed metrics and averages: 2 decimal places.** **Integer counts (game pieces, match numbers, team numbers): none** — and team numbers never carry a thousands separator. **Percentages: whole numbers.** Standard deviation follows its metric (2 decimals, §9.1).
- **Dates `DD/MM/YYYY`, time 24-hour, timezone = the device's local zone.** Applies identically to tables, chart axes, exports and the entry-preview page, so two surfaces can never disagree about the same value. *(decided by Claude 2026-09-01)*

**Feedback, empty & error states** (Q16.11)

- **Skeletons, not spinners**, for lists and tables; a spinner only for a genuinely indeterminate single action.
- **One state component, six variants**: *no data yet* · *form not published* · *offline and this needs the server* · *something failed* · *no search results* · *conflicts waiting for review*. Each is a centred glyph, one bold line of what happened, one muted line of why, and **exactly one primary action** — no dead ends, no stock illustrations, no raw error codes in front of a student. The offline variant always says the data is safe on the device (§7.3), because that is the sentence that stops someone re-entering a match. *(confirmed 2026-09-01)*
- **An unmistakable, always-visible offline / syncing / online indicator** with the unsynced count. This is a primary UI element, not a footnote — it is the only thing standing between a scouter and a lost afternoon. *(confirmed 2026-09-01)*

**Destructive actions** (Q16.12)

- **One pattern everywhere.** A single confirm dialog that **names the object**, **states what is lost as a count** ("this deletes 4 entries"), and puts the destructive verb on the primary button. *(confirmed 2026-09-01)*
- **Type-to-confirm only for multi-record irreversibles** — delete a season, delete a form version, wipe local device data (§7.7). **Plain confirm for single records.** **Undo instead of a dialog** wherever undo is possible (§6.2's repeatable inputs, one-tap do-not-pick removal in §12). Dialogs everywhere train people to dismiss dialogs. *(confirmed 2026-09-01)*
- **An action that would orphan collected data is blocked, not confirmed** — deleting a form version that has entries bound to it fails with an explanation (form versions are immutable, §3.1), and no confirmation text can override it. *(confirmed 2026-09-01)*

### 16.2 Design system detail (confirmed)

**Breakpoints** — mobile-first; the width, not the user agent, decides.

| Name | Width | Role |
|---|---|---|
| phone | < 640 px | One column, single task per screen, thumb-zone actions. Data entry. |
| tablet portrait | 640–1023 px | Two columns; side-by-side fields on a wider entry form (Q6.6). |
| desktop | ≥ 1024 px | Dense tables, multi-panel layouts, hover detail, keyboard shortcuts. **Builders unlock here.** |
| wide | ≥ 1280 px | Multi-panel dashboards up to §10.2's 4-chart expand-to-stack cap. |

**Colour tokens** — every value below is a CSS variable; components never hard-code a hex.

| Token | Dark (default) | Outdoor high-contrast |
|---|---|---|
| `--bg` | `#0A0A0B` | `#FFFFFF` |
| `--surface` | `#18181B` | `#F4F4F5` |
| `--surface-raised` | `#27272A` | `#E4E4E7` |
| `--border` | `#71717A` | `#52525B` |
| `--text` | `#FAFAFA` | `#09090B` |
| `--text-muted` | `#A1A1AA` | `#3F3F46` |
| `--brand` | `#FFEA07` | `#FFEA07` — **only on a `--brand-plate` background** |
| `--brand-plate` | `#0A0A0B` | `#0A0A0B` |
| `--on-brand` | `#0A0A0B` | `#0A0A0B` |
| `--focus` | `#FFEA07` | `#09090B` |

**`--border` is zinc-500 `#71717A`, not the zinc-700 `#3F3F46` the rest of the ramp would suggest.** Zinc-700 measures 1.89:1 on `--bg`, 1.70:1 on `--surface` and 1.43:1 on `--surface-raised` — all below the 3:1 floor for UI boundaries, which the accessibility floor calls a bug rather than a preference. Zinc-600 still fails; zinc-500 is the first step that clears it (4.09 / 3.67 / 3.08). The outdoor theme's `#52525B` already passes at 6.09:1 worst case and is unchanged. **Do not darken this token back.**

Functional colours (**never brand yellow**): success/`played` green · `broke-down-at-T` orange · `disabled` deep orange · `no-show` neutral grey · danger red · sync states red (offline) / orange (syncing) / green (online). The §10.2 value-shading ramp runs red → desaturated grey-amber → green.

**Brand assets** — `docs/brand/` is the source of truth; the build copies what it needs into the client's static assets (§15.1: committed static files, precached with the shell).

| File | What it is |
|---|---|
| `logo.pdf` | Original supplied artwork (A4, 300 dpi raster). Archive — never referenced by the app. |
| `logo.png` | Full lockup (trefoil + wordmark), transparent, trimmed, 2320×2482. |
| `logo-on-black.png` | The same lockup on `#0A0A0B`, for anywhere a transparent PNG can't be used. |
| `mark.png` | Trefoil only, transparent — the source for every icon and any header/favicon use. |
| `icon-192.png`, `icon-512.png` | PWA manifest icons (mark on `#0A0A0B`, 12% padding). |
| `icon-512-maskable.png` | Maskable variant, 24% safe zone for Android's round masks. |
| `apple-touch-icon-180.png` | iOS home-screen icon. |

**[RAISED BY ME]** The supplied logo is **raster**, not vector. It is large enough (2320 px) for every use in this app, so nothing is blocked — but if a vector version ever exists, dropping it in as `logo.svg` is the only change needed. Recorded so nobody re-traces it by hand.

### 16.3 Visual reference & per-surface design rules (confirmed)

Chosen by walking real products, surface by surface (Q16.3, 2026-09-01). **These are references for *behaviour and layout*, never for palette** — colour comes from §16.2's tokens, so nothing here overrides the two-theme decision or the brand rules.

**System-wide baseline: Linear / Vercel.** Restrained dark chrome, low decoration, high information density, a tight type scale, muted 1-px borders instead of shadows, and exactly one accent colour. This is also what shadcn/ui gives us by default, so the baseline costs nothing to hold.

| Surface | Reference | What we take from it |
|---|---|---|
| Context / landing page (§4.1) | **Figma's file browser** + **Notion**, with `thebluealliance.com` as a *content* reference only | From Figma: scope is chosen from a **card grid, most recent first** — seasons, then that season's events — never a dropdown in a header, and the cards are big and unmissable. From Notion: the page reads as a **calm document, not a control panel** — quiet typographic hierarchy, generous whitespace, no toolbars competing for attention on the one screen whose only job is "where am I working today?". The Q15.11 version string sits quietly in the footer. *(confirmed 2026-09-01)* |
| Phone data entry (§6) | **Tally**, **Typeform**, **FotMob** | Tally/Typeform for **pacing** — one job on screen, generous spacing, no cramped rows; FotMob for proving a **dense sports UI can stay thumb-reachable**. Counters are a wide − / value / + triplet, never a text input. The sticky timer never fights the page scroll. |
| Form builder (§3) | **Fillout** and **Tally** | **Three panes on desktop: field palette → canvas → selected-field settings.** Drag from the palette onto the canvas; the semantic metadata of §3.3 lives in the settings pane so it is filled *while* the field is created, never after. A **preview toggle renders the form at phone width** — the builder's whole job is predicting the phone. |
| Team statistics page (§9, §10) | **Sofascore** | A **sticky team header** (number, name, headline metric, rank badge), a **horizontal tab strip** below it, then stat rows as **label → value → inline bar**. The whole page is readable in one thumb scroll. |
| Dashboards & builder (§10) | **Grafana Play**, **Metabase**, **Tremor** | Grafana for the **panel grid** and a scope/filter bar pinned to the top of the dashboard; Metabase for the **builder order a non-programmer can follow** — pick metric, pick chart, pick scope; Tremor for the **visual language**: small KPI tiles above the charts, sparse gridlines, no chart junk. |
| Ranking table (§11.2 #4) | **shadcn/ui data-table**, **TanStack Table**, **premierleague.com** | shadcn/TanStack for the mechanics — **column sort, column visibility, sticky header, no pagination for a 50-team event**; the league table for readability: a rank column, **medals on the top 3** (§11.2), no zebra striping, numbers right-aligned and tabular. |
| Compare page (§11.2 #5) | **Sofascore head-to-head** | For **2 teams: a mirrored two-column layout**, one metric per row with a bar leaning toward the stronger side. For **3–6: the radar plus table** already specified in §10.2. |
| Match preview (§11.2 #6) | **op.gg** (structurally identical: two teams of N, metrics mirrored) | The **two alliances as mirrored columns**, three team rows each with their key metrics, and the **summed-average prediction as a single bar across the top**. *(confirmed 2026-09-01)* |
| Search & record detail (§11.2 #1–3) | **Attio** (with Twenty / PostHog as alternates) | **Dense list rows, filters as chips**, search that filters as you type. A row opens the **entry preview as a full page, not a drawer** — a drawer is unusable at phone width, and this app is phone-first for exactly these pages. *(confirmed 2026-09-01)* |
| Alliance selection (§12.4) | **Todoist** | Reorder needs an **explicit drag handle**, a visible drop position, and **long-press to start a drag on touch** so a scroll can never reorder the pick list by accident. One-tap row actions (do-not-pick removal) with **undo**, per §16.1. |
| Sync & conflict review (§7.3, §8.1) | **Obsidian Sync** | The indicator **names the state in words plus a count** ("offline · 4 unsynced"), not a bare icon; there is a **place to look** listing what synced and what didn't; conflicts are an **explicit worklist you can finish**, not a passive warning. |
| Admin: users, seasons, events (§5, §4) | **Clerk** | Table of users → row opens a detail page; role is a select on that page; invite/creation is one small form. Destructive rows follow §16.1's single pattern. *(decided by Claude 2026-09-01)* |

**Standing reference libraries for the build phase:** [mobbin.com](https://mobbin.com) (real app screenshots organised by flow), [godly.website](https://godly.website), and [ui.shadcn.com/blocks](https://ui.shadcn.com/blocks). When a screen has no rule above, look there before inventing one. *(confirmed 2026-09-01)*

**Using the `frontend-design` skill during the build — craft yes, identity no.** *(confirmed 2026-09-03)*

Build chats invoke Anthropic's `frontend-design` skill (`/plugin install frontend-design@claude-plugins-official`) on UI tasks. It is worth having, and it needs one standing override, because its stated purpose — *"bold aesthetic choices, distinctive typography and colour palettes, high-impact animations"*, giving a product an identity that could not be mistaken for anyone else's — is a job this project has already done and closed.

| Section of the skill | Use it? |
|---|---|
| **Ground it in the subject** | **No.** The subject, the audience and each page's job are fixed by §16.3's reference table. Nothing here needs pinning down. |
| **Design principles** → *Structure is information* | **Yes.** Numbering, eyebrows, dividers and labels must encode something true about the content, not decorate it. |
| **Design principles** → *hero is a thesis*, *typography carries the personality*, *leverage motion* | **No.** There are no heroes in this app; the two typefaces are closed at Q16.7; and page-load sequences, scroll reveals and "ambient atmosphere" are exactly what must not appear on a scouter's screen. |
| **Process** → the two-pass plan-then-critique habit, and the CSS-specificity warning | **Yes.** Plan the screen, criticise the plan, then build. The warning about `.section` and `.cta` selectors cancelling each other is real and cheap to heed. |
| **Process** → *"describe the palette as 4–6 named hex values… the typefaces for 2+ roles"* | **No.** That is §16.2 and Q16.7, already decided. Producing a second palette is the single most likely way this skill damages the project. |
| **Restraint and self-critique** | **Yes, entirely.** "Spend your boldness in one place", the quality floor — responsive to mobile, visible keyboard focus, **reduced motion respected** — and Chanel's mirror. |
| **More on writing in design** | **Yes, entirely, and read it twice.** It is the best guidance in the skill and it *reinforces* §16.1: errors that explain rather than apologise, an empty screen as an invitation to act, one name for an action through a whole flow, labels that do exactly one job. |

Two hard rules follow from the arena, not from taste:

1. **No decorative animation on the data-entry path.** A phone in a loud arena during 2:30 of match. Motion is permitted only where it carries information — a state change the scouter must notice — and never as ornament.
2. **Components read CSS variables and never hard-code a hex.** Brand yellow never appears in data ink and never sits on a light surface; the logo always sits on a `--brand-plate` near-black plate, in both themes.

**Where the skill and §16 disagree, §16 wins**, and the build chat says which line disagreed rather than silently picking one. A disagreement that keeps recurring is a signal to reopen §16 deliberately — not to drift.

### 16.4 Closed questions

- ~~**Q16.1** — Do you have **team branding** (colours, logo, team number) to build in?~~ ✓ **CLOSED 2026-09-01: ROBACTIVE #2096; brand yellow `#FFEA07`; assets in `docs/brand/`. Neutral dark UI with yellow as the single accent — explicitly *not* a black-and-yellow app** (§16.1, §16.2).
- ~~**Q16.2** — **Language**: English only, Hebrew only, or both?~~ ✓ **CLOSED 2026-08-14: English LTR chrome, Hebrew bidi-aware form content** (§16.1). **[RAISED BY ME]**
- ~~**Q16.3** — Any app you like the look/feel of that I should use as a reference?~~ ✓ **CLOSED 2026-09-01: yes — a per-surface reference table, §16.3.** Baseline **Linear/Vercel** chrome; Sofascore for the team page and compare, Tally/Typeform/FotMob for entry, Fillout for the builder, Grafana + Metabase + Tremor for dashboards, shadcn/TanStack + a league table for ranking, Todoist for pick-list reordering, Obsidian Sync for the sync surface, op.gg for match preview, Attio for search/detail, Clerk for admin, Figma's file browser + Notion for the context page. **References are for layout and behaviour only — never palette.**
- ~~**Q16.4** **[RAISED BY ME]** — Do you need **printable views**?~~ ✓ **CLOSED 2026-09-01: no — printable views are out of scope.** Print-CSS pick lists and match previews are dropped (chart/dashboard export was already deferred: Q10.4 → §24). The **blank paper backup form**, generated from the live form definition, is moved to §24 rather than dropped — it is the only tablets-are-dead fallback, and it is cheap once the form definition already renders. *(decided by Claude 2026-09-01)*
- ~~**Q16.5** **[RAISED BY ME]** — Should the app be usable **with gloves / wet hands / in sunlight**?~~ ✓ **CLOSED 2026-09-01: already answered by Q6.7** (large targets, outdoor high-contrast mode, large text, haptics). §16.1 only adds the numbers: **48×48 px targets, 8 px spacing, WCAG AA in both themes**.
- ~~**Q16.6** **[RAISED BY ME]** — Should the field diagram be **uploadable per season**?~~ ✓ **CLOSED 2026-09-01: no — superseded by Q15.6.** The season game image is a **static asset committed to the repo** (DB stores only its path), which keeps the app year-agnostic with a yearly commit instead of an upload subsystem, and is what makes offline position-picking work (Q15.12).
- ~~**Q16.7** **[RAISED BY ME]** — Which font stack, given Hebrew form content?~~ ✓ **CLOSED 2026-09-01: Inter (chrome) + Noto Sans Hebrew (content), self-hosted and subset, no CDN** (§16.1).
- ~~**Q16.8** **[RAISED BY ME]** — Number, date and time formatting.~~ ✓ **CLOSED 2026-09-01: 2 decimals on computed metrics, 0 on integer counts, whole-number percentages; `DD/MM/YYYY`, 24-hour, device-local timezone** (§16.1).
- ~~**Q16.9** **[RAISED BY ME]** — PWA install identity.~~ ✓ **CLOSED 2026-09-01: "ROBACTIVE Scouting" / "Scouting", standalone, `#0A0A0B`, trefoil-only icons incl. a maskable 512** (§16.1).
- ~~**Q16.10** **[RAISED BY ME]** — Accessibility floor and how many themes.~~ ✓ **CLOSED 2026-09-01: 48 px targets, WCAG AA, OS text size respected, visible focus ring; two themes — dark (default) + outdoor high-contrast; ordinary light mode → §24** (§16.1).
- ~~**Q16.11** **[RAISED BY ME]** — Empty and error state conventions.~~ ✓ **CLOSED 2026-09-01: skeletons for loading; one state component with six variants, each with exactly one action; always-visible sync indicator with unsynced count** (§16.1).
- ~~**Q16.12** **[RAISED BY ME]** — A single destructive-action pattern.~~ ✓ **CLOSED 2026-09-01: one dialog naming the object and the count; type-to-confirm only for multi-record irreversibles; undo where undo is possible; data-orphaning actions blocked outright** (§16.1).

---

## 17. Non-functional requirements

**CLOSED 2026-09-01.** Targets confirmed, testing strategy fixed, privacy and the deletion/retention model settled.

### 17.1 Confirmed targets

| Area | Target |
|---|---|
| Cold start offline | App interactive in under 3 seconds on a mid-range phone with no network. |
| Data entry responsiveness | Every tap registers visually in under 100 ms, always local-first. |
| Sync latency | A submitted entry reaches the server within **2 seconds of the device having connectivity**; other devices see it on their next **45-second refresh** (§8.1). *(restated 2026-09-01 — the original "appears on other devices within 2 s" contradicted the topic 8 decision to ship no realtime push.)* |
| Scale — district event | ~50 teams, ~120 matches, ~6 entries/match, ~80 fields/entry. |
| Scale — championship division | Larger: ~75 teams and ~110 qualification matches in one division. We attend one division, not eight. *(confirmed 2026-09-01, Q17.1)* |
| Scale — season & multi-season | ~10 events/season → roughly 6,000 entries and 500,000 field values per event; low hundreds of thousands of rows across seasons. Small for Postgres, which is why Option A in topic 3 is safe. |
| Concurrent users | ~11 peak (8 scouters + 2 leads + 1 admin, §1.1). |
| Offline window | **One day.** A device is expected to sync at least once every 24 hours; unsynced data is never left on a device longer than that. This is a checklist line in `RUNBOOK.md`, not an enforced limit. *(confirmed 2026-09-01, Q17.6)* |
| On-device storage | The **active competition, in full** — every entry, form version and computed input needed to scout and to read stats offline. Other events in the season are fetched on demand and are unavailable offline. *(confirmed 2026-09-01, Q17.7)* |
| Device baseline | **Android Chrome from the last ~2 years; iOS Safari 16+.** Anything older is unsupported rather than broken-for. Sets the floor for CSS/JS features, IndexedDB behaviour and service-worker support. *(decided-by-Claude 2026-09-01, Q17.8)* |
| Database budget | **Supabase free tier is the operating constraint.** Store raw entries only — never persist derived scores or aggregates (the shared engine computes them); no photo/pit data in v1. Keep DB actions simple: plain SQL views (not materialized), no heavy triggers or DB-side cron. Escalate before approaching the size cap. *(confirmed 2026-08-17, Q17.3)* |
| Security | Authorization enforced in the server use-case layer and surfaced in the UI — **no Postgres RLS / per-row policies** (Topic 5); no service-role key in the browser; **no user audit log** (Q5.5). |
| Backup | **No in-app export or restore in v1** (Q17.2 → §24). The pre-event and per-season backup is **manual**: the maintainer runs `supabase db dump` from the CLI and saves the file off-platform. Procedure written in `docs/ops/SETUP.md`, checklist line in `docs/ops/RUNBOOK.md`. *(confirmed 2026-09-01, Q17.2)* |
| Testing | See §17.2. |

**Accepted risk (stated plainly).** With no in-app export and no paid Supabase backup tier, the only copy of a season's data outside the live database is the manual dump above. If nobody runs it, a bad delete or a platform failure loses the season. This is accepted for v1 on the condition that the dump is a checklist line before every event and at the end of every season.

### 17.2 Testing strategy (confirmed)

Two tiers. Both run in CI (§18.1); a pull request into `main` cannot merge unless both are green.

**Tier 1 — unit tests, on the four places where failure is silent and expensive:**

1. **The metric engine** (§9) — wrong numbers are worse than no numbers.
2. **The offline sync / conflict protocol** (§7.3) — impossible to debug at a venue.
3. **Form versioning** (§3.3) — an entry must stay bound to the form version it was recorded against, forever.
4. **Offline draft persistence** (§6.2) — a draft must survive a reload, a crash and a browser restart.

**Tier 2 — a smoke suite: "is the app still wired together?"** *(confirmed 2026-09-01, Q17.5 — this is the check you asked for.)* A small set of tests that exercise the **real client → server → database path** end to end rather than mocking it, so that a broken connection, a renamed environment variable, a missing migration or a dropped route fails the build instead of failing at an event. It covers: authentication and session, load the active competition, load a form version, **submit an entry and read it back**, run one metric over it, and the `/health` endpoint's database read.

- It runs against the **dev Supabase project** — never production — inside a namespaced `CI` season that the suite creates and tears down, so it can never touch real competition data.
- It is deliberately shallow. It proves the wiring, not the behaviour; behaviour is tier 1's job.
- **Not automated:** full end-to-end user journeys, UI rendering tests, and cross-browser testing. The real offline path is verified by hand, on a real phone with the network actually off, before every event (`RUNBOOK.md`, `COLLABORATION.md` §8 rule 5).

### 17.3 Privacy, deletion & retention (confirmed)

**Personal data.** The only personal datum stored about a user is their **full name**, alongside their username. **No email address, no phone number, no date of birth, no photo.** *(confirmed 2026-09-01, Q17.4.)* This is compatible with §5.1's admin-provisioned username + password login, which needs no email. Note the interaction with §5.7: deleting a user removes their access but **preserves their entries with authorship intact**, so a graduated student's name remains attached to the matches they scouted. Removing the name itself would mean editing history, which we do not do.

**Scouter identity in API output** *(Q20.5, confirmed 2026-09-02).* Query use cases **return the scouter's name** wherever the app already displays it — entry search and entry preview (§11.2), and the §7.3 conflict-review queue (which §20.1 specifies as showing the scouter behind each diverging copy). There is no default redaction and no opt-in flag: §5.1 already makes all data visible to every role, and every consumer is inside the team's own app. The decision is scoped to *this app* and is **re-opened if an LLM connection is ever added** (§20.1), because a model provider sits outside that boundary.

**Deletion is a real feature.** *(confirmed 2026-09-01, Q17.1 follow-up — amends topics 4 and 5, which granted management of these objects without ever specifying destruction.)*

- **Admin-only.** Not a lead, not a scouter.
- **Hard delete, cascading down the hierarchy**, and the cascade is explicit, never hidden: deleting a **season** deletes its competitions, their entries, its forms and all their versions; deleting a **competition** deletes its entries.
- **A form version with entries bound to it cannot be deleted on its own** — that is the orphaning case §16.1 blocks outright, and no confirmation text overrides it. To remove it, delete the season that contains it (which takes the entries with it) or delete the entries first. Deleting the *parent* is a cascade, not an orphaning, which is why it is allowed. *(reconciles this decision with Q16.12, 2026-09-01.)*
- **The confirmation names the damage.** Per §16.1's single destructive-action pattern: the dialog states exact counts — "this permanently deletes 1 competition, 412 entries and 3 form versions" — and, because these are multi-record irreversibles, the admin types the object's name to proceed. No bare "are you sure".
- **The active season or competition cannot be deleted.** Switch the active context first (§4.1). This prevents the worst accident: destroying the event currently being scouted.
- **Back up first.** Because there is no in-app export in v1, the delete screen carries a direct instruction to run `supabase db dump` before proceeding. Once the §24 export exists, this becomes an offer to export first.
- **Offline devices are handled, not ignored.** A device that was offline may sync entries whose season, competition, match or form version has since been deleted. The server **rejects them as `parent-deleted`**. *(amended 2026-09-02, SPEC-FINAL consolidation)* **The client then hard-deletes the local record** rather than keeping it — there is no parent for it to belong to and no way to re-attach it. It is **never discarded silently**: before deleting, the client raises a dismissible notice naming exactly what was discarded (team, match, form kind, scouter, timestamp) and writes it to a local, read-only "discarded records" log kept for the life of the install. *(This amends the earlier "the client keeps them locally and surfaces them in the conflict-review queue" wording, which would have left permanently unresolvable items in a queue whose whole purpose is to be finished.)*

**Retention.** **All seasons stay live in v1 — nothing is auto-pruned.** A season is a few megabytes against a 500 MB free tier, so age is not a reason to delete. What "don't keep much from past years" means in practice is *display and on-device* scope, not deletion: the UI defaults to the active season, and only the active competition is held offline (§17.1). Deliberate deletion of an old season is the admin action above. *(This supersedes the "archive out — export + prune" wording in Q17.3, which assumed an export feature that is now deferred to §24; pruning as a routine space-saving measure returns only when that export exists.)*

### 17.4 Closed questions

- ~~**Q17.1**~~ ✓ **CLOSED 2026-09-01: targets confirmed.** Scale estimate right for a district event; a **championship division is larger** (~75 teams, ~110 quals) and is now its own row. Sync-latency target restated to match topic 8. Multi-season data is kept, not pruned (§17.3).
- ~~**Q17.2**~~ ✓ **CLOSED 2026-09-01: no in-app export or restore in v1 → §24.** The backup is a manual `supabase db dump` by the maintainer, documented in `SETUP.md` and on the pre-event and end-of-season checklists in `RUNBOOK.md`. This resolves the contradiction between the old §17.1 Backup row, Q18.6 and §19.1's phase 2.
- ~~**Q17.3**~~ ✓ **CLOSED 2026-08-17: Supabase free tier.** Design lean per the Database-budget row (§17.1). Two free-tier risks and their mitigations: **(1) inactive-project pause** — offline-first means scouting never depends on the DB being awake; the twice-weekly `/health` keep-alive (Q18.9) and a 48-hour pre-event check cover it; **(2) size/egress caps** — raw-only storage keeps a season well within budget. *(Amended 2026-09-01: the original multi-season mitigation, "archive out — export + prune", is withdrawn; see §17.3 Retention.)* If we ever must exceed the free tier I'll flag it; a plain-Postgres alternative (e.g. Neon free tier, or self-hosted Postgres) is a low-friction migration because topic 3 uses no Supabase-specific runtime DDL.
- ~~**Q17.4**~~ ✓ **CLOSED 2026-09-01: full name is fine, and it is the only personal datum stored** — no email, phone, DOB or photo (§17.3).
- ~~**Q17.5**~~ ✓ **CLOSED 2026-09-01: tier 1 unit tests on four subsystems + a tier 2 smoke suite** proving the client→server→database path still works (§17.2).
- ~~**Q17.6**~~ **[RAISED BY ME]** ✓ **CLOSED 2026-09-01: documented, not enforced.** iOS Safari evicts IndexedDB and service-worker caches after ~7 days of browser non-use (a home-screen-installed PWA is exempt), but the operating offline window is **one day**, so the eviction never bites in practice. Home-screen install and daily sync are `RUNBOOK.md` checklist lines, not a UI blocker.
- ~~**Q17.7**~~ **[RAISED BY ME]** ✓ **CLOSED 2026-09-01: the active competition in full, nothing else offline** (§17.1).
- ~~**Q17.8**~~ **[RAISED BY ME]** ✓ **CLOSED 2026-09-01 (decided-by-Claude): Android Chrome from the last ~2 years, iOS Safari 16+.** Older devices are unsupported rather than degraded.

---

## 18. Deployment, environments & operations

### 18.1 Confirmed requirements

- Client and server both deployed on Vercel.
- **Two Vercel projects from one repository** (client static build, server functions) and **separate Supabase projects for production and development** (Q15.7, Q15.13). *(confirmed 2026-08-31)*
- **`docs/ops/SETUP.md` is a required build deliverable** — the exact, followable procedure for creating the Supabase and Vercel projects from scratch and configuring them to match this spec: project creation and region, which settings to change, how migrations are applied by CLI, which keys to copy where, how the dev and production pairs differ, and the **new-season checklist** (commit the game image, create the season, publish the forms). Written so a student who has never seen the project can stand it up unaided. *(confirmed 2026-08-31)*
- **`docs/ops/ENVIRONMENT.md` is the provisioning worksheet** *(added 2026-09-02, SPEC-FINAL consolidation)* — the committed, editable inventory of every variable, secret and account: what each is, where it comes from, which environment it belongs to, a column for the **non-secret** values and a tick box per item. It states the standing rule that **no secret value is ever written into the repo, a commit message or a conversation**; secrets travel only between the dashboard that issues them and the dashboard that consumes them. The two `.env.example` files below are generated from it in phase 0.
- **Two committed `.env.example` files — one per app — are the connection contract** (amended 2026-09-01): `apps/client/.env.example` and `apps/server/.env.example`. Each lists only what *that* service needs, and for every variable: what it is, **where to obtain it**, and **which environment** (dev vs. production). They hold names and placeholders — **never real values**. *(confirmed 2026-08-31, split per app 2026-09-01)*
  - **The client holds no Supabase credentials at all** — not even the anon key. Since all traffic goes through the server API (Q15.1), the client's only variable is the **server API base URL**, plus non-secret build settings. *(corrects the earlier §18.2 wording, 2026-09-01)*
  - **The server holds everything secret**: the Supabase URL and **service-role key**, the auth signing secret, and any future external API key. Server-side only, never in a client bundle, never committed.
- **Mini CI** (Q18.2). Every push to **`develop`**, and every pull request into **`main`**, runs: install (pnpm, cached) → lint → typecheck → **unit tests** → **smoke suite** → build both apps. A pull request into `main` cannot merge unless the run is green. *(confirmed 2026-08-31; test scope extended 2026-09-01, Q17.5.)* The required tests are fixed in **§17.2**: four unit suites — the **metric engine** (§9), the **offline sync / conflict protocol** (§7.3), **form versioning** (§3.3) and **offline draft persistence** (§6.2) — plus the **smoke suite**, which exercises the real client → server → dev-Supabase path so that a broken connection, a renamed variable or a missing migration fails the build rather than the event.
- **Branch model:** **`develop` is the integration branch, `main` is the deployable/production branch.** Topic branches are cut from `develop` and merge back into it; `main` only ever receives reviewed, CI-green merges. *(confirmed 2026-08-31)*
- **Three environments: production, preview, local** (Q18.8). **Preview** is the temporary deployment Vercel builds for every pull request so a change can be tried before it goes live. **Every non-production environment — preview and local — points at the dev Supabase project. Never production.** A half-finished feature must not be able to reach real competition data. *(confirmed 2026-09-01)*
- **Migrations: automatic to dev, manual to production** (Q18.7). Migrations live in `packages/db` and are applied by the Supabase CLI. CI **auto-applies them to the dev project** on every push to `develop`; **production is migrated by hand, one deliberate CLI command**, never automatically on merge. A merge on a Friday must not be able to alter the database on a competition Saturday. The production schema is never hand-edited in the dashboard. *(confirmed 2026-09-01)*
- **Keep-alive against the free-tier pause** (Q18.9). A Supabase free project pauses after about **7 days of inactivity**, so in the off-season production would be asleep on the morning of an event. A **scheduled GitHub Action runs twice a week and calls a `/health` endpoint on the server — on both the dev and the production deployments** — and that endpoint performs one trivial database read, which is what actually counts as activity. Paired with a checklist line: **open the app 48 hours before an event and confirm it loads.** *(confirmed 2026-09-01)*
- **An event-day runbook, `docs/ops/RUNBOOK.md`** (Q18.10). One page, a checklist not a manual, for the failures that can happen at a venue: site won't load → roll back in Vercel; sync failing → keep scouting, the data is safe on the device, sync outside the arena (§7.3); tablet dead or misbehaving → new device, log in, pull the data by QR from the central tablet; conflicts piling up → a lead or admin resolves them (§7.3). Written in phase 0 and updated after every event. It exists because at a venue there are five minutes, no internet, and possibly a student rather than the maintainer holding the tablet. *(confirmed 2026-09-01)*
- **A dev seed script** (Q18.11). A manually triggered command in `packages/db` fills the **dev** project with a fake season, a form with its versions, ~30 teams and ~100 scouting entries, so dev and preview are testable without ever copying real data. Manual by design — it is never run against production. *(confirmed 2026-09-01)*
- **Accounts: personal today, transferable by design** (Q18.5). The Vercel, Supabase and GitHub accounts are currently **personal**, with the intent to hand them to a team-owned account later. Therefore **nothing may depend on a personal identity**: no personal email in code, config, seed data or as the sole admin of the running app, and `docs/ops/SETUP.md` carries an explicit **transfer checklist** (what to move, in what order, what breaks if it isn't). Handover kills more team tools than bugs do. *(confirmed 2026-09-01)*
- **No self-hosted or laptop-at-the-venue deployment** (Q18.4). Offline-first plus the QR transfer (§7.3) already covers a venue outage; a laptop server would mean maintaining a second deployment target forever. *(confirmed 2026-09-01)*
- **Deferred to §24:** off-platform **backups/export** (Q18.6), a **custom domain** (Q18.1 — the PWA is installed to the phone's home screen, so the URL is typed once), and **error/usage monitoring** (Q18.3). *(confirmed 2026-09-01)*

### 18.2 Environment matrix (confirmed)

| | Client | Server | Supabase project | Migrations |
|---|---|---|---|---|
| **Production** | Vercel project 1, `main` | Vercel project 2, `main` | **prod** | applied by hand, one CLI command |
| **Preview** (per PR) | auto, per pull request | auto, per pull request | **dev** | inherited from dev |
| **Local** | `pnpm dev` | `pnpm dev` | **dev** | applied by CLI locally |

Both Vercel projects build from the one repository, each with its own root directory and build command, sharing the Turborepo cache.

**What runs on a schedule:** exactly one thing in v1 — the twice-weekly keep-alive hitting `/health` on dev and production (Q18.9). No Vercel Cron, no background jobs, no database-side scheduling (§17.1).

### 18.3 Closed questions

- ~~**Q18.1** — Do you have a **domain**?~~ ✓ **CLOSED 2026-09-01: no domain — `*.vercel.app` is fine → §24.** The app is installed to the phone's home screen as a PWA, so the URL is typed once, not daily.
- ~~**Q18.2** — Do you want **CI**?~~ ✓ **CLOSED 2026-08-31: yes — mini CI on every push to `develop` and every PR into `main`** (lint, typecheck, unit tests on the metric engine and sync protocol, build both apps); green is required to merge into `main` (§18.1).
- ~~**Q18.3** **[RAISED BY ME]** — Error/usage monitoring?~~ ✓ **CLOSED 2026-09-01: → §24 nice-to-have.**
- ~~**Q18.4** **[RAISED BY ME]** — Self-hosted or laptop-at-the-venue fallback?~~ ✓ **CLOSED 2026-09-01: no** — offline-first + QR already covers a venue outage (§18.1).
- ~~**Q18.5** **[RAISED BY ME]** — Who holds the Vercel and Supabase accounts?~~ ✓ **CLOSED 2026-09-01: personal for now, with a documented transfer path** — nothing may depend on a personal identity, and `SETUP.md` carries a transfer checklist (§18.1).
- ~~**Q18.6** **[RAISED BY ME]** — Off-platform backup/export before every event?~~ ✓ **CLOSED 2026-09-01: → §24 nice-to-have.** *(Amended the same day on topic 17 close: the pre-event backup is a manual `supabase db dump` by the maintainer, so the deferral no longer leaves the requirement unmet — see §17.1 and Q17.2.)*
- ~~**Q18.7** **[RAISED BY ME]** — How do migrations reach production?~~ ✓ **CLOSED 2026-09-01: auto-applied to dev from CI, applied to production by hand** (§18.1).
- ~~**Q18.8** **[RAISED BY ME]** — Which database do preview deployments use?~~ ✓ **CLOSED 2026-09-01: always dev** — preview and local never touch production (§18.1, §18.2).
- ~~**Q18.9** **[RAISED BY ME]** — The free tier pauses an idle project after ~7 days.~~ ✓ **CLOSED 2026-09-01: a twice-weekly scheduled GitHub Action calls `/health` on both dev and production**, plus a 48-hour pre-event check (§18.1).
- ~~**Q18.10** **[RAISED BY ME]** — An event-day runbook?~~ ✓ **CLOSED 2026-09-01: yes — `docs/ops/RUNBOOK.md`, one page, written in phase 0** (§18.1).
- ~~**Q18.11** **[RAISED BY ME]** — Dev seed data?~~ ✓ **CLOSED 2026-09-01: yes — a manually triggered seed script against the dev project only** (§18.1).

---

## 19. Delivery phases & priorities

**CLOSED 2026-09-01.** v1 is phases 0–2, targeted at **2026-11-20**, built one gated phase at a time.

### 19.1 What v1 is (confirmed)

**v1 = phase 0 + phase 1 + phase 2. Target date 2026-11-20.** *(confirmed 2026-09-01, Q19.2 — this replaces the "soft target 2026-10-01" in §1.1, which predates the scope being fully known.)*

Everything that used to sit in phases 3–6 is **post-v1 and unscheduled**, because closed decisions had already removed each of those items from v1 — the old numbering had simply not been updated to match. Recorded in §19.5 so the labels stop contradicting the topics.

Two clarifications made on closing this topic:

- **The position picker, event log and cycle path are v1, not "advanced" extras.** They are part of the field-type catalogue closed in Q3.3 (all types **except Photo**), so they ship with the form builder in **phase 1**; the heatmaps and arrowed cycle paths that make their data readable are charts, so they render in **phase 2** (§10.2). The old phase 4 listed them as deferred, which contradicted topic 3. *(corrected 2026-09-01.)*
- **There is no photo feature in v1, and none is wanted.** *(confirmed 2026-09-01.)* The only image in the product is the **season game map** — a static asset committed to the repo and swapped once per season via the `SETUP.md` new-season checklist (§15, §18.1). No robot photos, no pit photos, **no Supabase Storage, no uploads** — §15's decision stands unamended, and so does §17.1's storage budget.

### 19.2 The phases

**Phase 0 — Foundations (before any feature work)**
Monorepo scaffold (pnpm + Turborepo, Node 22) → dev and production Supabase projects → the two Vercel projects → `docs/ops/SETUP.md`, `docs/ops/RUNBOOK.md` and the two per-app `.env.example` files → CI on `develop` → the `/health` endpoint and its twice-weekly keep-alive → the dev seed script. Small, but every later phase assumes it exists. *(added 2026-08-31, topic 15 close; extended 2026-09-01, topic 18 close.)*

**Phase 1 — Core loop (must have before any event)**
Built as a vertical slice first — see §19.3. Contents: the walking skeleton → auth and roles → events and teams → form builder with the full Q3.3 field catalogue → offline data entry → sync → **QR fallback transfer (animated + compressed)** → raw data browse → basic per-team stats and ranking table → **admin delete of a season / competition** (§17.3) → **the CI smoke suite** (§17.2), which can only exist once these use cases do.

**Phase 2 — Analysis**
Metric builder → chart and dashboard builder, including the **heatmap and cycle-path renderings** of the phase 1 position-picker data → team compare → **pick list, do-not-pick list & alliance bracket**. *(Alliance selection moved up from phase 3 on Topic 12 close — it depends on nothing the TBA import provides. "Export" and the "coverage/quality matrix" were removed 2026-09-01 on topic 17 and 19 close: export is → §24 (Q17.2/Q18.6) and the coverage matrix is → §24 gated on the TBA import (Q13.1). Both had been left in this line by mistake.)*

### 19.3 Build order inside phase 1 — vertical slice first (confirmed)

*(Q19.4, decided-by-Claude 2026-09-01.)* The first task after phase 0 is **not** a layer. It is the **§1.2 success criterion, end to end and deliberately ugly**: one hardcoded form, filled in on a real phone in airplane mode, synced when the network returns, visible on a laptop. Only once that walks does phase 1 generalise outwards — auth, then events and teams, then the form builder replacing the hardcoded form, then QR, browse and stats.

The reason is risk order, not tidiness. Offline entry and sync are the two things this project exists to fix (§1.1) and the two hardest to debug at a venue (§7.2). Building the form builder first would mean discovering a sync flaw with three thousand lines already written on top of it.

### 19.4 Phase gates (confirmed)

*(Q19.5, confirmed 2026-09-01: phased with checkpoints, not one big build.)* A phase is not finished when the code is written; it is finished when its gate passes. Each gate is a checklist, not a ceremony.

| Phase | Gate |
|---|---|
| **0** | Both apps deployed from the repo, CI green on `develop`, the smoke suite green, `supabase db seed` fills the dev project, and `SETUP.md` has been followed start-to-finish by someone reading it rather than remembering it. |
| **1** | **A student who has never seen the app enters 10 practice matches on a real phone in airplane mode, syncs, and the ranking table is correct.** No help, no coaching, watched not assisted (`COLLABORATION.md` §8 rule 6). Plus: `RUNBOOK.md` written, and the offline path verified with the network actually off (§8 rule 5). |
| **2** | A strategy lead builds a metric and a chart unaided, and a pick list survives being edited offline and synced. |

**Why phased and not one big build, since it was asked:** sync and form-versioning bugs do not crash — they quietly write wrong data, and a single large build surfaces all of them at once with no way to tell which change caused which. Beyond that, the maintainer (§1.1) has to own this code for years; reviewing eighty lines fifteen times builds that ownership, and reviewing four thousand lines once does not.

### 19.5 Post-v1 (not scheduled)

Kept only so the intent is not lost. Nothing here is committed to a date, and each line names the decision that deferred it.

- **Competition workflow** — TBA/FRC API import (topic 14, deferred in full → §24, design recorded in §14.2), scouter assignments (Q6.1/Q6.2 → §24, depends on the imported schedule), schedule-driven coverage matrix and official-result validation (Q13.1 → §24, gated on the import).
- **Depth** — pit and super scouting forms; scouter reliability (Q13.3: **decided against**, not merely deferred); multi-season history beyond what §11 already browses. *(Photos are not on this list — they are not wanted, §19.1.)*
- **MCP server** — expose the use cases as MCP tools, resources and prompts → auth for the MCP endpoint → connect a client and iterate on tool descriptions → evals. Parked by topic 20.1, not nice-to-have.
- **In-app AI** — server-side LLM orchestration, insights panel, cached briefings, notes summarisation, natural-language-to-chart. → §24.

**Important:** the MCP and AI work is deferred, but three of its prerequisites are *early* and cannot be — the **semantic field metadata** in topic 3.3 (part of phase 1's form builder), the **use-case service layer** in topic 15.2 and its **explicit `caller` argument** (§20.1, Q20.16), both part of phase 1's server. Everything else about AI can wait; those three cannot.

### 19.6 How the build actually runs (confirmed)

*(Q19.3, confirmed 2026-09-01: the maintainer alone, with Claude Code. No student developers.)*

- **One task at a time**, plan mode before each, diff reviewed, tests run, commit. `CLAUDE.md` non-negotiables 2–4 and `COLLABORATION.md` §10.6.
- **Tasks arrive finished.** Because there is no second developer to catch mistakes, each task uses parallel subagents where the work genuinely splits, and ends with an **automated review pass before the diff is presented** — the aim being a task that does not need a second round of fixes. *(Requested 2026-09-01.)*
- **Tests are written with the task, never after** (§17.2).
- **Surface:** the Claude Code desktop app. Its visual diff review is what `CLAUDE.md` rule 3 depends on; the CLI is the same agent and needs no separate install.
- **Schedule checkpoint:** the **phase 1 gate should pass by ~2026-10-20**, leaving a month for phase 2. **If it has not passed by 2026-11-01, phase 2 is cut** to the metric builder and ranking table, and the chart/dashboard builder waits. v1 ships on 2026-11-20 with less analysis rather than late with more.

### 19.7 If v1 is not ready in time (confirmed)

*(Q19.6.)* Fallback is **Google Sheets**, as used today. One consequence, stated so nobody assumes otherwise: **there is no import path**, so anything collected in Sheets during a fallback event **stays in Sheets** and never enters the app's statistics. The event is scouted; it is not scouted *into this system*.

### 19.8 Scope of `IMPLEMENTATION-PLAN.md` (confirmed)

*(Q19.7.)* **Phase 0 and phase 1 in full task detail** — exact file paths, the actual code, the test, the command to run, the expected output, the commit (`COLLABORATION.md` §7). **Phase 2 as headings only**, re-planned in detail after the phase 1 gate passes. Writing phase 2's tasks now would mean planning against a form builder that does not exist yet, and every one of those tasks would be rewritten.

### 19.9 Closed questions

- ~~**Q19.1**~~ ✓ **CLOSED 2026-09-01: the order holds** — foundations, core loop, analysis. What changed is not the order but the boundary: phases 3–6 were already emptied by closed decisions and are now recorded as post-v1 (§19.5).
- ~~**Q19.2**~~ ✓ **CLOSED 2026-09-01: v1 = phases 0–2, due 2026-11-20.** Supersedes the 2026-10-01 soft target in §1.1.
- ~~**Q19.3**~~ ✓ **CLOSED 2026-09-01: the maintainer alone with Claude Code**, one task at a time, each task self-reviewed before the diff is shown (§19.6).
- ~~**Q19.4**~~ **[RAISED BY ME]** ✓ **CLOSED 2026-09-01 (decided-by-Claude): vertical slice first** — the offline entry-and-sync skeleton before any generalisation (§19.3).
- ~~**Q19.5**~~ **[RAISED BY ME]** ✓ **CLOSED 2026-09-01: phased with a gate per phase**, the phase 1 gate being the ten-match airplane-mode test by an untrained student (§19.4).
- ~~**Q19.6**~~ **[RAISED BY ME]** ✓ **CLOSED 2026-09-01: Google Sheets**, with no import path back into the app (§19.7).
- ~~**Q19.7**~~ **[RAISED BY ME]** ✓ **CLOSED 2026-09-01: phases 0 and 1 in full detail, phase 2 as headings**, re-planned after the phase 1 gate (§19.8).

---

## 20. AI insights, LLM integration & MCP readiness

### 20.1 Confirmed requirements

- The backend must be **built now so that connecting an LLM later is straightforward**, not a rewrite.
- Specifically, the server should be prepared to work with **MCP (Model Context Protocol)**.
- The purpose is to **get insights** from the scouting data using an LLM.

**Scope decision (confirmed 2026-08-12): setup only. No LLM connection is in scope.**

We build the *foundations* that make MCP possible and we stop there. Concretely, in scope now:

| In scope now | Where it lives |
|---|---|
| Semantic metadata on every form field | Topic 3.3 — part of the phase 1 form builder |
| Transport-agnostic use-case layer with Zod input/output schemas and descriptions | Topic 15.2 — part of the phase 1 server |
| Aggregation performed in the backend, never by a caller | Topic 9 — the metric engine, needed anyway |
| Bounded, paginated, pre-aggregated responses from every query use case | Topic 15.2 — good API design regardless |
| `include_in_ai_context` flag stored per field (unused for now) | Topic 3.3 — one nullable column, free to add |
| An explicit `caller` argument on every use case, with a `service` caller kind | Topic 15.2 / §5 — one parameter and one union type (Q20.16, Q20.6) |

Explicitly **not** in scope now: any MCP endpoint, any MCP transport or auth, any LLM API call, any in-app AI panel, any prompt engineering, any token budget, any AI-generated insight.

The point of this decision is that none of the deferred work requires changing anything built in phase 1. The **three** prerequisites above — semantic field metadata, the use-case layer, and the explicit `caller` argument — are the only things that would be painful to add later; everything else is additive.

*(2026-08-15) The **in-app AI panel** (approach B in §20.3, phase 6) is now formally logged as **nice-to-have** in §24. The **MCP server** (approach A, phase 5) remains **parked** here — its timing is undecided pending a separate decision, distinct from nice-to-have.*

**Closing decisions (confirmed 2026-09-02).** Five questions closed: the two live ones (Q20.5, Q20.6), the parked **Q20.7** answered early because it constrains what phase 1 builds, and two raised in the closing session (Q20.16, Q20.17). Together they settle everything topic 20 asks of phase 1. The scope above is unchanged: still setup only, still no LLM.

- **Query outputs keep scouter names — no default redaction** (Q20.5). The use-case layer returns `scouter_name` wherever the UI shows it — entry search and entry preview (§11.2), and the §7.3 conflict-review queue, which shows the scouter behind each of the two diverging copies (stated here because §7.3 specifies the queue's behaviour but not its columns). There is no stripping and no `include_scouter` opt-in to remember to pass: §5.1 already makes all data visible to every role, and every consumer is the team's own app. **Attached condition:** this decision assumes the app is the boundary, so it is **re-opened by the parked decision to connect an LLM** (the §20.4 parked set — the decision itself, before Q20.1's ordering or Q20.4's choice of provider) — an MCP client or a server-side LLM call sends whatever a tool returns to a model provider, which is outside that boundary. Recorded here so it is faced deliberately then rather than rediscovered afterwards. §17.3 carries the same note.
- **A `service` caller kind, not a fourth user role** (Q20.6 — *decided-by-Claude*). §5.1's three roles stand. The non-human case is handled one level down, in the caller identity every use case receives: `kind: 'user'` (a provisioned human with one of the three roles) or `kind: 'service'` (a future MCP session — *not* the CLI, whose imports and backfills are `commands/` and therefore run as a named admin `user` caller, §15.2). A `service` caller is **read-only by construction** — every `commands/` use case rejects it, so the guarantee is one check in one place rather than a permission per capability — and it is **not a user**: no row in the users table, not creatable, assignable or promotable by an admin, absent from the user list, unable to log into the UI. A role would have been worse on every count, because roles in this app belong to people who can log in. Nothing in v1 constructs a `service` caller; the union member and the command-layer rejection are the entire cost.
- **Every use case takes an explicit `caller` argument** (Q20.16 — **[RAISED BY ME]**, confirmed). `useCase(caller, input)`, and authorization reads that argument only — never the Hono context, never ambient request state. Each transport builds the caller at its edge. Without this, §15.2's transport-agnostic layer is transport-agnostic in name only: a use case that reaches into the HTTP request works behind HTTP and nowhere else, and adding MCP later would mean changing the signature, every call site and every test of every use case. One parameter now, no rework later. Specified in full in §15.2.
- **The model will never write directly — propose-and-confirm** (Q20.7, *un-parked and answered because it constrains phase 1*). Whatever is eventually built, a model may call `queries/` and never `commands/`; a future write capability *proposes* an action that a human applies with an explicit tap, and only for chart-building and form-building — never pick lists, never scouting entries. Phase 1's obligation is only to keep that possible, which the query/command split (§15.2) and the read-only `service` caller already do. Full text and reasoning in §20.3.
- **Free-text note bodies are not sanitised — a recorded residual, no v1 action** (Q20.17 — **[RAISED BY ME]**). Scouter comments can name students or be uncharitable about other teams, and stripping scouter identities would not have touched them. Nothing to build: notes must render in full for the humans reading them, and full-text notes search is already deferred (Q11.2 → §24). It is written down because **notes summarisation is the highest-value AI use case in §20.3**, so the first LLM connection sends exactly this text off-platform. Decide it together with the LLM-connection decision and the Q20.5 condition above.

### 20.2 What "MCP-ready" actually means

MCP is a standard way for an LLM to discover and call your capabilities. An MCP server advertises three kinds of thing:

| MCP concept | What it is | In this app |
|---|---|---|
| **Resources** | Read-only documents the model can load into context | The form's field dictionary for a season, the team list, an event summary, a team's stat sheet |
| **Tools** | Typed functions the model can call | `get_team_stats`, `rank_teams`, `compare_teams`, `query_entries`, `get_coverage_report`, `search_notes` |
| **Prompts** | Reusable templates a human picks | "Scouting report for team X", "Strategy brief for match N", "Explain this pick list" |

So being MCP-ready is mostly **five concrete properties of the backend**, and every one of them is worth having even if you never connect an LLM:

1. **A named, typed, described use-case layer** rather than logic inside HTTP handlers (see topic 15.2). A Zod schema becomes an MCP tool's JSON Schema for free.
2. **A machine-readable data dictionary** for the dynamic forms (see topic 3.3 semantic metadata). This is the piece that makes a year-agnostic app comprehensible to a model, and the piece that cannot be added retroactively.
3. **Aggregation done in the backend, never by the model.** The LLM must not do arithmetic on raw rows — it calls the metric engine (topic 9) and interprets the result. This keeps numbers correct and keeps token usage sane.
4. **Compact, bounded, deterministic tool responses.** A tool that returns 6,000 raw entries is useless; every tool needs pagination, sensible defaults, and pre-aggregated output. Tools return *answers*, not *dumps*.
5. **Permission-aware, read-only-by-default access.** The model's access must be scoped by the same authorization layer as a human's (topic 5), and it must not be able to silently mutate competition data. *(Settled 2026-09-02: it is a `service` caller — outside the user roles, rejected by every command use case. §20.1, Q20.6.)*

### 20.3 Recorded design for when an LLM is connected (**not v1 scope**)

Nothing in this subsection is v1 work, and none of it is a commitment — it is recorded so a future session does not re-derive it. The parked questions in §20.4 decide *whether* and *when*. The one exception is the **read/write split** below, which **is** a confirmed decision (Q20.7) because it constrains what phase 1 builds; it is also summarised in §20.1's closing decisions.

**Recommended ordering: build the MCP server before any in-app AI.** There are three ways to arrange this, and the order matters:

| Approach | How it works | Trade-off |
|---|---|---|
| **A. MCP server only** *(recommended first)* | Your server exposes an MCP endpoint. You connect Claude Desktop / Claude Code to it and ask questions there. | Cheapest by far — you pay no token costs, you get a full-featured chat client for free, and you learn which tools are actually useful before designing UI around them. No in-app experience. |
| **B. In-app AI panel** | The server acts as an MCP *client*, calls an LLM API, orchestrates the tool loop, streams answers into your UI. | Best experience, available to every student. You pay per token, you manage API keys and rate limits, and serverless timeouts constrain agent loops. |
| **C. Both** | Same core tools, two consumers. | The end state. B is a thin layer once A exists. |

Recommendation: **A in phase 5, B in phase 6.** A is a few days of work on top of a good service layer and immediately gives you real insights; it also tells you what B's UI should even look like.

**Transport:** MCP over **Streamable HTTP** (works on Vercel functions). The stdio transport is for local processes and is not applicable to a hosted server.

**Read/write split — propose-and-confirm** *(Q20.7, **confirmed** 2026-09-02).* The model never mutates anything directly, ever. It may call `queries/`; it may not call `commands/` — enforced by the `service` caller kind being read-only by construction (§20.1), not by which tools someone remembered to register. When write capability is eventually wanted it takes exactly one shape: a tool that **proposes** an action, which the app renders as an explicit confirmation — "Claude wants to add a chart: average auto pieces by team, this event — Apply / Discard" — and a human tap applies it through the ordinary command path with the ordinary authorization check. **Scoped, when it arrives, to chart-building and form-building only** — never pick lists, never scouting entries. Those two are where a wrong automated write costs real competition data, and where there is nothing to find it by afterwards: no user audit log (Q5.5) and no per-entry edit history (topic 13). Direct model writes are therefore **out of scope permanently**, not parked.

**Grounding and citations.** Every insight must be traceable: if the model says "1577 is your best second pick", the answer should carry the metric values and the match numbers it used. Untraceable AI claims about competition data are worse than no AI, because a student will act on them. Tools should therefore return identifiers alongside numbers so citations are possible.

**Where the LLM is genuinely better than a chart** — worth knowing, because it decides which tools matter most:

- **Summarising free-text notes.** 200 scouter comments across an event, turned into five themes per team. Charts cannot do this at all, and it's the single highest-value use.
- **Natural-language querying.** "Which teams scored more than 5 in auto and never broke down?" → resolved to a `query_entries` / `rank_teams` call.
- **Narrative match strategy briefs.** Six robots' stats turned into a paragraph the drive team can read in 90 seconds.
- **Explaining a pick list.** Turning a weighted composite score into a rationale you can defend to your mentors.
- **Anomaly narration.** "Team 4590's scoring dropped 60% after match 40 — three scouters mention a broken intake."
- **Building things from a description.** "Chart average auto pieces by team for this event" → emits a chart config in the topic 10 schema. Reuses infrastructure you're already building.

**Offline reality:** AI features require internet, so they are inherently unavailable at most of a competition. Generated insights should therefore be **saved and cached** (a stored "briefing" document per match or per team) so they can be read offline after being generated at the hotel.

**A third, much lighter AI surface: an in-app usage/help agent (parked).** Separate from both the MCP server (A) and the data-insights panel (B), a **usage agent** answers questions about *operating the app* — "how do I create a field?", "where's the pick list?", "how do I set an ordinal enum's order?" — not questions about scouting data. It is far cheaper than B because it needs **none** of the data machinery: no MCP endpoint, no access to the use-case layer or the scouting database, no semantic field metadata, and **no RAG/vector store** — the app is small enough that a single maintained **help corpus (one markdown file)** fits directly in the system prompt. Its only real prerequisite is the same deferred decision as everything else here — **an LLM connection on the server** (API key in server env, never client). Scope it to **refuse data questions** so it stays a documentation assistant. Like B, it needs internet, so it is a **build-season / at-home** aid, not a venue tool — which is fine, since usage questions arise while setting the app up, not during a match. Estimated effort once an LLM connection exists: **a day or two** (chat panel + help.md in a prompt); the ongoing cost is keeping the help doc current, which fits the mentor-maintenance model (§1.1) and changes little year to year because usage docs describe the *builder*, not a specific game.

### 20.4 Closed & parked questions

**Closed 2026-09-02 — topic 20 CLOSED.** Five questions closed — the two live ones, the parked Q20.7 (pulled forward because it constrains phase 1), and two raised in the closing session. Confirmed in §20.1 and §20.3.

- ~~**Q20.5**~~ ✓ **CLOSED:** scouter names are **kept** in query output — no default redaction, no opt-in flag — because the app is the boundary and §5.1 already shows all data to every role. Re-opened by the parked decision to connect an LLM. Also recorded in §17.3.
- ~~**Q20.6**~~ ✓ **CLOSED** *(decided-by-Claude)*: **not a fourth role.** A `service` **caller kind** outside the user model — no users row, not assignable, cannot log in, read-only by construction. §5.3's dependency note resolved.
- ~~**Q20.7**~~ ✓ **CLOSED:** **propose-and-confirm.** The model never writes directly; a proposed action is applied by a human tap, and only for chart-building and form-building — never pick lists or entries. Direct model writes are out of scope permanently (§20.3).
- ~~**Q20.16**~~ **[RAISED BY ME]** ✓ **CLOSED:** every use case takes an explicit `caller` first argument; authorization never reads transport state (§15.2).
- ~~**Q20.17**~~ **[RAISED BY ME]** ✓ **CLOSED as a recorded residual, no v1 action:** free-text note bodies are not sanitised and cannot be; the first LLM connection must face it alongside the Q20.5 condition.

**Parked until you decide to connect an LLM.** Recorded so we don't re-derive them, but not to be answered now:

- **Q20.1** *(parked)* — MCP server first, or in-app AI chat panel first?
- **Q20.2** *(parked)* — Which insights matter most: notes summarisation, natural-language querying, match strategy briefs, pick list rationale, anomaly narration, natural-language-to-chart?
- **Q20.3** *(parked)* — Who gets AI access: admins and leads only, or every scouter?
- **Q20.4** *(parked)* — Which model provider, and whose API key?
- **Q20.8** *(parked)* — Cache and version generated insights as documents, or generate fresh each time?
- **Q20.9** *(parked)* — Build evals with a fixed test dataset?
- **Q20.10** *(parked)* — Share the MCP server with other teams? Relates to Q1.4.
- **Q20.11** *(parked)* — Give the model access to official results and TBA data alongside your scouting data?
- **Q20.12** *(parked)* — Monthly AI spend ceiling?
- **Q20.13** **[RAISED BY ME]** *(parked)* — **Usage/help agent** (see §20.3): do you want it, and at what priority relative to the data-insights panel (B)? It is cheaper and independently useful, so it could ship first once an LLM connection exists.
- **Q20.14** *(parked)* — Where does the **help corpus** live and who maintains it — one in-repo markdown file the mentor edits each season?
- **Q20.15** *(parked)* — Does the usage agent share the **same LLM connection/provider/key** as the data panel, or use a separate, cheaper/smaller model (its questions are simple)?

---

## 21. Decision log

Decisions get recorded here as topics close, so Claude Code (and future you) can see not just what we chose but why.

| Date | Topic | Decision | Rationale |
|---|---|---|---|
| 2026-09-18 | 16 / 17 (amendment) | **Dark `--border` raised from `#3F3F46` (zinc-700) to `#71717A` (zinc-500)**, amending the fixed palette. The outdoor theme's `--border` is unchanged. An anti-regression note now sits beneath the palette table in this document and in `SPEC-FINAL.md` §17.4. | The palette fixed the token at zinc-700; the accessibility floor requires **3:1 for UI boundaries in both themes** and states that a failing token pair is “a bug, not a preference”. The two contradicted each other. Measured: zinc-700 gives **1.89:1** on `--bg`, **1.70:1** on `--surface` and **1.43:1** on `--surface-raised`. Zinc-600 also fails; zinc-500 is the first step that clears the floor (4.09 / 3.67 / 3.08). The floor wins because a contrast minimum is a legibility requirement while a hex is a choice, and an app whose stated purpose is dim-arena and sunlight readability cannot ship boundaries its own spec calls a bug. Surfaced by the phase-0 build run (`DEVIATIONS.md`, task 0.4), which correctly refused to change a spec-fixed token on its own authority; its suggested `#6E6E76` was measured here and does **not** clear `--surface-raised` (2.95). Every other pair in the table passes in both themes. |
| 2026-09-02 | SPEC-FINAL / 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 15, 17, 19 | **`SPEC-FINAL.md` v1.0 written**, and with it **32 consolidation decisions** (its Appendix D) closing gaps this document left unstated, plus **six amendments that supersede closed decisions**. *Superseding:* **one score per field, not per field per phase** (amends Q2.8a — a two-phase game element is two fields); **`show_on_team_card` and the quick-summary field flag withdrawn** (amends Q3.8 — the team page is built from metrics); **super scouting is (team, event)**, resolving the "(team,match) or (team,event)" ambiguity in §2.2; **metrics and the scoring model are not versioned**, both edited in place (amends §9.2 and §2.1); **one TypeScript metric engine on both sides**, SQL only for the fixed skeleton (resolves §9.2 vs §15.1-C1); **a `parent-deleted` record is hard-deleted on the client behind a notice naming what was discarded** (amends §17.3). *New structure the spec never modelled:* an **`event_teams` roster** with an admin surface; **`match_teams`** replacing six nullable alliance columns; an **`app_settings` singleton** for the active context (the only shape that expresses "active season, no events yet"); one **`sync_conflicts`** table keyed by `(entity, row_id)` so a pick-list ordering conflict has somewhere to live. *New mechanisms the plan cannot be written without:* the **push protocol** (`POST /sync/push`, per-operation ack taxonomy, `op_id` idempotency, outbox coalescing to one pending op per row); the **delta pull** (full first pull, then `updated_at > watermark` with a 5-second overlap, backed by a `BEFORE UPDATE` trigger on every table); **custom auth** (bcrypt cost 10 via `bcryptjs`, 30-day sliding HS256 JWT, offline login against cached hashes, and **per-operation authorization against `author_user_id`** so a shared tablet can push several scouters' work); **duplicate `(event, match, team, kind)` entries kept and flagged with the latest `client_updated_at` winning**; **QR parameters** (fflate deflate, 2,300-byte frames, QR v40/EC-M byte mode, cyclic repeat at 5 fps, 200-op batches, and disposal of a received copy **on its cloud ack rather than on a timer** — never before the ack, plus a manual "discard received QR data" action guarded like the device wipe); **bare match auto-creation** as a system action available offline to every role; **event-log cycle derivation** for the timed and un-timed cases; and **phase 1 shipping a fixed ranking table**, with the configurable weighted one moving to phase 2 alongside the metric builder it depends on. | The distillation was the first time every topic had to hold simultaneously, and that is what surfaced these. Three classes of problem came out of it. **Contradictions between topics closed weeks apart:** §9.2 still described SQL metric views that §15.1 had deleted a fortnight later, and Q2.8a explicitly deferred the per-phase/per-field question to topic 3, where it was never picked up — each would have been discovered mid-build, with code already written against the wrong reading. **Rules that named no mechanism:** "preserve the superseded version", "never prune before a cloud ack", "scouters can log in and switch user offline" and "one canonical entry per (team, match)" were all confirmed requirements with no table, no column and no protocol behind them — and the last one was actually unenforceable as written, because divergence detection keys on row UUID and two offline devices produce two different UUIDs, so the double-counting the rule forbids would have happened silently. **Entities nothing had ever modelled:** the rank badges, the robot picker and the coverage metric all read "the teams at this event", which existed nowhere; the active context needed a state ("season chosen, no events yet") that a boolean on `events` cannot express. The six supersessions are the user's calls, taken on 2026-09-02 in answer to the consolidation gap list, and each simplifies rather than adds: fewer versioned things, fewer per-field flags, one engine instead of two. The one that costs something is the `parent-deleted` hard delete, which trades the old "never discard" promise for a queue that can actually be emptied — the visible notice and the local log are what keep the loss honest. |
| 2026-09-02 | 20 / 5 / 15 / 17 | **Topic 20 CLOSED — scope unchanged (setup only); five questions closed: the two live ones, the parked Q20.7 pulled forward, and two raised in this session.** **Q20.5: scouter names are kept in query output** — no default redaction, no opt-in flag — with an attached condition that the decision is re-opened by the parked decision to connect an LLM at all, since a model provider is outside the app boundary the decision assumes; §17.3 carries the same note. **Q20.6 (decided-by-Claude): no fourth role** — a `service` **caller kind** instead, outside the user model (no users row, not assignable, cannot log in), **read-only by construction** because every `commands/` use case rejects it; §5.3's dependency note resolved and §5.2 marked as governing users only. **Q20.16 [RAISED BY ME]: every use case takes an explicit `caller` first argument** — `{ kind: 'user', userId, role } \| { kind: 'service', label }` — and authorization reads that argument only, never the Hono context or ambient request state; each transport builds it at its edge; specified in §15.2. **Q20.7: propose-and-confirm** — the model never mutates directly; a future write tool *proposes* and a human tap applies it through the ordinary command path, **scoped to chart- and form-building only, never pick lists or entries**; direct model writes are out of scope permanently. **Q20.17 [RAISED BY ME]: free-text note bodies are not sanitised** — recorded as a known residual with no v1 action. §20.3 relabelled from "proposed decisions" to recorded deferred design; Q20.1–Q20.4 and Q20.8–Q20.15 stay parked. | The answers that cost nothing today — the `caller` argument and the `service` kind — are exactly the ones that would have been expensive to retrofit, which is the whole logic of this topic. The `caller` argument is the load-bearing one: §15.2 has claimed a transport-agnostic layer since 2026-08-14, but a use case that reads the HTTP request satisfies that claim on paper and breaks it in practice — the failure would surface only in phase 5, as a signature change to every query, every call site and every test, which is precisely the rewrite the topic exists to avoid. Choosing a caller *kind* over a fourth role follows from how roles work here: they are handed to people the admin provisions and can log in, so a `service` role would sit in the user list waiting to be assigned to a human by mistake, while read-only-by-construction at the command layer cannot be misconfigured at all. Keeping scouter names is right for an app whose data never leaves it — but the premise, not just the answer, is written down, because the same data becomes an outbound payload the day MCP is connected, and a decision whose assumption is unrecorded is a decision that silently expires. Propose-and-confirm is the same instinct applied to writes: the appealing part of an AI that acts is the chart it builds, and the dangerous part is the pick list it reorders twenty minutes before alliance selection with no audit log (Q5.5) and no edit history (topic 13) to reconstruct what it did — so the capability is split along exactly that line rather than granted or refused wholesale. Q20.17 changes nothing today and is recorded anyway because notes summarisation is the highest-value AI feature on the list, so the first LLM connection will send student-written free text off-platform whether or not anyone remembered to think about it. |
| 2026-09-01 | 19 | **Topic 19 CLOSED. v1 = phases 0, 1 and 2, due 2026-11-20** — superseding §1.1's 2026-10-01 soft target. Old phases 3–6 recorded as **post-v1, unscheduled** (§19.5); they had already been emptied by closed decisions (topic 14, Q6.1/6.2, Q13.1, Q13.3, topic 20.1) and the numbering had simply not caught up. Two stale contradictions fixed: the **position picker, event log and cycle path are v1** field types per Q3.3 and ship with the phase 1 form builder (their heatmap/arrow rendering is phase 2), and **phase 2 loses the coverage/quality matrix**, which Q13.1 sent to §24 gated on the TBA import. **No photo feature and none wanted** — the only image is the per-season game map, already a committed static asset, so §15's no-Storage decision stands. **Phase 1 is built as a vertical slice** (Q19.4): the §1.2 criterion end to end and ugly before anything is generalised. **A gate per phase** (Q19.5), phase 1's being ten practice matches entered in airplane mode by an untrained student with a correct ranking table afterwards. **Built solo with Claude Code** (Q19.3), one task at a time, each task self-reviewed before its diff is shown. **Fallback is Google Sheets** with no import path back (Q19.6). **`IMPLEMENTATION-PLAN.md` covers phases 0–1 in full detail, phase 2 as headings** (Q19.7). Checkpoint: phase 1 gate by ~2026-10-20; if it has not passed by 2026-11-01, phase 2 is cut to the metric builder and ranking table. | The scope did not change here — the labels did. Leaving phases named after work that five closed topics had already removed meant the delivery plan quietly disagreed with the spec, which is exactly the kind of drift that gets discovered mid-build. Vertical-slice-first is risk ordering: offline entry and sync are both the reason this project exists (§1.1) and the hardest things to debug at a venue (§7.2), so they get proven while there is nothing built on top of them. The gates are phrased as observable events rather than judgements because "phase 1 feels done" is how a team arrives at a competition with an app nobody has tried. Phased-with-gates over one big build was chosen for two reasons that outlast the deadline: sync and versioning bugs do not crash, they silently write wrong data, and a solo maintainer who reviewed the code in small pieces still understands it two seasons later. The 20/11 date is honest but tight, so the cut line is written down in advance — deciding what to drop under pressure, in November, is how the wrong thing gets dropped. |
| 2026-09-01 | 17 | **Topic 17 CLOSED.** Targets confirmed with two corrections: sync latency restated as *server within 2 s of connectivity, other devices on the 45 s refresh* (the old wording contradicted topic 8), and a **championship-division scale row** added (~75 teams, ~110 quals). **Testing (Q17.5) = two tiers:** four unit suites (metric engine, sync/conflict, form versioning, offline-draft persistence) plus a **smoke suite** running the real client→server→dev-Supabase path. **Backup (Q17.2): no in-app export or restore in v1 → §24**; the substitute is a manual `supabase db dump` before every event and at season end. **Privacy (Q17.4): full name + username only** — no email, phone, DOB or photo. **Deletion is a feature (new):** admin-only, cascading from season and competition, type-to-confirm naming exact counts, the active context undeletable, a form version with entries still blocked per §16.1, and entries synced from an offline device whose parent was deleted are rejected as `parent-deleted` into the review queue rather than dropped. **Retention: nothing is auto-pruned.** Offline window one day (Q17.6), only the active competition held offline (Q17.7), device floor Android Chrome ~2 years / iOS Safari 16+ (Q17.8, decided-by-Claude). | The testing shape follows the actual fear: not "prove the app is correct" but "prove I didn't break the wiring" — hence a shallow smoke suite over the real database instead of a mock, and depth reserved for the four subsystems whose failures are silent (a wrong average and a dropped sync both look fine on screen). Export was cut because the same protection is available for free: `supabase db dump` is one CLI command the maintainer already has, so building an export feature buys convenience, not safety, and convenience can wait. Deletion had to be specified because "I won't keep much from past years" is a delete requirement in disguise, and an unspecified delete is the single most dangerous feature in the app — cascades that surprise, an admin deleting the event being scouted, and offline devices syncing into a hole. The one-day offline window is what defuses iOS's 7-day storage eviction, which is why enforcing home-screen install was not worth the friction. Nothing is pruned because pruning without an export is just deletion with a nicer name. |
| 2026-09-01 | 14 | **Topic 14 CLOSED — deferred in full to §24.** No external data source in v1. Q14.2–Q14.5 answered anyway and kept as §14.2's *recorded design* for when the import is built: **TBA read key obtained at build time**, server-side only and covered by the Q18.5 transfer checklist; **results imported, not just the schedule**; **manual "sync now" plus a throttled automatic sync when online**; and a **re-imported schedule reconciles rather than overwrites** — entries stay bound to their `(team, match)`, changed or vanished matches are flagged for review, surrogate matches are marked so the metric engine can exclude them, and a re-import is shown as a diff to confirm. The §24 row now points at §14.2. | Q14.1 already deferred the feature on 2026-08-14, but leaving the topic OPEN with four live questions made it read as unfinished v1 scope; closing it removes the ambiguity without discarding the thinking. Answering the four questions now is nearly free and prevents the worst version of this feature — a future session designing a blind overwrite that silently rewrites the `(team, match)` keys a weekend of scouting is bound to. The manual-entry path stays first-class precisely because v1 depends on it: built later as a fallback to the import, it would be built worse. |
| 2026-09-01 | 16 | **Q16.3 CLOSED — topic 16 now fully closed.** A **per-surface reference table** added as §16.3, with a system-wide **Linear/Vercel** baseline (restrained dark chrome, muted borders, one accent, tight type scale — which is also shadcn's default). Per surface: **Sofascore** for the team stat page and for 2-team compare; **Tally / Typeform / FotMob** for phone entry; **Fillout** for the three-pane form builder with a phone-width preview; **Grafana + Metabase + Tremor** for the dashboard grid, builder order and chart visual language; **shadcn data-table + TanStack + a league table** for ranking; **Todoist** for pick-list drag (explicit handle, long-press on touch); **Obsidian Sync** for a status surface that names the state and lists what didn't sync; **Figma's file browser + Notion** for the context/landing page (card grid, document-calm rather than control-panel); **op.gg** for the mirrored alliance match preview; **Attio** for dense search lists with a full-page record; **Clerk** for user admin — all four confirmed 2026-09-01. `mobbin.com`, `godly.website` and `ui.shadcn.com/blocks` recorded as standing build-phase libraries. **References govern layout and behaviour only, never palette.** | Answering Q16.3 last was the right order: with the design system already decided, a reference can only refine it, and every choice above is a *layout* borrowing that leaves §16.2's tokens and the brand rules untouched. The genre matters more than the polish — op.gg beats a football site for match preview because two teams of N players with mirrored metrics *is* the alliance-preview problem, and a CRM beats a sports site for the entry-search page because dense-list-to-record is exactly the same shape. The three Claude-decided rows are marked as such and are single-line changes, so leaving them unresolved would have cost more than deciding them. Restricting references to behaviour is the load-bearing constraint: copying any of these palettes would silently undo the yellow-as-accent-only and two-theme decisions that the contrast arithmetic in §16.1 forced. |
| 2026-09-01 | 16 | **Topic 16 CLOSED** (Q16.3 deliberately left for last). §16.2's proposals promoted: two experiences one codebase, **Tailwind + shadcn/ui**, **dark default**, mobile-first breakpoints, skeletons, always-visible sync indicator. **Device roles made explicit:** the phone does the whole competition job (entries, statistics, search/ranking/compare/match preview, pick-list view + lead do-not-pick, sync); the computer does everything and is the **only** place the builders live — **builder routes require ≥ 1024 px** and otherwise render one honest "this needs a computer" panel; **alliance selection and conflict review must work at any width**; and **device gating is never a permission** (§5.2 stays the authority). **Branding: ROBACTIVE #2096, brand yellow `#FFEA07`**, assets in `docs/brand/` — but a **neutral dark UI with yellow as the single accent, not a black-and-yellow app**; yellow never on a light surface (1.23:1), logo always on a near-black plate; **functional colour kept out of branding**. **Two themes** — dark + outdoor high-contrast (ordinary light → §24). **Inter + Noto Sans Hebrew, self-hosted** (Q16.7). **48 px targets, WCAG AA, OS text size, visible focus** (Q16.10). **PWA identity** with trefoil-only icons (Q16.9). **2 decimals / 0 on counts, `DD/MM/YYYY`, 24-hour, device-local** (Q16.8). **One six-variant empty/error component** (Q16.11) and **one destructive-action pattern** with type-to-confirm limited to multi-record irreversibles and orphaning actions **blocked** (Q16.12). **Printing out of scope** (Q16.4); Q16.5 resolved by Q6.7, Q16.6 superseded by Q15.6. | The device split is the load-bearing decision: a form builder that half-works on a phone would be used on a phone, at a venue, by whoever is holding it — so refusing honestly at < 1024 px is kinder than a cramped UI, while alliance selection and conflict review get the opposite treatment because they genuinely happen in a stand with a phone. Keeping yellow to an accent is not taste but arithmetic: `#FFEA07` is 16:1 on near-black and 1.23:1 on white, so it can be brand chrome or it can be text, never both — and reserving it from data ink keeps §10.2's red→green shading meaning what it says. The font decision is the one that silently breaks: Inter ships no Hebrew glyphs, so shipping shadcn's default would leave every Hebrew label rendered in an arbitrary fallback, and a CDN fetch is exactly the kind of dependency that fails at a venue. Two themes rather than three because the outdoor high-contrast surface Q6.7 already requires *is* a light theme — a third would double the token testing for no new capability. Printing was raised and declined; the blank paper backup form still went to §24 rather than being dropped, because it is the only fallback left when the tablets die and it costs almost nothing once a form definition already renders. |
| 2026-09-01 | 18 / 15 / 19 | **Topic 18 CLOSED.** Three environments — **production, preview (per PR), local** — where **preview and local always use the dev Supabase project, never production** (Q18.8). **Migrations auto-apply to dev from CI but are applied to production by hand**, one deliberate CLI command (Q18.7). **Two per-app `.env.example` files**; the **client holds no Supabase credentials at all**, only the server API base URL — correcting the earlier §18.2 wording, which predated the all-through-server decision (Q15.1). **Twice-weekly scheduled GitHub Action calls `/health` on both dev and production** to defeat the free tier's ~7-day inactivity pause, plus a 48-hour pre-event check (Q18.9). **`docs/ops/RUNBOOK.md`** — a one-page event-day failure checklist (Q18.10). **A manually triggered dev seed script** (Q18.11). **Accounts stay personal for now but nothing may depend on a personal identity**, and `SETUP.md` carries a transfer checklist (Q18.5). **No self-hosted / laptop-at-the-venue fallback** (Q18.4). Deferred → §24: off-platform **backups/export** (Q18.6), a **custom domain** (Q18.1), **error/usage monitoring** (Q18.3). | Preview deployments are cheap and constant, so the only safe rule is that nothing but production touches production — one mistake there costs a season of data. Manual production migrations exist for the same reason: the calendar, not the merge, decides when it is safe to change a schema, and competition weekends are the one time a rollback is impossible. The client-credentials correction matters beyond tidiness — shipping a Supabase key to the browser would quietly reopen the direct-access path that §15 deliberately closed. The keep-alive is the smallest possible answer to a failure mode that is otherwise discovered at 07:00 on a competition morning, and it must cover dev too, since a paused dev project blocks development just as effectively. The runbook is written for the person actually holding the tablet at a venue — five minutes, no internet, possibly a student — which is a different document from the setup guide. Backups, domain and monitoring are all genuinely wanted but none of them changes the architecture, so they defer cleanly; the offline-first design already means a lost server is not a lost weekend. |
| 2026-08-31 | 15 / 18 / 19 | **Topic 15 CLOSED.** **Hono, no tRPC** (Q15.3) — the typed client is derived from the use-case registry. **Generated Supabase DB types + shared Zod** (Q15.5). **No Supabase Storage or binary uploads in v1** (Q15.6): the season game image is a **static client asset** committed to the repo, the DB stores only its path, and the service worker precaches it — which is also what makes offline position-picking work (Q15.12). The image is **immutable once entries exist** (new image ⇒ new filename) and a missing image **fails loudly**. **Full dev environment** — dev Supabase project + dev Vercel deployment + local run (Q15.7). **MCP = a route in `apps/server`, recorded now, built only in phase 5** (Q15.9). **PWA updates activate on cold start only, never auto-reload**, with a visible version string (Q15.11). **Two Vercel projects, bearer-token auth in a header, no cookies** (Q15.13). **pnpm + Turborepo, pinned pnpm, Node 22, Node runtime not Edge, `packages/shared` kept browser-safe** (Q15.14). New build deliverables: **`docs/ops/SETUP.md`**, a committed **`.env.example`**, and **mini CI on `develop`** with required metric-engine and sync-protocol tests; **`develop` = integration, `main` = production** (§18.1, Q18.2 closed). Phase 0 added to §19.1. | The registry already carries the Zod schemas and descriptions MCP needs, so tRPC would be a second typing layer that still doesn't emit JSON Schema — one abstraction, two consumers. Making the game image a repo asset rather than a stored upload removes an entire subsystem (bucket, upload UI, permissions, offline caching of a binary) in exchange for a yearly commit, and the precache falls out for free — which matters because position data is worthless if the image is missing offline. Immutability is forced by physics, not preference: coordinates are normalized against one specific image, so replacing it silently re-frames history, exactly like renaming a field key. A dev environment is the only protection against testing cascade-delete on real competition data. Cold-start-only updates exist because a service-worker reload mid-match destroys the one screen that cannot be re-created. Cross-origin by construction is why auth is a header token — cookies would drag in CORS credentials and `SameSite` for no gain. The setup guide and `.env.example` exist because handover kills team tools more often than bugs do, and CI exists because the metric engine and the sync protocol are the two places where a regression stays silent until it costs an event. |
| 2026-08-31 | 3 / 15 | **Generated per-form-version SQL views dropped from v1 → §24** (C1) — amends the 2026-08-14 Option A decision. Flattening happens **only** in the shared TypeScript engine. | The views can only be created after an admin builds a form, so the server would run `CREATE VIEW` against the live database: part of the schema would live outside the repo's migrations (breaking reproducibility), the app would need DDL privileges in production, and there would be **two** implementations of "unpack the JSON into fields" — the TS one every feature uses, and a SQL one nobody tests. Nothing in v1 reads them; the cost is only that ad-hoc SQL must query the JSONB directly, and CSV export covers the rest. |
| 2026-08-31 | 12 / 5 / 7 / 8 / 19 | **Topic 12 CLOSED.** Alliance selection is **in scope for v1 and moved from phase 3 to phase 2** (Q12.1) — nothing in it depends on the deferred TBA import. **Admin-only editing, everyone else views** (Q12.3); the single exception is a **lead adding a do-not-pick entry with a required reason**, which they may not then edit or remove. Two ordered pick lists (**first** / **second**) per event, drag-reordered and **seeded from a §11.2 saved weight preset**, with **automatic round switching** once all 8 alliances hold a first pick. **Do-not-pick blocks an add outright, but only *flags* a team already on a pick list** — a lead's addition never fails and never reorders the admin's list — and every do-not-pick row has **one-tap removal** that instantly clears the flag. **Alliance bracket entered manually** (Q12.2): 8 alliances × captain/pick1/pick2 + optional **backup**, plus **declined** markers; writes locally and syncs now if online, otherwise on the next sync. **Cross-off is derived** from the bracket and is instant on the admin's device, 45 s for online viewers, sync-time for offline ones — **the admin's device is the declared source of truth during selection** (resolves the §8.2 dependency note). A **list-level `version` guards reorders** as one whole-ordering operation. Printing stays deferred (Q10.4 → §24; Q16.4 open). Role matrix (§5.2), offline-editable set (§7.3) and phasing (§19.1) amended to match. | The 20-minute selection window is the whole point of the two days of scouting, so the design optimises for one person answering "who's next?" in seconds, not for consensus tooling. **Single-editor ownership is the load-bearing choice:** with realtime deferred (§8) and the room usually offline, a shared editable list would produce two devices disagreeing at the worst possible moment — so one device is authoritative and everyone else reads. The lead's do-not-pick exception exists because the people who *notice* a robot is unpickable are the leads watching matches, and the cost of them being able to add a warning is far lower than the cost of that warning never reaching the list. Blocking an add but merely flagging an existing entry keeps the two roles from fighting: a lead can always raise a concern, but only the admin ever changes the order. Deriving cross-off from the bracket instead of storing it means a mistyped pick is corrected in one place and every list fixes itself, the same reason scores are derived from raw entries (§2.2). The list-level version exists because last-write-wins is per-row and an ordering is not a row — without it, two offline reorders would silently destroy one person's work. Moving the feature to phase 2 prevents it from being deferred by association with a TBA import it never needed. |
| 2026-08-12 | 20 | **AI/MCP is setup only.** Build the two non-deferrable prerequisites (semantic field metadata, transport-agnostic use-case layer) in phase 1. No MCP endpoint, no LLM calls, no AI UI. Phases 5–6 deferred. | Keeps phase 1 small while ensuring the only expensive-to-retrofit pieces exist. Everything deferred is purely additive. |
| 2026-08-14 | 3 | **Storage = Option A (JSONB payload) with generated per-version views.** | Data volume is tiny for Postgres, so Option B's speed edge is irrelevant, while its costs (runtime DDL, per-table RLS, offline schema-mirroring, and losing multi-season history if old tables are dropped) are exactly what breaks at a venue. A gives B's query ergonomics via generated views without the risk, and is far easier to expose to an LLM (one stable shape + field dictionary). |
| 2026-08-14 | 3 | **Immutable form versioning**, but label and range edits are in-place (not a new version); range edits never invalidate existing data; keys permanent. | Preserves interpretability of historical entries while keeping the common, low-risk edits cheap during build season. |
| 2026-08-14 | 3 | **Semantic field metadata captured at creation; `description`/`unit`/`phase`/`direction` required.** | Impossible to backfill; drives generated validators/views and chart labels now, and is the LLM data dictionary later. Requiring the core four ensures they get filled in. |
| 2026-08-14 | 7 | **Offline statistics: yes — metric engine runs in the browser too.** | Ranking teams offline is the most valuable moment of an event and venue connectivity is ~zero. Feasible because the shared TS engine is the same code online and off. |
| 2026-08-14 | 1 | **Single-team install; multi-tenant out of scope.** | Simplest; retrofitting multi-tenancy touches every table and policy but isn't needed. |
| 2026-08-14 | 16 | **English LTR app chrome; Hebrew bidi-aware form content.** | Avoids full-app RTL cost while correctly rendering Hebrew labels/notes wherever they appear. Built in, not retrofitted. |
| 2026-08-14 | 15 | **TypeScript everywhere (React+Vite client, Node+Hono server, shared engine); all traffic through the server API; transport-agnostic use-case layer; runtime-generated form validation.** | One language lets the offline metric engine be written once and shared, avoiding drift on the most correctness-critical code; Zod→JSON Schema makes MCP a mechanical mapping. All-through-server is a clean single control point once cross-device realtime is deferred. |
| 2026-08-14 | 8 / 15 | **Cross-device live push deferred to nice-to-have; optimistic local UI kept.** | Removes the one thing that fought the all-through-server model and the Vercel serverless constraint; local-first UX plus refresh triggers cover the real need. |
| 2026-08-14 | 14 | **External API import (TBA/FRC) → nice-to-have.** | Wanted but not now; defers dependent scouter-assignment and result-validation features. |
| 2026-08-15 | 20 | **In-app AI panel (approach B, phase 6) → nice-to-have (§24).** MCP server (approach A, phase 5) stays parked, not nice-to-have. | Consistency: the actual LLM-in-app connection is a wanted-but-deferred feature like TBA import, so it belongs in §24. The MCP endpoint's timing is a separate future decision, so it stays parked. Setup-only prerequisites remain in phase 1. |
| 2026-08-15 | 1 | **Topic 1 CLOSED.** Team 2096, FIRST Israel district + Championship (divisions). ~11 peak users (8 scouters/2 leads/1 admin). Replaces a prior app that failed offline and across seasons. Mentor-maintained, low-maintenance multi-season, handover checklist a v1 deliverable. Soft target 2026-10-01. Success criterion + v1 non-goals confirmed. | Scale is small → confirms JSONB (§3) and all-through-server (§15) are safe. Championship participation adds division events, modelled as regular flat events (§2, Q4.3). Prior-app pain validates offline-first + year-agnostic as the primary drivers. Mentor ownership + multi-season lifespan mandates boring, documented tech and an explicit handover artifact. |
| 2026-08-17 | 2 | **Topic 2 CLOSED.** Fixed/flexible split confirmed; Event = name+year, Team = number+name. Added a **scoring model** — points entered inline per field but stored/versioned **separately** from the form version; entries hold raw observations, the score is **derived** (Q2.8d: a scoring change is never a new form version). v1 form kinds = match + super only. Scout all 6 robots incl. our own. No per-alliance data. | Fixes the stable-vs-game-specific boundary the whole app rests on. Storing raw data and deriving the score means a mid-season scoring correction re-scores history instead of fragmenting it into new form versions, and makes official-result reconciliation (Q2.5) trivial. Match+super match the team's real workflow; pit/other stay cheap to add via the `kind` field. |
| 2026-08-17 | 2 | **Official results reserved-nullable; practice/playoff stored but excluded from metrics; own robot is a regular robot.** | Reserving the results schema now avoids a later migration and costs nothing if TBA import never lands — paired with a UI rule to hide absent scores, never show blanks. Practice/playoff data is useful to browse but would distort averages, so only qualification matches feed metrics. Our robot is just one of the 6 scouted robots — no separate tracking module to build. |
| 2026-08-17 | 4 | **Championship divisions modelled as regular flat events; no division hierarchy** (Q4.3). | A division behaves like any other event for scouting; a hierarchy adds modelling cost with no scouting benefit. |
| 2026-08-17 | 4 / 16 | **App-wide active context (season + event): admin sets the default the app opens to; user overrides are session-only and never saved; only the default is cached offline. Governs both browsing and new-entry attribution; switcher on a dedicated page, not the header** (Q4.1). | A wrong active event silently ruins data, so the switch is deliberate (off the main nav) and non-sticky (always returns to the admin default). Not persisting overrides also removes per-user context storage — less data, simpler DB. |
| 2026-08-17 | 2 / 9 | **Scoring model fully specified (Q2.8a–f): non-negative points defined per field per phase; success = points > 0; scouted score = sum of field points (match/alliance total = sum across robots); no alliance-level bonus points.** | Simple, additive scoring the metric engine computes identically online/offline; success-as-points>0 avoids a second predicate to maintain; excluding penalties and alliance bonuses keeps per-robot attribution clean and matches what a scout can actually observe. |
| 2026-08-17 | 3 | **Topic 3 CLOSED.** Field catalogue = all types except Photo (deferred); Timer editable-after-stop + nullable; Event log = timestamped taps; Field-position picker stores normalized 0–1 coords on the season game image with **per-field alliance normalization** (red raw, blue mirrored H/V/both, with builder preview). List-builder + live preview UI (JSON behind advanced). **Main/active version + restorable snapshots; stats run on the main version; a metric on a missing field shows "cannot calculate this metric."** A **form belongs to a season** (several forms per season, all its events use them). Delete = **cascade behind a warning, admin-only.** Per-field `show_on_team_card`. Conditional logic kept; form-duplication dropped, JSON export/import kept. LLM metadata-suggestion → §24. | Position data is meaningless without alliance framing, so normalization is captured at the field, not backfilled. One main version keeps statistics deterministic while snapshots preserve interpretability; a loud "cannot calculate" beats silently wrong aggregates. Form-per-season matches the FRC reality (one game a year) and simplifies the event→form link. Cascade-with-warning matches the team's own preference over soft-archive. |
| 2026-08-18 | 4 | **Topic 4 CLOSED.** No event types — every event is a regular flat event (`type` dropped, Q4.2). Events weighted **equally** across a season, no event-level recency (Q4.4). **No external import in v1** — no data-import path, no `source` field on entries (Q4.5). Events model = `events(id, season_id, name, code?, is_active)`: `code` nullable and unused (reserved for deferred TBA import, §24); `start_date`/`end_date`/`location` dropped. Aggregation scopes (single event / season / all-time / custom set) adopted. | All the team's events behave identically for scouting, so a `type` field and division hierarchy add modelling cost with no benefit. Equal weighting matches how the team reasons about a season and avoids a tunable nobody would maintain. Since no data is imported, the import-only columns (`type`/dates/`location`/`source`) are dead schema — dropping them keeps the model minimal; `code` stays nullable so the deferred TBA import needs no migration. |
| 2026-08-19 | 8 | **Topic 8 CLOSED — realtime deferred.** No live/push in v1; cross-device changes propagate via the existing refresh triggers **plus a 45-second background auto-refresh** on data screens while online (Q8.1). Supabase Realtime, the live match-in-progress view (Q8.2), presence (Q8.3) and notifications (Q8.4) all move to §24 nice-to-have. **Optimistic local UI and the online/syncing/offline connection indicator are kept as core** — they are local mechanisms tied to offline (§7) and the always-visible sync indicator (§16), not cross-device push. | The team is ~11 people and venue connectivity is near zero, so realtime buys little for its cost and complexity; a 45-second refresh is trivial, predictable, and enough for a small crew. Deferring realtime also reinforces the all-through-server model (§15) by removing the one feature that argued for direct client→Supabase subscriptions. Optimistic UI and the sync indicator stay because offline-first depends on them. |
| 2026-08-19 | 7 | **Topic 7 CLOSED.** Offline scope = active competition only in IndexedDB (forms, that event's entries, stats, outbox, cached users for offline login + user-switch). Editable offline: scouting entries + admin-only pick list; not form defs / user mgmt / persisting dashboards (a lead's ephemeral draft stats page works offline). **Last-write-wins live via a base-version check; only genuine divergence (two edits branched from the same ancestor) is flagged for lead/admin "review conflicts", superseded version preserved** — normal edits and re-syncs fast-forward silently; the edit function is separate from sync (Q7.5). **Durability rule: never prune a local record before its own cloud ack** — no action (app close, handoff, QR, lead-wipe) removes an unacked record. **QR fallback ships in v1** as an animated + compressed multi-frame (fountain-coded) batch, scanned once per device-dump; it is additive & idempotent (copy by UUID, sender keeps outbox). Real workflow: central tablet gathers by QR, a runner carries it outside every few games to sync (Q7.1/Q7.2). **Full active competition cached on-device (a few MB — no photos in v1, x,y coords only) so the main statistics page and draft stats pages work offline; the main stats page is view-only offline, saving dashboards needs connectivity; active-competition-only bound; lead-code local wipe** (Q7.7). Device-to-device local-network sync → §24 nice-to-have (Q7.6). | Venue connectivity is ~zero inside the arena but exists outside, so the design is local-source-of-truth + a human-carried sync hop, with QR as the no-network path proven in FRC. UUID keys make every transfer idempotent, so more copies only increase durability; the never-prune-before-ack rule is the one guarantee that makes QR, handoffs and wipes safe. The base-version check keeps the common case (normal edits, re-syncs) friction-free — last-write-wins with no review — while catching only true two-device divergence, which is preserved for a human rather than field-merged by code no student will maintain. Because ranking teams offline is the event's most valuable moment, each device caches the full active competition's raw entries; without photos that is only a few MB, so a per-device game cap was unnecessary. A lead-gated wipe resets bad devices without risking unsynced data. |
| 2026-08-20 | 9 / 4 | **Topic 9 CLOSED.** Layer-1 metric engine ships: **menu builder, no free-text formula language** (Q9.2) with multi-field sums and a per-page display limit/target; match-subset filters (last N and/or manually excluded matches), **no recency weighting** (Q9.6); **standard deviation displayed but never a ranking sort key** while **reliability is a first-class ranking input** (Q9.5); **no cross-event percentile/z-score normalisation** (Q9.7); **minimum sample = 1**, no low-sample flag (Q9.8); **one canonical entry per (team, match)**, sync collisions resolved per §7.3 — no averaging of duplicates (Q9.4). Robot-status reliability exposes per-team breakdown/no-show/disabled counts + availability rate, surfaced in stats/ranking/pick-list. **Layer-2 official-result stats (OPR/DPR/CCWM…) → §24 nice-to-have, gated on TBA import** (Q9.3). Two entry points: a **team stat page** (that team over the active competition's matches) and an **admin-saved general stat-page builder** (leads draft-only, §5.2); **full-season slope view** orders competitions by a new admin-orderable events `sort_order` (§4.1 amendment). | Averages are what actually pick alliances, so the engine stays simple, deterministic online/off (§7.4), and honest: a dead/no-show robot never enters as a zero, duplicates never double-count, and a swingy-but-high scorer can't hide an unreliable robot because breakdown/no-show counts are first-class. A menu builder covers the team's real metrics (piece averages, success rates, `auto+teleop` sums) without the cost and safety risk of a typed evaluator. Consistency is shown for judgement but not baked into ranking per the team's call. Layer-2 stats need imported scores that don't exist in v1, so they wait with TBA. The season `sort_order` field was missing from the Q4.2 model but is required to read a metric's trend across a season left-to-right; it is display order only and does not re-weight aggregates (Q4.4 intact). |
| 2026-08-17 | 17 | **Target the Supabase free tier: store raw entries only (no persisted scores/aggregates, no photos in v1), keep DB actions simple (plain views, no materialized views/heavy triggers/cron), aggregate in the shared engine** (Q17.3). | Keeps a season comfortably within free-tier size and avoids operational complexity students can't maintain. Offline-first + per-event exports insulate scouting from the free tier's inactivity pause and caps; if limits are ever hit, plain-Postgres portability (Neon/self-host) makes migration cheap. |
| 2026-08-18 | 5 | **Topic 5 CLOSED.** Three global roles (scouter/lead/admin), no viewer/mentor, not per-event. All data visible to all roles. **Form templates admin-only; submitting entries open to all** (reaffirms Q3.1/Q3.7). Login = admin-provisioned username+password; admin-only user create (Q5.6), delete (Q5.7, preserves authored content) and promote/demote. Scouters edit own entries for 5 min from creation then the row locks — same offline & online, by client timestamp (leads/admins anytime); ~30-day offline session; switch-scouter on shared devices with per-entry attribution (Q5.8); no user audit log (Q5.5). | Small, trusted team (~11) → the cost of fine-grained per-row DB security exceeds its benefit. Roles map to the real workflow: scouters feed data, leads triage it and explore live, the admin owns structure (forms, users, saved analytics, events). Preserving a deleted user's entries protects historical data across graduating students without a separate deactivate concept. |
| 2026-08-18 | 5 / 15 / 17 | **No database-level authorization: no Postgres RLS, no per-row policies. Authorization lives in the server use-case layer and is surfaced in the UI (hide/disable).** | The team trusts its members and all traffic already flows through the single server control point (Q15.1), so the DB is not an independent attack surface to harden. One enforcement point (the use-cases) is simpler to reason about and maintain than duplicated RLS policies, and it still gates a future MCP caller since MCP reuses the same layer. Replaces the earlier RLS-on-every-table proposal and the privileged-action audit-log target in §17.1. |
| 2026-08-18 | 5 / 10 | **Ephemeral vs. persistent statistics split by role:** leads may create a **draft statistics page** (session-only, discarded on exit); creating/saving persistent dashboards is admin-only. | Lets a strategy lead explore live during a competition without polluting the shared set of saved dashboards or needing admin rights; keeps the durable analytics surface under a single owner. Full dashboard behaviour remains Topic 10. |
| 2026-08-21 | 10 | **Topic 10 CLOSED.** Full high-analysis chart set incl. pie + stacked-area/bump/bullet-gauge/small-multiples (Q10.1); **Recharts** for standard charts with **image overlays & team×metric heatmap hand-built in SVG/Canvas**, ECharts rejected as overkill (Q10.6); dashboards **shared when saved, drafts session-private** (Q10.2); scope **per-event or per-season**, built-ins on the active/selected event; phone **top-8/bottom-8** for all-teams charts, **per-team match views to 14 matches** (Q10.5); **view-time metric selector on the shared X dimension**, **expand-to-stack capped at 4** (Q10.9/Q10.10); next-year missing-field dashboards **read-only** (re-map → §24, Q10.3); **operational stats made configurable** via the same builder over app-metadata sources, not a static page (Q10.9-ops). Export (Q10.4), drill-down (Q10.7), scouted-vs-official (Q10.8, TBA-gated) → §24. | Dataset is tiny (~40 teams × ~14 matches), so ECharts' big-data engine is pure weight for a mostly-offline PWA; the only genuinely custom visuals (field/cycle overlays, heatmap-table) aren't native to either library, so Recharts + hand-built overlays gives the highest design ceiling at the lowest cost. Sharing only *saved* dashboards keeps one clean public set while leads still explore freely in private drafts. Top/bottom-N is the honest way to keep a 40-team chart readable on a phone without hiding the extremes that actually matter for picking. Making operational stats configurable (not a fixed page) reuses the whole builder and lets the team invent coverage/throughput views without a code change. |
| 2026-08-20 | 3 / 10 | **Cycle-path field type added** (amends closed Topic 3 catalogue): scouter taps an **ordered, low-fidelity list of points per cycle** (capped ≤ ~6), a list of cycles per entry, alliance-normalized like the position picker, rendered as arrowed polylines over the game image. Also confirmed **metrics are type-agnostic** — aggregations operate on any field type including **time/durations** (Timer, Event-log cycle times), offering the operations valid for each type. | Cycle routes are a core FRC strategy signal, but a precise trajectory would bloat the offline payload the team carries by QR/runner (§7); a handful of points per cycle sketches the route while staying a few KB. Stating type-agnostic metrics explicitly closes an ambiguity before Topic 10's builder is designed, so time-based metrics (cycle times) are first-class rather than a later retrofit. |
| 2026-08-21 | 11 / 10 / 4 | **Topic 11 CLOSED.** Search/browse = **dedicated pages, no global omnibox**. Canonical **basic rank = status-aware average points/match** (played matches only; no-show/disabled never count as 0) — used wherever a generic rank is needed. Five pages specified (§11.2): **team search** (season-wide, small rank badge + top-3 medals only for active-event teams, a guarded **session-only** event-switch to a team's other events that is **disabled offline** — augments the §4.1 active-context rule); **entry preview** (one entry rendered by phase, with its scouted points); **entry search** (active competition only, both match+super with a kind filter, by team/number/match/scouter, showing points); **ranking page** (admin-built metrics table, one per season no versioning; column-sort + **weighted-composite mode** — min-max 0–1 per metric, `1−norm` for `lower_is_better`, auto-normalised weights, per-team contribution breakdown, **missing metric = 0.5**, reliability a weightable column, **admin-saved presets that seed Topic 12**, offline-changeable-not-savable); **compare** (2 teams = head-to-head "final score", 3–6 = radar+table); **match preview** (six **user-entered** teams by alliance, predicted score = sum of the three teams' status-aware averages, plus reliability flags & top strengths). Q11.1 (composite ranking) = yes; **Q11.2** (notes full-text search) & **Q11.4** (TBA team-page info) → §24; **Q11.3** (multi-season history) dropped. | Dedicated pages beat one clever omnibox for a small team that thinks in "find a team / find a form". One canonical status-aware rank keeps every screen consistent and honest (a dead robot's zeros never poison an average). Weighting via simple 0–1 normalisation with a lower-is-better inversion is math a student can verify, and saving presets is exactly the pick-list seed Topic 12 needs, so the two topics compose instead of duplicating. Disabling event-switching offline respects the active-competition-only cache (§7) — the alternative silently shows an empty page. Manual team entry on match preview ships the feature now without waiting on the deferred schedule import. |
| 2026-08-21 | 13 / 10 | **Topic 13 CLOSED.** Data-quality scope kept deliberately thin for v1: **entry validation blocks only on values outside a field's declared `expected_range`** — no cross-field rules, no outlier blocking (Q13.4); **outlier/distribution flagging and the coverage matrix → §24**, the matrix gated on TBA schedule import (Q13.1); **no redundant-scouting feature** — duplicate/divergent entries ride the existing §7.3 review-conflicts path (keep last-write-wins, preserve only genuine divergence) (Q13.2); **no scouter reliability score** (Q13.3); **no dedicated bulk-fix tools** — reassign = edit the entry's team, merge = resolve a review-conflict (Q13.5); **no full per-entry edit history** (resolves the dangling Q5.5 note). Operational **meta-metric catalogue finalized** (§10.2): entries per user/match/event/total, conflicting-entry count (= review-conflicts queue), super-scouting coverage; schedule-relative coverage + sync/outbox/form-structure metrics dropped or TBA-gated. Added an **all-dashboard value-shading rule** (red→green per column, driven by `direction`; 5 domain cases incl. ordinal enums by builder order and fixed 0–100 % for rates) and a **fixed-header scrolling data-table** component (§10.1/§10.2). | Detection is worth building, but every heavy integrity feature (coverage matrix, matches-vs-scheduled, official cross-check) needs a master schedule the app won't have until TBA import lands, so v1 ships only what works schedule-free. Blocking solely on the field's own declared range is the one validation that can't produce false rejections of a weird-but-real match, and it costs nothing because `expected_range` already exists. Reusing §7.3 for conflicts and normal edits for reassignment avoids a parallel admin toolset no student would maintain. The reliability score was declined for team morale. Value-shading reuses the existing `direction` metadata (no schema change) so tables and heatmaps are legible at a glance without per-chart configuration; its edge cases (grey no-data excluded from the domain, flat mid-color when min==max, and a colorblind-safe lightness ramp with the number always shown) were pinned now so honesty and accessibility are built in, not retrofitted onto every chart. |
| 2026-08-18 | 6 | **Topic 6 CLOSED.** v1 = **manual match + team selection** (schedule-driven, **station-based** assignments → §24, gated on TBA). Form = **collapsible phase sections** (reopenable). **Sticky top match timer**: phases + countdown durations are part of the form definition; manual "Start match"; **display-only** (never gates fields, opens phases, or auto-submits). Mandatory top-level **`robot_status`** (played / no-show / disabled / broke-down-at-T); no-show & disabled hide scoring fields (no zeros). Works **portrait + landscape** on phones and tablets/iPads. All **arena-comfort** features (large targets, high-contrast/outdoor mode, large text, haptics, screen-wake-lock, thumb reach, counters). **Practice/training mode** (never stored/synced). **Undo** on counters / event-log taps / position-picker points / multi-select / timer. **Explicit submit** with confirmation summary. **Never-lose-data** local drafts. | This screen is where ~95% of usage and all data quality live, so every choice favours a fast, forgiving thumb-driven flow in a loud arena. Reopenable phases beat one-way paging because fixing a mis-tap mid-match is common. The timer is guidance, not control — hooking it to field state would fight reality (no FMS integration) and risk locking a scouter out of data entry. **`robot_status` is the headline correctness decision:** a dead/no-show robot must never record zeros (it destroys the team's average), but a robot that played then broke down did underperform for real — so those two cases diverge, and a status-aware reliability metric (Topic 9) surfaces availability without corrupting performance. |

| 2026-09-03 | 16 / 19 | **`IMPLEMENTATION-PLAN.md` written, and the `frontend-design` skill given a standing override (§16.3).** Build chats invoke Anthropic's `frontend-design` skill on UI tasks for **craft** — spacing rhythm, hierarchy, density, state design, focus and touch affordance, polish — but **never for identity**: palette (§16.2), typefaces (Q16.7) and the per-surface references (§16.3) are closed, components read CSS variables and never a hex, and **no decorative animation is permitted on the data-entry path**. Where the skill and §16 disagree, §16 wins and the build chat names the line that disagreed. | The skill exists to give a product a visual identity that could not be mistaken for anyone else's — a job this project finished at Q16.1/Q16.3 and does not want redone one task at a time. Its craft guidance is genuinely useful and the identity guidance is genuinely harmful here, so the override splits the two rather than refusing the skill outright. The animation rule is not taste: the primary surface is a phone held in one hand in a loud arena during 2:30 of match, where motion that carries no information is a distraction with a real cost. Recording it in the spec rather than only in a chat prompt is what stops it being lost the next time a build chat starts clean. |

---

## 22. Open questions index

Quick reference for what's still unanswered. Answered questions get struck through and moved into the relevant section as a confirmed requirement.

**Closed 2026-08-14:** Q1.4, Q3.1, Q3.2, Q3.9, Q7.4, Q15.1, Q15.2, Q15.4, Q15.8, Q16.2 → confirmed requirements. Q14.1 → §24 nice-to-have.
**Closed 2026-08-15:** Q1.1, Q1.2, Q1.3, Q1.5, Q1.6 → confirmed requirements (**topic 1 CLOSED**).
**Closed 2026-08-17:** Q2.1 – Q2.7 → confirmed requirements (**topic 2 CLOSED**); Q2.9 closed (own robot = regular robot); Q4.3 closed (flat events, no division hierarchy). Q2.8a–f closed (scoring model fully specified; topic 9 implements); Q4.1 closed (active context); Q17.3 closed (Supabase free tier). **Q3.3 – Q3.8 closed and Q3.10 → §24 (topic 3 CLOSED).**
**Closed 2026-08-18:** Q4.2 (no event types), Q4.4 (equal event weighting), Q4.5 (no external import / no `source` field) → confirmed requirements (**topic 4 CLOSED**). **Q5.1–Q5.8 → confirmed requirements (topic 5 CLOSED):** three global roles, form templates admin-only / entries open to all, admin-provisioned username+password, admin-only user CRUD + role changes, 5-min self-edit window (offline & online), ~30-day offline session, switch-scouter, no user audit log, **no DB RLS — authz in the use-case layer + UI**. **Q6.1–Q6.8 → confirmed requirements (topic 6 CLOSED):** manual match+team selection (assignments → §24), collapsible phases, sticky display-only match timer (phases on the form), mandatory `robot_status` + status-aware stats, portrait+landscape on phones/tablets, arena-comfort set, practice mode, undo, explicit submit, never-lose-data drafts.
**Closed 2026-09-01:** Q17.1, Q17.2, Q17.4–Q17.8 → confirmed requirements or §24 (**topic 17 CLOSED**); Q17.3's multi-season "export + prune" mitigation withdrawn. Q19.1–Q19.7 → confirmed requirements (**topic 19 CLOSED**): v1 = phases 0–2 due 2026-11-20, gated per phase, vertical slice first. Q18.1, Q18.3–Q18.11 → confirmed requirements or §24 (**topic 18 CLOSED**). Q16.1, Q16.3–Q16.12 → confirmed requirements or §24 (**topic 16 CLOSED**), and §16.2's proposals promoted. Q14.2–Q14.5 answered and recorded as the deferred design (**topic 14 CLOSED — deferred in full to §24**).
**Closed 2026-09-02:** Q20.5, Q20.6, Q20.7 and the raised Q20.16, Q20.17 → confirmed in §20.1/§20.3 (**topic 20 CLOSED — every topic is now closed**). Scope unchanged: setup only. Q20.1–Q20.4 and Q20.8–Q20.15 remain **parked** pending the separate decision to connect an LLM.
**Closed 2026-08-31:** Q12.1–Q12.3 (**topic 12 CLOSED**). Q15.3, Q15.5–Q15.7, Q15.9–Q15.14 → confirmed requirements (**topic 15 CLOSED**); Q18.2 closed (mini CI on `develop`). C1 resolved: generated per-form-version SQL views dropped from v1 → §24, amending the 2026-08-14 Option A decision.
**Closed 2026-08-21:** Q10.1–Q10.10 + Q10.9-ops → confirmed requirements (**topic 10 CLOSED**): full chart set (Recharts + hand-built image/heatmap overlays); dashboards shared when saved / drafts private; per-event or per-season scope, built-ins on active/selected event; phone top-8/bottom-8 for all-teams charts, per-team views to 14 matches; metric selector on shared X + expand-to-stack cap 4; configurable operational stats over app metadata. Export (Q10.4), drill-down (Q10.7), scouted-vs-official (Q10.8), next-year re-map wizard (Q10.3) → §24.

- ~~**Topic 1:** Q1.1 – Q1.6~~ ✓ **CLOSED** — all confirmed in §1.1.
- ~~**Topic 2:** Q2.1 – Q2.7~~ ✓ **CLOSED** — confirmed in §2. Own robot = regular robot (Q2.9 closed). Scoring model fully specified (Q2.8a–f closed); topic 9 implements.
- ~~**Topic 3:** Q3.1 – Q3.10~~ ✓ **CLOSED** — confirmed in §3.1. Q3.10 → §24 nice-to-have.
- ~~**Topic 4:** Q4.1 – Q4.5~~ ✓ **CLOSED** — confirmed in §4.1. Active context (Q4.1) + flat events (Q4.3) 2026-08-17; no event types (Q4.2), equal event weighting (Q4.4), no external import / no `source` field (Q4.5) 2026-08-18.
- ~~**Topic 5:** Q5.1 – Q5.8~~ ✓ **CLOSED 2026-08-18** — confirmed in §5.1–§5.2. Roles/auth/permissions settled; DB-level RLS dropped in favour of use-case-layer + UI enforcement. (Q20.6 resolved 2026-09-02: **no fourth role** — a `service` *caller kind* outside the user model instead.)
- ~~**Topic 6:** Q6.1 – Q6.8~~ ✓ **CLOSED 2026-08-18** — confirmed in §6.2. Manual match+team selection (assignments → §24); collapsible phases; sticky display-only match timer (phases on the form); mandatory `robot_status` with status-aware stats (Topic 9); portrait+landscape on phones/tablets; full arena-comfort set; practice mode; undo; explicit submit; never-lose-data drafts.
- ~~**Topic 7:** Q7.1 – Q7.7~~ ✓ **CLOSED 2026-08-19** — confirmed in §7.1/§7.3. QR fallback in v1 (animated+compressed, Q7.1); connectivity outside arena, runner-carried tablet (Q7.2); scouting entries + admin-only pick list editable offline (Q7.3); offline stats (Q7.4, 2026-08-14); last-write-wins live via base-version check, only genuine divergence → lead/admin review (Q7.5); device-to-device local-network sync → §24 (Q7.6); full active competition cached (few MB, no photos, x,y only) for offline stats, main stats page view-only offline, lead-code wipe (Q7.7). Durability rule: never prune before cloud ack.
- ~~**Topic 8:** Q8.1 – Q8.4~~ ✓ **CLOSED 2026-08-19** — no realtime push in v1; a **45-second auto-refresh** + refresh triggers cover cross-device propagation (Q8.1). Supabase Realtime, live match-in-progress view (Q8.2), presence (Q8.3) and notifications (Q8.4) → §24 nice-to-have. Optimistic local UI and the online/syncing/offline indicator kept as core (§8.1).
- ~~**Topic 9:** Q9.1 – Q9.8~~ ✓ **CLOSED 2026-08-20** — Layer-1 metric engine (menu builder, multi-field sums, per-page limit); match-subset filters, no recency weighting; SD displayed not ranked; reliability first-class in ranking; min sample = 1; one canonical entry per (team, match) per §7.3; no cross-event normalisation. Layer-2 official-result stats → §24. Team stat page + admin-saved general stat pages (leads draft-only, §5.2); full-season slope view over an admin-orderable event `sort_order` (§4.1). Confirmed in §9.1/§9.2.
- ~~**Topic 10:** Q10.1 – Q10.10~~ ✓ **CLOSED 2026-08-21** — confirmed in §10.1/§10.2. Full high-analysis chart set (Recharts + hand-built image/heatmap overlays); dashboards shared when saved, drafts private; scope per-event or per-season, built-ins on active/selected event; phone top-8/bottom-8 for all-teams charts, per-team views to 14 matches; view-time metric selector on shared X, expand-to-stack capped at 4; **operational stats configurable via the same builder over app metadata**. Deferred to §24: export (Q10.4), drill-down (Q10.7), scouted-vs-official (Q10.8, gated on TBA), next-year field re-map wizard (Q10.3).
- ~~**Topic 11:** Q11.1 – Q11.4~~ ✓ **CLOSED 2026-08-21** — confirmed in §11.2. Dedicated search pages (no global omnibox); canonical **basic rank = status-aware avg points/match**. Five pages specified: team search (season-wide, event-only rank badges + top-3 medals, offline-disabled event switch to a team's other events), entry preview, entry search (active comp, both kinds, by team/number/match/scouter, shows points), ranking page (admin-built table + weighted-composite mode with 0–1 normalisation, `1−norm` for lower-is-better, 0.5 for missing, saved presets seeding Topic 12, reliability as a weightable column), compare (2 = head-to-head, 3–6 = radar+table), match preview (6 user-entered teams, summed-average prediction). Q11.1 composite ranking = yes; Q11.2 notes search + Q11.4 TBA team info → §24; Q11.3 multi-season history dropped.
- ~~**Topic 12:** Q12.1 – Q12.3~~ ✓ **CLOSED 2026-08-31** — confirmed in §12.2–§12.4. **In scope, moved to phase 2** (Q12.1); alliance results **entered manually**, synced now-or-next-sync (Q12.2); **admin edits, everyone else views**, the one exception being a **lead adding a do-not-pick entry with a required reason** (Q12.3). Two ordered pick lists (first/second) seeded from a §11.2 weight preset, automatic round switch, do-not-pick **blocks** an add but only **flags** a team already on a list, one-tap removal, **8 alliances × captain/pick1/pick2 + backup** with **declined** markers, derived cross-off, and a list-level version guarding reorders. Printing stays deferred (Q10.4 → §24; Q16.4 closed 2026-09-01 — printing out of scope).
- ~~**Topic 13:** Q13.1 – Q13.5~~ ✓ **CLOSED 2026-08-21** — confirmed in §13.2. Entry validation = **hard block only on out-of-`expected_range` values** (Q13.4); outlier flagging + coverage matrix → §24 (matrix gated on TBA, Q13.1); **no redundant-scouting feature** (conflicts via §7.3 review, keep last, Q13.2); **no scouter reliability score** (Q13.3); **no dedicated bulk-fix tools** (reassign = edit team, merge = resolve conflict, Q13.5); **no full per-entry edit history**. Operational meta-metric catalogue finalized in §10.2; all-dashboard **value-shading (red→green)** color rule added to §10.2.
- ~~**Topic 14:** Q14.1 – Q14.5~~ ✓ **CLOSED 2026-09-01 — deferred in full to §24.** No external data source in v1. Q14.2–Q14.5 answered and kept as the recorded design in §14.2: key obtained at build time (server-side only, covered by the Q18.5 transfer checklist); results imported as well as the schedule; manual sync + throttled auto-sync when online; re-imported schedules reconcile-and-flag, surrogates marked, diff-to-confirm.
- ~~**Topic 15:** Q15.1 – Q15.14~~ ✓ **CLOSED 2026-08-31** — confirmed in §15.1–§15.2. All traffic through the server API (Q15.1) and the transport-agnostic use-case layer (Q15.8) 2026-08-14; React + Vite PWA (Q15.2) and TypeScript everywhere (Q15.4) 2026-08-14. **Hono, no tRPC** (Q15.3); generated DB types + shared Zod (Q15.5); **no Supabase Storage — the season game image is a static client asset, DB stores only its path** (Q15.6), which also solves offline availability (Q15.12) and carries an immutability rule and a fail-loud rule; full dev environment (Q15.7); MCP as a route in `apps/server`, built in phase 5 only (Q15.9); **generated SQL views dropped → §24** (Q15.10, amends §3.1); cold-start-only PWA updates (Q15.11); two Vercel projects with header bearer-token auth (Q15.13); pnpm/Turborepo, Node 22, Node runtime, browser-safe `packages/shared` (Q15.14).
- ~~**Topic 16:** Q16.1 – Q16.12~~ ✓ **CLOSED 2026-09-01** — confirmed in §16.1–§16.2. Device roles (phone = competition job, computer = everything incl. the builders, **builders ≥ 1024 px**, alliance selection & conflict review any width, gating ≠ permission); **ROBACTIVE #2096 / `#FFEA07`** as an accent on a neutral dark UI; Tailwind + shadcn/ui, dark default, tokenised colour; **two themes** (dark + outdoor high-contrast, ordinary light → §24); Inter + Noto Sans Hebrew self-hosted (Q16.7); 48 px targets + WCAG AA (Q16.10); PWA identity, trefoil-only icons (Q16.9); 2-decimal metrics, `DD/MM/YYYY`, 24-hour, device-local (Q16.8); one six-variant empty/error component (Q16.11); one destructive-action pattern (Q16.12); printing out of scope, paper backup form → §24 (Q16.4). Q16.5 resolved by Q6.7; Q16.6 superseded by Q15.6. **Q16.3** closed too: a per-surface reference table (§16.3) on a Linear/Vercel baseline — layout and behaviour only, never palette.
- ~~**Topic 17:** Q17.1 – Q17.8~~ ✓ **CLOSED 2026-09-01** — confirmed in §17.1–§17.3. Targets confirmed (+ championship-division scale row; sync latency restated to match topic 8); **two-tier testing** — four unit suites plus a client→server→dev-DB **smoke suite** (Q17.5); **no in-app export or restore in v1 → §24**, replaced by a manual `supabase db dump` (Q17.2); **full name is the only personal datum** (Q17.4); **admin cascading delete of a season/competition** specified, with the active context undeletable and `parent-deleted` sync rejection; **no auto-pruning**; one-day offline window (Q17.6); active competition only, in full, offline (Q17.7); device floor Android Chrome ~2 yr / iOS Safari 16+ (Q17.8). Q17.3 closed 2026-08-17 (Supabase free tier), amended here.
- ~~**Topic 18:** Q18.1 – Q18.11~~ ✓ **CLOSED 2026-09-01** — confirmed in §18.1–§18.2. Mini CI on `develop` (Q18.2, 2026-08-31); preview and local always on the dev Supabase project (Q18.8); migrations auto to dev, manual to production (Q18.7); two per-app `.env.example` files with **no Supabase credentials in the client**; twice-weekly `/health` keep-alive on dev and production against the free-tier pause (Q18.9); `docs/ops/RUNBOOK.md` (Q18.10); manually triggered dev seed script (Q18.11); accounts personal with a documented transfer path (Q18.5); no self-host fallback (Q18.4). Backups/export (Q18.6), custom domain (Q18.1) and monitoring (Q18.3) → §24.
- ~~**Topic 19:** Q19.1 – Q19.7~~ ✓ **CLOSED 2026-09-01** — confirmed in §19.1–§19.8. **v1 = phases 0–2, due 2026-11-20** (supersedes §1.1's 2026-10-01); phases 3–6 → post-v1 (§19.5); **position picker / event log / cycle path are v1** per Q3.3 and the coverage matrix leaves phase 2 (Q13.1); **no photo feature** — the season game map stays a committed static asset and §15's no-Storage decision stands; **vertical slice first** (Q19.4); **a gate per phase**, phase 1's being the ten-match airplane-mode test (Q19.5); **solo with Claude Code**, self-reviewed tasks (Q19.3); **Google Sheets fallback, no import back** (Q19.6); **plan covers phases 0–1 in detail, phase 2 as headings** (Q19.7).
- ~~**Topic 20:** Q20.5 – Q20.7, Q20.16, Q20.17~~ ✓ **CLOSED 2026-09-02** — confirmed in §20.1/§20.3. Scope still **setup only**. **Scouter names kept** in query output, re-opened if an LLM is ever connected (Q20.5); **no fourth role — a read-only `service` caller kind** outside the user model (Q20.6); **an explicit `caller` argument on every use case**, authorization never reading transport state (Q20.16, §15.2); **propose-and-confirm** for any future write capability, charts and forms only, never pick lists or entries (Q20.7); **unsanitised free-text notes** recorded as a residual for the first LLM connection to face (Q20.17). **Q20.1–Q20.4 and Q20.8–Q20.15 stay parked** — they decide whether and when an LLM is connected, and none of them changes anything built in phase 1.

### Questions I'd like answered first, because they block the most work

1. ~~**Q3.1** — JSONB vs. real tables per form.~~ ✓ **CLOSED: Option A (JSONB).**
2. ~~**Q3.9** — Semantic field metadata as part of every field.~~ ✓ **CLOSED: yes; description/unit/phase/direction required.**
3. ~~**Q15.8** — The transport-agnostic use-case service layer.~~ ✓ **CLOSED: yes.**
4. ~~**Q7.4** — Must statistics work offline?~~ ✓ **CLOSED: yes — shared TS engine runs in the browser.**
5. ~~**Q16.2** — Hebrew/RTL support?~~ ✓ **CLOSED: English LTR chrome, Hebrew bidi-aware form content.**
6. ~~**Q1.4** — Single team or multi-team?~~ ✓ **CLOSED: single team.**
7. ~~**Q14.1** — External API import?~~ ✓ **CLOSED: wanted, deferred → §24 nice-to-have** (topic 14 fully closed 2026-09-01).

All seven top blockers are closed and **topics 1–20 are fully CLOSED** — every feature topic, the system architecture, the UI/UX design system, the deployment/operations model, the non-functional requirements, the delivery plan and the AI/MCP setup. **No live questions remain.** What is left in §20.4 is parked by design: it decides whether and when an LLM is connected, and nothing there changes anything phase 1 builds. The next work is **build-shaped**: write `SPEC-FINAL.md`, then `IMPLEMENTATION-PLAN.md` (phases 0–1 in full, phase 2 as headings, §19.8).

---

## 23. Change history

Every edit is logged here so changes can be audited without reprinting the document. See `COLLABORATION.md` section 6 for how to review diffs properly.

| Version | Date | Sections touched | Change |
|---|---|---|---|
| v0.36 | 2026-09-18 | 16.2, 21, 23 | **Dark `--border` raised to `#71717A` (zinc-500) and an anti-regression note added beneath the palette table**, here and in `SPEC-FINAL.md` §17.4, with the same change applied to `IMPLEMENTATION-PLAN.md` task 0.4 and `apps/client/src/styles/tokens.css`. Zinc-700 failed the 3:1 UI-boundary floor against all three dark surfaces; see §21. **Also: the production backup instruction corrected in three places** — `RUNBOOK.md`'s pre-event checklist and two `SETUP.md` checklists each said a bare `supabase db dump`, which writes the schema and none of the rows. All three now point at SETUP's two-file procedure (schema **and** `--data-only`). The two ops documents had been contradicting each other on the single most consequential command in the project. |
| v0.35 | 2026-09-03 | header, 16.3, 21, 23 | **`docs/plans/IMPLEMENTATION-PLAN.md` written — the last deliverable of the spec phase.** Phase 0 (17 tasks) and phase 1 (64 tasks) in full task detail — exact file paths, the code, the test written with it, the command, the expected output and the commit message — with phase 2 as headings only, per SPEC-FINAL §20.8. A **provisioning gate** sits between the scaffold tasks and everything needing a live Supabase or Vercel connection, listing what to create and tick off in `docs/ops/ENVIRONMENT.md`; no task contains a secret, a URL or a project ref. Verified by two subagent passes — fidelity against SPEC-FINAL, and cold executability of the plan alone — and revised against both; the plan's appendices P1 and P4 record 81 decisions taken during planning and verification, and P5 records what is still specified by contract rather than by printed code. **§16.3 gains a standing override for Anthropic's `frontend-design` skill** — craft yes, identity no — logged in §21. Header updated: the spec phase's remaining deliverable is now none. |
| v0.34 | 2026-09-02 | header, 2.1, 2.2, 2.3, 3.1, 9.2, 17.3, 21, 23 | **`docs/spec/SPEC-FINAL.md` v1.0 written** — the distilled, self-contained build input for `IMPLEMENTATION-PLAN.md`: confirmed v1 requirements only, restated in full, with rationale, rejected options, parked and nice-to-have items, the decision log, the change history and all `[RAISED BY ME]` framing stripped. 21 sections plus four appendices (A: the flat v1 exclusion list; B: the environment and secrets contract, including the GitHub Actions secrets CI needs; C: the authoritative use-case registry; D: 32 consolidation decisions). **New `docs/ops/ENVIRONMENT.md`** — the committed, editable provisioning worksheet behind Appendix B: every variable and secret with its source, its environment, an editable column for the **non-secret** values and a tick box per item, plus the accounts-to-provision table. It carries the standing rule that **no secret value is ever written into this repository, a commit message or a conversation** — a secret lives only in the dashboard that issues it and the dashboard that consumes it. Phase 0's two `.env.example` files are generated from it. Verified by two subagent passes — a fidelity/omission audit against this document and a cold buildability audit of SPEC-FINAL alone — and revised against both. **This document amended in six places where the consolidation supersedes a closed decision:** §2.1 (scoring model no longer "versioned on its own timeline"), §2.2 (super scouting fixed at one record per team per event), §2.3 Q2.8a (per-phase scoring withdrawn — one score per field, two fields for a two-phase element), §3.1 (`show_on_team_card` withdrawn), §9.2 (metrics not versioned; one shared TypeScript metric engine on both sides, SQL only for the fixed skeleton), §17.3 (a `parent-deleted` record is hard-deleted on the client behind a notice naming what was discarded). Each amendment is marked in place; nothing was deleted. Header restated: SPEC-FINAL supersedes this document wherever the two differ on a v1 requirement, and this document remains the archive of *why*. |
| v0.33 | 2026-09-02 | header, 0.2, 0.3, 5.2, 5.3, 15.2, 17.3, 19.5, 20 (closed), 21, 22, 23, 24 | **Topic 20 CLOSED — the last open topic. Scope unchanged: setup only, no LLM connection.** New **"Closing decisions"** block in §20.1 closing five questions — the two live ones, the parked Q20.7 pulled forward, and two raised in this session: **scouter names kept in query output** with an explicit condition re-opening it if an LLM is ever connected (Q20.5, mirrored into §17.3); **no fourth role — a `service` caller kind** outside the user model, read-only by construction (Q20.6, *decided-by-Claude*; §5.3's dependency note resolved and §5.2 marked as governing users only); **an explicit `caller` first argument on every use case**, with the `Caller` union and the never-read-transport-state rule specified in §15.2 (Q20.16, **[RAISED BY ME]**); **unsanitised free-text notes** recorded as a residual with no v1 action (Q20.17, **[RAISED BY ME]**). **Q20.7 answered: propose-and-confirm** — the model never mutates directly, a proposed action is applied by a human tap, scoped to chart- and form-building only and never pick lists or entries; direct model writes now **out of scope permanently**. §20.3 relabelled from "Proposed decisions" to **recorded deferred design** with a not-v1 banner, its MCP-first ordering demoted to a recommendation; §20.4 restructured into closed + parked. §24's AI-panel row updated, and the header plus §19.5 corrected from **two** early AI prerequisites to **three** (the `caller` argument joins semantic field metadata and the use-case layer). Also fixed §0.3's stale pointer to "section 20" for the decision log (it is §21). |
| v0.32 | 2026-09-01 | 0, 0.2, 1.1, 19 (rewritten & closed), 21, 22, 23 | **Topic 19 CLOSED.** §19 rewritten into eight confirmed subsections: **§19.1 v1 = phases 0–2 due 2026-11-20** (supersedes §1.1's 2026-10-01 soft target, struck there); §19.2 the three phases; **§19.3 vertical-slice build order** — the §1.2 success criterion end to end before anything is generalised; **§19.4 a gate per phase**, phase 1's being ten practice matches entered in airplane mode by an untrained student; §19.5 post-v1, listing the decision that deferred each old phase-3–6 item; §19.6 how the build runs (solo + Claude Code, one task at a time, self-reviewed diffs, phase 1 gate by ~2026-10-20 and a written cut line at 2026-11-01); §19.7 Google Sheets fallback with **no import path back**; §19.8 `IMPLEMENTATION-PLAN.md` = phases 0–1 in full, phase 2 as headings. Two stale contradictions removed: the **position picker, event log and cycle path are v1 field types** (Q3.3) belonging to the phase 1 form builder, and **phase 2 loses the coverage/quality matrix** (Q13.1 → §24). **Confirmed no photo feature** — the season game map remains a committed static asset, §15's no-Storage decision untouched. |
| v0.31 | 2026-09-01 | 0, 0.2, 17 (rewritten & closed), 18.1, 18.3, 19.1, 21, 22, 23, 24 | **Topic 17 CLOSED.** §17 rewritten into confirmed targets (§17.1), a **testing strategy** (§17.2) and **privacy, deletion & retention** (§17.3). Sync-latency target restated to match topic 8's no-realtime decision; **championship-division scale row** added; **offline window one day**, **active competition only held offline**, **device floor Android Chrome ~2 yr / iOS Safari 16+**. **Testing = four unit suites + a smoke suite** over the real client→server→dev-Supabase path; §18.1's CI bullet extended to match. **No in-app export or restore in v1** — the Backup row now specifies a manual `supabase db dump`, "export" removed from §19.1 phase 2, and the §24 row rewritten to cover restore and drop its pre-competition gate. **Privacy: full name + username only.** **New: admin cascading delete** of a season/competition with type-to-confirm, the active context undeletable, form-version deletion still blocked per §16.1, and `parent-deleted` rejection for entries synced from a device that was offline. **Nothing is auto-pruned**; Q17.3's "export + prune" mitigation withdrawn. Phase 1 gains the delete feature and the smoke suite. |
| v0.30 | 2026-09-01 | 0, 0.2, 14 (rewritten & closed), 21, 22, 23, 24 | **Topic 14 CLOSED as deferred-in-full to §24** — v1 has no external data source. §14 rewritten with a closure banner, §14.1 kept as the *why*, and a new **§14.2 "recorded design for when it is built"**: server-side sync, own tables, a manual fallback that must stay first-class, key obtained at build time (server-side only, under the Q18.5 transfer checklist), **results imported as well as the schedule**, **manual sync + throttled auto-sync when online**, and **reconcile-and-flag on re-import** (entries stay bound to their `(team, match)`, changed/vanished matches flagged for review, surrogates marked, diff to confirm). Q14.2–Q14.5 closed; the §24 row expanded to point at §14.2. Status table, decision log and questions index updated. |
| v0.29 | 2026-09-01 | 16.3, 16.4, 21, 23 | Q16.3 reference table finalised: the context/landing page takes **Figma's card grid plus Notion's document calm**, and the three previously Claude-decided rows — **op.gg** (match preview), **Attio** (search & record detail) and the context page — are now **confirmed** rather than provisional. No other change. |
| v0.28 | 2026-09-01 | 0, 0.2, 16.3 (new), 16.4, 21, 22 | **Q16.3 closed — topic 16 fully CLOSED.** New **§16.3 "Visual reference & per-surface design rules"**: a Linear/Vercel system baseline plus a twelve-row table binding each major surface to a reference and the specific rule taken from it (Sofascore team page & compare; Tally/Typeform/FotMob entry; Fillout three-pane builder with phone preview; Grafana/Metabase/Tremor dashboards; shadcn+TanStack+league-table ranking; Todoist pick-list drag; Obsidian Sync status surface; and Claude-decided pending review: Figma card grid for the context page, op.gg mirrored match preview, Attio search/detail, Clerk admin). `mobbin.com` / `godly.website` / `ui.shadcn.com/blocks` recorded as standing build references. Old §16.3 closed-questions renumbered to §16.4. **References bind layout and behaviour only — never palette.** |
| v0.27 | 2026-09-01 | 0, 0.2, 12.2, 16 (rewritten & closed), 21, 22, 24 | **Topic 16 CLOSED** (Q16.3 left for last by choice). §16 rewritten: §16.1 confirmed requirements (language, **device roles**, brand, themes, typography, accessibility floor, PWA identity, formatting, states, destructive actions) and a new **§16.2 design-system detail** — breakpoint table, colour-token table for both themes, and the `docs/brand/` asset inventory. Answered Q16.1, Q16.4 and the raised Q16.7–Q16.12; Q16.5 resolved by Q6.7, Q16.6 superseded by Q15.6. **Builders are desktop-only (≥ 1024 px)**; alliance selection and conflict review stay usable at any width. **Brand: ROBACTIVE #2096, `#FFEA07` as an accent on a neutral dark palette** — not a black-and-yellow app — with brand assets generated into `docs/brand/` (logo, on-black lockup, trefoil mark, PWA icon set incl. maskable). **Printing out of scope**; blank paper backup form and an ordinary light theme added to §24. §12.2's Q16.4 note updated. |
| v0.26 | 2026-09-01 | 0, 0.2, 18 (closed), 19.1, 21, 22, 23, 24 | **Topic 18 CLOSED.** Answered Q18.1, Q18.3–Q18.5 and the raised Q18.6–Q18.11. **Environment matrix** added (§18.2): production / preview / local, with **preview and local always on the dev Supabase project**. **Migrations auto-apply to dev, manual to production.** **`.env.example` split into two per-app files**, and the **client is confirmed to hold no Supabase credentials** — only the server API base URL (corrects the pre-§15 wording in the old §18.2). **Twice-weekly `/health` keep-alive on both dev and production** against the free tier's ~7-day inactivity pause, plus a 48-hour pre-event check. **`docs/ops/RUNBOOK.md`** added as a phase-0 deliverable. **Manually triggered dev seed script.** **Accounts stay personal with a documented transfer checklist**; **no self-hosted/laptop fallback**. Off-platform **backups/export**, a **custom domain** and **error monitoring** → §24. §19.1 phase 0 extended with the runbook, health endpoint and seed script. |
| v0.25 | 2026-08-31 | 0, 0.2, 3.1, 3.2, 15 (closed), 18.1, 18.3, 19.1, 21, 22, 23, 24 | **Topic 15 CLOSED.** Answered Q15.3, Q15.5–Q15.7, Q15.9 and the raised Q15.10–Q15.14. **Hono, no tRPC** — the typed client comes from the use-case registry, which is also what MCP will map. **Generated Supabase DB types + shared Zod.** **No Supabase Storage or uploads in v1:** the season game image is a **static client asset** (`apps/client/public/seasons/<year>/`), the DB stores only its path, the service worker precaches it — which also closes offline availability (Q15.12); added the **immutable-once-entries-exist** rule and the **fail-loud on missing image** rule. **Full dev environment** (dev Supabase + dev Vercel + local). **MCP = a route in `apps/server`, built only in phase 5.** **PWA updates on cold start only, never auto-reload**, visible version string. **Two Vercel projects, bearer-token auth in a header, no cookies.** **pnpm + Turborepo, pinned pnpm, Node 22, Node runtime not Edge, `packages/shared` kept browser-safe.** **C1: generated per-form-version SQL views dropped from v1 → §24**, amending §3.1/§3.2 — flattening lives only in the shared TS engine. New confirmed requirements in §18.1: **`docs/ops/SETUP.md`**, a committed **`.env.example`** (what/where-from/which side/which environment), **mini CI on `develop`** with required metric-engine and sync-protocol tests, and the **`develop`/`main` branch model** (Q18.2 closed). Added **Phase 0 — Foundations** to §19.1. `COLLABORATION.md` updated to v1.3 for the branch model. |
| v0.24 | 2026-08-31 | 0, 0.2, 5.2, 7.3, 7.4, 8.2, 12 (rewritten & closed), 19.1, 21, 22, 23 | **Topic 12 CLOSED.** Answered Q12.1–Q12.3 and rewrote §12 into confirmed decisions (§12.2), a data model (§12.3), the three pages (§12.4) and closed questions (§12.5). In scope, **moved from phase 3 to phase 2**. **Admin-only editing, all other roles view**; a **lead may add a do-not-pick entry with a required reason** only. Two ordered pick lists (first/second) seeded from a §11.2 weight preset with automatic round switching. Do-not-pick **blocks** adding a listed team but only **flags** one already on a list; **one-tap removal** clears the flag. **Alliance bracket entered manually** — 8 × captain/pick1/pick2 + backup, **declined** markers — written locally and synced now-or-next-sync. **Cross-off derived** from the bracket; admin's device is the source of truth during selection (**resolves the §8.2 realtime dependency note**). **List-level `version`** guards whole-ordering reorders against §7.3's per-row last-write-wins. Printing stays deferred (Q10.4 → §24; Q16.4 open). Amended §5.2 (two new matrix rows), §7.3/§7.4 (offline-editable set now covers do-not-pick + bracket) and §19.1 (phases 2 and 3). |
| v0.1 | 2026-08-12 | all | Base document created from the initial requirements. 19 topics, ~100 questions. Added the fixed/flexible domain split (topic 2), venue-connectivity reality (topic 7.2), form versioning (topic 3.3), external API import (topic 14), pick list (topic 12) and data quality (topic 13) as items not in the original brief. |
| v0.2 | 2026-08-12 | 0.2, 3.2, 3.3, 3.4, 15.2, 15.3, 19.1, 22 | Added topic 20 (AI/LLM/MCP). Added semantic field metadata to 3.3 with Q3.9–Q3.10. Added transport-agnostic use-case layer to 15.2 with Q15.8–Q15.9. Noted that the MCP goal strengthens the JSONB recommendation in 3.2. Added phases 5–6. |
| v0.3 | 2026-08-12 | 0.2, 19.1, 20.1, 20.4, 21, 22 | **Scope decision:** AI/MCP is setup only — no LLM connection. Phases 5–6 marked deferred. Q20.1–Q20.4 and Q20.7–Q20.12 parked; Q20.5–Q20.6 remain live. First Decision Log entry added. |
| v0.4 | 2026-08-12 | 23 | Added this change history section. Companion file `COLLABORATION.md` created (process rules, answer shorthand, session templates, review workflow, build-phase rules). |
| v0.5 | 2026-08-12 | — | No spec changes. `COLLABORATION.md` v1.1 adds section 10 (working in Claude Code: surface choice, `CLAUDE.md`, `/clear` discipline, plan mode, review loop, permissions). `CLAUDE.md` created for the repo root. |
| v0.6 | 2026-08-14 | 0, 1.1, 3.1, 7.1, 8.1, 15.1, 16.1, 21, 22, 24 (new) | Closed the seven top blockers plus Q3.2/Q15.1/Q15.2/Q15.4: storage = Option A (JSONB); immutable versioning (label/range edits in place); semantic metadata required (desc/unit/phase/direction); offline stats yes; single-team; English LTR chrome + Hebrew bidi form content; all-traffic-through-server; TypeScript everywhere (React+Vite / Node+Hono / shared engine); runtime-generated form validation. Cross-device realtime and TBA/FRC import moved to new §24 nice-to-have. Decision Log rows added. `nice` shorthand added to `COLLABORATION.md` §3 and `CLAUDE.md`. |
| v0.7 | 2026-08-15 | 0.2, 1.3, 3.4, 7.4, 14.3, 15.3, 16.3, 19.1, 20.1, 21, 24 | **Consistency pass.** Struck through the already-answered questions still printed as open in their per-topic lists (Q1.4, Q3.1/Q3.2/Q3.9, Q7.4, Q14.1, Q15.1/Q15.2/Q15.4/Q15.8, Q16.2) with pointers to where each is confirmed. Set topics 1/3/7/8/15/16 to PARTIAL in the §0.2 status table. Moved the in-app AI panel (phase 6) to §24 nice-to-have; MCP server (phase 5) stays parked. Decision Log row added. |
| v0.8 | 2026-08-15 | 0, 0.2, 1.1, 1.2, 1.3, 2.3, 21 | **Topic 1 CLOSED.** Answered Q1.1/Q1.2/Q1.3/Q1.5/Q1.6; moved §1.2 success criterion + non-goals to confirmed. Added confirmed facts: team 2096, Israel district + Championship (divisions), ~11 peak users, prior-app pain points, mentor low-maintenance lifespan + handover-checklist deliverable, soft 2026-10-01 target. Flagged the 8-scouters-vs-6-stations coverage question on Q2.3. Status table topic 1 → CLOSED. Decision Log row added. |
| v0.9 | 2026-08-17 | 0.2, 1.1, 2.1, 2.2, 2.3, 3.3, 4.3, 21, 22 | **Topic 2 CLOSED.** Answered Q2.1–Q2.9. Event = name+year, Team = number+name. Scoring model confirmed as **points entered inline per field but stored in a separately-versioned model; entries hold raw data, score is derived; a scoring change is never a new form version** (Q2.8d closed; Q2.8a–c/e/f spun out to topics 3/9). Own robot is a **regular robot** — no separate log (Q2.9). Form kinds cut to match+super; scout all 6 robots incl. ours; no per-alliance data; official results reserved-nullable with a no-empty-box UI rule; practice/playoff excluded from metrics. Also closed **Q4.3** — championship divisions are regular flat events, no hierarchy (topic 4 → PARTIAL; §1.1 rationale amended). Added a forward-reference in §3.3. Decision Log + status table updated. |
| v0.10 | 2026-08-17 | 0.2, 4.1, 4.3, 16.1, 17.1, 17.2, 21, 22 | Added the **app-wide active context** — admin sets the default the app opens to; user overrides are session-only (not saved); only the default is cached offline; governs browsing + new-entry attribution; switcher on a dedicated page, not the header. Closed **Q4.1**, cross-noted in §16.1. Adopted the **Supabase free tier** as an explicit constraint — raw-only storage, simple DB actions, aggregate in the shared engine; closed **Q17.3** with pause/cap mitigations and a plain-Postgres fallback. Status table + Decision Log updated. |
| v0.11 | 2026-08-17 | 2.1, 2.2, 2.3, 3.3, 21, 22 | **Scoring model fully closed (Q2.8a–f).** Non-negative points defined per field per phase; success = points > 0; scouted score = sum of field points (match/alliance total = sum across robots); no alliance-level bonus points. Updated glossary + §2.2, struck the Q2.8 sub-questions, refreshed the §3.3 forward-reference; Decision Log row added. |
| v0.13 | 2026-08-18 | 0, 0.2, 4.1, 4.2, 21, 22, 23 | **Topic 4 CLOSED.** Answered Q4.2/Q4.4/Q4.5. No event types — every event is a regular flat event (`type` dropped). Events weighted **equally** across a season (no event-level recency). **No external import in v1** — no data-import path, no `source` field on entries. Events model trimmed to `events(id, season_id, name, code?, is_active)`: `code` nullable/unused (reserved for the deferred TBA import, §24); `start_date`/`end_date`/`location` removed. Aggregation scopes adopted. Folded §4.2 proposals into §4.1 confirmed; renumbered old §4.3 → §4.2. Status table + Decision Log + open-questions index updated. |
| v0.14 | 2026-08-18 | 0, 0.2, 5 (rewritten), 10.2, 10.3, 17.1, 21, 22 | **Topic 5 CLOSED.** Answered Q5.1–Q5.8. Three global roles (scouter/lead/admin), no viewer/mentor, not per-event; confirmed permission matrix (§5.2). Form templates admin-only, entries open to all (reaffirms Q3.1/Q3.7). Admin-provisioned username+password; admin-only user create/delete/promote-demote; deletion preserves authored content. Scouters self-edit own entries for 5 min from creation, then the row locks — same offline & online, ~30-day offline session (decided-by-Claude); switch-scouter + per-entry attribution; no user audit log. **Dropped DB-level RLS/per-row policies and the privileged-action audit-log target — authorization now lives in the server use-case layer + UI (§17.1 updated).** Lead-only ephemeral "draft statistics page" vs. admin-only saved dashboards. Decision Log (4 rows) + status table + open-questions index updated. Also recorded in Topic 10 the requested **static general statistics page** (operational/meta stats) alongside the dynamic robot dashboards, with candidate contents and new Q10.9. |
| v0.15 | 2026-08-18 | 0, 0.2, 6 (rewritten), 9.2, 21, 22, 24 | **Topic 6 CLOSED.** Answered Q6.1–Q6.8. v1 manual match+team selection; schedule-driven **station-based** assignments → §24 (gated on TBA). Collapsible, reopenable phase sections. **Sticky top match timer** whose phases + countdown durations live on the form definition; manual "Start match"; **display-only** (never gates fields/opens phases/auto-submits). Mandatory top-level **`robot_status`** (played / no-show / disabled / broke-down-at-T); no-show & disabled hide scoring fields (no zeros); **status-aware statistics** — performance metrics count played+broke-down, exclude no-show+disabled, plus a reliability/availability metric (added to §9.2). Portrait+landscape on phones & tablets/iPads. Full arena-comfort set (large targets, high-contrast/outdoor, large text, haptics, screen-wake-lock, thumb reach, counters). Practice/training mode (never stored/synced). Undo on counters/event-log/position-picker/multi-select/timer. Explicit submit with confirmation summary. Never-lose-data local drafts. Status table, Decision Log, open-questions index, §24 updated. |
| v0.17 | 2026-08-19 | 0, 0.2, 8 (rewritten), 15.2, 19.1, 21, 22, 24 | **Topic 8 CLOSED — realtime deferred.** Answered Q8.1–Q8.4. No realtime/live push in v1; cross-device changes propagate via refresh triggers **+ a 45-second background auto-refresh** while online (Q8.1). Supabase Realtime, live match-in-progress view (Q8.2), presence (Q8.3), notifications (Q8.4) → §24 nice-to-have (four rows). **Kept as core:** optimistic local UI and the online/syncing/offline connection indicator (local, tied to §7/§16 — not cross-device push). Removed "live views and presence" from §19.1 phase 3. **Also cleaned §15.2:** replaced the stale client↔Supabase "hybrid" proposal (which still recommended direct realtime subscriptions) with the confirmed **all-through-server** model (Q15.1), noting the realtime path is the deferred §24 item; optimistic UI retained. Status table, Decision Log, open-questions index, change history updated. |
| v0.16 | 2026-08-19 | 0, 0.2, 7.3, 7.4, 19.1, 21, 22, 24 | **Topic 7 CLOSED.** Answered Q7.1–Q7.3, Q7.5–Q7.7. Offline store scoped to the active competition only (+ cached users for offline login/switch). Editable offline: scouting entries + admin-only pick list. **Last-write-wins live via a base-version check; only genuine divergence goes to lead/admin "review conflicts" (superseded version preserved); the edit function is separate from sync** (Q7.5). **Durability rule: never prune a local record before its own cloud ack** (no action removes an unacked record). **QR fallback promoted to phase 1** as an animated + compressed, fountain-coded multi-frame batch scanned once per device-dump; additive & idempotent by UUID (sender keeps outbox). Workflow: central tablet gathers by QR → runner syncs outside every few games (Q7.1/Q7.2). **Full active competition cached on-device (a few MB, no photos in v1 — x,y only) so offline stats work; main stats page view-only offline, draft stats creatable offline; active-competition-only bound; lead-code local wipe** (Q7.7). Device-to-device local-network sync → §24 (Q7.6). Status table, Decision Log, open-questions index, §19.1 roadmap, §24 updated. |
| v0.12 | 2026-08-17 | 0.2, 1.1, 3.1, 3.3, 3.4, 4.1, 21, 22, 24 | **Topic 3 CLOSED.** Answered Q3.3–Q3.8; Q3.10 → §24. Field catalogue = all types except Photo (deferred); Timer editable-after-stop + nullable; Event log = timestamped taps; Field-position picker stores normalized 0–1 coords on the season game image with **per-field alliance normalization** (red raw / blue mirrored H/V/both, with preview). List-builder + live-preview UI (JSON behind advanced). **Main/active version + restorable snapshots; stats on the main version; missing-field metric → "cannot calculate this metric."** Form belongs to a **season** (several forms per season) — reconciled §1.1 and §4.1 wording from competition→form to season→form. Delete = **cascade behind a warning, admin-only.** Per-field `show_on_team_card`. **Removed the per-field offline flag — every field is scoutable offline.** Conditional logic kept; form-duplication dropped, JSON export/import kept. Status table + Decision Log updated; LLM metadata-suggestion added to §24. |
| v0.20 | 2026-08-21 | 0.2, 10 (closed), 21, 22, 23, 24 | **Topic 10 CLOSED.** Answered Q10.1–Q10.10 + the operational-stats question. Full chart set (Recharts + hand-built SVG/Canvas image & heatmap overlays); dashboards shared when saved / drafts private; per-event-or-season scope with built-ins on the active/selected event; phone top-8/bottom-8 for all-teams charts, per-team views to 14 matches; view-time metric selector on the shared X + expand-to-stack capped at 4; next-year missing-field dashboards read-only; **operational (meta) statistics made configurable via the same builder over app-metadata sources** (was a static page). Moved to §24: export (Q10.4), drill-down (Q10.7), scouted-vs-official (Q10.8, TBA-gated), next-year field re-map wizard (Q10.3). Status table, Decision Log, open-questions index, §24 updated. |
| v0.21 | 2026-08-21 | 0.2, 5.1, 5.3, 10.1, 10.2, 13 (closed), 21, 22, 23 | **Topic 13 CLOSED.** Answered Q13.1–Q13.5. Entry validation = **hard block only on out-of-`expected_range` values**; outlier flagging + coverage matrix → §24 (matrix TBA-gated); **no redundant-scouting feature** (conflicts via §7.3 review, keep last); **no scouter reliability score**; **no dedicated bulk-fix tools** (reassign = edit team, merge = resolve conflict); **no full per-entry edit history** (resolved the dangling Q5.5 cross-reference). Rewrote §13.2/§13.3 (proposed → confirmed + closed questions). In §10.2: **finalized the operational meta-metric catalogue** (entries per user/match/event/total, conflicting-entry count, super-scouting coverage; rest dropped or TBA-gated) and added the **all-dashboard value-shading rule** (red→green per column via `direction`; 5 domain cases; domain follows dashboard scope/filters) plus its **edge cases** — grey "—" for no-data (excluded from domain), flat mid-color when min==max, and colorblind safety via a monotonic lightness ramp + always showing the number. In §10.1: **data table** upgraded to a fixed-height scroll viewport with frozen header + sticky first column and value shading. Status table, Decision Log, open-questions index, summary line updated. |
| v0.23 | 2026-08-21 | 0.2, 10.2, 11 (closed), 21, 22, 23, 24 | **Topic 11 CLOSED.** Answered Q11.1–Q11.4. Rewrote §11.2/§11.3 into five specified pages (team search, entry preview, entry search, ranking, compare, match preview); dropped the global omnibox; defined the **canonical status-aware basic rank** and the **weighted-composite ranking** (0–1 normalise, `1−norm` for lower-is-better, 0.5 for missing, saved presets seeding Topic 12, reliability weightable); guarded **offline-disabled event switch** from team search (augments §4.1). Filled the §10.2 ranking/compare/match-preview built-in stubs with cross-refs to §11.2 and marked the coverage/quality built-in TBA-gated. Q11.2 (notes search) + Q11.4 (TBA team info) → §24; Q11.3 (multi-season history) dropped. Status table, Decision Log, open-questions index, summary line updated. |
| v0.22 | 2026-08-21 | 20.3, 20.4, 23 | Added a **usage/help agent** as a distinct, lighter third AI surface in §20.3 (documentation Q&A about operating the app; no MCP, no data access, no RAG — just an LLM connection + a maintained help.md; internet-only, build-season aid; ~1–2 days once an LLM connection exists). **Parked** with new questions Q20.13 (want it / priority vs. the data panel), Q20.14 (help-corpus ownership), Q20.15 (shared vs. separate cheaper model). No decision made — recorded like the parked MCP/AI items. |
| v0.19 | 2026-08-20 | 3.1, 10.2, 10.3, 21, 23 | **Dashboards working session (Topic 10 still OPEN).** Folded into §10.2: metric definitions are season-level/event-agnostic with **scope bound per-dashboard** (season-or-subset *or* one event, draft & saved alike); a **12-column responsive grid** with per-tile width span + drag reorder (two stat cards per row); a **view-time metric selector** + **expand-to-stack**; standard pages reframed as **built-in dashboards** plus a **General Dashboards hub** listing all season dashboards and prompting for input when opened without page context. Added **Cycle-path field type** to §3.1 (ordered low-fidelity points per cycle, ≤ ~6, alliance-normalized, arrowed-polyline overlay) and a matching **cycle-path overlay** chart type + explicit **type-agnostic metrics** note (incl. time/durations) in §10.2 — both settled (Decision Log row). Annotated Q10.2 as largely resolved; added Q10.9 (metric-family derivation) and Q10.10 (expand-stack cap). |
| v0.18 | 2026-08-20 | 0, 0.2, 4.1, 9 (rewritten), 21, 22, 24 | **Topic 9 CLOSED.** Answered Q9.1–Q9.8. Layer-1 engine = **menu builder, no formula language** (multi-field sums + per-page display limit); match-subset filters (last N / manual exclude), **no recency weighting**; **SD displayed, not ranked**; **reliability first-class in ranking** with per-team breakdown/no-show/disabled counts + availability rate surfaced in stats/ranking/pick-list; **no cross-event normalisation**; **min sample = 1**; **one canonical entry per (team, match)**, sync collisions per §7.3 (no duplicate averaging). **Layer-2 official-result stats → §24, gated on TBA** (Q9.3). Added **team stat page** + **admin-saved general stat-page builder** (leads draft-only, §5.2) and a **full-season slope view**. §4.1 amendment: new admin-orderable events **`sort_order`** (display order only, doesn't re-weight — Q4.4 intact) **[RAISED BY ME]**. Fixed stale "if Q7.4" conditional in §9.2. Status table, Decision Log, open-questions index, §24 updated. |

---

## 24. Nice-to-have (wanted, deferred)

Confirmed as **wanted but deliberately out of current scope** — revisit later. Distinct from *parked* (topic 20 — timing undecided pending a separate decision) and *skip* (out of scope permanently). Shorthand `Q_ nice` moves an item here.

| Item | Source | Note |
|---|---|---|
| **Blank paper backup form** — a printable, empty version of the live form definition, for when the tablets die at a venue | Q16.4, topic 16 | Wanted as insurance, not now. Printing is otherwise out of scope (Q16.4). Cheap once a form definition already renders; the data still has to be typed in afterwards, which is why it is a fallback and not a feature. |
| **Ordinary light theme** — a normal light mode distinct from the high-contrast outdoor theme | Q16.10, topic 16 | Wanted, not now. v1 ships **dark (default)** + **outdoor high-contrast**; because every colour is already a CSS token (§16.2), adding a third theme later is a token file, not a refactor. |
| **In-app export & restore / off-platform backup** — one file holding a season's raw entries, forms, versions and pick lists, downloadable by an admin, restorable, and copied automatically to storage outside Supabase | Q18.6 (topic 18) + **Q17.2 (topic 17)** | Wanted, not now — **including the restore side**. The free tier has no point-in-time recovery, so **a lost Supabase project is a lost season**. The v1 substitute is manual and costs no code: the maintainer runs **`supabase db dump`** before every event and at the end of every season and keeps the file off-platform (§17.1, `SETUP.md` + `RUNBOOK.md`) — this is what now satisfies `COLLABORATION.md` §8 rule 7, and it replaces the earlier "must exist before the first real competition" gate. Cheapest version when built: one `exportSeason` use case serving both a manual download and a scheduled job; it also turns §17.3's "dump before you delete" warning into an offer to export first, and unlocks routine pruning of old seasons. *(confirmed 2026-09-01; restated on topic 17 close, same day.)* |
| **Custom domain** — a short, memorable URL instead of `*.vercel.app` | Q18.1, topic 18 | Wanted, not now (~$10/yr). Mitigated because the app installs to the phone's home screen as a PWA, so the URL is typed once rather than daily. |
| **Error and usage monitoring** — Sentry or Vercel analytics on both apps | Q18.3, topic 18 | Wanted, not now. When built, no scouting payload content may be attached to an error report. Until then a failure at a competition is only visible if someone reports it. |
| **Generated per-form-version SQL views** — a flat, typed view per form version so analytics can be written as ordinary SQL | C1 / Q15.10, topics 3 & 15 | Wanted for ad-hoc querying, not now. Requires the server to run `CREATE VIEW` at form-publish time, which puts part of the schema outside the repo's migrations and duplicates the shared TS engine's flattening. Nothing in v1 reads them; ad-hoc SQL queries the JSONB directly. Revisit if hand-written analytics queries become a regular chore. |
| **External data import (TBA / FRC Events API)** — event, team, schedule and result import | Q14.1–Q14.5, **topic 14 (closed 2026-09-01, deferred in full)** | Wanted, not now — the highest-value item on this list. **The full design is recorded in §14.2** (server-side, results included, manual + throttled auto-sync, reconcile-and-flag on re-import). Deferring it also defers schedule-driven **scouter assignments** (Q6.1/Q6.2), **official-result validation** (topic 13), **Layer-2 statistics**, **scouted-vs-official comparison** (Q10.8) and **TBA team info** (Q11.4), which all depend on it. |
| **Layer-2 derived FRC statistics** — OPR, DPR, CCWM, win rate, avg ranking points, schedule strength, computed from official match scores | Q9.3, topic 9 | Wanted, not now. A cross-check on scouting data; depends on the TBA import above. v1 ships Layer-1 metrics (from scouting) only. |
| **Schedule-driven scouter assignments** — auto-fill "you are watching Red 2, team 1577" per match | Q6.1/Q6.2, topic 6 | Wanted, not now. When built it is **station-based** (fixed station → fixed alliance slot). Depends on the imported match schedule above. v1 uses manual match + team selection. |
| **Cross-device live updates (Supabase Realtime)** — another device's changes appearing without a refresh | Q15.1, Q8.1, topics 8 & 15 | Optimistic local UI, refresh-on-triggers, and a **45-second auto-refresh** ship now (§8.1); automatic cross-device push is deferred. Would reintroduce a direct client→Supabase subscription path (the rejected §15.2 hybrid); additive later, but note it partially reopens the all-through-server model. |
| **Live "match in progress" view** — the strategy lead watching the six scouters' entries fill in during a match | Q8.2, topic 8 | Wanted, not now. Requires connectivity usually absent inside a venue. |
| **Presence** — who is online, which scouters have/haven't submitted for the current match | Q8.3, topic 8 | Wanted, not now. Catches "station 4 hasn't submitted for 3 matches" during the event; depends on live connectivity. |
| **Notifications** — "next match in 4 min", "you have unsynced data", "conflict needs review" | Q8.4, topic 8 | Wanted, not now. In-app vs. push to be decided when built. |
| **Device-to-device local-network sync** — one device runs a tiny local server on a shared WiFi/hotspot (no internet, no cables) and others sync to it | Q7.6, topic 7 | Wanted, not now. Moves a whole event's data at once, faster than QR, but needs all devices on the same local network. v1 uses QR fallback + a runner carrying one tablet outside to sync. |
| **In-app AI insights panel** — server-side LLM orchestration, in-app chat/insights UI, cached briefings, notes summarisation, NL-to-chart | Topic 20 (approach B), phase 6 | Wanted, not now. Requires internet so unavailable at most of a competition; generated insights would be cached for offline reading. The setup-only prerequisites (semantic field metadata §3, use-case layer §15, the `caller` argument §15.2) stay in phase 1. **MCP server (phase 5) is *not* here — it stays parked in topic 20.** When built, it is **read-only via the `service` caller kind**, and any write capability is **propose-and-confirm on charts and forms only** (Q20.7, §20.3). |
| **LLM-suggested field metadata** — paste the game manual's scoring section, get proposed fields with descriptions/units/ranges/directions to edit | Q3.10, topic 3 | Wanted, not now. Turns building a new season's form from an evening into minutes; cheapest payoff of the AI work. Depends on the same LLM connection deferred in topic 20. |
| **Dashboard/chart export** — chart as PNG, table as CSV/Excel, dashboard as PDF | Q10.4, topic 10 | Wanted, not now. Printed pick lists and match previews are common in pits; v1 is screen-only. |
| **Chart drill-down / click-through** — click a bar → that team's page, click a line point → that match's raw entry | Q10.7, topic 10 | Wanted, not now. Turns charts into a navigation surface; v1 charts are read-only visuals. |
| **Scouted-vs-official comparison** — scouted contribution vs OPR and other official figures, to validate scouting quality | Q10.8, topic 10 | Wanted, not now. Depends on the TBA/FRC import and Layer-2 stats above. |
| **Next-year dashboard re-map wizard** — re-point a saved dashboard's fields onto a new season's form | Q10.3, topic 10 | Wanted, not now. v1 renders such dashboards read-only and flags missing fields; the guided re-map is the deferred convenience. |
| **Full-text notes search** — search free-text scouter comments ("who was mentioned as having a fast climb?") | Q11.2, topic 11 | Wanted, not now. Needs a Postgres text index and a decision on how it works offline. v1 entry search covers team/number/match/scouter. |
| **TBA public info on the team page** — awards, event history, robot photos, external links | Q11.4, topic 11 | Wanted, not now. Cheap once TBA import lands; gated on that import (§14 → §24). |
