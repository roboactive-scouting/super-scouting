import type { Ref } from 'react';
import type { PublicUser } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { Handover } from '@/components/ui/handover';

export type Created = { user: PublicUser; password: string; mustChange: boolean };

/**
 * The one-time handover after "Add a user" (design 08-users): "Created {name} · {username}",
 * "Their password", the secret, and today's line. The password is a prop of this render only.
 * The dialog around it stays `AddUserDialog`'s, so the form and the handover share one dialog.
 */
export function CreatedHandover({ created }: { created: Created }) {
  return (
    <Handover
      title={
        <span dir="auto">{`Created ${created.user.full_name} · ${created.user.username}`}</span>
      }
      label="Their password"
      secret={created.password}
      note={`Hand it over now. It is shown once and kept nowhere${created.mustChange ? '; they choose their own at next sign-in.' : '.'}`}
    />
  );
}

/** The handover dialog's footer: Add another · Done (focus lands on Done). */
export function CreatedActions({
  onAddAnother,
  onClose,
  done,
}: {
  onAddAnother: () => void;
  onClose: () => void;
  done: Ref<HTMLButtonElement>;
}) {
  return (
    <>
      <Button onClick={onAddAnother}>Add another</Button>
      <Button ref={done} variant="primary" onClick={onClose}>
        Done
      </Button>
    </>
  );
}
