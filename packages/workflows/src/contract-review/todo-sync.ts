import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

import { createHash } from 'node:crypto';

import { dealManagerIds } from '../dealManagers';
import { shortDate, timezonesOf } from './local-time';
import { listPendingReviews, type PendingReview } from './pending';

type Stage = 'share' | 'waiting';

// A retry after a crash between the two inserts must find the to-do it already
// made, so its id is derived from what the to-do stands for.
function todoId(link: string): string {
  const hex = createHash('sha256').update(link).digest('hex');
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function stageOf(review: PendingReview): Stage {
  return review.side === 'seller' && !review.shownToSeller ? 'share' : 'waiting';
}

function titleOf(review: PendingReview, timeZone: string): string {
  if (stageOf(review) === 'share') {
    return `Share version ${review.version} with the seller side`;
  }
  const waitingOn =
    review.counsel.length > 0 ? `${review.side}'s counsel` : `the ${review.side}`;

  return `Waiting on ${waitingOn} since ${shortDate(review.requestedAt, timeZone)}`;
}

export async function syncContractReviewTodos(
  admin: SupabaseClient<Database>,
  accountId: string,
): Promise<void> {
  const { data: locked } = await admin
    .rpc('is_account_locked', { target_account_id: accountId })
    .throwOnError();
  if (locked) {
    return;
  }

  const pending = await listPendingReviews(admin, accountId);
  const wanted = new Map(
    pending.map((review) => [
      `${review.versionId}/${review.side}`,
      `${review.requestId}/${stageOf(review)}`,
    ]),
  );

  const managerIds = await dealManagerIds(accountId);

  const { data: links } = await admin
    .from('contract_review_todo')
    .select(
      'contract_version_id, side, user_id, request_id, stage, todo_id, contract_version!inner(account_id)',
    )
    .eq('contract_version.account_id', accountId)
    .throwOnError();

  const stale = links.filter(
    (link) =>
      wanted.get(`${link.contract_version_id}/${link.side}`) !==
      `${link.request_id}/${link.stage}`,
  );
  const clearedTodoIds = stale.flatMap((link) => link.todo_id ?? []);
  if (clearedTodoIds.length > 0) {
    await admin
      .from('personal_todo')
      .delete()
      .in('id', clearedTodoIds)
      .throwOnError();
  }
  for (const link of stale) {
    await admin
      .from('contract_review_todo')
      .delete()
      .eq('contract_version_id', link.contract_version_id)
      .eq('side', link.side)
      .eq('user_id', link.user_id)
      .throwOnError();
  }

  const linked = new Set(
    links
      .filter((link) => !stale.includes(link))
      .map((link) => `${link.contract_version_id}/${link.side}/${link.user_id}`),
  );
  const timezoneOf = await timezonesOf(admin, managerIds);

  for (const userId of managerIds) {
    for (const review of pending) {
      if (linked.has(`${review.versionId}/${review.side}/${userId}`)) {
        continue;
      }

      const stage = stageOf(review);
      const id = todoId(
        `${review.versionId}/${review.side}/${userId}/${review.requestId}/${stage}`,
      );
      await admin
        .from('personal_todo')
        .upsert(
          {
            id,
            account_id: accountId,
            deal_id: review.dealId,
            user_id: userId,
            title: titleOf(review, timezoneOf(userId)),
          },
          { onConflict: 'id', ignoreDuplicates: true },
        )
        .throwOnError();
      await admin
        .from('contract_review_todo')
        .insert({
          contract_version_id: review.versionId,
          side: review.side,
          user_id: userId,
          request_id: review.requestId,
          stage,
          todo_id: id,
        })
        .throwOnError();
    }
  }
}
