'use server';

import { z } from 'zod';

import { enhanceAction } from '@odb/next/actions';
import {
  teamItemPath,
  TODO_ASSIGNED_WORKFLOW_ID,
} from '@odb/notifications/relay';
import {
  createNovuClient,
  triggerNotification,
} from '@odb/notifications/server';
import { getLogger } from '@odb/shared/logger';
import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
} from '@odb/supabase/server';

import {
  assignTodoSchema,
  createTodoSchema,
  listTodosSchema,
  todoIdSchema,
  toggleTodoSchema,
} from '../schema/personal-todo.schema';
import { refusableAction } from './refusal';

type Admin = ReturnType<typeof getSupabaseServerAdminClient>;

interface Assignment {
  todoId: string;
  assigneeId: string;
  email: string | null;
  payload: {
    assignerName: string;
    dealName: string;
    title: string;
    path: string;
  };
}

// A Novu outage must not fail the assignment: the in-app notice is stored.
async function emailAssignee(admin: Admin, assignment: Assignment) {
  if (!process.env.NOVU_API_KEY || !process.env.NOVU_API_URL) {
    return;
  }

  try {
    await triggerNotification(
      { novu: createNovuClient(), client: admin },
      {
        eventType: TODO_ASSIGNED_WORKFLOW_ID,
        recipientUserId: assignment.assigneeId,
        payload: assignment.payload,
        email: assignment.email ?? undefined,
      },
    );
  } catch (error) {
    getLogger().error(
      { err: error, todoId: assignment.todoId },
      'To-do assignment email failed',
    );
  }
}

async function tellAssignee(
  todo: { id: string; title: string; deal_id: string; user_id: string },
  assignerId: string,
) {
  if (todo.user_id === assignerId) {
    return;
  }

  const admin = getSupabaseServerAdminClient();
  const [{ data: deal }, { data: people }] = await Promise.all([
    admin
      .from('deal')
      .select(
        'account_id, firm!inner(name), accounts!deal_account_id_fkey(slug)',
      )
      .eq('id', todo.deal_id)
      .single()
      .throwOnError(),
    admin
      .from('accounts')
      .select('primary_owner_user_id, name, email')
      .eq('is_personal_account', true)
      .in('primary_owner_user_id', [assignerId, todo.user_id])
      .throwOnError(),
  ]);
  const person = (userId: string) =>
    people.find((row) => row.primary_owner_user_id === userId)!;
  const assignerName = person(assignerId).name;
  const path = teamItemPath(
    z.string().parse(deal.accounts.slug),
    todo.deal_id,
    {
      kind: 'todo',
      id: todo.id,
    },
  );

  await admin
    .from('notifications')
    .insert({
      account_id: deal.account_id,
      recipient_user_id: todo.user_id,
      deal_id: todo.deal_id,
      type: 'info',
      body: `${assignerName} assigned you a to-do on ${deal.firm.name}: ${todo.title}`,
      link: path,
    })
    .throwOnError();

  await emailAssignee(admin, {
    todoId: todo.id,
    assigneeId: todo.user_id,
    email: person(todo.user_id).email,
    payload: {
      assignerName,
      dealName: deal.firm.name,
      title: todo.title,
      path,
    },
  });
}

export const createTodo = refusableAction(async (data, user) => {
  const { data: row } = await getSupabaseServerClient()
    .from('personal_todo')
    .insert({
      account_id: data.account_id,
      deal_id: data.deal_id,
      user_id: data.assignee_user_id,
      title: data.title,
      due_at: data.due_on ? `${data.due_on}T00:00:00Z` : undefined,
    })
    .select('*')
    .single()
    .throwOnError();

  await tellAssignee({ ...row, deal_id: data.deal_id }, user.id);

  return row;
}, createTodoSchema);

export const assignTodo = refusableAction(async (data, user) => {
  const client = getSupabaseServerClient();
  const { data: todo } = await client
    .from('personal_todo')
    .select('id, title, deal_id')
    .eq('id', data.id)
    .single()
    .throwOnError();

  await client
    .rpc('assign_personal_todo', {
      todo_id: data.id,
      assignee_id: data.assignee_user_id,
    })
    .throwOnError();

  await tellAssignee(
    { ...todo, deal_id: todo.deal_id!, user_id: data.assignee_user_id },
    user.id,
  );
}, assignTodoSchema);

export const toggleTodo = refusableAction(async (data) => {
  const { data: row } = await getSupabaseServerClient()
    .from('personal_todo')
    .update({ done: data.done })
    .eq('id', data.id)
    .select('*')
    .single()
    .throwOnError();

  return row;
}, toggleTodoSchema);

export const deleteTodo = refusableAction(async (data) => {
  await getSupabaseServerClient()
    .from('personal_todo')
    .delete()
    .eq('id', data.id)
    .throwOnError();
}, todoIdSchema);

export const listTodos = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    let query = client.from('personal_todo').select('*');

    if (data.deal_id) {
      query = query.eq('deal_id', data.deal_id);
    }

    const { data: rows, error } = await query.order('created_at', {
      ascending: true,
    });

    if (error) {
      throw error;
    }

    return rows;
  },
  { auth: true, schema: listTodosSchema },
);
