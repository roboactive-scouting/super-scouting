import { notifyChanged } from './changes';
import { getMeta, setMeta } from './db';

export type Station = 'R1' | 'R2' | 'R3' | 'B1' | 'B2' | 'B3';
const KEY = 'scout.station';
export const STATIONS: readonly Station[] = ['R1', 'R2', 'R3', 'B1', 'B2', 'B3'];

export async function getStation(): Promise<Station | null> {
  const v = await getMeta<string | null>(KEY, null);
  return STATIONS.includes(v as Station) ? (v as Station) : null;
}
export async function setStation(s: Station): Promise<void> {
  await setMeta(KEY, s);
  notifyChanged('meta');
}
