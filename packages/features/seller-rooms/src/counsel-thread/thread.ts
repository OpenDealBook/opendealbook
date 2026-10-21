'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { uploadRefusal } from '@odb/lender-rooms/uploads/allowed.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  MAX_MESSAGE_FILES,
  MAX_MESSAGE_LENGTH,
  MESSAGE_TOO_LONG,
  threadFileName,
  TOO_MANY_FILES,
} from './files';

export const postSellerCounselMessage = refusableAction(
  async (input): Promise<void> => {
    const client = getSupabaseServerClient();
    const { data: readOnlyReason } = await client
      .rpc('seller_side_read_only_reason', { deal_id: input.dealId })
      .throwOnError();
    const refusal =
      input.files
        .map(({ path, size }) =>
          uploadRefusal({ name: threadFileName(path), size }),
        )
        .find(Boolean) ?? readOnlyReason;

    if (refusal) {
      throw new Refusal(refusal);
    }

    const { data: messageId } = await client
      .rpc('post_seller_counsel_message', {
        deal_id: input.dealId,
        body: input.body,
        files: input.files.map(({ path }) => ({ path })),
      })
      .throwOnError();

    // Service role: the seller side cannot write deal history. The post above
    // proved the caller is on the seller side of this deal.
    await getSupabaseServerAdminClient()
      .rpc('append_deal_event', {
        p_deal_id: input.dealId,
        p_aggregate_type: 'seller_counsel_message',
        p_aggregate_id: messageId,
        p_event_type: 'seller_counsel_message.posted',
        p_actor_kind: 'service',
      })
      .throwOnError();
  },
  {
    schema: z
      .object({
        dealId: z.uuid(),
        body: z.string().trim().max(MAX_MESSAGE_LENGTH, MESSAGE_TOO_LONG),
        files: z
          .array(z.object({ path: z.string(), size: z.number() }))
          .max(MAX_MESSAGE_FILES, TOO_MANY_FILES),
      })
      .refine((input) => input.body !== '' || input.files.length > 0, {
        message: 'Write a message or attach a file first.',
      }),
  },
);
