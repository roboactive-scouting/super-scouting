import { describe, expect, it } from 'vitest';
import { AppError } from '../errors';
import type { Caller } from '../caller';
import {
  assertCan,
  can,
  canEditEntry,
  CAPABILITIES,
  SELF_EDIT_WINDOW_MS,
  withinSelfEditWindow,
} from './permissions';

const scouter: Caller = { kind: 'user', userId: 'u-s', role: 'scouter' };
const lead: Caller = { kind: 'user', userId: 'u-l', role: 'lead' };
const admin: Caller = { kind: 'user', userId: 'u-a', role: 'admin' };
const service: Caller = { kind: 'service', label: 'mcp' };

describe('the permission matrix (SPEC-FINAL 7.2)', () => {
  it('lets every role log in, view all data and submit entries', () => {
    for (const caller of [scouter, lead, admin]) {
      expect(can(caller, 'view_all_data')).toBe(true);
      expect(can(caller, 'submit_entry')).toBe(true);
      expect(can(caller, 'ensure_match')).toBe(true);
    }
  });

  it('gives leads and admins entry management, conflict resolution, do-not-pick and draft dashboards', () => {
    for (const capability of [
      'manage_entries',
      'resolve_conflict',
      'add_do_not_pick',
      'draft_dashboard',
    ] as const) {
      expect(can(scouter, capability), capability).toBe(false);
      expect(can(lead, capability), capability).toBe(true);
      expect(can(admin, capability), capability).toBe(true);
    }
  });

  it('reserves saving dashboards, forms, events, pick lists, users, deletion and the alliance bracket to the admin', () => {
    for (const capability of [
      'save_dashboard',
      'manage_forms',
      'manage_events',
      'manage_pick_lists',
      'manage_users',
      'delete_objects',
      'edit_do_not_pick',
      'record_alliance_bracket',
    ] as const) {
      expect(can(scouter, capability), capability).toBe(false);
      expect(can(lead, capability), capability).toBe(false);
      expect(can(admin, capability), capability).toBe(true);
    }
  });

  it('grants a service caller nothing at all', () => {
    for (const capability of Object.keys(CAPABILITIES) as (keyof typeof CAPABILITIES)[]) {
      expect(can(service, capability), capability).toBe(false);
    }
  });

  it('throws a forbidden AppError from assertCan', () => {
    expect(() => assertCan(scouter, 'manage_users')).toThrowError(AppError);
    expect(() => assertCan(admin, 'manage_users')).not.toThrow();
  });
});

describe('the five-minute self-edit window (SPEC-FINAL 7.6)', () => {
  it('is five minutes', () => {
    expect(SELF_EDIT_WINDOW_MS).toBe(300_000);
  });

  it('compares the two client timestamps to each other, never to server time', () => {
    // created and edited offline, uploaded six hours later: still inside the window
    expect(withinSelfEditWindow('2026-11-14T09:00:00.000Z', '2026-11-14T09:04:00.000Z')).toBe(true);
    expect(withinSelfEditWindow('2026-11-14T09:00:00.000Z', '2026-11-14T09:06:00.000Z')).toBe(
      false,
    );
  });

  it('is inclusive at exactly 300000ms and false one millisecond past it', () => {
    expect(withinSelfEditWindow('2026-11-14T09:00:00.000Z', '2026-11-14T09:05:00.000Z')).toBe(true);
    expect(withinSelfEditWindow('2026-11-14T09:00:00.000Z', '2026-11-14T09:05:00.001Z')).toBe(
      false,
    );
  });

  it('returns false for a negative elapsed time and for an unparsable timestamp', () => {
    // updated before created — should never happen, but must not be treated as "within window"
    expect(withinSelfEditWindow('2026-11-14T09:05:00.000Z', '2026-11-14T09:00:00.000Z')).toBe(
      false,
    );
    expect(withinSelfEditWindow('not-a-timestamp', '2026-11-14T09:00:00.000Z')).toBe(false);
    expect(withinSelfEditWindow('2026-11-14T09:00:00.000Z', 'not-a-timestamp')).toBe(false);
  });

  it('lets a scouter edit their own entry inside the window and not outside it', () => {
    const own = { scouter_id: 'u-s', client_created_at: '2026-11-14T09:00:00.000Z' };
    expect(canEditEntry(scouter, { ...own, client_updated_at: '2026-11-14T09:01:00.000Z' })).toBe(
      true,
    );
    expect(canEditEntry(scouter, { ...own, client_updated_at: '2026-11-14T09:30:00.000Z' })).toBe(
      false,
    );
  });

  it('never lets a scouter edit somebody else’s entry, even inside the window', () => {
    expect(
      canEditEntry(scouter, {
        scouter_id: 'u-other',
        client_created_at: '2026-11-14T09:00:00.000Z',
        client_updated_at: '2026-11-14T09:01:00.000Z',
      }),
    ).toBe(false);
  });

  it('lets a lead or admin edit any entry at any time', () => {
    const old = {
      scouter_id: 'u-other',
      client_created_at: '2026-11-14T09:00:00.000Z',
      client_updated_at: '2026-11-20T09:00:00.000Z',
    };
    expect(canEditEntry(lead, old)).toBe(true);
    expect(canEditEntry(admin, old)).toBe(true);
  });
});
