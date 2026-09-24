// src/handler.ts
import { handle } from "hono/vercel";

// src/app.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
function createApp(deps) {
  const app2 = new Hono();
  app2.use(
    "*",
    cors({
      origin: deps.config.allowedOrigin,
      allowHeaders: ["Content-Type", "Authorization"],
      exposeHeaders: ["X-Refreshed-Token"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      maxAge: 86400
    })
  );
  app2.get("/health", async (c) => {
    try {
      await deps.pingDatabase();
      return c.json({ status: "ok", database: "ok", time: (/* @__PURE__ */ new Date()).toISOString() });
    } catch (e) {
      return c.json(
        { status: "error", database: "error", message: e instanceof Error ? e.message : "unknown" },
        503
      );
    }
  });
  for (const route of deps.routes ?? []) app2.route("/", route);
  app2.notFound((c) => c.json({ error: { code: "not-found", message: "no such route" } }, 404));
  return app2;
}

// src/auth/token.ts
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
var sessionClaims = z.object({
  sub: z.string().min(1),
  role: z.enum(["scouter", "lead", "admin"]),
  username: z.string().min(1),
  iat: z.number().int(),
  exp: z.number().int()
});
var key = (config2) => new TextEncoder().encode(config2.authJwtSecret);
async function issueToken(user, config2) {
  const iat = Math.floor(Date.now() / 1e3);
  return new SignJWT({ role: user.role, username: user.username }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuedAt(iat).setExpirationTime(iat + config2.tokenTtlDays * 86400).sign(key(config2));
}
async function verifyToken(raw, config2) {
  const { payload } = await jwtVerify(raw, key(config2), { algorithms: ["HS256"] });
  const parsed = sessionClaims.safeParse(payload);
  if (!parsed.success) throw new Error("session token claims are malformed");
  return parsed.data;
}
function shouldRefresh(claims, config2, now = Date.now) {
  const ageDays = (now() / 1e3 - claims.iat) / 86400;
  return ageDays > config2.tokenRefreshAfterDays;
}

// src/auth/callerFor.ts
var BEARER = /^bearer (\S+)$/i;
var NONE = { caller: null, refreshedToken: null };
async function callerFor(request, config2, store, options = {}) {
  const raw = BEARER.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!raw) return NONE;
  let claims;
  try {
    claims = await verifyToken(raw, config2);
  } catch {
    return NONE;
  }
  const user = await store.getUser(claims.sub);
  if (!user || user.disabled_at !== null) return NONE;
  const refreshedToken = shouldRefresh(claims, config2, options.now) ? await issueToken({ id: user.id, username: claims.username, role: user.role }, config2) : null;
  return { caller: { kind: "user", userId: user.id, role: user.role }, refreshedToken };
}

// src/config.ts
import { z as z2 } from "zod";
var schema = z2.object({
  SUPABASE_URL: z2.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z2.string().min(1),
  AUTH_JWT_SECRET: z2.string().min(32, "must be at least 32 characters"),
  AUTH_TOKEN_TTL_DAYS: z2.coerce.number().int().positive().default(30),
  AUTH_TOKEN_REFRESH_AFTER_DAYS: z2.coerce.number().int().positive().default(7),
  ALLOWED_ORIGIN: z2.string().url(),
  NODE_ENV: z2.enum(["development", "production", "test"]).default("development")
});
function loadServerConfig(env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(
      `Server environment is not usable. Fix these variables (see docs/ops/ENVIRONMENT.md):
${lines.join("\n")}`
    );
  }
  const v = parsed.data;
  return {
    supabaseUrl: v.SUPABASE_URL,
    supabaseServiceRoleKey: v.SUPABASE_SERVICE_ROLE_KEY,
    authJwtSecret: v.AUTH_JWT_SECRET,
    tokenTtlDays: v.AUTH_TOKEN_TTL_DAYS,
    tokenRefreshAfterDays: v.AUTH_TOKEN_REFRESH_AFTER_DAYS,
    allowedOrigin: v.ALLOWED_ORIGIN,
    nodeEnv: v.NODE_ENV,
    isProduction: v.NODE_ENV === "production"
  };
}
var cached = null;
function serverConfig() {
  cached ??= loadServerConfig(process.env);
  return cached;
}

// src/db/client.ts
import { createClient } from "@supabase/supabase-js";
var cached2 = null;
function getServiceClient(config2) {
  cached2 ??= createClient(config2.supabaseUrl, config2.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return cached2;
}

// src/db/ping.ts
function makePingDatabase(config2) {
  return async () => {
    const { error } = await getServiceClient(config2).from("app_settings").select("id").limit(1);
    if (error) throw new Error(error.message);
  };
}

// src/repos/pull.ts
var PULL_SCOPES = {
  app_settings: { table: "app_settings", kind: "settings" },
  seasons: { table: "seasons", kind: "season", column: "id" },
  events: { table: "events", kind: "event", column: "id" },
  // SPEC-FINAL 9.2: every team in the SEASON — the global rows for every team that
  // appears on any of the season's rosters or entries, not the whole registry.
  teams: { table: "teams", kind: "season-teams" },
  event_teams: { table: "event_teams", kind: "event", column: "event_id" },
  matches: { table: "matches", kind: "event", column: "event_id" },
  match_teams: { table: "match_teams", kind: "event", column: "match_id" },
  forms: { table: "forms", kind: "season", column: "season_id" },
  form_versions: { table: "form_versions", kind: "season", column: "form_id" },
  form_fields: { table: "form_fields", kind: "season", column: "form_version_id" },
  scoring_rules: { table: "scoring_rules", kind: "season", column: "form_id" },
  users: { table: "users", kind: "global" },
  scouting_entries: { table: "scouting_entries", kind: "event", column: "event_id" },
  sync_conflicts: { table: "sync_conflicts", kind: "event", column: "event_id" },
  pick_lists: { table: "pick_lists", kind: "event", column: "event_id" },
  pick_list_entries: { table: "pick_list_entries", kind: "event", column: "pick_list_id" },
  do_not_pick: { table: "do_not_pick", kind: "event", column: "event_id" },
  alliances: { table: "alliances", kind: "event", column: "event_id" },
  alliance_slots: { table: "alliance_slots", kind: "event", column: "alliance_id" },
  alliance_declines: { table: "alliance_declines", kind: "event", column: "alliance_id" },
  metrics: { table: "metrics", kind: "season", column: "season_id" },
  dashboards: { table: "dashboards", kind: "season", column: "season_id" },
  dashboard_charts: { table: "dashboard_charts", kind: "season", column: "dashboard_id" },
  weight_presets: { table: "weight_presets", kind: "season", column: "season_id" }
};
async function parentIds(db, key2, scope) {
  switch (key2) {
    case "match_teams": {
      const { data } = await db.from("matches").select("id").eq("event_id", scope.eventId);
      return (data ?? []).map((r) => r.id);
    }
    case "form_versions":
    case "scoring_rules": {
      const { data } = await db.from("forms").select("id").eq("season_id", scope.seasonId);
      return (data ?? []).map((r) => r.id);
    }
    case "form_fields": {
      const { data: forms } = await db.from("forms").select("id").eq("season_id", scope.seasonId);
      const { data } = await db.from("form_versions").select("id").in(
        "form_id",
        (forms ?? []).map((r) => r.id)
      );
      return (data ?? []).map((r) => r.id);
    }
    case "pick_list_entries": {
      const { data } = await db.from("pick_lists").select("id").eq("event_id", scope.eventId);
      return (data ?? []).map((r) => r.id);
    }
    case "alliance_slots":
    case "alliance_declines": {
      const { data } = await db.from("alliances").select("id").eq("event_id", scope.eventId);
      return (data ?? []).map((r) => r.id);
    }
    case "dashboard_charts": {
      const { data } = await db.from("dashboards").select("id").eq("season_id", scope.seasonId);
      return (data ?? []).map((r) => r.id);
    }
    case "teams": {
      const { data: events } = await db.from("events").select("id").eq("season_id", scope.seasonId);
      const eventIds = (events ?? []).map((r) => r.id);
      const [roster, entries] = await Promise.all([
        db.from("event_teams").select("team_id").in("event_id", eventIds),
        db.from("scouting_entries").select("team_id").in("event_id", eventIds)
      ]);
      return [
        .../* @__PURE__ */ new Set([
          ...(roster.data ?? []).map((r) => r.team_id),
          ...(entries.data ?? []).map((r) => r.team_id)
        ])
      ];
    }
    default:
      return null;
  }
}
function supabasePullEntity(db) {
  return async (key2, scope, since, offset, limit) => {
    const spec = PULL_SCOPES[key2];
    if (!spec) return [];
    let query = db.from(spec.table).select("*").order("updated_at", { ascending: true }).range(offset, offset + limit - 1);
    if (since !== void 0) query = query.gt("updated_at", since);
    const ids = await parentIds(db, key2, scope);
    if (ids !== null) {
      query = query.in(spec.kind === "season-teams" ? "id" : spec.column ?? "id", ids);
    } else if (spec.kind === "event") {
      query = query.eq(spec.column ?? "event_id", scope.eventId);
    } else if (spec.kind === "season") {
      query = query.eq(spec.column ?? "season_id", scope.seasonId);
    }
    const { data, error } = await query;
    if (error) throw new Error(`${key2}: ${error.message}`);
    return data ?? [];
  };
}

// src/repos/store.ts
var TABLE = {
  scouting_entry: "scouting_entries",
  match: "matches",
  pick_list: "pick_lists",
  pick_list_entry: "pick_list_entries",
  do_not_pick: "do_not_pick",
  alliance_slot: "alliance_slots",
  alliance_decline: "alliance_declines"
};
function supabaseStore(db) {
  const pullEntity = supabasePullEntity(db);
  return {
    async getUser(id) {
      const { data, error } = await db.from("users").select("id, role, disabled_at").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },
    async getFullUser(id) {
      const { data, error } = await db.from("users").select(
        "id, username, full_name, password_hash, role, must_change_password, disabled_at, created_at"
      ).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },
    async getUserByUsername(usernameLower) {
      const { data, error } = await db.from("users").select(
        "id, username, full_name, password_hash, role, must_change_password, disabled_at, created_at"
      ).ilike("username", escapeLikePattern(usernameLower)).limit(10);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      return rows.find((row) => row.username.toLowerCase() === usernameLower) ?? null;
    },
    async wasApplied(opId) {
      const { data } = await db.from("applied_operations").select("op_id").eq("op_id", opId).maybeSingle();
      return data !== null;
    },
    async markApplied(opId) {
      await db.from("applied_operations").insert({ op_id: opId });
    },
    async getRow(entity, id) {
      const { data } = await db.from(TABLE[entity]).select("*").eq("id", id).maybeSingle();
      return data ?? null;
    },
    async putRow(entity, id, row) {
      const { error } = await db.from(TABLE[entity]).upsert({ ...row, id });
      if (error) throw new Error(error.message);
    },
    async getFormFields(formVersionId) {
      const { data } = await db.from("form_fields").select("*").eq("form_version_id", formVersionId);
      return data ?? [];
    },
    async eventExists(eventId) {
      const { data } = await db.from("events").select("id").eq("id", eventId).maybeSingle();
      return data !== null;
    },
    async resolveScope(eventId) {
      const { data, error } = await db.from("events").select("id, season_id").eq("id", eventId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error(`resolveScope: event ${eventId} not found`);
      return { eventId: data.id, seasonId: data.season_id };
    },
    pullEntity,
    // The other 59 methods start as loud stubs, exactly as the fake does. Each later
    // task replaces the two or three it needs. `supabaseStore` is typed `: Store`, so
    // without these the file does not compile at all.
    ...stubsFor([
      "findByLogicalKey",
      "parentsExist",
      "insertConflict",
      "listConflicts",
      "getConflict",
      "resolveConflictRow",
      "insertUser",
      "updateUser",
      "listUsers",
      "countEnabledAdmins",
      "getActiveContext",
      "setActiveContext",
      "getSeason",
      "getSeasonByYear",
      "insertSeason",
      "updateSeason",
      "listSeasons",
      "getEvent",
      "insertEvent",
      "updateEvent",
      "listEvents",
      "getTeam",
      "getTeamByNumber",
      "insertTeam",
      "updateTeam",
      "listTeams",
      "getRoster",
      "setRoster",
      "findMatch",
      "insertMatch",
      "listMatches",
      "setMatchTeams",
      "countEntriesByMatch",
      "countEntriesBySeason",
      "deleteMatch",
      "getForm",
      "getFormByKind",
      "insertForm",
      "updateForm",
      "getFormVersion",
      "listFormVersions",
      "insertFormVersion",
      "updateFormVersion",
      "countEntriesByFormVersion",
      "replaceFormFields",
      "getScoringRules",
      "replaceScoringRules",
      "getEntry",
      "queryEntries",
      "entriesForScope",
      "listTeamEvents",
      "deleteSeason",
      "deleteEvent",
      "deleteFormCascade",
      "deleteFormVersion",
      "countDeleteImpact"
    ])
    // The spread above only carries an index signature (its keys come from a plain
    // string[]), so TS can't see that it supplies the other 59 named Store methods;
    // the assertion tells it what `stubsFor` guarantees at runtime instead.
  };
}
function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, "_");
}
function stubsFor(names) {
  return Object.fromEntries(
    names.map((name) => [
      name,
      async () => {
        throw new Error(`Store.${name} is not implemented yet \u2014 it lands with its own task`);
      }
    ])
  );
}

// src/routes/rpc.ts
import { Hono as Hono2 } from "hono";

// ../../packages/shared/src/api/auth.ts
import { z as z3 } from "zod";
var loginInput = z3.object({
  username: z3.string().min(1),
  password: z3.string().min(1)
});
var loginOutput = z3.object({
  token: z3.string(),
  user: z3.object({
    id: z3.string().uuid(),
    username: z3.string(),
    full_name: z3.string(),
    role: z3.enum(["scouter", "lead", "admin"]),
    must_change_password: z3.boolean()
  })
});
var refreshTokenInput = z3.object({ token: z3.string().min(1) });

// ../../packages/shared/src/errors.ts
var AppError = class extends Error {
  code;
  details;
  constructor(code, message, details) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
};

// ../../packages/shared/src/caller.ts
function isUser(caller) {
  return caller.kind === "user";
}

// ../../packages/shared/src/forms/entryShape.ts
function validateEntryShape(row) {
  const issues = [];
  if (row.form_kind === "match") {
    if (row.match_id === null) issues.push("a match entry needs a match");
    if (row.alliance === null) issues.push("a match entry needs an alliance");
    if (row.robot_status === null) issues.push("a match entry needs a robot status");
  } else {
    if (row.match_id !== null) issues.push("a super entry has no match");
    if (row.alliance !== null) issues.push("a super entry has no alliance");
    if (row.robot_status !== null) issues.push("a super entry has no robot status");
    if (row.breakdown_seconds !== null) issues.push("a super entry has no breakdown time");
  }
  const brokeDown = row.robot_status === "broke_down";
  if (brokeDown && row.breakdown_seconds === null) {
    issues.push("a robot that broke down needs its breakdown time in seconds");
  }
  if (!brokeDown && row.breakdown_seconds !== null) {
    issues.push("breakdown time is recorded only when the robot broke down");
  }
  return issues;
}

// ../../packages/shared/src/forms/types.ts
function selectOptions(field) {
  const raw = field.config.options;
  return Array.isArray(raw) ? raw : [];
}

// ../../packages/shared/src/forms/validate.ts
function isDeadRobot(status) {
  return status === "no_show" || status === "disabled";
}
function validateEntryData(fields, robotStatus, data) {
  const issues = [];
  if (isDeadRobot(robotStatus)) {
    if (Object.keys(data).length > 0) {
      issues.push({
        field_key: "*",
        code: "dead-robot-has-data",
        message: "a no-show or disabled robot records no field values, never zeros"
      });
    }
    return issues.length === 0 ? { ok: true } : { ok: false, issues };
  }
  const live = fields.filter((f) => !f.deprecated);
  const known = new Set(live.map((f) => f.key));
  for (const key2 of Object.keys(data)) {
    if (!known.has(key2)) {
      issues.push({ field_key: key2, code: "unknown-field", message: `no field with key '${key2}'` });
    }
  }
  for (const field of live) {
    const value = data[field.key];
    const missing = value === void 0 || value === null || value === "";
    if (missing) {
      if (field.required) {
        issues.push({
          field_key: field.key,
          code: "required",
          message: `${field.label} is required`
        });
      }
      continue;
    }
    switch (field.type) {
      case "counter": {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          issues.push({
            field_key: field.key,
            code: "wrong-type",
            message: `${field.label} must be a number`
          });
          break;
        }
        const min = typeof field.config.min === "number" ? field.config.min : void 0;
        const max = typeof field.config.max === "number" ? field.config.max : void 0;
        if (min !== void 0 && value < min || max !== void 0 && value > max) {
          issues.push({
            field_key: field.key,
            code: "out-of-config-range",
            message: `${field.label} must be between ${min ?? "-\u221E"} and ${max ?? "\u221E"}`
          });
          break;
        }
        if (field.expected_range) {
          const { min: lo, max: hi } = field.expected_range;
          if (value < lo || value > hi) {
            issues.push({
              field_key: field.key,
              code: "out-of-expected-range",
              message: `${field.label} is outside its expected range (${lo}\u2013${hi})`
            });
          }
        }
        break;
      }
      case "toggle": {
        if (typeof value !== "boolean") {
          issues.push({
            field_key: field.key,
            code: "wrong-type",
            message: `${field.label} must be true or false`
          });
        }
        break;
      }
      case "single_select": {
        const allowed = selectOptions(field).map((o) => o.value);
        if (typeof value !== "string" || !allowed.includes(value)) {
          issues.push({
            field_key: field.key,
            code: "not-an-option",
            message: `${field.label} must be one of: ${allowed.join(", ")}`
          });
        }
        break;
      }
      case "long_text": {
        if (typeof value !== "string") {
          issues.push({
            field_key: field.key,
            code: "wrong-type",
            message: `${field.label} must be text`
          });
        }
        break;
      }
    }
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

// ../../packages/shared/src/sync/operation.ts
import { z as z4 } from "zod";
var SYNC_ENTITIES = [
  "scouting_entry",
  "match",
  "pick_list",
  "pick_list_entry",
  "do_not_pick",
  "alliance_slot",
  "alliance_decline"
];
var isoDateTime = z4.string().datetime({ offset: false });
var operationSchema = z4.object({
  op_id: z4.string().min(1),
  entity: z4.enum(SYNC_ENTITIES),
  row_id: z4.string().uuid(),
  action: z4.enum(["create", "update", "delete"]),
  base_version: z4.number().int().positive().nullable(),
  /** Always the whole row, never a patch. Field-level merging does not exist. */
  payload: z4.record(z4.unknown()),
  author_user_id: z4.string().uuid(),
  client_created_at: isoDateTime,
  client_updated_at: isoDateTime,
  seq: z4.number().int().nonnegative()
}).superRefine((op, ctx) => {
  if (op.action === "create" && op.base_version !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["base_version"],
      message: "a create has no base version"
    });
  }
  if (op.action !== "create" && op.base_version === null) {
    ctx.addIssue({
      code: "custom",
      path: ["base_version"],
      message: "an edit must name its base version"
    });
  }
  if (op.action === "delete" && Object.keys(op.payload).length > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["payload"],
      message: "a delete carries an empty payload"
    });
  }
});

// ../../packages/shared/src/sync/protocol.ts
import { z as z5 } from "zod";
var MAX_OPERATIONS_PER_PUSH = 200;
var WATERMARK_OVERLAP_MS = 5e3;
var pushRequestSchema = z5.object({
  device_id: z5.string().uuid(),
  operations: z5.array(operationSchema).max(MAX_OPERATIONS_PER_PUSH)
});
var PULL_ENTITY_KEYS = [
  "app_settings",
  "seasons",
  "events",
  "teams",
  "event_teams",
  "matches",
  "match_teams",
  "forms",
  "form_versions",
  "form_fields",
  "scoring_rules",
  "users",
  "scouting_entries",
  "sync_conflicts",
  "pick_lists",
  "pick_list_entries",
  "do_not_pick",
  "alliances",
  "alliance_slots",
  "alliance_declines",
  "metrics",
  "dashboards",
  "dashboard_charts",
  "weight_presets"
];
var pullRequestSchema = z5.object({
  event_id: z5.string().uuid(),
  since: z5.string().datetime({ offset: false }).optional(),
  cursor: z5.string().optional()
});

// src/auth/password.ts
import bcrypt from "bcryptjs";
var DUMMY_PASSWORD_HASH = "$2a$10$7VlgGGLSP5BKhfpuSwH9tu9Fnsni7TeRAUC5VcJocBS2rWdIZotAm";
async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// src/auth/rateLimit.ts
function makeRateLimiter(options) {
  const now = options.now ?? (() => Date.now());
  const hits = /* @__PURE__ */ new Map();
  return {
    take(key2) {
      const cutoff = now() - options.windowMs;
      const recent = (hits.get(key2) ?? []).filter((t) => t > cutoff);
      if (recent.length >= options.limit) {
        hits.set(key2, recent);
        return false;
      }
      recent.push(now());
      hits.set(key2, recent);
      return true;
    },
    reset() {
      hits.clear();
    }
  };
}

// src/core/commands/login.ts
var loginLimiter = makeRateLimiter({ limit: 10, windowMs: 5 * 6e4 });
async function login(input, ctx, config2) {
  const username = input.username.trim().toLowerCase();
  if (!loginLimiter.take(username)) {
    throw new AppError("rate-limited", "too many attempts; wait a few minutes and try again");
  }
  const user = await ctx.store.getUserByUsername(username);
  const matches = await verifyPassword(input.password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!user || !matches) {
    throw new AppError("unauthenticated", "that username and password do not match");
  }
  if (user.disabled_at !== null) {
    throw new AppError("forbidden", "this account has been disabled; ask an admin");
  }
  return {
    token: await issueToken({ id: user.id, username: user.username, role: user.role }, config2),
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      must_change_password: user.must_change_password
    }
  };
}

// src/core/commands/refreshToken.ts
async function refreshToken(input, ctx, config2) {
  let claims;
  try {
    claims = await verifyToken(input.token, config2);
  } catch {
    throw new AppError("unauthenticated", "that session has expired; sign in again");
  }
  if (!loginLimiter.take(claims.username.toLowerCase())) {
    throw new AppError("rate-limited", "too many attempts; wait a few minutes and try again");
  }
  const user = await ctx.store.getFullUser(claims.sub);
  if (!user) throw new AppError("unauthenticated", "that session is no longer valid");
  if (user.disabled_at !== null) {
    throw new AppError("forbidden", "this account has been disabled; ask an admin");
  }
  return {
    token: await issueToken({ id: user.id, username: user.username, role: user.role }, config2),
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      must_change_password: user.must_change_password
    }
  };
}

// src/routes/registry.ts
var REGISTRY = {
  login: {
    kind: "command",
    description: "Exchange a username and password for a 30-day session token. Takes no caller \u2014 it produces one. Rate-limited by username.",
    input: loginInput,
    output: loginOutput,
    unauthenticated: true,
    handler: login
  },
  refreshToken: {
    kind: "command",
    description: "Exchange a still-valid session token for a fresh one. Takes no caller \u2014 it produces one. Rate-limited by username.",
    input: refreshTokenInput,
    output: loginOutput,
    unauthenticated: true,
    handler: refreshToken
  }
};

// src/routes/rpc.ts
var STATUS = {
  invalid: 400,
  unauthenticated: 401,
  forbidden: 403,
  "not-found": 404,
  conflict: 409,
  "rate-limited": 429,
  "parent-deleted": 409,
  "edit-window-expired": 409,
  "offline-unavailable": 503
};
function rpcRoutes(ctx, config2, registry = REGISTRY) {
  const app2 = new Hono2();
  for (const [name, entry] of Object.entries(registry)) {
    app2.post(`/api/${name}`, async (c) => {
      try {
        let invoke;
        if (entry.unauthenticated) {
          const handler = entry.handler;
          invoke = (input) => handler(input, ctx, config2);
        } else {
          const handler = entry.handler;
          const { caller, refreshedToken } = await callerFor(c.req.raw, config2, ctx.store);
          if (!caller) {
            return c.json({ error: { code: "unauthenticated", message: "sign in again" } }, 401);
          }
          if (refreshedToken) c.header("X-Refreshed-Token", refreshedToken);
          invoke = (input) => handler(caller, input, ctx, config2);
        }
        const body = await c.req.json().catch(() => void 0);
        const parsedInput = entry.input.safeParse(body);
        if (!parsedInput.success) {
          return c.json({ error: { code: "invalid", message: parsedInput.error.message } }, 400);
        }
        const output = await invoke(parsedInput.data);
        return c.json(entry.output.parse(output));
      } catch (e) {
        if (e instanceof AppError) {
          return c.json(
            { error: { code: e.code, message: e.message, details: e.details } },
            STATUS[e.code] ?? 500
          );
        }
        console.error(`${name} failed`, e);
        return c.json({ error: { code: "invalid", message: "that did not work" } }, 500);
      }
    });
  }
  return app2;
}

// src/routes/sync.ts
import { Hono as Hono3 } from "hono";

// src/core/commands/syncPush.ts
var rejected = (opId, reason, detail) => detail === void 0 ? { op_id: opId, status: "rejected", reason } : { op_id: opId, status: "rejected", reason, detail };
async function syncPush(caller, input, ctx) {
  const ordered = [...input.operations].sort((a, b) => a.seq - b.seq);
  const results = [];
  for (const op of ordered) {
    try {
      results.push(await applyOne(caller, op, ctx));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push(rejected(op.op_id, "invalid", `unexpected server error: ${message}`));
    }
  }
  return { results };
}
async function applyOne(caller, op, ctx) {
  if (!isUser(caller)) return rejected(op.op_id, "forbidden", "a service caller may not push");
  const author = await ctx.store.getUser(op.author_user_id);
  if (!author) return rejected(op.op_id, "forbidden", "unknown author");
  if (author.disabled_at !== null) return rejected(op.op_id, "forbidden", "the author is disabled");
  if (await ctx.store.wasApplied(op.op_id)) {
    if (op.entity === "match") {
      return { op_id: op.op_id, status: "noop", row_id: op.row_id, new_version: 1 };
    }
    const existing = await ctx.store.getRow(op.entity, op.row_id);
    return {
      op_id: op.op_id,
      status: "noop",
      row_id: op.row_id,
      new_version: existing?.version ?? 1
    };
  }
  if (op.entity === "match") return applyBareMatch(op, ctx);
  if (op.entity !== "scouting_entry") {
    return rejected(op.op_id, "invalid", `entity '${op.entity}' is not accepted yet`);
  }
  return applyEntry(op, ctx);
}
async function applyBareMatch(op, ctx) {
  const existing = await ctx.store.getRow("match", op.row_id);
  if (existing) {
    await ctx.store.markApplied(op.op_id);
    return { op_id: op.op_id, status: "noop", row_id: op.row_id, new_version: 1 };
  }
  const { event_id, match_type, number } = op.payload;
  if (typeof event_id !== "string" || typeof match_type !== "string" || typeof number !== "number") {
    return rejected(op.op_id, "invalid", "a bare match needs event_id, match_type and number");
  }
  await ctx.store.putRow("match", op.row_id, {
    id: op.row_id,
    event_id,
    match_type,
    number
  });
  await ctx.store.markApplied(op.op_id);
  return { op_id: op.op_id, status: "applied", row_id: op.row_id, new_version: 1 };
}
async function applyEntry(op, ctx) {
  const payload = op.payload;
  const existing = await ctx.store.getRow("scouting_entry", op.row_id);
  if (op.action === "delete") {
    if (!existing) return rejected(op.op_id, "invalid", "no such entry");
    await ctx.store.putRow("scouting_entry", op.row_id, {
      ...existing,
      deleted_at: ctx.now().toISOString(),
      version: existing.version + 1,
      client_updated_at: op.client_updated_at
    });
    await ctx.store.markApplied(op.op_id);
    return {
      op_id: op.op_id,
      status: "applied",
      row_id: op.row_id,
      new_version: existing.version + 1
    };
  }
  if (existing && op.base_version !== existing.version) {
    return rejected(op.op_id, "invalid", `stale base version ${op.base_version}`);
  }
  const formVersionId = payload.form_version_id;
  if (typeof formVersionId !== "string") {
    return rejected(op.op_id, "invalid", "form_version_id is required");
  }
  const shapeIssues = validateEntryShape({
    form_kind: payload.form_kind,
    match_id: payload.match_id ?? null,
    alliance: payload.alliance ?? null,
    robot_status: payload.robot_status ?? null,
    breakdown_seconds: payload.breakdown_seconds ?? null
  });
  if (shapeIssues.length > 0) return rejected(op.op_id, "invalid", shapeIssues.join("; "));
  const fields = await ctx.store.getFormFields(formVersionId);
  const status = payload.robot_status ?? "played";
  const data = payload.data ?? {};
  const validation = validateEntryData(fields, status, data);
  if (!validation.ok) {
    return rejected(op.op_id, "invalid", validation.issues.map((i) => i.message).join("; "));
  }
  const version = existing ? existing.version + 1 : 1;
  await ctx.store.putRow("scouting_entry", op.row_id, {
    ...payload,
    id: op.row_id,
    scouter_id: op.author_user_id,
    version,
    client_created_at: op.client_created_at,
    client_updated_at: op.client_updated_at,
    deleted_at: null
  });
  await ctx.store.markApplied(op.op_id);
  return { op_id: op.op_id, status: "applied", row_id: op.row_id, new_version: version };
}

// src/core/queries/syncPull.ts
var PULL_PAGE_ROWS = 2e3;
var encodeCursor = (c) => btoa(JSON.stringify(c));
var decodeCursor = (raw) => {
  try {
    const parsed = JSON.parse(atob(raw));
    if (typeof parsed.entityIndex !== "number" || typeof parsed.offset !== "number") {
      throw new Error("bad cursor");
    }
    return parsed;
  } catch {
    throw new AppError("invalid", "cursor is not readable; start the pull again without one");
  }
};
async function syncPull(caller, input, ctx) {
  void caller;
  if (!await ctx.store.eventExists(input.event_id)) {
    throw new AppError("not-found", "that event no longer exists", { event_id: input.event_id });
  }
  const scope = await ctx.store.resolveScope(input.event_id);
  const start = input.cursor ? decodeCursor(input.cursor) : { entityIndex: 0, offset: 0 };
  const entities = Object.fromEntries(
    PULL_ENTITY_KEYS.map((key2) => [key2, []])
  );
  let budget = PULL_PAGE_ROWS;
  let newest = "";
  let nextCursor = null;
  for (let index = start.entityIndex; index < PULL_ENTITY_KEYS.length; index += 1) {
    const key2 = PULL_ENTITY_KEYS[index];
    let offset = index === start.entityIndex ? start.offset : 0;
    for (; ; ) {
      if (budget === 0) {
        nextCursor = encodeCursor({ entityIndex: index, offset });
        break;
      }
      const rows = await ctx.store.pullEntity(key2, scope, input.since, offset, budget);
      entities[key2].push(...rows);
      for (const row of rows) {
        const updated = String(row.updated_at ?? "");
        if (updated > newest) newest = updated;
      }
      budget -= rows.length;
      offset += rows.length;
      if (rows.length < 1 || budget > 0) break;
    }
    if (nextCursor !== null) break;
  }
  const watermark = newest === "" ? input.since ?? new Date(ctx.now().getTime() - WATERMARK_OVERLAP_MS).toISOString() : new Date(new Date(newest).getTime() - WATERMARK_OVERLAP_MS).toISOString();
  return { watermark, next_cursor: nextCursor, complete: nextCursor === null, entities };
}

// src/routes/sync.ts
var UNAUTHENTICATED = { error: { code: "unauthenticated", message: "sign in again" } };
function syncRoutes(deps) {
  const app2 = new Hono3();
  app2.post("/sync/push", async (c) => {
    const { caller, refreshedToken } = await deps.callerFor(c.req.raw);
    if (!caller) return c.json(UNAUTHENTICATED, 401);
    if (refreshedToken) c.header("X-Refreshed-Token", refreshedToken);
    const body = await c.req.json().catch(() => null);
    const parsed = pushRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "invalid", message: parsed.error.message } }, 400);
    }
    return c.json(await syncPush(caller, parsed.data, deps.ctx));
  });
  app2.get("/sync/pull", async (c) => {
    const { caller, refreshedToken } = await deps.callerFor(c.req.raw);
    if (!caller) return c.json(UNAUTHENTICATED, 401);
    if (refreshedToken) c.header("X-Refreshed-Token", refreshedToken);
    const parsed = pullRequestSchema.safeParse({
      event_id: c.req.query("event_id"),
      since: c.req.query("since"),
      cursor: c.req.query("cursor")
    });
    if (!parsed.success) {
      return c.json({ error: { code: "invalid", message: parsed.error.message } }, 400);
    }
    return c.json(await syncPull(caller, parsed.data, deps.ctx));
  });
  return app2;
}

// src/composition.ts
function buildContext() {
  const config2 = serverConfig();
  return { store: supabaseStore(getServiceClient(config2)), now: () => /* @__PURE__ */ new Date() };
}
function mountedRoutes(ctx, config2) {
  return [
    syncRoutes({ ctx, callerFor: (request) => callerFor(request, config2, ctx.store) }),
    rpcRoutes(ctx, config2)
  ];
}
function buildApp() {
  const config2 = serverConfig();
  const ctx = buildContext();
  return createApp({
    config: config2,
    pingDatabase: makePingDatabase(config2),
    routes: mountedRoutes(ctx, config2)
  });
}

// src/handler.ts
var config = { runtime: "nodejs" };
var app = buildApp();
var GET = handle(app);
var POST = handle(app);
var OPTIONS = handle(app);
export {
  GET,
  OPTIONS,
  POST,
  config
};
//# sourceMappingURL=index.js.map
