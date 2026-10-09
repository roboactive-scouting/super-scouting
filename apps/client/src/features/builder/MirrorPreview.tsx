import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { imageUrlFor, isKnownSeasonImage } from '@/season/images';

/** SPEC-FINAL 5.3: how a blue scout's tap is turned onto red's side of the game image. */
export type MirrorAxis = 'none' | 'horizontal' | 'vertical' | 'both';

type Pt = readonly [number, number];

/** Where a blue tap at (x, y) is saved (SPEC-FINAL 5.6): red keeps raw coordinates. */
function mirrorPoint([x, y]: Pt, axis: MirrorAxis): Pt {
  const flipX = axis === 'horizontal' || axis === 'both';
  const flipY = axis === 'vertical' || axis === 'both';
  return [flipX ? 1 - x : x, flipY ? 1 - y : y];
}

/** The sample marks a blue scout makes: two spots, or one three-point path. */
const SPOTS: Pt[] = [
  [0.8, 0.3],
  [0.74, 0.7],
];
const PATH: Pt[] = [
  [0.93, 0.12],
  [0.8, 0.3],
  [0.71, 0.5],
];

const AXIS_WORDS: Record<Exclude<MirrorAxis, 'none'>, string> = {
  horizontal: 'left ↔ right',
  vertical: 'top ↔ bottom',
  both: 'left ↔ right and top ↔ bottom',
};

/**
 * One field drawing: the season's game image when this build has it, else a neutral outline
 * with the red end on the left and the blue end on the right. The marks sit over it in
 * percentages, so a dot stays round whatever the image's shape.
 */
function FieldMap({
  imagePath,
  points,
  path,
  tone,
}: {
  imagePath: string | null;
  points: readonly Pt[];
  path: boolean;
  tone: 'blue' | 'saved';
}) {
  const [failed, setFailed] = useState(false);
  const image = imagePath !== null && isKnownSeasonImage(imagePath) && !failed;
  const dot = tone === 'blue' ? 'bg-alliance-blue' : 'bg-ink';
  return (
    <div className="relative overflow-hidden rounded-control border border-line bg-line-2">
      {image ? (
        <img
          src={imageUrlFor(imagePath)}
          alt=""
          onError={() => setFailed(true)}
          className="block h-auto w-full"
        />
      ) : (
        <svg viewBox="0 0 200 100" className="block aspect-[2/1] w-full" aria-hidden="true">
          <rect x="0" y="0" width="34" height="100" className="fill-alliance-red-tint" />
          <rect x="166" y="0" width="34" height="100" className="fill-alliance-blue-tint" />
          <line x1="100" y1="3" x2="100" y2="97" className="stroke-faint" strokeDasharray="2 2" />
          <text x="5" y="10" className="fill-alliance-red text-[0.375rem] font-bold">
            RED
          </text>
          <text x="173" y="95" className="fill-alliance-blue text-[0.375rem] font-bold">
            BLUE
          </text>
        </svg>
      )}
      {path && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="absolute inset-0 size-full"
        >
          <polyline
            points={points.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')}
            vectorEffect="non-scaling-stroke"
            className={tone === 'blue' ? 'stroke-alliance-blue' : 'stroke-ink'}
            fill="none"
            strokeWidth={3}
            strokeDasharray={tone === 'saved' ? '4 3' : undefined}
          />
        </svg>
      )}
      {points.map(([x, y], i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
          className={`absolute grid size-3 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-surface ${dot}`}
        />
      ))}
    </div>
  );
}

/**
 * The mirroring preview (SPEC-FINAL 5.6; design 12-form-builder, "Field position"): the marks a
 * blue scout makes, then where they are saved, on the season's game image, so the admin can
 * check the axis against the image. One picture to assistive tech, named "Mirroring preview";
 * the line under it says the same in words.
 */
export function MirrorPreview({
  axis,
  imagePath,
  path = false,
}: {
  axis: MirrorAxis;
  imagePath: string | null;
  /** A cycle path: the marks are one route rather than spots. */
  path?: boolean;
}) {
  const blue = path ? PATH : SPOTS;
  const saved = blue.map((p) => mirrorPoint(p, axis));
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="img"
        aria-label="Mirroring preview"
        className="grid grid-cols-[1fr_22px_1fr] items-center gap-1.5"
      >
        <figure className="flex flex-col gap-1">
          <FieldMap imagePath={imagePath} points={blue} path={path} tone="blue" />
          <figcaption className="text-[0.71875rem] font-[650] text-muted">
            A blue scout taps
          </figcaption>
        </figure>
        <ArrowRight aria-hidden="true" className="size-[18px] text-muted" />
        <figure className="flex flex-col gap-1">
          <FieldMap imagePath={imagePath} points={saved} path={path} tone="saved" />
          <figcaption className="text-[0.71875rem] font-[650] text-muted">
            Saved as (red's side)
          </figcaption>
        </figure>
      </div>
      <p className="text-xs leading-snug text-muted">
        {axis === 'none' ? (
          <>
            Red and blue are both saved as tapped: <b className="text-ink-2">nothing is mirrored</b>
            .
          </>
        ) : (
          <>
            Red is saved as tapped; <b className="text-ink-2">blue is mirrored</b>{' '}
            {AXIS_WORDS[axis]}, so both mean the same spot on the game image.
          </>
        )}
      </p>
    </div>
  );
}
