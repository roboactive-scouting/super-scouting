import { Ban } from 'lucide-react';
import { useState } from 'react';
import type { PublicUser } from '@frc/shared';
import type { Rpc } from '@/data/rpc';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { DestructiveConfirm } from '@/components/ui/destructive-confirm';
import { adminErrorLine } from './adminMessages';

/** The confirm body, word for word (task 1.17). */
export const DISABLE_BODY =
  'Disabling keeps everything they scouted, with their name on it. It is not a delete.';

export const SELF_DISABLE_LINE =
  'This is your own account. You will be signed out on your next request.';

/** Disable behind the single destructive pattern: a filled-ink button, then the confirm. */
export function DisableSection({
  user,
  self,
  rpc,
  onChanged,
}: {
  user: PublicUser;
  self: boolean;
  rpc: Rpc;
  onChanged: (u: PublicUser) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const updated = (await rpc.call('disableUser', { user_id: user.id })) as PublicUser;
      setOpen(false);
      onChanged(updated);
    } catch (e) {
      setError(adminErrorLine(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card as="section" tone="danger" className="rounded-s-none px-[18px] py-4">
      <CardTitle>Disable account</CardTitle>
      <CardDescription>
        They can no longer sign in or sync. A device that is offline keeps them signed in until its
        next sync.
      </CardDescription>
      <Button
        variant="destructive"
        className="mt-3.5"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Ban aria-hidden="true" />
        Disable account
      </Button>
      <DestructiveConfirm
        open={open}
        title="Disable this account?"
        objectName={user.full_name}
        body={
          <>
            <p>{DISABLE_BODY}</p>
            {self && <p className="mt-2 font-semibold text-ink">{SELF_DISABLE_LINE}</p>}
          </>
        }
        confirmLabel={`Disable ${user.full_name}`}
        busy={busy}
        error={error}
        onConfirm={() => void confirm()}
        onCancel={() => setOpen(false)}
      />
    </Card>
  );
}
