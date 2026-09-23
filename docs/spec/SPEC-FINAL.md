# SPEC-FINAL — FRC Scouting Platform (ROBACTIVE #2096)

**Version:** 1.2 · **Date:** 2026-09-23 · **Derived from:** `frc-scouting-app-spec.md` v0.35 (topics 1–20 CLOSED)

*v1.1 amends §17.9 only, adding the standing override for the `frontend-design` skill — craft yes, identity no. No requirement changed; see the living spec's §21 for the rationale.*

*v1.2 amends §9.10 only: the unsynced count counts records, not queued operations, and the pending list on the sync page is specified and reachable from the indicator. See the living spec's §21.*

**What this document is.** The complete, self-contained build input for `IMPLEMENTATION-PLAN.md`. Every confirmed requirement, restated in full. Nothing here needs the living spec to be understood.

**What this document is not.** It carries no rationale, no rejected options, no parked or deferred items, no decision log and no change history. Those live in `frc-scouting-app-spec.md`, which remains the archive of *why*.

**Scope boundary.** Everything in this document is **v1 = phases 0–2, due 2026-11-20**. Appendix A lists what is deliberately excluded, so the plan never re-adds a deferred item.

---

## 1. Product definition

### 1.1 What it is

A scouting platform for **FRC team 2096 (ROBACTIVE)**, competing in the **FIRST Israel district** plus the **FIRST Championship**.

It is **year-agnostic**: the app never needs a code change to support a new game season. Everything game-specific is configuration created inside the app.

It is **offline-first**: at a competition venue, offline is the normal operating mode, not an edge case.

It is a **single-team install**. Multi-tenant / multi-organisation support is out of scope.

### 1.2 Primary success criterion

> During a competition, the team's scouters can each record their assigned robot per match on a phone with no internet, and within 60 seconds of regaining connectivity the strategy lead sees updated team rankings on a laptop.

If that works, the product works. Phase 1's build order is derived directly from it (§20.3).

### 1.3 Operating context

| Fact | Value |
|---|---|
| Peak concurrent users at an event | ~11 (8 scouters + 2 strategy leads + 1 admin) |
| Robots scouted per match | All 6, including team 2096's own |
| Maintainer | A team mentor, not a rotating student |
| Lifespan | Multiple seasons with minimal intervention |
| Connectivity at a venue | Effectively zero inside the arena; available outside it |

The system must favour boring, well-documented technology over clever solutions. A **maintenance/handover checklist is a v1 deliverable** (§19.5).

### 1.4 Non-goals

- Not a public or multi-tenant SaaS for other teams.
- No native iOS/Android app — a PWA installable to the home screen.
- No live-video or camera-based automatic scouting.
- No integration with FMS or field systems.
- No printable views (§17.9).
- No photo capture or file upload of any kind (§16.7).

---

## 2. Domain model & glossary

The world splits in two. The **fixed skeleton** is hard-coded and identical every season. The **flexible layer** is created inside the app and differs every year.

### 2.1 Fixed skeleton

| Entity | Meaning |
|---|---|
| **Season** | A year, e.g. 2026. Has one game, one game image, and one scoring model. |
| **Event** | A specific competition — district event, championship division, off-season or internal scrimmage. **Every event is a regular flat event**; there is no event type and no division hierarchy. Identified by name + season. |
| **Team** | An FRC team: **number + name only**. Global, spans seasons. Team 2096 in 2024 and 2026 is the same team. |
| **Event roster** | Which teams are competing at a given event. Managed by the admin (§6.4). |
| **Match** | A match at an event: type (practice / qualification / playoff), number, the three red teams, the three blue teams, and a reserved nullable official result. Only **qualification** matches feed metric aggregates. |
| **User** | A person who logs in and enters or reads data. |
| **Scouting entry** | One observation: one scouter, one team, one match (or one event, for super scouting), one form version → a payload of answers. |

### 2.2 Flexible layer

| Entity | Meaning |
|---|---|
| **Form** | The game-specific questionnaire. Belongs to a **season**, not an event. |
| **Form version** | A structural snapshot of a form's fields. |
| **Field** | One question: type, label, validation, section, semantic metadata, conditional visibility. |
| **Scoring model** | Maps each field's raw value to game points. One current model per season, not versioned. |
| **Metric** | A computed value derived from fields and the scoring model. Not versioned. |
| **Dashboard / chart** | A saved visualisation configuration referencing fields and metrics. |

### 2.3 Terminology used throughout

- **Form** = the template (definition). **Entry** = one submitted record. Users say "form" for both; this document does not.
- **Form kinds in v1: `match` and `super` only.** Pit, human and other kinds remain addable later through the `kind` column; they are not built.

| Form kind | One record per | Purpose |
|---|---|---|
| `match` | (team, match) | Quantitative performance in one match. |
| `super` | (team, event) | Driver skill, defence, penalties, breakdowns — the subjective read across the whole event. |

- **Scouting coverage:** all 6 robots per match, one match-scouter per robot. The ~2 scouters beyond the six do super scouting.
- **No per-alliance records.** Everything is attributed per robot.
- **Team 2096's own robot is scouted exactly like any other of the six.** There is no separate reliability, mechanism or notes log for it.

---

## 3. Data model

All tables live in the Supabase Postgres database. Migrations live in `packages/db` and are applied by the Supabase CLI (§19.4). **No Postgres Row-Level Security and no per-row policies** — authorization is enforced in the server use-case layer (§7.4).

Conventions:

- All primary keys are `uuid`, **generated on the client** for every entity that can be created offline, so an offline device never produces a colliding id.
- `created_at`, `updated_at` are `timestamptz not null default now()` on every table.
- Offline-syncable rows additionally carry `client_created_at`, `client_updated_at` (device clock) and `deleted_at` (soft delete).
- `version integer not null default 1` is the **server-assigned revision counter** on rows that participate in optimistic-concurrency sync (§9.5).

### 3.1 Season, event, team, match

```sql
app_settings (
  id                 boolean primary key default true check (id),   -- singleton row
  active_season_id   uuid references seasons(id) on delete set null,
  active_event_id    uuid references events(id)  on delete set null,
  updated_at
)

seasons (
  id                uuid primary key,
  year              integer not null unique,
  game_name         text not null,
  field_image_path  text not null,          -- e.g. 'seasons/2027/field.webp'; a path, never an image
  created_at, updated_at
)

events (
  id          uuid primary key,
  season_id   uuid not null references seasons(id) on delete cascade,
  name        text not null,
  code        text,                          -- nullable, unused in v1; reserved for a future import
  sort_order  integer not null,
  created_at, updated_at,
  unique (season_id, name)
)
create index on events (season_id, sort_order);

teams (
  id      uuid primary key,
  number  integer not null unique,
  name    text not null,
  created_at, updated_at
)

event_teams (
  id         uuid primary key,
  event_id   uuid not null references events(id) on delete cascade,
  team_id    uuid not null references teams(id)  on delete restrict,
  created_at, updated_at,
  deleted_at timestamptz
)
create unique index on event_teams (event_id, team_id) where deleted_at is null;
create index on event_teams (event_id, updated_at);
create index on event_teams (team_id);

matches (
  id          uuid primary key,
  event_id    uuid not null references events(id) on delete cascade,
  match_type  text not null check (match_type in ('practice','qualification','playoff')),
  number      integer not null,
  -- reserved official result, nullable, never populated in v1
  official_red_score, official_blue_score  integer,
  official_red_rp,    official_blue_rp     integer,
  official_winner     text check (official_winner in ('red','blue','tie')),
  created_at, updated_at,
  unique (event_id, match_type, number)
)
create index on matches (event_id, updated_at);

match_teams (
  id         uuid primary key,
  match_id   uuid not null references matches(id) on delete cascade,
  alliance   text not null check (alliance in ('red','blue')),
  station    integer not null check (station between 1 and 3),
  team_id    uuid not null references teams(id) on delete restrict,
  created_at, updated_at,
  unique (match_id, alliance, station)
)
create index on match_teams (team_id);
create index on match_teams (match_id);
```

Notes:

- **The active context is a singleton row**, not a flag on events. `app_settings` holds `active_season_id` and `active_event_id`; the event may be null while a brand-new season has no events yet, which is exactly the state §6.3 describes. There is exactly one row, enforced by the boolean primary key.
- `teams` is **global**; `event_teams` is the per-event roster, soft-deleted so a removal propagates through sync. Both are managed on the admin's management page (§6.4).
- **Match membership is normalized into `match_teams`**, one row per filled alliance slot. A match may exist with no `match_teams` rows at all and have them filled in as the schedule becomes known. This is what makes "which matches contain team X" — needed for the per-team-per-match series (§11.4) and the cross-event team history (§13.2) — a single indexed lookup.
- The official-result columns exist so no migration is needed if an import is ever built. **The UI must never render an empty score box** — official-result displays are hidden entirely while the columns are null.
- **Only `match_type = 'qualification'` rows feed metric aggregates.** Practice and playoff matches are stored, browsable and searchable, and are excluded from **every** aggregate. This is absolute and is not a user-adjustable filter (§11.2).

### 3.2 Users

```sql
users (
  id                   uuid primary key,
  username             text not null unique,       -- case-insensitive (citext or a lower() unique index)
  full_name            text not null,
  password_hash        text not null,              -- bcrypt, cost 10 (§7.5)
  role                 text not null check (role in ('scouter','lead','admin')),
  must_change_password boolean not null default false,
  disabled_at          timestamptz,
  created_at, updated_at
)
```

**Full name is the only personal datum stored.** No email address, no phone number, no date of birth, no photo. There is no user audit log.

**"Delete a user" means disable the account.** The confirmed rule is that only the admin removes a user, and removal preserves everything they created with authorship intact. Those two reconcile as a `disabled_at` timestamp: the `users` row is retained forever, `scouting_entries.scouter_id` stays valid, and a disabled user cannot authenticate, is hidden from the user list by default, and remains resolvable wherever a scouter's name is displayed.

`scouting_entries.scouter_id` uses `on delete restrict`. There is no code path that physically deletes a `users` row.

### 3.3 Forms

```sql
forms (
  id                 uuid primary key,
  season_id          uuid not null references seasons(id) on delete cascade,
  kind               text not null check (kind in ('match','super')),
  name               text not null,
  active_version_id  uuid references form_versions(id) on delete set null,
  timer_config       jsonb not null default '{"phases":[]}',   -- §8.4; edited in place
  created_at, updated_at,
  unique (season_id, kind)          -- one match form and one super form per season
)

form_versions (
  id            uuid primary key,
  form_id       uuid not null references forms(id) on delete cascade,
  version_no    integer not null,
  published_at  timestamptz,           -- null = draft
  is_locked     boolean not null default false,
  created_at, updated_at,
  unique (form_id, version_no)
)
create index on form_versions (form_id, updated_at);

form_fields (
  id                   uuid primary key,
  form_version_id      uuid not null references form_versions(id) on delete cascade,
  key                  text not null,              -- PERMANENT. Never changes, ever.
  label                text not null,              -- editable in place, no new version
  help_text            text,                       -- editable in place
  type                 text not null,              -- §5.2 catalogue
  section              text,
  display_order        integer not null,
  required             boolean not null default false,
  default_value        jsonb,
  config               jsonb not null default '{}',   -- type-specific, §5.3
  visibility_condition jsonb,                         -- {field_key, op, value} or null
  deprecated           boolean not null default false,
  -- semantic metadata, required on data fields only (§5.4)
  description          text,
  unit                 text check (unit in ('count','seconds','points','boolean','enum','text','coordinate')),
  phase                text check (phase in ('auto','teleop','endgame','post_match')),
  direction            text check (direction in ('higher_is_better','lower_is_better','neutral')),
  category             text,
  expected_range       jsonb,      -- {"min": n, "max": n} or null
  include_in_ai_context boolean,
  is_ordinal           boolean,    -- select types only; §5.3
  created_at, updated_at,
  unique (form_version_id, key)
)
create index on form_fields (form_version_id, updated_at);
```

**Constraints enforced in the use-case layer**, because they depend on the field's type:

- `type <> 'section'` → `description`, `unit`, `phase` and `direction` are all **required and non-empty**.
- `type = 'section'` → all seven semantic-metadata columns are null.
- `is_ordinal` is non-null only for `single_select` and `multi_select`.

**Form version lifecycle.** A version is created as a **draft** (`published_at is null`). The builder edits a draft freely. **Publishing** stamps `published_at` and, if it is the newest version, sets `forms.active_version_id` to it. A version becomes **locked** (`is_locked = true`) the moment the first entry is bound to it; a locked version's field *structure* can never change again — a structural edit forks a new draft version instead. `restoreFormVersion` points `forms.active_version_id` at an older published version without creating a new one. **A device may submit an entry against any published version it holds**, including a superseded one; the entry stays bound to that version forever.

### 3.4 Scoring model

**One current scoring model per season. It is not versioned.** A scoring change is an in-place edit that never creates a form version and never invalidates collected data, because entries store raw observations only and every score is derived at read time.

```sql
scoring_rules (
  id             uuid primary key,
  form_id        uuid not null references forms(id) on delete cascade,
  field_key      text not null,
  points         numeric not null default 0 check (points >= 0),
                                               -- boolean: points if true
                                               -- counter/number: points per unit
  option_points  jsonb,                        -- select types: {"option_value": points}
                                               -- every value must be >= 0 (use-case layer)
  created_at, updated_at,
  unique (form_id, field_key)
)
create index on scoring_rules (form_id, updated_at);
```

Keyed by `(form_id, field_key)`, not by form version, because field keys are permanent — editing a field carries its scoring with it across versions automatically.

### 3.5 Scouting entries

```sql
scouting_entries (
  id                 uuid primary key,          -- client-generated
  form_version_id    uuid not null references form_versions(id) on delete cascade,
  form_kind          text not null check (form_kind in ('match','super')),  -- denormalised for indexing
  event_id           uuid not null references events(id) on delete cascade,
  match_id           uuid references matches(id) on delete restrict,         -- null for super entries
  team_id            uuid not null references teams(id) on delete restrict,
  alliance           text check (alliance in ('red','blue')),                -- required on match entries
  scouter_id         uuid not null references users(id) on delete restrict,
  robot_status       text check (robot_status in ('played','no_show','disabled','broke_down')),
  breakdown_seconds  integer,                   -- only when robot_status = 'broke_down'
  data               jsonb not null default '{}',
  version            integer not null default 1,
  created_at, updated_at,
  client_created_at  timestamptz not null,
  client_updated_at  timestamptz not null,
  deleted_at         timestamptz
)

-- duplicate-detection index for the canonical-entry rule (§9.5, §11.6). Deliberately NOT unique.
create index on scouting_entries (event_id, form_kind, team_id, match_id) where deleted_at is null;
-- the delta-pull index (§9.3)
create index on scouting_entries (event_id, updated_at);
create index on scouting_entries (scouter_id);
create index on scouting_entries (match_id);
create index on scouting_entries (form_version_id);
```

Notes:

- `form_version_id` is **`on delete cascade`**, not restrict, because the season-level cascade of §3.9 must be able to run. The rule that a form version with entries cannot be deleted *on its own* is enforced in the use-case layer, not by the foreign key.
- `match_id` is **`on delete restrict`**: deleting a match that has entries is blocked (§3.9).
- There is **no GIN index on `data`**. Nothing in v1 queries the JSONB from SQL (§11.1), and the index would be pure write and storage cost against the free-tier budget.
- **There is no `conflict_state` column.** Whether an entry has an open conflict is derived from unresolved `sync_conflicts` rows, so an entry that is both a duplicate and divergent is represented correctly.

Constraints expressed in the use-case layer (not as check constraints, because they span form kinds):

- `form_kind = 'match'` → `match_id`, `alliance` and `robot_status` are all **required**.
- `form_kind = 'super'` → `match_id`, `alliance`, `robot_status` and `breakdown_seconds` are all **null**.
- `breakdown_seconds` is non-null **if and only if** `robot_status = 'broke_down'`.
- `robot_status in ('no_show','disabled')` → `data = '{}'`. No field values, no required-field validation, no range check (§8.2).

### 3.6 Conflicts

One table covers every conflict kind, for every synced entity — entries and pick-list orderings alike.

```sql
sync_conflicts (
  id                            uuid primary key,
  event_id                      uuid not null references events(id) on delete cascade,
  entity                        text not null check (entity in
                                  ('scouting_entry','pick_list','pick_list_entry',
                                   'do_not_pick','alliance_slot')),
  row_id                        uuid not null,        -- the live row that won
  kind                          text not null check (kind in ('divergence','duplicate')),
  -- divergence: the losing copy, preserved in full
  superseded_payload            jsonb,
  superseded_author_id          uuid references users(id),
  superseded_client_updated_at  timestamptz,
  base_version                  integer,
  -- duplicate: the other row for the same logical key
  duplicate_row_id              uuid,
  created_at, updated_at,
  resolved_at                   timestamptz,
  resolved_by                   uuid references users(id)
)
create index on sync_conflicts (event_id, updated_at);
create index on sync_conflicts (entity, row_id);
create index on sync_conflicts (event_id) where resolved_at is null;
```

`row_id` and `duplicate_row_id` are deliberately untyped references — the entity column says which table they point into. A pick-list ordering conflict therefore stores the whole superseded ordering in `superseded_payload`, which no entry-specific table could hold.

### 3.7 Metrics, dashboards, charts

```sql
metrics (
  id           uuid primary key,
  season_id    uuid not null references seasons(id) on delete cascade,
  source_kind  text not null check (source_kind in ('form','meta')),
  form_id      uuid references forms(id) on delete cascade,   -- required when source_kind='form',
                                                              -- null when source_kind='meta'
  name         text not null,
  description  text,
  definition   jsonb not null,        -- §11.2
  created_at, updated_at,
  unique (season_id, name)
)
create index on metrics (season_id, updated_at);

dashboards (
  id         uuid primary key,
  season_id  uuid not null references seasons(id) on delete cascade,
  kind       text not null check (kind in
               ('custom','team','ranking','compare','match_preview','operational')),
  name       text not null,
  scope      jsonb not null,          -- §12.1
  filters    jsonb not null default '{}',   -- global filters: {"match_types":[...], "team_ids":[...]}
  created_at, updated_at
)
-- exactly one of each built-in kind per season; 'custom' is unconstrained:
create unique index on dashboards (season_id, kind) where kind <> 'custom';
create index on dashboards (season_id, updated_at);

dashboard_charts (
  id            uuid primary key,
  dashboard_id  uuid not null references dashboards(id) on delete cascade,
  position      integer not null,
  span          integer not null check (span in (3,6,12)),
  config        jsonb not null,       -- §12.3
  created_at, updated_at
)
create index on dashboard_charts (dashboard_id, position);

weight_presets (
  id         uuid primary key,
  season_id  uuid not null references seasons(id) on delete cascade,
  name       text not null,
  weights    jsonb not null,          -- {"metric_id": weight, ...}
  created_at, updated_at,
  unique (season_id, name)
)
create index on weight_presets (season_id, updated_at);
```

Metrics are **not versioned**. Dashboards are edited in place. There is **one dashboard row per built-in kind per season** — team, ranking, compare, match preview and operational — each holding that built-in's chart set and, for ranking and compare, its metric columns. `kind = 'custom'` covers every admin-saved dashboard.

`metrics.source_kind` distinguishes a metric over **form fields** (`form`, with a `form_id`) from an **operational meta-metric** over app metadata (`meta`, with no form). Both are built with the same builder (§12.7).

### 3.8 Alliance selection

```sql
pick_lists (
  id                     uuid primary key,
  event_id               uuid not null references events(id) on delete cascade,
  kind                   text not null check (kind in ('first','second')),
  seeded_from_preset_id  uuid references weight_presets(id) on delete set null,
  seeded_from_weights    jsonb,        -- a snapshot, when seeded from live weights rather than a preset
  version                integer not null default 1,     -- the ordering guard (§14.7)
  created_at, updated_at, client_created_at, client_updated_at,
  unique (event_id, kind)
)
create index on pick_lists (event_id, updated_at);

pick_list_entries (
  id            uuid primary key,
  pick_list_id  uuid not null references pick_lists(id) on delete cascade,
  team_id       uuid not null references teams(id) on delete restrict,
  rank          integer not null,
  note          text,
  version       integer not null default 1,
  created_at, updated_at, client_created_at, client_updated_at,
  deleted_at    timestamptz
)
create unique index on pick_list_entries (pick_list_id, team_id) where deleted_at is null;
create index on pick_list_entries (pick_list_id, rank);
create index on pick_list_entries (pick_list_id, updated_at);

do_not_pick (
  id          uuid primary key,
  event_id    uuid not null references events(id) on delete cascade,
  team_id     uuid not null references teams(id) on delete restrict,
  reason      text not null check (length(btrim(reason)) > 0),
  created_by  uuid not null references users(id),
  version     integer not null default 1,
  created_at, updated_at, client_created_at, client_updated_at,
  deleted_at  timestamptz
)
create unique index on do_not_pick (event_id, team_id) where deleted_at is null;
create index on do_not_pick (event_id, updated_at);

alliances (
  id        uuid primary key,
  event_id  uuid not null references events(id) on delete cascade,
  number    integer not null check (number between 1 and 8),
  created_at, updated_at,
  unique (event_id, number)
)

alliance_slots (
  id           uuid primary key,
  alliance_id  uuid not null references alliances(id) on delete cascade,
  slot         text not null check (slot in ('captain','pick1','pick2','backup')),
  team_id      uuid references teams(id) on delete restrict,   -- null = the slot is empty
  version      integer not null default 1,
  created_at, updated_at, client_created_at, client_updated_at,
  unique (alliance_id, slot)
)
create index on alliance_slots (alliance_id);

alliance_declines (
  id           uuid primary key,
  alliance_id  uuid not null references alliances(id) on delete cascade,
  team_id      uuid not null references teams(id) on delete restrict,
  version      integer not null default 1,
  created_at, updated_at, client_created_at,
  deleted_at   timestamptz,
  unique (alliance_id, team_id)
)
create index on alliance_declines (alliance_id);
```

**Bracket initialisation.** The eight `alliances` rows and their **32 `alliance_slots` rows** (8 × captain / pick1 / pick2 / backup) are created **all at once, empty**, by `initialiseBracket` the first time the bracket page is opened for an event. **An empty slot is a row with `team_id is null`, never an absent row** — which is what makes §14.4's round detection a simple query. `alliance_slots` is therefore **never soft-deleted**: clearing a slot sets `team_id = null`.

**Cross-off state is derived from `alliance_slots`, never stored on a pick list.** A corrected bracket instantly corrects every list.

### 3.9 Deletion model

Two distinct mechanisms, and they do not overlap:

| Mechanism | Applies to | Behaviour |
|---|---|---|
| **Soft delete** (`deleted_at`) | `scouting_entries`, `pick_list_entries`, `do_not_pick`, `alliance_declines`, `event_teams` | The row stays. A tombstone propagates through sync so offline devices converge. Soft-deleted rows are **never purged in v1**. |
| **Hard cascade delete** | `seasons`, `events`, `forms` | Admin-only, irreversible, physically removes rows. Deleting a season deletes its events, their matches and entries, its forms, all their versions, its metrics, dashboards and presets. Deleting an event deletes its matches, entries, pick lists, do-not-pick rows and alliance bracket. Deleting a form deletes its versions, its fields, its scoring rules and every entry bound to it. |

Additional rules:

- **Deleting a whole form is an admin cascade** and takes its entries with it. **Deleting a single form version that has entries bound to it is blocked** with an explanation, and no confirmation text overrides it. Deleting the parent is a cascade, not an orphaning, which is why one is allowed and the other is not.
- **Deleting a match that has entries is blocked** (`scouting_entries.match_id` is `on delete restrict`). Correct the match number instead, or delete the entries first.
- **The active season and the active event cannot be deleted.** Switch the active context first.
- **Confirmation names the damage** — exact counts, and the admin types the object's name to proceed (§17.8).
- **Back up first.** The delete screen instructs the admin to run `supabase db dump` before proceeding (§18.6).

### 3.10 `updated_at` is load-bearing

The entire delta-pull protocol (§9.3) keys on `updated_at > watermark`. A Postgres `default now()` fires only on INSERT, so:

**Every table in §3 carries a `BEFORE UPDATE` trigger that sets `updated_at = now()`.** This is a single one-line `moddatetime`-style trigger function reused across all tables. It is explicitly permitted despite §18.2's "no heavy triggers" rule — it is a timestamp assignment, not logic, and without it a soft-delete tombstone or an in-place field-label edit would never reach an offline device.

**A soft delete is an UPDATE**, so it bumps `updated_at` and propagates as a tombstone like any other change.

---

## 4. Scoring model

### 4.1 Rules

A field's raw value maps to game points:

| Field type | Mapping |
|---|---|
| Toggle / boolean | `points` if true, 0 if false |
| Counter / Number | `points` × value |
| Single select | `option_points[selected]` |
| Multi select | Σ `option_points[each selected]` |
| Everything else — Rating, Timer, Event log, position picker, Cycle path, text, Computed, Section | **Not scored.** They hold no `scoring_rules` row. |

Fixed rules:

1. **Points are non-negative.** Penalties and fouls are recorded as data but never subtracted from a score.
2. **One score per field.** A field belongs to exactly one phase (its `phase` metadata). A game element that scores differently in auto and teleop is modelled as **two fields**, one per phase.
3. **A mission is successful when its points > 0.** There is no separate success predicate. This is the default condition of the `rate` aggregation (§11.2): a "climb success rate" metric over a scored field is `count(field points > 0) / count(entries)`, with no rule to configure.
4. **A robot's scouted score = the sum of its field points.** A match or alliance total = the sum across its robots.
5. **No alliance-level bonus or threshold points** (no ranking-point thresholds, no coopertition) in the scouted score.
6. **Scores are always derived, never stored.** Correcting the scoring model re-scores all history immediately.
7. **The scoring model is not versioned.** Editing it is an in-place edit and never creates a form version.

### 4.2 Where it is edited

Inline in the form builder. Selecting a field in the settings pane shows its point value(s) alongside its semantic metadata. Saving a scoring change writes to `scoring_rules` and does **not** touch `form_versions`.

Points are captured at field-creation time for the same reason as semantic metadata: nobody will go back and score 80 fields for a past season.

---

## 5. Form system

### 5.1 Versioning

- A form belongs to a **season**. A season may hold several forms (one `match`, one `super`). Every event in that season uses them.
- **A new form version is created only by a structural change**: adding a field, removing/deprecating a field, or changing a field's type.
- **These edits happen in place and create no version:** a field's `label`, its help text, its `min`/`max`/`step` range, its `expected_range`, its display order, its section, its semantic metadata, its scoring, and the form's `timer_config`. A range change applies to new entries only and never retroactively invalidates data already collected.
- **Field `key`s are permanent.** Labels change freely; keys never.
- Deleting a field marks it `deprecated` in the new version. Historical data is retained.
- A form has one **active version** (`forms.active_version_id`) plus restorable secondary version snapshots. Statistics always compute against the **active** version's field set.
- Entries collected under other versions still aggregate through shared field `key`s.
- **Offline form editing is not allowed.** Form changes require connectivity.
- **Form templates are admin-only.** Creating, importing, editing and deleting a form definition is admin-only; submitting entries against one is open to all roles.
- **Deleting a form is a cascade delete behind an explicit warning, admin-only.**
- **Export/import of a form definition as JSON** is supported. There is no "duplicate last year's form" feature.

### 5.2 Field type catalogue

All of the following ship in v1.

| Type | Behaviour |
|---|---|
| **Counter** | Wide − / value / + triplet. Big touch targets. Never a text input. The workhorse. |
| **Number** | Free numeric with min / max / step. |
| **Toggle** | Boolean. |
| **Single select** | Radio / segmented control. |
| **Multi select** | Checkboxes. |
| **Rating** | 1–5 stars or slider. |
| **Short text** | Free text. |
| **Long text** | Notes / comments. |
| **Timer** | Accumulating stopwatch. **Editable after stop** (to correct a late stop) and **nullable via an "unsure — no time" toggle** (submits no value rather than a wrong number). |
| **Event log** | Scouter-defined event buttons. Each tap is stored as `{type, t}` where `t` is seconds from match start (§5.5). Taps are deletable before submit. |
| **Field-position picker** | Tap the season game image; stores normalized `{x, y}` in 0–1. One point or a list per entry. Alliance-normalized (§5.6). |
| **Cycle path** | Tap an **ordered sequence of points** per cycle; an entry holds a **list of cycles**. **Low fidelity by design** — a configurable cap on points per cycle, defaulting to 6, keeps the payload light. It is a rough sketch, not a trajectory. Same alliance normalization (§5.6). |
| **Computed** | Read-only, derived from other fields by a small typed expression (§5.7). |
| **Section** | Layout only. Holds no data. |

There is **no Photo field** and no image, file or binary upload anywhere in the product.

### 5.3 Per-field configuration

Every field carries: `key`, `label`, help text, `type`, `required`, `default_value`, `display_order`, `section`, `visibility_condition`, and its type-specific `config`:

| Type | `config` keys |
|---|---|
| Number, Counter | `min`, `max`, `step` |
| Rating | `max` (default 5), `style` (`stars` \| `slider`) |
| Single / Multi select | `options: [{value, label}]`, `is_ordinal` |
| Timer | `allow_unsure` (always true in v1) |
| Event log | `event_types: [{value, label}]` |
| Field-position picker | `multi_point` (bool), `mirror_axis` ∈ `none` \| `horizontal` \| `vertical` \| `both` |
| Cycle path | `max_points_per_cycle` (default 6), `mirror_axis` |
| Computed | `expression` (§5.7), `result_type` ∈ `float` \| `string` |

**`is_ordinal`** applies to single and multi select. When true, the option list order **is the rank**, listed **worst → best**, and aggregations run on the rank index (so "average climb level" is a colorable, sortable number). The admin must order options worst → best at field creation; it cannot be inferred later. When false the select is nominal and only mode/distribution aggregations apply.

**There is no per-field offline flag.** Every field is scoutable offline.

### 5.4 Semantic metadata

Captured at field-creation time, in the builder's settings pane, while the field is being created. **It cannot be backfilled.**

Required on every **data** field (all types except `Section`):

| Attribute | Values | Purpose |
|---|---|---|
| `description` | free text | What the number actually means. |
| `unit` | `count` \| `seconds` \| `points` \| `boolean` \| `enum` \| `text` \| `coordinate` | Prevents nonsense comparisons; drives axis and table units. |
| `phase` | `auto` \| `teleop` \| `endgame` \| `post_match` | Groups the entry form into sections and scopes phase questions. |
| `direction` | `higher_is_better` \| `lower_is_better` \| `neutral` | Drives default sort and the value-shading scale (§12.6). |

Optional:

| Attribute | Purpose |
|---|---|
| `category` | e.g. scoring / defence / reliability / movement / driver skill. |
| `expected_range` | `{min, max}`. Drives the hard entry-time block (§15.1) and the shading domain (§12.6). |
| `include_in_ai_context` | Stored, unused in v1. |

Semantic metadata edits are in-place and create no form version.

### 5.5 Event log and derived cycle times

An Event-log field stores `{type, t}` taps where `t` is **seconds from match start**.

Match start is defined as:

- **Timed:** the moment the sticky match timer's **"Start match"** button was pressed. All `t` values are seconds from that press, and `t_end` = the **sum of the phase durations in `forms.timer_config`** (§8.4).
- **Un-timed:** the timer was never started. The **first tap in the field defines `t = 0`**, and all later taps are seconds from it. There is no `t_end`.

**Cycle derivation.** Cycles are derived **per event type**. For a given event type with taps at `t₁ < t₂ < … < tₙ`:

| Case | Cycles |
|---|---|
| **Timed** | `cycle₁ = t₁ − 0`, then `cycleₖ = tₖ − tₖ₋₁` for k > 1, and the **final open cycle closes automatically at match end**: `cycle_last = t_end − tₙ`. |
| **Un-timed** | `t₁ = 0` by definition, so there is **no first cycle from match start and no final open cycle**. The series is `cycleₖ = tₖ − tₖ₋₁` for k = 2…n — one fewer cycle than the timed case, and no zero-length artefact. |

Derived series available to the metric engine per event type: **cycle count**, **cycle durations** (a numeric series supporting avg / median / min / max / stddev), and **time to first cycle** (`t₁`, available only in the timed case).

### 5.6 Alliance normalization for spatial fields

Field-position picker and Cycle-path fields store normalized `{x, y}` in 0–1 against the **season game image**.

- The **red** alliance keeps raw coordinates.
- The **blue** alliance is mirrored on the field's configured `mirror_axis` (`horizontal`, `vertical`, `both`, or `none`), so both alliances map to a single canonical frame.
- The builder shows a **preview** of the mirroring so the admin can verify it against the image.
- This requires every match entry to know its alliance — which is why `alliance` is a required column on match entries (§3.5) and a required step in the entry flow (§8.2).

### 5.7 Computed fields

A Computed field is evaluated on the device as the scouter fills the form, and re-evaluated by the engine at read time. It is read-only in the UI.

**Expression form** — a small typed tree, not free text:

```ts
type Expr =
  | { kind: 'field';   key: string }
  | { kind: 'literal'; value: number | string }
  | { kind: 'op';      op: '+' | '-' | '*' | '/' | 'concat'; left: Expr; right: Expr }
```

Rules:

- `result_type` is either **`float`** (all numeric fields and numeric literals) or **`string`**.
- **Operands must be the same type.** Numeric operands are `+ - * /`; string operands are `concat` only. Mixing types is a builder-time validation error.
- **Division by zero yields `null`**, and a null operand propagates: any expression with a null operand evaluates to null.
- A Computed field may not reference another Computed field (no chaining in v1) and may not reference a field from another form.
- Computed fields are **not scored** — they carry no `scoring_rules` row.
- A Computed field's value is written into the entry's `data` payload at submit time, and recomputed by the engine whenever the entry is read, so an expression correction repairs history.

### 5.8 Conditional logic

Simple rules only: `show this field if <field_key> <op> <value>`, where `op ∈ { =, ≠, >, <, ≥, ≤ }`. One condition per field. Not a general expression language. A hidden field records no value.

### 5.9 Form builder UI

Desktop only, **≥ 1024 px** (§17.2). Three panes:

1. **Field palette** — the type catalogue, dragged onto the canvas.
2. **Canvas** — the ordered field list, drag-reorderable, grouped by section.
3. **Settings pane** — the selected field's configuration, semantic metadata and scoring, all in one place so metadata is filled *while* the field is created.

Plus:

- A **live preview** rendering the form at phone width. Predicting the phone is the builder's whole job.
- A **raw-JSON editor** behind an "advanced" toggle.
- **Export / import** of the form definition as JSON.

---

## 6. Seasons, events & active context

### 6.1 Organisation

Data is organised by season and event. Search and analysis work per event, per season (all its events), across multiple seasons, and over a custom set of events.

**Aggregation scopes available everywhere:** single event · whole season · multi-season / all-time · a custom set of events.

**Events are weighted equally when aggregating across a season.** There is no event-level recency weighting: a later event does not count more than an earlier one.

### 6.2 Event ordering

Each event carries an admin-orderable `sort_order` within its season. The default is creation order. All season-spanning stats and charts render competitions in this order, which is what makes the full-season slope view read left-to-right. **Reordering changes display order only; it never re-weights aggregates.**

### 6.3 Active context

The app has **one app-wide active context**: a season and an event, held in the `app_settings` singleton (§3.1).

- The **admin sets the default** — `active_event_id` and its season. **Season only** (`active_event_id is null`) while a brand-new season has no events yet.
- The app **always opens to it**.
- A user may switch the season/event they are working in, but the switch is **session-only and never persisted**. Reopening the app returns to the admin default.
- **Only the admin default is cached for offline use.** User overrides are never stored, on the server or on the device.
- The active context governs **both** what the user browses **and** which event new entries attach to.
- Because a wrong context silently misattributes data, the switcher lives on a **dedicated context/landing page the user deliberately opens** — never in the always-visible header or nav.
- **Any action that switches the active event is disabled offline.**

**How a session-only override is served.** The device caches only the admin-default competition, so an overridden event has no local raw entries to compute from. While an override is in effect the client therefore **asks the server for computed results** — the server runs the same shared engine (§11.1) over that event and returns finished metric output, which the client renders without caching. **No new entry may be created while an override is in effect**; entry creation is available only in the admin-default context. This is why the override is offline-disabled and why it is discarded on reload.

### 6.4 Admin management page

One admin page, desktop-only, manages **seasons, events, the event roster, and matches**:

- **Seasons** — create a season (`year`, `game_name`, and the `field_image_path` of the game image already committed to the repo, §16.7), edit those fields, set the active season, delete (hard cascade, §3.9). A season cannot be created without a game image path that resolves; the form validates that the asset exists.
- **Events** — create, rename, reorder (`sort_order`), set the active default, delete (hard cascade).
- **Teams** — create a team (number + name) in the global registry, edit its name, and add/remove teams from the **current event's roster** (`event_teams`). A team number is global and permanent; its name is editable.
- **Matches** — create matches for the event (type + number), and fill each match's six alliance slots from the event roster into `match_teams`. Slots may be left empty. Matches may be created in bulk by entering a count of qualification matches, then filling teams in as they become known.

There is no external import in v1: no import path, no `source` field on entries. Everything on this page is entered by hand.

**Match auto-creation is a system action, not an admin capability.** A scouter selecting a match number that does not yet exist causes the app to create the minimal `matches` row (event + type + number, no `match_teams`) as part of submitting the entry. It works **offline**, rides the outbox like any other create, and is available to every authenticated role. It is *not* the admin match-management capability of §7.2 — it cannot set teams, cannot edit and cannot delete. Without it, a scouter at a venue with an incomplete schedule could not record a match at all.

---

## 7. Users, roles, authentication & permissions

### 7.1 Roles

**Three global roles: `scouter`, `lead`, `admin`.** Roles are global, not per-event. There is no viewer or mentor role.

**All data is visible to every role** — statistics, dashboards, teams, forms and entries. Nothing is hidden from scouters to avoid bias.

### 7.2 Permission matrix

| Capability | Scouter | Lead | Admin |
|---|:---:|:---:|:---:|
| Log in; view all data (stats, dashboards, teams, forms, entries) | ✓ | ✓ | ✓ |
| Submit entries; edit **own** entries (≤ 5 min, then locked) | ✓ | ✓ | ✓ |
| Manage **all** entries (edit / fix / reassign / soft-delete others') | — | ✓ | ✓ |
| Resolve items in the conflict-review queue | — | ✓ | ✓ |
| Add a team to the **do-not-pick** list (reason required); may not edit or remove one | — | ✓ | ✓ |
| Create a **draft statistics page** (session-only, never saved, discarded on exit) | — | ✓ | ✓ |
| Create / edit / **save** statistics & dashboards (persistent) | — | — | ✓ |
| Create / upload / edit / delete **form templates** | — | — | ✓ |
| Manage events, the event roster, matches, and the active-context default | — | — | ✓ |
| Build / reorder **pick lists**; edit or remove do-not-pick entries; record the **alliance bracket** | — | — | ✓ |
| Create / disable users; change roles; reset passwords | — | — | ✓ |
| Delete a season, an event or a form | — | — | ✓ |
| **Auto-create a bare match row** by entering an unknown match number while scouting (§6.4) | ✓ | ✓ | ✓ |

The **draft statistics page** (lead) is an ephemeral dashboard: built during a session, viewable live, **never written to the database**, discarded on **exit** — defined as logout or closing the app/tab. It is held in session-scoped memory, so it survives navigation between pages within the session and can be dismissed manually. Persistent dashboards are admin-only.

This matrix governs **users**. A non-human caller (`kind: 'service'`, §16.5) is not a user, holds none of these roles, has no `users` row, and may call **query** use cases only.

### 7.3 Account lifecycle

- **Only the admin creates users.** No self-registration.
- **Only the admin changes a user's role.**
- **Only the admin resets or changes a user's password.** There is no self-service password reset. The admin sets a new password and hands it over; `must_change_password` may be set to force a change at next login.
- **Only the admin disables a user.** Disabling revokes access and preserves everything the user created, with authorship intact (§3.2).
- **Switch-scouter quick action** on shared devices: a fast action instead of a full logout/login. **Every entry records the scouter who actually entered it.**

### 7.4 Authorization

**Authorization is enforced in the server use-case layer and surfaced in the UI. There is no Postgres Row-Level Security and no per-row policies.**

Every use case checks the caller's role (§16.5) and the UI hides or disables actions a role may not perform. Because all traffic goes through the server API (§16.2), the use-case layer is the single control point.

**Device gating is not a permission.** §17.2's viewport rules narrow *where* a capability is available; they never grant one. A scouter on a computer still cannot build a form, and the server enforces that regardless of viewport.

### 7.5 Authentication mechanism

Custom username/password authentication in the server use-case layer. **Supabase Auth is not used.**

| Concern | Decision |
|---|---|
| Credential | `username` (case-insensitive, unique) + password. |
| Hashing | **bcrypt, cost factor 10**, via `bcryptjs` (pure JS — no native build step on Vercel Functions). |
| Username uniqueness | A **`unique index on lower(username)`**. No `citext` extension is required. |
| Password policy | Minimum 8 characters. No composition rules, no expiry. |
| Session token | A **signed JWT (HS256)** issued by the server, signed with `AUTH_JWT_SECRET`. Claims: `sub` (user id), `role`, `username`, `iat`, `exp`. |
| Token lifetime | **30 days**, sliding: any authenticated request whose token is more than 7 days old causes the server to issue a fresh 30-day token in an `X-Refreshed-Token` response header, which the client stores. This is the "~30 days, refreshed on use" requirement. |
| Transport | **`Authorization: Bearer <token>` header. Never cookies** — client and server are separate Vercel projects and therefore cross-origin. |
| Client storage | The token is stored in **IndexedDB**, in the same database as the offline dataset, so one store governs all offline state. |
| Logout | Clears the token and the session-scoped draft state. It does **not** clear the offline dataset or the outbox. |

**Offline login and switch-scouter.** The offline dataset (§9.2) caches, for every user, `{id, username, full_name, role, password_hash, disabled_at}`.

- **Offline login** verifies the entered password against the cached bcrypt hash on-device. No token is minted; the device records the active user locally and attributes entries to them.
- **Returning to an authenticated session.** The password entered at offline login is held **in memory only, for the life of that session**, and is used to obtain a real token on the first successful reconnect. It is never written to IndexedDB or anywhere else. If the app was closed since the offline login, the user is prompted for the password once when connectivity returns; the outbox holds the data safely meanwhile and nothing is lost.
- **Switch scouter** offline is the same path, with the cached user list shown as a picker.
- **Shared-device push.** A device may hold outbox operations authored by several scouters. Every operation therefore carries `author_user_id` (§9.4), and **`syncPush` authorizes each operation against its own `author_user_id`, not against the bearer token's user.** The bearer must be an authenticated, non-disabled user of this install; beyond that it is the transport, not the author. Without this rule, a shared tablet could never upload the entries of anyone but the person currently logged in.
- **Accepted risk, stated plainly:** bcrypt hashes for all team accounts are present on every scouting device. They are hashes, not passwords, the devices are team-owned, and the alternative is no offline login at all.

### 7.6 Self-edit window

A scouter may edit their **own** entry for **5 minutes** after creating it. After that the row locks for them, and only a lead or admin can change it.

- The window is measured from the entry's **`client_created_at`**, so it behaves identically offline and online.
- The **client enforces it** by locking the UI at the 5-minute mark.
- **The server also enforces it**, using the two client timestamps carried on the mutation: an operation whose `author_user_id` has the `scouter` role and targets its own entry is accepted only when `client_updated_at − client_created_at ≤ 5 minutes`. An edit outside the window is rejected with `edit-window-expired`, and the client surfaces it as "this entry is locked — ask a lead".
- **The server compares the two client timestamps to each other, never to server time.** An entry created and edited offline and uploaded six hours later still passes, because the elapsed time measured is the scouter's own, exactly as it is on-device.
- Scouters never hard-delete entries. Removal is a lead/admin soft-delete.
- Leads and admins may edit or manage any entry at any time.

---

## 8. Data-entry runtime (the scouter's screen)

This is where 95% of usage happens: a student in a loud arena, phone in one hand, 2:30 of match plus ~10 seconds between matches.

### 8.1 Match and robot selection

**Manual selection in v1.** There is no assignment system. Submit returns to a fresh manual selection.

**Match entry.** The scouter picks:

1. the **form** — implicitly, the active season's `match` form, resolved by kind (§3.3);
2. the **match** — type + number, chosen from the active event's matches. If the number does not exist yet, the app **auto-creates the bare match row** (§6.4) and continues. This works offline.
3. the **alliance** — red or blue. Required; it is what makes the spatial-field mirroring of §5.6 correct.
4. the **team/robot** — from the event roster, pre-filtered to that match's `match_teams` rows for the chosen alliance when they exist, and the full roster when they do not.

**Super-scouting entry.** A separate entry point, because super records are one per (team, event), not per match:

1. the active season's `super` form, resolved by kind;
2. the **team**, from the event roster;
3. no match, no alliance, no robot status.

If a super entry for that (team, event) already exists on the device, the app opens it for editing rather than starting a second one. The duplicate path of §9.5 exists for the case two devices create one independently.

### 8.2 The entry form

- **Collapsible phase sections** — Autonomous → Teleop → Endgame → Post-match, ordered by the fields' `phase` metadata. The scouter can **open, close and reopen** any section at will. This is not one-way paging.
- **Mandatory robot status**, chosen **before** the scoring fields: `played` · `no_show` · `disabled` · `broke_down`.
  - For **`no_show`** and **`disabled`** every field is **hidden**. No zeros are ever entered. The entry is submitted with **`data = {}`**, required-field validation is bypassed, and the range block of §15.1 does not run. The entry records only the status.
  - **`broke_down`** additionally captures the breakdown time in seconds from match start, stored in `breakdown_seconds`. All fields remain visible and are filled normally.
- **Conditional fields** appear and disappear per §5.8.
- **Hard range block** on submit: a numeric value outside its field's `expected_range` blocks submission (§15.1).
- **Undo** is available on every repeatable input: counters, event-log taps, position-picker points (undo last point / clear all), multi-select, and timer reset.
- **Explicit submit.** Submitting shows a **confirmation summary of the whole entry** before it commits. Nothing reaches the shared data on a stray tap.

### 8.3 Never lose data

Every interaction writes a **local draft immediately** to IndexedDB. The draft survives a browser crash, a dead battery and an accidental back-swipe, and is offered for recovery on next open. An explicit submit promotes the draft into the sync outbox and clears it.

### 8.4 The sticky match timer

- **Pinned to the top of the screen, visible while scrolling.**
- Its **phases and their countdown durations are part of the form definition** — `forms.timer_config`, shaped `{"phases": [{"phase": "auto", "seconds": 15}, {"phase": "teleop", "seconds": 135}, {"phase": "endgame", "seconds": 30}]}`, using the same phase vocabulary as field metadata. Phases run consecutively in list order. **Match end (`t_end`) is the sum of the phase durations.** Editing durations is an in-place edit and creates **no** form version. An empty `phases` list means the form has no timer and the sticky timer is not rendered.
- A **manual "Start match" button** starts it. There is no field hookup.
- It is **display-only guidance**: it does not open or close phase sections, does not lock or gate any field, and does not auto-submit.
- It supplies `t = 0` for Event-log taps and the match-end boundary for the final derived cycle (§5.5).

### 8.5 Practice / training mode

A mode that renders a **real form** without polluting the database.

- Practice entries are marked as practice, are **never written to `scouting_entries`**, and **never enter the outbox**.
- Their drafts are written to a **separate IndexedDB store (`practice_drafts`)**, so a crash mid-practice does not lose the screen.
- That store is **cleared on exit from practice mode**, and on app start.

### 8.6 Arena-comfort features

All of the following ship:

- Large touch targets — **minimum 48 × 48 px with ≥ 8 px between adjacent targets**.
- **Outdoor-readable high-contrast theme** (§17.4).
- **Large-text option** — an in-app multiplier on top of the OS text size.
- **Haptic feedback** on taps.
- **Screen wake lock** — no dimming mid-match.
- **Thumb-reachable primary actions.**
- **Counters instead of the keyboard** wherever possible.
- **Both portrait and landscape**, on phones and tablets. A wider screen places fields side by side; a phone stacks them.

---

## 9. Offline & synchronisation

Offline is the normal operating mode. The local database is the source of truth during an event; the cloud is where it eventually lands.

### 9.1 PWA requirements

- Installable to the home screen; **fully functional with the network off, including cold start** — the app shell is precached and no network request is required to boot.
- **`vite-plugin-pwa`** precaches the app shell, the season game image and the fonts.
- **A new version is never applied by auto-reload.** It activates on the **next cold start**. The running app shows a discreet "update ready" hint. A service worker that reloads the tab mid-match would destroy a scouter's screen at the one moment it matters.
- **A version string is always visible** — in the footer of the context/landing page — for diagnosing "my tablet behaves differently".

### 9.2 The local store

IndexedDB (via Dexie), scoped to the **active (admin-default) competition only**. No multi-season or multi-event bulk is cached.

It holds:

It holds exactly the entities the delta pull returns, plus device-local state:

| Contents | Notes |
|---|---|
| `app_settings`, the active event and its season | |
| **Every team in the season** — the global `teams` rows for every team that appears on any of the season's rosters or entries | Needed because team search is season-wide (§13.2) and must work offline. It is a few hundred rows. |
| `event_teams` for the active event | The roster. |
| `matches` and `match_teams` for the active event | |
| All `forms`, `form_versions`, `form_fields` and `scoring_rules` for that season | |
| Every **raw** `scouting_entries` row for that event | **Nothing is pre-computed.** The on-device engine calculates every metric from raw entries. |
| `sync_conflicts` for that event | So the conflict list is readable offline (§9.6). |
| `pick_lists`, `pick_list_entries`, `do_not_pick`, `alliances`, `alliance_slots`, `alliance_declines` for that event | |
| `metrics`, `dashboards`, `dashboard_charts`, `weight_presets` for that season | Saved dashboards are viewable from cache offline. |
| Every `users` row, including `password_hash` | For offline login and switch-scouter (§7.5). Not event-scoped. |
| The outbox | Pending operations (§9.4). |
| Per-record sync state | `{row_id, sync_state: 'pending' \| 'acked', acked_at, origin: 'local' \| 'qr'}` — the representation behind the durability rule (§9.4), QR-copy disposal (§9.8) and the wipe guard (§9.9). |
| Drafts, and separately practice drafts | §8.3, §8.5. |
| The auth token and the pull watermark | |

**Size.** With no photos — position fields store only normalized coordinates — one event is a few MB of JSON (~700 match entries × ~1–2 KB, plus super scouting). Well within IndexedDB's limits.

### 9.3 Hydration and the pull protocol

**On app open**, the client attempts to pull everything it needs for the active competition.

| Outcome | Behaviour |
|---|---|
| **Pull succeeds** | Show a brief confirmation that the data is up to date, then continue normally. |
| **Pull fails, but the device already holds a hydrated dataset** | Show a clear notice that the app is working from cached data, and continue in **entry-and-read mode**: entries can be created and edited, statistics compute from cached entries, and any action requiring the server is disabled per §9.6. |
| **Pull fails and the device has never hydrated** | Show a **blocking** state: the app cannot be used, because there is no form definition to render. The message states plainly that an internet connection is required once, to load the competition. |

**Pull mechanics.**

`GET /sync/pull?event_id=<uuid>&since=<iso8601|omitted>&cursor=<opaque|omitted>`

```jsonc
// response
{
  "watermark": "2026-11-14T09:31:02.000Z",   // pass back as `since` next time
  "next_cursor": null,                        // non-null when the page was truncated
  "complete": true,                           // false while paging a first full pull
  "entities": {
    "app_settings":      [ … ], "seasons":        [ … ], "events":        [ … ],
    "teams":             [ … ], "event_teams":    [ … ], "matches":       [ … ],
    "match_teams":       [ … ], "forms":          [ … ], "form_versions": [ … ],
    "form_fields":       [ … ], "scoring_rules":  [ … ], "users":         [ … ],
    "scouting_entries":  [ … ], "sync_conflicts": [ … ],
    "pick_lists":        [ … ], "pick_list_entries": [ … ], "do_not_pick": [ … ],
    "alliances":         [ … ], "alliance_slots": [ … ], "alliance_declines": [ … ],
    "metrics":           [ … ], "dashboards":     [ … ], "dashboard_charts": [ … ],
    "weight_presets":    [ … ]
  }
}
```

- **Those 24 entity keys are the complete synced set.** Every row carries its `deleted_at`, so a tombstone arrives as an ordinary row.
- **First pull** (`since` omitted): the whole active-competition dataset. It is **paged** by `next_cursor` — the only query use case permitted to return large output, and it is bounded per page rather than per call (§16.4). The client is not usable until `complete: true`.
- **Every subsequent pull is a delta**: rows with `updated_at > since`. The server returns `watermark = max(updated_at) − 5 seconds`, an overlap that guarantees no row committed inside the same instant is skipped. Overlapping rows arrive twice and are idempotently upserted locally.
- A delta pull runs on **app open, screen entry, pull-to-refresh, manual refresh, reconnect, and the 45-second auto-refresh** (§10).
- If the server reports the event no longer exists (hard-deleted, §3.9), the client **wipes that event's cache** and shows a notice naming the event.

### 9.3.1 The push protocol

`POST /sync/push`

```jsonc
// request
{ "device_id": "<uuid>", "operations": [ /* Operation, in seq order — max 200 per call */ ] }

// response
{ "results": [
    { "op_id": "…", "status": "applied",        "row_id": "…", "new_version": 4 },
    { "op_id": "…", "status": "noop",           "row_id": "…", "new_version": 4 },
    { "op_id": "…", "status": "divergence",     "row_id": "…", "new_version": 5,
      "conflict_id": "…" },
    { "op_id": "…", "status": "duplicate",      "row_id": "…", "new_version": 1,
      "conflict_id": "…", "duplicate_row_id": "…" },
    { "op_id": "…", "status": "rejected",       "reason": "parent-deleted" },
    { "op_id": "…", "status": "rejected",       "reason": "edit-window-expired" },
    { "op_id": "…", "status": "rejected",       "reason": "forbidden" },
    { "op_id": "…", "status": "rejected",       "reason": "invalid",
      "detail": "…" }
  ] }
```

- Operations are applied **in `seq` order**, each in its own transaction. A rejection does not stop the batch.
- **`applied`, `noop`, `divergence` and `duplicate` all count as a cloud ack** for that `row_id`: the data is on the server. The client marks the record `acked` and prunes the operation.
- **`rejected` is never an ack.** `parent-deleted` triggers §9.7. Every other rejection reason leaves the record local and surfaces it on the sync page for a human to look at; the operation is not retried automatically.
- **`op_id` is the idempotency key.** Replaying a batch is safe; a previously applied `op_id` returns `noop`.
- **Authorization is per operation, against the operation's `author_user_id`** (§7.5), not against the bearer.

### 9.4 The outbox

Every local mutation is appended to an **outbox** as an operation carrying:

```ts
type Operation = {
  op_id:             string      // uuid, idempotency key
  entity:            'scouting_entry' | 'match'      | 'pick_list' | 'pick_list_entry'
                   | 'do_not_pick'    | 'alliance_slot' | 'alliance_decline'
  row_id:            string      // client-generated uuid of the target row
  action:            'create' | 'update' | 'delete'
  base_version:      number | null   // the row version this mutation started from; null for a create
  payload:           Record<string, unknown>   // the full row for create/update; {} for delete.
                                               // Shape = the entity's table columns, minus
                                               // server-managed ones (version, created_at, updated_at)
  author_user_id:    string      // the user who actually made the change (§7.5)
  client_created_at: string
  client_updated_at: string
  seq:               number      // monotonic per-device counter
}
```

- `entity: 'match'` covers only the bare auto-creation of §6.4 — event, type, number. Admin match management is online-only and does not use the outbox.
- **A payload is always the whole row**, never a patch. Field-level merging does not exist anywhere in this design.
- **Successive edits to the same row are coalesced.** The outbox holds **at most one pending operation per `row_id`**: a second update replaces the first, keeping the **earliest `base_version`** and the **latest payload and `client_updated_at`**. This is what makes §9.5's base-version test meaningful — the server always sees a base version it has actually issued.
- A `delete` after a still-pending `create` removes both from the outbox without contacting the server, since the row never reached it.

Sync replays operations in `seq` order. The client prunes only acknowledged operations.

**Durability rule — never prune before a cloud ack.** A device discards a local record from its outbox **only** after receiving a server acknowledgment for that exact `row_id`. Nothing else — closing the app, a device handoff, a QR transfer, or the lead-approved wipe — ever removes an unacked record. This is the single load-bearing guarantee against data loss.

### 9.5 Conflict policy

Every synced row carries a server-assigned `version`. Each mutation records the base version it started from. On push the server compares:

| Case | Behaviour |
|---|---|
| **Fast-forward** — `base_version` matches the row's current version, or the `row_id` is new | Apply, bump `version`, **last-write-wins, no review**. This covers every normal case: a scouter's own self-edit, a re-sync, a re-scanned QR batch. |
| **Divergence** — `base_version` is stale (two edits branched from the same ancestor on different devices) | A genuine conflict. **The copy with the greater `client_updated_at` becomes the live value** — the latest wins, exactly as in the duplicate rule and regardless of which arrived first. The other copy is written in full to `sync_conflicts` (`kind = 'divergence'`, with its payload, its author and its client timestamp) and the row is flagged for review. **No automatic field-level merge.** |
| **Duplicate** — a *different* `row_id` already exists, not deleted, with the same logical key | Both rows are **accepted and kept**, linked by a `sync_conflicts` row (`kind = 'duplicate'`). Until resolved, **the metric engine uses only the row with the greatest `client_updated_at`** — the last entered wins — so no average double-counts. |
| **Parent deleted** — the entry's event, season, match or form version no longer exists | The server rejects the operation with `parent-deleted`. See §9.7. |

**The logical key for duplicate detection**, matched with SQL's null-safe `is not distinct from` so super entries compare correctly:

| Form kind | Key |
|---|---|
| `match` | `(event_id, form_kind, team_id, match_id)` |
| `super` | `(event_id, form_kind, team_id)` — `match_id` is null on both sides |

**Resolution.** The "review conflicts" screen requires a human decision from a **lead or an admin**; a scouter cannot resolve one. A flagged row is not settled until one of them acts.

- Resolving a **divergence** means keeping the live copy or restoring the superseded one.
- Resolving a **duplicate** means soft-deleting one of the two rows.
- Resolving a **pick-list ordering divergence** means keeping the live ordering or restoring the superseded one wholesale.
- Resolution sets `resolved_at` and `resolved_by`. A row has an open conflict exactly while it has an unresolved `sync_conflicts` row.

The queue shows, for each item, the team, the match, **both authors' names**, both client timestamps and a field-by-field diff.

**The client prevents duplicates locally.** Before creating an entry the client checks its own cache for a live entry with the same logical key and refuses, pointing the scouter at the existing one. The duplicate path exists for the case the client cannot see: two devices, both offline.

### 9.6 What is and is not editable offline

**Editable offline:**

- Scouting entries — create, and the 5-minute self-edit.
- **Bare match auto-creation** while scouting an unlisted match number (§6.4).
- Pick lists (admin), including reorder.
- Do-not-pick entries — admin add/edit/remove, and a **lead's addition**.
- The alliance bracket, including declines.

All of them ride the same outbox.

**Viewable but not editable offline:**

- The main statistics pages, rankings and metrics — computed on-device from raw entries.
- Saved dashboards — viewable from cache; **saving or editing one needs connectivity**.
- A lead's **draft statistics page can be created offline** and, as always, is discarded on exit.
- **The conflict-review queue is readable offline** — `sync_conflicts` is cached — but **resolving a conflict requires connectivity**, because resolution is a server command that must settle the row for everyone. Offline, the queue shows what is waiting and says resolution needs a connection.

**Not available offline at all:**

- Form definition editing.
- User management.
- Switching the active event, and any cross-event view (only the active competition is cached).
- Season, event, match and roster **management** (as distinct from the bare match auto-creation above).
- Resolving conflicts.

Offline statistics naturally reflect only the entries the device currently holds; they become complete once it has gathered the others by sync or QR.

### 9.7 Parent-deleted records

When the server rejects an operation with `parent-deleted` — the season, event or form version it belongs to has been hard-deleted:

- The client **hard-deletes the local record and its outbox operation**.
- Before doing so it raises a **dismissible notice listing exactly what was discarded** (team, match, form kind, scouter, timestamp) so the loss is visible rather than silent.
- The notice is written to a local, read-only "discarded records" log kept for the life of the install, so a scouter can see later what happened to an entry they remember making.

This is the only path in the product that destroys data a scouter typed, and it runs only after an admin has hard-deleted the parent object.

### 9.8 QR fallback transfer

The venue workflow: a **central tablet collects scouters' data by QR inside the arena, and a runner carries that tablet outside every few matches to sync it to the cloud.**

**Encoding.**

| Parameter | Value |
|---|---|
| Payload | The sender's pending outbox operations, serialised as JSON |
| Compression | **`fflate`** raw deflate (browser-safe, tiny, fast) |
| Framing | The compressed byte stream is split into frames of **2,300 bytes** |
| QR parameters | Version 40, error-correction level **M**, **byte mode** (binary — no base64 expansion) |
| Frame header | 12 bytes: 4-byte batch id, 2-byte frame index, 2-byte frame count, 4-byte CRC32 of the *whole* compressed payload |
| Display | **Cyclic repeat at 5 frames per second** — frames are shown 1…N, 1…N, … indefinitely until the sender stops |
| Library — render | `qrcode` (byte-mode capable) |
| Library — scan | `@zxing/browser`, continuous scan from the rear camera |

The receiver collects frames by index and completes when it holds all N. Order does not matter, and because the sender loops indefinitely, a frame missed on one pass is caught on the next.

**Sizing.** ~200 KB of raw JSON (≈100–200 entries) compresses to roughly 20–30 KB → **9–13 frames** → one full cycle in ~2.5 s, with a complete scan typically inside 5 s. The sender **caps a batch at 200 operations** and splits larger backlogs into consecutive batches, each with its own batch id.

**Semantics.**

- QR transfer is **additive and idempotent**. Scanning copies records to the receiver **with their original UUIDs, author and client timestamps** — never re-authored.
- **Where the copies land:** each received operation is written into **both** the receiver's local dataset (so its offline statistics include them) **and** its outbox, marked `origin: 'qr'`. The receiver can therefore push them, and the disposal rule below can find them.
- The receiver pushes them under its own bearer token, and `syncPush` authorizes each one against its own `author_user_id` (§7.5) — which is what makes a collector tablet work at all.
- **The sender keeps its outbox pending.** A QR scan is a backup hop, not a confirmed sync, so the data now exists on both devices and is strictly more durable.
- When either device later reaches the internet, each uploads independently. Because the server keys on `row_id`, a second upload of the same record is an **idempotent upsert** resolved by the base-version rule: a no-op if identical, a fast-forward if linear, and flagged only on genuine divergence. Never a duplicate row.
- No device needs to be designated "the syncer", and re-scanning the same batch is harmless.
- The receiver shows a running count of frames collected and a clear "batch complete" state.

**Disposal of transferred copies — on ack, not on a timer.** A record whose sync state is `origin: 'qr'` is **discarded from the receiving device the moment its cloud acknowledgment arrives**. There is no TTL and no waiting period.

- **Never before the ack.** The durability rule of §9.4 is absolute: a QR copy that has not reached the cloud is kept indefinitely, however long that takes.
- **On ack**, the copy is removed from the receiver's outbox and its `origin: 'qr'` marker is cleared. The row itself remains in the local dataset as an ordinary cached row of the active competition — which is exactly what the next delta pull would hand the device anyway — so the collector tablet's own statistics stay correct and complete.
- Records the device created itself (`origin: 'local'`) behave identically: pruned from the outbox on ack, retained in the dataset.

**Manual escape hatch.** The sync page carries a **"discard received QR data"** action for when something has gone wrong — a corrupt batch, a device handed over mid-event, a scan from the wrong event. It removes every `origin: 'qr'` record on the device and is **refused for any record without a cloud ack**, the same guard as the device wipe (§9.9). It reports how many records it would refuse and stops rather than partially clearing.

### 9.9 Lead-approved local wipe

A "clear this device's offline data" action, gated behind a **constant code held by leads**, supplied at build time as the client environment variable `VITE_DEVICE_WIPE_CODE`.

- It is a guard against accidents, **not a secret** — a client-side build variable is visible in the bundle, and this is accepted.
- **The wipe is refused for any record without a cloud ack**, so it can never destroy unsynced data. If unacked records exist the action reports how many and refuses.

### 9.10 Sync status surface

- An **always-visible connection indicator** with three states — **online / syncing / offline** — naming the state in words plus the unsynced count ("offline · 4 unsynced"). This is a primary UI element, not a footnote.
- **The unsynced count counts records a person made, not queued operations.** An entry for a match number that was new on the device is **one** unsynced, not two: the bare match auto-created for it (§6.4) is never counted on its own, because it exists only to carry the entry and is pushed with it. Every other unacked record counts. The wipe guard (§9.9) is unaffected and still counts every unacked operation.
- **Tapping the indicator opens the sync page**, from every screen. The count is only useful if the list behind it is one tap away.
- A **sync page** listing what synced, what is pending, when the last successful sync was, and a manual **"sync now"** button.
- **The pending list names each unsynced record the way a person recognises it**, with the same number of items as the indicator's count. For a scouting entry: match and team (e.g. "Q21 · 118 Robonauts"), alliance, robot status, when it was saved, and whether it was made on this device or received by QR. A record the server **rejected** (§9.3.1) stays in the list, marked as rejected, with the reason in words. A bare match is not a line of its own; an entry whose match was created on this device says so ("new match — sends with this entry").
- **Conflicts are an explicit worklist you can finish**, not a passive warning.

---

## 10. Refresh & propagation

**There is no realtime push in v1.** No WebSockets, no Supabase Realtime subscriptions.

- **Optimistic local UI is core.** A user's own action appears instantly on their own device with no manual refresh. This is the same local mechanism offline writes use.
- Cross-device propagation happens through the ordinary refresh triggers: **re-query on screen entry, pull-to-refresh, manual refresh, re-sync on reconnect**, plus a **background auto-refresh every 45 seconds** on data-bearing screens while online.
- Each of those is a delta pull (§9.3).
- Needing a full app restart to see changes is a caching bug to design out: cache the shell, network-first for data.

**Consequence for alliance selection:** cross-off is instant on the **admin's own device**, reaches online viewers on the 45-second refresh or a manual refresh, and offline viewers only on sync. **During selection the admin's device is the declared source of truth**; every other screen is advisory (§14.6).

---

## 11. Metric engine

### 11.1 Where computation happens

**One metric implementation, in TypeScript, in `packages/shared`.** It runs unchanged in the browser (offline) and on the server (online). There is no second implementation and no metric logic in SQL.

The split between TypeScript and SQL is by *what the data is*, not by where the code runs:

| Layer | Responsibility |
|---|---|
| **SQL** (Postgres, via the server) | Everything over the **fixed skeleton**: fetching and filtering rows, pagination, sorting on skeleton columns, team/event/match/entry search, and the **operational meta-metrics** of §12.7 (row counts per user, per match, per event; conflict-queue size; super-scouting coverage). These are plain queries over typed columns and never touch the JSONB payload. |
| **Shared TypeScript engine** | Everything that reads `scouting_entries.data`, `robot_status` or the scoring model: flattening the JSONB, applying the scoring model, every Layer-1 aggregation, reliability, rankings, compare, and the match-preview prediction. |

The server fetches rows with SQL and hands them to the same engine the browser runs. **There are no generated per-form-version SQL views**; nothing in v1 flattens JSONB in the database.

### 11.2 Metric definitions

Metrics are built with a **menu builder. There is no free-text formula language.**

A definition is: **field(s) → aggregation → filters**, stored as `metrics.definition`:

```ts
type Op = '=' | '!=' | '>' | '<' | '>=' | '<='

type MetricDefinition = {
  source:
    | { kind: 'field';  field_key: string }
    | { kind: 'sum';    field_keys: string[] }       // multi-field arithmetic, e.g. auto + teleop
    | { kind: 'score' }                              // the derived scouted score
    | { kind: 'cycle';  field_key: string; event_type: string
                        series: 'duration' | 'count' | 'time_to_first' }
    | { kind: 'status'; measure: 'breakdowns' | 'no_shows' | 'disabled' | 'availability_rate' }
    | { kind: 'meta';   measure: 'entries_per_user' | 'entries_per_match'
                                | 'entries_per_event' | 'open_conflicts'
                                | 'super_coverage' }   // source_kind='meta' only
  aggregation:
    | 'avg' | 'median' | 'sum' | 'min' | 'max' | 'count' | 'stddev'
    | 'percentile' | 'rate' | 'slope' | 'best' | 'worst' | 'mode' | 'distribution'
  aggregation_options?: {
    percentile?: number                              // 0–100, required for 'percentile'
    rate_condition?: { op: Op; value: unknown }      // defaults to { op: '>', value: 0 } on points
  }
  filters: {
    exclude_match_numbers?: number[]
    last_n_matches?: number
    robot_status?: ('played' | 'no_show' | 'disabled' | 'broke_down')[]
    field_filters?: { field_key: string; op: Op; value: unknown }[]
  }
  display_limit?: number         // the game's cap for this metric, drawn as a reference line
}
```

**Evaluation order.** Scope (from the dashboard) → qualification-only → `robot_status` rule (§11.3) → `field_filters` → `exclude_match_numbers` → `last_n_matches` → aggregation.

Rules:

- **Only qualification matches ever feed an aggregate.** This is not configurable and is not a filter the builder exposes. The `match_types` global filter on a dashboard applies **only to charts that list raw entries** (data tables of entries), never to a computed metric.
- **`last_n_matches` is the only "last N" mechanism.** It is a filter applied before the aggregation, so "average of the last 5" is `avg` + `last_n_matches: 5`. "Last N" orders by the match's `number` within an event, and across a multi-event scope by the event's `sort_order` then the match number.
- **Multi-field arithmetic is supported for summing** (`kind: 'sum'`). There is no general expression evaluator at the metric level; per-field arithmetic belongs to Computed fields (§5.7).
- **A display limit / target value** is drawn as a reference on the chart or table.
- **No recency weighting.** Every included match counts equally.
- **Metrics are not versioned.** Editing one changes it everywhere.

**Aggregation semantics** — the ones that are not self-evident:

| Aggregation | Definition | Output |
|---|---|---|
| `rate` | `count(values matching rate_condition) / count(values)`, as a fraction rendered as a whole-number percentage. On a scored field the default condition is **points > 0** — the mission-success rule of §4.1. | number, 0–1 |
| `percentile` | The linear-interpolated percentile at `aggregation_options.percentile` over the team's own values. | number |
| `slope` | **Ordinary least-squares slope** of value against **match sequence index** (1…n, ordered as "last N" orders). Requires ≥ 2 points; fewer yields null. | number (units per match) |
| `best` / `worst` | **Direction-aware.** For `higher_is_better`, `best` = max and `worst` = min; for `lower_is_better` they swap; for `neutral` they are unavailable and the builder does not offer them. | number |
| `mode` | The most frequent value. Ties resolve to the option earliest in the field's option list, or the smallest value for numerics. | one value |
| `distribution` | Counts per distinct value, ordered by the field's option list for selects and ascending for numerics. **Renderable only by histogram, pie/donut and stacked bar**; the builder hides other chart types when this aggregation is chosen. | `{ value, count }[]` |
| `stddev` | Population standard deviation. Requires ≥ 2 values; fewer yields null. | number |

**Degenerate input.** Every aggregation returns **null** on an empty value set, and null renders as the grey "—" of §12.6, never as zero.
- **Metrics are type-agnostic.** A metric works on any field type; the aggregation menu offers only the operations valid for that type (avg/median/min/max/stddev for numeric and time, rate/percentage for boolean, mode/distribution for nominal categorical, rank-index aggregations for ordinal selects).
- **Minimum sample size is 1.** The engine guards only against empty input and division by zero. It does not flag or refuse a low-sample team.
- **No cross-event percentile or z-score normalisation.** Percentile is an ordinary aggregation over a team's own entries.

### 11.3 Robot-status handling

The engine applies one fixed rule everywhere:

| Status | Performance metrics | Reliability metric |
|---|---|---|
| `played` | **Included** | available |
| `broke_down` | **Included** — a robot that played then died genuinely underperformed, and its partial data is real observed performance | available, and flagged as a breakdown |
| `no_show` | **Excluded entirely.** Never counted as zero. | missed |
| `disabled` | **Excluded entirely.** Never counted as zero. | missed |

**Reliability is surfaced and used, not merely available.** The engine exposes per team:

- **breakdowns** (count of `broke_down`),
- **no-shows** (count of `no_show`),
- **disabled** (count of `disabled`),
- **availability rate** = available / (available + missed).

These are shown alongside performance metrics in statistics, ranking and pick-list views, and **reliability is a first-class input to alliance selection**: a high scorer that frequently breaks down must not out-rank a slightly lower but dependable robot.

**Standard deviation is displayed but is never a ranking sort key.** Consistency is shown next to averages; the app does not order teams by it.

### 11.4 Aggregation scopes

The engine computes:

- **per team per competition**,
- **per team per match** (a team's per-match series within a competition),
- **per scouter per competition** (operational),
- **per team per season** (the full-season slope view).

### 11.5 The canonical basic rank

Everywhere a generic "rank" is needed it is the **status-aware average points per match**: the mean of a team's scored match entries, with `no_show` and `disabled` excluded and never counted as zero. This is the default sort on every ranked view.

### 11.6 Canonical entry per (team, match)

There is **one canonical entry per (team, match, form kind)**. There is no deliberate multi-scout redundancy and no agreement measurement.

- The client refuses to create a second one locally (§9.5).
- When two devices produce two anyway, both rows are kept and flagged `duplicate`, and **the engine reads only the one with the greatest `client_updated_at`** until a lead or admin resolves it.
- Statistics therefore never double-count.

### 11.7 Cross-version aggregation

Entries collected under different form versions aggregate through shared field **keys**.

If a key's **type differs** between versions inside the aggregation window, the engine **refuses that metric** and the UI renders **"cannot calculate this metric — field type changed between versions"**, in the same treatment as a missing field. It never silently mixes types.

If a metric references a field **absent from the form's active version**, the UI renders **"cannot calculate this metric"**.

---

## 12. Dashboards, charts & visualisation

### 12.1 Model

- Statistics and graph pages are created **dynamically from inside the app**, pointing charts at specific form fields and metrics.
- **Metric definitions are season-level and event-agnostic.** A metric never names an event.
- **Scope binds at the dashboard level**, fixed when the dashboard is created. This applies identically to draft and saved dashboards.

```jsonc
// dashboards.scope
{ "mode": "event",       "event_id": "<uuid>" }              // exactly one event
{ "mode": "season" }                                          // the dashboard's own season, all events
{ "mode": "events",      "event_ids": ["<uuid>", …] }         // a chosen subset of that season's events
{ "mode": "all_time" }                                        // every season, every event

// dashboards.filters — inherited by every chart unless the chart overrides them
{ "match_types": ["qualification"],      // entry-listing charts only; never affects a metric
  "team_ids":    ["<uuid>", …] }         // restrict the team population
```

`all_time` is what makes the multi-season aggregation scope of §6.1 real. It is offline-unavailable, like every non-active-competition view.

- **Any saved dashboard is visible to all users, and is shareable by link** — a dashboard URL opens that dashboard for anyone who can log in. **Drafts are private to their session, have no URL and are never shared.** Saving is admin-only; leads build session-only drafts; scouters view.
- **A dashboard whose fields no longer exist renders read-only.** It draws every chart it still can, and each chart that references a field absent from the form's active version renders in place as "cannot calculate this metric", naming the missing field. The dashboard shows a banner saying it is read-only until it is rebuilt, and its edit actions are disabled.

### 12.2 Chart set

All of the following ship in v1:

Bar (grouped and stacked) · horizontal bar · line / progression (over match number) · scatter (two metrics against each other) · radar / spider · box plot · histogram · heatmap (field-position overlay, and team × metric) · **field-position scatter** · pie / donut · **data table** (sorting, inline sparklines, value shading) · single-number stat cards · **cycle-path overlay** (arrowed polylines over the game image, aggregable across matches and teams) · stacked area · bump / rank-over-time · bullet / target gauge (value against the metric's display limit) · small multiples (the same chart repeated per team in a grid).

Field-position data renders as **either a heatmap or a scatter** over the game image, chosen per chart.

**Library and build approach per chart type**, because not all of them are Recharts primitives:

| Chart | Built with |
|---|---|
| Bar, horizontal bar, line, scatter, radar, histogram, pie/donut, stacked area | **Recharts**, directly |
| Bump / rank-over-time | **Recharts** `LineChart` plotted on rank with an inverted Y axis |
| Bullet / target gauge | **Recharts** `BarChart` + `ReferenceLine` at the metric's `display_limit` |
| Small multiples | A CSS grid of the same Recharts chart, one per team |
| Stat card | Plain markup, no chart library |
| **Box plot** | **Hand-built** — Recharts has no box-plot primitive. Composed from `Bar` + `ErrorBar`, or plain SVG. |
| **Field-position heatmap / scatter, cycle-path overlay** | **Hand-built** in SVG/Canvas over the game image |
| **Team × metric heatmap table** | **Hand-built** — an HTML table with shaded cells, not a chart |
| Data table with sparklines | **TanStack Table** + Recharts sparklines in cells |

**Data tables** render as a fixed-height scroll viewport (~8 rows visible) with a **frozen header row and a sticky first column**, so a long table stays readable without pushing the rest of the page down.

### 12.3 Chart configuration

A chart is a saved configuration referencing fields and metrics:

```jsonc
{
  "type": "bar",
  "dimension": { "kind": "team" },
  "series": [ { "metric": "<metric_id>" }, { "metric": "<metric_id>" } ],
  "filters": [ { "field_key": "robot_status", "op": "=", "value": "played" } ],
  "sort":    { "by": "<metric_id>", "dir": "desc" },
  "limit":   20,
  "options": { "stacked": true, "show_error_bars": true }
}
```

Scope lives on the dashboard, not the chart.

**The dimension vocabulary is closed.** A chart's X dimension is exactly one of:

| `dimension.kind` | Meaning | Typical charts |
|---|---|---|
| `team` | One mark per team in scope | bar, horizontal bar, radar, box plot, table |
| `match` | One mark per match, ordered by event `sort_order` then match number | line, stacked area, bump, small multiples |
| `event` | One mark per event in scope | line, bar (the full-season slope view) |
| `scouter` | One mark per user | operational charts only |
| `field_value` | One mark per distinct value of a field | histogram, pie/donut (pairs with `distribution`) |
| `position` | The game image itself | field-position heatmap, cycle-path overlay |
| `none` | A single aggregate value | stat card, bullet gauge |

**The view-time metric selector pool** (§12.5) is every metric on the same dashboard's season whose `unit` matches the chart's current series and which is renderable on the chart's `dimension.kind`. It is computed at view time from the metric list, not stored on the chart.

### 12.4 Layout

- Charts sit on a **12-column responsive grid**.
- Each tile picks a **span**: stat card = 3 (four per row), standard chart = 6 (two per row), wide chart or table = 12.
- Tiles are **drag-reordered**. Size is chosen as small / medium / full. **No free-pixel positioning.**
- On narrower screens the grid reflows to fewer columns and finally to a single stacked column, preserving order.

### 12.5 View-time interaction

- A chart can expose an **interactive metric selector** (a dropdown shown while viewing) that adds or swaps a metric **sharing the chart's X dimension** with a comparable axis and unit.
- An **"expand"** action stacks instances of the chart **vertically, capped at 4**, each showing a different metric from that pool.
- Both are **view interactions**, not additional saved charts.

### 12.6 Value shading

Every numeric cell or mark carrying a metric value is **colour-scaled from light red (worst) to light green (best)**, so a table or heatmap reads at a glance. Scaling is **per column / per metric**, driven by the field's `direction` metadata.

| Metric kind | Colour domain |
|---|---|
| Numeric field with a declared `expected_range` | That declared min–max. |
| Unbounded numeric | Observed min–max of the values shown **in that column under the dashboard's current scope and filters**. The same team can shade differently on an event dashboard than on a season dashboard, because the reference population changed. |
| Percentage / rate | Fixed **0–100 %** — absolute level matters, not rank within the set. |
| **Ordinal enum** (`is_ordinal = true`) | Option **rank by builder list order** (top of the list = lowest rank). Aggregations run on the rank index. |
| `direction: neutral` | **No scale** — a flat single colour. |
| Operational meta-metrics | Observed min–max of the population shown; **higher is better** by default. |

`direction: lower_is_better` **inverts** any scale, so green = low. That covers climb time, cycle time, fouls and tip-over rate.

**Edge cases:**

- **No data** — a cell with no value renders as a distinct grey **"—"** and is **excluded from the column's min/max domain**. Missing data must never look like a bad value.
- **All-equal or single row** — when min == max, shading falls back to a **flat mid-colour**. Inferring "best" from one data point would be dishonest.
- **Colourblindness** — the red→green ramp must vary **lightness monotonically**, so it degrades to a legible light→dark ramp, **and the numeric value is always printed in the cell**. Colour is a fast cue, never the only channel.

### 12.7 Operational (meta) statistics

The app has two kinds of statistics: **robot/team statistics** built by pointing charts at form fields, and **operational statistics** — data *about the scouting itself*.

Operational statistics are **configurable, not a static page**: they use the **same dashboard builder** with the data source switched from form fields to **app metadata**.

**Meta dimensions:** scouter/user · match · event · form.

**Meta-metric catalogue for v1:**

| Metric | Definition |
|---|---|
| Entries submitted per user | Throughput and participation per scouter. |
| Entries submitted per match | |
| Entries submitted per event / in total | |
| Conflicting-entry count | The size of the §9.5 review queue — unresolved `sync_conflicts` rows. |
| Super-scouting coverage | **Of the teams on the event roster that have at least one recorded match entry, how many also have a super-scouting entry.** Denominator is *recorded* teams, so it needs no imported schedule. |

### 12.8 Built-in dashboards

Five dashboards ship out of the box. Each is reachable **in context from its home page**, which supplies the required input automatically:

| Built-in | Home page | Input supplied by that page |
|---|---|---|
| **Team dashboard** | Team page | Team number, event |
| **Ranking dashboard** | Ranking page | Event |
| **Compare dashboard** | Compare page | The team set |
| **Match preview dashboard** | Match preview page | The six teams |
| **Operational dashboard** | Operational statistics page | Event |

Each built-in has one `dashboards` row per season (§3.7), holding its chart set and — for ranking and compare — its metric columns.

**Built-ins operate on the active event, or on another event if the viewer changes it.** Every built-in carries an event selector; changing it re-scopes that view for the session only, without touching the dashboard's stored scope or the app's active context. Season-wide built-ins keep their season scope. The selector is **disabled offline** (only the active competition is cached).

**General Dashboards page (the hub).** A dedicated page lists **every dashboard for the active season** — the built-ins plus every admin-saved dashboard. Because the hub has no page context, opening a parameterized built-in **prompts for its input** (enter a team number, pick the teams to compare). Admin-saved dashboards are season-scoped and appear in the list for the year they belong to.

### 12.9 Builder UX

Pick a chart type → pick the dimension → add one or more series (field or metric + aggregation) → add filters → live preview → save.

The target is "understandable by a 15-year-old in five minutes", not Tableau. Desktop only, ≥ 1024 px.

**The draft statistics page** uses this same builder and has **exactly the same in-memory shape as a saved dashboard** — a `scope`, a `filters` object and an ordered list of chart configs, identical to §3.7's columns. It is never written to IndexedDB and never sent to the server. It is held in session memory, so it **survives navigation between pages** and is **lost on reload, on logout, and on closing the tab**. Offline it computes over the cached active competition only, and its scope selector offers only that event.

### 12.10 Mobile density

- When a chart's dimension is **all teams in the event or season**, the phone view shows **top-N and bottom-N** — default **top 8 + bottom 8** — with a "show all" expansion.
- When the view is **per-game, per-team or any non-all-teams slice**, everything is shown.
- **Per-team match views are designed for up to 14 matches** per team at an event.

---

## 13. Pages: search, ranking, browse

There is **no global omnibox**. The browse and search surface is a set of dedicated pages.

### 13.1 Team page

Reachable from team search and from the dashboards hub. Shows **that team's statistics over the matches of the active competition**. Fixed, always available.

Layout: a **sticky team header** (number, name, headline metric, rank badge), a **horizontal tab strip** below it, then stat rows as **label → value → inline bar**. Readable in one thumb scroll.

Required content, beyond the team dashboard's configurable charts:

- **All metrics for the team**, as the stat rows above.
- **A match-by-match table** — one row per match the team has an entry for, showing the match number, robot status, scouted score and the team dashboard's metric columns. A row opens that entry's preview page.
- **Progression charts** — the per-match line view of the team's headline metrics, with the view-time metric selector of §12.5.
- **Notes** — the values of that team's **Long-text fields** across its entries at the event, listed newest first, each labelled with its match, its field label and its scouter. There is no separate team-note entity; notes are entry data.
- **Reliability counts** — breakdowns, no-shows, disabled, and the availability rate (§11.3).

There are no photos on this page.

### 13.2 Team search page

Searches **all teams in the season** by number or name.

- A team **in the active event** shows a **small side rank badge**; the **top 3 carry a medal icon**. Teams not in the active event show no rank.
- Team **in the active event** → a button → that team's page (13.1).
- Team **not in the active event** → a **differently-styled button** → pick from the **events that team competed at** (events where we hold entries for it) → an **"are you sure?" confirmation** → on yes, switch the active event as a **session-only override** and land on that team's page. **Disabled offline.**

### 13.3 Entry search page

Lists entries of the **active competition only**, **both `match` and `super` kinds with a kind filter**.

Searchable by **team name, team number, match number, scouter name**. Each row shows the entry's **scouted points**. A row opens the entry preview.

Dense list rows, filters as chips, search that filters as you type. A row opens the preview **as a full page, not a drawer**.

### 13.4 Entry preview page

A read-only, nicely formatted rendering of a **single entry**: all field values laid out **by phase**, plus the entry's **scouted score**, team, match, alliance, robot status, scouter, form kind and timestamp.

### 13.5 Ranking page

Also the **ranking built-in dashboard**. Backed by a single **admin-built ranking dashboard — one per season, edited in place, not versioned** — that defines the table's metric columns. Scoped to the active event by default.

Layout: the **metrics table first**, then charts and other metrics below.

- Only the table's built-in metrics drive **column-click reordering** and can be weighted.
- **Reliability / availability is one of those selectable, sortable, weightable columns.**
- Mechanics: column sort, column visibility, sticky header, **no pagination** for a 50-team event. A rank column, **medals on the top 3**, no zebra striping, numbers right-aligned and tabular.

**Weighting mode** (a toggle):

- Each metric is normalized **min–max to 0–1** over the ranked teams under the dashboard's scope.
- **When a column's min equals its max** (every team identical, or only one team), every team gets **0.5** for that metric. There is no division by zero and no invented ordering.
- For a `lower_is_better` metric the normalized value is inverted as **`1 − normalized`**, so higher is always better.
- Each metric is given a **weight**; weights are auto-normalized and need not sum to 1.
- Teams are ranked by the **weighted sum**, and a per-team **contribution breakdown** shows how much each metric added.
- **A missing metric for a team** shows a grey "—" in the table and counts as **0.5** — the neutral midpoint — in the composite, so it neither sinks nor inflates the team.

**Weight presets:** an admin can save **named weight presets** (these seed the pick list, §14.3). A lead can adjust weights live but **session-only**. **Offline, weights can be changed but not saved.**

**Phase 1 ships a fixed ranking table**, not this one: the canonical basic rank, the average scouted score, and the four reliability figures, with column sort and no weighting. The admin-built columns, the weighting mode and the presets arrive in phase 2 with the metric builder they depend on (§20.2).

### 13.6 Compare page

Also the **compare built-in dashboard**. Compares **up to 6 teams** on an **admin-built compare metric set — one per season, edited in place, not versioned — computed over the active event**.

- **2 teams:** a "final-score" **head-to-head scoreboard** — a big average-points headline per team, then per-metric rows in a **mirrored two-column layout** with a bar leaning toward the stronger side.
- **3–6 teams:** **radar + table**, to a high visual standard.

### 13.7 Match preview page

Also the **match preview built-in dashboard**.

- The user either **picks an existing match** from the active event (which fills in its six teams from the match's alliance slots) **or enters the six teams by hand** (3 red + 3 blue).
- Shows the two alliances as **mirrored columns**, three team rows each with their key metrics.
- **Prediction:** each alliance's predicted score = the **sum of its three teams' status-aware average points per match**. The higher total is the predicted winner. Shows **each team's contribution and the predicted margin**, with the summed-average prediction as a single bar across the top.
- Also surfaces **per-robot reliability and no-show flags** and each team's **top strengths**.

---

## 14. Alliance selection & pick list

### 14.1 Ownership

**Single editor, many viewers. No collaborative editing.**

- **Admin only:** create the pick lists, reorder them, add/remove teams, edit or remove do-not-pick entries, and record the alliance bracket.
- **Lead:** may **add a team to the do-not-pick list with a required reason** — and nothing else. A lead cannot reorder a pick list, cannot add or remove a team on one, and cannot edit or remove a do-not-pick entry, not even one they created.
- **Scouter and lead:** read-only view of the pick lists, the do-not-pick list and the alliance bracket.

### 14.2 Two pick lists per event

`first` and `second`. Each is an ordered list of teams.

Each row shows: **rank position**, team number + name, the **canonical basic rank** (§11.5), the **reliability counts** (breakdowns / no-shows / disabled), the **seeding preset's metric columns**, and the team's **inline notes**.

### 14.3 Seeding and reordering

- A list is **seeded from a ranking weight preset** (§13.5): the admin picks a saved preset (recorded in `seeded_from_preset_id`) or the ranking page's current live weights (snapshotted into `seeded_from_weights`), and the list is generated in that weighted-composite order, then hand-adjusted. Either way the seeding basis is recorded, so the list can say what it was built from.
- **Reseeding replaces the whole order and asks for confirmation first**, because it discards manual adjustments.
- **Reorder is drag-and-drop** with an explicit **drag handle**, a visible drop position, and **long-press to start a drag on touch**, so a scroll can never reorder the list by accident.

### 14.4 Round awareness

The app tracks which selection round is in progress:

- While **any alliance still has a `pick1` slot with `team_id is null`**, the **first-pick list** is the active list.
- Once **all 8 alliances have a first pick**, the app **switches to the second-pick list automatically**.
- The switch is **manually overridable in both directions**. The override is **session-only, held in memory, per device** — it is not stored and does not affect anyone else's screen.
- Only the active list is emphasised; the other stays viewable.

### 14.5 Do-not-pick list

- Adding a team **requires a free-text reason**. No reason, no add. The author is recorded.
- **A team on the do-not-pick list cannot be added to a pick list.** The add action is **blocked**, showing the reason and who wrote it. To pick that team, remove them from the do-not-pick list first.
- **Exception — the team is already on a pick list when it gets do-not-picked:** this is **flagged, never blocked**. The team stays exactly where it is in the order, is rendered with a warning marker, and a banner tells the admin to resolve it. A lead's addition therefore never fails and never silently reorders the admin's list.
- **One-tap removal from the do-not-pick page itself**, with an inline confirm — no dialog chain, no navigating away. Removing an entry **clears any pick-list flag it caused, immediately**. Removal offers **undo**.

### 14.6 Alliance bracket

Manual entry. No import.

- **8 alliances × 3 robots** — `captain`, `pick1`, `pick2` — plus an optional **`backup`** slot per alliance.
- The grid is **created empty in one action** the first time the bracket page is opened for an event: 8 `alliances` rows and 32 `alliance_slots` rows with `team_id is null` (§3.8). It works offline like any other create.
- The admin enters each result as selection happens. Every entry **writes locally first** and **syncs immediately if there is internet, otherwise on the next sync**, through the ordinary outbox.
- **Declined pick.** A team that declines is recorded as **declined against that alliance**. It stays available to be picked later or to become a captain, and the app shows a "declined — alliance N" marker so nobody asks twice.
- **Live cross-off.** As captains, picks and backups are entered, every affected team is **struck through automatically across both pick lists**, so the top unstruck row is always the next available team. Cross-off state is **derived from `alliance_slots`**, never stored.

### 14.7 Offline and conflict behaviour

Pick lists, the do-not-pick list and the alliance bracket are **all editable offline** and sync through the outbox.

**Reordering is one operation against a list-level version.** §9.5's last-write-wins is a *per-row* rule, but a pick list is an *ordering*: two devices reordering the same list offline would silently discard one person's entire work. So:

- The `pick_lists` row carries **its own `version`**.
- A drag-reorder writes the **whole ordering as a single operation** stamped with the base version it started from.
- Fast-forward → applied, version bumps.
- Genuine divergence → the conflict-review queue, with the **superseded ordering preserved in full**.
- Individual rows (add / remove / edit note) remain ordinary per-row last-write-wins.

**No pick-list history and no ordering snapshots.** The bracket's `declined` markers are the only historical record the feature keeps.

### 14.8 The pages

One **"Alliance selection"** area with three tab-switched pages. All three work at **any viewport width** — the admin may be holding a phone in the stands.

1. **Pick list page** — the active-round list (first/second toggle plus automatic round detection), drag-reorder for the admin, automatic strikethrough for taken teams, do-not-pick warning markers, inline notes, a reseed-from-preset action, and a **compact "next available team" header** designed to be readable at arm's length in a loud arena.
2. **Do-not-pick page** — every flagged team with its reason and author, a one-tap remove per row, and an "add team" action available to leads as well as the admin.
3. **Alliance bracket page** — the 8 alliances × captain / pick1 / pick2 / backup grid; tap a slot to enter a team; declined markers shown against the alliance that was refused.

---

## 15. Data quality & integrity

### 15.1 Entry-time validation

**Hard range block only.** Submission is **blocked** when a numeric value falls **outside its field's declared `expected_range`**. Fields without an `expected_range` have no block.

There are **no cross-field rules and no outlier blocking** in v1. Nothing is ever auto-excluded or silently averaged out.

### 15.2 What is deliberately not built

- **No redundant-scouting feature.** Deliberate double-scouting and agreement measurement are not built. Two entries for the same `(team, match)` are handled by the duplicate path of §9.5.
- **No scouter reliability score.** Not computed, not displayed, not used for weighting.
- **No dedicated bulk-fix tools.** The two operations that actually happen are covered by existing mechanisms: **reassigning an entry to the correct team = editing the team on that entry** (a normal edit, within §7.2's permissions), and **merging duplicates = resolving the conflict-queue item**. Bulk match-number shifting and shift-deletion are out of scope.
- **No full per-entry edit history.** Routine edits overwrite, last-write-wins. Only §9.5 divergence preserves the superseded copy.
- **No user audit log.**

---

## 16. Architecture

### 16.1 Stack

| Layer | Choice |
|---|---|
| Language | **TypeScript everywhere.** |
| Client | **React + Vite**, PWA (`vite-plugin-pwa`). |
| Server | **Node + Hono**, on Vercel Functions, **Node runtime — not Edge**. |
| Database | **Supabase Postgres**, free tier. |
| Shared | **`packages/shared`** — metric engine, form-definition model, Zod schemas. Browser-safe. |
| Monorepo | **pnpm workspaces + Turborepo**, pnpm version pinned via `packageManager`, **Node 22**. |
| UI | **Tailwind CSS + shadcn/ui**. |
| Charts | **Recharts**, plus hand-built SVG/Canvas for image overlays and the heatmap table. |
| Local store | **IndexedDB via Dexie**. |
| Hosting | **Vercel**, two projects from one repository. |

**No tRPC.** The typed client is derived from the **use-case registry itself** (§16.4).

**Generated Supabase database types are committed**, so a migration that changes a column surfaces as a compile error rather than a runtime surprise. The Zod schemas in `packages/shared` are the single validation source for both sides.

**A lint rule keeps `packages/shared` browser-safe** — no Node built-ins, no service-role client — because the client bundles it.

### 16.2 Access model

**All traffic goes through the server API.** The client never calls Supabase directly, on any path — reads, writes, form management, user provisioning, aggregations. The server holds the service-role key and is the single control point for authorization.

### 16.3 Repository layout

```
frc-scouting/
  apps/
    client/                       # the PWA — React + Vite + TypeScript
      public/
        seasons/2027/field.webp   # the season game image: static, precached,
                                  # only its path is stored in the DB
      .env.example
    server/                       # API — Node + Hono on Vercel Functions (Node runtime)
      .env.example
  packages/
    shared/                       # types, Zod schemas, form-definition model,
                                  # metric evaluation engine, sync/conflict logic.
                                  # Browser-safe: no Node built-ins, no service-role client.
    db/                           # Supabase migrations, generated DB types, seed script
  docs/
    spec/                         # the living spec, SPEC-FINAL.md
    plans/                        # implementation plans
    ops/                          # SETUP.md, RUNBOOK.md, ENVIRONMENT.md
    brand/                        # brand source assets (§17.5)
  .github/
    workflows/                    # CI, and the twice-weekly keep-alive
```

### 16.4 The use-case layer

Every meaningful operation is a named, typed **use case**, not logic inside an HTTP handler:

```
core/
  queries/    ...   see Appendix C
  commands/   ...   see Appendix C
```

**Appendix C is the authoritative registry.** Each entry carries a **Zod input schema, a Zod output schema and a plain-language description**.

Three thin transports sit on top of the same functions:

| Transport | Consumer | Built in v1? |
|---|---|---|
| HTTP (Hono) | the web client | **Yes** |
| CLI / scripts | imports, backfills, testing | **Yes** |
| MCP tools | an LLM | **No** — a route inside `apps/server`, built later |

**Every query use case returns bounded, paginated, pre-aggregated output.** No use case returns an unbounded row dump.

**`syncPull` is the one exception, and it is bounded differently, not unbounded:** it returns raw rows because offline computation requires them, and it is bounded **per page** by `next_cursor` rather than per call (§9.3). It is a replication endpoint that happens to live in `queries/`, and it is not a candidate for future MCP exposure.

**Dynamic-form validation is generated at runtime from the field definitions.** Hand-written Zod covers only the fixed skeleton and the use-case inputs/outputs; a new season's form needs no code change.

### 16.5 The caller contract

**Every use case takes the caller as its first argument**: `useCase(caller, input)`.

```ts
type Caller =
  | { kind: 'user';    userId: string; role: 'scouter' | 'lead' | 'admin' }
  | { kind: 'service'; label: string }   // non-human, read-only
```

- **Authorization reads that argument and nothing else** — never the Hono context, never a request object, never ambient state.
- Each transport builds the caller at its own edge: **HTTP** from the bearer token; **CLI** as a `user` caller naming an existing admin account, passed by an explicit flag.
- **A `service` caller is read-only by construction: every `commands/` use case rejects it.** Nothing in v1 constructs one; the union member and the command-layer rejection are the entire cost.
- **`login` and `refreshToken` are the only two use cases that take no caller.** They *produce* one. They live in `commands/` for placement but are explicitly exempt from the caller contract and from the `service` rejection, and they are the only unauthenticated routes the HTTP transport exposes. Both are rate-limited by username.
- **The dev seed script is not a use-case caller at all.** It is a database-level command in `packages/db` that writes rows directly, which is what lets it run before auth and roles exist.

### 16.6 Deployment topology

- **Two Vercel projects from one repository** — client as a static build, server as Vercel Functions. Each has its own root directory and build command, sharing the Turborepo cache.
- Client → server is **cross-origin**, so authentication uses a **bearer token in an `Authorization` header, never cookies**.
- **Serverless constraints to design around:** functions are stateless and time-limited (no long-running jobs), there is no local filesystem persistence, and cold starts exist — so the scouter's critical path must not sit behind a rarely-called function.

### 16.7 The season game image

- **No Supabase Storage and no binary uploads anywhere in v1.**
- The season game image ships as a **static client asset**, committed to the repo at `apps/client/public/seasons/<year>/field.webp` and deployed with the client. The database stores **only the path string** on the season row.
- The service worker **precaches it with the app shell**, which is what makes offline position and cycle-path entry work at no cost to the offline budget.
- **Consequence:** adding a season needs a commit and a redeploy. This is a line in the new-season checklist in `docs/ops/SETUP.md`.
- **The image is immutable once entries exist.** Every stored `{x, y}` is normalized against that exact image, so swapping it silently re-frames all historical spatial data. A new image means a **new filename and a new form version**.
- **A missing image must fail loudly.** The position picker and cycle-path fields show an explicit error, never a blank canvas that quietly records meaningless coordinates.

### 16.8 AI / MCP readiness (setup only)

No MCP endpoint, no MCP transport or auth, no LLM API call, no AI panel, no prompt engineering, no AI-generated insight is built in v1.

Four obligations only, all of which are worth having regardless, and all of which would be painful to retrofit:

1. **Semantic metadata on every data field** (§5.4) — part of the phase 1 form builder.
2. **The transport-agnostic use-case layer** with Zod input/output schemas and descriptions (§16.4) — part of the phase 1 server.
3. **The explicit `caller` argument** on every use case, with the `service` caller kind (§16.5) — part of the phase 1 server.
4. **Bounded, paginated, pre-aggregated query output**, with all aggregation performed in the backend (§16.4, §11).

Plus one stored, unused column: **`include_in_ai_context`** per field.

**Query outputs keep scouter names.** No redaction, no opt-in flag. Use cases return the scouter's name wherever the UI shows it — entry search, entry preview, and the conflict-review queue.

**A model may never write directly.** Any future write capability is *propose-and-confirm* — the model proposes, a human applies it with an explicit tap through the ordinary command path — and is scoped to chart-building and form-building only, never pick lists and never scouting entries. Phase 1's only obligation is to keep that possible, which the query/command split and the read-only `service` caller already do.

---

## 17. UI / UX system

### 17.1 Language and direction

- **App chrome is English and LTR.**
- **Form content is Hebrew** — labels and free-text notes.
- Full-app RTL is **not** required, but **every text node that can hold Hebrew must be bidi-correct (`dir="auto"`)** — form labels, notes, and their appearance on chart axes, tables and team pages. Built in from the start.

### 17.2 Device roles

**Two distinct experiences, one codebase.** *Phone = data entry and competition use.* *Computer = analysis and construction.* These are not the same UI scaled; they are different information densities and different jobs.

**The phone does the whole competition job:** create and edit entries, view team statistics and saved dashboards, search and browse teams and entries, the ranking table, compare, match preview, view the pick list, add a do-not-pick (lead), and the sync and conflict surface.

**The computer does everything, and is the only place the builders live:** the form builder, the dashboard and metric builders, the ranking-table and weight-preset builder, season/event/roster/match management, and user administration. This is pre-competition work, done sitting down.

**Builder routes require a viewport ≥ 1024 px.** On anything narrower the route renders **one clear panel** — "this needs a computer", naming what it is and why — and never a cramped, half-working builder.

**Two exceptions work at any width, because they happen at a venue:**

- **Alliance selection / pick-list editing** — the admin may be holding a phone in the stands.
- **Conflict review** — it cannot wait for a laptop.

**Device gating is not a permission** (§7.4).

### 17.3 Breakpoints

Mobile-first; the width decides, never the user agent.

| Name | Width | Role |
|---|---|---|
| phone | < 640 px | One column, single task per screen, thumb-zone actions. Data entry. |
| tablet portrait | 640–1023 px | Two columns; side-by-side fields on a wider entry form. |
| desktop | ≥ 1024 px | Dense tables, multi-panel layouts, hover detail, keyboard shortcuts. **Builders unlock here.** |
| wide | ≥ 1280 px | Multi-panel dashboards up to the 4-chart expand-to-stack cap. |

### 17.4 Colour and theming

**Two themes, not three:** **dark (default)** — scouting happens in dim arenas and it saves battery — and the **high-contrast "outdoor" theme**, a light, maximum-contrast surface for sunlight legibility. That theme *is* the light theme.

**The app is not a black-and-yellow app.** The UI is a **neutral dark palette with brand yellow as the single accent** — the logo, the primary action, the focus ring.

**Every colour is a CSS variable token. Components never hard-code a hex.**

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

**`--border` is zinc-500 `#71717A`, not the zinc-700 `#3F3F46` the rest of the ramp would suggest.** Zinc-700 measures 1.89:1 on `--bg`, 1.70:1 on `--surface` and 1.43:1 on `--surface-raised` — all below §17.7's 3:1 floor for UI boundaries, which §17.7 calls a bug rather than a preference. Zinc-600 still fails; zinc-500 is the first step that clears it (4.09 / 3.67 / 3.08). The outdoor theme's `#52525B` already passes at 6.09:1 worst case and is unchanged. **Do not darken this token back.**

**Brand yellow is never text or an icon on a light surface.** `#FFEA07` on white is 1.23:1 — illegible; on near-black it is 16:1. The logo therefore always sits on a near-black plate (`#0A0A0B`), **including in the outdoor theme**.

**Functional colour is independent of branding.** Brand yellow **never appears in data ink**.

| Meaning | Colour |
|---|---|
| `played` / success | green |
| `broke_down` | orange |
| `disabled` | deep orange |
| `no_show` | neutral grey |
| danger | red |
| sync: offline / syncing / online | red / orange / green |
| warnings | **orange**, not amber — kept separate from brand yellow |
| value shading ramp | red → **desaturated grey-amber** → green (the mid-tone is deliberately distinct from `#FFEA07`) |

### 17.5 Brand assets

**ROBACTIVE, team #2096.** The logo is a distressed yellow radiation trefoil over the `ROB✕ACTIVE #2096` wordmark. **Brand yellow is `#FFEA07`.**

`docs/brand/` is the source of truth; the build copies what it needs into the client's static assets.

| File | What it is |
|---|---|
| `logo.pdf` | Original supplied artwork (A4, 300 dpi raster). Archive — never referenced by the app. |
| `logo.png` | Full lockup (trefoil + wordmark), transparent, trimmed, 2320×2482. |
| `logo-on-black.png` | The same lockup on `#0A0A0B`. |
| `mark.png` | Trefoil only, transparent — the source for every icon. |
| `icon-192.png`, `icon-512.png` | PWA manifest icons (mark on `#0A0A0B`, 12% padding). |
| `icon-512-maskable.png` | Maskable variant, 24% safe zone. |
| `apple-touch-icon-180.png` | iOS home-screen icon. |

The supplied logo is **raster, not vector**. It is large enough for every use in this app. If a vector version ever appears, dropping it in as `logo.svg` is the only change needed.

### 17.6 Typography

**Inter for app chrome, Noto Sans Hebrew for form content.** Both **self-hosted in the repo and subset — no Google Fonts CDN**, because a font fetch that fails at a venue is a broken app. Inter carries no Hebrew glyphs, so without an explicit Hebrew face every Hebrew label falls back to an arbitrary system font. The two faces are matched on x-height so a mixed line does not visibly step.

### 17.7 Accessibility floor

- **Minimum touch target 48 × 48 px**, with at least **8 px** between adjacent targets.
- **WCAG AA: 4.5:1 for text, 3:1 for UI boundaries and chart strokes, in both themes.** A token pair that fails is a bug, not a preference.
- **OS text-size settings are respected** — all type in relative units. The in-app large-text option is a multiplier on top. **No layout may break at 200%.**
- **A visible focus ring on every interactive element** — brand yellow on dark, near-black on the outdoor theme.

### 17.8 Interaction conventions

**PWA install identity.** Manifest name **"ROBACTIVE Scouting"**, short name **"Scouting"**, `display: standalone`, `theme_color` and `background_color` **`#0A0A0B`**, orientation unlocked. Icons generated from `docs/brand/` at 192 and 512, plus a **maskable 512 with a 24% safe zone** and a 180 px Apple touch icon. **The icon is the trefoil mark alone, never the wordmark** — the wordmark is unreadable below ~96 px. Icons and manifest are precached with the app shell. The visible version string appears on the context/landing page.

**Number, date and time formatting** — identical on every surface, so two views can never disagree about the same value:

| Value | Format |
|---|---|
| Computed metrics and averages | **2 decimal places** |
| Standard deviation | 2 decimal places |
| Integer counts (game pieces, match numbers, team numbers) | **No decimals**; team numbers carry **no thousands separator** |
| Percentages | **Whole numbers** |
| Dates | **`DD/MM/YYYY`** |
| Times | **24-hour** |
| Timezone | **The device's local zone** |

**Feedback, empty and error states.**

- **Skeletons, not spinners**, for lists and tables. A spinner only for a genuinely indeterminate single action.
- **One state component, six variants:** *no data yet* · *form not published* · *offline and this needs the server* · *something failed* · *no search results* · *conflicts waiting for review*.
- Each is a centred glyph, one bold line of what happened, one muted line of why, and **exactly one primary action**. No dead ends, no stock illustrations, no raw error codes in front of a student.
- **The offline variant always says the data is safe on the device** — that is the sentence that stops someone re-entering a match.

**Destructive actions — one pattern everywhere.**

- A single confirm dialog that **names the object**, **states what is lost as a count** ("this deletes 4 entries"), and puts the destructive verb on the primary button.
- **Type-to-confirm only for multi-record irreversibles** — delete a season, delete a form version, wipe local device data. **Plain confirm for single records.**
- **Undo instead of a dialog wherever undo is possible** — repeatable inputs, one-tap do-not-pick removal.
- **An action that would orphan collected data is blocked, not confirmed.** Deleting a form version with entries bound to it fails with an explanation, and no confirmation text overrides it.

### 17.9 Per-surface design references

**System-wide baseline: Linear / Vercel.** Restrained dark chrome, low decoration, high information density, a tight type scale, muted 1-px borders instead of shadows, exactly one accent colour. This is shadcn/ui's default.

**These are references for behaviour and layout, never for palette.** Colour comes from §17.4's tokens.

| Surface | Reference | What we take |
|---|---|---|
| Context / landing page | **Figma file browser** + **Notion** | Scope chosen from a **card grid, most recent first** — seasons, then that season's events — never a header dropdown; cards big and unmissable. The page reads as a **calm document, not a control panel**. The version string sits quietly in the footer. |
| Phone data entry | **Tally**, **Typeform**, **FotMob** | Pacing: one job on screen, generous spacing, no cramped rows. A dense sports UI staying thumb-reachable. Counters are a wide − / value / + triplet, never a text input. The sticky timer never fights the page scroll. |
| Form builder | **Fillout**, **Tally** | Three panes: palette → canvas → settings. Semantic metadata lives in the settings pane so it is filled *while* the field is created. A preview toggle renders the form at phone width. |
| Team page | **Sofascore** | Sticky team header, horizontal tab strip, stat rows as label → value → inline bar. Readable in one thumb scroll. |
| Dashboards & builder | **Grafana Play**, **Metabase**, **Tremor** | Grafana for the panel grid and a pinned scope/filter bar; Metabase for a builder order a non-programmer can follow; Tremor for the visual language — small KPI tiles above the charts, sparse gridlines, no chart junk. |
| Ranking table | **shadcn/ui data-table**, **TanStack Table**, **premierleague.com** | Column sort, column visibility, sticky header, no pagination for 50 teams. Rank column, medals on the top 3, no zebra striping, numbers right-aligned and tabular. |
| Compare page | **Sofascore head-to-head** | 2 teams: mirrored two-column layout, one metric per row, a bar leaning toward the stronger side. 3–6: radar + table. |
| Match preview | **op.gg** | Two alliances as mirrored columns, three team rows each, the summed-average prediction as a single bar across the top. |
| Search & record detail | **Attio** | Dense list rows, filters as chips, search that filters as you type. A row opens the entry preview as a **full page, not a drawer**. |
| Alliance selection | **Todoist** | Explicit drag handle, visible drop position, long-press to start a drag on touch. One-tap row actions with undo. |
| Sync & conflict review | **Obsidian Sync** | The indicator names the state in words plus a count. There is a place to look listing what synced and what didn't. Conflicts are an explicit worklist you can finish. |
| Admin: users, seasons, events | **Clerk** | Table → row opens a detail page; role is a select on that page; creation is one small form. Destructive rows follow the single pattern above. |

**Standing reference libraries for the build phase:** [mobbin.com](https://mobbin.com), [godly.website](https://godly.website), [ui.shadcn.com/blocks](https://ui.shadcn.com/blocks). When a screen has no rule above, look there before inventing one.

**The `frontend-design` skill: craft yes, identity no.** Build chats invoke Anthropic's `frontend-design` skill on UI tasks. Use its **Restraint and self-critique** and **More on writing in design** sections in full — the second reinforces the six-variant state component of §17.8 — plus *Structure is information* and the two-pass plan-then-critique habit. **Ignore its *Ground it in the subject* and *Process* token-invention steps entirely**: they ask for a 4–6 value palette and two or more typefaces, which is precisely what §17.4 and §17.6 already fix. Do **not** use it to choose an identity: the palette is the ten tokens of §17.4 at exact hex in two themes, the typefaces are §17.6's Inter + Noto Sans Hebrew, and each surface's reference is the table above. Components read CSS variables and never hard-code a hex; brand yellow never appears in data ink and never sits on a light surface. **No decorative animation on the data-entry path** — motion is permitted only where it carries information a scouter must notice, never as ornament, because the primary surface is a phone held in one hand in a loud arena during 2:30 of match. **Where the skill and §17 disagree, §17 wins**, and the build chat names the line that disagreed rather than silently picking one.

**Printing is out of scope.** There are no print stylesheets and no printable views.

---

## 18. Non-functional requirements

### 18.1 Targets

| Area | Target |
|---|---|
| Cold start offline | App interactive in **under 3 seconds** on a mid-range phone with no network. |
| Data-entry responsiveness | Every tap registers visually in **under 100 ms**, always local-first. |
| Sync latency | A submitted entry reaches the server **within 2 seconds of the device having connectivity**. Other devices see it on their next 45-second refresh. |
| Scale — district event | ~50 teams, ~120 matches, ~6 entries/match, ~80 fields/entry → **~700 entries and ~57,000 field values per event**. |
| Scale — championship division | ~75 teams, ~110 qualification matches. We attend one division, not eight. |
| Scale — season & multi-season | ~10 events/season → **roughly 6,000–7,000 entries and ~500,000 field values per season**; low hundreds of thousands of rows across seasons. |
| Concurrent users | ~11 peak. |
| Offline window | **One day.** A device is expected to sync at least once every 24 hours. This is a checklist line in `RUNBOOK.md`, not an enforced limit. |
| On-device storage | The **active competition, in full**. Other events are fetched on demand and are unavailable offline. |
| Device baseline | **Android Chrome from the last ~2 years; iOS Safari 16+.** Older devices are unsupported rather than broken-for. |

### 18.2 Database budget

**The Supabase free tier is the operating constraint.**

- **Store raw entries only.** Never persist derived scores or aggregates — the shared engine computes them.
- No photo or pit data.
- Keep DB actions simple: **no materialized views, no heavy triggers, no database-side cron.**
- Delta pulls (§9.3), not full pulls, so refresh traffic stays inside the egress budget.
- Escalate before approaching the size cap.

**Two free-tier risks and their mitigations:**

1. **Inactive-project pause** (~7 days idle) — offline-first means scouting never depends on the database being awake; the twice-weekly `/health` keep-alive (§19.6) and a 48-hour pre-event check cover it.
2. **Size and egress caps** — raw-only storage plus delta pulls keeps a season well within budget.

### 18.3 Security

- Authorization enforced in the **server use-case layer** and surfaced in the UI. **No Postgres RLS, no per-row policies.**
- **No service-role key in the browser**, ever.
- **No user audit log.**
- Passwords are bcrypt-hashed (§7.5); the device-wipe code is explicitly not a secret (§9.9).

### 18.4 Testing strategy

Two tiers. Both run in CI, and a pull request into `main` cannot merge unless both are green.

**Tier 1 — unit tests, on the four places where failure is silent and expensive:**

1. **The metric engine** — wrong numbers are worse than no numbers.
2. **The offline sync / conflict protocol** — impossible to debug at a venue.
3. **Form versioning** — an entry must stay bound to the form version it was recorded against, forever.
4. **Offline draft persistence** — a draft must survive a reload, a crash and a browser restart.

**Tier 2 — a smoke suite: "is the app still wired together?"**

A small set of tests exercising the **real client → server → database path** end to end rather than mocking it, so a broken connection, a renamed environment variable, a missing migration or a dropped route fails the build instead of failing at an event.

It covers: authentication and session · load the active competition · load a form version · **submit an entry and read it back** · run one metric over it · the `/health` endpoint's database read.

- It runs against the **dev Supabase project — never production** — inside a namespaced `CI` season that the suite creates and tears down.
- It is deliberately shallow. It proves the wiring; behaviour is tier 1's job.

**Not automated:** full end-to-end user journeys, UI rendering tests, cross-browser testing. **The real offline path is verified by hand, on a real phone with the network actually off, before every event.**

### 18.5 Privacy

**The only personal datum stored about a user is their full name**, alongside their username. No email, no phone number, no date of birth, no photo.

Disabling a user preserves their entries with authorship intact, so a graduated student's name remains attached to the matches they scouted. Removing the name itself would mean editing history, which we do not do.

**Query use cases return the scouter's name** wherever the app already displays it: entry search, entry preview, and the conflict-review queue.

**Free-text note bodies are not sanitised.** Scouter comments may name students or be uncharitable about other teams. Notes must render in full for the humans reading them. This is a recorded residual with no v1 action.

### 18.6 Backup and retention

**There is no in-app export or restore in v1.**

The pre-event and per-season backup is **manual**: the maintainer runs `supabase db dump` from the CLI and saves the file off-platform. The procedure is written in `docs/ops/SETUP.md`, with checklist lines in `docs/ops/RUNBOOK.md` before every event and at the end of every season.

**Accepted risk, stated plainly:** with no in-app export and no paid backup tier, the only copy of a season's data outside the live database is that manual dump. If nobody runs it, a bad delete or a platform failure loses the season. This is accepted for v1 **on the condition that the dump is a checklist line before every event and at the end of every season**.

**Retention: all seasons stay live. Nothing is auto-pruned.** A season is a few megabytes against a 500 MB tier. "Don't keep much from past years" means *display and on-device* scope, not deletion: the UI defaults to the active season, and only the active competition is held offline. Deliberate deletion of an old season is the admin action in §3.9.

---

## 19. Environments, deployment & operations

### 19.1 Environments

**Three environments: production, preview, local.**

| | Client | Server | Supabase project | Migrations |
|---|---|---|---|---|
| **Production** | Vercel project 1, `main` | Vercel project 2, `main` | **prod** | applied by hand, one CLI command |
| **Preview** (per PR) | auto, per pull request | auto, per pull request | **dev** | inherited from dev |
| **Local** | `pnpm dev` | `pnpm dev` | **dev** | applied by CLI locally |

**Every non-production environment — preview and local — points at the dev Supabase project. Never production.** A half-finished feature must not be able to reach real competition data.

### 19.2 Branch model

| Branch | Role |
|---|---|
| `main` | Deployable / production. Only ever receives reviewed, CI-green merges. |
| `develop` | Integration. Every push runs CI. |
| `feat/<thing>` | One per working session. Cut from `develop`, merged back into `develop`. |

### 19.3 CI

Every push to **`develop`**, and every pull request into **`main`**, runs:

**install (pnpm, cached) → lint → typecheck → apply migrations to dev → unit tests → smoke suite → build both apps**

A pull request into `main` cannot merge unless the run is green.

**From phase 0 until phase 1 ships its use cases, the "smoke suite" step is the `/health` wiring check alone** — deploy reachable, database read succeeds. It grows into the full suite of §18.4 as the use cases it exercises come into existence. The step is present in the pipeline from the first push so it can never be forgotten.

### 19.4 Migrations

- Migrations live in `packages/db` and are applied by the **Supabase CLI**.
- **CI auto-applies them to the dev project** on every push to `develop`.
- **Production is migrated by hand, one deliberate CLI command** — never automatically on merge. A merge on a Friday must not be able to alter the database on a competition Saturday.
- **The production schema is never hand-edited in the Supabase dashboard.** The schema must be reproducible from the repo alone.

### 19.5 Required documentation deliverables

**`docs/ops/SETUP.md`** — the exact, followable procedure for creating the Supabase and Vercel projects from scratch and configuring them to match this spec: project creation and region, which settings to change, how migrations are applied by CLI, which keys to copy where, how the dev and production pairs differ, the **`supabase db dump` backup procedure**, the **new-season checklist** (commit the game image, create the season, create events, publish the forms), the **maintenance/handover checklist**, and an explicit **account transfer checklist**. Written so a student who has never seen the project can stand it up unaided.

**`docs/ops/RUNBOOK.md`** — one page, a checklist not a manual, for venue failures. Written in phase 0, updated after every event. It covers at least:

- Site won't load → roll back in Vercel.
- Sync failing → keep scouting, the data is safe on the device, sync outside the arena.
- Tablet dead or misbehaving → new device, log in, pull the data by QR from the central tablet.
- Conflicts piling up → a lead or admin resolves them.
- Pre-event: run `supabase db dump`; open the app 48 hours before the event and confirm it loads; verify the offline path with the network actually off, on a real phone.
- Daily: confirm every device has synced at least once.

**`docs/ops/ENVIRONMENT.md`** — the committed environment and secrets worksheet: every variable and secret, what it is, where it comes from, which environment it belongs to, an editable column for the non-secret values, and a tick box per item. It carries the standing rule that **no secret value is ever written into the repo or a conversation**. It exists before phase 0 so provisioning has something to work through.

**Two committed `.env.example` files — one per app — are the connection contract**, generated from that worksheet in phase 0. See Appendix B.

### 19.6 Scheduled work

**Exactly one scheduled job in v1.** A **GitHub Action runs twice a week** and calls a **`/health` endpoint on the server — on both the dev and the production deployments**. That endpoint performs **one trivial database read**, which is what actually counts as activity against the free-tier pause.

No Vercel Cron. No background jobs. No database-side scheduling.

### 19.7 Dev seed script

A **manually triggered** command in `packages/db` fills the **dev** project with a fake season, a form with its versions, ~30 teams and ~100 scouting entries, so dev and preview are testable without ever copying real data.

It is **manual by design** and is never run against production. It writes rows directly at the database level and is not a use-case caller (§16.5), which is what lets it run in phase 0 before auth and roles exist.

### 19.8 Account ownership

The Vercel, Supabase and GitHub accounts are currently **personal**, with the intent to hand them to a team-owned account later. Therefore **nothing may depend on a personal identity**: no personal email in code, config, seed data, or as the sole admin of the running app. `SETUP.md` carries an explicit transfer checklist — what to move, in what order, and what breaks if it isn't.

**There is no self-hosted or laptop-at-the-venue deployment.** Offline-first plus QR transfer already covers a venue outage.

---

## 20. Delivery

### 20.1 What v1 is

**v1 = phase 0 + phase 1 + phase 2. Target date 2026-11-20.**

### 20.2 The phases

**Phase 0 — Foundations**

Monorepo scaffold (pnpm + Turborepo, Node 22) → dev and production Supabase projects → **the complete §3 database schema as migrations**, plus the `updated_at` trigger and the generated DB types → the two Vercel projects → `docs/ops/SETUP.md`, `docs/ops/RUNBOOK.md` and the two per-app `.env.example` files generated from `docs/ops/ENVIRONMENT.md` → CI on `develop`, including auto-applying migrations to dev → the `/health` endpoint and its twice-weekly keep-alive → the dev seed script.

**Phase 1 — Core loop (must exist before any event)**

1. **The walking skeleton** (§20.3) — one hardcoded form, offline entry, sync, visible on a laptop. It runs against a **single seeded user, season, event, team and form version created by the phase 0 seed script**, so it needs neither auth nor the management pages to exist.
2. **Auth and roles** — login, the JWT, the caller contract, the permission checks, user administration, offline login and switch-scouter.
3. **Seasons, events, teams, roster, matches** — the admin management page, and the **game-image pipeline**: the committed `public/seasons/<year>/field.webp`, its precache, `seasons.field_image_path`, and the fail-loud missing-image state.
4. **The form builder** — the full field catalogue, semantic metadata, the scoring model editor, versioning, JSON export/import.
5. **Offline data entry** — the entry runtime, drafts, the sticky timer, robot status, undo, **practice mode**.
6. **The sync protocol** — outbox, push, delta pull, hydration, conflicts, **the conflict-review screen and `resolveConflict`**, and **the sync status surface and sync page**.
7. **QR fallback transfer**, plus the **lead-approved device wipe** and the **discarded-records log**.
8. **Browse and search** — team search, entry search, entry preview, the team page.
9. **Basic statistics** — the shared metric engine, the team page's stats, and the **fixed ranking table** of §13.5 (no metric builder, no weighting).
10. **Admin delete** of a season, an event and a form.
11. **The CI smoke suite**, which can only exist once these use cases do.

**Phase 2 — Analysis**

Metric builder and metric storage → the chart and dashboard builder, including the **heatmap, position-scatter and cycle-path renderings** of phase 1's spatial data → the **configurable ranking dashboard, weighting mode and weight-preset builder**, replacing phase 1's fixed table → team compare → match preview → operational statistics → **pick list, do-not-pick list and alliance bracket**.

### 20.3 Build order inside phase 1 — vertical slice first

The first task after phase 0 is **not** a layer. It is the **§1.2 success criterion, end to end and deliberately ugly**: one hardcoded form, filled in on a real phone in airplane mode, synced when the network returns, visible on a laptop.

Only once that walks does phase 1 generalise outwards — auth, then events/teams/matches, then the form builder replacing the hardcoded form, then QR, browse and stats.

### 20.4 Phase gates

A phase is finished when its gate passes, not when the code is written.

| Phase | Gate |
|---|---|
| **0** | Both apps deployed from the repo, migrations applied to both projects, CI green on `develop`, **the `/health` wiring check green** (the full smoke suite arrives with phase 1's use cases), the seed script fills the dev project, and `SETUP.md` has been followed start-to-finish by someone reading it rather than remembering it. |
| **1** | **A student who has never seen the app enters 10 real match entries on a real phone in airplane mode, syncs, and the ranking table is correct.** No help, no coaching, watched not assisted. *(Ten matches of rehearsal data against a real form at a test event — not the practice mode of §8.5, whose entries are never stored, and not `match_type = 'practice'`, which is excluded from aggregates.)* Plus: the full smoke suite green in CI, `RUNBOOK.md` written, and the offline path verified with the network actually off. |
| **2** | A strategy lead builds a metric and a chart unaided, and a pick list survives being edited offline and synced. |

### 20.5 How the build runs

- **The maintainer alone, with Claude Code.** No student developers.
- **One task at a time**, plan mode before each, diff reviewed, tests run, commit.
- **Tasks arrive finished** — each task uses parallel subagents where the work genuinely splits, and ends with an automated review pass before the diff is presented.
- **Tests are written with the task, never after.**
- **Surface:** the Claude Code desktop app.

### 20.6 Schedule checkpoint

**The phase 1 gate should pass by ~2026-10-20**, leaving a month for phase 2.

**If it has not passed by 2026-11-01, phase 2 is cut to the metric builder and the configurable ranking dashboard** — the chart/dashboard builder, compare, match preview, operational statistics and alliance selection all wait. Phase 1's fixed ranking table already works, so a cut ships a usable ranking either way. v1 ships on 2026-11-20 with less analysis rather than late with more.

### 20.7 Fallback if v1 is not ready

Fallback is **Google Sheets**, as used today. **There is no import path**, so anything collected in Sheets during a fallback event **stays in Sheets** and never enters the app's statistics. The event is scouted; it is not scouted into this system.

### 20.8 Scope of `IMPLEMENTATION-PLAN.md`

**Phase 0 and phase 1 in full task detail** — exact file paths, the actual code, the test, the command to run, the expected output, the commit. **Phase 2 as headings only**, re-planned in detail after the phase 1 gate passes.

---

## Appendix A — Explicitly out of scope for v1

Nothing on this list is built. It is here so the plan never re-adds an item by inference.

**Data & integration**

- External data import of any kind — TBA, FRC Events API, or manual file import. No `source` field on entries.
- Official match results (columns exist, are never populated, and their UI is hidden).
- Layer-2 derived statistics: OPR, DPR, CCWM, win rate, average ranking points, schedule strength.
- Scouted-vs-official comparison.
- Schedule-driven scouter assignments.
- Coverage matrix (matches × robot stations).

**Storage & media**

- Photo fields, robot photos, pit photos.
- Supabase Storage; any binary upload; any uploadable field image.
- Generated per-form-version SQL views.

**Sync & realtime**

- Cross-device live push / Supabase Realtime subscriptions.
- Live "match in progress" view.
- Presence.
- Notifications of any kind.
- Device-to-device local-network sync.

**Analysis & output**

- Chart / table / dashboard export (PNG, CSV, Excel, PDF).
- Chart drill-down and click-through.
- Next-year dashboard re-map wizard (v1 renders such dashboards read-only and flags missing fields).
- Full-text notes search.
- Multi-season team-history view.
- Outlier and distribution flagging.
- Scouter reliability score (decided against, not deferred).
- Redundant/double scouting and agreement measurement.
- Bulk-fix tools (bulk match renumbering, shift deletion).

**Product surface**

- Printable views and print stylesheets.
- Blank paper backup form.
- Ordinary light theme (only dark + outdoor high-contrast ship).
- Pit forms, human-player forms, any form kind beyond `match` and `super`.
- Global search omnibox.
- Custom domain.
- Error and usage monitoring.
- In-app export / restore / off-platform backup automation.
- Per-entry edit history; user audit log.
- Self-service password reset.
- Multi-tenant / multi-team support.
- A per-field `show_on_team_card` flag and a per-field "quick summary" flag. The team page (§13.1) is the team view and is built from metrics.
- Per-field per-phase scoring. A field has one score and one phase; a game element scoring differently in two phases is two fields (§4.1).
- Versioning of metrics, of the scoring model, and of the ranking and compare metric sets. All are edited in place.
- Pick-list history and ordering snapshots.

**AI**

- Any MCP endpoint, transport or auth.
- Any LLM API call, AI panel, usage/help agent, prompt engineering or generated insight.
- LLM-suggested field metadata.

---

## Appendix B — Environment & secrets contract

Two committed `.env.example` files are the connection contract. **They hold names and placeholders, never real values.** Each entry documents what it is, where to obtain it, and which environment it belongs to.

**`docs/ops/ENVIRONMENT.md` is the editable worksheet** that tracks provisioning: the same inventory, plus a non-secret value column and a tick box per item. The two `.env.example` files are generated from it in phase 0.

**No secret value is ever written into this repository, a commit message, or a conversation.** A secret exists in exactly two places — the dashboard that issued it and the dashboard that consumes it — and travels between them by copy-paste in a browser. What the build needs from the maintainer is only the **non-secret** identifiers (project refs, deployment URLs) and confirmation that each secret is set. Correctness of a value is proved by running it: the `/health` endpoint and the CI smoke suite (§18.4), never by inspection.

### B.1 `apps/client/.env.example`

**The client holds no Supabase credentials at all — not even the anon key.** All traffic goes through the server API.

| Variable | What it is | Where it comes from | Secret? |
|---|---|---|---|
| `VITE_API_BASE_URL` | Base URL of the server API. | The server's Vercel project URL. Different per environment. | No |
| `VITE_DEVICE_WIPE_CODE` | The constant code a lead types to wipe a device's offline data. | Chosen by the team. | **No — it ships in the bundle. It is an accident guard, not a secret.** |
| `VITE_APP_VERSION` | The version string shown on the context page. | Injected at build time from the git short SHA. | No |

### B.2 `apps/server/.env.example`

**The server holds everything secret. Server-side only, never in a client bundle, never committed.**

| Variable | What it is | Where it comes from | Secret? |
|---|---|---|---|
| `SUPABASE_URL` | Project REST URL. | Supabase dashboard → Project Settings → API. One per project (dev / prod). | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key. Full database access. | Supabase dashboard → Project Settings → API. | **Yes** |
| `AUTH_JWT_SECRET` | HS256 signing secret for session tokens. | Generate: `openssl rand -base64 48`. **Different per environment.** | **Yes** |
| `AUTH_TOKEN_TTL_DAYS` | Session lifetime in days. Default `30`. | Configuration. | No |
| `AUTH_TOKEN_REFRESH_AFTER_DAYS` | Re-issue a token older than this. Default `7`. | Configuration. | No |
| `ALLOWED_ORIGIN` | The client origin permitted by CORS. | The client's Vercel project URL. | No |
| `NODE_ENV` | `development` / `production`. | Set by the platform. | No |

### B.3 GitHub Actions secrets

Required by CI (§19.3), the dev migration step (§19.4) and the keep-alive (§19.6).

| Secret | Used by | Where it comes from |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | `supabase` CLI login in CI. | Supabase dashboard → Account → Access Tokens. |
| `SUPABASE_DEV_PROJECT_REF` | `supabase link` to the dev project. | Supabase dashboard → Project Settings → General. |
| `SUPABASE_DEV_DB_PASSWORD` | `supabase db push` to dev. | Set at dev project creation. |
| `SMOKE_API_BASE_URL` | Smoke suite target (a preview or dev server deployment). | Vercel. |
| `SMOKE_SUPABASE_URL` | Smoke suite setup/teardown of the `CI` season. | Dev project. |
| `SMOKE_SUPABASE_SERVICE_ROLE_KEY` | Same. | Dev project. |
| `HEALTHCHECK_DEV_URL` | Keep-alive target. | `https://<dev-server>/health` |
| `HEALTHCHECK_PROD_URL` | Keep-alive target. | `https://<prod-server>/health` |

### B.4 Vercel environment variables

Set per project, per environment, in the Vercel dashboard.

| Project | Environment | Variables |
|---|---|---|
| Client | Production | `VITE_API_BASE_URL` → production server, `VITE_DEVICE_WIPE_CODE`, `VITE_APP_VERSION` |
| Client | Preview | `VITE_API_BASE_URL` → preview/dev server, `VITE_DEVICE_WIPE_CODE`, `VITE_APP_VERSION` |
| Server | Production | The whole B.2 list, pointed at the **prod** Supabase project |
| Server | Preview | The whole B.2 list, pointed at the **dev** Supabase project |

### B.5 Local-only

| Item | Purpose |
|---|---|
| The dev Supabase database connection string | Running `supabase db dump` for the manual backup, and local migrations. Kept in the maintainer's own environment, never committed. |

---

## Appendix C — Use-case inventory

The starting registry for phase 1. Every entry carries a Zod input schema, a Zod output schema and a plain-language description, and takes `caller` as its first argument.

### Queries (a `service` caller may call these)

| Use case | Returns |
|---|---|
| `getActiveContext` | The active season and event from `app_settings`. |
| `syncPull` | Delta or full dataset for one event since a watermark, including tombstones. Paged (§9.3). |
| `listSeasons` / `listEvents` / `listTeams` / `listMatches` / `listEventRoster` | Bounded, paginated. |
| `listUsers` | Users for the picker, the admin table and the offline cache. Excludes disabled users unless asked. Never returns `password_hash` except on the `syncPull` path. |
| `searchTeams` | Season-wide team search with active-event rank badges. |
| `listTeamEvents` | The events a team has entries at — powers the cross-event jump of §13.2. |
| `queryEntries` | Entry search for one event, filtered and paginated. |
| `getEntry` | One entry, fully rendered with derived score and scouter name. |
| `getForm` / `getFormVersion` / `getFormDictionary` | Form definition and the machine-readable field dictionary. |
| `getTeamStats` | All metrics for one team over a scope, plus the match-by-match series and its notes. |
| `rankTeams` | The ranking table, with optional weighted composite and contribution breakdown. |
| `compareTeams` | 2–6 teams over the compare metric set. |
| `getMatchPreview` | Six teams, key metrics, prediction, reliability flags. |
| `getOperationalStats` | The meta-metric catalogue over a scope. |
| `listConflicts` | The review queue with both copies and a diff. |
| `listMetrics` / `getMetric` | Metric definitions for a season. |
| `listDashboards` / `getDashboard` | Dashboard configs for a season. |
| `listWeightPresets` | Presets for the ranking page and pick-list seeding. |
| `getPickLists` / `getDoNotPick` / `getAllianceBracket` | The three alliance-selection surfaces for an event. |
| `health` | One trivial database read. |

### Commands (a `service` caller is rejected by all of these)

| Use case | Role |
|---|---|
| `login` / `refreshToken` | **No caller** — these produce one (§16.5). Rate-limited by username. |
| `changeOwnPassword` | any authenticated user, own account only |
| `createUser` / `setUserRole` / `resetPassword` / `disableUser` | admin |
| `createSeason` / `updateSeason` / `setActiveSeason` / `deleteSeason` | admin |
| `createEvent` / `updateEvent` / `reorderEvents` / `setActiveEvent` / `deleteEvent` | admin |
| `createTeam` / `updateTeam` / `setEventRoster` | admin |
| `createMatch` / `updateMatch` / `setMatchTeams` / `deleteMatch` | admin |
| **`ensureMatch`** | **any authenticated user** — the bare auto-creation of §6.4. Creates event + type + number only; a no-op if the match exists. |
| `createForm` / `updateForm` / `publishFormVersion` / `restoreFormVersion` / `deleteForm` / `deleteFormVersion` | admin |
| `setScoringRules` | admin |
| `upsertEntry` | scouter (own, ≤ 5 min) / lead / admin |
| `deleteEntry` | lead / admin |
| `resolveConflict` | lead / admin |
| `createMetric` / `updateMetric` / `deleteMetric` | admin |
| `saveDashboard` / `updateDashboard` / `deleteDashboard` | admin |
| `saveWeightPreset` / `deleteWeightPreset` | admin |
| `createPickList` / `setPickListOrder` / `reseedPickList` | admin |
| `addPickListEntry` / `removePickListEntry` / `setPickListNote` | admin |
| `addDoNotPick` | lead / admin |
| `editDoNotPick` / `removeDoNotPick` | admin |
| `initialiseBracket` / `setAllianceSlot` / `recordDecline` / `removeDecline` | admin |
| `syncPush` | any authenticated, non-disabled user — **per-operation authorization against `author_user_id`** (§7.5) |

---

## Appendix D — Open items carried into the plan

Every one of these is a decision that was **made** during consolidation because the living spec left it unstated. They are listed so the plan can surface them rather than bury them.

| # | Item | Decision taken | Where |
|---|---|---|---|
| D1 | Password hashing algorithm | bcrypt cost 10 via `bcryptjs` — no native build on Vercel | §7.5 |
| D2 | Session token format and lifetime | HS256 JWT, 30-day sliding, refreshed after 7 days, stored in IndexedDB | §7.5 |
| D3 | Offline credential caching | bcrypt hashes cached on-device; accepted risk stated | §7.5 |
| D4 | Server-side enforcement of the 5-minute window | Enforced, using the client timestamps carried on the mutation | §7.6 |
| D5 | Pull protocol | First pull full, then delta by `updated_at` watermark with a 5-second overlap | §9.3 |
| D6 | Duplicate-entry storage | Non-unique detection index; both rows kept and flagged; latest `client_updated_at` wins for metrics | §3.5, §9.5, §11.6 |
| D7 | Superseded-copy storage | A `sync_conflicts` table holding the full losing payload | §3.6 |
| D8 | `broke_down` time | Its own `breakdown_seconds` column, not encoded in the status | §3.5 |
| D9 | Match-timer configuration location | `forms.timer_config`, edited in place, no new version | §3.3, §8.4 |
| D10 | Cross-version type change | Metric refuses with an explicit message rather than mixing types | §11.7 |
| D11 | Practice-mode drafts | A separate IndexedDB store, cleared on exit from practice mode | §8.5 |
| D12 | QR encoding parameters | fflate deflate, 2,300-byte frames, QR v40/EC-M byte mode, cyclic repeat at 5 fps, 200-op batch cap | §9.8 |
| D13 | Device wipe code | `VITE_DEVICE_WIPE_CODE`, explicitly not a secret | §9.9 |
| D14 | Disposal of QR copies | **On cloud ack, with no TTL** — never before the ack, plus a manual "discard received QR data" action guarded the same way as the device wipe | §9.8 |
| D15 | Parent-deleted records | Client hard-deletes, but raises a notice naming exactly what was discarded and logs it locally | §9.7 |
| D16 | User deletion | Implemented as `disabled_at`, so authorship survives | §3.2, §7.3 |
| D17 | Super-scouting coverage denominator | Teams with a recorded entry, not matches — follows from (team, event) cardinality | §12.7 |
| D18 | Ranking table phasing | Phase 1 ships a **fixed** ranking table; the configurable, weighted one arrives in phase 2 with the metric builder it depends on | §13.5, §20.2, §20.6 |
| D19 | Event roster | A first-class `event_teams` table with an admin surface. Nothing previously modelled "which teams are at this event", which the rank badges, the robot picker and the coverage metric all need | §3.1, §6.4 |
| D20 | Match membership | Normalized into `match_teams` rather than six nullable columns, so "which matches contain team X" is one indexed lookup | §3.1 |
| D21 | Active context storage | An `app_settings` singleton, not a flag on `events` — the only shape that can express "a season is active but has no events yet" | §3.1, §6.3 |
| D22 | Bare match auto-creation | A system action available to every role, offline included, distinct from admin match management. Without it a scouter cannot record an unlisted match at a venue | §6.4, §8.1 |
| D23 | Conflict storage | One `sync_conflicts` table keyed by `(entity, row_id)`, so a pick-list ordering conflict has somewhere to live. `conflict_state` on the entry is dropped; open-conflict status is derived | §3.6, §9.5 |
| D24 | Shared-device push authorization | Each operation carries `author_user_id` and is authorized against it, not against the bearer | §7.5, §9.4 |
| D25 | Divergence winner | The copy with the greater `client_updated_at`, matching the duplicate rule — not whichever arrived first | §9.5 |
| D26 | Outbox coalescing | At most one pending operation per row, keeping the earliest `base_version` and the latest payload | §9.4 |
| D27 | `updated_at` triggers | A one-line `BEFORE UPDATE` trigger on every table. Without it the delta pull silently misses every edit and every tombstone | §3.10 |
| D28 | Qualification-only is absolute | `match_types` is removed from the metric filter and applies only to entry-listing charts | §11.2, §12.1 |
| D29 | Session-only event override | Served by server-computed results, never cached; entry creation is blocked while an override is in effect | §6.3 |
| D30 | Smoke suite phasing | Phase 0's gate is the `/health` wiring check; the full suite arrives with phase 1's use cases but the CI step exists from the first push | §19.3, §20.4 |
| D31 | Alliance-slot clearing | `team_id = null`, never a soft delete, so the unique `(alliance_id, slot)` constraint can never block a correction | §3.8, §14.6 |
| D32 | Phase 1 gate wording | "10 practice matches" means ten rehearsal entries against a real form — not §8.5 practice mode, and not `match_type = 'practice'` | §20.4 |
