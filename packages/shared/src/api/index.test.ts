import { describe, expect, it } from 'vitest';
import { API } from './index';
import { loginInput, loginOutput, refreshTokenInput } from './auth';
import { activeContext, getActiveContextInput } from './context';
import {
  changeOwnPasswordInput,
  createUserInput,
  disableUserInput,
  enableUserInput,
  listUsersInput,
  listUsersOutput,
  publicUser,
  renameUserInput,
  resetPasswordInput,
  setUserRoleInput,
} from './users';

describe('the shared API map (SPEC-FINAL 16.1)', () => {
  it('names every registry use case', () => {
    expect(Object.keys(API).sort()).toEqual([
      'changeOwnPassword',
      'createUser',
      'disableUser',
      'enableUser',
      'getActiveContext',
      'listUsers',
      'login',
      'refreshToken',
      'renameUser',
      'resetPassword',
      'setUserRole',
    ]);
  });

  it('carries the identical schema objects, so the client and the server cannot drift', () => {
    expect(API.login).toEqual({ input: loginInput, output: loginOutput });
    expect(API.refreshToken).toEqual({ input: refreshTokenInput, output: loginOutput });
    expect(API.changeOwnPassword.input).toBe(changeOwnPasswordInput);
    expect(API.changeOwnPassword.output).toBe(publicUser);
    expect(API.createUser.input).toBe(createUserInput);
    expect(API.setUserRole.input).toBe(setUserRoleInput);
    expect(API.resetPassword.input).toBe(resetPasswordInput);
    expect(API.disableUser.input).toBe(disableUserInput);
    expect(API.enableUser.input).toBe(enableUserInput);
    expect(API.renameUser.input).toBe(renameUserInput);
    expect(API.listUsers).toEqual({ input: listUsersInput, output: listUsersOutput });
    expect(API.getActiveContext).toEqual({
      input: getActiveContextInput,
      output: activeContext,
    });
  });
});
