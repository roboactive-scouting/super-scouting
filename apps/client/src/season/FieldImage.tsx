import { useState, type ImgHTMLAttributes } from 'react';
import { imageUrlFor, isKnownSeasonImage } from './images';

/**
 * SPEC-FINAL 16.7: a missing image must fail loudly. The position picker and cycle-path
 * fields show an explicit error, never a blank canvas that quietly records meaningless
 * coordinates — every stored {x, y} is normalized against this exact image.
 *
 * "Missing" is also a listed image that fails to load (branch review, finding 7): a
 * deploy that lost the file, or a device first opened offline that never precached it.
 * The browser's error event puts the component in the same alert state, naming the path.
 */
export function FieldImage({
  path,
  alt,
  onError,
  ...rest
}: { path: string; alt: string } & ImgHTMLAttributes<HTMLImageElement>) {
  // The path whose load failed, so a different path gets its own attempt.
  const [failedPath, setFailedPath] = useState<string | null>(null);
  if (!isKnownSeasonImage(path) || failedPath === path) {
    return (
      <div role="alert" className="rounded-lg border border-[var(--danger)] p-4 text-sm">
        <p className="font-semibold">This season's game image is missing.</p>
        <p className="text-[var(--text-muted)]">
          The season points at <code>{path}</code>, which is not in this build. Commit it and
          redeploy the client. Field-position and cycle-path fields cannot be recorded until then.
        </p>
      </div>
    );
  }
  return (
    <img
      src={imageUrlFor(path)}
      alt={alt}
      {...rest}
      onError={(e) => {
        setFailedPath(path);
        onError?.(e);
      }}
    />
  );
}
