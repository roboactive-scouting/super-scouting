import { X } from 'lucide-react';
import { useId, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Point } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { AllianceTag, StationTag } from '@/components/ui/tag';
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

/** One mark on the map, in IMAGE coordinates (0–1, the season image as stored, unturned). */
export type MapMark = {
  id: string;
  point: Point;
  /** `own`: in the scout's alliance colour (what is being placed); `old`: grey, earlier marks. */
  tone: 'own' | 'old';
  /** A number drawn in the dot ("1", "2"), for numbered spots. */
  label?: string;
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
  /** A tap on the drawing, already turned back into image coordinates. */
  onTap: (image: Point) => void;
  /** ✕ or Escape. */
  onClose: () => void;
  /** The one-line hint under the map. */
  hint: ReactNode;
  /** The tools at the start of the bar (Undo, Skip · no place, …). */
  tools?: ReactNode;
  /** The words at the bar's end, before Done on a computer ("3 spots"). */
  status?: ReactNode;
  /** The primary action: full width on a phone, at the right on a computer. Hidden while the image is missing. */
  done: { label: string; onClick: () => void; disabled?: boolean };
  /** Phone (full screen, upright) or computer (dialog, flat); by default the viewport decides. */
  layout?: MapLayout;
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
        <Tag alliance={props.alliance} station={props.station} />
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pt-2.5 pb-1.5 [container-type:size]">
        <FieldDrawing {...props} {...image} rotation={viewRotation(props.alliance, 'phone')} fit />
      </div>
      <p className="flex-none px-4 pb-2 text-center text-[0.78125rem] text-muted">{props.hint}</p>
      <div className="flex flex-none flex-col gap-2.5 border-t border-line bg-surface px-3.5 pt-2.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
        <div className="flex min-h-12 items-center gap-2">
          {props.tools}
          {props.status && (
            <span className="ms-auto whitespace-nowrap text-[0.8125rem] text-muted">
              {props.status}
            </span>
          )}
        </div>
        {image.usable && (
          <Button
            variant="primary"
            size="block"
            onClick={props.done.onClick}
            disabled={props.done.disabled}
          >
            {props.done.label}
          </Button>
        )}
      </div>
    </div>,
    document.body,
  );
}

function DesktopMap(props: MapSheetProps) {
  const sub = useId();
  const image = useImageState(props.imagePath);
  return (
    <Dialog open title={props.title} onClose={props.onClose} width={820} describedBy={sub}>
      <div className="-mt-2 flex items-center gap-3">
        <p id={sub} className="min-w-0 flex-1 text-[0.8125rem] text-muted" dir="auto">
          {props.subtitle}
        </p>
        <Tag alliance={props.alliance} station={props.station} />
      </div>
      <FieldDrawing {...props} {...image} rotation={viewRotation(props.alliance, 'desktop')} />
      <p className="text-[0.8125rem] text-muted">{props.hint}</p>
      <div className="flex min-h-12 items-center gap-2 pt-1">
        {props.tools}
        <span className="ms-auto me-1.5 whitespace-nowrap text-[0.8125rem] text-muted">
          {props.status}
        </span>
        {image.usable && (
          <Button variant="primary" onClick={props.done.onClick} disabled={props.done.disabled}>
            {props.done.label}
          </Button>
        )}
      </div>
    </Dialog>
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

/**
 * The season image turned by `rotation`, the marks over it, and the tap that maps back to the
 * image. `fit` sizes it into a size container (the phone's map area); otherwise it fills the
 * width (the dialog). While the image is missing it is FieldImage's alert, nothing more.
 */
function FieldDrawing({
  imagePath,
  marks,
  onTap,
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
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    const x = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
    onTap(viewToImage({ x, y }, rotation));
  }

  const size: CSSProperties = fit
    ? {
        width: `min(100cqw, calc(100cqh * ${view}))`,
        height: `min(100cqh, calc(100cqw / ${view}))`,
      }
    : { width: '100%', aspectRatio: String(view) };

  const own = alliance === 'red' ? 'bg-alliance-red' : 'bg-alliance-blue';
  return (
    <div
      data-testid="map-drawing"
      data-rotation={rotation}
      role="group"
      aria-label="The field: tap where it happened"
      onClick={tap}
      style={size}
      className="relative shrink-0 cursor-crosshair touch-manipulation overflow-hidden rounded-control border border-control-border bg-line-2 [container-type:size]"
    >
      {image}
      <span
        className={cn(
          'pointer-events-none absolute rounded-tag bg-surface px-1.5 text-[0.6875rem] font-[650]',
          alliance === 'red' ? 'text-alliance-red' : 'text-alliance-blue',
          fit ? 'bottom-1.5 left-1/2 -translate-x-1/2' : 'bottom-1.5 left-1.5',
        )}
      >
        your alliance
      </span>
      {marks.map((mark) => {
        const at = imageToView(mark.point, rotation);
        return (
          <span
            key={mark.id}
            data-mark={mark.tone}
            aria-hidden="true"
            style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
            className={cn(
              'pointer-events-none absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-surface font-num text-[0.6875rem] font-bold text-surface',
              mark.tone === 'own' ? cn('size-6', own) : 'size-[1.125rem] bg-faint',
            )}
          >
            {mark.label}
          </span>
        );
      })}
    </div>
  );
}
