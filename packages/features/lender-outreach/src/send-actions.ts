'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { refuseWhileTeamLocked } from '@odb/lender-rooms/actions/team-lock.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { longDate } from './draft-email';
import {
  MailboxSendFailed,
  loadTeamMailbox,
  sendAndRecordOutreach,
} from './send-and-record';

export const sendLenderOutreach = refusableAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    const { data: mayManage } = await client
      .rpc('can_manage_lender_room', { room_id: input.roomId })
      .throwOnError();

    if (!mayManage) {
      throw new Refusal('Only the deal team can do that');
    }

    const { data: room } = await client
      .from('lender_room')
      .select('account_id, lender_id')
      .eq('id', input.roomId)
      .single()
      .throwOnError();

    await refuseWhileTeamLocked(room.account_id);

    const connection = await loadTeamMailbox(client, room.account_id);

    if (!connection) {
      throw new Refusal(
        'Connect your team mailbox before sending. Drafts still work without it.',
      );
    }

    const { data: previous } = await client
      .from('lender_room_outreach')
      .select('sent_at')
      .eq('room_id', input.roomId)
      .eq('status', 'sent')
      .eq('kind', 'outreach')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .throwOnError();

    if (previous && !input.confirmResend) {
      throw new Refusal(
        `Already sent on ${longDate(previous.sent_at.slice(0, 10))}. Send again?`,
      );
    }

    const { data: lender } = await client
      .from('lender')
      .select('lender_contact(email, is_primary)')
      .eq('account_id', room.account_id)
      .eq('id', room.lender_id!)
      .single()
      .throwOnError();
    const to = lender.lender_contact.find((contact) => contact.is_primary)!
      .email!;

    try {
      await sendAndRecordOutreach(client, {
        kind: 'outreach',
        accountId: room.account_id,
        sentBy: user.id,
        roomIds: [input.roomId],
        connection,
        email: { to, subject: input.subject, body: input.body },
      });
    } catch (error) {
      if (error instanceof MailboxSendFailed) {
        throw new Refusal("Couldn't send from your mailbox. Try again.");
      }

      throw error;
    }
  },
  {
    auth: true,
    schema: z.object({
      roomId: z.uuid(),
      subject: z.string(),
      body: z.string(),
      confirmResend: z.boolean().optional(),
    }),
  },
);
