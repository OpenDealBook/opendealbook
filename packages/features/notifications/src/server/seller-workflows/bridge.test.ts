import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLenderBridge } from '../lender-workflows/bridge';

import { createHmac } from 'node:crypto';

const secretKey = 'test-novu-secret';
const siteUrl = 'https://opendealbook.app';
const bridgeUrl = `${siteUrl}/api/novu`;

const manager = '99999999-9999-4999-8999-999999999999';
const managedRoom = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const roomNoLongerManaged = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const seller = '88888888-8888-4888-8888-888888888888';
const sellerRoom = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const shownFile = '11111111-1111-4111-8111-111111111111';
const hiddenFile = '22222222-2222-4222-8222-222222222222';
const sharedFolder = '33333333-3333-4333-8333-333333333333';
const sharedMeeting = '44444444-4444-4444-8444-444444444444';
const sameNameElsewhere = '55555555-5555-4555-8555-555555555555';
const leaseFirst = '66666666-6666-4666-8666-666666666666';
const leaseSecond = '77777777-7777-4777-8777-777777777777';

const visibleFiles: Record<string, { name: string; folderId: string }> = {
  [shownFile]: { name: 'p-and-l.pdf', folderId: 'folder-2024' },
  [sameNameElsewhere]: { name: 'p-and-l.pdf', folderId: 'folder-2025' },
  [leaseFirst]: { name: 'lease.pdf', folderId: 'folder-leases' },
  [leaseSecond]: { name: 'lease.pdf', folderId: 'folder-leases' },
};

const unused = async () => {
  throw new Error('not used by seller workflows');
};

function bridgeWith(digestIntervalMinutes: number | undefined) {
  return createLenderBridge({
    secretKey,
    siteUrl,
    digestIntervalMinutes,
    loadRoom: unused,
    loadRequestTitle: unused,
    loadVisibleDocuments: unused,
    loadVisibleFaqEntries: unused,
    loadCounselMessage: unused,
    loadManagedCounselDeals: unused,
    loadSubmittedDealUpdate: unused,
    loadSellerDigestItems: async ({
      userId,
      documentIds,
      folderIds,
      meetingIds,
    }) =>
      userId === seller
        ? [
            ...documentIds
              .filter((id) => id in visibleFiles)
              .map((id) => ({
                kind: 'document' as const,
                itemId: id,
                name: visibleFiles[id]!.name,
                folderId: visibleFiles[id]!.folderId,
                roomId: sellerRoom,
                teamName: 'Acme Partners',
                dealName: 'Brennan Tooling',
                outsideName: 'Project Atlas',
              })),
            ...folderIds
              .filter((id) => id === sharedFolder)
              .map((id) => ({
                kind: 'folder' as const,
                itemId: id,
                name: 'Financials',
                folderId: null,
                roomId: sellerRoom,
                teamName: 'Acme Partners',
                dealName: 'Brennan Tooling',
                outsideName: 'Project Atlas',
              })),
            ...meetingIds
              .filter((id) => id === sharedMeeting)
              .map((id) => ({
                kind: 'meeting' as const,
                itemId: id,
                folderId: null,
                name: 'Weekly meeting, Oct 1, 2026',
                roomId: sellerRoom,
                teamName: 'Acme Partners',
                dealName: 'Brennan Tooling',
                outsideName: 'Project Atlas',
              })),
          ]
        : [],
    loadManagedSellerRooms: async ({ userId, roomIds }) =>
      userId === manager
        ? roomIds
            .filter((roomId) => roomId === managedRoom)
            .map((roomId) => ({
              roomId,
              title: 'Acme Tooling',
              path: '/home/acme-capital/deals/deal-1',
            }))
        : [],
  });
}

function sign(body: unknown): string {
  const timestamp = Date.now();
  const hmac = createHmac('sha256', secretKey)
    .update(`${timestamp}.${JSON.stringify(body)}`)
    .digest('hex');

  return `t=${timestamp},v1=${hmac}`;
}

function completed(stepId: string, outputs: Record<string, unknown>) {
  return { stepId, outputs, state: { status: 'completed' } };
}

function digestOf(payloads: Record<string, unknown>[]) {
  return completed('daily-digest', {
    eventCount: payloads.length,
    events: payloads.map((payload, index) => ({
      id: `event-${index}`,
      time: '2026-10-15T12:00:00.000Z',
      payload,
    })),
  });
}

async function execute(input: {
  digestIntervalMinutes?: number;
  workflowId?: string;
  subscriberId?: string;
  payload?: Record<string, unknown>;
  stepId: string;
  state?: ReturnType<typeof completed>[];
}) {
  const body = {
    payload: input.payload ?? {
      roomId: managedRoom,
      line: 'Sam Seller uploaded lease.pdf',
    },
    controls: {},
    state: input.state ?? [],
    subscriber: { subscriberId: input.subscriberId ?? manager },
  };
  const response = await bridgeWith(input.digestIntervalMinutes)(
    new Request(
      `${bridgeUrl}?action=execute&workflowId=${input.workflowId ?? 'seller-room-activity'}&stepId=${input.stepId}`,
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

const day = digestOf([
  { roomId: managedRoom, line: 'Sam Seller uploaded lease.pdf' },
  { roomId: managedRoom, line: 'Sam Seller answered "Customer list?"' },
  { roomId: roomNoLongerManaged, line: 'Pat Partner uploaded secret.pdf' },
]);

describe('team daily digest of seller activity', () => {
  it('batches until 22:00 UTC each day, or over the configured minutes', async () => {
    expect((await execute({ stepId: 'daily-digest' })).outputs).toMatchObject({
      type: 'timed',
      cron: '0 22 * * *',
    });
    expect(
      (await execute({ digestIntervalMinutes: 1, stepId: 'daily-digest' }))
        .outputs,
    ).toEqual({ amount: 1, unit: 'minutes' });
  });

  it('keeps only the rooms the person still manages, grouping the day by deal', async () => {
    const result = await execute({ stepId: 'managed-rooms', state: [day] });

    expect(result.outputs).toEqual({
      rooms: [
        {
          title: 'Acme Tooling',
          link: `${siteUrl}/home/acme-capital/deals/deal-1`,
          lines: [
            'Sam Seller uploaded lease.pdf',
            'Sam Seller answered "Customer list?"',
          ],
        },
      ],
    });
  });

  it('emails the day of seller activity with a link to each deal', async () => {
    const rooms = completed('managed-rooms', {
      rooms: [
        {
          title: 'Acme Tooling',
          link: `${siteUrl}/home/acme-capital/deals/deal-1`,
          lines: ['Sam Seller uploaded lease.pdf'],
        },
      ],
    });

    const result = await execute({ stepId: 'email', state: [day, rooms] });

    expect(result.options.skip).toBe(false);
    expect(result.outputs.subject).toBe('Your sellers were busy today');
    expect(result.outputs.body).toContain('Sam Seller uploaded lease.pdf');
    expect(result.outputs.body).toContain(
      `href="${siteUrl}/home/acme-capital/deals/deal-1"`,
    );
  });

  it('sends nothing when no managed room had activity', async () => {
    const result = await execute({
      stepId: 'email',
      state: [day, completed('managed-rooms', { rooms: [] })],
    });

    expect(result.options.skip).toBe(true);
  });
});

describe('seller daily digest of what the team shared', () => {
  const sharedDay = digestOf([
    {
      kind: 'document',
      roomId: sellerRoom,
      documentId: shownFile,
      isNewVersion: true,
    },
    {
      kind: 'document',
      roomId: sellerRoom,
      documentId: hiddenFile,
      isNewVersion: false,
    },
    { kind: 'folder', roomId: sellerRoom, folderId: sharedFolder },
    { kind: 'meeting', roomId: sellerRoom, meetingId: sharedMeeting },
  ]);
  const shared = {
    workflowId: 'seller-room-shared',
    subscriberId: seller,
    payload: { kind: 'folder', roomId: sellerRoom, folderId: sharedFolder },
  };

  it('batches until 22:00 UTC each day for a seller with no time zone', async () => {
    expect(
      (await execute({ ...shared, stepId: 'daily-digest' })).outputs,
    ).toMatchObject({
      type: 'timed',
      cron: '0 22 * * *',
    });
  });

  describe('for a seller with a time zone', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      ['America/New_York', '0 2 * * *'],
      ['Asia/Kolkata', '30 16 * * *'],
      ['Asia/Tokyo', '0 13 * * *'],
    ])('batches until 22:00 in %s', async (timezone, cron) => {
      const result = await execute({
        ...shared,
        payload: { ...shared.payload, timezone },
        stepId: 'daily-digest',
      });

      expect(result.outputs).toMatchObject({ type: 'timed', cron });
    });

    it('uses the time of year the event is sent in', async () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

      const result = await execute({
        ...shared,
        payload: { ...shared.payload, timezone: 'America/New_York' },
        stepId: 'daily-digest',
      });

      expect(result.outputs).toMatchObject({
        type: 'timed',
        cron: '0 3 * * *',
      });
    });
  });

  it('names, at send time, only what the seller still sees, grouped by room', async () => {
    const result = await execute({
      ...shared,
      stepId: 'visible-items',
      state: [sharedDay],
    });

    expect(result.outputs).toEqual({
      rooms: [
        {
          title: 'Brennan Tooling with Acme Partners',
          outsideName: 'Project Atlas',
          link: `${siteUrl}/seller/rooms/${sellerRoom}`,
          lines: [
            'Updated file: p-and-l.pdf',
            'New folder: Financials',
            'New meeting: Weekly meeting, Oct 1, 2026',
          ],
        },
      ],
    });
  });

  it('emails the seller what is new in their room', async () => {
    const rooms = completed('visible-items', {
      rooms: [
        {
          title: 'Brennan Tooling with Acme Partners',
          outsideName: 'Project Atlas',
          link: `${siteUrl}/seller/rooms/${sellerRoom}`,
          lines: ['New folder: Financials'],
        },
      ],
    });

    const result = await execute({
      ...shared,
      stepId: 'email',
      state: [sharedDay, rooms],
    });

    expect(result.outputs.subject).toBe('New in your room for Project Atlas');
    expect(result.outputs.body).toContain('Brennan Tooling with Acme Partners');
    expect(result.outputs.body).toContain('New folder: Financials');
    expect(result.outputs.body).toContain(
      `href="${siteUrl}/seller/rooms/${sellerRoom}"`,
    );
  });

  it('sends nothing when nothing is still shown', async () => {
    const result = await execute({
      ...shared,
      stepId: 'email',
      state: [sharedDay, completed('visible-items', { rooms: [] })],
    });

    expect(result.options.skip).toBe(true);
  });

  it('lists two different files with the same name as two lines', async () => {
    const result = await execute({
      ...shared,
      stepId: 'visible-items',
      state: [
        digestOf([
          {
            kind: 'document',
            roomId: sellerRoom,
            documentId: shownFile,
            isNewVersion: false,
          },
          {
            kind: 'document',
            roomId: sellerRoom,
            documentId: sameNameElsewhere,
            isNewVersion: false,
          },
        ]),
      ],
    });

    expect(result.outputs).toEqual({
      rooms: [
        expect.objectContaining({
          lines: ['New file: p-and-l.pdf', 'New file: p-and-l.pdf'],
        }),
      ],
    });
  });

  it('shows a file added and then updated within one day only as new', async () => {
    const result = await execute({
      ...shared,
      stepId: 'visible-items',
      state: [
        digestOf([
          {
            kind: 'document',
            roomId: sellerRoom,
            documentId: leaseFirst,
            isNewVersion: false,
          },
          {
            kind: 'document',
            roomId: sellerRoom,
            documentId: leaseSecond,
            isNewVersion: true,
          },
        ]),
      ],
    });

    expect(result.outputs).toEqual({
      rooms: [expect.objectContaining({ lines: ['New file: lease.pdf'] })],
    });
  });
});

describe('seller room notices', () => {
  function textOf(html: string | undefined) {
    return (html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  }

  it('emails the team that a seller asked to reopen a closed room', async () => {
    const result = await execute({
      workflowId: 'seller_room.access_requested',
      subscriberId: manager,
      payload: {
        email: 'sam@seller.test',
        dealName: 'Acme Tooling',
        dealPath: '/home/acme-capital/deals/deal-1',
      },
      stepId: 'email',
    });

    expect(result.outputs.subject).toBe(
      'sam@seller.test asked to reopen the seller room for Acme Tooling',
    );
    expect(textOf(result.outputs.body)).toContain(
      'sam@seller.test asked to reopen the seller room for Acme Tooling, which is closed. Reopen it from the deal to let them back in.',
    );
    expect(result.outputs.body).toContain(
      `href="${siteUrl}/home/acme-capital/deals/deal-1"`,
    );
  });

  it.each([
    {
      workflowId: 'seller_room.closed',
      subject: 'Acme Partners closed the seller room for Project Atlas',
      message:
        'Acme Partners closed the seller room for Acme Tooling. You can no longer open its files or questions.',
    },
    {
      workflowId: 'seller_room.reopened',
      subject: 'Acme Partners reopened the seller room for Project Atlas',
      message:
        'Acme Partners reopened the seller room for Acme Tooling. You can open it again.',
    },
  ])(
    'emails the sellers a short note for $workflowId',
    async ({ workflowId, subject, message }) => {
      const result = await execute({
        workflowId,
        subscriberId: seller,
        payload: {
          teamName: 'Acme Partners',
          dealName: 'Acme Tooling',
          outsideName: 'Project Atlas',
          roomPath: `/seller/rooms/${sellerRoom}`,
        },
        stepId: 'email',
      });

      expect(result.outputs.subject).toBe(subject);
      expect(textOf(result.outputs.body)).toContain(message);
      expect(result.outputs.body).toContain(
        `href="${siteUrl}/seller/rooms/${sellerRoom}"`,
      );
    },
  );
});
