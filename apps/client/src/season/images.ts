import { SEASON_IMAGE_MANIFEST } from '@frc/shared';

export function isKnownSeasonImage(path: string): boolean {
  return (SEASON_IMAGE_MANIFEST as readonly string[]).includes(path);
}

export function imageUrlFor(path: string): string {
  return `/${path}`;
}
