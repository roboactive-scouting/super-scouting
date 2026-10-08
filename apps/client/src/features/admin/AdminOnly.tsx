import type { ReactNode } from 'react';
import { can, type Role } from '@frc/shared';
import { StateMessage } from '@/components/StateMessage';
import { useSignedInUser } from '@/features/shell/shellContext';
import { NOT_ADMIN_TITLE } from './adminMessages';
import { PATHS } from '@/lib/paths';

/** SPEC-FINAL 7.2 through the one permission check, never a hand-written role compare. */
export function canManageUsers(user: { id: string; role: Role }): boolean {
  return can({ kind: 'user', userId: user.id, role: user.role }, 'manage_users');
}

/** Same rule, `manage_events` (SPEC-FINAL 6.2, 6.3, 6.4): task 1.20's admin management page. */
export function canManageEvents(user: { id: string; role: Role }): boolean {
  return can({ kind: 'user', userId: user.id, role: user.role }, 'manage_events');
}

/** Same rule, `manage_forms` (SPEC-FINAL 5.1: form templates are admin-only): task 1.29. */
export function canManageForms(user: { id: string; role: Role }): boolean {
  return can({ kind: 'user', userId: user.id, role: user.role }, 'manage_forms');
}

/** What a page behind `AdminOnly` checks, and what it says to someone who may not. */
export type AdminGate = {
  allow: (user: { id: string; role: Role }) => boolean;
  title: string;
  detail: string;
};

/** The Users pages' gate: the default. */
export const USERS_GATE: AdminGate = {
  allow: canManageUsers,
  title: NOT_ADMIN_TITLE,
  detail:
    'Accounts, roles and passwords are managed by an admin. Ask one if something needs to change.',
};

/**
 * The UI half of SPEC-FINAL 7.4: a non-admin who reaches an admin URL gets a clear state
 * and nothing is requested. Convenience only — the server refuses every admin call anyway.
 */
export function AdminOnly({
  gate = USERS_GATE,
  children,
}: {
  gate?: AdminGate;
  children: ReactNode;
}) {
  const user = useSignedInUser();
  if (gate.allow(user)) return <>{children}</>;
  return (
    <StateMessage
      variant="not-permitted"
      headingLevel={1}
      title={gate.title}
      detail={gate.detail}
      action={{ label: 'Back to scouting', to: PATHS.scout }}
    />
  );
}
