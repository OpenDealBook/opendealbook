import type { SupabaseClient } from '@supabase/supabase-js';

import {
  type NovuClient,
  triggerNotification,
} from '@odb/notifications/server';
import type { Database } from '@odb/supabase';

import { dealManagerIds } from '../../actions/deal-manager-ids';
import { listLendersToNudge } from '../nudges/nudges';

const WORKFLOW_ID = 'lender-nudges.daily';
const SEND_HOUR = 8;

export function localDateAndHour(now: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

export async function emailLendersToNudge(
  deps: { admin: SupabaseClient<Database>; novu: NovuClient },
  accountId: string,
  now: Date,
): Promise<void> {
  const { admin, novu } = deps;

  const { data: locked } = await admin
    .rpc('is_account_locked', { target_account_id: accountId })
    .throwOnError();
  if (locked) {
    return;
  }

  const lenders = await listLendersToNudge(admin, accountId);
  if (lenders.length === 0) {
    return;
  }

  const managerIds = await dealManagerIds(admin, accountId);
  const [{ data: team }, { data: personal }] =
    await Promise.all([
      admin
        .from('accounts')
        .select('slug')
        .eq('id', accountId)
        .single()
        .throwOnError(),
      admin
        .from('accounts')
        .select('id, timezone')
        .in('id', managerIds)
        .throwOnError(),
    ]);
  const timezoneById = new Map(
    personal.map((account) => [account.id, account.timezone]),
  );

  const payload = {
    accountSlug: team.slug,
    lenders: lenders.map((lender) => ({
      lenderName: lender.lenderName,
      deals: lender.deals.map((deal) => ({
        dealName: deal.dealName,
        daysSilent: deal.daysSilent,
      })),
    })),
  };

  for (const userId of managerIds) {
    const local = localDateAndHour(now, timezoneById.get(userId) ?? 'UTC');
    if (local.hour !== SEND_HOUR) {
      continue;
    }

    await triggerNotification(
      { novu, client: admin },
      {
        eventType: WORKFLOW_ID,
        recipientUserId: userId,
        payload,
        transactionId: `${WORKFLOW_ID}/${accountId}/${userId}/${local.date}`,
      },
    );
  }
}
