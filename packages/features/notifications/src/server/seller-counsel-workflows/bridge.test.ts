import { describe, expect, it } from 'vitest';

import { createLenderBridge } from '../lender-workflows/bridge';

import { createHmac } from 'node:crypto';

const secretKey = 'test-novu-secret';
const siteUrl = 'https://opendealbook.app';
const bridgeUrl = `${siteUrl}/api/novu`;

const dealId = '22222222-2222-4222-8222-222222222222';
const roomId = '33333333-3333-4333-8333-333333333333';

const unused = async () => {
  throw new Error("not used by the Seller's counsel folder workflow");
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

async function emailFor(
  audience: 'seller' | 'counsel',
  added = { fileName: 'side-letter.pdf', fileCount: 1 },
) {
  const body = {
    payload: {
      audience,
      dealId,
      roomId,
      uploaderName: 'Owen Castillo',
      ...added,
      businessName: 'Brennan Tooling',
    },
    controls: {},
    state: [],
    subscriber: { subscriberId: 'recipient-1' },
  };
  const response = await bridge(
    new Request(
      `${bridgeUrl}?action=execute&workflowId=seller-counsel-folder.file-added&stepId=email`,
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

describe("Seller's counsel folder file email", () => {
  it('tells the seller what was added, without the file in the subject, linking to their room', async () => {
    const email = await emailFor('seller');

    expect(email.subject).toBe("New file in the Seller's counsel folder");
    expect(email.body).toContain(
      "Owen Castillo added side-letter.pdf to the Seller's counsel folder for Brennan Tooling.",
    );
    expect(email.body).toContain(`href="${siteUrl}/seller/rooms/${roomId}"`);
  });

  it('says files, plural, when one notice covers several files', async () => {
    const email = await emailFor('seller', {
      fileName: '3 files (disclosures.zip)',
      fileCount: 3,
    });

    expect(email.subject).toBe("New files in the Seller's counsel folder");
    expect(email.body).toContain(
      "Owen Castillo added 3 files (disclosures.zip) to the Seller's counsel folder for Brennan Tooling.",
    );
  });

  it('links counsel to the Seller room tab of their portal', async () => {
    const email = await emailFor('counsel');

    expect(email.body).toContain(
      `href="${siteUrl}/counsel/${dealId}/seller-room"`,
    );
  });
});
