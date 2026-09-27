import { AppError } from '@frc/shared';
import type { z } from 'zod';

/**
 * The opaque keyset cursors of the season and event lists (task 1.18), the same wire
 * format as listUsers': base64url of UTF-8 JSON, never btoa, which throws on a Hebrew
 * character.
 */
export function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/**
 * The cursor comes from the client, so its content is validated against `schema` before
 * anything reads it: the Supabase store interpolates it into a PostgREST filter.
 */
export function decodeCursor<S extends z.ZodTypeAny>(schema: S, raw: string): z.output<S> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    decoded = undefined;
  }
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) {
    throw new AppError('invalid', 'cursor is not readable; list again without one');
  }
  return parsed.data as z.output<S>;
}
