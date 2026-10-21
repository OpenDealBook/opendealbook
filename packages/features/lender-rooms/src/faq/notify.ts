import { LENDER_ROOM_DOCUMENTS_WORKFLOW_ID } from '@odb/notifications/relay';
import {
  createNovuClient,
  triggerNotification,
} from '@odb/notifications/server';
import { getLogger } from '@odb/shared/logger';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

function logFailure(error: unknown, context: Record<string, string>) {
  getLogger().error(
    { err: error, ...context },
    'Lender FAQ notification failed',
  );
}

export async function notifyFaqEntryPublished(entryId: string) {
  if (!process.env.NOVU_API_KEY || !process.env.NOVU_API_URL) {
    return;
  }

  try {
    await trigger(entryId);
  } catch (error) {
    logFailure(error, { entryId });
  }
}

async function trigger(entryId: string) {
  const admin = getSupabaseServerAdminClient();
  const novu = createNovuClient();

  const { data: recipients } = await admin
    .rpc('lender_faq_recipients', { entry_id: entryId })
    .throwOnError();

  const lowestRoomByPerson = new Map<string, (typeof recipients)[number]>();
  for (const recipient of recipients) {
    const kept = lowestRoomByPerson.get(recipient.user_id);
    if (!kept || recipient.room_id < kept.room_id) {
      lowestRoomByPerson.set(recipient.user_id, recipient);
    }
  }

  await Promise.all(
    [...lowestRoomByPerson.values()].map((recipient) =>
      triggerNotification(
        { novu, client: admin },
        {
          eventType: LENDER_ROOM_DOCUMENTS_WORKFLOW_ID,
          recipientUserId: recipient.user_id,
          email: recipient.email,
          payload: { kind: 'faq', entryId, roomId: recipient.room_id },
        },
      ).catch((error: unknown) =>
        logFailure(error, { entryId, userId: recipient.user_id }),
      ),
    ),
  );
}
