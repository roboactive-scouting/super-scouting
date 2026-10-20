import { useEffect, useMemo, useState } from 'react';
import type { FieldPhase, FormFieldDefinition } from '@frc/shared';
import { prefersReducedMotion } from '@/lib/animate';
import { entryProblems, entryView, type Problem } from './entryRules';
import { seedValues } from './entryValues';
import { donePhases, phasesOf, type Phase } from './phases';
import { stopwatches } from './stopwatches';

/** Where Go to puts focus inside a field's row: its first control. */
const CONTROL =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex="0"]';

export type EntryForm = {
  /** The shown phases, in match order, each with its shown fields (a phase of none gets no tab). */
  phases: Phase[];
  /** The phase on screen; undefined while the form has no shown field. */
  current: Phase | undefined;
  setPhase: (phase: FieldPhase) => void;
  /** Phases with a field the scout has set: their tab shows a ✓. */
  done: Set<FieldPhase>;
  /** Every field's value as its control holds it: the form's starting values under the scout's. */
  values: Record<string, unknown>;
  /** The data the entry would save: computed fields worked out, hidden fields left out. */
  saved: Record<string, unknown>;
  /** Everything that holds Review entry right now. */
  problems: Problem[];
  /**
   * The line each field shows under itself, by key: an out-of-range value always (as it is
   * typed), the other problems once Review entry has been pressed.
   */
  marks: ReadonlyMap<string, string>;
  /** How many marked problems each phase holds (`'status'`: the breakdown time). */
  toFix: ReadonlyMap<FieldPhase | 'status', number>;
  /** Review entry: true when nothing holds it (go to the confirmation); else opens the problems. */
  review: () => boolean;
  problemsOpen: boolean;
  closeProblems: () => void;
  /** Go to: closes the problems, opens the field's phase, scrolls to the field and focuses it. */
  goTo: (problem: Problem) => void;
};

/**
 * The entry form's rules for a page that has fields and the scout's values (SPEC-FINAL 5.7, 5.8,
 * 8.2, 15.1; task 1.36): the match entry and the super entry share it. `data` is what the scout
 * has set (what a draft saves); the form's starting values (`seedValues`: a toggle off, a counter
 * at its minimum, a default) sit under it, because what a control shows is what it holds. A dead
 * robot (`skipChecks`: No show, Disabled) has no problems at all (§8.2).
 */
export function useEntryForm({
  fields,
  data,
  skipChecks = false,
  breakdownMissing = false,
}: {
  fields: readonly FormFieldDefinition[];
  data: Record<string, unknown>;
  skipChecks?: boolean;
  breakdownMissing?: boolean;
}): EntryForm {
  const [phase, setPhase] = useState<FieldPhase>('auto');
  const [attempted, setAttempted] = useState(false);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [target, setTarget] = useState<{ key: string; at: number } | null>(null);

  const seeds = useMemo(() => seedValues(fields), [fields]);
  const values = useMemo(() => ({ ...seeds, ...data }), [seeds, data]);
  const view = useMemo(() => entryView(fields, values), [fields, values]);
  const phases = useMemo(() => phasesOf(view.shown), [view.shown]);
  const done = useMemo(() => donePhases(phases, data), [phases, data]);
  const current = phases.find((p) => p.key === phase) ?? phases[0];

  // Read on every render, not memoised: a stopwatch's running state lives outside React.
  const problems = skipChecks
    ? []
    : entryProblems({
        phases,
        values,
        breakdownMissing,
        running: (key) => stopwatches.running(key),
      });
  const marked = problems.filter((p) => p.kind === 'range' || attempted);
  const marks = new Map(marked.map((p) => [p.key, p.line]));
  const toFix = new Map<FieldPhase | 'status', number>();
  for (const p of marked) {
    const key = p.phase ?? 'status';
    toFix.set(key, (toFix.get(key) ?? 0) + 1);
  }

  // After Go to: the phase is on screen and the problems sheet has handed focus back to Review
  // entry (it closes first), so the field is found, brought into view and focused here.
  useEffect(() => {
    if (!target) return;
    // Field keys are snake_case identifiers (SPEC-FINAL 5.3), safe inside the quotes.
    const row = document.querySelector<HTMLElement>(`[data-field="${target.key}"]`);
    if (!row) return;
    row.scrollIntoView?.({
      block: 'center',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
    row.querySelector<HTMLElement>(CONTROL)?.focus({ preventScroll: true });
  }, [target]);

  return {
    phases,
    current,
    setPhase,
    done,
    values,
    saved: view.saved,
    problems,
    marks,
    toFix,
    review() {
      if (skipChecks || problems.length === 0) return true;
      setAttempted(true);
      setProblemsOpen(true);
      return false;
    },
    problemsOpen: problemsOpen && problems.length > 0,
    closeProblems: () => setProblemsOpen(false),
    goTo(problem) {
      setProblemsOpen(false);
      if (problem.phase) setPhase(problem.phase);
      setTarget({ key: problem.key, at: Date.now() });
    },
  };
}
