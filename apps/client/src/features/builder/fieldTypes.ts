import {
  AlignLeft,
  CircleDot,
  Hash,
  Heading,
  ListOrdered,
  MapPin,
  Route,
  Sigma,
  SquareCheck,
  SquarePlus,
  Star,
  Timer,
  ToggleRight,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { FieldTypeName } from '@frc/shared';

/**
 * The field-type catalogue as the builder's palette shows it (SPEC-FINAL 5.2; design
 * 12-form-builder, "Fields palette"): all fourteen types, in the design's order, each with its
 * icon, name and one-line description. There is no Photo type anywhere in the product.
 */
export const FIELD_TYPE_INFO: readonly {
  type: FieldTypeName;
  name: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    type: 'counter',
    name: 'Counter',
    description: '− / value / + for things you count',
    icon: SquarePlus,
  },
  {
    type: 'number',
    name: 'Number',
    description: 'A free number with min, max and step',
    icon: Hash,
  },
  { type: 'timer', name: 'Timer', description: 'A stopwatch that adds up time', icon: Timer },
  { type: 'toggle', name: 'Toggle', description: 'Yes or no', icon: ToggleRight },
  { type: 'single_select', name: 'Single select', description: 'Pick one option', icon: CircleDot },
  {
    type: 'multi_select',
    name: 'Multi select',
    description: 'Pick any number of options',
    icon: SquareCheck,
  },
  { type: 'rating', name: 'Rating', description: '1–5 stars or a slider', icon: Star },
  {
    type: 'event_log',
    name: 'Event log',
    description: 'Timed taps, gives cycle times',
    icon: ListOrdered,
  },
  {
    type: 'position',
    name: 'Field position',
    description: 'Tap a point on the field image',
    icon: MapPin,
  },
  {
    type: 'cycle_path',
    name: 'Cycle path',
    description: 'Tap a short path per cycle',
    icon: Route,
  },
  { type: 'short_text', name: 'Short text', description: 'One line of text', icon: Type },
  { type: 'long_text', name: 'Long text', description: 'Notes and comments', icon: AlignLeft },
  {
    type: 'computed',
    name: 'Computed',
    description: 'Worked out from other fields',
    icon: Sigma,
  },
  { type: 'section', name: 'Section', description: 'A heading; holds no data', icon: Heading },
];

const BY_TYPE = new Map(FIELD_TYPE_INFO.map((info) => [info.type, info]));

export function typeInfo(type: FieldTypeName) {
  return BY_TYPE.get(type)!;
}

/** "Counter", "Field position": a type's name as the builder says it. */
export function typeName(type: string): string {
  return BY_TYPE.get(type as FieldTypeName)?.name ?? type;
}

/**
 * The config a new field starts with: one that passes `validateFieldDefinition`, so Save draft
 * takes a new field at once (only its meaning is missing). A select starts with two options
 * and an event log with one button, because an empty list is not a valid config (SPEC-FINAL
 * 5.3); the settings pane (task 1.30) renames them. A computed field's expression is null
 * until written (DEVIATIONS 1.25: the key must be present).
 */
export function defaultConfig(type: FieldTypeName): Record<string, unknown> {
  switch (type) {
    case 'counter':
      return { min: 0, step: 1 };
    case 'single_select':
    case 'multi_select':
      return {
        options: [
          { value: 'option_1', label: 'Option 1' },
          { value: 'option_2', label: 'Option 2' },
        ],
      };
    case 'rating':
      return { max: 5, style: 'stars' };
    case 'timer':
      return { allow_unsure: true };
    case 'event_log':
      return { event_types: [{ value: 'event_1', label: 'Event 1' }], ask_position: false };
    case 'position':
      return { multi_point: false, mirror_axis: 'none' };
    case 'cycle_path':
      return { max_points_per_cycle: 6, mirror_axis: 'none' };
    case 'computed':
      return { expression: null, result_type: 'float' };
    default:
      return {};
  }
}
