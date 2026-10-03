import { handleDatabaseWebhook } from '@odb/database-webhooks';
import { enhanceRouteHandler } from '@odb/next/routes';
import { getLogger } from '@odb/shared/logger';
import { startTrialDrip } from '@odb/workflows/client';

import appConfig from '../../../../config/app.config';
import pathsConfig from '../../../../config/paths.config';

interface AccountRecordChange {
  type: string;
  table: string;
  record: {
    id: string;
    primary_owner_user_id: string;
    email: string | null;
    is_personal_account: boolean;
  };
}

export const POST = enhanceRouteHandler(
  async ({ request }) => {
    const change = (await request.clone().json()) as AccountRecordChange;

    await handleDatabaseWebhook(request);

    await maybeStartTrialDrip(change);

    return new Response('OK', { status: 200 });
  },
  { auth: false },
);

async function maybeStartTrialDrip(
  change: AccountRecordChange,
): Promise<void> {
  if (
    change.type !== 'INSERT' ||
    change.table !== 'accounts' ||
    !change.record.is_personal_account ||
    change.record.email === null
  ) {
    return;
  }

  try {
    await startTrialDrip({
      accountId: change.record.id,
      userId: change.record.primary_owner_user_id,
      email: change.record.email,
      productName: appConfig.name,
      upgradeLink: `${appConfig.url}${pathsConfig.app.billing}`,
      actionLink: `${appConfig.url}${pathsConfig.app.home}`,
    });
  } catch (error) {
    getLogger().warn({ error }, 'Failed to start trial drip');
  }
}
