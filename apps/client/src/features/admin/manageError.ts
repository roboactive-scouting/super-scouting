import { panelErrorLine, unreachable } from './adminMessages';

/** Why a list the page needs did not load: no connection, or a server refusal. */
export type Failure = { unreachable: boolean; line: string };

export const failureOf = (e: unknown): Failure => ({
  unreachable: unreachable(e),
  line: panelErrorLine(e),
});
