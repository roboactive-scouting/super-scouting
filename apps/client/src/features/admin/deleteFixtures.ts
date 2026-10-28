import type { GetDeleteImpactOutput } from '@frc/shared';

/**
 * `getDeleteImpact`'s whole answer for tests (task 1.60's shape): every count 0, nothing blocked,
 * unless given. The kind's name is what must be typed unless `confirm_name` says otherwise.
 */
export function deleteImpact(over: Partial<GetDeleteImpactOutput> = {}): GetDeleteImpactOutput {
  const name = over.name ?? '2025';
  return {
    kind: 'season',
    id: '11111111-1111-4111-8111-111111111111',
    name,
    confirm_name: name,
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
