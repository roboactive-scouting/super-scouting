import { useOutletContext } from 'react-router-dom';
import type { SessionUser } from '@/auth/session';

/** What AppShell hands every child route through `<Outlet context>`. */
export type ShellContext = {
  /** The signed-in user — the author of every local operation (SPEC-FINAL 7.5). */
  user: SessionUser;
  /** True once the server has refused the token; only the entry route still renders. */
  expired: boolean;
};

/**
 * The signed-in user, for any route under AppShell. AppShell renders its children only
 * once a session exists, so this is never null there.
 */
export function useSignedInUser(): SessionUser {
  return useOutletContext<ShellContext>().user;
}
