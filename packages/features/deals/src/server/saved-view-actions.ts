'use server';

import { enhanceAction } from '@odb/next/actions';
import type { Json } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  listSavedViewsSchema,
  savedViewIdSchema,
  savedViewSchema,
  updateSavedViewSchema,
} from '../schema/saved-view.schema';

export const saveView = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: row, error } = await client
      .from('saved_view')
      .insert({
        account_id: data.account_id,
        name: data.name,
        filters: data.filters as Json,
        sort: data.sort ?? null,
        visible_columns: data.visible_columns ?? null,
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: savedViewSchema },
);

export const listSavedViews = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: rows, error } = await client
      .from('saved_view')
      .select('*')
      .eq('account_id', data.account_id)
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }

    return rows;
  },
  { auth: true, schema: listSavedViewsSchema },
);

export const updateSavedView = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: row, error } = await client
      .from('saved_view')
      .update({
        name: data.name,
        filters: data.filters as Json,
        sort: data.sort ?? null,
        visible_columns: data.visible_columns ?? null,
      })
      .eq('id', data.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: updateSavedViewSchema },
);

export const deleteSavedView = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    await client.from('saved_view').delete().eq('id', data.id).throwOnError();

    return { success: true };
  },
  { auth: true, schema: savedViewIdSchema },
);
