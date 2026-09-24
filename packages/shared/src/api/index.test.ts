import { describe, expect, it } from 'vitest';
import { API } from './index';
import { loginInput, loginOutput, refreshTokenInput } from './auth';
import {
  changeOwnPasswordInput,
  createUserInput,
  disableUserInput,
  listUsersInput,
  listUsersOutput,
  publicUser,
  resetPasswordInput,
  setUserRoleInput,
} from './users';

describe('the shared API map (SPEC-FINAL 16.1)', () => {
  it('names every registry use case', () => {
    expect(Object.keys(API).sort()).toEqual([
      'changeOwnPassword',
      'createUser',
      'disableUser',
      'listUsers',
      'login',
      'refreshToken',
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
    expect(API.listUsers).toEqual({ input: listUsersInput, output: listUsersOutput });
  });
});
