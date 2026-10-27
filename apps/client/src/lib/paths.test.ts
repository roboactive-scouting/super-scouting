import { describe, expect, it } from 'vitest';
import {
  entryPath,
  FORM_BUILDER_ROUTE,
  formBuilderPath,
  ENTRY_PREVIEW_ROUTE,
  entryPreviewPath,
  isEntryPath,
  PATHS,
  SUPER_TEAM_ROUTE,
  superTeamPath,
  TEAM_ROUTE,
  teamPath,
} from './paths';

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

  it('puts super scouting at /super, one team under it, on the data-entry path (task 1.36)', () => {
    expect(PATHS.super).toBe('/super');
    expect(SUPER_TEAM_ROUTE).toBe('/super/:teamId');
    expect(superTeamPath('t-1')).toBe('/super/t-1');
    expect(isEntryPath('/super')).toBe(true);
    expect(isEntryPath('/super/t-1')).toBe(true);
    expect(isEntryPath('/superb')).toBe(false);
  });

  it('puts team search at /teams and one team’s page under it, off the data-entry path (task 1.51)', () => {
    expect(PATHS.teams).toBe('/teams');
    expect(TEAM_ROUTE).toBe('/teams/:teamId');
    expect(teamPath('t-4')).toBe('/teams/t-4');
    expect(isEntryPath(PATHS.teams)).toBe(false);
    expect(isEntryPath(teamPath('t-4'))).toBe(false);
  });

  it('puts one entry’s preview under /entries, off the data-entry path (task 1.52)', () => {
    expect(ENTRY_PREVIEW_ROUTE).toBe('/entries/:id');
    expect(entryPreviewPath('e-1')).toBe('/entries/e-1');
    expect(isEntryPath(entryPreviewPath('e-1'))).toBe(false);
  });
});
