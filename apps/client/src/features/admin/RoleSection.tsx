import { Check } from 'lucide-react';
import { useState } from 'react';
import type { PublicUser, Role } from '@frc/shared';
import { session } from '@/auth/session';
import type { Rpc } from '@/data/rpc';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { DescribedChoice } from '@/components/ui/described-choice';
import { ErrorLine } from '@/components/ui/notice';
import { adminErrorLine } from './adminMessages';

/** The three roles, as the "Add a user" dialog words them. */
export const ROLE_OPTIONS: readonly { key: Role; label: string; description: string }[] = [
  { key: 'scouter', label: 'Scouter', description: 'Enters match data' },
  { key: 'lead', label: 'Scout lead', description: 'Fixes any entry, pick list' },
  { key: 'admin', label: 'Admin', description: 'Everything, incl. users' },
];

const ARTICLE: Record<Role, string> = { scouter: 'a scouter', lead: 'a lead', admin: 'an admin' };

/**
 * The server's answer is the truth; the signed-in admin's own gate follows it now rather
 * than at the next pull. The role is saved either way: if this device cannot store it, the
 * next pull brings it.
 */
async function followInSession(role: Role) {
  try {
    await session.updateUser({ role });
  } catch {
    // Saved on the server; the next pull refreshes this device.
  }
}

/**
 * The role as three described choices. There is no Save button: a pick saves at once, the
 * other choices wait for the answer, and a refusal restores the role the account had.
 */
export function RoleSection({
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
  const [saving, setSaving] = useState<Role | null>(null);
  const [line, setLine] = useState<{ ok: boolean; text: string } | null>(null);

  async function change(role: Role) {
    setSaving(role);
    setLine(null);
    try {
      const updated = (await rpc.call('setUserRole', { user_id: user.id, role })) as PublicUser;
      onChanged(updated);
      setLine({
        ok: true,
        text: `Saved. ${user.full_name} is now ${ARTICLE[updated.role]}. It applies from their next request.`,
      });
      if (self) await followInSession(updated.role);
    } catch (e) {
      setLine({ ok: false, text: adminErrorLine(e) });
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card as="section" aria-labelledby="role-title" className="px-[18px] py-4">
      <CardTitle id="role-title">Role</CardTitle>
      <CardDescription className="mb-3">
        {self
          ? 'This is your own account. Another role takes away your access to this page.'
          : 'Saves as soon as you pick. It applies from their next request.'}
      </CardDescription>
      <DescribedChoice
        label="Role"
        options={ROLE_OPTIONS}
        value={user.role}
        saving={saving}
        onChange={(role) => void change(role)}
      />
      {line?.ok && (
        <p
          role="status"
          className="mt-2.5 flex items-center gap-1.5 text-[13px] font-[650] text-accent-ink"
        >
          <Check aria-hidden="true" className="size-[15px] shrink-0" strokeWidth={2.6} />
          <span dir="auto">{line.text}</span>
        </p>
      )}
      {line && !line.ok && <ErrorLine className="mt-2.5">{line.text}</ErrorLine>}
    </Card>
  );
}
