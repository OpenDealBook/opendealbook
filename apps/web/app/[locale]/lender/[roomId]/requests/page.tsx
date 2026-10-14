import { isDocumensoConfigured } from '@odb/contracts/esign';
import { enterLenderRoom } from '@odb/lender-rooms/members/enter-room.ts';
import {
  loadCanAct,
  loadRequests,
} from '@odb/lender-rooms/requests-ui/load-requests.ts';
import { RequestsPage } from '@odb/lender-rooms/requests-ui/requests-page.tsx';
import { getSupabaseServerClient } from '@odb/supabase/server';

export default async function LenderRequestsPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const gate = await enterLenderRoom(roomId);

  if (gate.kind === 'closed') {
    return null;
  }

  const client = getSupabaseServerClient();
  const [requests, canAct] = await Promise.all([
    loadRequests(client, roomId),
    loadCanAct(client, roomId),
  ]);

  return (
    <RequestsPage
      room={gate.room}
      {...requests}
      canAct={canAct}
      esignAvailable={isDocumensoConfigured()}
    />
  );
}
