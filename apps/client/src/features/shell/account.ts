import type { Role } from '@frc/shared';

/**
 * Who is signed in, and what they may do about it (SPEC-FINAL 7.3, 7.5): Switch scouter only
 * while the session is live, Change password only with a token (it needs the server), Sign
 * out always. The desktop account menu and the phone menu's foot both read this.
 */
export type Account = {
  name: string;
  role: Role;
  canSwitch: boolean;
  canChangePassword: boolean;
  onSignOut: () => void;
};
