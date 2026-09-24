import type { ReactNode } from 'react';
import { can, type Role } from '@frc/shared';
import { StateMessage } from '@/components/StateMessage';
import { useSignedInUser } from '@/features/shell/shellContext';
import { NOT_ADMIN_TITLE } from './adminMessages';

/** SPEC-FINAL 7.2 through the one permission check, never a hand-written role compare. */
export function canManageUsers(user: { id: string; role: Role }): boolean {
  return can({ kind: 'user', userId: user.id, role: user.role }, 'manage_users');
}

/**
 * The UI half of SPEC-FINAL 7.4: a non-admin who reaches an admin URL gets a clear state
 * and nothing is requested. Convenience only — the server refuses every admin call anyway.
 */
export function AdminOnly({ children }: { children: ReactNode }) {
  const user = useSignedInUser();
  if (canManageUsers(user)) return <>{children}</>;
  return (
    <StateMessage
      variant="not-permitted"
      headingLevel={1}
      title={NOT_ADMIN_TITLE}
      detail="Accounts, roles and passwords are managed by an admin. Ask one if something needs to change."
      action={{ label: 'Back to scouting', to: '/' }}
    />
  );
}
