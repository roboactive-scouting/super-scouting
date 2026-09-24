import type { Json } from '../database.types';

/**
 * Deterministic ids so the walking skeleton (phase 1 group A) and the smoke suite can
 * reference seeded rows without querying for them. Never used outside dev and CI.
 */
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const SEED = Object.freeze({
  year: 1999,
  season: id(1),
  event: id(2),
  matchForm: id(3),
  formVersionOld: id(4),
  formVersion: id(5),
  scouter: id(6),
  lead: id(7),
  admin: id(8),
  superForm: id(9),
  superFormVersion: id(10),
  team: (index: number): string => id(1000 + index),
  match: (number: number): string => id(2000 + number),
  matchTeam: (number: number, slot: number): string => id(20000 + number * 10 + slot),
  entry: (index: number): string => id(50000 + index),
  /** Unique per (form version, field index) — see the note in seed.ts. */
  formField: (versionIndex: number, fieldIndex: number): string =>
    id(60000 + versionIndex * 100 + fieldIndex),
  /** bcrypt hash of the password "seedpass1" at cost 10. Dev only. */
  passwordHash: '$2a$10$UvMj9dL0at3XgVPimYuyV.QrnBZgKreWpGuZehf2MeXZN1zn0qAk2',
});

/**
 * Every element carries the same keys, with nulls where a value does not apply. A
 * heterogeneous `as const` array would make `f.points` a type error on the members
 * that omit it, which is exactly the kind of thing `strict` is for.
 */
export type SeedField = {
  key: string;
  label: string;
  type: 'counter' | 'toggle' | 'single_select' | 'long_text';
  phase: 'auto' | 'teleop' | 'endgame' | 'post_match';
  unit: 'count' | 'boolean' | 'enum' | 'text';
  direction: 'higher_is_better' | 'lower_is_better' | 'neutral';
  description: string;
  points: number | null;
  option_points: Record<string, number> | null;
  config: Record<string, Json>;
  expected_range: { min: number; max: number } | null;
};

export const SEED_FIELDS: SeedField[] = [
  {
    key: 'auto_notes',
    label: 'Auto notes scored',
    type: 'counter',
    phase: 'auto',
    unit: 'count',
    direction: 'higher_is_better',
    description: 'Game pieces scored in autonomous',
    points: 5,
    option_points: null,
    config: { min: 0, max: 10, step: 1 },
    expected_range: { min: 0, max: 10 },
  },
  {
    key: 'auto_left_zone',
    label: 'Left the starting zone',
    type: 'toggle',
    phase: 'auto',
    unit: 'boolean',
    direction: 'higher_is_better',
    description: 'Robot left its starting zone',
    points: 2,
    option_points: null,
    config: {},
    expected_range: null,
  },
  {
    key: 'teleop_notes',
    label: 'Teleop notes scored',
    type: 'counter',
    phase: 'teleop',
    unit: 'count',
    direction: 'higher_is_better',
    description: 'Game pieces scored in teleop',
    points: 2,
    option_points: null,
    config: { min: 0, max: 40, step: 1 },
    expected_range: { min: 0, max: 40 },
  },
  {
    key: 'endgame_climb',
    label: 'Climb level',
    type: 'single_select',
    phase: 'endgame',
    unit: 'enum',
    direction: 'higher_is_better',
    description: 'How high the robot climbed',
    points: 0,
    option_points: { none: 0, park: 2, low: 6, high: 10 },
    config: {
      is_ordinal: true,
      options: [
        { value: 'none', label: 'No climb' },
        { value: 'park', label: 'Parked' },
        { value: 'low', label: 'Low rung' },
        { value: 'high', label: 'High rung' },
      ],
    },
    expected_range: null,
  },
  {
    key: 'notes',
    label: 'Notes',
    type: 'long_text',
    phase: 'post_match',
    unit: 'text',
    direction: 'neutral',
    description: 'Anything worth telling a strategy lead',
    points: null,
    option_points: null,
    config: {},
    expected_range: null,
  },
];

/** The super form is one record per (team, event): driver skill and a free-text read. */
export const SEED_SUPER_FIELDS: SeedField[] = [
  {
    key: 'driver_skill',
    label: 'Driver skill',
    type: 'single_select',
    phase: 'post_match',
    unit: 'enum',
    direction: 'higher_is_better',
    description: 'Overall driver control across the event',
    points: null,
    option_points: null,
    config: {
      is_ordinal: true,
      options: [
        { value: 'poor', label: 'Poor' },
        { value: 'ok', label: 'OK' },
        { value: 'strong', label: 'Strong' },
      ],
    },
    expected_range: null,
  },
  {
    key: 'super_notes',
    label: 'Super notes',
    type: 'long_text',
    phase: 'post_match',
    unit: 'text',
    direction: 'neutral',
    description: 'Defence, penalties, breakdowns, anything subjective',
    points: null,
    option_points: null,
    config: {},
    expected_range: null,
  },
];
