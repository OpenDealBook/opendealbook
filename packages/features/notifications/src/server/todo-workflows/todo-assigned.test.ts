import { describe, expect, it } from 'vitest';

import { createLenderBridge } from '../lender-workflows/bridge';

import { createHmac } from 'node:crypto';

const secretKey = 'test-novu-secret';
const siteUrl = 'https://opendealbook.app';

const unused = async () => {
  throw new Error('not used by the to-do assignment');
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
  loadSubmittedDealUpdate: unused,
  loadCounselMessage: unused,
});

function sign(body: unknown): string {
  const timestamp = Date.now();
  const hmac = createHmac('sha256', secretKey)
    .update(`${timestamp}.${JSON.stringify(body)}`)
    .digest('hex');

  return `t=${timestamp},v1=${hmac}`;
}

describe('to-do assignment email', () => {
  it('says who assigned which to-do on which deal, linking to the deal to-dos', async () => {
    const body = {
      payload: {
        assignerName: 'Morgan Reyes',
        dealName: 'Brennan Climate',
        title: 'Pull the leases',
        path: '/home/harbor/deals/deal-1/todos',
      },
      controls: {},
      state: [],
      subscriber: { subscriberId: 'analyst-1' },
    };
    const response = await bridge(
      new Request(
        `${siteUrl}/api/novu?action=execute&workflowId=todo.assigned&stepId=email`,
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
    const email = (
      (await response.json()) as { outputs: { subject: string; body: string } }
    ).outputs;

    expect(email.subject).toBe(
      'Morgan Reyes assigned you a to-do on Brennan Climate',
    );
    expect(email.body).toContain('Pull the leases');
    expect(email.body).toContain(
      `href="${siteUrl}/home/harbor/deals/deal-1/todos"`,
    );
  });
});
