import { describe, expect, it } from 'vitest';
import { AppError } from './errors';
import { assertRole, isService, isUser, type Caller } from './caller';

const admin: Caller = { kind: 'user', userId: 'u-1', role: 'admin' };
const scouter: Caller = { kind: 'user', userId: 'u-2', role: 'scouter' };
const service: Caller = { kind: 'service', label: 'mcp' };

describe('caller', () => {
  it('recognises user and service callers', () => {
    expect(isUser(admin)).toBe(true);
    expect(isService(service)).toBe(true);
    expect(isUser(service)).toBe(false);
  });

  it('allows a role that is listed', () => {
    expect(() => assertRole(admin, ['admin'])).not.toThrow();
    expect(() => assertRole(scouter, ['scouter', 'lead', 'admin'])).not.toThrow();
  });

  it('rejects a role that is not listed, with code forbidden', () => {
    expect(() => assertRole(scouter, ['admin'])).toThrowError(AppError);
    try {
      assertRole(scouter, ['admin']);
    } catch (e) {
      expect((e as AppError).code).toBe('forbidden');
    }
  });

  it('rejects a service caller from every role-gated use case', () => {
    expect(() => assertRole(service, ['scouter', 'lead', 'admin'])).toThrowError(AppError);
  });
});
