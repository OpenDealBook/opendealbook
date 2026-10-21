import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { noticeApprovalWaiting } from '../builder/approvalNotice';
import { UNFINISHED_RUN_STATUSES } from '../builder/client';
import { teamTimezone } from '../builder/team-timezone';
import { wallClockParts } from '../builder/wallClock';

const REMINDER_HOUR = 9;
const FIRST_NOTICE_GRACE_MS = 60 * 60 * 1000;

export async function remindWaitingApprovals(): Promise<void> {
  const { data: steps } = await getSupabaseServerAdminClient()
    .from('workflow_step_run')
    .select(
      'id, account_id, started_at, workflow_approval(step_run_id), workflow_run!inner(accounts(slug), workflow(name))',
    )
    .eq('status', 'waiting')
    .eq('waiting_on', 'decision')
    .in('workflow_run.status', UNFINISHED_RUN_STATUSES)
    .is('workflow_approval', null)
    .throwOnError();

  for (const step of steps) {
    const clock = wallClockParts(
      Date.now(),
      await teamTimezone(step.account_id),
    );

    if (
      clock.hour !== REMINDER_HOUR ||
      Date.now() - Date.parse(step.started_at) < FIRST_NOTICE_GRACE_MS
    ) {
      continue;
    }
    const day = `${clock.year}-${clock.month}-${clock.day}`;
    await noticeApprovalWaiting({
      step,
      dedupeKey: (userId) =>
        `workflow_approval_reminder:${step.id}:${day}:${userId}`,
    });
  }
}
