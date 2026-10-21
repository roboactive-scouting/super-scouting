import { Check, ChevronLeft, ChevronRight, Cloud, Sun } from 'lucide-react';
import QRCode from 'qrcode';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { formatCount, formatTime } from '@frc/shared';
import { QR_FRAMES_PER_SECOND } from '@frc/shared/qr';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useModalFocus } from '@/components/ui/useModalFocus';
import { useWakeLock } from '@/features/entry/useWakeLock';
import { plural } from '@/lib/plural';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';
import { markShownByQr, planLine, planQrSend, type QrBatch, type QrSendPlan } from './qrSendData';

/** Quiet modules around the code; the white card's 10 px padding adds the rest. */
const QR_MARGIN = 1;
/** A version-40 code is 177 modules a side. */
const QR_MODULES = 177 + 2 * QR_MARGIN;

/**
 * `/sync/qr/send` (20-qr-send final, variant A; SPEC-FINAL 9.8; task 1.47): this device's whole
 * outbox as a moving QR code for the collector tablet. The outbox is read ONCE when the page
 * opens and split into batches of at most 200 operations; each batch's frames loop 1…N at five a
 * second by themselves until the page closes. **Next batch** moves on only when tapped (the
 * tablet sends nothing back). **Done** is the only way out (Esc on a computer), and nothing is
 * marked sent either way: a scan is a backup hop, never an ack, so this page never calls
 * `ackResults` and never changes a record's sync state — it only stamps `qr_shown_at` for Sync's
 * "shown by QR hh:mm". The screen is kept on (Wake Lock) while it is open.
 *
 * On a phone a full-screen page on `--rail` with no top or bottom bar; on a computer a dialog
 * over Sync (the route renders Sync beneath). Router-free: `onDone` closes it.
 */
export function QrSendPage({ onDone }: { onDone?: () => void }) {
  const desktop = useIsDesktop();
  const [plan, setPlan] = useState<QrSendPlan | null>(null);
  const [batchAt, setBatchAt] = useState(0);
  const [frameAt, setFrameAt] = useState(0);
  const [open, setOpen] = useState(true);
  const awake = useWakeLock(open);
  const canvas = useRef<HTMLCanvasElement>(null);

  // The batch is fixed when the page opens: read once, never again while it is open.
  useEffect(() => {
    let live = true;
    void planQrSend().then((next) => {
      if (live) setPlan(next);
    });
    return () => {
      live = false;
    };
  }, []);

  const batch: QrBatch | undefined = plan?.batches[batchAt];
  const frames = batch?.frames.length ?? 0;

  // 1…N, 1…N, … at QR_FRAMES_PER_SECOND, until the page closes. Under reduced motion as well:
  // the moving code is the data itself, not decoration.
  useEffect(() => {
    if (frames === 0) return;
    const timer = setInterval(
      () => setFrameAt((at) => (at + 1) % frames),
      1000 / QR_FRAMES_PER_SECOND,
    );
    return () => clearInterval(timer);
  }, [frames, batchAt]);

  const frame = batch?.frames[frameAt];
  // In the commit that changes "Frame k of N", so the code and its number change in one paint.
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el || !frame) return;
    // As many device pixels per module as the card allows, so the modules stay sharp.
    const px = el.clientWidth * (window.devicePixelRatio || 1);
    const scale = px > 0 ? Math.max(1, Math.floor(px / QR_MODULES)) : 4;
    void QRCode.toCanvas(el, [{ data: frame, mode: 'byte' }], {
      errorCorrectionLevel: 'M',
      version: 40,
      margin: QR_MARGIN,
      scale,
    }).catch(() => undefined);
  }, [frame, desktop]);

  // "shown by QR hh:mm" (SPEC-FINAL 9.10): the last time the batch was on screen — stamped when it
  // appears and again when it leaves (Next batch, Done, or leaving the page).
  useEffect(() => {
    if (!batch) return;
    const stamp = () => void markShownByQr(batch.row_ids, new Date().toISOString()).catch(noop);
    stamp();
    return stamp;
  }, [batch]);

  const closed = useRef(false);
  const done = () => {
    if (closed.current) return;
    closed.current = true;
    setOpen(false);
    onDone?.();
  };
  // A modal over the whole app: the app beneath (#root; this page is portalled outside it) is
  // inert while it is open — no focus, no clicks, nothing read out or measured beneath the scrim.
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    root.inert = true;
    return () => {
      root.inert = false;
    };
  }, []);
  // Esc closes it (a computer's way out), wherever focus is: the menu that opened it may still
  // hold focus on the page beneath.
  const onEscape = useRef(done);
  onEscape.current = done;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape.current();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  const next = () => {
    setFrameAt(0);
    setBatchAt((at) => at + 1);
  };

  const noun = desktop ? 'this device' : 'this phone';
  const total = plan?.batches.length ?? 0;
  const view: View = {
    plan,
    batch,
    batchAt,
    total,
    frameAt,
    frames,
    awake,
    canvas,
    noun,
    onDone: done,
    onNext: batchAt + 1 < total ? next : null,
  };
  return createPortal(
    desktop ? <DesktopDialog {...view} /> : <PhonePage {...view} />,
    document.body,
  );
}

const noop = () => undefined;

type View = {
  plan: QrSendPlan | null;
  batch: QrBatch | undefined;
  batchAt: number;
  total: number;
  frameAt: number;
  frames: number;
  awake: boolean;
  canvas: RefObject<HTMLCanvasElement | null>;
  /** "this phone" / "this device". */
  noun: string;
  onDone: () => void;
  /** Next batch, while one is left; null on the last. */
  onNext: (() => void) | null;
};

const NOTHING = 'Nothing to send';
const NOTHING_DETAIL = (noun: string) => `Everything on ${noun} has already reached the cloud.`;
const NOT_SENT = 'Nothing is marked sent. These records wait for the cloud as before.';
const HINT = 'Hold the phone still, about 20 cm from the tablet’s camera.';

/**
 * The modal frame both shapes share (THEME "QR plate"): first focus on the panel, Tab kept
 * inside. Esc is the page's own document listener, so it closes whatever holds focus.
 */
function Modal({
  className,
  label,
  children,
}: {
  className: string;
  label: string;
  children: ReactNode;
}) {
  const { panel, onKeyDown } = useModalFocus(noop, 'panel');
  return (
    <div
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={label}
      onKeyDown={onKeyDown}
      className={cn('focus-visible:outline-none', className)}
    >
      {children}
    </div>
  );
}

/** THEME "QR plate": the code black on white, on a white card (radius 14 px, 10 px padding). */
function Plate({ view, className }: { view: View; className?: string }) {
  return (
    <div className={cn('rounded-[14px] bg-qr-plate p-2.5 leading-none', className)}>
      {view.batch ? (
        <canvas
          ref={view.canvas}
          role="img"
          aria-label={`QR code: ${view.batch.holds}`}
          // qrcode writes a pixel width and height on the element; the card's width wins.
          className="block aspect-square h-auto! w-full! [image-rendering:pixelated]"
        />
      ) : (
        <div className="aspect-square w-full" />
      )}
    </div>
  );
}

/** THEME "Frame strip": one segment per frame; on screen, already shown this pass, waiting. */
function FrameStrip({ at, count, dark }: { at: number; count: number; dark: boolean }) {
  return (
    <div aria-hidden="true" className="flex gap-[3px]">
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          className={cn(
            'h-1.5 flex-1 rounded-[2px]',
            i === at
              ? dark
                ? 'bg-qr-plate'
                : 'bg-accent'
              : i < at
                ? dark
                  ? 'bg-frame-shown-rail'
                  : 'bg-frame-shown'
                : dark
                  ? 'bg-rail-raised'
                  : 'bg-line',
          )}
        />
      ))}
    </div>
  );
}

/**
 * "Frame 4 of 11" in mono. A status for what it is, but never read out: a live region that
 * changed five times a second would drown a screen reader.
 */
function Counter({ view, className }: { view: View; className: string }) {
  return (
    <p role="status" aria-live="off" className={cn('num whitespace-nowrap', className)}>
      Frame <b>{formatCount(view.frameAt + 1)}</b> of <b>{formatCount(view.frames)}</b>
    </p>
  );
}

/** "Batch 1 of 2" with "200 of 205 records", or "the last 5 records" on the last. */
function BatchBand({ view, dark }: { view: View; dark: boolean }) {
  if (view.total < 2 || !view.batch || !view.plan) return null;
  const last = view.batchAt + 1 === view.total;
  const what = last
    ? `the last ${plural(view.batch.records, 'record')}`
    : `${formatCount(view.batch.records)} of ${plural(view.plan.records, 'record')}`;
  return (
    <p
      className={cn(
        'flex items-baseline gap-2 rounded-[10px] px-3 py-2 text-[0.875rem]',
        dark ? 'bg-rail-raised' : 'bg-bg',
      )}
    >
      <span className="font-semibold">
        Batch {formatCount(view.batchAt + 1)} of {formatCount(view.total)}
      </span>
      <small className={cn('ms-auto text-xs', dark ? 'text-rail-ink' : 'text-muted')}>{what}</small>
    </p>
  );
}

/** The foot: Done — back to Sync on the last batch; Done + Next batch › before it. */
function Foot({ view, dark }: { view: View; dark: boolean }) {
  return (
    <div className="mt-auto flex flex-col gap-2">
      {view.onNext ? (
        <div className="flex gap-2">
          <Button
            size="lg"
            onClick={view.onDone}
            className={cn(dark && 'border-rail-muted bg-transparent text-surface')}
          >
            Done
          </Button>
          <Button variant="primary" size="lg" className="flex-1" onClick={view.onNext}>
            Next batch
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <Button variant="primary" size="block" onClick={view.onDone}>
          <Check aria-hidden="true" />
          Done — back to Sync
        </Button>
      )}
      <small
        className={
          dark ? 'text-center text-[0.71875rem] text-rail-muted' : 'text-[0.78125rem] text-muted'
        }
      >
        {NOT_SENT}
      </small>
    </div>
  );
}

/** Phone: the whole screen on `--rail`, no top or bottom bar (20-qr-send final, phone). */
function PhonePage(view: View) {
  const heading = useId();
  const { plan, batch } = view;
  const empty = plan !== null && !batch;
  return (
    <Modal
      label={heading}
      className="on-rail fixed inset-0 z-50 overflow-y-auto bg-rail text-surface"
    >
      <div className="mx-auto flex min-h-full w-full max-w-[30rem] flex-col gap-3.5 px-4 pt-[max(0.875rem,env(safe-area-inset-top))] pb-[max(1.125rem,env(safe-area-inset-bottom))]">
        <header className="flex items-center gap-2.5">
          <div className="flex min-w-0 flex-col">
            <h1 id={heading} className="text-base font-bold">
              Send by QR
            </h1>
            <p className="text-xs text-rail-ink">
              {plan && batch ? planLine(plan) : 'To the collector tablet'}
            </p>
          </div>
          {view.awake && !empty && (
            <span className="ms-auto inline-flex items-center gap-1 text-[0.6875rem] whitespace-nowrap text-rail-ink">
              <Sun aria-hidden="true" className="size-3.5 text-timer-warn" />
              Screen stays on
            </span>
          )}
        </header>
        {empty ? (
          <div className="mt-20 flex flex-col items-center gap-2 px-6 text-center">
            <span
              aria-hidden="true"
              className="grid size-[3.25rem] place-items-center rounded-full bg-rail-raised text-rail-ink"
            >
              <Cloud className="size-[26px]" />
            </span>
            <h2 className="text-lg font-[750]">{NOTHING}</h2>
            <p className="mb-2 max-w-[16.25rem] text-[0.84375rem] text-rail-ink">
              {NOTHING_DETAIL(view.noun)}
            </p>
            <Button onClick={view.onDone} className="border-rail-muted bg-transparent text-surface">
              <ChevronLeft aria-hidden="true" />
              Back to Sync
            </Button>
          </div>
        ) : (
          <>
            <BatchBand view={view} dark />
            <Plate view={view} />
            {batch && (
              <>
                <div className="flex flex-col gap-2">
                  <FrameStrip at={view.frameAt} count={view.frames} dark />
                  <div className="flex items-baseline gap-2">
                    <Counter
                      view={view}
                      className="text-[0.9375rem] text-rail-ink [&_b]:text-surface"
                    />
                    <span className="ms-auto text-xs text-rail-muted">loops by itself</span>
                  </div>
                </div>
                <p className="text-[0.8125rem] text-rail-ink">{HINT}</p>
                <Foot view={view} dark />
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/** Computer: a dialog over Sync, the code on a dark panel at the left, the details at the right. */
function DesktopDialog(view: View) {
  const heading = useId();
  const { plan, batch } = view;
  const empty = plan !== null && !batch;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[var(--scrim)] p-4">
      <Modal
        label={heading}
        className={cn(
          'motion-safe:animate-scale-in flex max-w-full overflow-hidden rounded-2xl bg-surface text-ink shadow-[var(--shadow-float)]',
          empty ? 'w-[27.5rem]' : 'min-h-[35rem] w-[56.25rem]',
        )}
      >
        {!empty && (
          <div className="grid w-[32.5rem] shrink-0 place-items-center bg-rail p-6">
            <Plate view={view} className="w-full" />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-[1.375rem]">
          <h2 id={heading} className="text-xl font-[750]">
            Send by QR
          </h2>
          <p className="text-[0.84375rem] text-muted">
            To the collector tablet. No internet needed.
          </p>
          {empty ? (
            <EmptyState
              icon={Cloud}
              title={NOTHING}
              detail={NOTHING_DETAIL(view.noun)}
              headingLevel={2}
              className="border-0 px-0 pb-1"
              action={
                <Button onClick={view.onDone}>
                  <ChevronLeft aria-hidden="true" />
                  Back to Sync
                </Button>
              }
            />
          ) : (
            batch &&
            plan && (
              <>
                <BatchBand view={view} dark={false} />
                <Counter view={view} className="text-[1.375rem] text-ink-2 [&_b]:text-ink" />
                <FrameStrip at={view.frameAt} count={view.frames} dark={false} />
                <p className="mt-0.5 text-[0.84375rem] text-muted">
                  Loops 1…{formatCount(view.frames)} by itself. A frame the tablet misses comes
                  round again.
                </p>
                <div className="flex flex-col gap-0.5 rounded-card border border-line px-3 py-2.5 text-[0.84375rem]">
                  <b className="text-xs font-bold text-muted">In this code</b>
                  <span>{batch.holds}</span>
                  <span className="text-[0.78125rem] text-muted">
                    {[batch.matches, `saved before ${formatTime(plan.read_at)}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                {view.awake && (
                  <p className="flex items-center gap-2 text-[0.78125rem] text-ink-2">
                    <Sun aria-hidden="true" className="size-4 text-warn" />
                    Screen stays on while this is open
                  </p>
                )}
                <Foot view={view} dark={false} />
              </>
            )
          )}
        </div>
      </Modal>
    </div>
  );
}
