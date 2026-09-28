'use server';

import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerAdminClient } from '@odb/supabase/server';

import {
  createTeamSchema,
  type CreateTeamData,
} from '../schema/create-team.schema';

async function createTeamAccount(data: CreateTeamData, user: { id: string }) {
  const client = getSupabaseServerAdminClient();

  const { data: account, error } = await client.rpc('create_team_account', {
    account_name: data.name,
    account_slug: data.slug,
    user_id: user.id,
  });

  if (error) {
    throw error;
  }

  return account;
}

export const createTeamAccountAction = enhanceAction(createTeamAccount, {
  auth: true,
  schema: createTeamSchema,
});
