import { LocalTime } from '@odb/lender-rooms/requests-ui/local-time.tsx';
import type { Enums } from '@odb/supabase';
import { Badge } from '@odb/ui/badge';

import type { RoomAccess } from './lender-room-order';
import { roomStatusWording } from './lender-wording';

export function RoomStatusBadge({
  status,
}: {
  status: Enums<'lender_room_status'>;
}) {
  return (
    <Badge variant={status === 'selected' ? 'default' : 'outline'}>
      {roomStatusWording[status]}
    </Badge>
  );
}

export function RoomAccessWording({ access }: { access: RoomAccess }) {
  switch (access.kind) {
    case 'closed':
      return <span className={'text-muted-foreground'}>Closed</span>;
    case 'expired':
      return (
        <span className={'text-muted-foreground'}>
          Expired on <LocalTime at={access.expiredAt} />
        </span>
      );
    case 'open':
      return (
        <span>
          Open
          <span className={'text-muted-foreground'}>
            {', '}
            {access.expiresAt ? (
              <>
                Expires <LocalTime at={access.expiresAt} />
              </>
            ) : (
              'No expiry'
            )}
          </span>
        </span>
      );
  }
}
