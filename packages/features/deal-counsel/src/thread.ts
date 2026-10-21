'use server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import { dealManagerIds } from '@odb/lender-rooms/actions/deal-manager-ids.ts';
import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { TEAM_READ_ONLY } from '@odb/next';
import {
  COUNSEL_MESSAGE_WORKFLOW_ID,
  teamItemPath,
} from '@odb/notifications/relay';
import {
  createNovuClient,
  triggerNotification,
} from '@odb/notifications/server';
import { getLogger } from '@odb/shared/logger';
import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import type { CounselSide } from './portal-gate';

const NOT_ALLOWED = 'You cannot message on this deal.';
const NOT_A_MANAGER = 'Only deal managers can message counsel.';

const SIDE_LABEL = { buyer: "buyer's counsel", seller: "seller's counsel" };

type Client = SupabaseClient<Database>;

async function teamStanding(
  client: Client,
  dealId: string,
): Promise<{ accountId: string; block: string | null } | null> {
  const { data: deal } = await client
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .maybeSingle()
    .throwOnError();

  if (!deal) {
    return null;
  }

  const [{ data: manages }, { data: locked }] = await Promise.all([
    client
      .rpc('manages_deal_in_account', {
        deal_id: dealId,
        account_id: deal.account_id,
      })
      .throwOnError(),
    client
      .rpc('is_account_locked', { target_account_id: deal.account_id })
      .throwOnError(),
  ]);

  return {
    accountId: deal.account_id,
    block: !manages ? NOT_A_MANAGER : locked ? TEAM_READ_ONLY : null,
  };
}

// A Novu outage must not fail the post: the message is already stored.
async function emailAboutMessage(
  admin: Client,
  messageId: string,
  audience: 'team' | 'counsel',
  recipients: { userId: string; email: string | null }[],
): Promise<void> {
  if (!process.env.NOVU_API_KEY || !process.env.NOVU_API_URL) {
    return;
  }

  try {
    const novu = createNovuClient();

    await Promise.all(
      recipients.map((recipient) =>
        triggerNotification(
          { novu, client: admin },
          {
            eventType: COUNSEL_MESSAGE_WORKFLOW_ID,
            recipientUserId: recipient.userId,
            payload: { messageId, audience },
            email: recipient.email ?? undefined,
          },
        ),
      ),
    );
  } catch (error) {
    getLogger().error(
      { err: error, messageId },
      'Counsel message email failed',
    );
  }
}

async function notifyTeamOfCounselMessage(
  admin: Client,
  dealId: string,
  side: CounselSide,
  messageId: string,
): Promise<void> {
  const { data: deal } = await admin
    .from('deal')
    .select(
      'account_id, owner_user_id, firm!inner(name), accounts!deal_account_id_fkey(slug)',
    )
    .eq('id', dealId)
    .single()
    .throwOnError();

  const recipients = new Set([
    ...(deal.owner_user_id ? [deal.owner_user_id] : []),
    ...(await dealManagerIds(admin, deal.account_id)),
  ]);

  await admin
    .from('notifications')
    .insert(
      [...recipients].map((recipientUserId) => ({
        account_id: deal.account_id,
        recipient_user_id: recipientUserId,
        deal_id: dealId,
        type: 'info' as const,
        body: `New message from ${SIDE_LABEL[side]} on ${deal.firm.name}.`,
        link: teamItemPath(z.string().parse(deal.accounts.slug), dealId, {
          kind: 'counsel-message',
          id: messageId,
        }),
      })),
    )
    .throwOnError();

  const { data: personalAccounts } = await admin
    .from('accounts')
    .select('primary_owner_user_id, email')
    .eq('is_personal_account', true)
    .in('primary_owner_user_id', [...recipients])
    .throwOnError();

  await emailAboutMessage(
    admin,
    messageId,
    'team',
    personalAccounts.map((account) => ({
      userId: account.primary_owner_user_id,
      email: account.email,
    })),
  );
}

async function emailCounselOfTeamMessage(
  dealId: string,
  side: CounselSide,
  messageId: string,
): Promise<void> {
  // Service role: delivery reads each recipient's own notification
  // preferences. The caller was proven to manage this deal.
  const admin = getSupabaseServerAdminClient();
  const { data: counsel } = await admin
    .from('deal_counsel')
    .select('user_id, email, deal!inner(id)')
    .eq('deal_id', dealId)
    .eq('side', side)
    .is('deal.archived_at', null)
    .is('deal.resolution', null)
    .throwOnError();

  await emailAboutMessage(
    admin,
    messageId,
    'counsel',
    counsel.map((row) => ({ userId: row.user_id, email: row.email })),
  );
}

export const postCounselMessage = refusableAction(
  async (input, user) => {
    const client = getSupabaseServerClient();
    const message = {
      id: crypto.randomUUID(),
      deal_id: input.dealId,
      side: input.side,
      author_user_id: user.id,
      body: input.body,
    };

    const team = await teamStanding(client, input.dealId);

    // A team member who cannot post for the team may still be counsel.
    if (team && team.block !== NOT_A_MANAGER) {
      if (team.block) {
        throw new Refusal(team.block);
      }

      await client
        .from('counsel_message')
        .insert({ ...message, account_id: team.accountId })
        .throwOnError();

      await emailCounselOfTeamMessage(input.dealId, input.side, message.id);

      return;
    }

    const { data: isCounsel } = await client
      .rpc('is_deal_counsel', { deal_id: input.dealId, side: input.side })
      .throwOnError();

    if (!isCounsel) {
      throw new Refusal(NOT_ALLOWED);
    }

    // Service role: counsel have no insert grant and cannot read the deal.
    // is_deal_counsel proved the caller is counsel on this side of an open deal.
    const admin = getSupabaseServerAdminClient();
    const { data: deal } = await admin
      .from('deal')
      .select('account_id')
      .eq('id', input.dealId)
      .single()
      .throwOnError();

    await admin
      .from('counsel_message')
      .insert({ ...message, account_id: deal.account_id })
      .throwOnError();

    await notifyTeamOfCounselMessage(
      admin,
      input.dealId,
      input.side,
      message.id,
    );
  },
  {
    schema: z.object({
      dealId: z.uuid(),
      side: z.enum(['buyer', 'seller']),
      body: z.string().trim().min(1, 'Write a message first.'),
    }),
  },
);

export async function teamPostingBlock(dealId: string): Promise<string | null> {
  const standing = await teamStanding(getSupabaseServerClient(), dealId);

  return standing!.block;
}

export async function loadCounselThread(dealId: string, side: CounselSide) {
  const { data } = await getSupabaseServerClient()
    .rpc('counsel_thread', { deal_id: dealId, side })
    .throwOnError();

  return data;
}
