import type { FormFieldDefinition } from './types';

// SPEC-FINAL 5.1. Moved here from apps/server/src/core/forms/ by task 1.29 so the server's save
// and the form builder judge "structural" with one function. Pure and browser-safe.

/** A field as a save names it: the definition without its server id. */
export type FieldDraft = Omit<FormFieldDefinition, 'id'>;

const isSelect = (type: string): boolean => type === 'single_select' || type === 'multi_select';

/** The ordered option values of a select's config; anything malformed reads as none. */
function optionValues(config: Record<string, unknown>): string[] {
  const options = config.options;
  if (!Array.isArray(options)) return [];
  return options.map((option) =>
    typeof option === 'object' && option !== null
      ? String((option as { value?: unknown }).value)
      : '',
  );
}

const sameList = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((value, i) => value === b[i]);

/**
 * SPEC-FINAL 5.1 (amended v1.20). A new version is created ONLY by a structural change:
 * - a live field added (a key in `next` that is not live in `current`);
 * - a live field removed (live in `current`, absent from `next` or marked deprecated there);
 * - a field's `type` changed;
 * - for single_select / multi_select, the ORDERED list of option values differs: an option
 *   added, removed or reordered (an ordinal select's order is its rank).
 * Everything else is in place: label, help text, min/max/step, expected_range, display
 * order, section, semantic metadata, scoring, timer_config, and an option's label.
 */
export function isStructuralChange(current: FormFieldDefinition[], next: FieldDraft[]): boolean {
  const currentLive = new Map(current.filter((f) => !f.deprecated).map((f) => [f.key, f]));
  const nextLive = next.filter((f) => !f.deprecated);
  const nextKeys = new Set(nextLive.map((f) => f.key));

  for (const field of nextLive) {
    const existing = currentLive.get(field.key);
    if (!existing) return true; // a field was added
    if (existing.type !== field.type) return true; // a field's type changed
    if (
      isSelect(field.type) &&
      !sameList(optionValues(existing.config), optionValues(field.config))
    ) {
      return true; // an option was added, removed or reordered
    }
  }
  for (const key of currentLive.keys()) {
    if (!nextKeys.has(key)) return true; // a field was removed
  }
  return false;
}
