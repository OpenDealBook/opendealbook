'use server';

import { z } from 'zod';

import { loadDealPeople } from '@odb/deal-people/queries.ts';
import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { refuseWhileTeamLocked } from '@odb/lender-rooms/actions/team-lock.ts';
import {
  DEAL_UPDATE_SUBMITTED_WORKFLOW_ID,
  teamItemPath,
} from '@odb/notifications/relay';
import {
  createNovuClient,
  triggerNotification,
} from '@odb/notifications/server';
import { getLogger } from '@odb/shared/logger';
import { plainDate } from '@odb/shared/utils';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { belongsTo } from './groups';
import {
  createUpdateSchema,
  editUpdateSchema,
  submitUpdateSchema,
} from './schema';

async function refuseOnLockedTeam(row: 'deal' | 'deal_update', id: string) {
  const { data } = await getSupabaseServerClient()
    .from(row)
    .select('account_id')
    .eq('id', id)
    .single()
    .throwOnError();

  await refuseWhileTeamLocked(data.account_id);
}

export const createDealUpdate = refusableAction(
  async ({ dealId, subject, body, picks }) => {
    await refuseOnLockedTeam('deal', dealId);
    const { data: updateId } = await getSupabaseServerClient()
      .rpc('create_deal_update', { deal_id: dealId, subject, body, picks })
      .throwOnError();

    return updateId;
  },
  { schema: createUpdateSchema },
);

const timelineChangeSchema = z.object({
  dealId: z.uuid(),
  milestone: z.string(),
  from: z.iso.date().nullable(),
  to: z.iso.date().nullable(),
});

const outsideGroups = [
  'lenders',
  'sellers',
  'buyers_counsel',
  'sellers_counsel',
] as const;

function describeDateChange(
  milestone: string,
  from: string | null,
  to: string | null,
) {
  if (from === null) {
    return `${milestone} is now set for ${plainDate(to!)}.`;
  }

  if (to === null) {
    return `${milestone} (was ${plainDate(from)}) is no longer set.`;
  }

  return from === to
    ? `${milestone} is set for ${plainDate(to)}.`
    : `${milestone} moved from ${plainDate(from)} to ${plainDate(to)}.`;
}

export const draftTimelineUpdate = refusableAction(
  async ({ dealId, milestone, from, to }) => {
    const client = getSupabaseServerClient();
    const { data: deal } = await client
      .from('deal')
      .select('account_id')
      .eq('id', dealId)
      .single()
      .throwOnError();

    await refuseWhileTeamLocked(deal.account_id);
    const { people } = await loadDealPeople({
      dealId,
      accountId: deal.account_id,
    });
    const groups = outsideGroups.filter((group) =>
      people.some(
        (person) => person.email !== null && belongsTo(person, group),
      ),
    );
    const { data: updateId } = await client
      .rpc('create_deal_update', {
        deal_id: dealId,
        subject: `Timeline update: ${milestone}`,
        body: describeDateChange(milestone, from, to),
        picks: { groups, people: [] },
      })
      .throwOnError();

    return updateId;
  },
  { schema: timelineChangeSchema },
);

export const editDealUpdate = refusableAction(
  async ({ updateId, subject, body, picks }) => {
    await refuseOnLockedTeam('deal_update', updateId);
    await getSupabaseServerClient()
      .rpc('edit_deal_update', { update_id: updateId, subject, body, picks })
      .throwOnError();
  },
  { schema: editUpdateSchema },
);

type Admin = ReturnType<typeof getSupabaseServerAdminClient>;

// A Novu outage must not fail the submit: the update is already pending.
async function emailApprovers(
  admin: Admin,
  updateId: string,
  approverIds: string[],
) {
  if (!process.env.NOVU_API_KEY || !process.env.NOVU_API_URL) {
    return;
  }

  try {
    const { data: personalAccounts } = await admin
      .from('accounts')
      .select('primary_owner_user_id, email')
      .eq('is_personal_account', true)
      .in('primary_owner_user_id', approverIds)
      .throwOnError();
    const novu = createNovuClient();

    await Promise.all(
      personalAccounts.map((account) =>
        triggerNotification(
          { novu, client: admin },
          {
            eventType: DEAL_UPDATE_SUBMITTED_WORKFLOW_ID,
            recipientUserId: account.primary_owner_user_id,
            payload: { updateId },
            email: account.email ?? undefined,
          },
        ),
      ),
    );
  } catch (error) {
    getLogger().error(
      { err: error, updateId },
      'Deal update approver email failed',
    );
  }
}

async function noticeToApprovers(updateId: string, authorId: string) {
  const admin = getSupabaseServerAdminClient();
  const [{ data: update }, { data: author }] = await Promise.all([
    admin
      .from('deal_update')
      .select(
        'account_id, deal_id, subject, accounts(slug), deal(description, firm(name))',
      )
      .eq('id', updateId)
      .single()
      .throwOnError(),
    admin
      .from('accounts')
      .select('name')
      .eq('primary_owner_user_id', authorId)
      .eq('is_personal_account', true)
      .single()
      .throwOnError(),
  ]);
  const { data: members } = await admin
    .from('accounts_memberships')
    .select('user_id')
    .eq('account_id', update.account_id)
    .neq('user_id', authorId)
    .throwOnError();
  const approves = await Promise.all(
    members.map(async ({ user_id }) => {
      const { data } = await admin
        .rpc('has_permission', {
          user_id,
          account_id: update.account_id,
          permission_name: 'deal_updates.approve',
        })
        .throwOnError();

      return data;
    }),
  );
  const approverIds = members
    .filter((_, index) => approves[index])
    .map(({ user_id }) => user_id);
  const deal = update.deal.firm?.name ?? update.deal.description ?? 'your deal';

  await admin
    .from('notifications')
    .insert(
      approverIds.map((approverId) => ({
        account_id: update.account_id,
        recipient_user_id: approverId,
        deal_id: update.deal_id,
        type: 'info' as const,
        body: `${author.name} submitted an update on ${deal} for approval: ${update.subject}`,
        link: teamItemPath(
          z.string().parse(update.accounts.slug),
          update.deal_id,
          {
            kind: 'deal-update',
            id: updateId,
          },
        ),
      })),
    )
    .throwOnError();

  await emailApprovers(admin, updateId, approverIds);
}

export const submitDealUpdate = refusableAction(
  async ({ updateId }, user) => {
    await refuseOnLockedTeam('deal_update', updateId);
    await getSupabaseServerClient()
      .rpc('submit_deal_update', { update_id: updateId })
      .throwOnError();
    await noticeToApprovers(updateId, user.id);
  },
  { schema: submitUpdateSchema },
);
