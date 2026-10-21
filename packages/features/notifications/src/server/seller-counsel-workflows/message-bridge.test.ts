import { describe, expect, it } from 'vitest';

import { createLenderBridge } from '../lender-workflows/bridge';

import { createHmac } from 'node:crypto';

const secretKey = 'test-novu-secret';
const siteUrl = 'https://opendealbook.app';

const dealId = '22222222-2222-4222-8222-222222222222';
const roomId = '33333333-3333-4333-8333-333333333333';

const unused = async () => {
  throw new Error('not used by the seller and counsel thread workflow');
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

async function emailFor(audience: 'seller' | 'counsel', authorName: string) {
  const body = {
    payload: {
      audience,
      dealId,
      roomId,
      authorName,
      messageId: 'message-1',
      businessName: 'Brennan Tooling',
      outsideName: 'Project Falcon',
    },
    controls: {},
    state: [],
    subscriber: { subscriberId: 'recipient-1' },
  };
  const response = await bridge(
    new Request(
      `${siteUrl}/api/novu?action=execute&workflowId=seller-counsel-message.posted&stepId=email`,
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

  return (
    (await response.json()) as {
      outputs: { subject: string; body: string };
    }
  ).outputs;
}

describe('seller and counsel thread email', () => {
  it('tells the seller their counsel wrote, naming the business inside and the outside name in the subject', async () => {
    const email = await emailFor('seller', 'Owen Castillo');

    expect(email.subject).toBe(
      'New private message from Owen Castillo on Project Falcon',
    );
    expect(email.body).toContain(
      'Owen Castillo sent you a private message about Brennan Tooling.',
    );
    expect(email.body).toContain(
      `href="${siteUrl}/seller/rooms/${roomId}/counsel#seller-counsel-message-message-1"`,
    );
  });

  it('links counsel to the client thread in their portal', async () => {
    const email = await emailFor('counsel', 'Walt Brennan');

    expect(email.subject).toBe(
      'New private message from Walt Brennan on Project Falcon',
    );
    expect(email.body).toContain(
      `href="${siteUrl}/counsel/${dealId}/client#seller-counsel-message-message-1"`,
    );
  });
});
