import type { GetDeleteImpactOutput } from '@frc/shared';

/**
 * `getDeleteImpact`'s answer (task 1.60's shape) for the delete dialog's specs (task 1.61): every
 * count 0, nothing blocked, the name typed back as it is, unless given.
 */
export function deleteImpact(
  over: Partial<GetDeleteImpactOutput> & Pick<GetDeleteImpactOutput, 'kind' | 'id' | 'name'>,
): GetDeleteImpactOutput {
  return {
    confirm_name: over.name,
    blocked_reason: null,
    blocked_message: null,
    events: 0,
    event_names: [],
    matches: 0,
    entries: 0,
    match_entries: 0,
    super_entries: 0,
    deleted_entries: 0,
    forms: 0,
    form_versions: 0,
    metrics: 0,
    dashboards: 0,
    weight_presets: 0,
    stations: null,
    last_saved_at: null,
    ...over,
  };
}
