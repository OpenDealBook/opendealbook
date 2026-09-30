import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../activities';

const { fetchDueOutreachAccounts, dispatchAccountOutreach } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '5 minutes',
});

export async function outreachDispatch(): Promise<void> {
  const accountIds = await fetchDueOutreachAccounts();

  for (const accountId of accountIds) {
    await dispatchAccountOutreach({ accountId });
  }
}
