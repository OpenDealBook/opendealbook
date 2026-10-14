import { RoomPage } from '@odb/lender-rooms/browser/room-page.tsx';
import { enterLenderRoom } from '@odb/lender-rooms/members/enter-room.ts';

export default async function LenderRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const gate = await enterLenderRoom(roomId);

  if (gate.kind === 'closed') {
    return null;
  }

  return <RoomPage room={gate.room} />;
}
