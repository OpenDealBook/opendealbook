import {
  condition,
  defineSignal,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';

import type * as activities from '../activities';

const {
  loadBrokerContacts,
  computeExcludedBrokers,
  sendBrokerBatchEmail,
  createBrokerFollowUpTask,
  recordWorkbookRun,
  createNotification,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
});

export interface BrokerCatchUpConfig {
  dealLeadUserId: string;
  fromEmail: string;
  subject: string;
  updates: string;
  bookACallUrl: string;
}

export interface BrokerCatchUpInput {
  workbookId: string;
  accountId: string;
  config: BrokerCatchUpConfig;
}

export const approveBrokerCatchUp = defineSignal('approveBrokerCatchUp');

const APPROVAL_REMINDER_INTERVAL = '3 days';

export async function brokerCatchUp(input: BrokerCatchUpInput): Promise<void> {
  const startedAt = new Date(Date.now()).toISOString();

  const [contacts, excluded] = await Promise.all([
    loadBrokerContacts({ accountId: input.accountId }),
    computeExcludedBrokers({ accountId: input.accountId }),
  ]);

  const excludedIds = new Set(excluded.map((broker) => broker.brokerContactId));
  const recipients = contacts.filter((contact) => !excludedIds.has(contact.id));

  let approved = false;
  setHandler(approveBrokerCatchUp, () => {
    approved = true;
  });

  while (!approved) {
    const gotApproval = await condition(
      () => approved,
      APPROVAL_REMINDER_INTERVAL,
    );

    if (!gotApproval) {
      await createNotification({
        accountId: input.accountId,
        recipientUserId: input.config.dealLeadUserId,
        type: 'info',
        body: 'Broker catch-up batch is waiting for your approval',
      });
    }
  }

  const { sent } = await sendBrokerBatchEmail({
    accountId: input.accountId,
    config: input.config,
    recipients,
  });

  for (const broker of excluded) {
    await createBrokerFollowUpTask({
      accountId: input.accountId,
      recipientUserId: input.config.dealLeadUserId,
      brokerName: broker.brokerName,
    });
  }

  await recordWorkbookRun({
    workbookId: input.workbookId,
    accountId: input.accountId,
    startedAt,
    finishedAt: new Date(Date.now()).toISOString(),
    itemsTotal: recipients.length + excluded.length,
    itemsDone: sent + excluded.length,
    status: 'completed',
  });
}
