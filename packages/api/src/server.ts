'use server';

import { z } from 'zod';

import { TEAM_READ_ONLY } from '@odb/next';
import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { generateApiKey } from './issuance';

const createApiKeySchema = z.object({
  accountId: z.string().uuid(),
  name: z.string().min(1).max(255),
  scopes: z.array(z.string()).nonempty().optional(),
});

const CANNOT_CREATE = 'You cannot create API keys for this team.';
const CANNOT_REVOKE = 'You cannot revoke this API key.';

type Refused = { ok: false; refusal: string };

const listApiKeysSchema = z.object({ accountId: z.string().uuid() });

const revokeApiKeySchema = z.object({
  accountId: z.string().uuid(),
  id: z.string().uuid(),
});

export const createApiKey = enhanceAction(
  async (
    data,
    user,
  ): Promise<
    | {
        ok: true;
        rawKey: string;
        prefix: string;
        name: string;
        scopes: string[];
      }
    | Refused
  > => {
    const generated = generateApiKey();
    const scopes = data.scopes ?? ['read'];

    const { error } = await getSupabaseServerClient().from('api_key').insert({
      account_id: data.accountId,
      name: data.name,
      key_prefix: generated.prefix,
      key_hash: generated.hash,
      scopes,
      created_by: user.id,
    });

    if (error?.code === '42501') {
      return {
        ok: false,
        refusal:
          error.message === 'team is read-only' ? TEAM_READ_ONLY : CANNOT_CREATE,
      };
    }

    if (error) {
      throw error;
    }

    return {
      ok: true,
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
  async (data): Promise<{ ok: true } | Refused> => {
    const client = getSupabaseServerClient();

    const { data: revoked, error } = await client
      .from('api_key')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', data.id)
      .eq('account_id', data.accountId)
      .select('id');

    if (error) {
      throw error;
    }

    if (revoked.length === 0) {
      return { ok: false, refusal: CANNOT_REVOKE };
    }

    return { ok: true };
  },
  { auth: true, schema: revokeApiKeySchema },
);
