import { z } from 'zod';

import { dealManagerIds } from '@odb/lender-rooms/actions/deal-manager-ids.ts';
import { teamItemPath } from '@odb/notifications/relay';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { FIXED_MILESTONES } from './schema';

// The ledger row goes after the notices so a run that dies between the two
// loses nothing; the notices' dedupe keys keep the retry from repeating them.
export async function notifyOverdueMilestones(today: string): Promise<void> {
  const admin = getSupabaseServerAdminClient();

  const { data: overdue } = await admin
    .from('deal_milestone')
    .select(
      'id, account_id, deal_id, kind, label, target_on, deal!inner(owner_user_id, firm(name), accounts!deal_account_id_fkey(slug))',
    )
    .lt('target_on', today)
    .is('actual_on', null)
    .is('deal.archived_at', null)
    .is('deal.resolution', null)
    .throwOnError();

  const { data: sent } = await admin
    .from('deal_milestone_overdue_notice')
    .select('milestone_id, target_on')
    .in(
      'milestone_id',
      overdue.map((milestone) => milestone.id),
    )
    .throwOnError();
  const alreadySent = new Set(
    sent.map((notice) => `${notice.milestone_id}/${notice.target_on}`),
  );

  const lockedAccounts = new Set<string>();
  for (const accountId of new Set(overdue.map((m) => m.account_id))) {
    const { data: locked } = await admin
      .rpc('is_account_locked', { target_account_id: accountId })
      .throwOnError();

    if (locked) {
      lockedAccounts.add(accountId);
    }
  }

  for (const milestone of overdue) {
    if (
      alreadySent.has(`${milestone.id}/${milestone.target_on}`) ||
      lockedAccounts.has(milestone.account_id)
    ) {
      continue;
    }

    const { deal } = milestone;
    const { data: members } = await admin
      .from('accounts_memberships')
      .select('user_id')
      .eq('account_id', milestone.account_id)
      .throwOnError();
    const recipients = members.some(
      (member) => member.user_id === deal.owner_user_id,
    )
      ? [deal.owner_user_id!]
      : await dealManagerIds(admin, milestone.account_id);
    const name =
      milestone.kind === 'custom'
        ? milestone.label!
        : FIXED_MILESTONES[milestone.kind].label;
    const dealName = deal.firm.name;
    const dueOn = new Date(
      `${milestone.target_on}T00:00:00Z`,
    ).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });

    await admin
      .from('notifications')
      .upsert(
        recipients.map((recipientUserId) => ({
          account_id: milestone.account_id,
          recipient_user_id: recipientUserId,
          deal_id: milestone.deal_id,
          type: 'info' as const,
          body: `${name} on ${dealName} was due ${dueOn} and has no actual date.`,
          link: teamItemPath(
            z.string().parse(deal.accounts.slug),
            milestone.deal_id,
            { kind: 'milestone', id: milestone.id },
          ),
          dedupe_key: `milestone_overdue:${milestone.id}:${milestone.target_on}:${recipientUserId}`,
        })),
        { onConflict: 'dedupe_key', ignoreDuplicates: true },
      )
      .throwOnError();
    await admin
      .from('deal_milestone_overdue_notice')
      .insert({ milestone_id: milestone.id, target_on: milestone.target_on! })
      .throwOnError();
  }
}
