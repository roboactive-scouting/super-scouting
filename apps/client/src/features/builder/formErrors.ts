import { RpcError } from '@/data/rpc';
import { typeName } from './fieldTypes';

/**
 * Every form refusal, as one plain sentence (SPEC-FINAL 17.8: never a code). The server says
 * why in `error.details.reason` (DEVIATIONS 1.27–1.28 and the phase 1 D review); this is the
 * one place that turns a reason into words, for the forms page, the builder and tasks 1.30–1.32.
 */

/** What the server put in `details`, narrowed. Anything it did not send is undefined. */
export type FormRefusal = {
  code: string;
  reason: string | undefined;
  details: Record<string, unknown>;
};

export function refusalOf(e: unknown): FormRefusal | null {
  if (!(e instanceof RpcError)) return null;
  const details =
    typeof e.details === 'object' && e.details !== null
      ? (e.details as Record<string, unknown>)
      : {};
  return {
    code: e.code,
    reason: typeof details.reason === 'string' ? details.reason : undefined,
    details,
  };
}

/** The refusal's reason, for code that acts on it (stale-version → offer Reload). */
export function reasonOf(e: unknown): string | undefined {
  return refusalOf(e)?.reason;
}

/** The refusals whose sentence says "reload": the builder offers a Reload button with them. */
const RELOAD_REASONS: ReadonlySet<string> = new Set([
  'stale-version',
  'unknown-field-id',
  'key-change',
  'version-race',
  'already-published',
  'duplicate-field-id',
]);

/** True when the refusal's sentence tells the admin to reload the form. */
export function offersReload(e: unknown): boolean {
  const reason = reasonOf(e);
  return reason !== undefined && RELOAD_REASONS.has(reason);
}

/** No answer from this app's server: no connection, a deadline, a portal or a proxy page. */
export function formUnreachable(e: unknown): boolean {
  return e instanceof RpcError && !e.answered;
}

export const FORMS_UNREACHABLE =
  'Could not reach the server. Form changes need a connection; nothing on this screen was lost.';

export const FORMS_FORBIDDEN =
  'Only an admin can edit forms, and the server says this account is not one now.';

/** Optional context: a field's label by key, so a positioned problem names the field. */
export type FormErrorContext = { labelOf?: (key: string) => string | undefined };

const quote = (text: string) => `“${text}”`;

/** The server's own sentence, capitalised and closed. */
function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const capital = trimmed[0]!.toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;
const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

type Issue = { field_key: string | null; path: string; message: string };

function issuesOf(details: Record<string, unknown>): Issue[] {
  const list = details.issues;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (i): i is Issue =>
      typeof i === 'object' && i !== null && typeof (i as Issue).message === 'string',
  );
}

/** "“Pieces dropped”: description is required…" — the first problem, then how many more. */
function issuesLine(details: Record<string, unknown>, ctx: FormErrorContext, lead: string): string {
  const issues = issuesOf(details);
  const first = issues[0];
  if (!first) return lead;
  const who =
    first.field_key === null
      ? 'The form'
      : quote(ctx.labelOf?.(first.field_key) ?? first.field_key);
  const more = issues.length - 1;
  const tail = more > 0 ? ` ${more} more ${more === 1 ? 'problem' : 'problems'} after it.` : '';
  return `${who}: ${sentence(first.message)}${tail}`;
}

/** One sentence for any error a form call can throw. */
export function formErrorLine(e: unknown, ctx: FormErrorContext = {}): string {
  if (formUnreachable(e)) return FORMS_UNREACHABLE;
  const refusal = refusalOf(e);
  if (!refusal) {
    return e instanceof Error && e.message ? sentence(e.message) : 'That did not work. Try again.';
  }
  const { code, reason, details } = refusal;
  const key = str(details.key);
  switch (reason) {
    case 'key-change':
      return "A saved field's key never changes. Reload the form to get the saved key back.";
    case 'key-retired': {
      const was = str(details.last_type);
      const named = key ? `The key ${quote(key)}` : 'This key';
      return was
        ? `${named} belonged to a removed ${typeName(was).toLowerCase()} field of this form. Bring it back as a ${typeName(was).toLowerCase()}, or give this field another label.`
        : `${named} belonged to a removed field of this form. Give this field another label.`;
    }
    case 'unknown-field-id':
      return 'A field on this screen is no longer in this version; someone else may have changed it. Reload the form and make the change again.';
    case 'duplicate-key':
      return `Two fields have the key ${quote(key ?? '')}. Change the label of one of them.`;
    case 'duplicate-field-id':
      return 'Two fields on this screen name the same saved field. Reload the form and make the change again.';
    case 'invalid-definition':
      return issuesLine(details, ctx, 'The form has a problem the server would not save.');
    case 'invalid-scoring':
      return issuesLine(details, ctx, 'The scoring has a problem the server would not save.');
    case 'draft-exists': {
      const n = num(details.version_no);
      return `Draft ${n === undefined ? '' : `v${n} `}already exists. Make this change in the draft: open it from the version list.`;
    }
    case 'stale-version':
      return 'Someone else saved this version after you opened it. Reload it to see their changes; your changes here are not saved.';
    case 'version-race':
      return 'Another admin started a new version at the same moment. Reload the form and try again.';
    case 'form-exists': {
      const kind = str(details.kind);
      return `This season already has ${kind ? `a ${kind} form` : 'that form'}. Reload the page to open it.`;
    }
    case 'published':
      return 'A published version cannot be deleted on its own; restore another version instead.';
    case 'active-version':
      return 'The active version cannot be deleted.';
    case 'has-entries': {
      const n = num(details.entries);
      return n === undefined
        ? 'Entries were scouted with this version, so it cannot be deleted.'
        : `${n} ${n === 1 ? 'entry was' : 'entries were'} scouted with this version, so it cannot be deleted.`;
    }
    case 'already-published':
      return 'This version is already published. Reload the form to see it.';
    case 'not-published':
      return 'A draft cannot be restored. Publish it instead.';
    case 'not-exportable':
      return 'Only the draft or the active version can be exported.';
    case 'kind-mismatch':
      return "That definition is for another kind of form, or another season's form.";
  }
  if (code === 'forbidden' || (e instanceof RpcError && e.status === 403)) return FORMS_FORBIDDEN;
  if (code === 'not-found')
    return 'This form or version no longer exists; it may have been deleted. Go back to Forms.';
  if (e instanceof RpcError && e.status >= 500) {
    return 'The server could not do that just now. Nothing was changed; try again.';
  }
  return e instanceof Error && e.message ? sentence(e.message) : 'That did not work. Try again.';
}
