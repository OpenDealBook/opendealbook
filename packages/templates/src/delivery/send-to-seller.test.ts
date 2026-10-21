import type { SupabaseClient } from '@supabase/supabase-js';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';

vi.mock('@odb/workflows/client', () => ({
  TASK_QUEUE: 'opendealbook',
  getTemporalClient: vi.fn(),
}));

const gotenberg = vi.hoisted(() => ({
  convertDocxToPdf: vi.fn(async () =>
    new TextEncoder().encode('%PDF converted'),
  ),
}));

vi.mock('../generation/convert-pdf', () => gotenberg);

import {
  type SellerDeliveryClient,
  sellerDeliveryWorkflowId,
  sendToSeller,
  sendToSellerInputSchema,
} from './send-to-seller';

type Result = { data: unknown; error: unknown };

interface Recorded {
  events: string[];
  writes: {
    table: string;
    kind: 'insert' | 'update' | 'delete';
    values: unknown;
  }[];
  uploads: { bucket: string; path: string; bytes: Uint8Array }[];
  createdUsers: unknown[];
}

function fakeSupabase(
  results: Record<string, Result[]>,
  recorded: Recorded,
  createUserError: Error | null = null,
) {
  function builder(table: string) {
    const next = async () => results[table]!.shift()!;
    const chain = {
      select: () => chain,
      eq: () => chain,
      upsert: (values: unknown) => {
        recorded.writes.push({ table, kind: 'insert', values });
        recorded.events.push(`insert ${table}`);
        return chain;
      },
      insert: (values: unknown) => {
        recorded.writes.push({ table, kind: 'insert', values });
        recorded.events.push(`insert ${table}`);
        return chain;
      },
      delete: () => {
        recorded.writes.push({ table, kind: 'delete', values: null });
        recorded.events.push(`delete ${table}`);
        return chain;
      },
      update: (values: unknown) => {
        recorded.writes.push({ table, kind: 'update', values });
        recorded.events.push(`update ${table}`);
        return chain;
      },
      single: () => chain,
      maybeSingle: () => chain,
      throwOnError: () => chain,
      then: (resolve: (value: Result) => unknown) => next().then(resolve),
    };
    return chain;
  }

  return {
    from: (table: string) => builder(table),
    rpc: (name: string) => builder(`rpc:${name}`),
    storage: {
      from: (bucket: string) => ({
        download: async () => ({
          data: new Blob([new TextEncoder().encode('docx bytes')]),
          error: null,
        }),
        upload: async (path: string, bytes: Uint8Array) => {
          recorded.uploads.push({ bucket, path, bytes });
          recorded.events.push(`upload ${bucket}`);
          return { data: { path }, error: null };
        },
      }),
    },
    auth: {
      admin: {
        createUser: async (attributes: unknown) => {
          recorded.createdUsers.push(attributes);
          return createUserError
            ? { data: { user: null }, error: createUserError }
            : { data: { user: { id: 'created-seller' } }, error: null };
        },
      },
    },
  } as unknown as SupabaseClient<Database>;
}

const input = {
  generatedDocumentId: 'gen-1',
  recipientName: 'Sam Seller',
  recipientEmail: 'sam@seller.test',
  permission: 'view' as const,
};

function generatedRow(pdfPath: string | null): Result {
  return {
    data: {
      account_id: 'acc-1',
      deal_id: 'deal-1',
      docx_path: 'acc-1/deal-1/key.docx',
      pdf_path: pdfPath,
    },
    error: null,
  };
}

let recorded: Recorded;
let workflow: SellerDeliveryClient;
let locked: boolean;
let allowance: {
  daily_limit: number;
  sent: number;
  retry_after: string | null;
};

beforeEach(() => {
  recorded = { events: [], writes: [], uploads: [], createdUsers: [] };
  gotenberg.convertDocxToPdf.mockClear();
  locked = false;
  allowance = { daily_limit: 50, sent: 3, retry_after: null };
  workflow = {
    reportSellerSendProblem: vi.fn(async () => {}),
    startSellerDelivery: vi.fn(async () => {
      recorded.events.push('start delivery');
      return { workflowId: 'seller-delivery-share-1' };
    }),
  };
});

function sellerLookup(userId: string | null): Result {
  return {
    data: userId ? { primary_owner_user_id: userId } : null,
    error: null,
  };
}

function run(
  generated: Result,
  existingSeller: string | null,
  extraGeneratedResults: Result[] = [],
  concurrent?: { createUserError: Error; sellerAfterRace: string | null },
  senderUnset = false,
) {
  const client = fakeSupabase(
    {
      generated_document: [generated, ...extraGeneratedResults],
      'rpc:is_account_locked': [{ data: locked, error: null }],
      'rpc:seller_send_allowance': [{ data: allowance, error: null }],
      'rpc:ensure_seller_room': [{ data: 'room-1', error: null }],
      seller_room_member: [{ data: null, error: null }],
      document_share: [
        { data: { id: 'share-1' }, error: null },
        {
          data: { id: 'share-1', workflow_id: 'seller-delivery-share-1' },
          error: null,
        },
      ],
    },
    recorded,
  );
  const admin = fakeSupabase(
    {
      accounts: concurrent
        ? [sellerLookup(null), sellerLookup(concurrent.sellerAfterRace)]
        : [sellerLookup(existingSeller)],
    },
    recorded,
    concurrent?.createUserError ?? null,
  );

  return sendToSeller(input, {
    client,
    admin,
    workflow,
    siteOrigin: 'https://app.odb.test',
    senderUserId: 'broker-1',
    sellerFromEmail: senderUnset ? undefined : 'Deals <deals@odb.test>',
  });
}

function shareInsert() {
  return recorded.writes.find(
    (write) => write.table === 'document_share' && write.kind === 'insert',
  )?.values;
}

describe('sendToSeller', () => {
  it('shares with the seller found by email and starts delivery with the document link', async () => {
    const result = await run(generatedRow('acc-1/deal-1/key.pdf'), 'seller-1');

    expect(shareInsert()).toEqual(
      expect.objectContaining({
        account_id: 'acc-1',
        generated_document_id: 'gen-1',
        recipient_user_id: 'seller-1',
        permission: 'view',
      }),
    );
    expect(recorded.createdUsers).toEqual([]);
    expect(workflow.startSellerDelivery).toHaveBeenCalledWith({
      shareId: 'share-1',
      accountId: 'acc-1',
      dealId: 'deal-1',
      senderUserId: 'broker-1',
      recipientEmail: 'sam@seller.test',
      recipientName: 'Sam Seller',
      documentUrl: 'https://app.odb.test/seller/rooms/room-1',
    });
    expect(result).toEqual({
      kind: 'sent',
      share: { id: 'share-1', workflow_id: 'seller-delivery-share-1' },
    });
  });

  it('refuses and queues nothing when seller email is not set up', async () => {
    const result = await run(
      generatedRow('acc-1/deal-1/key.pdf'),
      'seller-1',
      [],
      undefined,
      true,
    );

    expect(result).toEqual({ kind: 'refused', reason: 'sender-not-set-up' });
    expect(recorded.writes).toEqual([]);
    expect(recorded.uploads).toEqual([]);
    expect(recorded.createdUsers).toEqual([]);
    expect(workflow.startSellerDelivery).not.toHaveBeenCalled();
  });

  it('refuses up front when the team is read-only for billing', async () => {
    locked = true;

    const result = await run(generatedRow(null), 'seller-1');

    expect(result).toEqual({ kind: 'refused', reason: 'team-locked' });
    expect(recorded.writes).toEqual([]);
    expect(recorded.uploads).toEqual([]);
    expect(recorded.createdUsers).toEqual([]);
    expect(workflow.startSellerDelivery).not.toHaveBeenCalled();
    expect(workflow.reportSellerSendProblem).not.toHaveBeenCalled();
  });

  it('refuses at the daily limit, queues nothing, and tells the team', async () => {
    allowance = {
      daily_limit: 10,
      sent: 10,
      retry_after: '2026-10-16T14:05:00+00:00',
    };

    const result = await run(generatedRow(null), 'seller-1');

    expect(result).toEqual({
      kind: 'refused',
      reason: 'limit',
      sent: 10,
      retryAfter: '2026-10-16T14:05:00+00:00',
    });
    expect(recorded.writes).toEqual([]);
    expect(recorded.uploads).toEqual([]);
    expect(gotenberg.convertDocxToPdf).not.toHaveBeenCalled();
    expect(workflow.startSellerDelivery).not.toHaveBeenCalled();
    expect(workflow.reportSellerSendProblem).toHaveBeenCalledWith({
      accountId: 'acc-1',
      dealId: 'deal-1',
      senderUserId: 'broker-1',
      message:
        'This team has sent 10 documents to sellers in the last 24 hours. Try again after 2026-10-16 14:05 UTC.',
    });
  });

  it('refuses when sending to sellers is turned off for the team', async () => {
    allowance = { daily_limit: 0, sent: 0, retry_after: null };

    const result = await run(generatedRow('acc-1/deal-1/key.pdf'), 'seller-1');

    expect(result).toEqual({ kind: 'refused', reason: 'sending-off' });
    expect(recorded.writes).toEqual([]);
    expect(workflow.reportSellerSendProblem).toHaveBeenCalledWith({
      accountId: 'acc-1',
      dealId: 'deal-1',
      senderUserId: 'broker-1',
      message: 'Sending to sellers is turned off for this team.',
    });
  });

  it('removes the new share when delivery cannot be started', async () => {
    workflow.startSellerDelivery = vi.fn(async () => {
      throw new Error('temporal unavailable');
    });

    await expect(
      run(generatedRow('acc-1/deal-1/key.pdf'), 'seller-1'),
    ).rejects.toThrow('temporal unavailable');

    expect(
      recorded.writes.filter((write) => write.table === 'document_share'),
    ).toEqual([
      expect.objectContaining({ kind: 'insert' }),
      { table: 'document_share', kind: 'delete', values: null },
    ]);
  });

  it('records no expiry on the share', async () => {
    await run(generatedRow('acc-1/deal-1/key.pdf'), 'seller-1');

    expect(shareInsert()).not.toHaveProperty('expires_at');
  });

  it('drops the document into the deal seller room and adds the seller to it', async () => {
    await run(generatedRow('acc-1/deal-1/key.pdf'), 'seller-1');

    expect(shareInsert()).toEqual(
      expect.objectContaining({ room_id: 'room-1' }),
    );
    expect(
      recorded.writes.find((write) => write.table === 'seller_room_member'),
    ).toEqual({
      table: 'seller_room_member',
      kind: 'insert',
      values: {
        room_id: 'room-1',
        user_id: 'seller-1',
        email: 'sam@seller.test',
        name: 'Sam Seller',
        invited_by: 'broker-1',
      },
    });
  });

  it('creates the seller user when no one has the email yet', async () => {
    await run(generatedRow('acc-1/deal-1/key.pdf'), null);

    expect(recorded.createdUsers).toEqual([
      { email: 'sam@seller.test', email_confirm: true },
    ]);
    expect(shareInsert()).toEqual(
      expect.objectContaining({ recipient_user_id: 'created-seller' }),
    );
  });

  it('uses the seller another request created at the same moment', async () => {
    await run(generatedRow('acc-1/deal-1/key.pdf'), null, [], {
      createUserError: new Error('already registered'),
      sellerAfterRace: 'raced-seller',
    });

    expect(shareInsert()).toEqual(
      expect.objectContaining({ recipient_user_id: 'raced-seller' }),
    );
  });

  it('fails without sharing when the seller cannot be created or found', async () => {
    await expect(
      run(generatedRow('acc-1/deal-1/key.pdf'), null, [], {
        createUserError: new Error('signups disabled'),
        sellerAfterRace: null,
      }),
    ).rejects.toThrow('signups disabled');

    expect(shareInsert()).toBeUndefined();
  });

  it('converts the docx and stores the PDF before delivery when the document has none', async () => {
    await run(generatedRow(null), 'seller-1', [{ data: null, error: null }]);

    expect(recorded.uploads).toEqual([
      {
        bucket: 'generated',
        path: expect.stringMatching(/^acc-1\/deal-1\/[0-9a-f-]+\.pdf$/),
        bytes: new TextEncoder().encode('%PDF converted'),
      },
    ]);
    expect(recorded.writes).toContainEqual({
      table: 'generated_document',
      kind: 'update',
      values: { pdf_path: recorded.uploads[0]!.path },
    });
    expect(recorded.events.indexOf('update generated_document')).toBeLessThan(
      recorded.events.indexOf('start delivery'),
    );
  });

  it('keeps the existing PDF when the document already has one', async () => {
    await run(generatedRow('acc-1/deal-1/key.pdf'), 'seller-1');

    expect(gotenberg.convertDocxToPdf).not.toHaveBeenCalled();
    expect(recorded.uploads).toEqual([]);
  });
});

describe('sendToSellerInputSchema', () => {
  const valid = {
    generatedDocumentId: 'gen-1',
    recipientName: 'Sam Seller',
    recipientEmail: 'Sam@Seller.test',
    permission: 'view',
  };

  it('accepts a seller name of 200 characters', () => {
    expect(
      sendToSellerInputSchema.safeParse({
        ...valid,
        recipientName: 'a'.repeat(200),
      }).success,
    ).toBe(true);
  });

  it('refuses a seller name longer than 200 characters', () => {
    expect(
      sendToSellerInputSchema.safeParse({
        ...valid,
        recipientName: 'a'.repeat(201),
      }).success,
    ).toBe(false);
  });
});

describe('sellerDeliveryWorkflowId', () => {
  it('derives a stable id from the share id', () => {
    expect(sellerDeliveryWorkflowId('share-1')).toBe('seller-delivery-share-1');
  });
});
