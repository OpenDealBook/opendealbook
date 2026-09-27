import type { SupabaseClient } from '@supabase/supabase-js';

import { describe, expect, it, vi } from 'vitest';

import type { Database } from '@tuckin/supabase';

vi.mock('@tuckin/workflows/client', () => ({
  TASK_QUEUE: 'opendealbook',
  getTemporalClient: vi.fn(),
}));

import {
  type SellerDeliveryClient,
  sellerDeliveryWorkflowId,
  sendToSeller,
} from './send-to-seller';

function makeClient(queue: Array<{ data: unknown; error: unknown }>) {
  const update = vi.fn(() => builder);
  const insert = vi.fn(() => builder);
  const builder = {
    select: () => builder,
    insert,
    update,
    eq: () => builder,
    single: vi.fn(async () => queue.shift()),
  };

  const client = {
    from: vi.fn(() => builder),
  } as unknown as SupabaseClient<Database>;

  return { client, insert, update };
}

describe('sendToSeller', () => {
  it('creates the share, starts the workflow and stores the workflow id', async () => {
    const { client, insert, update } = makeClient([
      { data: { account_id: 'acc-1', deal_id: 'deal-1' }, error: null },
      { data: { id: 'share-1' }, error: null },
      {
        data: { id: 'share-1', workflow_id: 'seller-delivery-share-1' },
        error: null,
      },
    ]);

    const workflow: SellerDeliveryClient = {
      startSellerDelivery: vi.fn(async () => ({
        workflowId: 'seller-delivery-share-1',
      })),
    };

    const result = await sendToSeller(
      {
        generatedDocumentId: 'gen-1',
        recipientUserId: 'seller-1',
        permission: 'view',
        expiresAt: null,
      },
      { client, workflow },
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: 'acc-1',
        generated_document_id: 'gen-1',
        recipient_user_id: 'seller-1',
        permission: 'view',
      }),
    );
    expect(workflow.startSellerDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        shareId: 'share-1',
        accountId: 'acc-1',
        dealId: 'deal-1',
      }),
    );
    expect(update).toHaveBeenCalledWith({
      workflow_id: 'seller-delivery-share-1',
    });
    expect(result.workflow_id).toBe('seller-delivery-share-1');
  });
});

describe('sellerDeliveryWorkflowId', () => {
  it('derives a stable id from the share id', () => {
    expect(sellerDeliveryWorkflowId('share-1')).toBe('seller-delivery-share-1');
  });
});
