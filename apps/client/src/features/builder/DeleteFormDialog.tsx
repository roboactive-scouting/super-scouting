import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DeleteFormOutput } from '@frc/shared';
import { DestructiveConfirm } from '@/components/ui/destructive-confirm';
import { Button } from '@/components/ui/button';
import { ErrorLine, Note } from '@/components/ui/notice';
import type { Rpc } from '@/data/rpc';
import { formErrorLine } from './formErrors';
import type { FormRef } from './ImportExport';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Delete form (design `-delete.png`; SPEC-FINAL 5.1, v1.22): the locked destructive
 * confirmation. What goes with the form is read first (`deleteForm { dry_run: true }`): its
 * versions, its entries and its scoring; the confirm holds until they are read, and a failed
 * count offers Try again. Typing `delete match form` arms the filled-ink
 * "Delete Match form 2026"; Cancel has first focus. **Export it first** opens Export.
 */
export function DeleteFormDialog({
  form,
  year,
  rpc,
  online,
  onClose,
  onExportFirst,
  onDeleted,
}: {
  form: FormRef;
  year: number | null;
  rpc: Rpc;
  online: boolean;
  onClose: () => void;
  onExportFirst: () => void;
  onDeleted: () => void;
}) {
  const [counts, setCounts] = useState<DeleteFormOutput | 'loading' | { failed: string }>(
    'loading',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = form.kind === 'match' ? 'match' : 'super';
  const named = year !== null ? `${form.name} ${year}` : form.name;
  const published = form.versions.filter((v) => v.status === 'published').length;
  const drafts = form.versions.length - published;

  /** Bumped by Try again: the dry run is read again. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setCounts('loading');
    (rpc.call('deleteForm', { form_id: form.id, dry_run: true }) as Promise<DeleteFormOutput>).then(
      (out) => {
        if (live) setCounts(out);
      },
      (e: unknown) => {
        if (live) setCounts({ failed: formErrorLine(e) });
      },
    );
    return () => {
      live = false;
    };
    // Counted when the dialog opens, and again on Try again.
  }, [attempt]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await rpc.call('deleteForm', { form_id: form.id });
      onDeleted();
    } catch (e) {
      setError(formErrorLine(e));
      setBusy(false);
    }
  }

  const read = typeof counts === 'object' && 'versions' in counts ? counts : null;
  const failed = typeof counts === 'object' && 'failed' in counts ? counts.failed : null;
  // The confirm must name what goes, so it holds until the counts are read.
  const held = !online
    ? "You're offline: deleting waits for the connection."
    : counts === 'loading'
      ? 'Counting what goes with it…'
      : failed !== null
        ? 'Deleting waits until what goes with it is counted.'
        : null;

  const parts = [
    published > 0 ? `${published} published` : '',
    drafts > 0 ? `${plural(drafts, 'draft')}` : '',
  ].filter(Boolean);

  return (
    <DestructiveConfirm
      open
      title={`Delete the ${kind} form?`}
      objectName={named}
      confirmLabel={`Delete ${named}`}
      icon={Trash2}
      typeToConfirm={`delete ${kind} form`}
      busy={busy}
      held={held}
      error={error}
      onCancel={onClose}
      onConfirm={() => void confirm()}
      body={
        <div className="flex flex-col gap-3">
          <p>and everything scouted with it:</p>
          <ul className="list-disc space-y-1 ps-5 text-[0.9375rem] text-ink">
            <li>
              <b className="font-bold">{read?.versions ?? form.versions.length}</b>{' '}
              {(read?.versions ?? form.versions.length) === 1 ? 'version' : 'versions'}
              {parts.length > 0 && ` (${parts.join(', ')})`}
            </li>
            <li>
              {read ? (
                <>
                  <b className="font-bold">{read.entries}</b>{' '}
                  {read.entries === 1 ? 'entry' : 'entries'}
                  {year !== null ? ` from the ${year} events` : ''}
                </>
              ) : failed !== null ? (
                <span className="text-muted">its entries (not counted)</span>
              ) : (
                <span className="text-muted">its entries (counting…)</span>
              )}
            </li>
            <li>the scoring of its fields</li>
          </ul>
          {failed !== null && (
            <ErrorLine>
              <span>What goes with it could not be counted. {failed}</span>
              <Button
                size="sm"
                className="ms-3 align-middle"
                disabled={!online}
                onClick={() => setAttempt((n) => n + 1)}
              >
                Try again
              </Button>
            </ErrorLine>
          )}
          <Note icon="info" className="text-ink">
            <p>
              It is removed from every device at the next sync and{' '}
              <b className="font-bold">can't be undone</b>.{' '}
              <Button variant="link" size="inline" onClick={onExportFirst}>
                Export it first
              </Button>{' '}
              if you might need it.
            </p>
          </Note>
        </div>
      }
    />
  );
}
