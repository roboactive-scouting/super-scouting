import { RotateCcw } from 'lucide-react';
import { useEffect, useState, type ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import type * as TimedParts from './timedParts';

type Parts = typeof TimedParts;

const importParts = (): Promise<Parts> => import('./timedParts');

let importer: () => Promise<Parts> = importParts;
let loaded: Parts | null = null;
let loading: Promise<Parts> | null = null;

/**
 * Loads the timed parts' chunk; while a load is in flight every call gets the same promise. A
 * failed load is not kept (an interrupted first load, a deploy that renamed the chunk): the next
 * call tries again, which is what the stand-ins' Try again does.
 */
export function loadTimedParts(): Promise<Parts> {
  loading ??= importer().then(
    (parts) => (loaded = parts),
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

/** Tests only: load the chunk through `load` instead, starting from nothing loaded. */
export function setTimedPartsImportForTests(load: (() => Promise<Parts>) | null): void {
  importer = load ?? importParts;
  loaded = null;
  loading = null;
}

// Started as the app starts (this module is in the initial bundle), not when an entry opens:
// by the time a scout has picked a match and a robot, the chunk is long in memory. A failure
// here is not lost: the stand-ins try again when drawn, and say so if that fails too.
loadTimedParts().catch(() => undefined);

type State = { parts: Parts | null; failed: boolean; retry: () => void };

/** The parts once loaded, whether the load failed, and a retry. */
function useTimedParts(): State {
  const [parts, setParts] = useState(loaded);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (parts) return;
    let live = true;
    loadTimedParts().then(
      (p) => {
        if (live) setParts(p);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [parts, attempt]);
  return {
    parts,
    failed: failed && !parts,
    retry: () => {
      setFailed(false);
      setAttempt((n) => n + 1);
    },
  };
}

/**
 * A part whose chunk failed to load says so where it would be (SPEC-FINAL 16.7's fail-loud rule,
 * on the competition path): a still warning notice, never red, with a 48 px Try again. Nothing is
 * recorded or changed meanwhile; the entry's values stay as they are.
 */
function NotLoaded({
  what,
  onRetry,
  slim = false,
}: {
  what: string;
  onRetry: () => void;
  slim?: boolean;
}) {
  return (
    <Notice
      role="alert"
      tone="warning"
      still
      className={slim ? 'rounded-none border-x-0 py-1.5' : 'my-3'}
      action={
        <Button size="sm" onClick={onRetry}>
          <RotateCcw aria-hidden="true" />
          Try again
        </Button>
      }
    >
      <b className="font-[650]">{what} didn't load.</b>{' '}
      {!slim && <span className="text-muted">What is already entered is kept.</span>}
    </Notice>
  );
}

/*
 * Thin stand-ins with the real components' props. They draw nothing until the chunk is in,
 * which in practice is never seen: the chunk loads at app start and from the precache. No
 * Suspense boundary, so a page never shows a fallback for them.
 */

export function MatchTimer(props: ComponentProps<Parts['MatchTimer']>) {
  const { parts, failed, retry } = useTimedParts();
  if (parts) return <parts.MatchTimer {...props} />;
  // Only a form with a timer would have drawn one.
  if (failed && (props.config?.phases.length ?? 0) > 0) {
    return <NotLoaded what="The match timer" onRetry={retry} slim />;
  }
  return null;
}

export function TimerInput(props: ComponentProps<Parts['TimerInput']>) {
  const { parts, failed, retry } = useTimedParts();
  if (parts) return <parts.TimerInput {...props} />;
  return failed ? <NotLoaded what={`“${props.field.label}”`} onRetry={retry} /> : null;
}

export function EventLogInput(props: ComponentProps<Parts['EventLogInput']>) {
  const { parts, failed, retry } = useTimedParts();
  if (parts) return <parts.EventLogInput {...props} />;
  return failed ? <NotLoaded what={`“${props.field.label}”`} onRetry={retry} /> : null;
}

export function PositionInput(props: ComponentProps<Parts['PositionInput']>) {
  const { parts, failed, retry } = useTimedParts();
  if (parts) return <parts.PositionInput {...props} />;
  return failed ? <NotLoaded what={`“${props.field.label}”`} onRetry={retry} /> : null;
}

/**
 * A map field opened view only from the confirmation (UF.24). If the chunk failed, the map's
 * place is the same still notice with Try again, and Close; the confirmation stays as it was.
 */
export function MapFieldView(props: ComponentProps<Parts['MapFieldView']>) {
  const { parts, failed, retry } = useTimedParts();
  if (parts) return <parts.MapFieldView {...props} />;
  if (!failed) return null;
  return (
    <ResponsiveDialog open title={props.field.label} onClose={props.onClose} sheetClose>
      <NotLoaded what="The map" onRetry={retry} />
      <Button variant="secondary" size="block" onClick={props.onClose}>
        Close
      </Button>
    </ResponsiveDialog>
  );
}

export function CyclePathInput(props: ComponentProps<Parts['CyclePathInput']>) {
  const { parts, failed, retry } = useTimedParts();
  if (parts) return <parts.CyclePathInput {...props} />;
  return failed ? <NotLoaded what={`“${props.field.label}”`} onRetry={retry} /> : null;
}
