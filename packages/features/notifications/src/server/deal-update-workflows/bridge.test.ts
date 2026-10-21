import { describe, expect, it } from 'vitest';

import { createLenderBridge } from '../lender-workflows/bridge';

import { createHmac } from 'node:crypto';

const secretKey = 'test-novu-secret';
const siteUrl = 'https://opendealbook.app';
const updateId = '11111111-1111-4111-8111-111111111111';
const dealId = '22222222-2222-4222-8222-222222222222';

const unused = async () => {
  throw new Error('not used by the deal update workflow');
};

const bridge = createLenderBridge({
  secretKey,
  siteUrl,
  digestIntervalMinutes: undefined,
  loadRoom: unused,
  loadRequestTitle: unused,
  loadVisibleDocuments: unused,
  loadVisibleFaqEntries: unused,
  loadManagedSellerRooms: unused,
  loadSellerDigestItems: unused,
  loadManagedCounselDeals: unused,
  loadCounselMessage: unused,
  loadSubmittedDealUpdate: async () => ({
    subject: 'Payoff letter',
    authorName: 'Avery Author',
    dealName: 'Brennan Tooling',
    dealId,
    teamAccountSlug: 'acme-capital',
  }),
});

function sign(body: unknown): string {
  const timestamp = Date.now();
  const hmac = createHmac('sha256', secretKey)
    .update(`${timestamp}.${JSON.stringify(body)}`)
    .digest('hex');

  return `t=${timestamp},v1=${hmac}`;
}

describe('deal update approval email', () => {
  it('links the approver to the update on the deal', async () => {
    const body = {
      payload: { updateId },
      controls: {},
      state: [],
      subscriber: { subscriberId: 'approver-1' },
    };
    const response = await bridge(
      new Request(
        `${siteUrl}/api/novu?action=execute&workflowId=deal-update-submitted&stepId=email`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'novu-signature': sign(body),
          },
          body: JSON.stringify(body),
        },
      ),
    );
    const { outputs } = (await response.json()) as {
      outputs: { body: string };
    };

    expect(outputs.body).toContain(
      `href="${siteUrl}/home/acme-capital/deals/${dealId}#deal-update-${updateId}"`,
    );
  });
});
