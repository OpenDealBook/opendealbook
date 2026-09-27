import {
  defineSignal,
  proxyActivities,
  setHandler,
  sleep,
} from '@temporalio/workflow';

import type * as activities from '../activities';

const { createNotification } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

export const stopCadence = defineSignal('stopCadence');

export interface WeeklyMeetingCadenceInput {
  dealId: string;
  accountId: string;
  recipientUserId: string;
}

export async function weeklyMeetingCadence(
  input: WeeklyMeetingCadenceInput,
): Promise<void> {
  let running = true;

  setHandler(stopCadence, () => {
    running = false;
  });

  while (running) {
    await sleep('7 days');

    if (!running) {
      break;
    }

    await createNotification({
      accountId: input.accountId,
      recipientUserId: input.recipientUserId,
      type: 'info',
      body: 'Weekly deal meeting occurrence',
    });
  }
}
