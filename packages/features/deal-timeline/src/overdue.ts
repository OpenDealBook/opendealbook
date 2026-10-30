import { z } from 'zod';

import { dealManagerIds } from '@odb/lender-rooms/actions/deal-manager-ids.ts';
import { teamItemPath } from '@odb/notifications/relay';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { FIXED_MILESTONES } from './schema';
import { teamDay } from './team-day';

const DAYS_OF_NOTICE = 7;
const PAGE_SIZE = 1000;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

async function everyPage<Row extends { id: string }>(
  page: (afterId: string) => PromiseLike<{ data: Row[] }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let afterId = NIL_UUID; ; ) {
    const { data } = await page(afterId);
    if (data.length === 0) {
      return rows;
    }
    rows.push(...data);
    afterId = data.at(-1)!.id;
  }
}

function daysAfter(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function lockedAccountIds(accountIds: string[]): Promise<Set<string>> {
  const admin = getSupabaseServerAdminClient();
  const locked = new Set<string>();
  for (const accountId of new Set(accountIds)) {
    const { data } = await admin
      .rpc('is_account_locked', { target_account_id: accountId })
      .throwOnError();

    if (data) {
      locked.add(accountId);
    }
  }

  return locked;
}

async function noticeRecipients(
  accountId: string,
  ownerUserId: string | null,
): Promise<string[]> {
  const admin = getSupabaseServerAdminClient();
  const { data: members } = await admin
    .from('accounts_memberships')
    .select('user_id')
    .eq('account_id', accountId)
    .throwOnError();

  return members.some((member) => member.user_id === ownerUserId)
    ? [ownerUserId!]
    : dealManagerIds(admin, accountId);
}

function mediumDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// The ledger row goes after the notices so a run that dies between the two
// loses nothing; the notices' dedupe keys keep the retry from repeating them.
export async function notifyOverdueMilestones(at: string): Promise<void> {
  const admin = getSupabaseServerAdminClient();
  const now = new Date(at);
  const today = teamDay(now, null);

  const overdue = await everyPage((afterId) =>
    admin
      .from('deal_milestone')
      .select(
        'id, account_id, deal_id, kind, label, target_on, deal!inner(owner_user_id, firm(name), accounts!deal_account_id_fkey(slug)), deal_milestone_overdue_notice(target_on)',
      )
      .lt('target_on', today)
      .neq('kind', 'exclusivity_end')
      .is('actual_on', null)
      .is('deal.archived_at', null)
      .is('deal.resolution', null)
      .gt('id', afterId)
      .order('id')
      .limit(PAGE_SIZE)
      .throwOnError(),
  );

  const lockedAccounts = await lockedAccountIds(
    overdue.map((m) => m.account_id),
  );

  for (const milestone of overdue) {
    if (
      milestone.deal_milestone_overdue_notice.some(
        (sent) => sent.target_on === milestone.target_on,
      ) ||
      lockedAccounts.has(milestone.account_id)
    ) {
      continue;
    }

    const { deal } = milestone;
    const recipients = await noticeRecipients(
      milestone.account_id,
      deal.owner_user_id,
    );
    const name =
      milestone.kind === 'custom'
        ? milestone.label!
        : FIXED_MILESTONES[milestone.kind].label;
    const dealName = deal.firm.name;
    const dueOn = mediumDate(milestone.target_on!);

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

  await notifyExclusivityEnd(now);
}

async function notifyExclusivityEnd(now: Date): Promise<void> {
  const admin = getSupabaseServerAdminClient();
  const utcToday = teamDay(now, null);

  const ends = await everyPage((afterId) =>
    admin
      .from('deal_milestone')
      .select(
        'id, account_id, deal_id, target_on, deal!inner(owner_user_id, firm(name), accounts!deal_account_id_fkey(slug, timezone)), deal_milestone_overdue_notice(target_on)',
      )
      .eq('kind', 'exclusivity_end')
      // A team's date is within a day of the UTC one.
      .gte('target_on', daysAfter(utcToday, -(DAYS_OF_NOTICE + 1)))
      .lte('target_on', daysAfter(utcToday, DAYS_OF_NOTICE + 1))
      .gt('id', afterId)
      .order('id')
      .limit(PAGE_SIZE)
      .throwOnError(),
  );

  const lockedAccounts = await lockedAccountIds(
    ends.map((end) => end.account_id),
  );

  for (const end of ends) {
    const targetOn = end.target_on!;
    const today = teamDay(now, end.deal.accounts.timezone);
    const lapsed = targetOn < today;

    if (
      targetOn > daysAfter(today, DAYS_OF_NOTICE) ||
      targetOn < daysAfter(today, -DAYS_OF_NOTICE) ||
      (lapsed &&
        end.deal_milestone_overdue_notice.some(
          (sent) => sent.target_on === targetOn,
        )) ||
      lockedAccounts.has(end.account_id)
    ) {
      continue;
    }

    const { data: over } = await admin
      .rpc('deal_exclusivity_over', { deal_id: end.deal_id })
      .throwOnError();

    if (over) {
      continue;
    }

    const { deal } = end;
    const dealName = deal.firm.name;
    const recipients = await noticeRecipients(
      end.account_id,
      deal.owner_user_id,
    );

    await admin
      .from('notifications')
      .upsert(
        recipients.map((recipientUserId) => ({
          account_id: end.account_id,
          recipient_user_id: recipientUserId,
          deal_id: end.deal_id,
          type: 'info' as const,
          body: lapsed
            ? `Exclusivity on ${dealName} lapsed on ${mediumDate(targetOn)}.`
            : `Exclusivity on ${dealName} ends ${mediumDate(targetOn)}.`,
          link: teamItemPath(
            z.string().parse(deal.accounts.slug),
            end.deal_id,
            {
              kind: 'milestone',
              id: end.id,
            },
          ),
          dedupe_key: `${lapsed ? 'exclusivity_lapsed' : 'exclusivity_ending'}:${end.id}:${targetOn}:${recipientUserId}`,
        })),
        { onConflict: 'dedupe_key', ignoreDuplicates: true },
      )
      .throwOnError();

    if (lapsed) {
      await admin
        .from('deal_milestone_overdue_notice')
        .insert({ milestone_id: end.id, target_on: targetOn })
        .throwOnError();
    }
  }
}
