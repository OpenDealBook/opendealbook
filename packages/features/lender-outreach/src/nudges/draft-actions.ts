'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { refuseUnlessDealTeam } from '../refuse-unless-deal-team';
import { draftNudge } from './draft-nudge';
import { loadNudgeTargets } from './load-nudge-targets';

export const draftLenderNudges = refusableAction(
  async (input, user) => {
    await refuseUnlessDealTeam(input.accountId, user.id);
    const client = getSupabaseServerClient();

    const [{ targets, cannotDraft }, { data: sender }] = await Promise.all([
      loadNudgeTargets(client, input.accountId),
      client
        .from('accounts')
        .select('name')
        .eq('primary_owner_user_id', user.id)
        .eq('is_personal_account', true)
        .single()
        .throwOnError(),
    ]);

    return {
      drafts: targets.map((target) => ({
        lenderId: z.uuid().parse(target.lenderId),
        lenderName: target.lenderName,
        to: target.contact.email,
        subject: `Re: ${target.thread.subject}`,
        body: draftNudge({
          contactName: target.contact.name,
          ourName: sender.name,
          deals: target.deals,
        }),
      })),
      cannotDraft,
    };
  },
  { auth: true, schema: z.object({ accountId: z.uuid() }) },
);
