import {
  CloudOff,
  FileX,
  GitMerge,
  Inbox,
  Lock,
  SearchX,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PRIMARY_BUTTON } from './buttonStyles';

/**
 * SPEC-FINAL 17.8's six variants, plus `not-permitted` (task 1.17): a role reaching a page
 * it may not use. Device gating is not a permission (7.4), so that case is not DesktopOnly's.
 */
export const STATE_VARIANTS = [
  'no-data',
  'form-not-published',
  'offline-needs-server',
  'failed',
  'no-results',
  'conflicts-waiting',
  'not-permitted',
] as const;

export type StateVariant = (typeof STATE_VARIANTS)[number];

/** Exactly one primary action: a route to go to, or a thing to do here. */
export type StateAction = { label: string } & ({ to: string } | { onClick: () => void });

/** The sentence that stops someone re-entering a match (SPEC-FINAL 17.8). */
export const SAFE_ON_DEVICE = 'Your data is safe on this device.';

const VARIANTS: Record<StateVariant, { glyph: LucideIcon; title: string; detail: string }> = {
  'no-data': {
    glyph: Inbox,
    title: 'Nothing here yet',
    detail: 'This fills in as soon as something is added.',
  },
  'form-not-published': {
    glyph: FileX,
    title: 'This form is not published yet',
    detail: 'An admin publishes a form before anyone can scout with it.',
  },
  'offline-needs-server': {
    glyph: CloudOff,
    title: 'This needs the server',
    detail: 'This page reads from the server, and this device cannot reach it right now.',
  },
  failed: {
    glyph: TriangleAlert,
    title: 'That did not work',
    detail: 'Something went wrong on the way. Try again.',
  },
  'no-results': {
    glyph: SearchX,
    title: 'Nothing matches',
    detail: 'Try fewer words, or clear a filter.',
  },
  'conflicts-waiting': {
    glyph: GitMerge,
    title: 'Conflicts are waiting for review',
    detail: 'Two devices changed the same record. A lead chooses which version stays.',
  },
  'not-permitted': {
    glyph: Lock,
    title: 'This page is not open to your role',
    detail: 'The server decides who may do what, and it would refuse this too.',
  },
};

/**
 * The one state component (SPEC-FINAL 17.8): a centred glyph, one bold line of what
 * happened, one muted line of why, and exactly one primary action. No dead ends.
 *
 * `detail` must be a sentence for a person: pass an error through `sentence()` or a
 * `…ErrorLine()` helper, never an error code. The offline variant always ends with
 * SAFE_ON_DEVICE, whatever `detail` says.
 */
export function StateMessage({
  variant,
  action,
  title,
  detail,
  headingLevel = 2,
}: {
  variant: StateVariant;
  action: StateAction;
  title?: string;
  detail?: string;
  headingLevel?: 1 | 2;
}) {
  const copy = VARIANTS[variant];
  const Glyph = copy.glyph;
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const why = detail ?? copy.detail;
  const line = variant === 'offline-needs-server' ? `${why} ${SAFE_ON_DEVICE}` : why;

  return (
    <section className="mx-auto flex max-w-md flex-col items-center px-4 py-12 text-center">
      <Glyph aria-hidden="true" className="size-8 text-[var(--text-muted)]" strokeWidth={1.5} />
      <Heading className="mt-4 text-lg font-semibold" dir="auto">
        {title ?? copy.title}
      </Heading>
      <p className="mt-2 text-[var(--text-muted)]" dir="auto">
        {line}
      </p>
      <div className="mt-6">
        {'to' in action ? (
          <Link to={action.to} className={PRIMARY_BUTTON}>
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={PRIMARY_BUTTON}>
            {action.label}
          </button>
        )}
      </div>
    </section>
  );
}
