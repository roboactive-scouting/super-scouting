import { describe, expect, it } from 'vitest';
import { entryPath, FORM_BUILDER_ROUTE, formBuilderPath, isEntryPath, PATHS } from './paths';

describe('paths (redesign R.4)', () => {
  it('puts Home at / and Scout at /scout', () => {
    expect(PATHS.home).toBe('/');
    expect(PATHS.scout).toBe('/scout');
  });

  it('builds the entry route with its alliance', () => {
    expect(entryPath('m-1', 't-1', 'blue')).toBe('/entry/m-1/t-1?alliance=blue');
  });

  it('puts the forms list under Admin and gives the builder its version as a query (task 1.29)', () => {
    expect(PATHS.forms).toBe('/admin/forms');
    expect(FORM_BUILDER_ROUTE).toBe('/admin/forms/:formId');
    expect(formBuilderPath('f-1')).toBe('/admin/forms/f-1');
    expect(formBuilderPath('f-1', 4)).toBe('/admin/forms/f-1?version=4');
    expect(isEntryPath(formBuilderPath('f-1', 4))).toBe(false);
  });

  it('knows the data-entry path, and nothing else as it (SPEC-FINAL 17.9)', () => {
    expect(isEntryPath('/scout')).toBe(true);
    expect(isEntryPath('/entry/m-1/t-1')).toBe(true);
    expect(isEntryPath('/entries')).toBe(false);
    expect(isEntryPath('/')).toBe(false);
    expect(isEntryPath('/scouting-report')).toBe(false);
  });
});
