import { useState } from 'react';
import type { PublicUser } from '@frc/shared';
import { DestructiveConfirm } from '@/components/ui/destructive-confirm';
import type { Rpc } from '@/data/rpc';
import { adminErrorLine } from './adminMessages';
import { DISABLE_BODY, SELF_DISABLE_LINE } from './UserDetailPage';

/** The row's "Disable": the same confirmation as the account page (page 9). */
export function DisableUserConfirm({
  user,
  self,
  rpc,
  onClose,
  onChanged,
}: {
  user: PublicUser;
  self: boolean;
  rpc: Rpc;
  onClose: () => void;
  onChanged: (user: PublicUser) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const updated = (await rpc.call('disableUser', { user_id: user.id })) as PublicUser;
      onChanged(updated);
      onClose();
    } catch (e) {
      setError(adminErrorLine(e));
      setBusy(false);
    }
  }

  return (
    <DestructiveConfirm
      open
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
      onCancel={onClose}
    />
  );
}
