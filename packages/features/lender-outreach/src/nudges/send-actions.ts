'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { refuseUnlessDealTeam } from '../refuse-unless-deal-team';
import {
  MailboxSendFailed,
  loadTeamMailbox,
  sendAndRecordOutreach,
} from '../send-and-record';
import { loadNudgeTargets } from './load-nudge-targets';

export const sendLenderNudge = refusableAction(
  async (input, user) => {
    await refuseUnlessDealTeam(input.accountId, user.id);
    const client = getSupabaseServerClient();

    const connection = await loadTeamMailbox(client, input.accountId);

    if (!connection) {
      throw new Refusal(
        'Connect your team mailbox before sending. Drafts still work without it.',
      );
    }

    const { targets } = await loadNudgeTargets(client, input.accountId);
    const target = targets.find(
      (candidate) => candidate.lenderId === input.lenderId,
    );

    if (!target) {
      throw new Refusal("This lender isn't due a nudge anymore.");
    }

    try {
      await sendAndRecordOutreach(client, {
        kind: 'nudge',
        accountId: input.accountId,
        sentBy: user.id,
        roomIds: target.roomIds,
        connection,
        email: {
          to: target.contact.email,
          subject: input.subject,
          body: input.body,
          inThread: target.thread.id,
        },
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
      accountId: z.uuid(),
      lenderId: z.uuid(),
      subject: z.string(),
      body: z.string(),
    }),
  },
);
