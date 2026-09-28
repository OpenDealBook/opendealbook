'use server';

import { z } from 'zod';

import { enhanceAction } from '@odb/next/actions';
import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
} from '@odb/supabase/server';

import { generateApiKey } from './issuance';

const createApiKeySchema = z.object({
  accountId: z.string().uuid(),
  name: z.string().min(1).max(255),
  scopes: z.array(z.string()).nonempty().optional(),
});

const listApiKeysSchema = z.object({ accountId: z.string().uuid() });

const revokeApiKeySchema = z.object({
  accountId: z.string().uuid(),
  id: z.string().uuid(),
});

async function assertCanManageKeys(accountId: string, userId: string) {
  const client = getSupabaseServerClient();

  const { data: isOwner } = await client.rpc('is_account_owner', {
    account_id: accountId,
  });

  if (isOwner) {
    return;
  }

  const { data: allowed } = await client.rpc('has_permission', {
    account_id: accountId,
    permission_name: 'members.manage',
    user_id: userId,
  });

  if (!allowed) {
    throw new Error('Not allowed to manage API keys');
  }
}

export const createApiKey = enhanceAction(
  async (data, user) => {
    await assertCanManageKeys(data.accountId, user.id);

    const generated = generateApiKey();
    const scopes = data.scopes ?? ['read'];
    const admin = getSupabaseServerAdminClient();

    const { error } = await admin.from('api_key').insert({
      account_id: data.accountId,
      name: data.name,
      key_prefix: generated.prefix,
      key_hash: generated.hash,
      scopes,
      created_by: user.id,
    });

    if (error) {
      throw error;
    }

    return {
      rawKey: generated.rawKey,
      prefix: generated.prefix,
      name: data.name,
      scopes,
    };
  },
  { auth: true, schema: createApiKeySchema },
);

export const listApiKeys = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: rows, error } = await client
      .from('api_key')
      .select(
        'id, name, key_prefix, scopes, last_used_at, revoked_at, created_at',
      )
      .eq('account_id', data.accountId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return rows ?? [];
  },
  { auth: true, schema: listApiKeysSchema },
);

export const revokeApiKey = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { error } = await client
      .from('api_key')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', data.id)
      .eq('account_id', data.accountId);

    if (error) {
      throw error;
    }

    return { success: true };
  },
  { auth: true, schema: revokeApiKeySchema },
);
