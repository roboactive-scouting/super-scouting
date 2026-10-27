import { FlaskConical } from 'lucide-react';
import { useId, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { SurfaceActions } from '@/components/ui/surface-actions';
import { db } from '@/data/db';
import { PATHS } from '@/lib/paths';
import { practiceMode } from './practice';
import type { PracticeStartState } from './PracticeStart';

/**
 * Finish practice's end (SPEC-FINAL 8.5; entry parts, "Finishing practice saves nothing"): a
 * bottom sheet on a phone, a dialog on a computer — the amber flask, "Practice finished",
 * "Nothing was saved or sent.", then **Practice another match** and **Exit practice**. Escape or
 * a tap on the scrim goes back to the form. Amber, never red: red is the red alliance.
 *
 * Practice another match empties the practice store and goes to `/practice` for the next match
 * after `after`; Exit practice leaves the screen for Scout first, then leaves practice (which
 * empties the store), so the entry never draws itself out of practice on the way. Rendered only
 * in practice, so the entry page needs no router otherwise.
 */
export function PracticeFinished({
  open,
  onClose,
  after,
}: {
  open: boolean;
  onClose: () => void;
  /** The match just practised (`null` for a super entry). */
  after: string | null;
}) {
  const navigate = useNavigate();
  const line = useId();
  const another = useRef<HTMLButtonElement>(null);
  return (
    <ResponsiveDialog
      open={open}
      title="Practice finished"
      onClose={onClose}
      showClose={false}
      width={420}
      initialFocus={another}
      describedBy={line}
      icon={
        <span
          aria-hidden="true"
          className="grid size-12 place-items-center rounded-full bg-warn-tint text-warn"
        >
          <FlaskConical className="size-6" strokeWidth={2.2} />
        </span>
      }
    >
      <p id={line} className="-mt-2 text-center text-[0.84375rem] text-muted">
        Nothing was saved or sent.
      </p>
      <SurfaceActions className="mt-1">
        <Button
          onClick={() => {
            onClose();
            navigate(PATHS.scout);
            void practiceMode.exit();
          }}
        >
          Exit practice
        </Button>
        <Button
          ref={another}
          variant="primary"
          onClick={() => {
            onClose();
            const state: PracticeStartState = after ? { after } : {};
            void db.practiceDrafts.clear().then(() => navigate(PATHS.practice, { state }));
          }}
        >
          Practice another match
        </Button>
      </SurfaceActions>
    </ResponsiveDialog>
  );
}
