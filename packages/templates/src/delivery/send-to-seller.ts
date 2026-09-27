import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from '@tuckin/supabase';
import { TASK_QUEUE, getTemporalClient } from '@tuckin/workflows/client';

import type { SharePermission } from '../types';

export interface SellerDeliveryStartInput {
  shareId: string;
  generatedDocumentId: string;
  recipientUserId: string;
  accountId: string;
  dealId: string;
  expiresAt: string | null;
}

export interface SellerDeliveryClient {
  startSellerDelivery(
    input: SellerDeliveryStartInput,
  ): Promise<{ workflowId: string }>;
}

export interface SendToSellerInput {
  generatedDocumentId: string;
  recipientUserId: string;
  permission: SharePermission;
  expiresAt: string | null;
}

export interface SendToSellerDeps {
  client: SupabaseClient<Database>;
  workflow: SellerDeliveryClient;
}

export function sellerDeliveryWorkflowId(shareId: string): string {
  return `seller-delivery-${shareId}`;
}

export async function sendToSeller(
  input: SendToSellerInput,
  deps: SendToSellerDeps,
): Promise<Tables<'document_share'>> {
  const generated = await loadGenerated(deps.client, input.generatedDocumentId);

  const { data: share, error } = await deps.client
    .from('document_share')
    .insert({
      account_id: generated.account_id,
      generated_document_id: input.generatedDocumentId,
      recipient_user_id: input.recipientUserId,
      permission: input.permission,
      sent_at: new Date().toISOString(),
      expires_at: input.expiresAt,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  const { workflowId } = await deps.workflow.startSellerDelivery({
    shareId: share.id,
    generatedDocumentId: input.generatedDocumentId,
    recipientUserId: input.recipientUserId,
    accountId: generated.account_id,
    dealId: generated.deal_id,
    expiresAt: input.expiresAt,
  });

  const { data: updated, error: updateError } = await deps.client
    .from('document_share')
    .update({ workflow_id: workflowId })
    .eq('id', share.id)
    .select('*')
    .single();

  if (updateError) {
    throw updateError;
  }

  return updated;
}

// Assumes a workflow registered as 'sellerDelivery' on the shared task queue in
// @tuckin/workflows; the email and reminder timers live there, not here.
export function createSellerDeliveryClient(): SellerDeliveryClient {
  return {
    async startSellerDelivery(input) {
      const client = await getTemporalClient();
      const workflowId = sellerDeliveryWorkflowId(input.shareId);

      await client.workflow.start('sellerDelivery', {
        taskQueue: TASK_QUEUE,
        workflowId,
        args: [input],
      });

      return { workflowId };
    },
  };
}

async function loadGenerated(
  client: SupabaseClient<Database>,
  id: string,
): Promise<Pick<Tables<'generated_document'>, 'account_id' | 'deal_id'>> {
  const { data, error } = await client
    .from('generated_document')
    .select('account_id, deal_id')
    .eq('id', id)
    .single();

  if (error) {
    throw error;
  }

  return data;
}
