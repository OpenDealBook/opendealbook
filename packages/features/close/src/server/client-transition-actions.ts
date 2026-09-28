'use server';

import { enhanceAction } from '@odb/next/actions';
import type { TablesInsert, TablesUpdate } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  clientTransitionSchema,
  updateClientTransitionStepSchema,
} from '../schema/client-transition.schema';

const stepColumn = {
  engagement_letter: 'engagement_letter_status',
  consent_7216: 'consent_7216_status',
  efile_auth: 'efile_auth_status',
  portal_migration: 'portal_migration_status',
} as const;

export const createClientTransition = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const insert: TablesInsert<'client_transition'> = {
      account_id: data.account_id,
      deal_id: data.deal_id,
      client_name: data.client_name,
    };

    const { data: row, error } = await client
      .from('client_transition')
      .insert(insert)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: clientTransitionSchema },
);

export const updateClientTransitionStep = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const update: TablesUpdate<'client_transition'> = {};
    update[stepColumn[data.step]] = data.status;

    const { data: row, error } = await client
      .from('client_transition')
      .update(update)
      .eq('id', data.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: updateClientTransitionStepSchema },
);
