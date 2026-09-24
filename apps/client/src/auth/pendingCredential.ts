export type Credential = { username: string; password: string };

/**
 * SPEC-FINAL 7.5: the password typed at an offline sign-in, held in memory only, for the
 * life of this session, and used to obtain a real token on the first successful
 * reconnect. It is never written to IndexedDB, localStorage, sessionStorage, a log or an
 * error message. A module-level variable is exactly the right lifetime: it dies with the
 * tab, which is what the spec asks for.
 */
let held: Credential | null = null;

export const pendingCredential = {
  set(credential: Credential): void {
    held = { username: credential.username, password: credential.password };
  },
  get(): Credential | null {
    return held;
  },
  clear(): void {
    held = null;
  },
};
