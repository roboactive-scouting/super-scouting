// src/handler.ts
import { handle } from "hono/vercel";

// src/app.ts
import { Hono } from "hono";
import { cors } from "hono/cors";

// ../../packages/shared/src/api/auth.ts
import { z as z2 } from "zod";

// ../../packages/shared/src/api/users.ts
import { z } from "zod";
var MIN_PASSWORD_LENGTH = 8;
var USERNAME_PATTERN = /^[\p{L}\p{N}._-]{1,40}$/u;
var USERNAME_MAX_LENGTH = 40;
var LIST_USERS_DEFAULT_LIMIT = 50;
var LIST_USERS_MAX_LIMIT = 200;
var userRoleSchema = z.enum(["scouter", "lead", "admin"]);
var usernameSchema = z.string().transform((value) => value.trim().toLowerCase()).pipe(
  z.string().regex(
    USERNAME_PATTERN,
    "use 1 to 40 letters, digits, dots, underscores or hyphens, with no spaces"
  )
);
var passwordSchema = z.string().min(MIN_PASSWORD_LENGTH, `use at least ${MIN_PASSWORD_LENGTH} characters`);
var userId = z.string().min(1);
var publicUser = z.object({
  id: z.string(),
  username: z.string(),
  full_name: z.string(),
  role: userRoleSchema,
  must_change_password: z.boolean(),
  disabled_at: z.string().nullable(),
  created_at: z.string()
});
var createUserInput = z.object({
  username: usernameSchema,
  full_name: z.string().trim().min(1).max(80),
  role: userRoleSchema,
  password: passwordSchema,
  /** Forces a change at first sign-in (spec §5.4 item 3), same as resetPassword's flag. */
  must_change: z.boolean().default(false)
});
var setUserRoleInput = z.object({ user_id: userId, role: userRoleSchema });
var enableUserInput = z.object({ user_id: userId });
var renameUserInput = z.object({
  user_id: userId,
  username: usernameSchema.optional(),
  full_name: z.string().trim().min(1).max(80).optional()
}).refine((value) => value.username !== void 0 || value.full_name !== void 0, {
  message: "give a new username, a new full name, or both"
});
var resetPasswordInput = z.object({
  user_id: userId,
  password: passwordSchema,
  /** Forces a change at next login (SPEC-FINAL 7.3). */
  must_change: z.boolean().default(false)
});
var disableUserInput = z.object({ user_id: userId });
var changeOwnPasswordInput = z.object({
  current_password: z.string().min(1),
  new_password: passwordSchema
}).strict();
var listUsersInput = z.object({
  include_disabled: z.boolean().default(false),
  limit: z.number().int().min(1).optional(),
  cursor: z.string().min(1).optional()
});
var listUsersOutput = z.object({
  items: z.array(publicUser),
  next_cursor: z.string().nullable()
});
var countEntriesByScouterInput = z.object({ season_id: z.string().uuid() });
var countEntriesByScouterOutput = z.object({
  items: z.array(z.object({ scouter_id: z.string().uuid(), count: z.number().int().min(0) }))
});

// ../../packages/shared/src/api/auth.ts
var loginInput = z2.object({
  // Capped at the length createUser allows (Phase 1B review): no longer name can exist,
  // and the login rate limiter keys on this string, so it must not be unbounded. The cap
  // is on the raw value, so the client should trim before sending.
  username: z2.string().min(1).max(USERNAME_MAX_LENGTH),
  password: z2.string().min(1)
});
var loginOutput = z2.object({
  token: z2.string(),
  user: z2.object({
    id: z2.string().uuid(),
    username: z2.string(),
    full_name: z2.string(),
    role: z2.enum(["scouter", "lead", "admin"]),
    must_change_password: z2.boolean()
  })
});
var refreshTokenInput = z2.object({ token: z2.string().min(1) });

// ../../packages/shared/src/api/context.ts
import { z as z3 } from "zod";
var getActiveContextInput = z3.object({}).strict();
var activeContext = z3.object({
  active_season_id: z3.string().uuid().nullable(),
  active_event_id: z3.string().uuid().nullable()
});
var uuid = z3.string().uuid();
var SEASON_YEAR_MIN = 1992;
var SEASON_YEAR_MAX = 2100;
var NAME_MAX_LENGTH = 80;
var REORDER_EVENTS_MAX = 200;
var LIST_SEASONS_DEFAULT_LIMIT = 50;
var LIST_SEASONS_MAX_LIMIT = 200;
var LIST_EVENTS_DEFAULT_LIMIT = 50;
var LIST_EVENTS_MAX_LIMIT = 200;
var seasonYear = z3.number().int().min(SEASON_YEAR_MIN).max(SEASON_YEAR_MAX);
var displayName = z3.string().trim().min(1).max(NAME_MAX_LENGTH);
var fieldImagePath = z3.string().trim().min(1).max(200);
var seasonRow = z3.object({
  id: uuid,
  year: z3.number().int(),
  game_name: z3.string(),
  field_image_path: z3.string(),
  created_at: z3.string(),
  updated_at: z3.string()
});
var eventRow = z3.object({
  id: uuid,
  season_id: uuid,
  name: z3.string(),
  code: z3.string().nullable(),
  sort_order: z3.number().int(),
  created_at: z3.string(),
  updated_at: z3.string()
});
var createSeasonInput = z3.object({ year: seasonYear, game_name: displayName, field_image_path: fieldImagePath }).strict();
var updateSeasonInput = z3.object({
  season_id: uuid,
  year: seasonYear.optional(),
  game_name: displayName.optional(),
  field_image_path: fieldImagePath.optional()
}).strict().refine(
  (value) => value.year !== void 0 || value.game_name !== void 0 || value.field_image_path !== void 0,
  { message: "give a new year, game name or game image path" }
);
var setActiveSeasonInput = z3.object({ season_id: uuid }).strict();
var listSeasonsInput = z3.object({
  limit: z3.number().int().min(1).optional(),
  cursor: z3.string().min(1).optional()
}).strict();
var listSeasonsOutput = z3.object({
  items: z3.array(seasonRow),
  next_cursor: z3.string().nullable()
});
var createEventInput = z3.object({ season_id: uuid, name: displayName }).strict();
var updateEventInput = z3.object({ event_id: uuid, name: displayName }).strict();
var reorderEventsInput = z3.object({ season_id: uuid, event_ids: z3.array(uuid).max(REORDER_EVENTS_MAX) }).strict();
var reorderEventsOutput = z3.object({ items: z3.array(eventRow) });
var setActiveEventInput = z3.object({ event_id: uuid }).strict();
var listEventsInput = z3.object({
  season_id: uuid,
  limit: z3.number().int().min(1).optional(),
  cursor: z3.string().min(1).optional()
}).strict();
var listEventsOutput = z3.object({
  items: z3.array(eventRow),
  next_cursor: z3.string().nullable()
});
var deleteSeasonInput = z3.object({
  season_id: uuid,
  dry_run: z3.boolean().default(false),
  confirm_name: z3.string().optional()
}).strict();
var deleteEventInput = z3.object({
  event_id: uuid,
  dry_run: z3.boolean().default(false),
  confirm_name: z3.string().optional()
}).strict();
var SWITCH_SEASON_FIRST = "Switch the active season first.";
var SWITCH_EVENT_FIRST = "Switch the default event first.";
var deleteImpactOutput = z3.object({
  deleted: z3.boolean(),
  events: z3.number().int(),
  matches: z3.number().int(),
  entries: z3.number().int(),
  forms: z3.number().int()
});

// ../../packages/shared/src/api/forms.ts
import { z as z6 } from "zod";

// ../../packages/shared/src/forms/config.ts
import { z as z5 } from "zod";

// ../../packages/shared/src/forms/expression.ts
import { z as z4 } from "zod";
var exprSchema = z4.lazy(
  () => z4.union([
    z4.object({ kind: z4.literal("field"), key: z4.string().min(1) }).strict(),
    z4.object({ kind: z4.literal("literal"), value: z4.union([z4.number(), z4.string()]) }).strict(),
    z4.object({
      kind: z4.literal("op"),
      op: z4.enum(["+", "-", "*", "/", "concat"]),
      left: exprSchema,
      right: exprSchema
    }).strict()
  ])
);
var NUMERIC_UNITS = /* @__PURE__ */ new Set(["count", "seconds", "points"]);
var NUMERIC_TYPES = /* @__PURE__ */ new Set(["counter", "number", "rating", "timer", "toggle"]);
function staticType(expr, byKey) {
  switch (expr.kind) {
    case "literal":
      return typeof expr.value === "number" ? "float" : "string";
    case "field": {
      const field = byKey.get(expr.key);
      if (!field) return "invalid";
      if (field.type === "computed") return "invalid";
      if (field.type === "toggle") return "float";
      if (field.unit === null || field.unit === void 0) {
        return NUMERIC_TYPES.has(field.type) ? "float" : "string";
      }
      return NUMERIC_UNITS.has(field.unit) ? "float" : "string";
    }
    case "op": {
      const left = staticType(expr.left, byKey);
      const right = staticType(expr.right, byKey);
      if (left === "invalid" || right === "invalid" || left !== right) return "invalid";
      if (expr.op === "concat") return left === "string" ? "string" : "invalid";
      return left === "float" ? "float" : "invalid";
    }
  }
}
function validateExpr(expr, fields, resultType) {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const issues = [];
  const walk = (node) => {
    if (node.kind === "field") {
      const field = byKey.get(node.key);
      if (!field) {
        issues.push({ path: "expression", message: `'${node.key}' is not a field on this form` });
      } else if (field.type === "computed") {
        issues.push({
          path: "expression",
          message: `a computed field may not reference another computed field ('${node.key}')`
        });
      }
    }
    if (node.kind === "op") {
      walk(node.left);
      walk(node.right);
    }
  };
  walk(expr);
  if (issues.length === 0) {
    const type = staticType(expr, byKey);
    if (type === "invalid") {
      issues.push({
        path: "expression",
        message: "operands must be the same type: numbers take + \u2212 \xD7 \xF7, strings take concat"
      });
    } else if (resultType !== void 0 && type !== resultType) {
      issues.push({
        path: "expression",
        message: `the expression gives a ${type}, but the field says ${resultType}`
      });
    }
  }
  return issues;
}

// ../../packages/shared/src/forms/types.ts
function selectOptions(field) {
  const raw = field.config.options;
  return Array.isArray(raw) ? raw : [];
}

// ../../packages/shared/src/forms/visibility.ts
var OPS = ["=", "!=", ">", "<", ">=", "<="];
var ORDERING_OPS = /* @__PURE__ */ new Set([">", "<", ">=", "<="]);
function compare(left, op, right) {
  switch (op) {
    case "=":
      return left === right;
    case "!=":
      return left !== right;
    default: {
      if (typeof left !== "number" || typeof right !== "number") return false;
      switch (op) {
        case ">":
          return left > right;
        case "<":
          return left < right;
        case ">=":
          return left >= right;
        case "<=":
          return left <= right;
      }
    }
  }
}
function isVisible(field, values) {
  const condition = field.visibility_condition;
  if (!condition) return true;
  const controlling = values[condition.field_key];
  if (controlling === void 0) return false;
  return compare(controlling, condition.op, condition.value);
}
function validateVisibilityCondition(field, fields) {
  const condition = field.visibility_condition;
  if (!condition) return [];
  const issues = [];
  const issue = (message) => issues.push({ path: "visibility_condition", message });
  if (condition.field_key === field.key) {
    issue("a field cannot be shown or hidden by its own value");
  } else {
    const target = fields.find((f) => f.key === condition.field_key && !f.deprecated);
    if (!target) {
      issue(`'${condition.field_key}' is not a field in this form`);
    } else if (target.type === "section") {
      issue(`'${condition.field_key}' is a section and holds no value`);
    }
  }
  if (!OPS.includes(condition.op)) {
    issue(`'${String(condition.op)}' is not one of ${OPS.join(" ")}`);
  } else if (ORDERING_OPS.has(condition.op) && !(typeof condition.value === "number" && Number.isFinite(condition.value))) {
    issue(`'${condition.op}' compares against a number`);
  }
  return issues;
}

// ../../packages/shared/src/forms/validate.ts
var LIST_TYPES = /* @__PURE__ */ new Set([
  "multi_select",
  "event_log",
  "position",
  "cycle_path"
]);
function isDeadRobot(status) {
  return status === "no_show" || status === "disabled";
}
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var inUnit = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
var inUnitSquare = (p) => isRecord(p) && inUnit(p.x) && inUnit(p.y);
var TAP_KEYS = /* @__PURE__ */ new Set(["type", "t", "x", "y"]);
function validTap(tap, allowed) {
  if (!isRecord(tap)) return false;
  if (Object.keys(tap).some((k) => !TAP_KEYS.has(k))) return false;
  if (typeof tap.type !== "string" || tap.type === "") return false;
  if (allowed !== null && !allowed.has(tap.type)) return false;
  if (typeof tap.t !== "number" || !Number.isFinite(tap.t)) return false;
  const hasX = "x" in tap;
  const hasY = "y" in tap;
  if (hasX !== hasY) return false;
  return !hasX || inUnit(tap.x) && inUnit(tap.y);
}
function validateEntryData(fields, robotStatus, data, options = {}) {
  const submit = (options.mode ?? "submit") === "submit";
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
    if (field.type === "computed" || field.type === "section") continue;
    const value = data[field.key];
    const emptyList = submit && LIST_TYPES.has(field.type) && Array.isArray(value) && value.length === 0;
    const missing = value === void 0 || value === null || value === "" || emptyList;
    if (missing) {
      if (submit && field.required && isVisible(field, data)) {
        issues.push({
          field_key: field.key,
          code: "required",
          message: `${field.label} is required`
        });
      }
      continue;
    }
    const wrongType = (message) => issues.push({ field_key: field.key, code: "wrong-type", message });
    switch (field.type) {
      case "counter":
      case "number": {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          issues.push({
            field_key: field.key,
            code: "wrong-type",
            message: `${field.label} must be a number`
          });
          break;
        }
        if (!submit) break;
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
      case "multi_select": {
        const allowed = selectOptions(field).map((o) => o.value);
        if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || !allowed.includes(v))) {
          issues.push({
            field_key: field.key,
            code: "not-an-option",
            message: `${field.label} must be a list drawn from: ${allowed.join(", ")}`
          });
        }
        break;
      }
      case "short_text":
      case "long_text": {
        if (typeof value !== "string") wrongType(`${field.label} must be text`);
        break;
      }
      case "rating": {
        const max = typeof field.config.max === "number" ? field.config.max : 5;
        if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
          wrongType(`${field.label} must be a rating from 1 to ${max}`);
        } else if (submit && value > max) {
          wrongType(`${field.label} must be a rating from 1 to ${max}`);
        }
        break;
      }
      case "timer": {
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
          wrongType(`${field.label} must be a time in seconds, 0 or more`);
        }
        break;
      }
      case "event_log": {
        if (!Array.isArray(value)) {
          wrongType(`${field.label} must be a list of taps`);
          break;
        }
        const allowed = submit ? new Set(
          (Array.isArray(field.config.event_types) ? field.config.event_types : []).filter(isRecord).map((o) => o.value)
        ) : null;
        let previous = -Infinity;
        let good = true;
        for (const tap of value) {
          if (!validTap(tap, allowed) || tap.t < previous) {
            good = false;
            break;
          }
          previous = tap.t;
        }
        if (!good) wrongType(`${field.label} must be taps of a known type, in time order`);
        break;
      }
      case "position": {
        const points = Array.isArray(value) ? value : [value];
        if (!points.every(inUnitSquare)) {
          wrongType(`${field.label} must be points inside the map (0 to 1)`);
        } else if (submit && field.config.multi_point !== true && points.length > 1) {
          wrongType(`${field.label} takes one point`);
        }
        break;
      }
      case "cycle_path": {
        const cap = typeof field.config.max_points_per_cycle === "number" ? field.config.max_points_per_cycle : 6;
        const cycles = value;
        if (!Array.isArray(cycles) || cycles.some(
          (c) => !Array.isArray(c) || submit && c.length > cap || !c.every(inUnitSquare)
        )) {
          wrongType(`${field.label} must be cycles of at most ${cap} points inside the map`);
        }
        break;
      }
    }
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

// ../../packages/shared/src/forms/config.ts
var FIELD_TYPES = [
  "counter",
  "number",
  "toggle",
  "single_select",
  "multi_select",
  "rating",
  "short_text",
  "long_text",
  "timer",
  "event_log",
  "position",
  "cycle_path",
  "computed",
  "section"
];
var option = z5.object({ value: z5.string().min(1), label: z5.string().min(1) });
var optionList = z5.array(option).min(1).superRefine((list, ctx) => {
  const seen = /* @__PURE__ */ new Set();
  list.forEach((o, i) => {
    if (seen.has(o.value)) {
      ctx.addIssue({
        code: z5.ZodIssueCode.custom,
        path: [i, "value"],
        message: `the value '${o.value}' is listed twice; each value names one choice`
      });
    }
    seen.add(o.value);
  });
});
var mirrorAxis = z5.enum(["none", "horizontal", "vertical", "both"]);
var numericRange = z5.object({
  min: z5.number().optional(),
  max: z5.number().optional(),
  step: z5.number().positive().optional()
}).strict().refine((r) => r.min === void 0 || r.max === void 0 || r.min <= r.max, {
  path: ["max"],
  message: "max must not be below min"
});
var eventLog = z5.object({
  event_types: optionList,
  ask_position: z5.boolean().default(false),
  mirror_axis: mirrorAxis.optional()
}).strict().superRefine((config2, ctx) => {
  if (config2.ask_position && config2.mirror_axis === void 0) {
    ctx.addIssue({
      code: z5.ZodIssueCode.custom,
      path: ["mirror_axis"],
      message: "mirror_axis is required when ask_position is on"
    });
  }
});
var FIELD_TYPE_CONFIG = {
  counter: numericRange,
  number: numericRange,
  toggle: z5.object({}).strict(),
  single_select: z5.object({ options: optionList, is_ordinal: z5.boolean().optional() }).strict(),
  multi_select: z5.object({ options: optionList, is_ordinal: z5.boolean().optional() }).strict(),
  rating: z5.object({ max: z5.number().int().positive().default(5), style: z5.enum(["stars", "slider"]) }).strict(),
  short_text: z5.object({ max_length: z5.number().int().positive().optional() }).strict(),
  long_text: z5.object({ max_length: z5.number().int().positive().optional() }).strict(),
  // SPEC-FINAL 5.3: allow_unsure is "always true in v1", so it defaults to true and
  // cannot be set to false — but a field that omits it entirely is still valid.
  timer: z5.object({ allow_unsure: z5.literal(true).default(true) }).strict(),
  event_log: eventLog,
  position: z5.object({ multi_point: z5.boolean(), mirror_axis: mirrorAxis }).strict(),
  cycle_path: z5.object({
    max_points_per_cycle: z5.number().int().positive().default(6),
    mirror_axis: mirrorAxis
  }).strict(),
  computed: z5.object({ expression: exprSchema.nullable(), result_type: z5.enum(["float", "string"]) }).strict(),
  section: z5.object({}).strict()
};
var KEY_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;
var SEMANTIC_COLUMNS = [
  "description",
  "unit",
  "phase",
  "direction",
  "category",
  "expected_range",
  "include_in_ai_context"
];
var blank = (value) => value === null || value === void 0 || typeof value === "string" && value.trim() === "";
function validateFieldDefinition(field) {
  const issues = [];
  if (!KEY_PATTERN.test(field.key)) {
    issues.push({
      path: "key",
      message: "a key is permanent: lowercase letters, digits and underscores, starting with a letter"
    });
  }
  if (field.type === "section") {
    for (const column of SEMANTIC_COLUMNS) {
      if (field[column] !== null && field[column] !== void 0) {
        issues.push({
          path: column,
          message: "a section holds no data and carries no semantic metadata"
        });
      }
    }
  } else {
    for (const required of ["description", "unit", "phase", "direction"]) {
      if (blank(field[required])) {
        issues.push({
          path: required,
          message: `${required} is required on every data field and cannot be backfilled later`
        });
      }
    }
  }
  const ordinalAllowed = field.type === "single_select" || field.type === "multi_select";
  if (!ordinalAllowed && field.is_ordinal !== null && field.is_ordinal !== void 0) {
    issues.push({
      path: "is_ordinal",
      message: "is_ordinal applies only to single and multi select"
    });
  }
  const schema2 = FIELD_TYPE_CONFIG[field.type];
  if (!schema2) {
    issues.push({ path: "type", message: `unknown field type '${field.type}'` });
  } else {
    const parsed = schema2.safeParse(field.config);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({
          path: issue.path.length > 0 ? `config.${issue.path.join(".")}` : "config",
          message: issue.message
        });
      }
    } else if (field.default_value !== null && field.default_value !== void 0) {
      const message = defaultValueProblem(field);
      if (message !== null) issues.push({ path: "default_value", message });
    }
  }
  return issues;
}
function defaultValueProblem(field) {
  const alone = {
    ...field,
    required: false,
    visibility_condition: null,
    deprecated: false
  };
  const result = validateEntryData([alone], "played", { [field.key]: field.default_value });
  if (result.ok) return null;
  return `the default is not a valid value: ${result.issues[0].message}`;
}

// ../../packages/shared/src/api/forms.ts
var uuid2 = z6.string().uuid();
var FORM_KINDS = ["match", "super"];
var formKind = z6.enum(FORM_KINDS);
var FORM_NAME_MAX_LENGTH = 80;
var FIELD_LABEL_MAX_LENGTH = 200;
var FORM_FIELDS_MAX = 500;
var TIMER_PHASES_MAX = 8;
var TIMER_PHASE_SECONDS_MAX = 3600;
var FORM_EXPORT_TTL_MS = 24 * 60 * 60 * 1e3;
var FORM_DEFINITION_FORMAT = 1;
var formName = z6.string().trim().min(1).max(FORM_NAME_MAX_LENGTH);
var FIELD_PHASES = ["auto", "teleop", "endgame", "post_match"];
var FIELD_UNITS = [
  "count",
  "seconds",
  "points",
  "boolean",
  "enum",
  "text",
  "coordinate"
];
var FIELD_DIRECTIONS = ["higher_is_better", "lower_is_better", "neutral"];
var VISIBILITY_OPS = ["=", "!=", ">", "<", ">=", "<="];
var timerConfig = z6.object({
  phases: z6.array(
    z6.object({
      phase: z6.enum(FIELD_PHASES),
      seconds: z6.number().int().positive().max(TIMER_PHASE_SECONDS_MAX)
    }).strict()
  ).max(TIMER_PHASES_MAX)
}).strict().superRefine((value, ctx) => {
  const seen = /* @__PURE__ */ new Set();
  value.phases.forEach((p, i) => {
    if (seen.has(p.phase)) {
      ctx.addIssue({
        code: "custom",
        path: ["phases", i, "phase"],
        message: `the timer names ${p.phase} twice`
      });
    }
    seen.add(p.phase);
  });
});
var fieldShape = {
  key: z6.string().min(1).max(63),
  label: z6.string().trim().min(1).max(FIELD_LABEL_MAX_LENGTH),
  help_text: z6.string().nullable().default(null),
  type: z6.enum(FIELD_TYPES),
  section: z6.string().nullable().default(null),
  display_order: z6.number().int(),
  required: z6.boolean().default(false),
  default_value: z6.unknown().default(null),
  config: z6.record(z6.unknown()).default({}),
  visibility_condition: z6.object({ field_key: z6.string().min(1), op: z6.enum(VISIBILITY_OPS), value: z6.unknown() }).strict().nullable().default(null),
  description: z6.string().nullable().default(null),
  unit: z6.enum(FIELD_UNITS).nullable().default(null),
  phase: z6.enum(FIELD_PHASES).nullable().default(null),
  direction: z6.enum(FIELD_DIRECTIONS).nullable().default(null),
  category: z6.string().nullable().default(null),
  expected_range: z6.object({ min: z6.number(), max: z6.number() }).strict().refine((r) => r.min <= r.max, { message: "expected_range min must not exceed max" }).nullable().default(null),
  include_in_ai_context: z6.boolean().nullable().default(null),
  is_ordinal: z6.boolean().nullable().default(null)
};
var formFieldDraft = z6.object(fieldShape).strict();
var formFieldInput = z6.object({ id: uuid2.optional(), ...fieldShape }).strict();
var formFieldRow = z6.object({
  id: uuid2,
  form_version_id: uuid2,
  key: z6.string(),
  label: z6.string(),
  help_text: z6.string().nullable(),
  type: z6.enum(FIELD_TYPES),
  section: z6.string().nullable(),
  display_order: z6.number().int(),
  required: z6.boolean(),
  default_value: z6.unknown(),
  config: z6.record(z6.unknown()),
  visibility_condition: z6.object({ field_key: z6.string(), op: z6.string(), value: z6.unknown() }).nullable(),
  deprecated: z6.boolean(),
  description: z6.string().nullable(),
  unit: z6.enum(FIELD_UNITS).nullable(),
  phase: z6.enum(FIELD_PHASES).nullable(),
  direction: z6.enum(FIELD_DIRECTIONS).nullable(),
  category: z6.string().nullable(),
  expected_range: z6.object({ min: z6.number(), max: z6.number() }).nullable(),
  include_in_ai_context: z6.boolean().nullable(),
  is_ordinal: z6.boolean().nullable()
});
var formIssue = z6.object({
  field_key: z6.string().nullable(),
  path: z6.string(),
  message: z6.string()
});
var formRow = z6.object({
  id: uuid2,
  season_id: uuid2,
  kind: formKind,
  name: z6.string(),
  active_version_id: uuid2.nullable(),
  timer_config: timerConfig,
  created_at: z6.string(),
  updated_at: z6.string()
});
var createFormInput = z6.object({ season_id: uuid2, kind: formKind, name: formName }).strict();
var createFormOutput = z6.object({ id: uuid2, draft_version_id: uuid2 });
var updateFormInput = z6.object({ form_id: uuid2, name: formName.optional(), timer_config: timerConfig.optional() }).strict().refine((value) => value.name !== void 0 || value.timer_config !== void 0, {
  message: "give a new name or match timer"
});
var saveDraftFieldsInput = z6.object({
  form_version_id: uuid2,
  base_updated_at: z6.string().datetime({ offset: true }).optional(),
  fields: z6.array(formFieldInput).max(FORM_FIELDS_MAX)
}).strict();
var saveDraftFieldsOutput = z6.object({
  form_version_id: uuid2,
  new_version_id: uuid2.nullable(),
  version_no: z6.number().int(),
  updated_at: z6.string(),
  fields: z6.array(formFieldRow),
  incomplete: z6.array(formIssue)
});
var publishFormVersionInput = z6.object({ form_version_id: uuid2 }).strict();
var publishFormVersionOutput = z6.object({
  form_version_id: uuid2,
  published_at: z6.string(),
  active_version_id: uuid2.nullable()
});
var restoreFormVersionInput = z6.object({ form_version_id: uuid2 }).strict();
var restoreFormVersionOutput = z6.object({ active_version_id: uuid2 });
var deleteFormVersionInput = z6.object({ form_version_id: uuid2 }).strict();
var deleteFormVersionOutput = z6.object({ deleted: z6.literal(true) });
var deleteFormInput = z6.object({ form_id: uuid2, dry_run: z6.boolean().default(false) }).strict();
var deleteFormOutput = z6.object({
  versions: z6.number().int(),
  entries: z6.number().int(),
  deleted: z6.boolean()
});
var definitionScoringRule = z6.object({
  field_key: z6.string().min(1),
  points: z6.number().min(0),
  option_points: z6.record(z6.number().min(0)).nullable().default(null)
}).strict();
var formDefinition = z6.object({
  format: z6.literal(FORM_DEFINITION_FORMAT),
  kind: formKind,
  name: formName,
  timer_config: timerConfig,
  fields: z6.array(formFieldDraft).max(FORM_FIELDS_MAX),
  scoring_rules: z6.array(definitionScoringRule).max(FORM_FIELDS_MAX)
}).strict();
var exportFormInput = z6.object({ form_id: uuid2, form_version_id: uuid2.optional() }).strict();
var saveFormExportInput = z6.object({ form_id: uuid2, form_version_id: uuid2 }).strict();
var exportSummary = z6.object({
  id: uuid2,
  form_id: uuid2.nullable(),
  kind: formKind,
  label: z6.string(),
  field_count: z6.number().int(),
  created_by: z6.object({ id: uuid2, full_name: z6.string() }),
  created_at: z6.string(),
  expires_at: z6.string(),
  expires_in_seconds: z6.number().int()
});
var importFormInput = z6.object({ season_id: uuid2, definition: formDefinition, form_id: uuid2.optional() }).strict();
var importFormOutput = z6.object({
  form_id: uuid2,
  draft_version_id: uuid2,
  created: z6.boolean()
});
var scoringRuleInput = z6.object({
  field_key: z6.string().min(1).max(63),
  points: z6.number().finite(),
  option_points: z6.record(z6.number().finite()).nullable().optional()
}).strict();
var setScoringRulesInput = z6.object({ form_id: uuid2, rules: z6.array(scoringRuleInput).max(FORM_FIELDS_MAX) }).strict();
var scoringRuleRow = z6.object({
  field_key: z6.string(),
  points: z6.number(),
  option_points: z6.record(z6.number()).nullable()
});
var setScoringRulesOutput = z6.object({ rules: z6.array(scoringRuleRow) });
var userRef = z6.object({ id: uuid2, full_name: z6.string() });
var versionSummary = z6.object({
  id: uuid2,
  version_no: z6.number().int(),
  status: z6.enum(["draft", "published"]),
  published_at: z6.string().nullable(),
  is_active: z6.boolean(),
  is_locked: z6.boolean(),
  field_count: z6.number().int(),
  entry_count: z6.number().int(),
  updated_at: z6.string(),
  updated_by: userRef.nullable()
});
var getFormInput = z6.object({ form_id: uuid2 }).strict();
var getFormOutput = formRow.extend({ versions: z6.array(versionSummary) });
var getFormVersionInput = z6.object({ form_version_id: uuid2 }).strict();
var scoredFieldRow = formFieldRow.extend({
  points: z6.number().nullable(),
  option_points: z6.record(z6.number()).nullable()
});
var getFormVersionOutput = versionSummary.extend({
  form_id: uuid2,
  fields: z6.array(scoredFieldRow)
});
var getFormDictionaryInput = z6.object({ form_id: uuid2 }).strict();
var dictionaryField = z6.object({
  key: z6.string(),
  label: z6.string(),
  description: z6.string().nullable(),
  type: z6.enum(FIELD_TYPES),
  unit: z6.enum(FIELD_UNITS).nullable(),
  phase: z6.enum(FIELD_PHASES).nullable(),
  direction: z6.enum(FIELD_DIRECTIONS).nullable(),
  category: z6.string().nullable(),
  expected_range: z6.object({ min: z6.number(), max: z6.number() }).nullable(),
  include_in_ai_context: z6.boolean().nullable(),
  is_ordinal: z6.boolean().nullable(),
  /** A select's options in order (worst → best when ordinal); null for every other type. */
  options: z6.array(z6.object({ value: z6.string(), label: z6.string() })).nullable(),
  points: z6.number().nullable(),
  option_points: z6.record(z6.number()).nullable()
});
var getFormDictionaryOutput = z6.object({
  form_id: uuid2,
  version_no: z6.number().int().nullable(),
  fields: z6.array(dictionaryField)
});
var listFormsInput = z6.object({ season_id: uuid2 }).strict();
var formListItem = z6.object({
  id: uuid2,
  kind: formKind,
  name: z6.string(),
  active_version_id: uuid2.nullable(),
  updated_at: z6.string(),
  versions: z6.array(versionSummary)
});
var listFormsOutput = z6.object({ season_id: uuid2, forms: z6.array(formListItem) });
var listFormExportsInput = z6.object({}).strict();
var listFormExportsOutput = z6.object({ exports: z6.array(exportSummary) });
var getFormExportInput = z6.object({ export_id: uuid2 }).strict();
var getFormExportOutput = exportSummary.extend({ definition: formDefinition });

// ../../packages/shared/src/api/matches.ts
import { z as z7 } from "zod";
var uuid3 = z7.string().uuid();
var MATCH_TYPES = ["practice", "qualification", "playoff"];
var matchType = z7.enum(MATCH_TYPES);
var ALLIANCES = ["red", "blue"];
var MATCH_NUMBER_MAX = 999;
var MATCH_BULK_MAX = 200;
var LIST_MATCHES_DEFAULT_LIMIT = 50;
var LIST_MATCHES_MAX_LIMIT = 200;
var matchNumber = z7.number().int().min(1).max(MATCH_NUMBER_MAX);
var matchSlot = z7.object({
  alliance: z7.enum(ALLIANCES),
  station: z7.number().int().min(1).max(3),
  team_id: uuid3
}).strict();
var matchRow = z7.object({
  id: uuid3,
  event_id: uuid3,
  match_type: matchType,
  number: z7.number().int(),
  created_at: z7.string(),
  updated_at: z7.string(),
  slots: z7.array(matchSlot)
});
var createMatchInput = z7.object({
  event_id: uuid3,
  match_type: matchType,
  number: matchNumber.optional(),
  count: z7.number().int().min(1).max(MATCH_BULK_MAX).optional()
}).strict().refine((value) => value.number === void 0 !== (value.count === void 0), {
  message: "give either a match number or a count of matches, not both"
});
var createMatchOutput = z7.object({
  created: z7.number().int(),
  items: z7.array(matchRow)
});
var updateMatchInput = z7.object({
  match_id: uuid3,
  match_type: matchType.optional(),
  number: matchNumber.optional()
}).strict().refine((value) => value.match_type !== void 0 || value.number !== void 0, {
  message: "give a new match type or number"
});
var setMatchTeamsInput = z7.object({ match_id: uuid3, slots: z7.array(matchSlot).max(6) }).strict().superRefine((value, ctx) => {
  const stations = new Set(value.slots.map((s) => `${s.alliance} ${s.station}`));
  if (stations.size !== value.slots.length) {
    ctx.addIssue({
      code: "custom",
      path: ["slots"],
      message: "fill each alliance station only once"
    });
  }
  const teams = new Set(value.slots.map((s) => s.team_id));
  if (teams.size !== value.slots.length) {
    ctx.addIssue({
      code: "custom",
      path: ["slots"],
      message: "a team can fill only one slot in a match"
    });
  }
});
var deleteMatchInput = z7.object({ match_id: uuid3 }).strict();
var deleteMatchOutput = z7.object({ id: uuid3, deleted: z7.literal(true) });
var listMatchesInput = z7.object({
  event_id: uuid3,
  limit: z7.number().int().min(1).optional(),
  cursor: z7.string().min(1).optional()
}).strict();
var listMatchesOutput = z7.object({
  items: z7.array(matchRow),
  next_cursor: z7.string().nullable()
});
var ensureMatchInput = z7.object({
  id: uuid3,
  event_id: uuid3,
  match_type: matchType,
  number: matchNumber
}).strict();
var ensureMatchOutput = z7.object({ id: uuid3, created: z7.boolean() });

// ../../packages/shared/src/api/teams.ts
import { z as z8 } from "zod";
var uuid4 = z8.string().uuid();
var TEAM_NUMBER_MIN = 1;
var TEAM_NUMBER_MAX = 99999;
var TEAM_QUERY_MAX_LENGTH = NAME_MAX_LENGTH;
var ROSTER_MAX_TEAMS = 200;
var LIST_TEAMS_DEFAULT_LIMIT = 50;
var LIST_TEAMS_MAX_LIMIT = 200;
var teamNumber = z8.number().int().min(TEAM_NUMBER_MIN).max(TEAM_NUMBER_MAX);
var teamName = z8.string().trim().min(1).max(NAME_MAX_LENGTH);
var teamRow = z8.object({
  id: uuid4,
  number: z8.number().int(),
  name: z8.string(),
  created_at: z8.string(),
  updated_at: z8.string()
});
var createTeamInput = z8.object({ number: teamNumber, name: teamName }).strict();
var updateTeamInput = z8.object({ team_id: uuid4, name: teamName }).strict();
var listTeamsInput = z8.object({
  query: z8.string().trim().max(TEAM_QUERY_MAX_LENGTH).optional().transform((value) => value ? value : void 0),
  limit: z8.number().int().min(1).optional(),
  cursor: z8.string().min(1).optional()
}).strict();
var listTeamsOutput = z8.object({
  items: z8.array(teamRow),
  next_cursor: z8.string().nullable()
});
var rosterRow = z8.object({
  team_id: uuid4,
  number: z8.number().int(),
  name: z8.string()
});
var setEventRosterInput = z8.object({
  event_id: uuid4,
  team_ids: z8.array(uuid4).max(ROSTER_MAX_TEAMS).refine((ids) => new Set(ids).size === ids.length, {
    message: "name each team only once"
  })
}).strict();
var listEventRosterInput = z8.object({ event_id: uuid4 }).strict();
var eventRosterOutput = z8.object({ items: z8.array(rosterRow) });

// ../../packages/shared/src/api/index.ts
var API = {
  login: { input: loginInput, output: loginOutput },
  refreshToken: { input: refreshTokenInput, output: loginOutput },
  changeOwnPassword: { input: changeOwnPasswordInput, output: publicUser },
  createUser: { input: createUserInput, output: publicUser },
  setUserRole: { input: setUserRoleInput, output: publicUser },
  resetPassword: { input: resetPasswordInput, output: publicUser },
  disableUser: { input: disableUserInput, output: publicUser },
  enableUser: { input: enableUserInput, output: publicUser },
  renameUser: { input: renameUserInput, output: publicUser },
  listUsers: { input: listUsersInput, output: listUsersOutput },
  countEntriesByScouter: { input: countEntriesByScouterInput, output: countEntriesByScouterOutput },
  getActiveContext: { input: getActiveContextInput, output: activeContext },
  createSeason: { input: createSeasonInput, output: seasonRow },
  updateSeason: { input: updateSeasonInput, output: seasonRow },
  setActiveSeason: { input: setActiveSeasonInput, output: activeContext },
  deleteSeason: { input: deleteSeasonInput, output: deleteImpactOutput },
  listSeasons: { input: listSeasonsInput, output: listSeasonsOutput },
  createEvent: { input: createEventInput, output: eventRow },
  updateEvent: { input: updateEventInput, output: eventRow },
  reorderEvents: { input: reorderEventsInput, output: reorderEventsOutput },
  setActiveEvent: { input: setActiveEventInput, output: activeContext },
  deleteEvent: { input: deleteEventInput, output: deleteImpactOutput },
  listEvents: { input: listEventsInput, output: listEventsOutput },
  createTeam: { input: createTeamInput, output: teamRow },
  updateTeam: { input: updateTeamInput, output: teamRow },
  listTeams: { input: listTeamsInput, output: listTeamsOutput },
  setEventRoster: { input: setEventRosterInput, output: eventRosterOutput },
  listEventRoster: { input: listEventRosterInput, output: eventRosterOutput },
  createMatch: { input: createMatchInput, output: createMatchOutput },
  updateMatch: { input: updateMatchInput, output: matchRow },
  setMatchTeams: { input: setMatchTeamsInput, output: matchRow },
  deleteMatch: { input: deleteMatchInput, output: deleteMatchOutput },
  listMatches: { input: listMatchesInput, output: listMatchesOutput },
  ensureMatch: { input: ensureMatchInput, output: ensureMatchOutput },
  createForm: { input: createFormInput, output: createFormOutput },
  updateForm: { input: updateFormInput, output: formRow },
  saveDraftFields: { input: saveDraftFieldsInput, output: saveDraftFieldsOutput },
  publishFormVersion: { input: publishFormVersionInput, output: publishFormVersionOutput },
  restoreFormVersion: { input: restoreFormVersionInput, output: restoreFormVersionOutput },
  deleteFormVersion: { input: deleteFormVersionInput, output: deleteFormVersionOutput },
  deleteForm: { input: deleteFormInput, output: deleteFormOutput },
  exportForm: { input: exportFormInput, output: formDefinition },
  saveFormExport: { input: saveFormExportInput, output: exportSummary },
  importForm: { input: importFormInput, output: importFormOutput },
  setScoringRules: { input: setScoringRulesInput, output: setScoringRulesOutput },
  listForms: { input: listFormsInput, output: listFormsOutput },
  getForm: { input: getFormInput, output: getFormOutput },
  getFormVersion: { input: getFormVersionInput, output: getFormVersionOutput },
  getFormDictionary: { input: getFormDictionaryInput, output: getFormDictionaryOutput },
  listFormExports: { input: listFormExportsInput, output: listFormExportsOutput },
  getFormExport: { input: getFormExportInput, output: getFormExportOutput }
};

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

// ../../packages/shared/src/auth/permissions.ts
var ALL = ["scouter", "lead", "admin"];
var LEADS = ["lead", "admin"];
var ADMIN = ["admin"];
var CAPABILITIES = {
  view_all_data: ALL,
  submit_entry: ALL,
  edit_own_entry: ALL,
  ensure_match: ALL,
  manage_entries: LEADS,
  resolve_conflict: LEADS,
  add_do_not_pick: LEADS,
  draft_dashboard: LEADS,
  save_dashboard: ADMIN,
  manage_forms: ADMIN,
  manage_events: ADMIN,
  manage_pick_lists: ADMIN,
  edit_do_not_pick: ADMIN,
  record_alliance_bracket: ADMIN,
  manage_users: ADMIN,
  delete_objects: ADMIN
};
function can(caller, capability) {
  return isUser(caller) && CAPABILITIES[capability].includes(caller.role);
}
function assertCan(caller, capability) {
  if (!can(caller, capability)) {
    throw new AppError("forbidden", `not permitted: ${capability}`, { capability });
  }
}
var SELF_EDIT_WINDOW_MS = 3e5;
function withinSelfEditWindow(clientCreatedAt, clientUpdatedAt) {
  const created = new Date(clientCreatedAt).getTime();
  const updated = new Date(clientUpdatedAt).getTime();
  if (Number.isNaN(created) || Number.isNaN(updated)) return false;
  const elapsed = updated - created;
  return elapsed >= 0 && elapsed <= SELF_EDIT_WINDOW_MS;
}

// ../../packages/shared/src/season/manifest.ts
var SEASON_IMAGE_MANIFEST = [
  "seasons/2026/field.webp"
];

// ../../packages/shared/src/forms/entryShape.ts
var MAX_BREAKDOWN_SECONDS = 2147483647;
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
  const seconds = row.breakdown_seconds;
  if (seconds !== null && !(Number.isInteger(seconds) && seconds >= 0 && seconds <= MAX_BREAKDOWN_SECONDS)) {
    issues.push("breakdown time must be a whole number of seconds, 0 or more");
  }
  return issues;
}

// ../../packages/shared/src/forms/scoring.ts
var SCORABLE_FIELD_TYPES = [
  "toggle",
  "counter",
  "number",
  "single_select",
  "multi_select"
];
var SCORABLE = new Set(SCORABLE_FIELD_TYPES);
var SELECTS = /* @__PURE__ */ new Set(["single_select", "multi_select"]);
var validPoints = (n) => Number.isFinite(n) && n >= 0;
function optionValues(field) {
  const raw = field.config.options;
  if (!Array.isArray(raw)) return /* @__PURE__ */ new Set();
  return new Set(
    raw.map((o) => o?.value).filter((v) => typeof v === "string")
  );
}
function validateScoringRules(rules, liveFields, options) {
  const byKey = new Map(liveFields.map((f) => [f.key, f]));
  const seen = /* @__PURE__ */ new Set();
  const issues = [];
  rules.forEach((rule, i) => {
    const at = `${options.prefix}.${i}`;
    const key2 = rule.field_key;
    const push = (path, message) => issues.push({ field_key: key2, path: `${at}.${path}`, message });
    if (seen.has(key2)) push("field_key", `two rules name '${key2}'; a field has one scoring rule`);
    seen.add(key2);
    const field = byKey.get(key2);
    if (!field) {
      push("field_key", `scoring names '${key2}', which is not a field of this ${options.noun}`);
      return;
    }
    if (!SCORABLE.has(field.type)) {
      push(
        "field_key",
        `'${key2}' is a ${field.type} field; only toggle, counter, number, single_select and multi_select fields are scored`
      );
      return;
    }
    const isSelect2 = SELECTS.has(field.type);
    if (!validPoints(rule.points)) {
      push("points", "points must be a number of at least 0; penalties are never subtracted");
    } else if (isSelect2 && rule.points !== 0) {
      push("points", `a ${field.type} scores by option_points; its points must be 0`);
    }
    const optionPoints = rule.option_points ?? null;
    if (optionPoints === null) return;
    if (!isSelect2) {
      push("option_points", `only a select scores by option; '${key2}' is a ${field.type} field`);
      return;
    }
    const values = optionValues(field);
    for (const [value, points] of Object.entries(optionPoints)) {
      if (!values.has(value)) {
        push(`option_points.${value}`, `'${value}' is not an option of '${key2}'`);
      } else if (!validPoints(points)) {
        push(
          `option_points.${value}`,
          "option points must be a number of at least 0; penalties are never subtracted"
        );
      }
    }
  });
  return issues;
}
function countDataFields(fields) {
  return fields.filter((f) => f.deprecated !== true && f.type !== "section").length;
}

// ../../packages/shared/src/sync/operation.ts
import { z as z9 } from "zod";
var SYNC_ENTITIES = [
  "scouting_entry",
  "match",
  "pick_list",
  "pick_list_entry",
  "do_not_pick",
  "alliance_slot",
  "alliance_decline"
];
var isoDateTime = z9.string().datetime({ offset: true }).transform((value, ctx) => {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    ctx.addIssue({ code: "custom", message: "Invalid datetime" });
    return z9.NEVER;
  }
  return new Date(ms).toISOString();
});
var operationSchema = z9.object({
  op_id: z9.string().min(1),
  entity: z9.enum(SYNC_ENTITIES),
  row_id: z9.string().uuid(),
  action: z9.enum(["create", "update", "delete"]),
  base_version: z9.number().int().positive().nullable(),
  /** Always the whole row, never a patch. Field-level merging does not exist. */
  payload: z9.record(z9.unknown()),
  author_user_id: z9.string().uuid(),
  client_created_at: isoDateTime,
  client_updated_at: isoDateTime,
  seq: z9.number().int().nonnegative()
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
import { z as z10 } from "zod";
var MAX_OPERATIONS_PER_PUSH = 200;
var WATERMARK_OVERLAP_MS = 5e3;
var pushRequestSchema = z10.object({
  device_id: z10.string().uuid(),
  operations: z10.array(operationSchema).max(MAX_OPERATIONS_PER_PUSH)
});
var pushEnvelopeSchema = z10.object({
  device_id: z10.string().uuid(),
  operations: z10.array(z10.unknown()).max(MAX_OPERATIONS_PER_PUSH)
});
var PARENT_DELETED_DETAIL = {
  event: "the event no longer exists",
  match: "the match no longer exists",
  team: "the team no longer exists",
  form_version: "the form version no longer exists",
  other: "a record this one belongs to no longer exists"
};
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
var pullRequestSchema = z10.object({
  event_id: z10.string().uuid(),
  since: z10.string().datetime({ offset: false }).optional(),
  cursor: z10.string().optional()
});

// src/routes/errors.ts
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
var INTERNAL_ERROR = { error: { code: "invalid", message: "that did not work" } };

// src/app.ts
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
      return c.json({
        status: "ok",
        database: "ok",
        time: (/* @__PURE__ */ new Date()).toISOString(),
        commit: deps.config.commitSha
      });
    } catch (e) {
      return c.json(
        {
          status: "error",
          database: "error",
          message: e instanceof Error ? e.message : "unknown",
          commit: deps.config.commitSha
        },
        503
      );
    }
  });
  for (const route of deps.routes ?? []) app2.route("/", route);
  app2.notFound((c) => c.json({ error: { code: "not-found", message: "no such route" } }, 404));
  app2.onError((e, c) => {
    if (e instanceof AppError) {
      return c.json(
        { error: { code: e.code, message: e.message, details: e.details } },
        STATUS[e.code] ?? 500
      );
    }
    console.error(`${c.req.method} ${c.req.path} failed`, e);
    return c.json(INTERNAL_ERROR, 500);
  });
  return app2;
}

// src/auth/token.ts
import { jwtVerify, SignJWT } from "jose";
import { z as z11 } from "zod";
var sessionClaims = z11.object({
  sub: z11.string().min(1),
  role: z11.enum(["scouter", "lead", "admin"]),
  username: z11.string().min(1),
  iat: z11.number().int(),
  exp: z11.number().int()
});
var key = (config2) => new TextEncoder().encode(config2.authJwtSecret);
async function issueToken(user, config2) {
  const iat = Math.floor(Date.now() / 1e3);
  return new SignJWT({ role: user.role, username: user.username }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuedAt(iat).setExpirationTime(iat + config2.tokenTtlDays * 86400).sign(key(config2));
}
async function verifyToken(raw, config2) {
  const { payload } = await jwtVerify(raw, key(config2), {
    algorithms: ["HS256"],
    maxTokenAge: config2.tokenTtlDays * 86400
  });
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
import { z as z12 } from "zod";
var schema = z12.object({
  SUPABASE_URL: z12.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z12.string().min(1),
  AUTH_JWT_SECRET: z12.string().min(32, "must be at least 32 characters"),
  AUTH_TOKEN_TTL_DAYS: z12.coerce.number().int().positive().default(30),
  AUTH_TOKEN_REFRESH_AFTER_DAYS: z12.coerce.number().int().positive().default(7),
  ALLOWED_ORIGIN: z12.string().url(),
  NODE_ENV: z12.enum(["development", "production", "test"]).default("development"),
  // Vercel's own system env var (https://vercel.com/docs/environment-variables/system-environment-variables),
  // not something anyone sets by hand. Absent locally and in tests.
  VERCEL_GIT_COMMIT_SHA: z12.string().min(1).optional()
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
    isProduction: v.NODE_ENV === "production",
    commitSha: v.VERCEL_GIT_COMMIT_SHA ?? null
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
function rowsOf(key2, result) {
  if (result.error) throw new Error(`${key2}: ${result.error.message}`);
  return result.data ?? [];
}
async function parentIds(db, key2, scope) {
  switch (key2) {
    case "match_teams": {
      const res = await db.from("matches").select("id").eq("event_id", scope.eventId);
      return rowsOf(key2, res).map((r) => r.id);
    }
    case "form_versions":
    case "scoring_rules": {
      const res = await db.from("forms").select("id").eq("season_id", scope.seasonId);
      return rowsOf(key2, res).map((r) => r.id);
    }
    case "form_fields": {
      const forms = await db.from("forms").select("id").eq("season_id", scope.seasonId);
      const res = await db.from("form_versions").select("id").in(
        "form_id",
        rowsOf(key2, forms).map((r) => r.id)
      );
      return rowsOf(key2, res).map((r) => r.id);
    }
    case "pick_list_entries": {
      const res = await db.from("pick_lists").select("id").eq("event_id", scope.eventId);
      return rowsOf(key2, res).map((r) => r.id);
    }
    case "alliance_slots":
    case "alliance_declines": {
      const res = await db.from("alliances").select("id").eq("event_id", scope.eventId);
      return rowsOf(key2, res).map((r) => r.id);
    }
    case "dashboard_charts": {
      const res = await db.from("dashboards").select("id").eq("season_id", scope.seasonId);
      return rowsOf(key2, res).map((r) => r.id);
    }
    case "teams": {
      const events = await db.from("events").select("id").eq("season_id", scope.seasonId);
      const eventIds = rowsOf(key2, events).map((r) => r.id);
      const [roster, entries] = await Promise.all([
        db.from("event_teams").select("team_id").in("event_id", eventIds),
        db.from("scouting_entries").select("team_id").in("event_id", eventIds)
      ]);
      return [
        .../* @__PURE__ */ new Set([
          ...rowsOf(key2, roster).map((r) => r.team_id),
          ...rowsOf(key2, entries).map((r) => r.team_id)
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
var FULL_USER_COLUMNS = "id, username, full_name, password_hash, role, must_change_password, disabled_at, created_at";
var PUBLIC_USER_COLUMNS = "id, username, full_name, role, must_change_password, disabled_at, created_at";
var SEASON_COLUMNS = "id, year, game_name, field_image_path, created_at, updated_at";
var EVENT_COLUMNS = "id, season_id, name, code, sort_order, created_at, updated_at";
var TEAM_COLUMNS = "id, number, name, created_at, updated_at";
var MATCH_COLUMNS = "id, event_id, match_type, number, created_at, updated_at";
var SLOT_COLUMNS = "match_id, alliance, station, team_id";
var FORM_COLUMNS = "id, season_id, kind, name, active_version_id, timer_config, created_at, updated_at";
var FORM_VERSION_COLUMNS = "id, form_id, version_no, published_at, is_locked, updated_by, created_at, updated_at";
var SCORING_RULE_COLUMNS = "id, form_id, field_key, points, option_points, created_at, updated_at";
var FORM_EXPORT_COLUMNS = "id, form_id, label, definition, created_by, created_at";
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var IN_CHUNK = 100;
var EVENT_TEAMS_READ_LIMIT = 1e3;
var FORM_EXPORTS_READ_LIMIT = 200;
function chunks(items) {
  const out = [];
  for (let i = 0; i < items.length; i += IN_CHUNK) out.push(items.slice(i, i + IN_CHUNK));
  return out;
}
function numberPrefixFilter(digits) {
  const maxDigits = String(TEAM_NUMBER_MAX).length;
  if (!/^[1-9]\d*$/.test(digits) || digits.length > maxDigits) {
    throw new Error("numberPrefixFilter: a prefix must be 1 to 5 digits, not starting with 0");
  }
  const parts = [`number.eq.${digits}`];
  for (let extra = 1; digits.length + extra <= maxDigits; extra += 1) {
    const low = Number(digits) * 10 ** extra;
    parts.push(`and(number.gte.${low},number.lte.${low + 10 ** extra - 1})`);
  }
  return parts.join(",");
}
function dbError(error) {
  return Object.assign(new Error(error.message), { code: error.code });
}
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
    async insertUser(row) {
      const { data, error } = await db.from("users").insert(row).select(FULL_USER_COLUMNS).single();
      if (error) throw dbError(error);
      return data;
    },
    async updateUser(id, patch) {
      const { data, error } = await db.from("users").update(patch).eq("id", id).select(FULL_USER_COLUMNS).single();
      if (error) throw dbError(error);
      return data;
    },
    async listUsers(options) {
      let query = db.from("users").select(PUBLIC_USER_COLUMNS);
      if (!options.includeDisabled) query = query.is("disabled_at", null);
      if (options.after) query = query.gt("username", options.after.username);
      const { data, error } = await query.order("username", { ascending: true }).order("id", { ascending: true }).limit(options.limit);
      if (error) throw dbError(error);
      return data ?? [];
    },
    async countEnabledAdmins() {
      const { count, error } = await db.from("users").select("id", { count: "exact", head: true }).eq("role", "admin").is("disabled_at", null);
      if (error) throw dbError(error);
      return count ?? 0;
    },
    // The four methods below feed syncPush's idempotency and authorization decisions (and
    // eventExists, syncPull's 404). Each THROWS on a database error: swallowed, a blip
    // read as "no row", which turned an edit of someone else's entry into a create that
    // upserted over it with the pushing author and version 1 (Phase 1B review).
    async wasApplied(opId) {
      const { data, error } = await db.from("applied_operations").select("op_id").eq("op_id", opId).maybeSingle();
      if (error) throw dbError(error);
      return data !== null;
    },
    async markApplied(opId) {
      const { error } = await db.from("applied_operations").insert({ op_id: opId });
      if (error) throw dbError(error);
    },
    async getRow(entity, id) {
      const { data, error } = await db.from(TABLE[entity]).select("*").eq("id", id).maybeSingle();
      if (error) throw dbError(error);
      return data ?? null;
    },
    async putRow(entity, id, row) {
      const { error } = await db.from(TABLE[entity]).upsert({ ...row, id });
      if (error) throw dbError(error);
    },
    // Three reads, together; the order of the answer is the order of the checks. An event
    // delete cascades to its matches, so a gone event is reported as the event.
    async missingParent(parents) {
      if (!UUID.test(parents.event_id)) return "event";
      if (parents.match_id !== null && !UUID.test(parents.match_id)) return "match";
      if (!UUID.test(parents.team_id)) return "team";
      const [event, match, team] = await Promise.all([
        db.from("events").select("id").eq("id", parents.event_id).maybeSingle(),
        parents.match_id === null ? Promise.resolve({ data: { id: null }, error: null }) : db.from("matches").select("id").eq("id", parents.match_id).maybeSingle(),
        db.from("teams").select("id").eq("id", parents.team_id).maybeSingle()
      ]);
      for (const result of [event, match, team]) if (result.error) throw dbError(result.error);
      if (event.data === null) return "event";
      if (match.data === null) return "match";
      if (team.data === null) return "team";
      return null;
    },
    async getFormFields(formVersionId) {
      const { data, error } = await db.from("form_fields").select("*").eq("form_version_id", formVersionId).order("display_order", { ascending: true }).order("key", { ascending: true });
      if (error) throw dbError(error);
      return data ?? [];
    },
    // Task 1.27: forms, versions, fields, scoring rules and saved exports. Every method
    // THROWS on a database error, keeping Postgres's code (dbError).
    async getForm(id) {
      const { data, error } = await db.from("forms").select(FORM_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw dbError(error);
      return data ?? null;
    },
    async getFormByKind(seasonId, kind) {
      const { data, error } = await db.from("forms").select(FORM_COLUMNS).eq("season_id", seasonId).eq("kind", kind).maybeSingle();
      if (error) throw dbError(error);
      return data ?? null;
    },
    async insertForm(row) {
      const { data, error } = await db.from("forms").insert(row).select(FORM_COLUMNS).single();
      if (error) throw dbError(error);
      return data;
    },
    async updateForm(id, patch) {
      const { data, error } = await db.from("forms").update(patch).eq("id", id).select(FORM_COLUMNS).single();
      if (error) throw dbError(error);
      return data;
    },
    async getFormVersion(id) {
      const { data, error } = await db.from("form_versions").select(FORM_VERSION_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw dbError(error);
      return data ?? null;
    },
    async listFormVersions(formId) {
      const { data, error } = await db.from("form_versions").select(FORM_VERSION_COLUMNS).eq("form_id", formId).order("version_no", { ascending: true });
      if (error) throw dbError(error);
      return data ?? [];
    },
    async insertFormVersion(row) {
      const { data, error } = await db.from("form_versions").insert(row).select(FORM_VERSION_COLUMNS).single();
      if (error) throw dbError(error);
      return data;
    },
    async updateFormVersion(id, patch) {
      const { data, error } = await db.from("form_versions").update(patch).eq("id", id).select(FORM_VERSION_COLUMNS).single();
      if (error) throw dbError(error);
      return data;
    },
    // Soft-deleted entries count: they are bound to the version all the same.
    async countEntriesByFormVersion(formVersionId) {
      const { count, error } = await db.from("scouting_entries").select("id", { count: "exact", head: true }).eq("form_version_id", formVersionId);
      if (error) throw dbError(error);
      return count ?? 0;
    },
    // Ids survive a save: deletes first, then ONE upsert on (form_version_id, key), so a
    // key already saved is updated in place (keeping its id) and a new one is inserted.
    // Not one transaction; re-sending the same save completes a half-done one.
    async writeFormFields(formVersionId, rows, deleteKeys) {
      for (const chunk of chunks(deleteKeys)) {
        const res2 = await db.from("form_fields").delete().eq("form_version_id", formVersionId).in("key", chunk);
        if (res2.error) throw dbError(res2.error);
      }
      if (rows.length === 0) return;
      const res = await db.from("form_fields").upsert(rows.map((row) => ({ ...row, form_version_id: formVersionId })), {
        onConflict: "form_version_id,key"
      });
      if (res.error) throw dbError(res.error);
    },
    async getScoringRules(formId) {
      const { data, error } = await db.from("scoring_rules").select(SCORING_RULE_COLUMNS).eq("form_id", formId).order("field_key", { ascending: true });
      if (error) throw dbError(error);
      return (data ?? []).map((r) => ({ ...r, points: Number(r.points) }));
    },
    // Upserted on (form_id, field_key), so a rule keeps its id; the form's rules for any
    // other key are deleted first. Not one transaction.
    async replaceScoringRules(formId, rules) {
      const keep = rules.map((r) => String(r.field_key));
      let remove = db.from("scoring_rules").delete().eq("form_id", formId);
      if (keep.length > 0) {
        remove = remove.not("field_key", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);
      }
      const removed = await remove;
      if (removed.error) throw dbError(removed.error);
      if (rules.length === 0) return;
      const res = await db.from("scoring_rules").upsert(rules.map((r) => ({ ...r, form_id: formId })), {
        onConflict: "form_id,field_key"
      });
      if (res.error) throw dbError(res.error);
    },
    async insertFormExport(row) {
      const { data, error } = await db.from("form_exports").insert(row).select(FORM_EXPORT_COLUMNS).single();
      if (error) throw dbError(error);
      return data;
    },
    async purgeFormExports(olderThan) {
      const { count, error } = await db.from("form_exports").delete({ count: "exact" }).lt("created_at", olderThan.toISOString());
      if (error) throw dbError(error);
      return count ?? 0;
    },
    // Task 1.28: the Exports picker. Bounded: exports live 24 hours, so 200 is far beyond use.
    async listFormExports() {
      const { data, error } = await db.from("form_exports").select(FORM_EXPORT_COLUMNS).order("created_at", { ascending: false }).order("id", { ascending: true }).limit(FORM_EXPORTS_READ_LIMIT);
      if (error) throw dbError(error);
      return data ?? [];
    },
    async getFormExport(id) {
      const { data, error } = await db.from("form_exports").select(FORM_EXPORT_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw dbError(error);
      return data ?? null;
    },
    // Task 1.28: one head count per version, in parallel — no rows read, no 1000-row cap, and
    // a form has a handful of versions. Live entries only: the forms list's "entries".
    async countLiveEntriesByFormVersions(versionIds) {
      const counted = await Promise.all(
        versionIds.map(async (id) => {
          const { count, error } = await db.from("scouting_entries").select("id", { count: "exact", head: true }).eq("form_version_id", id).is("deleted_at", null);
          if (error) throw dbError(error);
          return [id, count ?? 0];
        })
      );
      return new Map(counted);
    },
    // Task 1.28: names for "last edited · who", one read per IN_CHUNK ids.
    async listUserNames(ids) {
      const out = [];
      for (const chunk of chunks(ids)) {
        const { data, error } = await db.from("users").select("id, full_name").in("id", chunk);
        if (error) throw dbError(error);
        out.push(...data ?? []);
      }
      return out;
    },
    // ONE statement (decision G): form_versions, form_fields, scoring_rules and, through
    // form_versions, scouting_entries are all ON DELETE CASCADE; form_exports.form_id is
    // ON DELETE SET NULL. Nothing references scouting_entries, so nothing can refuse it.
    async deleteFormCascade(id) {
      const { error } = await db.from("forms").delete().eq("id", id);
      if (error) throw dbError(error);
    },
    // Its fields and entries cascade; the use case refuses a version with entries first.
    async deleteFormVersion(id) {
      const { error } = await db.from("form_versions").delete().eq("id", id);
      if (error) throw dbError(error);
    },
    async eventExists(eventId) {
      const { data, error } = await db.from("events").select("id").eq("id", eventId).maybeSingle();
      if (error) throw dbError(error);
      return data !== null;
    },
    async resolveScope(eventId) {
      const { data, error } = await db.from("events").select("id, season_id").eq("id", eventId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error(`resolveScope: event ${eventId} not found`);
      return { eventId: data.id, seasonId: data.season_id };
    },
    pullEntity,
    // UF.1. Paged by deleted_at: PostgREST caps a read at max_rows = 1000
    // (packages/db/supabase/config.toml), and a truncated list would leave matches behind.
    async listMatchDeletions(eventId, since) {
      const PAGE = 1e3;
      const out = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db.from("match_deletions").select("match_id, deleted_at").eq("event_id", eventId).gt("deleted_at", since).order("deleted_at", { ascending: true }).order("match_id", { ascending: true }).range(from, from + PAGE - 1);
        if (error) throw dbError(error);
        out.push(...data ?? []);
        if ((data ?? []).length < PAGE) break;
      }
      return out;
    },
    // Task 1.17b, ahead of the rest of 1.18. The singleton row is created by the skeleton
    // migration on every project; a missing one reads as nothing set up. THROWS on a
    // database error: swallowed, a blip would tell every device no competition exists.
    async getActiveContext() {
      const { data, error } = await db.from("app_settings").select("active_season_id, active_event_id").eq("id", true).maybeSingle();
      if (error) throw dbError(error);
      return {
        active_season_id: data?.active_season_id ?? null,
        active_event_id: data?.active_event_id ?? null
      };
    },
    // Task 1.18. Both ids in ONE write, so the singleton never holds a mismatched pair.
    // An upsert on the singleton's key, not an update: the skeleton migration creates the
    // row, but an update of a missing row would fail as PGRST116 with nothing to fix it.
    async setActiveContext(next) {
      const { data, error } = await db.from("app_settings").upsert(
        {
          id: true,
          active_season_id: next.active_season_id,
          active_event_id: next.active_event_id
        },
        { onConflict: "id" }
      ).select("active_season_id, active_event_id").single();
      if (error) throw dbError(error);
      return {
        active_season_id: data.active_season_id ?? null,
        active_event_id: data.active_event_id ?? null
      };
    },
    async getSeason(id) {
      const { data, error } = await db.from("seasons").select(SEASON_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw dbError(error);
      return data ?? null;
    },
    async getSeasonByYear(year) {
      const { data, error } = await db.from("seasons").select(SEASON_COLUMNS).eq("year", year).maybeSingle();
      if (error) throw dbError(error);
      return data ?? null;
    },
    async insertSeason(row) {
      const { data, error } = await db.from("seasons").insert(row).select(SEASON_COLUMNS).single();
      if (error) throw dbError(error);
      return data;
    },
    async updateSeason(id, patch) {
      const { data, error } = await db.from("seasons").update(patch).eq("id", id).select(SEASON_COLUMNS).single();
      if (error) throw dbError(error);
      return data;
    },
    async listSeasons(limit, after) {
      let query = db.from("seasons").select(SEASON_COLUMNS);
      if (after) query = query.lt("year", after.year);
      const { data, error } = await query.order("year", { ascending: false }).limit(limit);
      if (error) throw dbError(error);
      return data ?? [];
    },
    async getEvent(id) {
      const { data, error } = await db.from("events").select(EVENT_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw dbError(error);
      return data ?? null;
    },
    async insertEvent(row) {
      const { data, error } = await db.from("events").insert(row).select(EVENT_COLUMNS).single();
      if (error) throw dbError(error);
      return data;
    },
    async updateEvent(id, patch) {
      const { data, error } = await db.from("events").update(patch).eq("id", id).select(EVENT_COLUMNS).single();
      if (error) throw dbError(error);
      return data;
    },
    async listEvents(seasonId, limit, after) {
      let query = db.from("events").select(EVENT_COLUMNS).eq("season_id", seasonId);
      if (after) {
        if (!Number.isInteger(after.sort_order) || !UUID.test(after.id)) {
          throw new Error("listEvents: a keyset must be an integer sort_order and a uuid");
        }
        query = query.or(
          `sort_order.gt.${after.sort_order},and(sort_order.eq.${after.sort_order},id.gt.${after.id})`
        );
      }
      const { data, error } = await query.order("sort_order", { ascending: true }).order("id", { ascending: true }).limit(limit);
      if (error) throw dbError(error);
      return data ?? [];
    },
    // Soft-deleted entries count: they still hold positions measured against the image,
    // and a restore would bring them back re-framed. Two reads rather than an embedded
    // join: a season holds a handful of events.
    async countEntriesBySeason(seasonId) {
      const { data: events, error } = await db.from("events").select("id").eq("season_id", seasonId);
      if (error) throw dbError(error);
      const eventIds = (events ?? []).map((e) => e.id);
      if (eventIds.length === 0) return 0;
      const { count, error: countError } = await db.from("scouting_entries").select("id", { count: "exact", head: true }).in("event_id", eventIds);
      if (countError) throw dbError(countError);
      return count ?? 0;
    },
    // RB.13: live entries per scouter across the season, for the Users page. Two reads, no
    // join, like countEntriesBySeason. PostgREST caps a read at max_rows = 1000
    // (packages/db/supabase/config.toml), so the entries are paged, ordered by id.
    async countEntriesByScouterForSeason(seasonId) {
      const { data: events, error } = await db.from("events").select("id").eq("season_id", seasonId);
      if (error) throw dbError(error);
      const eventIds = (events ?? []).map((e) => e.id);
      if (eventIds.length === 0) return [];
      const PAGE = 1e3;
      const counts = /* @__PURE__ */ new Map();
      for (const chunk of chunks(eventIds)) {
        for (let from = 0; ; from += PAGE) {
          const { data, error: readError } = await db.from("scouting_entries").select("scouter_id").in("event_id", chunk).is("deleted_at", null).order("id").range(from, from + PAGE - 1);
          if (readError) throw dbError(readError);
          for (const r of data ?? []) counts.set(r.scouter_id, (counts.get(r.scouter_id) ?? 0) + 1);
          if ((data ?? []).length < PAGE) break;
        }
      }
      return [...counts].map(([scouter_id, count]) => ({ scouter_id, count }));
    },
    // Task 1.19: teams, the roster, matches and their slots. Every method THROWS on a
    // database error, keeping Postgres's code (dbError), as the season and event methods
    // do: a swallowed blip would read as "no such team" or "empty roster".
    async getTeam(id) {
      const { data, error } = await db.from("teams").select(TEAM_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw dbError(error);
      return data ?? null;
    },
    async getTeamByNumber(number) {
      const { data, error } = await db.from("teams").select(TEAM_COLUMNS).eq("number", number).maybeSingle();
      if (error) throw dbError(error);
      return data ?? null;
    },
    async insertTeam(row) {
      const { data, error } = await db.from("teams").insert(row).select(TEAM_COLUMNS).single();
      if (error) throw dbError(error);
      return data;
    },
    async updateTeam(id, patch) {
      const { data, error } = await db.from("teams").update(patch).eq("id", id).select(TEAM_COLUMNS).single();
      if (error) throw dbError(error);
      return data;
    },
    // By number, keyset on number (unique). A query is up to two keyset reads — an
    // escaped name ilike, and a number-prefix range filter when the query is digits —
    // merged by number. Each read returns the first `limit` rows of its own set past the
    // keyset, so the first `limit` of their union are exactly the page. `seasonId` is
    // unused in v1 (task 1.19). A literal `*` in the query matches any one character
    // (see escapeLikePattern): harmless in a search box, and it never widens past it.
    async listTeams(options) {
      const { query, limit, after } = options;
      if (after && !Number.isInteger(after.number)) {
        throw new Error("listTeams: a keyset must be an integer team number");
      }
      const base = () => {
        const q = db.from("teams").select(TEAM_COLUMNS);
        return after ? q.gt("number", after.number) : q;
      };
      const read = async (filter) => {
        const { data, error } = await filter(base()).order("number", { ascending: true }).limit(limit);
        if (error) throw dbError(error);
        return data ?? [];
      };
      if (!query) return read((q) => q);
      const reads = [read((q) => q.ilike("name", `%${escapeLikePattern(query)}%`))];
      if (/^[1-9]\d{0,4}$/.test(query)) reads.push(read((q) => q.or(numberPrefixFilter(query))));
      const byId = /* @__PURE__ */ new Map();
      for (const rows of await Promise.all(reads)) for (const row of rows) byId.set(row.id, row);
      return [...byId.values()].sort((a, b) => a.number - b.number).slice(0, limit);
    },
    // Two reads rather than an embedded join, like countEntriesBySeason: the live rows'
    // team ids, then those teams by number.
    async getRoster(eventId) {
      const { data, error } = await db.from("event_teams").select("team_id").eq("event_id", eventId).is("deleted_at", null).limit(EVENT_TEAMS_READ_LIMIT);
      if (error) throw dbError(error);
      const ids = (data ?? []).map((r) => r.team_id);
      if (ids.length === 0) return [];
      const teams = [];
      for (const chunk of chunks(ids)) {
        const res = await db.from("teams").select(TEAM_COLUMNS).in("id", chunk).order("number", { ascending: true });
        if (res.error) throw dbError(res.error);
        teams.push(...res.data ?? []);
      }
      return teams.sort((a, b) => a.number - b.number);
    },
    // Reads every row of the event, tombstones included, and writes only the difference:
    // inserts first (the write a foreign key can refuse, so a refusal changes nothing),
    // then revivals of each re-added team's NEWEST tombstone, then the removals'
    // tombstones. Not one transaction: a failure midway leaves part of the change, which
    // re-running the same call completes.
    async setRoster(eventId, teamIds, at) {
      const { data, error } = await db.from("event_teams").select("id, team_id, deleted_at, updated_at").eq("event_id", eventId).limit(EVENT_TEAMS_READ_LIMIT);
      if (error) throw dbError(error);
      const rows = data ?? [];
      const live = new Set(rows.filter((r) => r.deleted_at === null).map((r) => r.team_id));
      const wanted = new Set(teamIds);
      const revive = [];
      const insert = [];
      for (const teamId of wanted) {
        if (live.has(teamId)) continue;
        const tombstone = rows.filter((r) => r.team_id === teamId).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
        if (tombstone) revive.push(tombstone.id);
        else insert.push({ id: crypto.randomUUID(), event_id: eventId, team_id: teamId });
      }
      const remove = rows.filter((r) => r.deleted_at === null && !wanted.has(r.team_id)).map((r) => r.id);
      if (insert.length > 0) {
        const res = await db.from("event_teams").insert(insert);
        if (res.error) throw dbError(res.error);
      }
      for (const [ids, deletedAt] of [
        [revive, null],
        [remove, at]
      ]) {
        for (const chunk of chunks([...ids])) {
          const res = await db.from("event_teams").update({ deleted_at: deletedAt }).in("id", chunk);
          if (res.error) throw dbError(res.error);
        }
      }
    },
    async findMatch(eventId, matchType2, number) {
      const { data, error } = await db.from("matches").select(MATCH_COLUMNS).eq("event_id", eventId).eq("match_type", matchType2).eq("number", number).maybeSingle();
      if (error) throw dbError(error);
      return data ?? null;
    },
    async getMatch(id) {
      const { data, error } = await db.from("matches").select(MATCH_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw dbError(error);
      return data ?? null;
    },
    async insertMatch(row) {
      const { data, error } = await db.from("matches").insert(row).select(MATCH_COLUMNS).single();
      if (error) throw dbError(error);
      return data;
    },
    async updateMatch(id, patch) {
      const { data, error } = await db.from("matches").update(patch).eq("id", id).select(MATCH_COLUMNS).single();
      if (error) throw dbError(error);
      return data;
    },
    // Practice, qualification, playoff, then number. PostgREST cannot order by a CASE,
    // and the alphabetical order of the types is wrong, so this reads one type at a time
    // from the keyset's type onward — at most three reads a page, and one when the page
    // fills from the first type.
    async listMatches(eventId, limit, after) {
      const start = after ? MATCH_TYPES.indexOf(after.match_type) : 0;
      if (after && (start < 0 || !Number.isInteger(after.number))) {
        throw new Error("listMatches: a keyset must be a match type and an integer number");
      }
      const out = [];
      for (const matchType2 of MATCH_TYPES.slice(start)) {
        const remaining = limit - out.length;
        if (remaining <= 0) break;
        let query = db.from("matches").select(MATCH_COLUMNS).eq("event_id", eventId).eq("match_type", matchType2);
        if (after && matchType2 === after.match_type) query = query.gt("number", after.number);
        const { data, error } = await query.order("number", { ascending: true }).limit(remaining);
        if (error) throw dbError(error);
        out.push(...data ?? []);
      }
      return out;
    },
    async listMatchSlots(matchIds) {
      const slots = [];
      for (const chunk of chunks(matchIds)) {
        const { data, error } = await db.from("match_teams").select(SLOT_COLUMNS).in("match_id", chunk);
        if (error) throw dbError(error);
        slots.push(...data ?? []);
      }
      return slots;
    },
    // Writes only the difference, so an unchanged slot keeps its row and its updated_at:
    // cleared slots deleted, a changed team updated IN PLACE (the delta pull sees an
    // update; it never sees a delete), new slots inserted. Not one transaction.
    async setMatchTeams(matchId, slots) {
      const { data, error } = await db.from("match_teams").select("id, alliance, station, team_id").eq("match_id", matchId);
      if (error) throw dbError(error);
      const key2 = (s) => `${s.alliance}:${s.station}`;
      const current = new Map((data ?? []).map((row) => [key2(row), row]));
      const wanted = new Map(slots.map((slot) => [key2(slot), slot]));
      const cleared = [...current].filter(([k]) => !wanted.has(k)).map(([, row]) => row.id);
      if (cleared.length > 0) {
        const res = await db.from("match_teams").delete().in("id", cleared);
        if (res.error) throw dbError(res.error);
      }
      const insert = [];
      for (const [k, slot] of wanted) {
        const row = current.get(k);
        if (row && row.team_id === slot.team_id) continue;
        if (row) {
          const res = await db.from("match_teams").update({ team_id: slot.team_id }).eq("id", row.id);
          if (res.error) throw dbError(res.error);
        } else {
          insert.push({ id: crypto.randomUUID(), match_id: matchId, ...slot });
        }
      }
      if (insert.length > 0) {
        const res = await db.from("match_teams").insert(insert);
        if (res.error) throw dbError(res.error);
      }
    },
    // Soft-deleted entries count: the `on delete restrict` foreign key counts them too.
    async countEntriesByMatch(matchId) {
      const { count, error } = await db.from("scouting_entries").select("id", { count: "exact", head: true }).eq("match_id", matchId);
      if (error) throw dbError(error);
      return count ?? 0;
    },
    // A hard delete. The match's match_teams cascade; an entry refuses it with 23503.
    async deleteMatch(id) {
      const { error } = await db.from("matches").delete().eq("id", id);
      if (error) throw dbError(error);
    },
    // RB.20: the hard cascade deletes (SPEC-FINAL 3.9). One SQL function each (migration
    // 20261007120000_delete_cascade.sql): the entries go first, then the parent, all or nothing.
    async deleteSeason(id) {
      const { error } = await db.rpc("delete_season_cascade", { p_season_id: id });
      if (error) throw dbError(error);
    },
    async deleteEvent(id) {
      const { error } = await db.rpc("delete_event_cascade", { p_event_id: id });
      if (error) throw dbError(error);
    },
    // Head counts only, no rows read. Live entries: a soft-deleted one is already gone to
    // the admin. The event ids go out in chunks, like every `in` filter here.
    async countDeleteImpact(kind, id) {
      let eventIds = [id];
      let forms = 0;
      if (kind === "season") {
        const { data, error } = await db.from("events").select("id").eq("season_id", id);
        if (error) throw dbError(error);
        eventIds = (data ?? []).map((e) => e.id);
        const counted = await db.from("forms").select("id", { count: "exact", head: true }).eq("season_id", id);
        if (counted.error) throw dbError(counted.error);
        forms = counted.count ?? 0;
      }
      let matches = 0;
      let entries = 0;
      for (const chunk of chunks(eventIds)) {
        const m = await db.from("matches").select("id", { count: "exact", head: true }).in("event_id", chunk);
        if (m.error) throw dbError(m.error);
        const e = await db.from("scouting_entries").select("id", { count: "exact", head: true }).in("event_id", chunk).is("deleted_at", null);
        if (e.error) throw dbError(e.error);
        matches += m.count ?? 0;
        entries += e.count ?? 0;
      }
      return { events: eventIds.length, matches, entries, forms };
    },
    // The remaining methods start as loud stubs, exactly as the fake does. Each later
    // task replaces the two or three it needs. `supabaseStore` is typed `: Store`, so
    // without these the file does not compile at all.
    ...stubsFor([
      "findByLogicalKey",
      "parentsExist",
      "insertConflict",
      "listConflicts",
      "getConflict",
      "resolveConflictRow",
      "getEntry",
      "queryEntries",
      "entriesForScope",
      "listTeamEvents"
    ])
    // The spread above only carries an index signature (its keys come from a plain
    // string[]), so TS can't see that it supplies the remaining named Store methods;
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

// src/auth/password.ts
import bcrypt from "bcryptjs";
var BCRYPT_COST = 10;
var DUMMY_PASSWORD_HASH = "$2a$10$7VlgGGLSP5BKhfpuSwH9tu9Fnsni7TeRAUC5VcJocBS2rWdIZotAm";
async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_COST);
}
async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// src/auth/rateLimit.ts
var DEFAULT_MAX_KEYS = 1e4;
function makeRateLimiter(options) {
  const now = options.now ?? (() => Date.now());
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  const hits = /* @__PURE__ */ new Map();
  const sweep = (cutoff) => {
    for (const [key2, times] of hits) {
      if (times.length === 0 || times[times.length - 1] <= cutoff) hits.delete(key2);
    }
  };
  return {
    take(key2) {
      const cutoff = now() - options.windowMs;
      sweep(cutoff);
      const recent = (hits.get(key2) ?? []).filter((t) => t > cutoff);
      if (recent.length >= options.limit) {
        hits.set(key2, recent);
        return false;
      }
      recent.push(now());
      if (!hits.has(key2) && hits.size >= maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest !== void 0) hits.delete(oldest);
      }
      hits.set(key2, recent);
      return true;
    },
    reset() {
      hits.clear();
    },
    size() {
      return hits.size;
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

// src/core/commands/users.ts
var changeOwnPasswordLimiter = makeRateLimiter({ limit: 10, windowMs: 5 * 6e4 });
function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    must_change_password: user.must_change_password,
    disabled_at: user.disabled_at,
    created_at: user.created_at
  };
}
function parseInput(schema2, input) {
  const parsed = schema2.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
    throw new AppError("invalid", message);
  }
  return parsed.data;
}
function isUniqueViolation(e) {
  return typeof e === "object" && e !== null && e.code === "23505";
}
async function writeUser(username, write) {
  try {
    return await write();
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new AppError(
        "conflict",
        username ? `the username '${username}' is taken` : "that username is taken"
      );
    }
    throw e;
  }
}
async function targetUser(ctx, id) {
  const user = await ctx.store.getFullUser(id);
  if (!user) throw new AppError("not-found", "no such user", { user_id: id });
  return user;
}
async function assertNotLastEnabledAdmin(ctx, target) {
  if (target.role !== "admin" || target.disabled_at !== null) return;
  if (await ctx.store.countEnabledAdmins() <= 1) {
    throw new AppError("invalid", "this is the last enabled admin; make another admin first");
  }
}
async function createUser(caller, input, ctx) {
  assertCan(caller, "manage_users");
  const parsed = parseInput(createUserInput, input);
  if (await ctx.store.getUserByUsername(parsed.username)) {
    throw new AppError("conflict", `the username '${parsed.username}' is taken`);
  }
  const passwordHash = await hashPassword(parsed.password);
  const stored = await writeUser(
    parsed.username,
    () => ctx.store.insertUser({
      id: crypto.randomUUID(),
      username: parsed.username,
      full_name: parsed.full_name,
      role: parsed.role,
      password_hash: passwordHash,
      must_change_password: parsed.must_change
    })
  );
  return toPublicUser(stored);
}
async function setUserRole(caller, input, ctx) {
  assertCan(caller, "manage_users");
  const parsed = parseInput(setUserRoleInput, input);
  const target = await targetUser(ctx, parsed.user_id);
  if (target.role === parsed.role) return toPublicUser(target);
  await assertNotLastEnabledAdmin(ctx, target);
  const stored = await writeUser(
    null,
    () => ctx.store.updateUser(target.id, { role: parsed.role })
  );
  return toPublicUser(stored);
}
async function resetPassword(caller, input, ctx) {
  assertCan(caller, "manage_users");
  const parsed = parseInput(resetPasswordInput, input);
  const target = await targetUser(ctx, parsed.user_id);
  const passwordHash = await hashPassword(parsed.password);
  const stored = await writeUser(
    null,
    () => ctx.store.updateUser(target.id, {
      password_hash: passwordHash,
      must_change_password: parsed.must_change
    })
  );
  return toPublicUser(stored);
}
async function disableUser(caller, input, ctx) {
  assertCan(caller, "manage_users");
  const parsed = parseInput(disableUserInput, input);
  const target = await targetUser(ctx, parsed.user_id);
  if (target.disabled_at !== null) return toPublicUser(target);
  await assertNotLastEnabledAdmin(ctx, target);
  const stored = await writeUser(
    null,
    () => ctx.store.updateUser(target.id, { disabled_at: ctx.now().toISOString() })
  );
  return toPublicUser(stored);
}
async function enableUser(caller, input, ctx) {
  assertCan(caller, "manage_users");
  const parsed = parseInput(enableUserInput, input);
  const target = await targetUser(ctx, parsed.user_id);
  if (target.disabled_at === null) return toPublicUser(target);
  const stored = await writeUser(
    null,
    () => ctx.store.updateUser(target.id, { disabled_at: null })
  );
  return toPublicUser(stored);
}
async function renameUser(caller, input, ctx) {
  assertCan(caller, "manage_users");
  const parsed = parseInput(renameUserInput, input);
  const target = await targetUser(ctx, parsed.user_id);
  const patch = {};
  if (parsed.username !== void 0) {
    const existing = await ctx.store.getUserByUsername(parsed.username);
    if (existing && existing.id !== target.id) {
      throw new AppError("conflict", `the username '${parsed.username}' is taken`);
    }
    patch.username = parsed.username;
  }
  if (parsed.full_name !== void 0) patch.full_name = parsed.full_name;
  const stored = await writeUser(
    parsed.username ?? null,
    () => ctx.store.updateUser(target.id, patch)
  );
  return toPublicUser(stored);
}
async function changeOwnPassword(caller, input, ctx) {
  if (!isUser(caller)) {
    throw new AppError("forbidden", "a service caller has no password to change");
  }
  const parsed = parseInput(changeOwnPasswordInput, input);
  if (!changeOwnPasswordLimiter.take(caller.userId)) {
    throw new AppError("rate-limited", "too many attempts; wait a few minutes and try again");
  }
  const self = await ctx.store.getFullUser(caller.userId);
  if (!self) throw new AppError("unauthenticated", "that session is no longer valid");
  if (self.disabled_at !== null) {
    throw new AppError("forbidden", "this account has been disabled; ask an admin");
  }
  if (!await verifyPassword(parsed.current_password, self.password_hash)) {
    throw new AppError("invalid", "the current password is not right");
  }
  const passwordHash = await hashPassword(parsed.new_password);
  const stored = await writeUser(
    null,
    () => ctx.store.updateUser(self.id, { password_hash: passwordHash, must_change_password: false })
  );
  return toPublicUser(stored);
}

// src/core/seasonRows.ts
function toSeason(row) {
  return {
    id: row.id,
    year: row.year,
    game_name: row.game_name,
    field_image_path: row.field_image_path,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
function toEvent(row) {
  return {
    id: row.id,
    season_id: row.season_id,
    name: row.name,
    code: row.code ?? null,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
function noSuchSeason(seasonId) {
  return new AppError("not-found", "that season does not exist; it may have been deleted", {
    season_id: seasonId
  });
}
function noSuchEvent(eventId) {
  return new AppError("not-found", "that event does not exist; it may have been deleted", {
    event_id: eventId
  });
}
async function seasonOrNotFound(ctx, id) {
  const season = await ctx.store.getSeason(id);
  if (!season) throw noSuchSeason(id);
  return season;
}
async function eventOrNotFound(ctx, id) {
  const event = await ctx.store.getEvent(id);
  if (!event) throw noSuchEvent(id);
  return event;
}
var EVENTS_PAGE = 200;
async function allEventsOf(ctx, seasonId) {
  const all = [];
  let after;
  for (; ; ) {
    const page = await ctx.store.listEvents(seasonId, EVENTS_PAGE, after);
    all.push(...page);
    const last = page[page.length - 1];
    if (page.length < EVENTS_PAGE || !last) return all;
    after = { sort_order: last.sort_order, id: last.id };
  }
}
function pgCode(e) {
  if (typeof e !== "object" || e === null) return void 0;
  const code = e.code;
  return typeof code === "string" ? code : void 0;
}

// src/core/queries/listEvents.ts
import { z as z13 } from "zod";

// src/core/cursor.ts
function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
function decodeCursor(schema2, raw) {
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    decoded = void 0;
  }
  const parsed = schema2.safeParse(decoded);
  if (!parsed.success) {
    throw new AppError("invalid", "cursor is not readable; list again without one");
  }
  return parsed.data;
}

// src/core/queries/listEvents.ts
var eventCursor = z13.object({ s: z13.number().int(), i: z13.string().uuid() }).strict();
async function listEvents(caller, input, ctx) {
  void caller;
  const parsed = parseInput(listEventsInput, input);
  const limit = Math.min(parsed.limit ?? LIST_EVENTS_DEFAULT_LIMIT, LIST_EVENTS_MAX_LIMIT);
  const cursor = parsed.cursor ? decodeCursor(eventCursor, parsed.cursor) : void 0;
  const season = await seasonOrNotFound(ctx, parsed.season_id);
  const rows = await ctx.store.listEvents(
    season.id,
    limit + 1,
    cursor ? { sort_order: cursor.s, id: cursor.i } : void 0
  );
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toEvent),
    next_cursor: rows.length > limit && last ? encodeCursor({ s: last.sort_order, i: last.id }) : null
  };
}

// src/core/commands/events.ts
function nameTaken(name) {
  return new AppError("conflict", `this season already has an event named '${name}'`, { name });
}
async function writeEvent(name, seasonId, write) {
  try {
    return await write();
  } catch (e) {
    const code = pgCode(e);
    if (code === "23505") throw nameTaken(name);
    if (code === "23503") throw noSuchSeason(seasonId);
    throw e;
  }
}
async function createEvent(caller, input, ctx) {
  assertCan(caller, "manage_events");
  const parsed = parseInput(createEventInput, input);
  const season = await seasonOrNotFound(ctx, parsed.season_id);
  const siblings = await allEventsOf(ctx, season.id);
  if (siblings.some((e) => e.name === parsed.name)) throw nameTaken(parsed.name);
  const sortOrder = siblings.reduce((max, e) => Math.max(max, e.sort_order), 0) + 1;
  const stored = await writeEvent(
    parsed.name,
    season.id,
    () => ctx.store.insertEvent({
      id: crypto.randomUUID(),
      season_id: season.id,
      name: parsed.name,
      sort_order: sortOrder
    })
  );
  return toEvent(stored);
}
async function updateEvent(caller, input, ctx) {
  assertCan(caller, "manage_events");
  const parsed = parseInput(updateEventInput, input);
  const current = await eventOrNotFound(ctx, parsed.event_id);
  if (parsed.name === current.name) return toEvent(current);
  const siblings = await allEventsOf(ctx, current.season_id);
  if (siblings.some((e) => e.id !== current.id && e.name === parsed.name)) {
    throw nameTaken(parsed.name);
  }
  const stored = await writeEvent(
    parsed.name,
    current.season_id,
    () => ctx.store.updateEvent(current.id, { name: parsed.name })
  );
  return toEvent(stored);
}
async function reorderEvents(caller, input, ctx) {
  assertCan(caller, "manage_events");
  const parsed = parseInput(reorderEventsInput, input);
  const season = await seasonOrNotFound(ctx, parsed.season_id);
  const current = await allEventsOf(ctx, season.id);
  const byId = new Map(current.map((e) => [e.id, e]));
  const ids = parsed.event_ids;
  const isPermutation = ids.length === current.length && new Set(ids).size === ids.length && ids.every((id) => byId.has(id));
  if (!isPermutation) {
    throw new AppError(
      "invalid",
      `the new order must name every event in this season exactly once (it has ${current.length}); reload the events and try again`,
      { expected: current.length, received: ids.length }
    );
  }
  const items = [];
  for (const [index, id] of ids.entries()) {
    const event = byId.get(id);
    const sortOrder = index + 1;
    items.push(
      toEvent(
        event.sort_order === sortOrder ? event : await ctx.store.updateEvent(id, { sort_order: sortOrder })
      )
    );
  }
  return { items };
}
async function setActiveEvent(caller, input, ctx) {
  assertCan(caller, "manage_events");
  const parsed = parseInput(setActiveEventInput, input);
  const event = await eventOrNotFound(ctx, parsed.event_id);
  return ctx.store.setActiveContext({
    active_season_id: event.season_id,
    active_event_id: event.id
  });
}

// src/core/queries/listSeasons.ts
import { z as z14 } from "zod";
var seasonCursor = z14.object({ y: z14.number().int() }).strict();
async function listSeasons(caller, input, ctx) {
  void caller;
  const parsed = parseInput(listSeasonsInput, input);
  const limit = Math.min(parsed.limit ?? LIST_SEASONS_DEFAULT_LIMIT, LIST_SEASONS_MAX_LIMIT);
  const after = parsed.cursor ? { year: decodeCursor(seasonCursor, parsed.cursor).y } : void 0;
  const rows = await ctx.store.listSeasons(limit + 1, after);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toSeason),
    next_cursor: rows.length > limit && last ? encodeCursor({ y: last.year }) : null
  };
}

// src/core/commands/seasons.ts
var COMMITTED_IMAGES = new Set(SEASON_IMAGE_MANIFEST);
function assertImageResolves(path) {
  if (!COMMITTED_IMAGES.has(path)) {
    throw new AppError(
      "invalid",
      `there is no committed game image at ${path}; commit apps/client/public/${path} and redeploy the client first`,
      { field_image_path: path }
    );
  }
}
function yearTaken(year) {
  return new AppError(
    "conflict",
    year === void 0 ? "a season for that year already exists" : `a season for ${year} already exists`,
    year === void 0 ? void 0 : { year }
  );
}
async function writeSeason(year, write) {
  try {
    return await write();
  } catch (e) {
    if (pgCode(e) === "23505") throw yearTaken(year);
    throw e;
  }
}
async function createSeason(caller, input, ctx) {
  assertCan(caller, "manage_events");
  const parsed = parseInput(createSeasonInput, input);
  assertImageResolves(parsed.field_image_path);
  if (await ctx.store.getSeasonByYear(parsed.year)) throw yearTaken(parsed.year);
  const stored = await writeSeason(
    parsed.year,
    () => ctx.store.insertSeason({
      id: crypto.randomUUID(),
      year: parsed.year,
      game_name: parsed.game_name,
      field_image_path: parsed.field_image_path
    })
  );
  return toSeason(stored);
}
async function updateSeason(caller, input, ctx) {
  assertCan(caller, "manage_events");
  const parsed = parseInput(updateSeasonInput, input);
  const current = await seasonOrNotFound(ctx, parsed.season_id);
  const patch = {};
  if (parsed.game_name !== void 0 && parsed.game_name !== current.game_name) {
    patch.game_name = parsed.game_name;
  }
  if (parsed.year !== void 0 && parsed.year !== current.year) {
    const holder = await ctx.store.getSeasonByYear(parsed.year);
    if (holder && holder.id !== current.id) throw yearTaken(parsed.year);
    patch.year = parsed.year;
  }
  if (parsed.field_image_path !== void 0 && parsed.field_image_path !== current.field_image_path) {
    if (await ctx.store.countEntriesBySeason(current.id) > 0) {
      throw new AppError(
        "conflict",
        "this season already has scouting entries, and every position in them is measured against its current game image: a new image means a new filename and a new form version \u2014 create the new form version, do not swap the image.",
        { season_id: current.id }
      );
    }
    assertImageResolves(parsed.field_image_path);
    patch.field_image_path = parsed.field_image_path;
  }
  if (Object.keys(patch).length === 0) return toSeason(current);
  const stored = await writeSeason(parsed.year, () => ctx.store.updateSeason(current.id, patch));
  return toSeason(stored);
}
async function setActiveSeason(caller, input, ctx) {
  assertCan(caller, "manage_events");
  const parsed = parseInput(setActiveSeasonInput, input);
  const season = await seasonOrNotFound(ctx, parsed.season_id);
  let eventId = null;
  const current = await ctx.store.getActiveContext();
  if (current.active_event_id !== null) {
    const active = await ctx.store.getEvent(current.active_event_id);
    if (active && active.season_id === season.id) eventId = active.id;
  }
  if (eventId === null) {
    const [first] = await ctx.store.listEvents(season.id, 1);
    eventId = first?.id ?? null;
  }
  return ctx.store.setActiveContext({ active_season_id: season.id, active_event_id: eventId });
}

// src/core/matchRows.ts
function describeMatch(match) {
  return `${match.match_type} match ${match.number}`;
}
function noSuchMatch(matchId) {
  return new AppError("not-found", "that match does not exist; it may have been deleted", {
    match_id: matchId
  });
}
function matchTaken(match) {
  return new AppError("conflict", `${describeMatch(match)} already exists at this event`, {
    match_type: match.match_type,
    number: match.number
  });
}
async function matchOrNotFound(ctx, id) {
  const match = await ctx.store.getMatch(id);
  if (!match) throw noSuchMatch(id);
  return match;
}
var slotRank = (slot) => (slot.alliance === "red" ? 0 : 3) + slot.station;
function toSlots(slots) {
  return [...slots].sort((a, b) => slotRank(a) - slotRank(b)).map((s) => ({ alliance: s.alliance, station: s.station, team_id: s.team_id }));
}
function toMatchRow(row, slots) {
  return {
    id: row.id,
    event_id: row.event_id,
    match_type: row.match_type,
    number: row.number,
    created_at: row.created_at,
    updated_at: row.updated_at,
    slots: toSlots(slots)
  };
}
async function withSlots(ctx, rows) {
  if (rows.length === 0) return [];
  const slots = await ctx.store.listMatchSlots(rows.map((r) => r.id));
  const byMatch = /* @__PURE__ */ new Map();
  for (const slot of slots) {
    const list = byMatch.get(slot.match_id) ?? [];
    list.push(slot);
    byMatch.set(slot.match_id, list);
  }
  return rows.map((row) => toMatchRow(row, byMatch.get(row.id) ?? []));
}

// src/core/waves.ts
var WAVE = 20;
async function inWaves(items, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += WAVE) {
    results.push(...await Promise.all(items.slice(i, i + WAVE).map(fn)));
  }
  return results;
}

// src/core/queries/listMatches.ts
import { z as z15 } from "zod";
var matchCursor = z15.object({ t: matchType, n: z15.number().int() }).strict();
async function listMatches(caller, input, ctx) {
  void caller;
  const parsed = parseInput(listMatchesInput, input);
  const limit = Math.min(parsed.limit ?? LIST_MATCHES_DEFAULT_LIMIT, LIST_MATCHES_MAX_LIMIT);
  const cursor = parsed.cursor ? decodeCursor(matchCursor, parsed.cursor) : void 0;
  const event = await eventOrNotFound(ctx, parsed.event_id);
  const rows = await ctx.store.listMatches(
    event.id,
    limit + 1,
    cursor ? { match_type: cursor.t, number: cursor.n } : void 0
  );
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: await withSlots(ctx, page),
    next_cursor: rows.length > limit && last ? encodeCursor({ t: last.match_type, n: last.number }) : null
  };
}

// src/core/commands/matches.ts
async function writeMatch(key2, write) {
  try {
    return await write();
  } catch (e) {
    const code = pgCode(e);
    if (code === "23505") throw matchTaken(key2);
    if (code === "23503") throw noSuchEvent(key2.event_id);
    throw e;
  }
}
var MATCHES_PAGE = 200;
async function numbersOf(ctx, eventId, matchType2) {
  const numbers = /* @__PURE__ */ new Set();
  let after = { match_type: matchType2, number: 0 };
  for (; ; ) {
    const page = await ctx.store.listMatches(eventId, MATCHES_PAGE, after);
    for (const row of page) {
      if (row.match_type !== matchType2) return numbers;
      numbers.add(row.number);
    }
    const last = page[page.length - 1];
    if (page.length < MATCHES_PAGE || !last) return numbers;
    after = { match_type: matchType2, number: last.number };
  }
}
async function createMatch(caller, input, ctx) {
  assertCan(caller, "manage_events");
  const parsed = parseInput(createMatchInput, input);
  const event = await eventOrNotFound(ctx, parsed.event_id);
  const matchType2 = parsed.match_type;
  const rowFor = (number) => ({
    id: crypto.randomUUID(),
    event_id: event.id,
    match_type: matchType2,
    number
  });
  if (parsed.number !== void 0) {
    const key2 = { event_id: event.id, match_type: matchType2, number: parsed.number };
    if (await ctx.store.findMatch(event.id, matchType2, parsed.number)) throw matchTaken(key2);
    const stored = await writeMatch(key2, () => ctx.store.insertMatch(rowFor(key2.number)));
    return { created: 1, items: [toMatchRow(stored, [])] };
  }
  const existing = await numbersOf(ctx, event.id, matchType2);
  const wanted = Array.from({ length: parsed.count ?? 0 }, (_, i) => i + 1).filter(
    (n) => !existing.has(n)
  );
  const created = await inWaves(wanted, async (number) => {
    try {
      return await ctx.store.insertMatch(rowFor(number));
    } catch (e) {
      if (pgCode(e) === "23505") return null;
      if (pgCode(e) === "23503") throw noSuchEvent(event.id);
      throw e;
    }
  });
  const items = created.filter((row) => row !== null).sort((a, b) => a.number - b.number).map((row) => toMatchRow(row, []));
  return { created: items.length, items };
}
async function updateMatch(caller, input, ctx) {
  assertCan(caller, "manage_events");
  const parsed = parseInput(updateMatchInput, input);
  const current = await matchOrNotFound(ctx, parsed.match_id);
  const key2 = {
    event_id: current.event_id,
    match_type: parsed.match_type ?? current.match_type,
    number: parsed.number ?? current.number
  };
  const patch = {};
  if (key2.match_type !== current.match_type) patch.match_type = key2.match_type;
  if (key2.number !== current.number) patch.number = key2.number;
  if (Object.keys(patch).length === 0) return (await withSlots(ctx, [current]))[0];
  const holder = await ctx.store.findMatch(key2.event_id, key2.match_type, key2.number);
  if (holder && holder.id !== current.id) throw matchTaken(key2);
  const stored = await writeMatch(key2, () => ctx.store.updateMatch(current.id, patch));
  return (await withSlots(ctx, [stored]))[0];
}
function hasEntries(match, count) {
  const entries = count === 1 ? "1 entry" : count > 1 ? `${count} entries` : "entries";
  return new AppError(
    "conflict",
    `${describeMatch(match)} has ${entries}, so it cannot be deleted; correct the match number instead`,
    { match_id: match.id, entries: count }
  );
}
async function deleteMatch(caller, input, ctx) {
  assertCan(caller, "manage_events");
  const parsed = parseInput(deleteMatchInput, input);
  const match = await matchOrNotFound(ctx, parsed.match_id);
  const entries = await ctx.store.countEntriesByMatch(match.id);
  if (entries > 0) throw hasEntries(match, entries);
  try {
    await ctx.store.deleteMatch(match.id);
  } catch (e) {
    if (pgCode(e) === "23503") {
      throw hasEntries(match, await ctx.store.countEntriesByMatch(match.id));
    }
    throw e;
  }
  return { id: match.id, deleted: true };
}
function notOnRoster(team) {
  return new AppError(
    "invalid",
    `team ${team} is not on this event's roster; add it to the roster first`,
    { team }
  );
}
async function setMatchTeams(caller, input, ctx) {
  assertCan(caller, "manage_events");
  const parsed = parseInput(setMatchTeamsInput, input);
  const match = await matchOrNotFound(ctx, parsed.match_id);
  const current = new Map(
    (await ctx.store.listMatchSlots([match.id])).map((s) => [
      `${s.alliance}:${s.station}`,
      s.team_id
    ])
  );
  const changed2 = parsed.slots.filter(
    (s) => current.get(`${s.alliance}:${s.station}`) !== s.team_id
  );
  if (changed2.length > 0) {
    const roster = new Set((await ctx.store.getRoster(match.event_id)).map((t) => t.id));
    const stranger = changed2.find((s) => !roster.has(s.team_id));
    if (stranger) {
      const team = await ctx.store.getTeam(stranger.team_id);
      throw notOnRoster(team ? String(team.number) : stranger.team_id);
    }
  }
  try {
    await ctx.store.setMatchTeams(match.id, parsed.slots);
  } catch (e) {
    const code = pgCode(e);
    if (code === "23503") {
      if (!await ctx.store.getMatch(match.id)) throw noSuchMatch(match.id);
      throw new AppError(
        "not-found",
        "one of those teams no longer exists; reload the roster and try again",
        { match_id: match.id }
      );
    }
    if (code === "23505") {
      throw new AppError(
        "conflict",
        "this match's teams changed while they were being saved; reload the match and try again",
        { match_id: match.id }
      );
    }
    throw e;
  }
  return toMatchRow(match, await ctx.store.listMatchSlots([match.id]));
}
async function ensureMatch(caller, input, ctx) {
  assertCan(caller, "ensure_match");
  const parsed = parseInput(ensureMatchInput, input);
  const find = () => ctx.store.findMatch(parsed.event_id, parsed.match_type, parsed.number);
  if (!await ctx.store.eventExists(parsed.event_id)) throw noSuchEvent(parsed.event_id);
  const existing = await find();
  if (existing) return { id: existing.id, created: false };
  try {
    await ctx.store.insertMatch({
      id: parsed.id,
      event_id: parsed.event_id,
      match_type: parsed.match_type,
      number: parsed.number
    });
  } catch (e) {
    const code = pgCode(e);
    if (code === "23505") {
      const winner = await find();
      if (winner) return { id: winner.id, created: false };
      const holder = await ctx.store.getMatch(parsed.id);
      if (holder) {
        throw new AppError(
          "conflict",
          `this match id already belongs to ${describeMatch(holder)}; it cannot name another match`,
          { id: parsed.id }
        );
      }
    }
    if (code === "23503") throw noSuchEvent(parsed.event_id);
    throw e;
  }
  return { id: parsed.id, created: true };
}

// src/core/teamRows.ts
function toTeam(row) {
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
function toRosterRow(row) {
  return { team_id: row.id, number: row.number, name: row.name };
}
function noSuchTeam(teamId) {
  return new AppError("not-found", "that team does not exist; it may have been deleted", {
    team_id: teamId
  });
}
async function teamOrNotFound(ctx, id) {
  const team = await ctx.store.getTeam(id);
  if (!team) throw noSuchTeam(id);
  return team;
}

// src/core/queries/listTeams.ts
import { z as z16 } from "zod";
var teamCursor = z16.object({ n: z16.number().int() }).strict();
async function listTeams(caller, input, ctx) {
  void caller;
  const parsed = parseInput(listTeamsInput, input);
  const limit = Math.min(parsed.limit ?? LIST_TEAMS_DEFAULT_LIMIT, LIST_TEAMS_MAX_LIMIT);
  const after = parsed.cursor ? { number: decodeCursor(teamCursor, parsed.cursor).n } : void 0;
  const rows = await ctx.store.listTeams({ query: parsed.query, limit: limit + 1, after });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toTeam),
    next_cursor: rows.length > limit && last ? encodeCursor({ n: last.number }) : null
  };
}

// src/core/queries/roster.ts
async function listEventRoster(caller, input, ctx) {
  void caller;
  const parsed = parseInput(listEventRosterInput, input);
  const event = await eventOrNotFound(ctx, parsed.event_id);
  return { items: (await ctx.store.getRoster(event.id)).map(toRosterRow) };
}

// src/core/commands/teams.ts
function numberTaken(number) {
  return new AppError("conflict", `team ${number} already exists`, { number });
}
async function createTeam(caller, input, ctx) {
  assertCan(caller, "manage_events");
  const parsed = parseInput(createTeamInput, input);
  if (await ctx.store.getTeamByNumber(parsed.number)) throw numberTaken(parsed.number);
  try {
    const stored = await ctx.store.insertTeam({
      id: crypto.randomUUID(),
      number: parsed.number,
      name: parsed.name
    });
    return toTeam(stored);
  } catch (e) {
    if (pgCode(e) === "23505") throw numberTaken(parsed.number);
    throw e;
  }
}
async function updateTeam(caller, input, ctx) {
  assertCan(caller, "manage_events");
  const parsed = parseInput(updateTeamInput, input);
  const current = await teamOrNotFound(ctx, parsed.team_id);
  if (parsed.name === current.name) return toTeam(current);
  return toTeam(await ctx.store.updateTeam(current.id, { name: parsed.name }));
}
async function setEventRoster(caller, input, ctx) {
  assertCan(caller, "manage_events");
  const parsed = parseInput(setEventRosterInput, input);
  const event = await eventOrNotFound(ctx, parsed.event_id);
  const live = new Set((await ctx.store.getRoster(event.id)).map((t) => t.id));
  const added = parsed.team_ids.filter((id) => !live.has(id));
  const found = await inWaves(added, (id) => ctx.store.getTeam(id));
  const missing = added.find((_, i) => !found[i]);
  if (missing !== void 0) throw noSuchTeam(missing);
  try {
    await ctx.store.setRoster(event.id, parsed.team_ids, ctx.now().toISOString());
  } catch (e) {
    const code = pgCode(e);
    if (code === "23503") {
      if (!await ctx.store.getEvent(event.id)) throw noSuchEvent(event.id);
      throw new AppError(
        "not-found",
        "one of those teams no longer exists; reload the teams and try again",
        { event_id: event.id }
      );
    }
    if (code === "23505") {
      throw new AppError(
        "conflict",
        "this event's roster changed while it was being saved; reload it and try again",
        { event_id: event.id }
      );
    }
    throw e;
  }
  return { items: (await ctx.store.getRoster(event.id)).map(toRosterRow) };
}

// src/core/commands/deleteCompetition.ts
var TYPE_NAME_EXACTLY = "Type the name exactly to delete.";
function refuseActive(message, details) {
  return new AppError("conflict", message, details);
}
function assertConfirmed(typed, name) {
  if (typed !== name) throw new AppError("invalid", TYPE_NAME_EXACTLY);
}
async function deleteSeason(caller, input, ctx) {
  assertCan(caller, "delete_objects");
  const parsed = parseInput(deleteSeasonInput, input);
  const season = await seasonOrNotFound(ctx, parsed.season_id);
  const active = await ctx.store.getActiveContext();
  let holdsDefault = false;
  if (active.active_event_id !== null) {
    const event = await ctx.store.getEvent(active.active_event_id);
    holdsDefault = event?.season_id === season.id;
  }
  if (active.active_season_id === season.id || holdsDefault) {
    throw refuseActive(SWITCH_SEASON_FIRST, { season_id: season.id });
  }
  const impact = await ctx.store.countDeleteImpact("season", season.id);
  if (parsed.dry_run) return { deleted: false, ...impact };
  assertConfirmed(parsed.confirm_name, String(season.year));
  await ctx.store.deleteSeason(season.id);
  return { deleted: true, ...impact };
}
async function deleteEvent(caller, input, ctx) {
  assertCan(caller, "delete_objects");
  const parsed = parseInput(deleteEventInput, input);
  const event = await eventOrNotFound(ctx, parsed.event_id);
  const active = await ctx.store.getActiveContext();
  if (active.active_event_id === event.id) {
    throw refuseActive(SWITCH_EVENT_FIRST, { event_id: event.id });
  }
  const impact = await ctx.store.countDeleteImpact("event", event.id);
  if (parsed.dry_run) return { deleted: false, ...impact };
  assertConfirmed(parsed.confirm_name, event.name);
  await ctx.store.deleteEvent(event.id);
  return { deleted: true, ...impact };
}

// src/core/forms/version.ts
var isSelect = (type) => type === "single_select" || type === "multi_select";
function optionValues2(config2) {
  const options = config2.options;
  if (!Array.isArray(options)) return [];
  return options.map(
    (option2) => typeof option2 === "object" && option2 !== null ? String(option2.value) : ""
  );
}
var sameList = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
function isStructuralChange(current, next) {
  const currentLive = new Map(current.filter((f) => !f.deprecated).map((f) => [f.key, f]));
  const nextLive = next.filter((f) => !f.deprecated);
  const nextKeys = new Set(nextLive.map((f) => f.key));
  for (const field of nextLive) {
    const existing = currentLive.get(field.key);
    if (!existing) return true;
    if (existing.type !== field.type) return true;
    if (isSelect(field.type) && !sameList(optionValues2(existing.config), optionValues2(field.config))) {
      return true;
    }
  }
  for (const key2 of currentLive.keys()) {
    if (!nextKeys.has(key2)) return true;
  }
  return false;
}

// src/core/commands/forms.ts
var DRAFT_COLUMNS = [
  "key",
  "label",
  "help_text",
  "type",
  "section",
  "display_order",
  "required",
  "default_value",
  "config",
  "visibility_condition",
  "description",
  "unit",
  "phase",
  "direction",
  "category",
  "expected_range",
  "include_in_ai_context",
  "is_ordinal"
];
var IN_PLACE_COLUMNS = [
  "label",
  "help_text",
  "config",
  "expected_range",
  "display_order",
  "section",
  "description",
  "unit",
  "phase",
  "direction",
  "category",
  "include_in_ai_context",
  "is_ordinal",
  "required",
  "default_value",
  "visibility_condition"
];
var MEANING_PATHS = /* @__PURE__ */ new Set(["description", "unit", "phase", "direction"]);
function userIdOf(caller) {
  if (!isUser(caller)) throw new AppError("forbidden", "a service caller may not edit forms");
  return caller.userId;
}
function toFormRow(row) {
  return {
    id: row.id,
    season_id: row.season_id,
    kind: row.kind,
    name: row.name,
    active_version_id: row.active_version_id ?? null,
    timer_config: row.timer_config,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
function toFieldRow(field) {
  const row = field;
  return {
    id: row.id,
    form_version_id: row.form_version_id,
    key: row.key,
    label: row.label,
    help_text: row.help_text ?? null,
    type: row.type,
    section: row.section ?? null,
    display_order: row.display_order,
    required: row.required,
    default_value: row.default_value ?? null,
    config: row.config ?? {},
    visibility_condition: row.visibility_condition ?? null,
    deprecated: row.deprecated,
    description: row.description ?? null,
    unit: row.unit ?? null,
    phase: row.phase ?? null,
    direction: row.direction ?? null,
    category: row.category ?? null,
    expected_range: row.expected_range ?? null,
    include_in_ai_context: row.include_in_ai_context ?? null,
    is_ordinal: row.is_ordinal ?? null
  };
}
function draftColumns(field) {
  const out = {};
  for (const column of DRAFT_COLUMNS) out[column] = field[column] ?? null;
  out.config = field.config ?? {};
  out.required = field.required ?? false;
  return out;
}
function toDraft(field) {
  return {
    key: field.key,
    label: field.label,
    help_text: field.help_text ?? null,
    type: field.type,
    section: field.section ?? null,
    display_order: field.display_order,
    required: field.required ?? false,
    default_value: field.default_value ?? null,
    config: field.config ?? {},
    visibility_condition: field.visibility_condition ?? null,
    deprecated: false,
    description: field.description ?? null,
    unit: field.unit ?? null,
    phase: field.phase ?? null,
    direction: field.direction ?? null,
    category: field.category ?? null,
    expected_range: field.expected_range ?? null,
    include_in_ai_context: field.include_in_ai_context ?? null,
    is_ordinal: field.is_ordinal ?? null
  };
}
async function formOrNotFound(ctx, id) {
  const form = await ctx.store.getForm(id);
  if (!form) {
    throw new AppError("not-found", "that form does not exist; it may have been deleted", {
      form_id: id
    });
  }
  return form;
}
async function versionOrNotFound(ctx, id) {
  const version = await ctx.store.getFormVersion(id);
  if (!version) {
    throw new AppError("not-found", "that form version does not exist; it may have been deleted", {
      form_version_id: id
    });
  }
  return version;
}
var newestOf = (versions) => [...versions].sort((a, b) => b.version_no - a.version_no)[0];
var draftOf = (versions) => versions.find((v) => v.published_at === null);
async function stamp(ctx, versionId, userId2) {
  await ctx.store.updateFormVersion(versionId, { updated_by: userId2 });
}
async function stampLockIfBound(ctx, version) {
  if (version.is_locked) return;
  if (await ctx.store.countEntriesByFormVersion(version.id) > 0) {
    await ctx.store.updateFormVersion(version.id, { is_locked: true });
  }
}
function checkFields(live) {
  const definition = [];
  const incomplete = [];
  const siblings = live.map((f, i) => ({ id: `field-${i}`, ...f }));
  for (const field of siblings) {
    for (const issue of validateFieldDefinition(field)) {
      (MEANING_PATHS.has(issue.path) ? incomplete : definition).push({
        field_key: field.key,
        ...issue
      });
    }
    for (const issue of validateVisibilityCondition(field, siblings)) {
      definition.push({ field_key: field.key, ...issue });
    }
    if (field.type === "computed") {
      const config2 = FIELD_TYPE_CONFIG.computed.safeParse(field.config);
      const parsed = config2.success ? config2.data : null;
      if (parsed?.expression) {
        for (const issue of validateExpr(parsed.expression, siblings, parsed.result_type)) {
          definition.push({
            field_key: field.key,
            path: `config.${issue.path}`,
            message: issue.message
          });
        }
      }
    }
  }
  return { definition, incomplete };
}
function publishOnlyIssues(live) {
  const issues = [];
  for (const field of live) {
    if (field.type !== "computed") continue;
    const config2 = FIELD_TYPE_CONFIG.computed.safeParse(field.config);
    if (config2.success && config2.data.expression === null) {
      issues.push({
        field_key: field.key,
        path: "config.expression",
        message: "a computed field needs its expression before the form can be published"
      });
    }
  }
  if (!live.some((f) => f.type !== "section")) {
    issues.push({
      field_key: null,
      path: "fields",
      message: "a form needs at least one data field before it can be published"
    });
  }
  return issues;
}
function definitionError(issues) {
  const first = issues[0];
  const one = `${first.field_key ?? "the form"}: ${first.message}`;
  const summary = issues.length === 1 ? one : `${issues.length} problems in the form definition; first, ${one}`;
  return new AppError("invalid", summary, { reason: "invalid-definition", issues });
}
function resolveIdentity(incoming, target, lastType) {
  const seenKeys = /* @__PURE__ */ new Set();
  const seenIds = /* @__PURE__ */ new Set();
  for (const { id, draft } of incoming) {
    if (seenKeys.has(draft.key)) {
      throw new AppError(
        "invalid",
        `two fields have the key '${draft.key}'; a key names one field`,
        {
          reason: "duplicate-key",
          key: draft.key
        }
      );
    }
    seenKeys.add(draft.key);
    if (id !== void 0) {
      if (seenIds.has(id)) {
        throw new AppError("invalid", "two fields name the same saved field", {
          reason: "duplicate-field-id",
          field_id: id
        });
      }
      seenIds.add(id);
    }
  }
  const byId = new Map(target.map((f) => [f.id, f]));
  const liveByKey = new Map(target.filter((f) => !f.deprecated).map((f) => [f.key, f]));
  const deprecatedByKey = new Map(target.filter((f) => f.deprecated).map((f) => [f.key, f]));
  const assertRevivable = (draft) => {
    const was = lastType.get(draft.key);
    if (was !== void 0 && was !== draft.type) {
      throw new AppError(
        "invalid",
        `the key '${draft.key}' was last used by a removed ${was} field of this form; bring it back as a ${was}, or give the new field another key`,
        { reason: "key-retired", key: draft.key, last_type: was }
      );
    }
  };
  const matched = /* @__PURE__ */ new Map();
  for (const { id, draft } of incoming) {
    if (id !== void 0) {
      const saved = byId.get(id);
      if (!saved) {
        throw new AppError("invalid", "a field names a saved field this version does not have", {
          reason: "unknown-field-id",
          field_id: id
        });
      }
      if (saved.key !== draft.key) {
        throw new AppError("invalid", "a saved field's key never changes", {
          reason: "key-change",
          field_id: id,
          key_was: saved.key,
          key_now: draft.key
        });
      }
      if (saved.deprecated) assertRevivable(draft);
      matched.set(draft.key, saved.id);
      continue;
    }
    const live = liveByKey.get(draft.key);
    if (live) {
      matched.set(draft.key, live.id);
      continue;
    }
    assertRevivable(draft);
    const removed = deprecatedByKey.get(draft.key);
    if (removed) matched.set(draft.key, removed.id);
  }
  return matched;
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
function changed(row, existing) {
  if (!existing) return true;
  const before = existing;
  return Object.keys(row).some((column) => stable(row[column]) !== stable(before[column]));
}
async function formHistory(ctx, versions) {
  const out = /* @__PURE__ */ new Map();
  for (const version of versions) out.set(version.id, await ctx.store.getFormFields(version.id));
  return out;
}
function lastTypes(versions, byVersion) {
  const out = /* @__PURE__ */ new Map();
  for (const version of [...versions].sort((a, b) => b.version_no - a.version_no)) {
    for (const field of byVersion.get(version.id) ?? []) {
      if (!out.has(field.key)) out.set(field.key, field.type);
    }
  }
  return out;
}
async function fork(ctx, userId2, form, versions, carriedFrom, drafts) {
  const versionNo = Math.max(0, ...versions.map((v) => v.version_no)) + 1;
  let created;
  try {
    created = await ctx.store.insertFormVersion({
      id: crypto.randomUUID(),
      form_id: form.id,
      version_no: versionNo,
      updated_by: userId2
    });
  } catch (e) {
    if (pgCode(e) === "23505") {
      throw new AppError(
        "conflict",
        "another save just created a version of this form; reload it",
        {
          reason: "version-race",
          form_id: form.id
        }
      );
    }
    throw e;
  }
  try {
    const live = new Set(drafts.map((d) => d.key));
    const rows = [
      ...drafts.map((d) => ({ id: crypto.randomUUID(), ...draftColumns(d), deprecated: false })),
      ...carriedFrom.filter((f) => !live.has(f.key)).map((f) => ({ id: crypto.randomUUID(), ...draftColumns(f), deprecated: true }))
    ];
    await ctx.store.writeFormFields(created.id, rows, []);
  } catch (e) {
    await ctx.store.deleteFormVersion(created.id).catch(() => void 0);
    throw e;
  }
  return created;
}
var CHOICE_LISTS = /* @__PURE__ */ new Set(["options", "event_types"]);
var choiceValues = (list) => Array.isArray(list) ? list.map((o) => String(o?.value)) : [];
var choiceLabels = (list) => new Map(
  (Array.isArray(list) ? list : []).map((o) => [
    String(o?.value),
    o?.label
  ])
);
function carryConfig(before, after, twin) {
  const out = { ...twin };
  for (const key2 of /* @__PURE__ */ new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (stable(before[key2]) === stable(after[key2])) continue;
    const reshaped = CHOICE_LISTS.has(key2) && Array.isArray(out[key2]) && stable(choiceValues(out[key2])) !== stable(choiceValues(before[key2]));
    if (reshaped) {
      const was = choiceLabels(before[key2]);
      const now = choiceLabels(after[key2]);
      out[key2] = out[key2].map((choice) => {
        const value = String(choice.value);
        return now.has(value) && stable(now.get(value)) !== stable(was.get(value)) ? { ...choice, label: now.get(value) } : choice;
      });
    } else if (after[key2] === void 0) {
      delete out[key2];
    } else {
      out[key2] = after[key2];
    }
  }
  return out;
}
async function carryToDraft(ctx, userId2, draft, draftFields, edits) {
  const twins = new Map(draftFields.filter((f) => !f.deprecated).map((f) => [f.key, f]));
  const writes = [];
  for (const { existing, row } of edits) {
    const twin = twins.get(existing.key);
    if (!twin || twin.type !== existing.type) continue;
    const before = draftColumns(existing);
    const next = { id: twin.id, ...draftColumns(twin), deprecated: false };
    for (const column of IN_PLACE_COLUMNS) {
      if (stable(row[column]) === stable(before[column])) continue;
      next[column] = column === "config" ? carryConfig(
        before.config,
        row.config,
        next.config
      ) : row[column];
    }
    if (changed(next, twin)) writes.push(next);
  }
  if (writes.length === 0) return;
  await ctx.store.writeFormFields(draft.id, writes, []);
  await stamp(ctx, draft.id, userId2);
}
async function writeFieldSet(ctx, userId2, form, target, incoming, alwaysFork = false) {
  const versions = await ctx.store.listFormVersions(form.id);
  const history = await formHistory(ctx, versions);
  const current = target ? history.get(target.id) ?? [] : [];
  const matched = resolveIdentity(incoming, current, lastTypes(versions, history));
  const drafts = incoming.map((f) => f.draft);
  const { definition, incomplete } = checkFields(drafts);
  if (target && target.published_at === null && !alwaysFork) {
    if (definition.length > 0) throw definitionError(definition);
    await stampLockIfBound(ctx, target);
    const byKey = new Map(current.map((f) => [f.key, f]));
    const rows = drafts.map((d) => ({
      id: matched.get(d.key) ?? crypto.randomUUID(),
      ...draftColumns(d),
      deprecated: false
    }));
    const wanted = new Set(drafts.map((d) => d.key));
    for (const field of current) {
      if (field.deprecated || wanted.has(field.key)) continue;
      rows.push({ id: field.id, ...draftColumns(field), deprecated: true });
    }
    const writes = rows.filter((row) => changed(row, byKey.get(String(row.key))));
    await ctx.store.writeFormFields(target.id, writes, []);
    await stamp(ctx, target.id, userId2);
    return { version: target, forked: false, incomplete };
  }
  if (target && !alwaysFork && !isStructuralChange(current, drafts)) {
    const all = [...definition, ...incomplete];
    if (all.length > 0) throw definitionError(all);
    await stampLockIfBound(ctx, target);
    const byKey = new Map(current.filter((f) => !f.deprecated).map((f) => [f.key, f]));
    const writes = [];
    const edits = [];
    for (const draft2 of drafts) {
      const existing = byKey.get(draft2.key);
      const row = {
        id: existing.id,
        ...draftColumns(existing),
        deprecated: false
      };
      for (const column of IN_PLACE_COLUMNS) row[column] = draftColumns(draft2)[column];
      if (changed(row, existing)) {
        writes.push(row);
        edits.push({ existing, row });
      }
    }
    await ctx.store.writeFormFields(target.id, writes, []);
    await stamp(ctx, target.id, userId2);
    const open = draftOf(versions);
    if (open && edits.length > 0) {
      await carryToDraft(ctx, userId2, open, history.get(open.id) ?? [], edits);
    }
    return { version: target, forked: false, incomplete };
  }
  if (definition.length > 0) throw definitionError(definition);
  const draft = draftOf(versions);
  if (draft) {
    throw new AppError("conflict", `draft v${draft.version_no} already exists; edit it`, {
      reason: "draft-exists",
      draft_version_id: draft.id,
      version_no: draft.version_no
    });
  }
  if (target) await stampLockIfBound(ctx, target);
  const created = await fork(ctx, userId2, form, versions, current, drafts);
  return { version: created, forked: true, incomplete };
}
async function savedOutput(ctx, written) {
  const fields = await ctx.store.getFormFields(written.version.id);
  const after = await ctx.store.getFormVersion(written.version.id);
  return {
    form_version_id: written.version.id,
    new_version_id: written.forked ? written.version.id : null,
    version_no: written.version.version_no,
    updated_at: after?.updated_at ?? written.version.updated_at,
    fields: fields.map(toFieldRow),
    incomplete: written.incomplete
  };
}
async function createForm(caller, input, ctx) {
  assertCan(caller, "manage_forms");
  const userId2 = userIdOf(caller);
  const parsed = parseInput(createFormInput, input);
  await seasonOrNotFound(ctx, parsed.season_id);
  const taken = () => new AppError("conflict", `this season already has a ${parsed.kind} form`, {
    reason: "form-exists",
    kind: parsed.kind
  });
  if (await ctx.store.getFormByKind(parsed.season_id, parsed.kind)) throw taken();
  let form;
  try {
    form = await ctx.store.insertForm({
      id: crypto.randomUUID(),
      season_id: parsed.season_id,
      kind: parsed.kind,
      name: parsed.name
    });
  } catch (e) {
    if (pgCode(e) === "23505") throw taken();
    throw e;
  }
  try {
    const draft = await ctx.store.insertFormVersion({
      id: crypto.randomUUID(),
      form_id: form.id,
      version_no: 1,
      updated_by: userId2
    });
    return { id: form.id, draft_version_id: draft.id };
  } catch (e) {
    await ctx.store.deleteFormCascade(form.id).catch(() => void 0);
    throw e;
  }
}
async function updateForm(caller, input, ctx) {
  assertCan(caller, "manage_forms");
  const userId2 = userIdOf(caller);
  const parsed = parseInput(updateFormInput, input);
  const form = await formOrNotFound(ctx, parsed.form_id);
  const patch = {};
  if (parsed.name !== void 0) patch.name = parsed.name;
  if (parsed.timer_config !== void 0) patch.timer_config = parsed.timer_config;
  const row = await ctx.store.updateForm(form.id, patch);
  const versions = await ctx.store.listFormVersions(form.id);
  const stamped = draftOf(versions) ?? versions.find((v) => v.id === form.active_version_id);
  if (stamped) await stamp(ctx, stamped.id, userId2);
  return toFormRow(row);
}
async function saveDraftFields(caller, input, ctx) {
  assertCan(caller, "manage_forms");
  const userId2 = userIdOf(caller);
  const parsed = parseInput(saveDraftFieldsInput, input);
  const target = await versionOrNotFound(ctx, parsed.form_version_id);
  if (parsed.base_updated_at !== void 0 && Date.parse(parsed.base_updated_at) !== Date.parse(target.updated_at)) {
    throw new AppError("conflict", "someone else saved this version; reload it", {
      reason: "stale-version",
      updated_at: target.updated_at
    });
  }
  const form = await formOrNotFound(ctx, target.form_id);
  const incoming = parsed.fields.map((f) => ({ id: f.id, draft: toDraft(f) }));
  return savedOutput(ctx, await writeFieldSet(ctx, userId2, form, target, incoming));
}
async function publishFormVersion(caller, input, ctx) {
  assertCan(caller, "manage_forms");
  const userId2 = userIdOf(caller);
  const parsed = parseInput(publishFormVersionInput, input);
  const version = await versionOrNotFound(ctx, parsed.form_version_id);
  const form = await formOrNotFound(ctx, version.form_id);
  if (version.published_at !== null) {
    throw new AppError("invalid", `v${version.version_no} is already published`, {
      reason: "already-published"
    });
  }
  const live = (await ctx.store.getFormFields(version.id)).filter((f) => !f.deprecated);
  const { definition, incomplete } = checkFields(live);
  const issues = [...definition, ...incomplete, ...publishOnlyIssues(live)];
  if (issues.length > 0) throw definitionError(issues);
  const publishedAt = ctx.now().toISOString();
  await ctx.store.updateFormVersion(version.id, { published_at: publishedAt, updated_by: userId2 });
  let activeVersionId = form.active_version_id ?? null;
  const newest = newestOf(await ctx.store.listFormVersions(form.id));
  if (newest?.id === version.id) {
    await ctx.store.updateForm(form.id, { active_version_id: version.id });
    activeVersionId = version.id;
  }
  return {
    form_version_id: version.id,
    published_at: publishedAt,
    active_version_id: activeVersionId
  };
}
async function restoreFormVersion(caller, input, ctx) {
  assertCan(caller, "manage_forms");
  const userId2 = userIdOf(caller);
  const parsed = parseInput(restoreFormVersionInput, input);
  const version = await versionOrNotFound(ctx, parsed.form_version_id);
  const form = await formOrNotFound(ctx, version.form_id);
  if (version.published_at === null) {
    throw new AppError("invalid", "a draft cannot be restored; publish it instead", {
      reason: "not-published"
    });
  }
  await ctx.store.updateForm(form.id, { active_version_id: version.id });
  await stamp(ctx, version.id, userId2);
  return { active_version_id: version.id };
}
async function deleteFormVersion(caller, input, ctx) {
  assertCan(caller, "manage_forms");
  const parsed = parseInput(deleteFormVersionInput, input);
  const version = await versionOrNotFound(ctx, parsed.form_version_id);
  const form = await formOrNotFound(ctx, version.form_id);
  const entries = await ctx.store.countEntriesByFormVersion(version.id);
  if (entries > 0) {
    throw new AppError(
      "invalid",
      `this version has ${entries} ${entries === 1 ? "entry" : "entries"} bound to it and cannot be deleted; delete the form to remove them, or leave it`,
      { reason: "has-entries", entries }
    );
  }
  if (version.published_at !== null) {
    throw new AppError(
      "invalid",
      `v${version.version_no} is published, and a device may still hold entries for it that have not reached the server; only a draft can be deleted on its own. Delete the whole form to remove it`,
      { reason: "published" }
    );
  }
  if (form.active_version_id === version.id) {
    throw new AppError(
      "invalid",
      "this is the active version; deleting it would leave the form with nothing to scout. Restore another version first",
      { reason: "active-version" }
    );
  }
  await ctx.store.deleteFormVersion(version.id);
  return { deleted: true };
}
async function deleteForm(caller, input, ctx) {
  assertCan(caller, "manage_forms");
  const parsed = parseInput(deleteFormInput, input);
  const form = await formOrNotFound(ctx, parsed.form_id);
  const versions = await ctx.store.listFormVersions(form.id);
  let entries = 0;
  for (const version of versions) entries += await ctx.store.countEntriesByFormVersion(version.id);
  if (parsed.dry_run) return { versions: versions.length, entries, deleted: false };
  await ctx.store.deleteFormCascade(form.id);
  return { versions: versions.length, entries, deleted: true };
}
async function exportableVersion(ctx, form, versionId) {
  const versions = await ctx.store.listFormVersions(form.id);
  if (versionId !== void 0) {
    const version = versions.find((v) => v.id === versionId);
    if (!version) {
      throw new AppError(
        "not-found",
        "that form version does not exist; it may have been deleted",
        {
          form_version_id: versionId
        }
      );
    }
    if (version.published_at !== null && version.id !== form.active_version_id) {
      throw new AppError("invalid", "only the draft or the active version can be exported", {
        reason: "not-exportable"
      });
    }
    return version;
  }
  const chosen = draftOf(versions) ?? versions.find((v) => v.id === form.active_version_id);
  if (!chosen) {
    throw new AppError("invalid", "this form has no draft and no active version to export", {
      reason: "not-exportable"
    });
  }
  return chosen;
}
async function definitionOf(ctx, form, version) {
  const live = (await ctx.store.getFormFields(version.id)).filter((f) => !f.deprecated);
  const keys = new Set(live.map((f) => f.key));
  const rules = (await ctx.store.getScoringRules(form.id)).filter((r) => keys.has(r.field_key)).sort((a, b) => a.field_key < b.field_key ? -1 : a.field_key > b.field_key ? 1 : 0).map((r) => ({
    field_key: r.field_key,
    points: Number(r.points),
    option_points: r.option_points ?? null
  }));
  return {
    format: FORM_DEFINITION_FORMAT,
    kind: form.kind,
    name: form.name,
    timer_config: form.timer_config,
    fields: live.map(draftColumns),
    scoring_rules: rules
  };
}
async function exportForm(caller, input, ctx) {
  assertCan(caller, "manage_forms");
  const parsed = parseInput(exportFormInput, input);
  const form = await formOrNotFound(ctx, parsed.form_id);
  return definitionOf(ctx, form, await exportableVersion(ctx, form, parsed.form_version_id));
}
function toExportSummary(row, creator, now) {
  const definition = row.definition;
  const expiresAt = Date.parse(row.created_at) + FORM_EXPORT_TTL_MS;
  return {
    id: row.id,
    form_id: row.form_id ?? null,
    kind: definition?.kind === "super" ? "super" : "match",
    label: row.label,
    // Live, non-section fields: the count every form surface shows (task 1.28).
    field_count: Array.isArray(definition?.fields) ? countDataFields(definition.fields) : 0,
    created_by: creator,
    created_at: row.created_at,
    expires_at: new Date(expiresAt).toISOString(),
    expires_in_seconds: Math.max(0, Math.floor((expiresAt - now.getTime()) / 1e3))
  };
}
async function saveFormExport(caller, input, ctx) {
  assertCan(caller, "manage_forms");
  const userId2 = userIdOf(caller);
  const parsed = parseInput(saveFormExportInput, input);
  const form = await formOrNotFound(ctx, parsed.form_id);
  const version = await exportableVersion(ctx, form, parsed.form_version_id);
  const definition = await definitionOf(ctx, form, version);
  const now = ctx.now();
  await ctx.store.purgeFormExports(new Date(now.getTime() - FORM_EXPORT_TTL_MS));
  const label = version.published_at === null ? `${form.name} \xB7 draft v${version.version_no}` : `${form.name} \xB7 v${version.version_no}`;
  const row = await ctx.store.insertFormExport({
    id: crypto.randomUUID(),
    form_id: form.id,
    label,
    definition,
    created_by: userId2
  });
  const creator = await ctx.store.getFullUser(userId2);
  return toExportSummary(row, { id: userId2, full_name: creator?.full_name ?? "" }, now);
}
function parseDefinition(raw) {
  const parsed = formDefinition.safeParse(raw);
  if (parsed.success) return parsed.data;
  const fields = raw?.fields;
  const issues = parsed.error.issues.map((issue) => {
    const [head, index, ...rest] = issue.path;
    if (head === "fields" && typeof index === "number" && Array.isArray(fields)) {
      const key2 = fields[index]?.key;
      return {
        field_key: typeof key2 === "string" ? key2 : null,
        path: rest.length > 0 ? rest.join(".") : "field",
        message: issue.message
      };
    }
    return {
      field_key: null,
      path: issue.path.length > 0 ? issue.path.join(".") : "definition",
      message: issue.message
    };
  });
  throw definitionError(issues);
}
function checkScoring(definition) {
  const issues = validateScoringRules(definition.scoring_rules, definition.fields, {
    prefix: "scoring_rules",
    noun: "definition"
  });
  if (issues.length > 0) throw definitionError(issues);
}
async function importForm(caller, input, ctx) {
  assertCan(caller, "manage_forms");
  const userId2 = userIdOf(caller);
  const definition = parseDefinition(input?.definition);
  const parsed = parseInput(importFormInput, input);
  await seasonOrNotFound(ctx, parsed.season_id);
  checkScoring(definition);
  const incoming = definition.fields.map((f) => ({ draft: toDraft(f) }));
  let existing;
  if (parsed.form_id !== void 0) {
    existing = await formOrNotFound(ctx, parsed.form_id);
    if (existing.season_id !== parsed.season_id || existing.kind !== definition.kind) {
      throw new AppError("invalid", `that form is not this season's ${definition.kind} form`, {
        reason: "kind-mismatch"
      });
    }
  } else {
    existing = await ctx.store.getFormByKind(parsed.season_id, definition.kind);
  }
  if (existing) {
    const versions = await ctx.store.listFormVersions(existing.id);
    const draft = draftOf(versions);
    const written = draft ? await writeFieldSet(ctx, userId2, existing, draft, incoming) : await writeFieldSet(ctx, userId2, existing, newestOf(versions) ?? null, incoming, true);
    return { form_id: existing.id, draft_version_id: written.version.id, created: false };
  }
  resolveIdentity(incoming, [], /* @__PURE__ */ new Map());
  const { definition: problems } = checkFields(incoming.map((f) => f.draft));
  if (problems.length > 0) throw definitionError(problems);
  let form;
  try {
    form = await ctx.store.insertForm({
      id: crypto.randomUUID(),
      season_id: parsed.season_id,
      kind: definition.kind,
      name: definition.name,
      timer_config: definition.timer_config
    });
  } catch (e) {
    if (pgCode(e) === "23505") {
      throw new AppError("conflict", `this season already has a ${definition.kind} form`, {
        reason: "form-exists",
        kind: definition.kind
      });
    }
    throw e;
  }
  try {
    const version = await ctx.store.insertFormVersion({
      id: crypto.randomUUID(),
      form_id: form.id,
      version_no: 1,
      updated_by: userId2
    });
    await ctx.store.writeFormFields(
      version.id,
      incoming.map((f) => ({
        id: crypto.randomUUID(),
        ...draftColumns(f.draft),
        deprecated: false
      })),
      []
    );
    await ctx.store.replaceScoringRules(
      form.id,
      definition.scoring_rules.map((r) => ({
        id: crypto.randomUUID(),
        field_key: r.field_key,
        points: r.points,
        option_points: r.option_points
      }))
    );
    return { form_id: form.id, draft_version_id: version.id, created: true };
  } catch (e) {
    await ctx.store.deleteFormCascade(form.id).catch(() => void 0);
    throw e;
  }
}

// src/core/commands/scoring.ts
function toScoringRuleRow(rule) {
  return {
    field_key: rule.field_key,
    points: Number(rule.points),
    option_points: rule.option_points ?? null
  };
}
var byFieldKey = (a, b) => a.field_key < b.field_key ? -1 : a.field_key > b.field_key ? 1 : 0;
function scoringError(issues) {
  const first = issues[0];
  const one = `${first.field_key}: ${first.message}`;
  const summary = issues.length === 1 ? one : `${issues.length} problems in the scoring; first, ${one}`;
  return new AppError("invalid", summary, { reason: "invalid-scoring", issues });
}
var isSelectType = (type) => type === "single_select" || type === "multi_select";
async function scorableUniverse(ctx, formId, activeVersionId) {
  const versions = await ctx.store.listFormVersions(formId);
  const draft = versions.find((v) => v.published_at === null);
  const byKey = /* @__PURE__ */ new Map();
  const ids = [activeVersionId, draft?.id ?? null].filter((id) => id !== null);
  for (const id of ids) {
    for (const field of await ctx.store.getFormFields(id)) {
      if (field.deprecated) continue;
      const earlier = byKey.get(field.key);
      if (earlier && isSelectType(field.type) && isSelectType(earlier.type)) {
        const options = selectOptions(field);
        const seen = new Set(options.map((o) => o.value));
        const union = [...options, ...selectOptions(earlier).filter((o) => !seen.has(o.value))];
        byKey.set(field.key, { ...field, config: { ...field.config, options: union } });
      } else {
        byKey.set(field.key, field);
      }
    }
  }
  return [...byKey.values()];
}
async function setScoringRules(caller, input, ctx) {
  assertCan(caller, "manage_forms");
  const parsed = parseInput(setScoringRulesInput, input);
  const form = await formOrNotFound(ctx, parsed.form_id);
  const fields = await scorableUniverse(ctx, form.id, form.active_version_id ?? null);
  const issues = validateScoringRules(parsed.rules, fields, { prefix: "rules", noun: "form" });
  if (issues.length > 0) throw scoringError(issues);
  const isSelect2 = new Map(
    fields.map((f) => [f.key, f.type === "single_select" || f.type === "multi_select"])
  );
  const existingIds = new Map(
    (await ctx.store.getScoringRules(form.id)).map((r) => [r.field_key, r.id])
  );
  await ctx.store.replaceScoringRules(
    form.id,
    parsed.rules.map((rule) => ({
      id: existingIds.get(rule.field_key) ?? crypto.randomUUID(),
      field_key: rule.field_key,
      points: rule.points,
      option_points: isSelect2.get(rule.field_key) ? rule.option_points ?? null : null
    }))
  );
  const stored = await ctx.store.getScoringRules(form.id);
  return { rules: stored.map(toScoringRuleRow).sort(byFieldKey) };
}

// src/core/queries/context.ts
async function getActiveContext(caller, input, ctx) {
  void caller;
  parseInput(getActiveContextInput, input);
  const current = await ctx.store.getActiveContext();
  const eventId = current.active_event_id;
  const eventLives = eventId !== null && await ctx.store.eventExists(eventId);
  return {
    active_season_id: current.active_season_id,
    active_event_id: eventLives ? eventId : null
  };
}

// src/core/queries/forms.ts
async function userRefs(ctx, ids) {
  const wanted = [...new Set(ids.filter((id) => id !== null))];
  if (wanted.length === 0) return /* @__PURE__ */ new Map();
  const found = await ctx.store.listUserNames(wanted);
  return new Map(found.map((u) => [u.id, { id: u.id, full_name: u.full_name }]));
}
async function summarise(ctx, form, versions) {
  const live = await ctx.store.countLiveEntriesByFormVersions(versions.map((v) => v.id));
  const users = await userRefs(
    ctx,
    versions.map((v) => v.updated_by ?? null)
  );
  const out = [];
  for (const version of versions) {
    const fields = await ctx.store.getFormFields(version.id);
    const entryCount = live.get(version.id) ?? 0;
    const locked = version.is_locked || entryCount > 0 || await ctx.store.countEntriesByFormVersion(version.id) > 0;
    const by = version.updated_by ?? null;
    out.push({
      fields,
      summary: {
        id: version.id,
        version_no: version.version_no,
        status: version.published_at === null ? "draft" : "published",
        published_at: version.published_at ?? null,
        is_active: version.id === form.active_version_id,
        is_locked: locked,
        field_count: countDataFields(fields),
        entry_count: entryCount,
        updated_at: version.updated_at,
        updated_by: by === null ? null : users.get(by) ?? { id: by, full_name: "" }
      }
    });
  }
  return out;
}
async function versionsNewestFirst(ctx, form) {
  const versions = (await ctx.store.listFormVersions(form.id)).sort(
    (a, b) => b.version_no - a.version_no
  );
  return (await summarise(ctx, form, versions)).map((s) => s.summary);
}
async function rulesByKey(ctx, formId) {
  const rules = await ctx.store.getScoringRules(formId);
  return new Map(rules.map((r) => [r.field_key, toScoringRuleRow(r)]));
}
async function listForms(caller, input, ctx) {
  void caller;
  const { season_id } = parseInput(listFormsInput, input);
  await seasonOrNotFound(ctx, season_id);
  const forms = [];
  for (const kind of ["match", "super"]) {
    const form = await ctx.store.getFormByKind(season_id, kind);
    if (!form) continue;
    forms.push({
      id: form.id,
      kind: form.kind,
      name: form.name,
      active_version_id: form.active_version_id ?? null,
      updated_at: form.updated_at,
      versions: await versionsNewestFirst(ctx, form)
    });
  }
  return { season_id, forms };
}
async function getForm(caller, input, ctx) {
  void caller;
  const { form_id } = parseInput(getFormInput, input);
  const form = await formOrNotFound(ctx, form_id);
  return { ...toFormRow(form), versions: await versionsNewestFirst(ctx, form) };
}
async function getFormVersion(caller, input, ctx) {
  void caller;
  const { form_version_id } = parseInput(getFormVersionInput, input);
  const version = await versionOrNotFound(ctx, form_version_id);
  const form = await formOrNotFound(ctx, version.form_id);
  const [{ summary, fields }] = await summarise(ctx, form, [version]);
  const rules = await rulesByKey(ctx, form.id);
  return {
    ...summary,
    form_id: form.id,
    fields: fields.map((field) => {
      const rule = rules.get(field.key);
      return {
        ...toFieldRow(field),
        points: rule?.points ?? null,
        option_points: rule?.option_points ?? null
      };
    })
  };
}
async function getFormDictionary(caller, input, ctx) {
  void caller;
  const { form_id } = parseInput(getFormDictionaryInput, input);
  const form = await formOrNotFound(ctx, form_id);
  const activeId = form.active_version_id ?? null;
  const active = activeId === null ? null : await ctx.store.getFormVersion(activeId);
  if (!active) return { form_id: form.id, version_no: null, fields: [] };
  const rules = await rulesByKey(ctx, form.id);
  const fields = (await ctx.store.getFormFields(active.id)).filter(
    (f) => !f.deprecated && f.type !== "section"
  );
  return {
    form_id: form.id,
    version_no: active.version_no,
    fields: fields.map((field) => {
      const rule = rules.get(field.key);
      const isSelect2 = field.type === "single_select" || field.type === "multi_select";
      return {
        key: field.key,
        label: field.label,
        description: field.description ?? null,
        type: field.type,
        unit: field.unit ?? null,
        phase: field.phase ?? null,
        direction: field.direction ?? null,
        category: field.category ?? null,
        expected_range: field.expected_range ?? null,
        include_in_ai_context: field.include_in_ai_context ?? null,
        is_ordinal: field.is_ordinal ?? null,
        options: isSelect2 ? selectOptions(field).map((o) => ({ value: o.value, label: o.label })) : null,
        points: rule?.points ?? null,
        option_points: rule?.option_points ?? null
      };
    })
  };
}
var expired = (createdAt, now) => Date.parse(createdAt) + FORM_EXPORT_TTL_MS <= now.getTime();
async function listFormExports(caller, input, ctx) {
  assertCan(caller, "manage_forms");
  parseInput(listFormExportsInput, input);
  const now = ctx.now();
  await ctx.store.purgeFormExports(new Date(now.getTime() - FORM_EXPORT_TTL_MS));
  const rows = (await ctx.store.listFormExports()).filter((r) => !expired(r.created_at, now));
  const users = await userRefs(
    ctx,
    rows.map((r) => r.created_by)
  );
  return {
    exports: rows.map(
      (row) => toExportSummary(row, users.get(row.created_by) ?? { id: row.created_by, full_name: "" }, now)
    )
  };
}
async function getFormExport(caller, input, ctx) {
  assertCan(caller, "manage_forms");
  const { export_id } = parseInput(getFormExportInput, input);
  const now = ctx.now();
  const row = await ctx.store.getFormExport(export_id);
  if (!row || expired(row.created_at, now)) {
    throw new AppError("not-found", "that export does not exist; exports are kept 24 hours", {
      export_id
    });
  }
  const users = await userRefs(ctx, [row.created_by]);
  return {
    ...toExportSummary(
      row,
      users.get(row.created_by) ?? { id: row.created_by, full_name: "" },
      now
    ),
    definition: formDefinition.parse(row.definition)
  };
}

// src/core/queries/countEntriesByScouter.ts
async function countEntriesByScouter(caller, input, ctx) {
  void caller;
  const { season_id } = parseInput(countEntriesByScouterInput, input);
  const rows = await ctx.store.countEntriesByScouterForSeason(season_id);
  return { items: [...rows].sort((a, b) => b.count - a.count) };
}

// src/core/queries/listUsers.ts
var encodeCursor2 = (c) => Buffer.from(JSON.stringify({ u: c.username, i: c.id }), "utf8").toString("base64url");
var decodeCursor2 = (raw) => {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed.u !== "string" || typeof parsed.i !== "string") throw new Error("shape");
    return { username: parsed.u, id: parsed.i };
  } catch {
    throw new AppError("invalid", "cursor is not readable; list again without one");
  }
};
async function listUsers(caller, input, ctx) {
  void caller;
  const parsed = parseInput(listUsersInput, input);
  const limit = Math.min(parsed.limit ?? LIST_USERS_DEFAULT_LIMIT, LIST_USERS_MAX_LIMIT);
  const after = parsed.cursor ? decodeCursor2(parsed.cursor) : void 0;
  const rows = await ctx.store.listUsers({
    includeDisabled: parsed.include_disabled,
    limit: limit + 1,
    after
  });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toPublicUser),
    next_cursor: rows.length > limit && last ? encodeCursor2({ username: last.username, id: last.id }) : null
  };
}

// src/routes/registry.ts
var REGISTRY = {
  login: {
    kind: "command",
    description: "Exchange a username and password for a 30-day session token. Takes no caller \u2014 it produces one. Rate-limited by username.",
    input: API.login.input,
    output: API.login.output,
    unauthenticated: true,
    handler: login
  },
  refreshToken: {
    kind: "command",
    description: "Exchange a still-valid session token for a fresh one. Takes no caller \u2014 it produces one. Rate-limited by username.",
    input: API.refreshToken.input,
    output: API.refreshToken.output,
    unauthenticated: true,
    handler: refreshToken
  },
  changeOwnPassword: {
    kind: "command",
    description: "Change your own password, given the current one. Acts on the caller only and clears the must-change flag. Rate-limited per user.",
    input: API.changeOwnPassword.input,
    output: API.changeOwnPassword.output,
    handler: changeOwnPassword
  },
  createUser: {
    kind: "command",
    description: "Admin only: create a user with a username, full name, role and initial password. The full name is the only personal datum stored.",
    input: API.createUser.input,
    output: API.createUser.output,
    handler: createUser
  },
  setUserRole: {
    kind: "command",
    description: "Admin only: change a user's role. Refuses to demote the last enabled admin. Takes effect on the user's next request.",
    input: API.setUserRole.input,
    output: API.setUserRole.output,
    handler: setUserRole
  },
  resetPassword: {
    kind: "command",
    description: "Admin only: set a new password for a user, optionally forcing a change at next login. Does not revoke tokens already issued.",
    input: API.resetPassword.input,
    output: API.resetPassword.output,
    handler: resetPassword
  },
  disableUser: {
    kind: "command",
    description: "Admin only: disable a user. The row and their authorship are kept forever; access ends on their next request. Refuses the last enabled admin.",
    input: API.disableUser.input,
    output: API.disableUser.output,
    handler: disableUser
  },
  enableUser: {
    kind: "command",
    description: "Admin only: re-enable a disabled user. Clears disabled_at only \u2014 it does not reset the password. A no-op on an already-enabled user.",
    input: API.enableUser.input,
    output: API.enableUser.output,
    handler: enableUser
  },
  renameUser: {
    kind: "command",
    description: "Admin only: change a user's username, full name, or both. The id never changes, so authorship is unaffected. A taken username reads as conflict.",
    input: API.renameUser.input,
    output: API.renameUser.output,
    handler: renameUser
  },
  listUsers: {
    kind: "query",
    description: "Users for the picker, the admin table and the offline cache, ordered by username and paginated. Excludes disabled users unless asked. Never returns a password hash.",
    input: API.listUsers.input,
    output: API.listUsers.output,
    handler: listUsers
  },
  countEntriesByScouter: {
    kind: "query",
    description: "Entries per scouter across a season's events, live entries only. Feeds the Users page.",
    input: API.countEntriesByScouter.input,
    output: API.countEntriesByScouter.output,
    handler: countEntriesByScouter
  },
  getActiveContext: {
    kind: "query",
    description: "The admin's default season and event, which every device opens to. Either may be null: nothing is set up yet, or the season has no event yet. An event id that names no event comes back null.",
    input: API.getActiveContext.input,
    output: API.getActiveContext.output,
    handler: getActiveContext
  },
  createSeason: {
    kind: "command",
    description: "Admin only: create a season with a unique year, a game name and the path of its game image, which must already be committed and deployed with the client.",
    input: API.createSeason.input,
    output: API.createSeason.output,
    handler: createSeason
  },
  updateSeason: {
    kind: "command",
    description: "Admin only: correct a season's year, game name or game image path. The image cannot change once the season has entries: a new image needs a new form version.",
    input: API.updateSeason.input,
    output: API.updateSeason.output,
    handler: updateSeason
  },
  setActiveSeason: {
    kind: "command",
    description: "Admin only: make a season the default every device opens to. The active event stays if it is in that season, else becomes the season's first event, or none.",
    input: API.setActiveSeason.input,
    output: API.setActiveSeason.output,
    handler: setActiveSeason
  },
  listSeasons: {
    kind: "query",
    description: "Every season, newest year first, paginated.",
    input: API.listSeasons.input,
    output: API.listSeasons.output,
    handler: listSeasons
  },
  createEvent: {
    kind: "command",
    description: "Admin only: create an event in a season. Its name is unique in the season, and it goes last in the season order.",
    input: API.createEvent.input,
    output: API.createEvent.output,
    handler: createEvent
  },
  updateEvent: {
    kind: "command",
    description: "Admin only: rename an event. Its name stays unique in its season; its order and its season never change here.",
    input: API.updateEvent.input,
    output: API.updateEvent.output,
    handler: updateEvent
  },
  reorderEvents: {
    kind: "command",
    description: "Admin only: set a season's event display order, naming every event once. Changes display order only; it never re-weights an aggregate.",
    input: API.reorderEvents.input,
    output: API.reorderEvents.output,
    handler: reorderEvents
  },
  setActiveEvent: {
    kind: "command",
    description: "Admin only: make an event, and with it its season, the default every device opens to. Both are written together, so they never disagree.",
    input: API.setActiveEvent.input,
    output: API.setActiveEvent.output,
    handler: setActiveEvent
  },
  listEvents: {
    kind: "query",
    description: "A season's events in display order (sort_order, then id), paginated. The order every season-spanning view reads left to right.",
    input: API.listEvents.input,
    output: API.listEvents.output,
    handler: listEvents
  },
  createTeam: {
    kind: "command",
    description: "Admin only: add a team to the global registry with its number (1..99999) and name. A team number is global and permanent; a taken one reads as conflict.",
    input: API.createTeam.input,
    output: API.createTeam.output,
    handler: createTeam
  },
  updateTeam: {
    kind: "command",
    description: "Admin only: rename a team. The number is permanent and cannot be changed; sending one is refused.",
    input: API.updateTeam.input,
    output: API.updateTeam.output,
    handler: updateTeam
  },
  listTeams: {
    kind: "query",
    description: "The global team registry by number, paginated. An optional query matches a number prefix or a case-insensitive name substring, taken literally.",
    input: API.listTeams.input,
    output: API.listTeams.output,
    handler: listTeams
  },
  setEventRoster: {
    kind: "command",
    description: "Admin only: make a list of teams an event's roster (at most 200). Removals are soft-deleted so they reach every device; a team added back reuses its old row.",
    input: API.setEventRoster.input,
    output: API.setEventRoster.output,
    handler: setEventRoster
  },
  listEventRoster: {
    kind: "query",
    description: "An event's live roster by team number: each team's id, number and name.",
    input: API.listEventRoster.input,
    output: API.listEventRoster.output,
    handler: listEventRoster
  },
  createMatch: {
    kind: "command",
    description: "Admin only: create one match by type and number (an existing one is a conflict), or matches 1..count in bulk, skipping numbers that exist. Returns the matches it created.",
    input: API.createMatch.input,
    output: API.createMatch.output,
    handler: createMatch
  },
  updateMatch: {
    kind: "command",
    description: "Admin only: correct a match's type and/or number. Never moves it to another event and never touches its slots; the corrected number must be free.",
    input: API.updateMatch.input,
    output: API.updateMatch.output,
    handler: updateMatch
  },
  setMatchTeams: {
    kind: "command",
    description: "Admin only: set a match's filled alliance slots (red and blue, stations 1..3). Omitted slots are cleared; a newly placed team must be on the event's roster.",
    input: API.setMatchTeams.input,
    output: API.setMatchTeams.output,
    handler: setMatchTeams
  },
  deleteMatch: {
    kind: "command",
    description: "Admin only: delete a match and its slots. Refused while any entry names it; correct the match number instead.",
    input: API.deleteMatch.input,
    output: API.deleteMatch.output,
    handler: deleteMatch
  },
  deleteSeason: {
    kind: "command",
    description: "Admin only: hard-delete a season with its events, matches, entries and forms, irreversibly. dry_run answers the counts and deletes nothing; the real delete needs confirm_name equal to the year. The active season is refused.",
    input: API.deleteSeason.input,
    output: API.deleteSeason.output,
    handler: deleteSeason
  },
  deleteEvent: {
    kind: "command",
    description: "Admin only: hard-delete an event with its matches, entries, roster, pick lists and bracket, irreversibly. dry_run answers the counts and deletes nothing; the real delete needs confirm_name equal to the event name. The default event is refused.",
    input: API.deleteEvent.input,
    output: API.deleteEvent.output,
    handler: deleteEvent
  },
  listMatches: {
    kind: "query",
    description: "An event's matches with their filled slots: practice, then qualification, then playoff, each by number, paginated.",
    input: API.listMatches.input,
    output: API.listMatches.output,
    handler: listMatches
  },
  ensureMatch: {
    kind: "command",
    description: "Any authenticated user: create the bare match row (event, type and number only, no teams) when a scouter enters an unknown match number. A no-op returning the existing id if it exists. Cannot set teams, edit or delete.",
    input: API.ensureMatch.input,
    output: API.ensureMatch.output,
    handler: ensureMatch
  },
  createForm: {
    kind: "command",
    description: "Admin only: create a season's match or super form as an empty draft version 1. One form of each kind per season; a second is a conflict.",
    input: API.createForm.input,
    output: API.createForm.output,
    handler: createForm
  },
  updateForm: {
    kind: "command",
    description: "Admin only: rename a form or set its match timer (phases and seconds). In place: never creates a form version.",
    input: API.updateForm.input,
    output: API.updateForm.output,
    handler: updateForm
  },
  saveDraftFields: {
    kind: "command",
    description: "Admin only: make a list of fields a form version's live fields. A draft is edited in place and saves with fields still missing their meaning. A published version takes labels, ranges, meaning and order in place; adding, removing or retyping a field, or changing a select's options, starts a new draft. A saved field's key never changes.",
    input: API.saveDraftFields.input,
    output: API.saveDraftFields.output,
    handler: saveDraftFields
  },
  publishFormVersion: {
    kind: "command",
    description: "Admin only: publish a draft version; the newest published version becomes the one devices scout with. Refused while a field misses its meaning or breaks a rule.",
    input: API.publishFormVersion.input,
    output: API.publishFormVersion.output,
    handler: publishFormVersion
  },
  restoreFormVersion: {
    kind: "command",
    description: "Admin only: make an older published version the active one again, without creating a version.",
    input: API.restoreFormVersion.input,
    output: API.restoreFormVersion.output,
    handler: restoreFormVersion
  },
  deleteFormVersion: {
    kind: "command",
    description: "Admin only: delete one form version. Blocked while any entry is bound to it, and for the active version.",
    input: API.deleteFormVersion.input,
    output: API.deleteFormVersion.output,
    handler: deleteFormVersion
  },
  deleteForm: {
    kind: "command",
    description: "Admin only: hard-delete a form with all its versions, fields, scoring and entries, irreversibly. dry_run answers how many versions and entries go, and deletes nothing.",
    input: API.deleteForm.input,
    output: API.deleteForm.output,
    handler: deleteForm
  },
  exportForm: {
    kind: "query",
    description: "Admin only (a service caller is refused): the portable JSON definition of a form's draft or active version: fields, timer and scoring, with no ids or season.",
    input: API.exportForm.input,
    output: API.exportForm.output,
    handler: exportForm
  },
  saveFormExport: {
    kind: "command",
    description: "Admin only: save a form version's definition into Exports, kept 24 hours. Older exports are deleted first.",
    input: API.saveFormExport.input,
    output: API.saveFormExport.output,
    handler: saveFormExport
  },
  importForm: {
    kind: "command",
    description: "Admin only: import a form definition into a season. With no form of its kind there, it creates one as draft v1; otherwise its fields become that form's draft, and the form's name, timer and scoring stay.",
    input: API.importForm.input,
    output: API.importForm.output,
    handler: importForm
  },
  setScoringRules: {
    kind: "command",
    description: "Admin only: replace a form's scoring model. The rules given become the whole rule set; a field not named loses its rule. Points are never negative, only toggle, counter, number and select fields score, and a select scores per option. Never creates a form version.",
    input: API.setScoringRules.input,
    output: API.setScoringRules.output,
    handler: setScoringRules
  },
  listForms: {
    kind: "query",
    description: "A season's forms for the forms page, match then super, each with its versions newest first: status, active, effective lock, live fields, live entries, and who last saved it.",
    input: API.listForms.input,
    output: API.listForms.output,
    handler: listForms
  },
  getForm: {
    kind: "query",
    description: "One form: its name, kind, match timer and active version, with every version summarised newest first.",
    input: API.getForm.input,
    output: API.getForm.output,
    handler: getForm
  },
  getFormVersion: {
    kind: "query",
    description: "One form version for the builder: its summary and every field in display order, retired ones included and flagged, each with its points from the form's scoring.",
    input: API.getFormVersion.input,
    output: API.getFormVersion.output,
    handler: getFormVersion
  },
  getFormDictionary: {
    kind: "query",
    description: "The machine-readable field dictionary of a form's active version: each live data field's key, label, meaning, unit, phase, direction, category, expected range, options and points.",
    input: API.getFormDictionary.input,
    output: API.getFormDictionary.output,
    handler: getFormDictionary
  },
  listFormExports: {
    kind: "query",
    description: "Admin only (a service caller is refused): the saved form exports, newest first. Exports older than 24 hours are deleted first.",
    input: API.listFormExports.input,
    output: API.listFormExports.output,
    handler: listFormExports
  },
  getFormExport: {
    kind: "query",
    description: "Admin only (a service caller is refused): one saved form export with the definition it holds, for import. An export older than 24 hours is not found.",
    input: API.getFormExport.input,
    output: API.getFormExport.output,
    handler: getFormExport
  }
};

// src/routes/rpc.ts
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
        return c.json(INTERNAL_ERROR, 500);
      }
    });
  }
  return app2;
}

// src/routes/sync.ts
import { Hono as Hono3 } from "hono";

// src/core/commands/syncPush.ts
var rejected = (opId, reason, detail) => detail === void 0 ? { op_id: opId, status: "rejected", reason } : { op_id: opId, status: "rejected", reason, detail };
var SERVER_OWNED_KEYS = /* @__PURE__ */ new Set([
  "id",
  "scouter_id",
  "version",
  "created_at",
  "updated_at",
  "deleted_at",
  "client_created_at",
  "client_updated_at"
]);
function foreignKeyDetail(message) {
  const column = /_(event|match|team|form_version)_id_fkey/.exec(message)?.[1];
  return column ? PARENT_DELETED_DETAIL[column] : PARENT_DELETED_DETAIL.other;
}
var withoutServerOwnedKeys = (payload) => Object.fromEntries(Object.entries(payload).filter(([key2]) => !SERVER_OWNED_KEYS.has(key2)));
var callerOf = (author) => ({
  kind: "user",
  userId: author.id,
  role: author.role
});
function describeIssue(issue) {
  const path = issue.path.join(".") || "operation";
  const message = issue.code === "invalid_enum_value" ? `expected ${issue.options.join(" | ")}` : issue.message;
  return `${path}: ${message}`;
}
var opIdOf = (candidate) => {
  if (typeof candidate !== "object" || candidate === null) return null;
  const opId = candidate.op_id;
  return typeof opId === "string" && opId.length > 0 ? opId : null;
};
function screenOperations(raw) {
  const operations = [];
  const rejections = [];
  raw.forEach((candidate, index) => {
    const parsed = operationSchema.safeParse(candidate);
    if (parsed.success) {
      operations.push(parsed.data);
      return;
    }
    const { issues } = parsed.error;
    const codes = issues.map((i) => `${i.path.join(".") || "operation"} ${i.code}`).join(", ");
    const opId = opIdOf(candidate);
    if (opId === null) {
      console.error(`syncPush: skipped operation #${index}, which has no op_id: ${codes}`);
      return;
    }
    console.error(`syncPush: op ${opId} is malformed: ${codes}`);
    rejections.push(rejected(opId, "invalid", issues.map(describeIssue).join("; ")));
  });
  return { operations, rejections };
}
async function syncPush(caller, input, ctx) {
  const ordered = [...input.operations].sort((a, b) => a.seq - b.seq);
  const results = [];
  for (const op of ordered) {
    try {
      results.push(await applyOne(caller, op, ctx));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`syncPush: op ${op.op_id} (${op.entity} ${op.action}) failed: ${message}`);
      results.push(
        pgCode(e) === "23503" ? rejected(op.op_id, "parent-deleted", foreignKeyDetail(message)) : rejected(op.op_id, "invalid", "unexpected server error")
      );
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
      return {
        op_id: op.op_id,
        status: "noop",
        row_id: await canonicalMatchId(op, ctx),
        new_version: 1
      };
    }
    const existing = await ctx.store.getRow(op.entity, op.row_id);
    return {
      op_id: op.op_id,
      status: "noop",
      row_id: op.row_id,
      new_version: existing?.version ?? 1
    };
  }
  if (op.entity === "match") return applyBareMatch(op, author, ctx);
  if (op.entity !== "scouting_entry") {
    return rejected(op.op_id, "invalid", `entity '${op.entity}' is not accepted yet`);
  }
  return applyEntry(op, author, ctx);
}
var bareMatchInput = (op) => {
  const { event_id, match_type, number } = op.payload;
  return { id: op.row_id, event_id, match_type, number };
};
async function canonicalMatchId(op, ctx) {
  const parsed = ensureMatchInput.safeParse(bareMatchInput(op));
  if (!parsed.success) return op.row_id;
  const { event_id, match_type, number } = parsed.data;
  return (await ctx.store.findMatch(event_id, match_type, number))?.id ?? op.row_id;
}
var REASON_FOR = {
  forbidden: "forbidden",
  "not-found": "parent-deleted",
  invalid: "invalid"
};
async function applyBareMatch(op, author, ctx) {
  let result;
  try {
    result = await ensureMatch(callerOf(author), bareMatchInput(op), ctx);
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    const reason = REASON_FOR[e.code] ?? "invalid";
    const detail = reason === "parent-deleted" ? PARENT_DELETED_DETAIL.event : e.message;
    return rejected(op.op_id, reason, detail);
  }
  await ctx.store.markApplied(op.op_id);
  return {
    op_id: op.op_id,
    status: result.created ? "applied" : "noop",
    row_id: result.id,
    new_version: 1
  };
}
async function applyEntry(op, author, ctx) {
  const payload = op.payload;
  const authorCaller = callerOf(author);
  const existing = await ctx.store.getRow("scouting_entry", op.row_id);
  if (op.action === "delete") {
    if (!can(authorCaller, "manage_entries")) {
      return rejected(op.op_id, "forbidden", "only a lead or admin may delete an entry");
    }
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
  if (existing) {
    if (!can(authorCaller, "manage_entries")) {
      if (existing.scouter_id !== author.id) {
        return rejected(op.op_id, "forbidden", "a scouter may edit only their own entry");
      }
      if (!withinSelfEditWindow(String(existing.client_created_at), op.client_updated_at)) {
        return rejected(op.op_id, "edit-window-expired", "this entry is locked \u2014 ask a lead");
      }
    }
  } else if (!can(authorCaller, "submit_entry")) {
    return rejected(op.op_id, "forbidden", "the author may not submit an entry");
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
  const { event_id: eventId, match_id: matchId, team_id: teamId } = payload;
  if (typeof eventId !== "string") return rejected(op.op_id, "invalid", "event_id is required");
  if (typeof teamId !== "string") return rejected(op.op_id, "invalid", "team_id is required");
  if (matchId != null && typeof matchId !== "string") {
    return rejected(op.op_id, "invalid", "match_id must be an id or null");
  }
  const gone = await ctx.store.missingParent({
    event_id: eventId,
    match_id: matchId ?? null,
    team_id: teamId
  });
  if (gone !== null) return rejected(op.op_id, "parent-deleted", PARENT_DELETED_DETAIL[gone]);
  const fields = await ctx.store.getFormFields(formVersionId);
  const status = payload.robot_status ?? "played";
  const data = payload.data ?? {};
  const validation = validateEntryData(fields, status, data, { mode: "stored" });
  if (!validation.ok) {
    return rejected(op.op_id, "invalid", validation.issues.map((i) => i.message).join("; "));
  }
  const version = existing ? existing.version + 1 : 1;
  await ctx.store.putRow("scouting_entry", op.row_id, {
    ...withoutServerOwnedKeys(payload),
    id: op.row_id,
    // An update never reassigns authorship, and never restarts the self-edit window: both
    // stay the row's own (SPEC-FINAL 7.5, 7.6). A create takes them from the operation.
    scouter_id: existing ? existing.scouter_id : op.author_user_id,
    version,
    client_created_at: existing ? existing.client_created_at : op.client_created_at,
    client_updated_at: op.client_updated_at,
    deleted_at: null
  });
  await ctx.store.markApplied(op.op_id);
  return { op_id: op.op_id, status: "applied", row_id: op.row_id, new_version: version };
}

// src/core/queries/syncPull.ts
var PULL_PAGE_ROWS = 2e3;
var encodeCursor3 = (c) => btoa(JSON.stringify(c));
var decodeCursor3 = (raw) => {
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
  const start = input.cursor ? decodeCursor3(input.cursor) : { entityIndex: 0, offset: 0 };
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
        nextCursor = encodeCursor3({ entityIndex: index, offset });
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
  const deletedMatches = [];
  if (input.since !== void 0 && input.cursor === void 0) {
    for (const deletion of await ctx.store.listMatchDeletions(input.event_id, input.since)) {
      deletedMatches.push(deletion.match_id);
      if (deletion.deleted_at > newest) newest = deletion.deleted_at;
    }
  }
  const watermark = newest === "" ? input.since ?? new Date(ctx.now().getTime() - WATERMARK_OVERLAP_MS).toISOString() : new Date(new Date(newest).getTime() - WATERMARK_OVERLAP_MS).toISOString();
  return {
    watermark,
    next_cursor: nextCursor,
    complete: nextCursor === null,
    entities,
    deleted_matches: deletedMatches
  };
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
    const parsed = pushEnvelopeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "invalid", message: parsed.error.message } }, 400);
    }
    const { operations, rejections } = screenOperations(parsed.data.operations);
    const { results } = await syncPush(
      caller,
      { device_id: parsed.data.device_id, operations },
      deps.ctx
    );
    return c.json({ results: [...results, ...rejections] });
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
