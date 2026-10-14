import { isDocumensoConfigured } from '@odb/contracts/esign';
import { getAsk } from '@odb/lender-rooms/asks/queries.ts';
import { enterLenderRoom } from '@odb/lender-rooms/members/enter-room.ts';
import {
  loadCanAct,
  loadThread,
  requireRequestInRoom,
} from '@odb/lender-rooms/requests-ui/load-requests.ts';
import { RequestPage } from '@odb/lender-rooms/requests-ui/request-page.tsx';
import { getSupabaseServerClient } from '@odb/supabase/server';

export default async function LenderAskPage({
  params,
}: {
  params: Promise<{ roomId: string; askId: string }>;
}) {
  const { roomId, askId } = await params;
  const gate = await enterLenderRoom(roomId);

  if (gate.kind === 'closed') {
    return null;
  }

  const client = getSupabaseServerClient();
  await requireRequestInRoom(client, {
    kind: 'ask',
    roomId,
    requestId: askId,
  });

  const ask = await getAsk(client, askId);

  const [thread, canAct] = await Promise.all([
    loadThread(client, ask),
    loadCanAct(client, roomId),
  ]);

  return (
    <RequestPage
      room={gate.room}
      request={ask}
      thread={thread}
      canAct={canAct}
      esignAvailable={isDocumensoConfigured()}
    />
  );
}
