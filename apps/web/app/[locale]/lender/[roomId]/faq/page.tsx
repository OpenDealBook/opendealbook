import { FaqPage } from '@odb/lender-rooms/faq-ui/faq-page.tsx';
import { enterLenderRoom } from '@odb/lender-rooms/members/enter-room.ts';

export default async function LenderFaqPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const gate = await enterLenderRoom(roomId);

  if (gate.kind === 'closed') {
    return null;
  }

  return <FaqPage room={gate.room} />;
}
