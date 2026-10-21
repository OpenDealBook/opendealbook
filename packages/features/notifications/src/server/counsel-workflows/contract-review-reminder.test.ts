import { describe, expect, it } from 'vitest';

import { createLenderBridge } from '../lender-workflows/bridge';

import { createHmac } from 'node:crypto';

const secretKey = 'test-novu-secret';
const siteUrl = 'https://opendealbook.app';

const unused = async () => {
  throw new Error('not used by the review reminder');
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

describe('contract review reminder email', () => {
  it('asks for sign-off on the version, saying since when, linking to where they review it', async () => {
    const body = {
      payload: {
        dealName: 'Acme Tooling',
        subjectDealName: 'Project Falcon',
        contractType: 'apa',
        version: 3,
        since: 'Oct 18',
        path: '/counsel/deal-1/contracts',
      },
      controls: {},
      state: [],
      subscriber: { subscriberId: 'counsel-1' },
    };
    const response = await bridge(
      new Request(
        `${siteUrl}/api/novu?action=execute&workflowId=contract-review.reminder&stepId=email`,
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
      'Your sign-off on APA version 3 for Project Falcon is waiting',
    );
    expect(email.body).toContain('Acme Tooling');
    expect(email.body).toContain('Oct 18');
    expect(email.body).toContain(`href="${siteUrl}/counsel/deal-1/contracts"`);
  });
});
