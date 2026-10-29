import { describe, expect, it } from 'vitest';

import { createLenderBridge } from '../lender-workflows/bridge';

import { createHmac } from 'node:crypto';

const secretKey = 'test-novu-secret';
const siteUrl = 'https://opendealbook.app';

const unused = async () => {
  throw new Error('not used by the deal deleted notice');
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

describe('deal deleted email', () => {
  it('tells an outside party the team deleted the deal room they knew', async () => {
    const body = {
      payload: { teamName: 'Acme Partners', dealName: 'Project Atlas' },
      controls: {},
      state: [],
      subscriber: { subscriberId: 'lender-1' },
    };
    const response = await bridge(
      new Request(
        `${siteUrl}/api/novu?action=execute&workflowId=deal.deleted&stepId=email`,
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
      'Acme Partners deleted the deal room for Project Atlas',
    );
    expect(email.body).toContain(
      'Its files and messages are no longer available.',
    );
  });
});
