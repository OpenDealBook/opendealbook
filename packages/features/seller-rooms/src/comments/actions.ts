'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';

export const postSellerRoomComment = refusableAction(
  async (input): Promise<void> => {
    const client = getSupabaseServerClient();
    const { data: room } = await client
      .from('seller_room')
      .select('deal_id, account_id')
      .eq('id', input.roomId)
      .single()
      .throwOnError();
    const { data: readOnlyReason } = await client
      .rpc('seller_side_read_only_reason', { deal_id: room.deal_id })
      .throwOnError();

    if (readOnlyReason) {
      throw new Refusal(readOnlyReason);
    }

    await client
      .from('seller_room_comment')
      .insert({
        room_id: input.roomId,
        account_id: room.account_id,
        body: input.body,
        ...input.subject,
      })
      .throwOnError();
  },
  {
    schema: z.object({
      roomId: z.uuid(),
      subject: z.union([
        z.object({ dr_document_id: z.uuid() }),
        z.object({ question_id: z.uuid() }),
      ]),
      body: z.string().trim().min(1, 'Write a comment first.'),
    }),
  },
);
