import { describe, expect, it } from 'vitest';
import { RpcError } from '@/data/rpc';
import {
  FORMS_FORBIDDEN,
  FORMS_UNREACHABLE,
  formErrorLine,
  offersReload,
  reasonOf,
} from './formErrors';

const refused = (code: string, details: unknown, status = 400) =>
  new RpcError(code, 'the server sentence', status, true, details);

describe('formErrorLine: every form refusal is one plain sentence (task 1.29)', () => {
  it.each([
    ['key-change', {}, "A saved field's key never changes."],
    ['key-retired', { key: 'auto_x', last_type: 'counter' }, 'Bring it back as a counter'],
    ['unknown-field-id', {}, 'no longer in this version'],
    ['duplicate-key', { key: 'tele_high' }, 'Two fields have the key “tele_high”.'],
    ['duplicate-field-id', {}, 'name the same saved field'],
    ['draft-exists', { version_no: 4 }, 'Draft v4 already exists.'],
    ['stale-version', {}, 'Someone else saved this version'],
    ['version-race', {}, 'Another admin started a new version'],
    ['form-exists', { kind: 'match' }, 'This season already has a match form.'],
    ['published', {}, 'A published version cannot be deleted'],
    ['has-entries', { entries: 1 }, '1 entry was scouted with this version'],
    ['has-entries', { entries: 3 }, '3 entries were scouted with this version'],
    ['already-published', {}, 'already published'],
    ['not-published', {}, 'A draft cannot be restored'],
    ['not-exportable', {}, 'Only the draft or the active version'],
    ['kind-mismatch', {}, 'another kind of form'],
  ])('%s', (reason, details, expected) => {
    const line = formErrorLine(refused('invalid', { reason, ...details }));
    expect(line).toContain(expected);
    expect(line).not.toMatch(/invalid|conflict|key-change|undefined/);
  });

  it('names the field of a positioned definition problem by its label, and counts the rest', () => {
    const e = refused('invalid', {
      reason: 'invalid-definition',
      issues: [
        { field_key: 'tele_drop', path: 'description', message: 'description is required' },
        { field_key: 'tele_drop', path: 'unit', message: 'unit is required' },
      ],
    });
    expect(formErrorLine(e, { labelOf: (k) => (k === 'tele_drop' ? 'Pieces dropped' : k) })).toBe(
      '“Pieces dropped”: Description is required. 1 more problem after it.',
    );
    expect(
      formErrorLine(
        refused('invalid', {
          reason: 'invalid-scoring',
          issues: [{ field_key: null, path: 'rules', message: 'no rules' }],
        }),
      ),
    ).toBe('The form: No rules.');
  });

  it('says offline, a timeout and a portal page alike: nothing lost, needs a connection', () => {
    expect(formErrorLine(new RpcError('offline', 'x', 0))).toBe(FORMS_UNREACHABLE);
    expect(formErrorLine(new RpcError('timeout', 'x', 0))).toBe(FORMS_UNREACHABLE);
    expect(formErrorLine(new RpcError('invalid', 'x', 502, false))).toBe(FORMS_UNREACHABLE);
  });

  it('a 403 is never "disabled", and a gone form says so', () => {
    expect(formErrorLine(refused('forbidden', undefined, 403))).toBe(FORMS_FORBIDDEN);
    expect(formErrorLine(refused('not-found', { form_id: 'x' }, 404))).toContain(
      'no longer exists',
    );
  });

  it("falls back to the server's own sentence, capitalised", () => {
    expect(formErrorLine(refused('invalid', undefined))).toBe('The server sentence.');
    expect(reasonOf(refused('conflict', { reason: 'stale-version' }))).toBe('stale-version');
    expect(reasonOf(new Error('x'))).toBeUndefined();
  });
});

describe('offersReload: a builder refusal that says "reload" gets a Reload button (task 1.29)', () => {
  it.each([
    'stale-version',
    'unknown-field-id',
    'key-change',
    'version-race',
    'already-published',
    'duplicate-field-id',
  ])('%s says reload, and offers it', (reason) => {
    const e = refused('conflict', { reason });
    expect(formErrorLine(e)).toMatch(/reload/i);
    expect(offersReload(e)).toBe(true);
  });

  it.each(['duplicate-key', 'draft-exists', 'invalid-definition', 'not-published'])(
    '%s does not',
    (reason) => {
      const e = refused('invalid', { reason });
      expect(formErrorLine(e)).not.toMatch(/reload/i);
      expect(offersReload(e)).toBe(false);
    },
  );
});
