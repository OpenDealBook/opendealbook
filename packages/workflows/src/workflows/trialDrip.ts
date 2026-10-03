import {
  condition,
  defineSignal,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';

import type * as activities from '../activities';
import { trialDripDecision } from '../trialDrip/eligibility';
import { trialDripSends } from '../trialDrip/schedule';

const { sendTrialDripEmail, checkTrialDripEligibility } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '5 minutes',
});

export interface TrialDripInput {
  accountId: string;
  userId: string;
  email: string;
  productName: string;
  userName?: string;
  actionLink: string;
  upgradeLink: string;
}

export const stopTrialDrip = defineSignal('stopTrialDrip');

export async function trialDrip(input: TrialDripInput): Promise<void> {
  let stopped = false;
  setHandler(stopTrialDrip, () => {
    stopped = true;
  });

  for (const send of trialDripSends()) {
    await condition(() => stopped, send.sleepMs);

    if (stopped) {
      return;
    }

    const eligibility = await checkTrialDripEligibility({
      accountId: input.accountId,
    });

    if (trialDripDecision(eligibility) === 'stop') {
      return;
    }

    await sendTrialDripEmail({
      to: input.email,
      dayKey: send.dayKey,
      productName: input.productName,
      userName: input.userName,
      link: send.dayKey === 'trial-day-6' ? input.upgradeLink : input.actionLink,
    });
  }
}
