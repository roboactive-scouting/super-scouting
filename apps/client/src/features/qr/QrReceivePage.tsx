import { Camera, CameraOff, Check, Info, TriangleAlert, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatCount } from '@frc/shared';
import { newCollector, type Collector } from '@frc/shared/qr';
import { Button } from '@/components/ui/button';
import { useModalFocus } from '@/components/ui/useModalFocus';
import {
  describeBatch,
  receiveOperations,
  summarizeBatch,
  type BatchSummary,
} from '@/data/qrReceive';
import { useWakeLock } from '@/features/entry/useWakeLock';
import { qrSound, useBoolPref } from '@/lib/devicePrefs';
import { plural } from '@/lib/plural';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';
import { batchOperations, frameFromText, frameHeader } from './qrFrame';
import { startScanner, type Scanner } from './qrScanner';

/** The camera: starting, running, refused by the browser or the user, or failed otherwise. */
type CameraState = 'starting' | 'on' | 'blocked' | 'failed';
/** Why the last complete batch was dropped: its checksum (or content) failed, or the save did. */
type Trouble = 'damaged' | 'unsaved' | null;
type Phase = { kind: 'scanning' } | { kind: 'saving' } | { kind: 'done'; summary: BatchSummary };
type Progress = { total: number | null; held: number[] };

/**
 * `/sync/qr/receive` (21-qr-receive final, variant C; SPEC-FINAL 9.8; task 1.48): the collector
 * tablet scans another phone's looping QR frames. Scanning runs continuously from the rear camera
 * at 1080p (`qrScanner`: the browser's BarcodeDetector where it reads QR codes, zxing elsewhere);
 * every decoded code's Base45 text is turned back into the frame's bytes and goes into a
 * `Collector`, the ring counts them and one cell per frame shows which are held, in any order. A batch is written only when complete — `receiveOperations`, one
 * transaction — so leaving mid-batch writes nothing. A checksum failure drops the batch whole and
 * starts again. Done: the whole screen turns `--accent`, a beep (unless Sound is off on this
 * device) and a vibration where the device has one.
 *
 * A full-screen page on `--rail` on a phone or tablet; on a computer a full page, the camera at
 * the left and the status at the right. Router-free: `onDone` goes back to Sync. The camera is
 * stopped on unmount; the screen is kept on while it is open.
 */
export function QrReceivePage({ onDone }: { onDone?: () => void }) {
  const desktop = useIsDesktop();
  const sound = useBoolPref(qrSound);
  useWakeLock(true);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [camera, setCamera] = useState<CameraState>('starting');
  const [progress, setProgress] = useState<Progress>({ total: null, held: [] });
  const [trouble, setTrouble] = useState<Trouble>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'scanning' });

  // The scan runs outside React: its state lives in refs, and React is told what to draw.
  const collector = useRef<Collector>(newCollector());
  const batch = useRef<{ id: number; count: number } | null>(null);
  const held = useRef(new Set<number>());
  /** Saving or done: frames are ignored until Scan the next phone. */
  const paused = useRef(false);
  const mounted = useRef(true);
  const soundOn = useRef(sound);
  soundOn.current = sound;
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    // Set here, not only by the ref's initial value: StrictMode mounts, cleans up and mounts
    // again, and a page left `false` would never leave "Saving…".
    mounted.current = true;
    return () => {
      mounted.current = false;
      void audio.current?.close().catch(noop);
      audio.current = null;
    };
  }, []);

  /** Starts again with an empty collector; the cells stay for `total` frames, all missing. */
  const restart = (total: number | null) => {
    collector.current = newCollector();
    batch.current = null;
    held.current = new Set();
    setProgress({ total, held: [] });
  };

  const onFrame = async (bytes: Uint8Array) => {
    if (paused.current) return;
    const header = frameHeader(bytes);
    if (!header) return;
    // A frame of another batch: the sender moved on (Next batch) or another phone stepped up.
    // The batch in hand can no longer finish, so it is dropped — nothing of it was written —
    // and the new one starts from this frame.
    if (batch.current && batch.current.id !== header.batchId) {
      restart(null);
      setTrouble(null);
    }
    if (batch.current && batch.current.count !== header.count) return;
    try {
      collector.current.add(bytes);
    } catch {
      return;
    }
    batch.current = { id: header.batchId, count: header.count };
    if (!held.current.has(header.index)) {
      held.current.add(header.index);
      setProgress({ total: header.count, held: [...held.current] });
    }
    if (!collector.current.isComplete()) return;

    paused.current = true;
    let operations;
    try {
      operations = batchOperations(collector.current.result());
    } catch {
      // SPEC-FINAL 9.8: a batch whose checksum fails is dropped whole; nothing is written.
      paused.current = false;
      restart(header.count);
      setTrouble('damaged');
      return;
    }
    setPhase({ kind: 'saving' });
    try {
      await receiveOperations(operations);
    } catch {
      if (!mounted.current) return;
      paused.current = false;
      restart(header.count);
      setTrouble('unsaved');
      setPhase({ kind: 'scanning' });
      return;
    }
    // Written. Nothing past this point may say "Nothing was saved": without the cached names
    // the done screen still counts the records, its authors "a scouter".
    const summary = await describeBatch(operations).catch(() => summarizeBatch(operations));
    if (!mounted.current) return;
    setTrouble(null);
    setPhase({ kind: 'done', summary });
    if (soundOn.current) beep(audioContext(audio));
    navigator.vibrate?.(200);
  };
  const handle = useRef(onFrame);
  handle.current = onFrame;

  // The camera, for as long as the page is open (and again on Try again).
  useEffect(() => {
    if (!video) return;
    let stopped = false;
    let scanner: Scanner | null = null;
    setCamera('starting');
    startScanner(video, (text) => {
      if (stopped) return;
      // Not Base45 (a foreign code): ignored, and the scan goes on.
      const bytes = frameFromText(text);
      if (bytes) void handle.current(bytes);
    }).then(
      (started) => {
        if (stopped) started.stop();
        else {
          scanner = started;
          setCamera('on');
        }
      },
      (error: unknown) => {
        if (!stopped) setCamera(isBlocked(error) ? 'blocked' : 'failed');
      },
    );
    return () => {
      stopped = true;
      scanner?.stop();
    };
  }, [video, attempt]);

  const closed = useRef(false);
  const done = () => {
    if (closed.current) return;
    closed.current = true;
    onDone?.();
  };
  const scanNext = () => {
    restart(null);
    setTrouble(null);
    setPhase({ kind: 'scanning' });
    paused.current = false;
  };
  const retry = () => setAttempt((n) => n + 1);

  // A page over the whole app: the app beneath (#root; this page is portalled outside it) is
  // inert while it is open. Esc goes back to Sync, wherever focus is.
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    root.inert = true;
    return () => {
      root.inert = false;
    };
  }, []);
  const onEscape = useRef(done);
  onEscape.current = done;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape.current();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  const view: View = {
    camera,
    progress,
    trouble,
    phase,
    sound,
    setVideo,
    onDone: done,
    onScanNext: scanNext,
    onRetry: retry,
    // Web Audio may only start after a gesture on some browsers: any tap on the page unlocks it.
    onPointerDown: () => void audioContext(audio),
  };
  return createPortal(desktop ? <DesktopPage {...view} /> : <PhonePage {...view} />, document.body);
}

const noop = () => undefined;

/** The browser or the user refused the camera (or the page may not have it). */
function isBlocked(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'NotAllowedError' || name === 'SecurityError';
}

type AudioCtor = new () => AudioContext;

/** This page's audio context, made on first use and resumed when the browser suspended it. */
function audioContext(ref: { current: AudioContext | null }): AudioContext | null {
  if (!ref.current) {
    const Ctor =
      (window as { AudioContext?: AudioCtor }).AudioContext ??
      (window as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ref.current = new Ctor();
    } catch {
      return null;
    }
  }
  if (ref.current.state === 'suspended') void ref.current.resume().catch(noop);
  return ref.current;
}

/** A short 880 Hz beep (21-qr-receive final: "a short beep" on done). */
function beep(context: AudioContext | null): void {
  if (!context) return;
  try {
    const tone = context.createOscillator();
    const level = context.createGain();
    const end = context.currentTime + 0.18;
    tone.type = 'sine';
    tone.frequency.value = 880;
    level.gain.setValueAtTime(0.25, context.currentTime);
    level.gain.exponentialRampToValueAtTime(0.001, end);
    tone.connect(level);
    level.connect(context.destination);
    tone.start();
    tone.stop(end);
  } catch {
    // No sound is no failure: the green screen says it.
  }
}

type View = {
  camera: CameraState;
  progress: Progress;
  trouble: Trouble;
  phase: Phase;
  sound: boolean;
  setVideo: (video: HTMLVideoElement | null) => void;
  onDone: () => void;
  onScanNext: () => void;
  onRetry: () => void;
  onPointerDown: () => void;
};

const BACK = 'Done — back to Sync';
const SCANNING = 'Scanning…';
const AGAIN = 'Scanning again';

/** "Got it, Yael!" for one author; "Got it: Yael, Omer" for several (21-qr-receive final). */
export function gotItLine(authors: readonly (string | null)[]): string {
  const names = [...new Set(authors.map((name) => name ?? 'a scouter'))];
  return names.length === 1 ? `Got it, ${names[0]}!` : `Got it: ${names.join(', ')}`;
}

/** "records · 12 entries, 1 super" under the count. */
export function recordsLine(summary: BatchSummary): string {
  const parts = [
    summary.entries > 0 && plural(summary.entries, 'entry', 'entries'),
    summary.supers > 0 && plural(summary.supers, 'super', 'supers'),
    summary.others > 0 && plural(summary.others, 'other record'),
  ].filter((part): part is string => part !== false);
  const noun = summary.records === 1 ? 'record' : 'records';
  return parts.length === 0 ? noun : `${noun} · ${parts.join(', ')}`;
}

/** The status under the ring: what is happening, and the line under it. */
function statusLines(view: View): { title: string; detail: string } {
  if (view.phase.kind === 'saving') return { title: 'Saving…', detail: 'Hold on a moment.' };
  if (view.trouble === 'damaged') {
    return { title: AGAIN, detail: 'The pieces did not add up. Nothing was saved.' };
  }
  if (view.trouble === 'unsaved') {
    return { title: AGAIN, detail: 'That batch could not be saved. Nothing was saved.' };
  }
  return {
    title: SCANNING,
    detail:
      view.progress.total === null
        ? 'Point the camera at the other phone’s code.'
        : 'Missing frames come round again.',
  };
}

/**
 * The modal frame both shapes share: first focus on the panel, Tab kept inside. Esc is the
 * page's own document listener.
 */
function Modal({
  className,
  label,
  onPointerDown,
  children,
}: {
  className: string;
  label: string;
  onPointerDown: () => void;
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
      onPointerDown={onPointerDown}
      className={cn('focus-visible:outline-none', className)}
    >
      {children}
    </div>
  );
}

/** "Sound on" at the head's right: tap to turn the beep off; remembered on this device. */
function SoundToggle({ on, className }: { on: boolean; className: string }) {
  const Icon = on ? Volume2 : VolumeX;
  return (
    <Button
      variant="ghost"
      size="sm"
      role="switch"
      aria-checked={on}
      onClick={() => qrSound.set(!on)}
      className={cn('ms-auto gap-1.5 px-2 text-xs font-normal [&_svg]:size-[15px]', className)}
    >
      <Icon aria-hidden="true" />
      {on ? 'Sound on' : 'Sound off'}
    </Button>
  );
}

/**
 * THEME "Scanner screen": the camera (radius 14 px) with white 28 px aim corners, and the
 * damaged-code card on it. The video stays mounted while the page is open (hidden on the done
 * screen), so Scan the next phone starts at once.
 */
function CameraBox({
  view,
  className,
  overlay,
}: {
  view: View;
  className?: string;
  overlay?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative grid place-items-center overflow-hidden rounded-[14px] bg-rail-raised',
        className,
      )}
    >
      <video
        ref={view.setVideo}
        muted
        playsInline
        aria-label="Camera"
        className="absolute inset-0 size-full object-cover"
      />
      {view.camera !== 'blocked' && view.camera !== 'failed' && <Aim />}
      {view.trouble && view.phase.kind !== 'done' && <TroubleCard trouble={view.trouble} />}
      {overlay}
    </div>
  );
}

/** The white aim corners: 28 px arms, 3 px thick. */
function Aim() {
  const arm = 'absolute size-7 border-qr-plate';
  return (
    <span aria-hidden="true" className="relative aspect-square w-[62%] max-w-[26rem]">
      <span className={cn(arm, 'start-0 top-0 rounded-ss-xl border-s-[3px] border-t-[3px]')} />
      <span className={cn(arm, 'end-0 top-0 rounded-se-xl border-e-[3px] border-t-[3px]')} />
      <span className={cn(arm, 'start-0 bottom-0 rounded-es-xl border-s-[3px] border-b-[3px]')} />
      <span className={cn(arm, 'end-0 bottom-0 rounded-ee-xl border-e-[3px] border-b-[3px]')} />
    </span>
  );
}

/** "That code was damaged · Starting again, hold still", on the camera. */
function TroubleCard({ trouble }: { trouble: Exclude<Trouble, null> }) {
  return (
    <div
      role="alert"
      className="absolute inset-x-3 bottom-3 z-10 grid grid-cols-[auto_1fr] gap-x-2 rounded-[10px] bg-warn-tint px-3 py-2.5 text-ink"
    >
      <TriangleAlert aria-hidden="true" className="row-span-2 mt-0.5 size-[18px] text-warn" />
      <b className="text-[0.875rem]">
        {trouble === 'damaged' ? 'That code was damaged' : 'That batch could not be saved'}
      </b>
      <small className="text-xs text-ink-2">Starting again, hold still</small>
    </div>
  );
}

/** THEME "Scanner screen": the ring, `--accent` on `--rail-raised` (on light: on `--line`). */
function Ring({ progress, big }: { progress: Progress; big: boolean }) {
  const r = 54;
  const around = 2 * Math.PI * r;
  const count = progress.held.length;
  const share = progress.total ? count / progress.total : 0;
  return (
    <div aria-hidden="true" className={cn('relative shrink-0', big ? 'size-[140px]' : 'size-16')}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          className={big ? 'stroke-line' : 'stroke-rail-raised'}
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${share * around} ${around}`}
          className="stroke-accent"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <b className={cn('num', big ? 'text-[2.75rem]' : 'text-[1.375rem]')}>
          {formatCount(count)}
        </b>
        {progress.total !== null && (
          <small className={big ? 'text-[0.875rem] text-muted' : 'text-[0.625rem] text-rail-ink'}>
            of {formatCount(progress.total)}
          </small>
        )}
      </span>
    </div>
  );
}

/**
 * THEME "Frame cells": one numbered cell per frame, `--accent` once held, in any order. At most
 * twelve to a row, so a long batch wraps rather than shrinking its numbers away.
 */
function Cells({ progress, dark }: { progress: Progress; dark: boolean }) {
  if (progress.total === null) return null;
  const held = new Set(progress.held);
  return (
    <ol
      aria-hidden="true"
      className="grid w-full gap-1"
      style={{ gridTemplateColumns: `repeat(${Math.min(progress.total, 12)}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: progress.total }, (_, i) => (
        <li
          key={i}
          data-frame={i + 1}
          data-held={held.has(i)}
          className={cn(
            'num grid place-items-center rounded-[3px]',
            dark ? 'h-[22px] text-[0.6875rem]' : 'h-[26px] text-xs',
            held.has(i)
              ? 'bg-accent text-on-accent'
              : dark
                ? 'bg-rail-raised text-rail-ink'
                : 'bg-line text-ink-2',
          )}
        >
          {i + 1}
        </li>
      ))}
    </ol>
  );
}

/** What a screen reader hears of the count: "7 of 11 frames" (the ring and cells are drawn). */
function FramesText({ progress }: { progress: Progress }) {
  return (
    <p className="sr-only">
      {progress.total === null
        ? 'No frames yet'
        : `${formatCount(progress.held.length)} of ${formatCount(progress.total)} frames`}
    </p>
  );
}

/** "The camera is blocked" (or would not start), with Try again. */
function Blocked({ view, className }: { view: View; className?: string }) {
  const blocked = view.camera === 'blocked';
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-2 px-5 text-center text-surface', className)}
    >
      <span
        aria-hidden="true"
        className="grid size-[3.25rem] place-items-center rounded-full bg-warn-tint text-warn"
      >
        <CameraOff className="size-[26px]" />
      </span>
      <h2 className="text-lg font-[750]">
        {blocked ? 'The camera is blocked' : 'The camera did not start'}
      </h2>
      <p className="mb-2 max-w-[17rem] text-[0.84375rem] text-rail-ink">
        {blocked
          ? 'Allow the camera for this site in the browser’s settings, then try again.'
          : 'Another app may be using it. Close it, then try again.'}
      </p>
      <Button onClick={view.onRetry} className="border-rail-muted bg-transparent text-surface">
        <Camera aria-hidden="true" />
        Try again
      </Button>
    </div>
  );
}

/** THEME "Success screen": the whole screen `--accent`, the author, the count, the next phone. */
function DoneView({ summary, desktop }: { summary: BatchSummary; desktop: boolean }) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-1.5 text-center',
        desktop && 'py-8',
      )}
    >
      <span
        aria-hidden="true"
        className="mb-2 grid size-24 place-items-center rounded-full bg-surface text-accent"
      >
        <Check className="size-[54px]" strokeWidth={3} />
      </span>
      <h2 className="text-[1.875rem] font-extrabold">{gotItLine(summary.authors)}</h2>
      <span className="num text-[4rem] leading-none font-bold">{formatCount(summary.records)}</span>
      <p className="text-[0.9375rem] text-on-accent-soft">{recordsLine(summary)}</p>
      <p className="mt-[18px] text-[0.9375rem] font-[650]">Next phone, step up.</p>
      <p className="mt-2.5 inline-flex max-w-[16.25rem] items-center gap-1.5 text-start text-[0.78125rem] text-on-accent-soft">
        <Info aria-hidden="true" className="size-4 shrink-0" />
        The phone shows Next batch? Tap it there, then scan again.
      </p>
    </div>
  );
}

/** The done screen's two actions: Scan the next phone (white primary), and back to Sync. */
function DoneFoot({ view }: { view: View }) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <Button
        size="block"
        onClick={view.onScanNext}
        className="border-surface bg-surface text-accent-ink"
      >
        <Camera aria-hidden="true" />
        Scan the next phone
      </Button>
      <Button
        variant="ghost"
        onClick={view.onDone}
        className="min-h-11 w-full text-[0.875rem] text-on-accent"
      >
        {BACK}
      </Button>
    </div>
  );
}

/** Phone and tablet: the whole screen on `--rail` (21-qr-receive final, phone). */
function PhonePage(view: View) {
  const heading = useId();
  const { phase } = view;
  const done = phase.kind === 'done';
  const noCamera = view.camera === 'blocked' || view.camera === 'failed';
  const status = statusLines(view);
  return (
    <Modal
      label={heading}
      onPointerDown={view.onPointerDown}
      className={cn(
        'fixed inset-0 z-50 overflow-y-auto',
        done ? 'bg-accent text-on-accent' : 'on-rail bg-rail text-surface',
      )}
    >
      <div className="mx-auto flex min-h-full w-full max-w-[30rem] flex-col gap-3.5 px-4 pt-[max(0.875rem,env(safe-area-inset-top))] pb-[max(1.125rem,env(safe-area-inset-bottom))]">
        <header className="flex h-10 items-center gap-2.5">
          <h1 id={heading} className="text-base font-bold">
            Receive by QR
          </h1>
          <SoundToggle on={view.sound} className={done ? 'text-on-accent-soft' : 'text-rail-ink'} />
        </header>
        <CameraBox
          view={view}
          className={cn('aspect-[3/4] w-full', (done || noCamera) && 'hidden')}
        />
        {done ? (
          <>
            <DoneView summary={phase.summary} desktop={false} />
            <DoneFoot view={view} />
          </>
        ) : (
          <>
            {noCamera ? (
              <Blocked view={view} className="mt-[4.375rem]" />
            ) : (
              <>
                <div className="flex items-center gap-3.5">
                  <Ring progress={view.progress} big={false} />
                  <div className="min-w-0">
                    <p className="text-lg font-bold">{status.title}</p>
                    <p className="text-[0.78125rem] text-rail-ink">{status.detail}</p>
                  </div>
                </div>
                <Cells progress={view.progress} dark />
                <FramesText progress={view.progress} />
              </>
            )}
            <Button
              size="block"
              onClick={view.onDone}
              className="mt-auto border-rail-muted bg-transparent text-surface"
            >
              {BACK}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Computer: a full page, the camera at the left and the status at the right (desktop final). */
function DesktopPage(view: View) {
  const heading = useId();
  const { phase } = view;
  const done = phase.kind === 'done';
  const noCamera = view.camera === 'blocked' || view.camera === 'failed';
  const status = statusLines(view);
  const { total, held } = view.progress;
  return (
    <Modal
      label={heading}
      onPointerDown={view.onPointerDown}
      className={cn(
        'fixed inset-0 z-50 flex gap-8 overflow-y-auto p-8',
        done ? 'bg-accent text-on-accent' : 'bg-bg text-ink',
      )}
    >
      <CameraBox
        view={view}
        className={cn('min-h-[30rem] min-w-0 flex-1', done && 'hidden')}
        overlay={
          noCamera ? (
            <Blocked view={view} className="on-rail absolute inset-0 justify-center bg-rail" />
          ) : null
        }
      />
      {done ? (
        <div className="mx-auto flex w-full max-w-[26rem] flex-col">
          <header className="flex items-center gap-3">
            <h1 id={heading} className="text-[1.375rem] font-bold">
              Receive by QR
            </h1>
            <SoundToggle on={view.sound} className="text-on-accent-soft" />
          </header>
          <DoneView summary={phase.summary} desktop />
          <DoneFoot view={view} />
        </div>
      ) : (
        <div className="flex w-[27rem] shrink-0 flex-col items-start gap-3">
          <header className="flex w-full items-center gap-3">
            <h1 id={heading} className="text-[1.375rem] font-bold">
              Receive by QR
            </h1>
            <SoundToggle on={view.sound} className="text-muted" />
          </header>
          {/* No camera, no scan: the camera panel says why, and nothing here claims to scan. */}
          {!noCamera && (
            <>
              <Ring progress={view.progress} big />
              <p className="text-lg font-bold">{status.title}</p>
              <Cells progress={view.progress} dark={false} />
              <FramesText progress={view.progress} />
              <p className="text-[0.84375rem] text-muted">
                {view.trouble || view.phase.kind === 'saving'
                  ? status.detail
                  : total === null
                    ? 'Frames come in any order. A green screen and a beep mean it is done.'
                    : `${formatCount(held.length)} of ${formatCount(total)} frames, in any order. A green screen and a beep mean it is done.`}
              </p>
            </>
          )}
          <Button onClick={view.onDone} className="mt-auto">
            {BACK}
          </Button>
        </div>
      )}
    </Modal>
  );
}
