import { ApplicationFailure } from '@temporalio/common';
import { z } from 'zod';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { dealManagerIds } from '../../dealManagers';
import { uuidFromKey } from '../../uuidFromKey';
import { NODE_CONFIG_SCHEMAS } from '../graph';
import { defineStep } from '../step';
import { teamTimezone } from '../team-timezone';

function isUuid(value: string): boolean {
  return z.guid().safeParse(value).success;
}

function localDateInDays(days: number, timeZone: string): string {
  const due = new Date(
    `${new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date())}T00:00:00Z`,
  );
  due.setUTCDate(due.getUTCDate() + days);
  return due.toISOString();
}

export const createTodo = defineStep({
  type: 'create_todo',
  runOnce: false,
  configSchema: NODE_CONFIG_SCHEMAS.create_todo,
  inputSchema: z.object({}),
  outputSchema: z.object({ todoIds: z.array(z.string()) }),
  async run({ context, config }) {
    const admin = getSupabaseServerAdminClient();

    let assigneeIds: string[];
    if (config.assignees.kind === 'members') {
      assigneeIds = config.assignees.userIds.map((userId) => userId.toLowerCase());
      const { data: memberships } = await admin
        .from('accounts_memberships')
        .select('user_id')
        .eq('account_id', context.accountId)
        .in('user_id', assigneeIds.filter(isUuid))
        .throwOnError();
      const members = new Set(memberships.map((membership) => membership.user_id));
      if (!assigneeIds.every((userId) => members.has(userId))) {
        throw ApplicationFailure.nonRetryable('Someone in this step is not on this team');
      }
    } else {
      assigneeIds = await dealManagerIds(context.accountId);
      if (assigneeIds.length === 0) {
        throw ApplicationFailure.nonRetryable('This team has no deal managers to assign');
      }
    }

    if (config.dealId !== undefined) {
      const onTeam =
        isUuid(config.dealId) &&
        (
          await admin
            .from('deal')
            .select('id')
            .eq('id', config.dealId)
            .eq('account_id', context.accountId)
            .maybeSingle()
            .throwOnError()
        ).data !== null;
      if (!onTeam) {
        throw ApplicationFailure.nonRetryable('That deal is not on this team');
      }
    }

    const dueAt =
      config.dueInDays === undefined
        ? undefined
        : localDateInDays(config.dueInDays, await teamTimezone(context.accountId));
    const todos = assigneeIds.map((userId) => ({
      id: uuidFromKey(`workflow_step:${context.idempotencyKey}:${userId}`),
      account_id: context.accountId,
      user_id: userId,
      title: config.title,
      deal_id: config.dealId,
      due_at: dueAt,
    }));

    await admin
      .from('personal_todo')
      .upsert(todos, { onConflict: 'id', ignoreDuplicates: true })
      .throwOnError();

    return { todoIds: todos.map((todo) => todo.id) };
  },
});
