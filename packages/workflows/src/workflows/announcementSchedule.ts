import { proxyActivities, sleep } from '@temporalio/workflow';

import type * as activities from '../activities';

const { createNotification } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

export interface AnnouncementItem {
  label: string;
  at: string;
}

export interface AnnouncementScheduleInput {
  dealId: string;
  accountId: string;
  recipientUserId: string;
  items: AnnouncementItem[];
}

export async function announcementSchedule(
  input: AnnouncementScheduleInput,
): Promise<void> {
  for (const item of input.items) {
    await sleep(Date.parse(item.at) - Date.now());

    await createNotification({
      accountId: input.accountId,
      recipientUserId: input.recipientUserId,
      type: 'info',
      body: `Announcement: ${item.label}`,
    });
  }
}
