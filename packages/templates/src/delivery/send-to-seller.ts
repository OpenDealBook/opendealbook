import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import { sellerRoomPath } from '@odb/seller-rooms/members/entry-rules.ts';
import { findOrCreateSeller } from '@odb/seller-rooms/members/find-or-create-seller.ts';
import type { Database, Tables } from '@odb/supabase';
import { TASK_QUEUE, getTemporalClient } from '@odb/workflows/client';

import { convertDocxToPdf } from '../generation/convert-pdf';
import { GENERATED_BUCKET, generatedPdfPath } from '../storage';
import { sharePermissionSchema } from '../types';

export interface SellerDeliveryStartInput {
  shareId: string;
  accountId: string;
  dealId: string;
  senderUserId: string;
  recipientEmail: string;
  recipientName: string;
  documentUrl: string;
}

export interface SellerSendProblem {
  accountId: string;
  dealId: string;
  senderUserId: string;
  message: string;
}

export interface SellerDeliveryClient {
  startSellerDelivery(
    input: SellerDeliveryStartInput,
  ): Promise<{ workflowId: string }>;
  reportSellerSendProblem(problem: SellerSendProblem): Promise<void>;
}

export const sendToSellerInputSchema = z.object({
  generatedDocumentId: z.string(),
  recipientName: z.string().trim().min(1).max(200),
  recipientEmail: z.email().toLowerCase(),
  permission: sharePermissionSchema,
});

export type SendToSellerInput = z.infer<typeof sendToSellerInputSchema>;

export interface SendToSellerDeps {
  client: SupabaseClient<Database>;
  admin: SupabaseClient<Database>;
  workflow: SellerDeliveryClient;
  siteOrigin: string;
  senderUserId: string;
  sellerFromEmail: string | undefined;
}

export type SendToSellerRefusal =
  | { reason: 'sender-not-set-up' }
  | { reason: 'team-locked' }
  | { reason: 'sending-off' }
  | { reason: 'limit'; sent: number; retryAfter: string };

export type SendToSellerResult =
  | { kind: 'sent'; share: Tables<'document_share'> }
  | ({ kind: 'refused' } & SendToSellerRefusal);

export function sellerDeliveryWorkflowId(shareId: string): string {
  return `seller-delivery-${shareId}`;
}

export function sellerDocumentPath(shareId: string): string {
  return `/seller/documents/${shareId}`;
}

export async function sendToSeller(
  input: SendToSellerInput,
  deps: SendToSellerDeps,
): Promise<SendToSellerResult> {
  if (!deps.sellerFromEmail) {
    return { kind: 'refused', reason: 'sender-not-set-up' };
  }

  const generated = await loadGenerated(deps.client, input.generatedDocumentId);

  const { data: locked } = await deps.client
    .rpc('is_account_locked', { target_account_id: generated.account_id })
    .throwOnError();

  if (locked) {
    return { kind: 'refused', reason: 'team-locked' };
  }

  const limitRefusal = await checkSendLimit(deps.client, generated.account_id);

  if (limitRefusal) {
    await deps.workflow.reportSellerSendProblem({
      accountId: generated.account_id,
      dealId: generated.deal_id,
      senderUserId: deps.senderUserId,
      message: limitRefusalNotice(limitRefusal),
    });

    return { kind: 'refused', ...limitRefusal };
  }

  if (!generated.pdf_path) {
    await storePdf(deps.client, generated);
  }

  const recipientUserId = await findOrCreateSeller(
    deps.admin,
    input.recipientEmail,
  );

  const { data: roomId } = await deps.client
    .rpc('ensure_seller_room', { deal_id: generated.deal_id })
    .throwOnError();

  await deps.client
    .from('seller_room_member')
    .upsert(
      {
        room_id: roomId,
        user_id: recipientUserId,
        email: input.recipientEmail,
        name: input.recipientName,
        invited_by: deps.senderUserId,
      },
      { onConflict: 'room_id,user_id', ignoreDuplicates: true },
    )
    .throwOnError();

  const { data: share, error } = await deps.client
    .from('document_share')
    .insert({
      room_id: roomId,
      account_id: generated.account_id,
      generated_document_id: input.generatedDocumentId,
      recipient_user_id: recipientUserId,
      permission: input.permission,
      sent_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  const workflowId = await startDelivery(deps, input, {
    shareId: share.id,
    roomId,
    accountId: generated.account_id,
    dealId: generated.deal_id,
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

  return { kind: 'sent', share: updated };
}

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
    async reportSellerSendProblem(problem) {
      const client = await getTemporalClient();

      await client.workflow.start('sellerSendProblem', {
        taskQueue: TASK_QUEUE,
        workflowId: `seller-send-problem-${crypto.randomUUID()}`,
        args: [problem],
      });
    },
  };
}

type LimitRefusal = Exclude<
  SendToSellerRefusal,
  { reason: 'sender-not-set-up' } | { reason: 'team-locked' }
>;

async function checkSendLimit(
  client: SupabaseClient<Database>,
  accountId: string,
): Promise<LimitRefusal | null> {
  const { data } = await client
    .rpc('seller_send_allowance', { p_account_id: accountId })
    .single()
    .throwOnError();

  if (data.daily_limit === 0) {
    return { reason: 'sending-off' };
  }

  if (data.sent >= data.daily_limit) {
    return { reason: 'limit', sent: data.sent, retryAfter: data.retry_after };
  }

  return null;
}

function limitRefusalNotice(refusal: LimitRefusal): string {
  if (refusal.reason === 'sending-off') {
    return 'Sending to sellers is turned off for this team.';
  }

  const retryAt = new Date(refusal.retryAfter)
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ');

  return `This team has sent ${refusal.sent} documents to sellers in the last 24 hours. Try again after ${retryAt} UTC.`;
}

async function startDelivery(
  deps: SendToSellerDeps,
  input: SendToSellerInput,
  {
    shareId,
    roomId,
    accountId,
    dealId,
  }: { shareId: string; roomId: string; accountId: string; dealId: string },
): Promise<string> {
  try {
    const { workflowId } = await deps.workflow.startSellerDelivery({
      shareId,
      accountId,
      dealId,
      senderUserId: deps.senderUserId,
      recipientEmail: input.recipientEmail,
      recipientName: input.recipientName,
      documentUrl: `${deps.siteOrigin}${sellerRoomPath(roomId)}`,
    });

    return workflowId;
  } catch (error) {
    await deps.client
      .from('document_share')
      .delete()
      .eq('id', shareId)
      .throwOnError();

    throw error;
  }
}

type GeneratedForDelivery = Pick<
  Tables<'generated_document'>,
  'id' | 'account_id' | 'deal_id' | 'docx_path' | 'pdf_path'
>;

async function loadGenerated(
  client: SupabaseClient<Database>,
  id: string,
): Promise<GeneratedForDelivery> {
  const { data, error } = await client
    .from('generated_document')
    .select('id, account_id, deal_id, docx_path, pdf_path')
    .eq('id', id)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function storePdf(
  client: SupabaseClient<Database>,
  generated: GeneratedForDelivery,
): Promise<void> {
  const bucket = client.storage.from(GENERATED_BUCKET);

  const { data: docx, error: downloadError } = await bucket.download(
    generated.docx_path!,
  );

  if (downloadError) {
    throw downloadError;
  }

  const pdf = await convertDocxToPdf(new Uint8Array(await docx.arrayBuffer()));
  const pdfPath = generatedPdfPath(
    generated.account_id,
    generated.deal_id,
    crypto.randomUUID(),
  );

  const { error: uploadError } = await bucket.upload(pdfPath, pdf, {
    contentType: 'application/pdf',
    upsert: true,
  });

  if (uploadError) {
    throw uploadError;
  }

  await client
    .from('generated_document')
    .update({ pdf_path: pdfPath })
    .eq('id', generated.id)
    .throwOnError();
}
