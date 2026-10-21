import { describe, expect, it } from 'vitest';

import { createLenderBridge } from '../lender-workflows/bridge';

import { createHmac } from 'node:crypto';

const secretKey = 'test-novu-secret';
const siteUrl = 'https://opendealbook.app';
const bridgeUrl = `${siteUrl}/api/novu`;

const messageId = '11111111-1111-4111-8111-111111111111';
const dealId = '22222222-2222-4222-8222-222222222222';

const unused = async () => {
  throw new Error('not used by counsel workflows');
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
  loadCounselMessage: async (input) => {
    expect(input.messageId).toBe(messageId);

    return {
      dealId,
      dealName:
        input.audience === 'counsel' ? 'Brennan Tooling' : 'Acme Tooling',
      outsideName: 'Project Falcon',
      teamAccountSlug: 'acme-capital',
      side: 'seller',
      authorName: 'Sol Sellerlaw',
    };
  },
});

function sign(body: unknown): string {
  const timestamp = Date.now();
  const hmac = createHmac('sha256', secretKey)
    .update(`${timestamp}.${JSON.stringify(body)}`)
    .digest('hex');

  return `t=${timestamp},v1=${hmac}`;
}

async function emailFor(audience: 'team' | 'counsel') {
  const body = {
    payload: { messageId, audience },
    controls: {},
    state: [],
    subscriber: { subscriberId: 'recipient-1' },
  };
  const response = await bridge(
    new Request(
      `${bridgeUrl}?action=execute&workflowId=counsel-message&stepId=email`,
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

describe('counsel message email', () => {
  it('tells the deal team which counsel wrote, linking to the message on the deal', async () => {
    const email = await emailFor('team');

    expect(email.subject).toBe("New message from seller's counsel");
    expect(email.body).toContain('Sol Sellerlaw');
    expect(email.body).toContain('Acme Tooling');
    expect(email.body).toContain(
      `href="${siteUrl}/home/acme-capital/deals/${dealId}/parties#counsel-message-${messageId}"`,
    );
  });

  it("tells seller's counsel the deal team wrote, with the outside name in the subject and the business in the body", async () => {
    const email = await emailFor('counsel');

    expect(email.subject).toBe(
      'New message from the deal team on Project Falcon',
    );
    expect(email.body).toContain('Brennan Tooling');
    expect(email.body).toContain(
      `href="${siteUrl}/counsel/${dealId}/messages#counsel-message-${messageId}"`,
    );
    expect(email.body).not.toContain('acme-capital');
  });
});

describe("team daily digest of buyer's counsel uploads", () => {
  const manager = 'manager-1';
  const managedDeal = '33333333-3333-4333-8333-333333333333';
  const dealNoLongerManaged = '44444444-4444-4444-8444-444444444444';

  function uploadsBridge(digestIntervalMinutes: number | undefined) {
    return createLenderBridge({
      secretKey,
      siteUrl,
      digestIntervalMinutes,
      loadRoom: unused,
      loadRequestTitle: unused,
      loadVisibleDocuments: unused,
      loadVisibleFaqEntries: unused,
      loadManagedSellerRooms: unused,
      loadSellerDigestItems: unused,
      loadCounselMessage: unused,
      loadSubmittedDealUpdate: unused,
      loadManagedCounselDeals: async ({ userId, dealIds }) =>
        userId === manager
          ? dealIds
              .filter((id) => id === managedDeal)
              .map((id) => ({
                dealId: id,
                title: 'Acme Tooling',
                path: `/home/acme-capital/deals/${id}`,
              }))
          : [],
    });
  }

  function completed(stepId: string, outputs: Record<string, unknown>) {
    return { stepId, outputs, state: { status: 'completed' } };
  }

  const day = completed('daily-digest', {
    eventCount: 3,
    events: [
      { dealId: managedDeal, line: 'Bea Buyerlaw uploaded redline.pdf' },
      { dealId: managedDeal, line: 'Bea Buyerlaw uploaded markup.docx' },
      { dealId: dealNoLongerManaged, line: 'Cal Counsel uploaded secret.pdf' },
    ].map((payload, index) => ({
      id: `event-${index}`,
      time: '2026-10-15T12:00:00.000Z',
      payload,
    })),
  });

  async function execute(input: {
    stepId: string;
    digestIntervalMinutes?: number;
    state?: ReturnType<typeof completed>[];
  }) {
    const body = {
      payload: {
        dealId: managedDeal,
        line: 'Bea Buyerlaw uploaded redline.pdf',
      },
      controls: {},
      state: input.state ?? [],
      subscriber: { subscriberId: manager },
    };
    const response = await uploadsBridge(input.digestIntervalMinutes)(
      new Request(
        `${bridgeUrl}?action=execute&workflowId=counsel-uploads&stepId=${input.stepId}`,
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

    return (await response.json()) as {
      outputs: { subject?: string; body?: string } & Record<string, unknown>;
      options: { skip: boolean };
    };
  }

  it('batches until 22:00 UTC each day, or over the configured minutes', async () => {
    expect((await execute({ stepId: 'daily-digest' })).outputs).toMatchObject({
      type: 'timed',
      cron: '0 22 * * *',
    });
    expect(
      (await execute({ stepId: 'daily-digest', digestIntervalMinutes: 1 }))
        .outputs,
    ).toEqual({ amount: 1, unit: 'minutes' });
  });

  it('keeps only the deals the person still manages, grouping the day by deal', async () => {
    expect(
      (await execute({ stepId: 'managed-deals', state: [day] })).outputs,
    ).toEqual({
      deals: [
        {
          title: 'Acme Tooling',
          link: `${siteUrl}/home/acme-capital/deals/${managedDeal}`,
          lines: [
            'Bea Buyerlaw uploaded redline.pdf',
            'Bea Buyerlaw uploaded markup.docx',
          ],
        },
      ],
    });
  });

  it("emails the day of buyer's counsel uploads with a link to each deal", async () => {
    const deals = completed('managed-deals', {
      deals: [
        {
          title: 'Acme Tooling',
          link: `${siteUrl}/home/acme-capital/deals/${managedDeal}`,
          lines: ['Bea Buyerlaw uploaded redline.pdf'],
        },
      ],
    });

    const result = await execute({ stepId: 'email', state: [day, deals] });

    expect(result.options.skip).toBe(false);
    expect(result.outputs.subject).toBe("Buyer's counsel uploaded files today");
    expect(result.outputs.body).toContain('Bea Buyerlaw uploaded redline.pdf');
    expect(result.outputs.body).toContain(
      `href="${siteUrl}/home/acme-capital/deals/${managedDeal}"`,
    );
  });

  it('sends nothing when no managed deal had uploads', async () => {
    const result = await execute({
      stepId: 'email',
      state: [day, completed('managed-deals', { deals: [] })],
    });

    expect(result.options.skip).toBe(true);
  });
});

describe('contract negotiation email', () => {
  async function negotiationEmail(payload: Record<string, unknown>) {
    const body = {
      payload,
      controls: {},
      state: [],
      subscriber: { subscriberId: 'recipient-1' },
    };
    const response = await bridge(
      new Request(
        `${bridgeUrl}?action=execute&workflowId=contract-negotiation&stepId=email`,
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

  it('names the contract, the version and who added it, linking to the contracts', async () => {
    const email = await negotiationEmail({
      kind: 'version',
      contractType: 'apa',
      version: 3,
      actor: "Dana Lee (Buyer's counsel)",
      dealName: 'Acme Tooling',
      path: `/counsel/${dealId}/contracts`,
    });

    expect(email.subject).toBe(
      "Dana Lee (Buyer's counsel) added APA version 3",
    );
    expect(email.body).toContain(
      "Dana Lee (Buyer's counsel) added version 3 of the APA on Acme Tooling.",
    );
    expect(email.body).toContain(
      `href="${siteUrl}/counsel/${dealId}/contracts"`,
    );
  });

  it('puts the outside name in the subject for someone outside the team, and the given name in the body', async () => {
    const email = await negotiationEmail({
      kind: 'version',
      contractType: 'apa',
      version: 3,
      actor: 'Max Manager (Buyer)',
      dealName: 'Acme Tooling',
      outsideName: 'Project Falcon',
      path: `/counsel/${dealId}/contracts`,
    });

    expect(email.subject).toBe(
      'Max Manager (Buyer) added APA version 3 on Project Falcon',
    );
    expect(email.body).toContain(
      'Max Manager (Buyer) added version 3 of the APA on Acme Tooling.',
    );
  });

  it('names the contract, the version and who commented on it', async () => {
    const email = await negotiationEmail({
      kind: 'comment',
      contractType: 'apa',
      version: 2,
      actor: 'Olive Owner (Buyer)',
      dealName: 'Acme Tooling',
      path: `/home/acme-capital/deals/${dealId}`,
    });

    expect(email.subject).toBe(
      'Olive Owner (Buyer) commented on APA version 2',
    );
    expect(email.body).toContain(
      'Olive Owner (Buyer) commented on version 2 of the APA on Acme Tooling.',
    );
    expect(email.body).toContain(
      `href="${siteUrl}/home/acme-capital/deals/${dealId}"`,
    );
  });

  it('asks for a review of the version', async () => {
    const email = await negotiationEmail({
      kind: 'review_requested',
      contractType: 'apa',
      version: 4,
      actor: 'Max Manager (Buyer)',
      dealName: 'Acme Tooling',
      path: `/counsel/${dealId}/contracts`,
    });

    expect(email.subject).toBe(
      'Max Manager (Buyer) asked for a review of APA version 4',
    );
    expect(email.body).toContain(
      'Max Manager (Buyer) asked for a review of version 4 of the APA on Acme Tooling.',
    );
  });

  it.each([
    ['approved', 'approved'],
    ['approved_with_comments', 'approved with comments'],
    ['changes_needed', 'asked for changes to'],
  ])('tells the team counsel %s the version', async (verdict, verb) => {
    const email = await negotiationEmail({
      kind: 'review_decided',
      verdict,
      contractType: 'loi',
      version: 2,
      actor: "Sol Seller (Seller's counsel)",
      dealName: 'Acme Tooling',
      path: `/home/acme-capital/deals/${dealId}`,
    });

    expect(email.subject).toBe(
      `Sol Seller (Seller's counsel) ${verb} LOI version 2`,
    );
    expect(email.body).toContain(
      `Sol Seller (Seller's counsel) ${verb} version 2 of the LOI on Acme Tooling.`,
    );
  });

  it('tells the team the version they want changed is already out for signature', async () => {
    const email = await negotiationEmail({
      kind: 'review_decided',
      verdict: 'changes_needed',
      outForSignature: true,
      contractType: 'apa',
      version: 3,
      actor: "Sol Seller (Seller's counsel)",
      dealName: 'Acme Tooling',
      path: `/home/acme-capital/deals/${dealId}`,
    });

    expect(email.body).toContain(
      "Sol Seller (Seller's counsel) asked for changes to version 3 of the APA on Acme Tooling. It is already out for signature and was not recalled.",
    );
  });

  it('gives the reason sign-off was overridden', async () => {
    const email = await negotiationEmail({
      kind: 'signing_overridden',
      reason: 'Counsel approved by phone',
      contractType: 'apa',
      version: 5,
      actor: 'Max Manager (Buyer)',
      dealName: 'Acme Tooling',
      path: `/counsel/${dealId}/contracts`,
    });

    expect(email.subject).toBe(
      'Max Manager (Buyer) overrode counsel sign-off on APA version 5',
    );
    expect(email.body).toContain(
      'Max Manager (Buyer) overrode counsel sign-off on version 5 of the APA on Acme Tooling: Counsel approved by phone',
    );
  });
});
