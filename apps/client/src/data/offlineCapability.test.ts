import { describe, expect, it } from 'vitest';
import { isAvailableOffline, OFFLINE_CAPABILITY } from './offlineCapability';

describe('the offline capability matrix (SPEC-FINAL 9.6)', () => {
  it('allows entry creation, the self-edit and bare match auto-creation', () => {
    for (const capability of ['create_entry', 'self_edit_entry', 'ensure_match'] as const) {
      expect(isAvailableOffline(capability), capability).toBe(true);
    }
  });

  it('allows alliance-selection editing, which all rides the same outbox', () => {
    for (const capability of [
      'edit_pick_list',
      'add_do_not_pick',
      'edit_alliance_bracket',
    ] as const) {
      expect(isAvailableOffline(capability), capability).toBe(true);
    }
  });

  it('allows reading statistics and saved dashboards, and creating a draft dashboard', () => {
    for (const capability of [
      'view_statistics',
      'view_saved_dashboard',
      'create_draft_dashboard',
      'read_conflicts',
    ] as const) {
      expect(isAvailableOffline(capability), capability).toBe(true);
    }
  });

  it('refuses everything that needs the server', () => {
    for (const capability of [
      'save_dashboard',
      'edit_form',
      'manage_users',
      'switch_active_event',
      'cross_event_view',
      'manage_events',
      'resolve_conflict',
    ] as const) {
      expect(isAvailableOffline(capability), capability).toBe(false);
    }
  });

  it('covers every capability the app gates on, with no silent default', () => {
    expect(Object.keys(OFFLINE_CAPABILITY).length).toBeGreaterThanOrEqual(14);
    // @ts-expect-error a capability that is not in the matrix must not typecheck
    expect(() => isAvailableOffline('invented')).toBeTruthy();
  });

  it('throws, never answers false, for a name that reaches it from outside the types', () => {
    expect(() => isAvailableOffline('invented' as never)).toThrow(/not in the offline capability/);
    expect(() => isAvailableOffline('toString' as never)).toThrow(/not in the offline capability/);
  });
});
