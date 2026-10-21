import { createNovuClient } from '@odb/notifications/server';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { emailContractReviewReminders } from './reminder-email';
import { syncContractReviewTodos } from './todo-sync';

async function teamsWithReviews(
  admin: ReturnType<typeof getSupabaseServerAdminClient>,
) {
  const { data: requests } = await admin
    .from('contract_review_request')
    .select('account_id')
    .throwOnError();

  return new Set(requests.map((request) => request.account_id));
}

export async function syncContractReviewTodosForTeams(): Promise<void> {
  const admin = getSupabaseServerAdminClient();

  for (const accountId of await teamsWithReviews(admin)) {
    await syncContractReviewTodos(admin, accountId);
  }
}

export async function emailContractReviewRemindersDue(now: string): Promise<void> {
  if (!process.env.NOVU_API_KEY || !process.env.NOVU_API_URL) {
    return;
  }

  const admin = getSupabaseServerAdminClient();
  const novu = createNovuClient();

  for (const accountId of await teamsWithReviews(admin)) {
    await emailContractReviewReminders({ admin, novu }, accountId, new Date(now));
  }
}
