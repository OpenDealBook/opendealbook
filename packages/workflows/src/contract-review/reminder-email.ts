import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import { localDateAndHour } from '@odb/lender-rooms/crm/nudges-surface/daily-email.ts';
import {
  counselItemPath,
  sellerItemPath,
  teamItemPath,
} from '@odb/notifications/relay';
import {
  type NovuClient,
  triggerNotification,
} from '@odb/notifications/server';
import type { Database } from '@odb/supabase';

import { dealManagerIds } from '../dealManagers';
import { reviewNudgeDue } from './cadence';
import { shortDate, timezonesOf } from './local-time';
import { listPendingReviews } from './pending';

const WORKFLOW_ID = 'contract-review.reminder';
const UNANSWERED_WORKFLOW_ID = 'contract-review.unanswered';
const COUNSEL_LABEL = { buyer: "Buyer's counsel", seller: "Seller's counsel" };
const CONTRACT_LABEL: Record<string, string> = { loi: 'LOI', apa: 'APA' };

export async function emailContractReviewReminders(
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

  const pending = (await listPendingReviews(admin, accountId)).filter(
    (review) => review.side === 'buyer' || review.shownToSeller,
  );
  if (pending.length === 0) {
    return;
  }

  const [managerIds, { data: team }, { data: rooms }] = await Promise.all([
    dealManagerIds(accountId),
    admin
      .from('accounts')
      .select('slug')
      .eq('id', accountId)
      .single()
      .throwOnError(),
    admin
      .from('seller_room')
      .select('id, deal_id, seller_room_member(user_id, email)')
      .in(
        'deal_id',
        pending.map((review) => review.dealId),
      )
      .throwOnError(),
  ]);

  const reviewOf = (review: (typeof pending)[number]) => ({
    kind: 'contract-review' as const,
    id: review.versionId,
  });
  const teamPath = (review: (typeof pending)[number]) =>
    teamItemPath(z.string().parse(team.slug), review.dealId, reviewOf(review));
  const reminders = pending.flatMap((review) => {
    const version =
      review.side === 'seller' ? review.sellerNumber! : review.version;
    if (review.counsel.length > 0) {
      return review.counsel.map((counsel) => ({
        review,
        version,
        userId: counsel.userId,
        email: counsel.email as string | undefined,
        path: counselItemPath(review.dealId, reviewOf(review)),
        dealName:
          review.side === 'buyer' ? review.outsideDealName : review.dealName,
        subjectDealName: review.outsideDealName,
      }));
    }
    if (review.side === 'buyer') {
      return managerIds.map((userId) => ({
        review,
        version,
        userId,
        email: undefined,
        path: teamPath(review),
        dealName: review.dealName,
        subjectDealName: review.dealName,
      }));
    }
    return rooms
      .filter((room) => room.deal_id === review.dealId)
      .flatMap((room) =>
        room.seller_room_member.map((member) => ({
          review,
          version,
          userId: member.user_id,
          email: member.email as string | undefined,
          path: sellerItemPath(room.id, reviewOf(review)),
          dealName: review.dealName,
          subjectDealName: review.outsideDealName,
        })),
      );
  });

  const escalations = pending
    .filter((review) => review.counsel.length > 0)
    .flatMap((review) => managerIds.map((userId) => ({ review, userId })));

  const timezoneOf = await timezonesOf(admin, [
    ...reminders.map((reminder) => reminder.userId),
    ...managerIds,
  ]);

  for (const {
    review,
    version,
    userId,
    email,
    path,
    dealName,
    subjectDealName,
  } of reminders) {
    const timeZone = timezoneOf(userId);
    if (reviewNudgeDue(review.requestedAt, now, timeZone) !== 'remind') {
      continue;
    }
    const local = localDateAndHour(now, timeZone);

    await triggerNotification(
      { novu, client: admin },
      {
        eventType: WORKFLOW_ID,
        recipientUserId: userId,
        email,
        payload: {
          dealName,
          subjectDealName,
          contractType: review.contractType,
          version,
          since: shortDate(review.requestedAt, timeZone),
          path,
        },
        transactionId: `${WORKFLOW_ID}/${review.versionId}/${review.side}/${userId}/${local.date}`,
      },
    );
  }

  for (const { review, userId } of escalations) {
    const timeZone = timezoneOf(userId);
    if (reviewNudgeDue(review.requestedAt, now, timeZone) !== 'escalate') {
      continue;
    }
    const since = shortDate(review.requestedAt, timeZone);
    const transactionId = `${UNANSWERED_WORKFLOW_ID}/${review.requestId}/${review.side}/${userId}`;

    await admin
      .from('notifications')
      .upsert(
        {
          account_id: accountId,
          recipient_user_id: userId,
          deal_id: review.dealId,
          type: 'info',
          body: `${COUNSEL_LABEL[review.side]} hasn't answered the review of version ${review.version} of the ${CONTRACT_LABEL[review.contractType]} on ${review.dealName} asked for on ${since}.`,
          link: teamPath(review),
          dedupe_key: transactionId,
        },
        { onConflict: 'dedupe_key', ignoreDuplicates: true },
      )
      .throwOnError();

    await triggerNotification(
      { novu, client: admin },
      {
        eventType: UNANSWERED_WORKFLOW_ID,
        recipientUserId: userId,
        payload: {
          dealName: review.dealName,
          contractType: review.contractType,
          version: review.version,
          side: review.side,
          since,
          path: teamPath(review),
        },
        transactionId,
      },
    );
  }
}
