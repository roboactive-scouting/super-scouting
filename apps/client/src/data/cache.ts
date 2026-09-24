import type { FormFieldDefinition, PullEntityKey } from '@frc/shared';
import { db } from './db';

export async function cachedRows<T = Record<string, unknown>>(entity: PullEntityKey): Promise<T[]> {
  return (await db.rows.where('entity').equals(entity).toArray()) as unknown as T[];
}

export async function cachedFormFields(formVersionId: string): Promise<FormFieldDefinition[]> {
  const all = await cachedRows<FormFieldDefinition & { form_version_id: string }>('form_fields');
  return all
    .filter((f) => f.form_version_id === formVersionId && !f.deprecated)
    .sort((a, b) => a.display_order - b.display_order);
}

export async function cachedEntry(rowId: string): Promise<Record<string, unknown> | undefined> {
  return db.rows.get(['scouting_entries', rowId]);
}
