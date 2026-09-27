/**
 * The shell's gate when the server says no competition is set up (task 1.17b): the
 * `app_settings` singleton names no event. It is not an offline state and never says
 * anything about a connection — the device got its answer.
 */
export function NoCompetition() {
  return (
    <div className="p-8 text-center">
      <h1 className="text-lg font-semibold" dir="auto">
        No competition is set up yet
      </h1>
      <p className="text-[var(--text-muted)]" dir="auto">
        An admin sets up the season and competition. This device loads it the next time it is
        online.
      </p>
      {/*
       * PHASE 1C SLOT — the admin's "Set up a competition" action goes here, once the
       * season/event setup route exists (tasks 1.18–1.22). Render it for an admin only
       * (`canManageUsers`-style check on the signed-in user), as one link to that route,
       * and mark that route `handle: NO_HYDRATION` so it is reachable from this state.
       * Nothing renders here yet: there is no route to link to.
       */}
    </div>
  );
}
