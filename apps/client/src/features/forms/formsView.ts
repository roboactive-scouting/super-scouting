import { formatDate, type FormKind, type FormListItem, type VersionSummary } from '@frc/shared';

/**
 * What the forms list (design 13-forms) says about a form, worked out from `listForms`. Pure,
 * so the card's words are tested without a page.
 */

export const KIND_NAME: Record<FormKind, string> = { match: 'Match form', super: 'Super form' };

/** The card's one-line meaning under the name. */
export const KIND_MEANING: Record<FormKind, string> = {
  match: 'One entry per robot per match',
  super: 'One entry per alliance per match, by a super scout',
};

/** "08/10": the design's day and month (formatDate is DD/MM/YYYY). */
export function dayMonth(iso: string): string {
  return formatDate(iso).slice(0, 5);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const draftOf = (form: FormListItem) => form.versions.find((v) => v.status === 'draft');
export const activeOf = (form: FormListItem) =>
  form.versions.find((v) => v.id === form.active_version_id);

/** The status tag: the active version, else the draft. */
export function statusOf(form: FormListItem): {
  tone: 'published' | 'draft';
  text: string;
  locked: boolean;
} {
  const active = activeOf(form);
  if (active) {
    return {
      tone: 'published',
      text: `v${active.version_no} · Published${active.is_locked ? ' · Locked' : ''}`,
      locked: active.is_locked,
    };
  }
  const draft = draftOf(form);
  return {
    tone: 'draft',
    text: draft ? `Draft v${draft.version_no} · not published` : 'Not published',
    locked: false,
  };
}

/** The stat row: Fields · Entries · Versions · Last edited (date · who). */
export function statsOf(form: FormListItem): {
  fields: number;
  entries: number;
  versions: number;
  lastEdited: string | null;
} {
  const shown = activeOf(form) ?? form.versions[0];
  const latest = [...form.versions].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const who = latest?.updated_by?.full_name;
  return {
    fields: shown?.field_count ?? 0,
    // The design's row describes the version scouts use: v3's 214, not every version's sum.
    entries: shown?.entry_count ?? 0,
    // The design counts published versions: a form with draft v4 over v1–v3 shows 3.
    versions: form.versions.filter((v) => v.status === 'published').length,
    lastEdited: latest ? `${dayMonth(latest.updated_at)}${who ? ` · ${who}` : ''}` : null,
  };
}

export type TimelineRow = {
  version: VersionSummary;
  kind: 'draft' | 'active' | 'older';
  title: string;
  sub: string;
};

/** One timeline row per version, newest first, as the server sends them. */
export function timelineOf(form: FormListItem): TimelineRow[] {
  return form.versions.map((version) => {
    const fields = plural(version.field_count, 'field');
    if (version.status === 'draft') {
      return {
        version,
        kind: 'draft',
        title: `Draft v${version.version_no}`,
        sub: `not published yet · ${fields}`,
      };
    }
    const published = version.published_at ? `Published ${dayMonth(version.published_at)}` : '';
    const parts = [published, version.is_locked && version.is_active ? 'locked' : '', fields];
    return {
      version,
      kind: version.is_active ? 'active' : 'older',
      title: version.is_active ? `v${version.version_no} · active` : `v${version.version_no}`,
      sub: parts.filter(Boolean).join(' · '),
    };
  });
}

/** SPEC-FINAL 5.9: a season with no published match form warns, because nobody can scout. */
export function needsMatchForm(forms: readonly FormListItem[]): boolean {
  const match = forms.find((f) => f.kind === 'match');
  return !match || match.active_version_id === null;
}
