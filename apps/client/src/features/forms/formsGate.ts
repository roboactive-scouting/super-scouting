import { canManageForms, type AdminGate } from '@/features/admin/AdminOnly';

/**
 * The forms list's and the form builder's gate (task 1.29): `manage_forms`, admin only
 * (SPEC-FINAL 5.1). Here rather than in AdminOnly.tsx, which the nav pulls into the initial
 * bundle: only the two lazy pages need these words.
 */
export const FORMS_GATE: AdminGate = {
  allow: canManageForms,
  title: 'Only an admin can edit forms',
  detail: 'The scouting forms are set up by an admin. Ask one if a form needs to change.',
};
