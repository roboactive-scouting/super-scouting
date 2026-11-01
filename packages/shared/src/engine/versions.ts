import { selectOptions, type FormFieldDefinition } from '../forms/types';

/** The field set of one form version. A `FormVersionDefinition` satisfies it. */
export type VersionFields = { fields: readonly FormFieldDefinition[] };

/**
 * The versions a metric reads: the form's ACTIVE version, whose field set statistics always
 * compute against (SPEC-FINAL 5.1), and every version an entry in the aggregation window was
 * recorded under (`EngineEntry.form_version_id`). Including the active one in `inScope` is
 * harmless. A version left out of `inScope` is not checked, so pass all of them.
 */
export type VersionsInScope = { active: VersionFields; inScope: readonly VersionFields[] };

/**
 * Why a metric cannot be calculated (SPEC-FINAL 11.7). The UI renders `type-changed` as
 * "cannot calculate this metric — field type changed between versions" and `absent` as
 * "cannot calculate this metric".
 */
export type FieldUnavailableReason = 'type-changed' | 'absent';

export type FieldResolution =
  { ok: true; field: FormFieldDefinition } | { ok: false; reason: FieldUnavailableReason };

/** A select's option values in list order; a malformed option reads as `undefined`. */
function optionValues(field: Pick<FormFieldDefinition, 'config'>): unknown[] {
  return selectOptions(field).map((option) =>
    typeof option === 'object' && option !== null ? option.value : undefined,
  );
}

/** True when an ordinal select reads its options as ranks (SPEC-FINAL 5.3). */
function isOrdinalSelect(field: Pick<FormFieldDefinition, 'type' | 'is_ordinal'>): boolean {
  return (
    field.is_ordinal === true && (field.type === 'single_select' || field.type === 'multi_select')
  );
}

/**
 * True when every option of `older` is in `active`, in the same relative order: then each
 * option has one rank under the active list, and no stored option goes unread. An option
 * added anywhere in the active list keeps this true; one removed or reordered does not.
 */
function ranksCarryOver(older: readonly unknown[], active: readonly unknown[]): boolean {
  let previous = -1;
  for (const value of older) {
    const at = active.indexOf(value);
    if (at === -1 || at <= previous) return false;
    previous = at;
  }
  return true;
}

/**
 * SPEC-FINAL 11.7, the cross-version guard. Run it BEFORE `applyFilters` and `aggregate`:
 * `aggregate` silently drops values of the wrong type, so this is the only thing that keeps a
 * metric from mixing types. Entries under different versions aggregate through the field `key`.
 *
 * - The key has no live (non-deprecated) field in the active version → `absent`.
 * - Any field carrying the key, in the active version or a version in scope, has a different
 *   `type` from the active field's → `type-changed`.
 * - The active field is an ordinal select and a version in scope lists its options in another
 *   order, or lists an option the active version no longer has → `type-changed`: its stored
 *   options would read as different ranks, or as none (SPEC-FINAL 5.3).
 * - Otherwise `{ ok: true, field }`, the ACTIVE version's field: read every entry's value with
 *   it (`aggregationValue`). A label, help text, range or metadata change is never a problem,
 *   and neither is a nominal select's option list: keys are what aggregate.
 */
export function resolveFieldAcrossVersions(
  key: string,
  versions: VersionsInScope,
): FieldResolution {
  const field = versions.active.fields.find((f) => f.key === key && !f.deprecated);
  if (!field) return { ok: false, reason: 'absent' };

  const ordinal = isOrdinalSelect(field);
  const activeOptions = ordinal ? optionValues(field) : [];
  for (const version of [versions.active, ...versions.inScope]) {
    for (const other of version.fields) {
      if (other.key !== key) continue;
      if (other.type !== field.type) return { ok: false, reason: 'type-changed' };
      if (ordinal && !ranksCarryOver(optionValues(other), activeOptions)) {
        return { ok: false, reason: 'type-changed' };
      }
    }
  }
  return { ok: true, field };
}

/** An option's 0-based rank in an ordinal's list (worst → best); null when it is not listed. */
function rankOf(options: readonly unknown[], value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const at = options.indexOf(value);
  return at === -1 ? null : at;
}

/**
 * The value an aggregation reads from one entry's stored value of `field` — the field
 * `resolveFieldAcrossVersions` returned. SPEC-FINAL 5.3 / 12.6: an ordinal select aggregates
 * on its option RANK, the option's 0-based index in the field's list, worst → best (the top of
 * the list is 0).
 *
 * - Ordinal single select: the selected option's rank; an option not in the list, or a value
 *   that is not a string, → null (no data, never a rank).
 * - Ordinal multi select: the HIGHEST rank selected (the best level reached); an empty
 *   selection → null, and any option not in the list → null rather than a rank read from the
 *   rest.
 * - Every other field, a nominal select included: the value unchanged.
 */
export function aggregationValue(
  field: Pick<FormFieldDefinition, 'type' | 'is_ordinal' | 'config'>,
  value: unknown,
): unknown {
  if (!isOrdinalSelect(field)) return value;
  const options = optionValues(field);
  if (field.type === 'single_select') return rankOf(options, value);

  if (!Array.isArray(value) || value.length === 0) return null;
  let best = -1;
  for (const option of value as unknown[]) {
    const rank = rankOf(options, option);
    if (rank === null) return null;
    if (rank > best) best = rank;
  }
  return best;
}
