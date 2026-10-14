import { isDocumensoConfigured } from '@odb/contracts/esign';
import { getForm } from '@odb/lender-rooms/forms/queries.ts';
import { enterLenderRoom } from '@odb/lender-rooms/members/enter-room.ts';
import {
  loadCanAct,
  loadLatestSignature,
  loadThread,
  requireRequestInRoom,
} from '@odb/lender-rooms/requests-ui/load-requests.ts';
import { RequestPage } from '@odb/lender-rooms/requests-ui/request-page.tsx';
import { getSupabaseServerClient } from '@odb/supabase/server';

export default async function LenderFormPage({
  params,
}: {
  params: Promise<{ roomId: string; formId: string }>;
}) {
  const { roomId, formId } = await params;
  const gate = await enterLenderRoom(roomId);

  if (gate.kind === 'closed') {
    return null;
  }

  const client = getSupabaseServerClient();
  await requireRequestInRoom(client, {
    kind: 'form',
    roomId,
    requestId: formId,
  });

  const form = await getForm(client, formId);
  const [thread, signature, canAct] = await Promise.all([
    loadThread(client, form),
    loadLatestSignature(client, formId),
    loadCanAct(client, roomId),
  ]);

  return (
    <RequestPage
      room={gate.room}
      request={form}
      thread={thread}
      signatureStatus={signature?.status}
      canAct={canAct}
      esignAvailable={isDocumensoConfigured()}
    />
  );
}
