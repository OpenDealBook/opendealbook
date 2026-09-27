import { getSupabaseServerAdminClient } from '@tuckin/supabase/server';

import { createHash } from 'node:crypto';

const KEY_NAMESPACE = 'odb';
const READ_SCOPE = 'read';

export interface ParsedApiKey {
  prefix: string;
  raw: string;
}

export interface AuthenticatedContext {
  accountId: string;
  scopes: string[];
}

export interface AuthFailure {
  error: string;
  status: number;
}

export function formatApiKey(prefix: string, secret: string): string {
  return `${KEY_NAMESPACE}_${prefix}_${secret}`;
}

export function parseApiKey(fullKey: string): ParsedApiKey | null {
  const marker = `${KEY_NAMESPACE}_`;

  if (!fullKey.startsWith(marker)) {
    return null;
  }

  const raw = fullKey.slice(marker.length);
  const separator = raw.indexOf('_');

  if (separator <= 0 || separator === raw.length - 1) {
    return null;
  }

  return { prefix: raw.slice(0, separator), raw };
}

export function hashRawKey(raw: string): string {
  return `\\x${createHash('sha256').update(raw).digest('hex')}`;
}

function parseBearer(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

export async function authenticateApiKey(
  authorizationHeader: string | null,
): Promise<AuthenticatedContext | AuthFailure> {
  const token = parseBearer(authorizationHeader);

  if (!token) {
    return { error: 'Missing bearer token', status: 401 };
  }

  const parsed = parseApiKey(token);

  if (!parsed) {
    return { error: 'Malformed API key', status: 401 };
  }

  const client = getSupabaseServerAdminClient();

  const { data: accountId } = await client.rpc('verify_api_key', {
    prefix: parsed.prefix,
    raw: parsed.raw,
  });

  if (!accountId) {
    return { error: 'Invalid API key', status: 401 };
  }

  const { data: keyRow } = await client
    .from('api_key')
    .select('scopes')
    .eq('key_prefix', parsed.prefix)
    .is('revoked_at', null)
    .single();

  return { accountId, scopes: keyRow?.scopes ?? [] };
}

export async function authenticateReadRequest(
  authorizationHeader: string | null,
): Promise<{ accountId: string } | AuthFailure> {
  const result = await authenticateApiKey(authorizationHeader);

  if ('error' in result) {
    return result;
  }

  if (!result.scopes.includes(READ_SCOPE)) {
    return { error: 'API key is missing the read scope', status: 403 };
  }

  return { accountId: result.accountId };
}
