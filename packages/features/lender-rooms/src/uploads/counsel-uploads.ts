import 'server-only';
import { COUNSEL_UPLOADS_WORKFLOW_ID } from '@odb/notifications/relay';
import {
  createNovuClient,
  triggerNotification,
} from '@odb/notifications/server';
import { getLogger } from '@odb/shared/logger';

import { dealManagerIds } from '../actions/deal-manager-ids';
import type { Space } from './access';
import type { Admin } from './objects';

// Queued for each deal manager's daily email, like seller activity: a Novu
// outage must not fail the counsel's upload.
export async function queueCounselUpload(
  admin: Admin,
  space: Space,
  userId: string,
  fileName: string,
): Promise<void> {
  if (!process.env.NOVU_API_KEY || !process.env.NOVU_API_URL) {
    return;
  }

  try {
    const [managers, { data: counsel }] = await Promise.all([
      dealManagerIds(admin, space.account_id),
      admin
        .from('deal_counsel')
        .select('name, email')
        .eq('deal_id', space.deal_id)
        .eq('user_id', userId)
        .single()
        .throwOnError(),
    ]);
    const { data: personalAccounts } = await admin
      .from('accounts')
      .select('primary_owner_user_id, email')
      .eq('is_personal_account', true)
      .in('primary_owner_user_id', managers)
      .throwOnError();

    const emailOf = new Map(
      personalAccounts.map((account) => [
        account.primary_owner_user_id,
        account.email,
      ]),
    );
    const novu = createNovuClient();

    await Promise.all(
      managers.map((recipientUserId) =>
        triggerNotification(
          { novu, client: admin },
          {
            eventType: COUNSEL_UPLOADS_WORKFLOW_ID,
            recipientUserId,
            payload: {
              dealId: space.deal_id,
              line: `${counsel.name ?? counsel.email} uploaded ${fileName}`,
            },
            email: emailOf.get(recipientUserId) ?? undefined,
          },
        ),
      ),
    );
  } catch (error) {
    getLogger().error(
      { err: error, dealId: space.deal_id },
      "Buyer's counsel upload digest event failed",
    );
  }
}
