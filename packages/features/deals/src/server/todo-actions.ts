'use server';

import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  createTodoSchema,
  listTodosSchema,
  todoIdSchema,
  toggleTodoSchema,
} from '../schema/personal-todo.schema';

export const createTodo = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: row, error } = await client
      .from('personal_todo')
      .insert({
        account_id: data.account_id,
        deal_id: data.deal_id ?? null,
        title: data.title,
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: createTodoSchema },
);

export const toggleTodo = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: row, error } = await client
      .from('personal_todo')
      .update({ done: data.done })
      .eq('id', data.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: toggleTodoSchema },
);

export const deleteTodo = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    await client
      .from('personal_todo')
      .delete()
      .eq('id', data.id)
      .throwOnError();

    return { success: true };
  },
  { auth: true, schema: todoIdSchema },
);

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
