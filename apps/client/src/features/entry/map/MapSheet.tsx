import { Eye, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { Point } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { AllianceTag, StationTag, TAG } from '@/components/ui/tag';
import { useModalFocus } from '@/components/ui/useModalFocus';
import type { Station } from '@/data/station';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';
import { FieldImage } from '@/season/FieldImage';
import { isKnownSeasonImage } from '@/season/images';
import {
  imageToView,
  viewRotation,
  viewToImage,
  type MapLayout,
  type Rotation,
} from './mapGeometry';
import { DRAW_SLOP_PX } from './simplify';

/** One mark on the map, in IMAGE coordinates (0–1, the season image as stored, unturned). */
export type MapMark = {
  id: string;
  point: Point;
  /** `own`: in the scout's alliance colour (what is being placed); `old`: grey, earlier marks. */
  tone: 'own' | 'old';
  /** A number drawn in the dot ("1", "2"), for numbered spots. */
  label?: string;
  /**
   * The mark's name ("Spot 2"). With `onSelect`, a named mark is a button that selects it
   * (task 1.35: tap a spot → ✕ Remove); without a name it is only drawn.
   */
  name?: string;
};

/**
 * One route on the map (the cycle path, task 1.35), its points in IMAGE coordinates: a 1.8 px
 * round-joined line in the scout's alliance colour with a dot at each point. The one being drawn
 * is dashed with bigger dots; while one is drawn or selected, the others fade to 45 %.
 */
export type MapPath = {
  id: string;
  points: readonly Point[];
  /** "Path 2": the accessible name, and the pill's "Remove path 2". */
  name: string;
  /** The path being drawn: dashed, bigger dots, never selectable. */
  drawing?: boolean;
};

export type MapSheetProps = {
  open: boolean;
  /** "High goal · where?" */
  title: string;
  /** "Shots · tap at 1:12 · optional" */
  subtitle: string;
  alliance: 'red' | 'blue';
  station: Station | null;
  /** The season's `field_image_path`; null when the device does not know it. */
  imagePath: string | null;
  marks: readonly MapMark[];
  /** A tap on the drawing, already turned back into image coordinates. Never called `viewOnly`. */
  onTap?: (image: Point) => void;
  /** ✕ or Escape. */
  onClose: () => void;
  /** The one-line hint under the map. */
  hint?: ReactNode;
  /** The tools at the start of the bar (Undo, Skip · no place, …). */
  tools?: ReactNode;
  /** The words at the bar's end, before Done on a computer ("3 spots"). */
  status?: ReactNode;
  /** The primary action: full width on a phone, at the right on a computer. Hidden while the image is missing. */
  done?: { label: string; onClick: () => void; disabled?: boolean };
  /** Phone (full screen, upright) or computer (dialog, flat); by default the viewport decides. */
  layout?: MapLayout;
  /** Routes drawn over the image (the cycle path). */
  paths?: readonly MapPath[];
  /** The id of the selected mark or path, which shows the ✕ Remove pill. */
  selected?: string | null;
  /**
   * Makes named marks and finished paths selectable: a tap on one reports its id (a second tap
   * on the selected one reports null). While something is selected, a tap on the map only
   * reports null: it keeps the mark and adds nothing (design "Removing").
   */
  onSelect?: (id: string | null) => void;
  /** ✕ Remove on the pill, or the Delete key, on the selected mark or path. */
  onRemove?: (id: string) => void;
  /** The pill's words: "Remove" (default) or "Remove path". */
  removeLabel?: string;
  /** A line before the tools ("● Drawing path 3 · 3 of 6 points"): its own row on a phone. */
  lead?: ReactNode;
  /**
   * The tools, the lead, the status and the hint act on the map, so they go with the image while
   * it is missing (a position or cycle path records nothing then); the event log's Skip stays.
   */
  toolsNeedImage?: boolean;
  /**
   * The map to look at, not to change (UF.24: a map field opened from the confirmation): a
   * "View only" tag, no tools, a tap on the drawing does nothing, and a secondary **Close** in
   * place of Done. `lead` (an event log's chips) and `status` (the count) still show.
   */
  viewOnly?: boolean;
  /**
   * A drag on the field (UF.25, the cycle path): the stroke is drawn live under the finger and,
   * on release, handed over in IMAGE coordinates with the image's width : height. A press that
   * moves less than `DRAW_SLOP_PX` stays a tap (`onTap`). Only the first finger draws; a second is
   * ignored. Never called `viewOnly`.
   */
  onStroke?: (image: Point[], aspect: number) => void;
  /** As a drag begins (past the slop): false refuses it and nothing is drawn (a full path). */
  onStrokeStart?: () => boolean;
};

/** The season image's shape until it has loaded: `public/seasons/2026/field.webp` is 2000 × 812. */
const DEFAULT_RATIO = 2000 / 812;

/**
 * The map pop-up every map field opens (design 12-form-builder, "The map: one pattern for every
 * map field"; SPEC-FINAL 8.2): the event log's "where?" (task 1.34), the position picker and the
 * cycle path (1.35). On a phone it is full screen with the field upright and the scout's own
 * alliance end at the bottom; on a computer it is the ~820 px Dialog with the field lying flat
 * and the own end on the left. The turn is display only: a tap is mapped back to the image
 * (`viewToImage`) before the caller sees it, and marks are given in image coordinates, so stored
 * data never depends on the rotation or the device.
 *
 * The image is the season's, through `FieldImage`: when it is missing (not in the build, or it
 * fails to load) its alert shows in place of the map, unchanged, no tap can land and Done is
 * withdrawn, so no coordinate can be recorded (16.7).
 */
export function MapSheet(props: MapSheetProps) {
  const desktop = useIsDesktop();
  const layout = props.layout ?? (desktop ? 'desktop' : 'phone');
  if (!props.open) return null;
  return layout === 'desktop' ? <DesktopMap {...props} /> : <PhoneMap {...props} />;
}

function Tag({ alliance, station }: { alliance: 'red' | 'blue'; station: Station | null }) {
  return station ? (
    <StationTag station={station} />
  ) : (
    <AllianceTag alliance={alliance}>{alliance === 'red' ? 'Red' : 'Blue'}</AllianceTag>
  );
}

function PhoneMap(props: MapSheetProps) {
  const heading = useId();
  const sub = useId();
  const { panel, onKeyDown } = useModalFocus(props.onClose, 'panel');
  const image = useImageState(props.imagePath);
  const tools = image.usable || !props.toolsNeedImage;
  return createPortal(
    <div
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={heading}
      aria-describedby={sub}
      data-surface="map"
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex flex-col bg-bg pt-[env(safe-area-inset-top)] text-ink"
    >
      <header className="flex flex-none items-center gap-2.5 border-b border-line bg-surface py-2 ps-1.5 pe-3">
        <button
          type="button"
          aria-label="Close"
          onClick={props.onClose}
          className="tap-target hover-veil grid size-12 shrink-0 place-items-center rounded-control text-ink-2"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 id={heading} className="truncate text-[1.0625rem] font-[750]" dir="auto">
            {props.title}
          </h2>
          <p id={sub} className="truncate text-[0.78125rem] text-muted" dir="auto">
            {props.subtitle}
          </p>
        </div>
        {props.viewOnly && <ViewOnlyTag />}
        <Tag alliance={props.alliance} station={props.station} />
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pt-2.5 pb-1.5 [container-type:size]">
        <FieldDrawing {...props} {...image} rotation={viewRotation(props.alliance, 'phone')} fit />
      </div>
      {tools && props.hint && (
        <p
          role="status"
          className="flex-none px-4 pb-2 text-center text-[0.78125rem] text-muted [&_b]:text-ink-2"
        >
          {props.hint}
        </p>
      )}
      <div className="flex flex-none flex-col gap-2.5 border-t border-line bg-surface px-3.5 pt-2.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
        {tools && props.lead && (
          <div className="flex items-center gap-2 text-[0.8125rem] font-semibold text-ink-2">
            {props.lead}
          </div>
        )}
        {props.viewOnly
          ? props.status && (
              <p data-testid="map-status" className="text-[0.8125rem] text-muted">
                {props.status}
              </p>
            )
          : tools && (
              <div className="flex min-h-12 items-center gap-2">
                {props.tools}
                {props.status && (
                  <span
                    data-testid="map-status"
                    className="ms-auto whitespace-nowrap text-[0.8125rem] text-muted"
                  >
                    {props.status}
                  </span>
                )}
              </div>
            )}
        {props.viewOnly ? (
          <Button variant="secondary" size="block" onClick={props.onClose}>
            Close
          </Button>
        ) : (
          image.usable &&
          props.done && (
            <Button
              variant="primary"
              size="block"
              onClick={props.done.onClick}
              disabled={props.done.disabled}
            >
              {props.done.label}
            </Button>
          )
        )}
      </div>
    </div>,
    document.body,
  );
}

function DesktopMap(props: MapSheetProps) {
  const sub = useId();
  const image = useImageState(props.imagePath);
  const tools = image.usable || !props.toolsNeedImage;
  return (
    <Dialog open title={props.title} onClose={props.onClose} width={820} describedBy={sub}>
      <div className="-mt-2 flex items-center gap-3">
        <p id={sub} className="min-w-0 flex-1 text-[0.8125rem] text-muted" dir="auto">
          {props.subtitle}
        </p>
        {props.viewOnly && <ViewOnlyTag />}
        <Tag alliance={props.alliance} station={props.station} />
      </div>
      <FieldDrawing {...props} {...image} rotation={viewRotation(props.alliance, 'desktop')} />
      {tools && props.hint && (
        <p role="status" className="text-[0.8125rem] text-muted [&_b]:text-ink-2">
          {props.hint}
        </p>
      )}
      {props.viewOnly && props.lead && <div>{props.lead}</div>}
      <div className="flex min-h-12 items-center gap-2 pt-1">
        {tools && !props.viewOnly && props.lead && (
          <div className="me-1.5 flex items-center gap-2 text-[0.8125rem] font-semibold text-ink-2">
            {props.lead}
          </div>
        )}
        {tools && props.tools}
        <span
          data-testid="map-status"
          className={cn(
            'whitespace-nowrap text-[0.8125rem] text-muted',
            // View only: the count at the start, Close at the end.
            props.viewOnly ? 'me-auto' : 'ms-auto me-1.5',
          )}
        >
          {tools && props.status}
        </span>
        {props.viewOnly ? (
          <Button variant="secondary" onClick={props.onClose}>
            Close
          </Button>
        ) : (
          image.usable &&
          props.done && (
            <Button variant="primary" onClick={props.done.onClick} disabled={props.done.disabled}>
              {props.done.label}
            </Button>
          )
        )}
      </div>
    </Dialog>
  );
}

/** A THEME tag on `--line-2` with an eye: the map opened from the confirmation (UF.24). */
function ViewOnlyTag() {
  return (
    <span className={cn(TAG, 'bg-line-2 text-ink-2')}>
      <Eye aria-hidden="true" className="size-3.5" />
      View only
    </span>
  );
}

type ImageState = { usable: boolean; onFailed: () => void };

/**
 * Whether the season image can be drawn: a path this build ships (`isKnownSeasonImage`) that has
 * not failed to load. While it cannot, no tap lands and Done is withdrawn.
 */
function useImageState(imagePath: string | null): ImageState {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const usable = imagePath !== null && isKnownSeasonImage(imagePath) && failedPath !== imagePath;
  return { usable, onFailed: () => setFailedPath(imagePath) };
}

/** "Spot 2" → "spot 2", for "Remove spot 2". */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * The season image turned by `rotation`, the marks and routes over it, and the tap that maps back
 * to the image. `fit` sizes it into a size container (the phone's map area); otherwise it fills
 * the width (the dialog). While the image is missing it is FieldImage's alert, nothing more.
 */
function FieldDrawing({
  imagePath,
  marks,
  paths = [],
  selected = null,
  onSelect,
  onRemove,
  removeLabel = 'Remove',
  onTap,
  onStroke,
  onStrokeStart,
  viewOnly = false,
  alliance,
  rotation,
  fit = false,
  usable,
  onFailed,
}: MapSheetProps &
  ImageState & {
    rotation: Rotation;
    fit?: boolean;
  }) {
  const path = imagePath ?? '';
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const quarter = rotation === 90 || rotation === 270;
  // The drawing's own width : height, the image's turned a quarter on a phone.
  const view = quarter ? 1 / ratio : ratio;

  // A computer's Delete key (and a Mac's ⌫) removes the selected mark (design "Removing").
  const removable = usable && selected !== null && onRemove !== undefined;
  useEffect(() => {
    if (!removable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      e.preventDefault();
      onRemove!(selected!);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [removable, onRemove, selected]);

  // The press being followed (UF.25): a tap until it moves DRAW_SLOP_PX, then a drag.
  const gesture = useRef<Gesture | null>(null);
  // A drag's own click (a mouse sends one on release) is not a tap; the next press clears it.
  const swallowClick = useRef(false);
  const [stroking, setStroking] = useState(false);
  const live = useRef<SVGSVGElement | null>(null);

  const image = (
    <FieldImage
      path={path}
      alt="The season's field"
      draggable={false}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          setRatio(img.naturalWidth / img.naturalHeight);
        }
      }}
      onError={onFailed}
      className="pointer-events-none absolute top-1/2 left-1/2 max-w-none select-none"
      style={
        quarter
          ? {
              width: '100cqh',
              height: '100cqw',
              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
            }
          : {
              width: '100%',
              height: '100%',
              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
            }
      }
    />
  );

  if (!usable) {
    // FieldImage's own alert, unchanged; the wrapper keeps it out of the turned box.
    return <div className="w-full self-center">{image}</div>;
  }

  function tap(e: MouseEvent<HTMLDivElement>) {
    if (!onTap) return;
    // Something selected: a tap on the map keeps it and adds nothing; it only lets go.
    if (selected !== null && onSelect) {
      onSelect(null);
      return;
    }
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    const x = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
    onTap(viewToImage({ x, y }, rotation));
  }

  const strokable = !viewOnly && onStroke !== undefined;

  function down(e: ReactPointerEvent<HTMLDivElement>) {
    // A second finger while one is down is ignored, and so are a mouse's other buttons.
    if (gesture.current || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    swallowClick.current = false;
    // The Remove pill and a spot are buttons of their own: a press on them is never a stroke.
    if ((e.target as Element).closest('button')) return;
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      box,
      view: [inBox(e, box)],
      state: 'press',
      anchor: null,
    };
  }

  function move(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    // Every sample since the last frame, not only the last, so a fast stroke keeps its bends.
    const samples = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const s of samples.length > 0 ? samples : [e]) g.view.push(inBox(s, g.box));
    if (g.state === 'press') {
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < DRAW_SLOP_PX) return;
      if (selected !== null && onSelect) {
        // Something selected: a drag, like a tap, only lets go of it.
        onSelect(null);
        g.state = 'refused';
      } else if (onStrokeStart && !onStrokeStart()) {
        g.state = 'refused';
      } else {
        g.state = 'drawing';
        // The path being drawn: the stroke goes on from its last point.
        const last = paths.find((p) => p.drawing)?.points.at(-1);
        g.anchor = last ? imageToView(last, rotation) : null;
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId);
        } catch {
          // A pointer the browser no longer tracks: the stroke still follows the events it gets.
        }
        setStroking(true);
      }
    }
    if (g.state === 'drawing') paint(live.current, g);
  }

  function up(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    gesture.current = null;
    if (g.state === 'press') return; // a tap: the click that follows adds the point
    swallowClick.current = true;
    if (g.state !== 'drawing') return;
    g.view.push(inBox(e, g.box));
    setStroking(false);
    onStroke?.(
      g.view.map((p) => viewToImage(p, rotation)),
      ratio,
    );
  }

  /** The browser took the pointer away (a system gesture): the stroke is dropped, nothing stored. */
  function cancel(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    gesture.current = null;
    if (g.state !== 'press') swallowClick.current = true;
    if (g.state === 'drawing') setStroking(false);
  }

  function swallow(e: MouseEvent<HTMLDivElement>) {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    e.stopPropagation();
  }

  /** A tap on a mark or a path: select it, or let go of it when it is the selected one. */
  function pick(e: MouseEvent, id: string) {
    e.stopPropagation();
    onSelect?.(selected === id ? null : id);
  }

  const size: CSSProperties = fit
    ? {
        width: `min(100cqw, calc(100cqh * ${view}))`,
        height: `min(100cqh, calc(100cqw / ${view}))`,
      }
    : { width: '100%', aspectRatio: String(view) };

  const red = alliance === 'red';
  const own = red ? 'bg-alliance-red' : 'bg-alliance-blue';
  const line = red ? 'stroke-alliance-red' : 'stroke-alliance-blue';
  const busy = selected !== null || paths.some((p) => p.drawing);

  // Where the ✕ Remove pill points: the selected mark, or the top of the selected path.
  const selectedMark = marks.find((m) => m.id === selected && m.name);
  const selectedPath = paths.find((p) => p.id === selected && !p.drawing);
  const anchor = selectedMark
    ? { at: imageToView(selectedMark.point, rotation), name: selectedMark.name!, gap: 18 }
    : selectedPath && selectedPath.points.length > 0
      ? {
          at: selectedPath.points
            .map((p) => imageToView(p, rotation))
            .reduce((top, p) => (p.y < top.y ? p : top)),
          name: selectedPath.name,
          gap: 12,
        }
      : null;

  return (
    <div
      data-testid="map-drawing"
      data-rotation={rotation}
      role="group"
      aria-label={viewOnly ? 'The field, view only' : 'The field: tap where it happened'}
      // View only (UF.24): a tap on the field changes nothing, and a drag draws nothing.
      onClick={viewOnly ? undefined : tap}
      onClickCapture={strokable ? swallow : undefined}
      onPointerDown={strokable ? down : undefined}
      onPointerMove={strokable ? move : undefined}
      onPointerUp={strokable ? up : undefined}
      onPointerCancel={strokable ? cancel : undefined}
      style={size}
      className={cn(
        'relative shrink-0 overflow-hidden rounded-control border border-control-border bg-line-2 [container-type:size]',
        // A drawing surface keeps the finger (UF.25): no scroll or zoom starts on it.
        strokable ? 'touch-none' : 'touch-manipulation',
        !viewOnly && 'cursor-crosshair',
      )}
    >
      {image}
      <span
        className={cn(
          'pointer-events-none absolute rounded-tag bg-surface px-1.5 text-[0.6875rem] font-[650]',
          red ? 'text-alliance-red' : 'text-alliance-blue',
          fit ? 'bottom-1.5 left-1/2 -translate-x-1/2' : 'bottom-1.5 left-1.5',
        )}
      >
        your alliance
      </span>
      {paths.length > 0 && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          {paths.map((route, i) => {
            const points = route.points
              .map((p) => imageToView(p, rotation))
              .map((p) => `${p.x * 100},${p.y * 100}`)
              .join(' ');
            const isSelected = route.id === selected;
            const faded = busy && !isSelected && !route.drawing;
            const selectable = onSelect && !route.drawing && route.points.length > 0;
            return (
              <g key={route.id} data-path={route.drawing ? 'drawing' : 'done'}>
                {isSelected && (
                  <polyline
                    points={points}
                    className="fill-none stroke-surface [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:7px] [vector-effect:non-scaling-stroke]"
                  />
                )}
                {viewOnly && (
                  // A white casing, so a route reads over the image's own red and blue (round 3).
                  <polyline
                    points={points}
                    className="fill-none stroke-surface opacity-85 [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:4.5px] [vector-effect:non-scaling-stroke]"
                  />
                )}
                <polyline
                  points={points}
                  data-faded={faded || undefined}
                  className={cn(
                    'fill-none [stroke-linecap:round] [stroke-linejoin:round] [vector-effect:non-scaling-stroke]',
                    line,
                    isSelected ? '[stroke-width:2.6px]' : '[stroke-width:1.8px]',
                    route.drawing && '[stroke-dasharray:6_4]',
                    faded && 'opacity-45',
                  )}
                />
                {selectable && (
                  // A wide, invisible stroke a finger can hit, over the thin drawn line.
                  <polyline
                    points={points}
                    role="button"
                    tabIndex={0}
                    aria-label={route.name}
                    aria-pressed={isSelected}
                    data-index={i}
                    onClick={(e) => pick(e, route.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect?.(selected === route.id ? null : route.id);
                      }
                    }}
                    className="[pointer-events:stroke] cursor-pointer fill-none stroke-transparent outline-none [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:24px] [vector-effect:non-scaling-stroke] focus-visible:stroke-accent-tint"
                  />
                )}
              </g>
            );
          })}
        </svg>
      )}
      {paths.map((route) => {
        const isSelected = route.id === selected;
        const faded = busy && !isSelected && !route.drawing;
        return route.points.map((p, j) => {
          const at = imageToView(p, rotation);
          return (
            <span
              key={`${route.id}-${j}`}
              aria-hidden="true"
              data-path-point=""
              style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
              className={cn(
                'pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-surface',
                own,
                route.drawing ? 'size-3.5' : 'size-2.5',
                faded && 'opacity-45',
              )}
            />
          );
        });
      })}
      {stroking && (
        // The stroke under the finger (UF.25), painted straight from the pointer events: a 2.6 px
        // line in the alliance colour on a white casing, so it reads over the image's own colours.
        <svg
          ref={(svg) => {
            live.current = svg;
            if (svg && gesture.current) paint(svg, gesture.current);
          }}
          data-testid="map-stroke"
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          <polyline className="fill-none stroke-surface opacity-85 [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:5.5px] [vector-effect:non-scaling-stroke]" />
          <polyline
            className={cn(
              'fill-none [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2.6px] [vector-effect:non-scaling-stroke]',
              line,
            )}
          />
        </svg>
      )}
      {marks.map((mark) => {
        const at = imageToView(mark.point, rotation);
        const dot = cn(
          'absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-surface font-num text-[0.6875rem] font-bold text-surface',
          mark.tone === 'own' ? cn('size-6', own) : 'size-[1.125rem] bg-faint',
        );
        const style = { left: `${at.x * 100}%`, top: `${at.y * 100}%` };
        if (onSelect && mark.name) {
          const isSelected = mark.id === selected;
          return (
            <button
              key={mark.id}
              type="button"
              data-mark={mark.tone}
              aria-label={mark.name}
              aria-pressed={isSelected}
              onClick={(e) => pick(e, mark.id)}
              style={style}
              className={cn(
                dot,
                // The drawn dot stays 24 px; its ::after is the 48 px a finger can hit (17.7).
                "min-h-0 min-w-0 cursor-pointer p-0 after:absolute after:-inset-3 after:rounded-full after:content-['']",
                isSelected && 'outline-[1.4px] outline-offset-[3px] outline-ink outline-solid',
              )}
            >
              <span aria-hidden="true">{mark.label}</span>
            </button>
          );
        }
        return (
          <span
            key={mark.id}
            data-mark={mark.tone}
            aria-hidden="true"
            style={style}
            className={cn(dot, 'pointer-events-none')}
          >
            {mark.label}
          </span>
        );
      })}
      {anchor && onRemove && selected !== null && (
        <RemovePill
          at={anchor.at}
          gap={anchor.gap}
          words={removeLabel}
          name={`Remove ${lowerFirst(anchor.name)}`}
          onRemove={() => onRemove(selected)}
        />
      )}
    </div>
  );
}

/** A press on the drawing being followed (UF.25). Points are in VIEW coordinates (0–1 of the box). */
type Gesture = {
  id: number;
  /** Where it went down, in CSS px: past DRAW_SLOP_PX from here it is a drag. */
  x: number;
  y: number;
  box: DOMRect;
  view: Point[];
  /** `press` (still a tap), `drawing`, or `refused` (a drag that draws nothing). */
  state: 'press' | 'drawing' | 'refused';
  /** The last point of the path being drawn, which the live stroke starts from. */
  anchor: Point | null;
};

/** A pointer position as a point of the box, held inside it. */
function inBox(e: { clientX: number; clientY: number }, box: DOMRect): Point {
  return {
    x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
    y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
  };
}

/** 0–1 as a percentage to a hundredth (a tenth of a pixel on the largest map). */
const pct = (v: number) => Math.round(v * 10_000) / 100;

/** Draws the stroke so far into the live layer's lines, without a React render per move. */
function paint(svg: SVGSVGElement | null, g: Gesture) {
  if (!svg) return;
  const points = (g.anchor ? [g.anchor, ...g.view] : g.view)
    .map((p) => `${pct(p.x)},${pct(p.y)}`)
    .join(' ');
  for (const line of svg.querySelectorAll('polyline')) line.setAttribute('points', points);
}

/**
 * THEME "Remove pill": a small `--ink` pill with a pointer, "✕ Remove" in white 650, just above
 * the selected mark (below it when the mark is near the top edge), kept inside the drawing; its
 * ::after grows the hit area to 48 px (17.7).
 */
function RemovePill({
  at,
  gap,
  words,
  name,
  onRemove,
}: {
  at: Point;
  gap: number;
  words: string;
  name: string;
  onRemove: () => void;
}) {
  const below = at.y < 0.16;
  // The pill stays inside the box, 4 px from its edges; the pointer still points at the mark.
  const pill = useRef<HTMLButtonElement>(null);
  const [width, setWidth] = useState(words.length * 7.5 + 40);
  useLayoutEffect(() => {
    if (pill.current && pill.current.offsetWidth > 0) setWidth(pill.current.offsetWidth);
  }, [words]);
  const half = width / 2 + 4;
  const mark = `${at.x * 100}cqw`;
  const left = `clamp(${half}px, ${mark}, calc(100cqw - ${half}px))`;
  return (
    <button
      ref={pill}
      type="button"
      aria-label={name}
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
      style={{
        left,
        top: `${at.y * 100}%`,
        transform: below ? `translate(-50%, ${gap}px)` : `translate(-50%, calc(-100% - ${gap}px))`,
      }}
      className="absolute z-10 inline-flex h-7 min-h-0 min-w-0 items-center gap-1 rounded-full bg-ink ps-2 pe-2.5 text-[0.8125rem] font-[650] whitespace-nowrap text-surface shadow-[var(--shadow-float)] after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-['']"
    >
      <X aria-hidden="true" className="size-3.5" />
      {words}
      <span
        aria-hidden="true"
        style={{ left: `calc(50% + ${mark} - ${left})` }}
        className={cn(
          'absolute size-2 -translate-x-1/2 rotate-45 bg-ink',
          below ? '-top-1' : '-bottom-1',
        )}
      />
    </button>
  );
}
