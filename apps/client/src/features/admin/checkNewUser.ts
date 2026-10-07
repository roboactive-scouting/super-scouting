import { createUserInput, passwordSchema, usernameSchema } from '@frc/shared';
import { sentence } from '@/auth/messages';

export type NewUserField = 'full_name' | 'username' | 'password';
export type NewUserProblem = { field: NewUserField | null; line: string };

/**
 * The same rules the server applies (packages/shared), in the dialog's field order, each
 * with its field named. `taken` is every loaded username, lowercase: one of them is refused
 * here, before the round trip, in the server's words. `null` when the new account may be sent.
 */
export function checkNewUser(
  fullName: string,
  username: string,
  password: string,
  taken: ReadonlySet<string> = new Set(),
): NewUserProblem | null {
  if (fullName.trim() === '') return { field: 'full_name', line: 'Enter their full name.' };
  if (!createUserInput.shape.full_name.safeParse(fullName).success) {
    return { field: 'full_name', line: 'That full name is too long. Shorten it.' };
  }
  if (username.trim() === '') return { field: 'username', line: 'Enter a username.' };
  const name = usernameSchema.safeParse(username);
  if (!name.success) {
    return {
      field: 'username',
      line: sentence(`for the username, ${name.error.issues[0]?.message ?? 'that is not valid'}`),
    };
  }
  if (taken.has(username.toLowerCase())) {
    return { field: 'username', line: `The username '${username}' is taken.` };
  }
  const pass = passwordSchema.safeParse(password);
  if (!pass.success) {
    return {
      field: 'password',
      line: sentence(`for the password, ${pass.error.issues[0]?.message ?? 'that is not valid'}`),
    };
  }
  return null;
}
