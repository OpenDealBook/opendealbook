import { describe, expect, it, vi } from 'vitest';

import { TEAM_READ_ONLY } from '@odb/next';

const db = vi.hoisted(() => ({
  insertError: null as { code: string; message: string } | null,
  revokedRows: [] as { id: string }[],
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: { id: string }) => Promise<unknown>) =>
    (input: unknown) =>
      fn(input, { id: 'user-1' }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: () => {
      const builder = {
        insert: async () => ({ error: db.insertError }),
        update: () => builder,
        eq: () => builder,
        select: async () => ({ data: db.revokedRows, error: null }),
      };
      return builder;
    },
  }),
}));

import { createApiKey, revokeApiKey } from './server';

const accountId = '00000000-0000-4000-8000-000000000001';
const key = { accountId, id: '00000000-0000-4000-8000-000000000002' };

describe('createApiKey', () => {
  it('returns the new key once', async () => {
    db.insertError = null;

    const created = await createApiKey({ accountId, name: 'CI' });

    expect(created).toMatchObject({ ok: true, name: 'CI', scopes: ['read'] });
    expect(created.ok ? created.rawKey : '').toContain(
      created.ok ? `_${created.prefix}_` : 'missing',
    );
  });

  it('refuses on a locked team', async () => {
    db.insertError = { code: '42501', message: 'team is read-only' };

    await expect(createApiKey({ accountId, name: 'CI' })).resolves.toEqual({
      ok: false,
      refusal: TEAM_READ_ONLY,
    });
  });

  it('refuses someone without api_keys.manage', async () => {
    db.insertError = {
      code: '42501',
      message: 'new row violates row-level security policy for table "api_key"',
    };

    await expect(createApiKey({ accountId, name: 'CI' })).resolves.toEqual({
      ok: false,
      refusal: 'You cannot create API keys for this team.',
    });
  });
});

describe('revokeApiKey', () => {
  it('revokes a key the caller may manage', async () => {
    db.revokedRows = [{ id: key.id }];

    await expect(revokeApiKey(key)).resolves.toEqual({ ok: true });
  });

  it('refuses when nothing the caller may manage was revoked', async () => {
    db.revokedRows = [];

    await expect(revokeApiKey(key)).resolves.toEqual({
      ok: false,
      refusal: 'You cannot revoke this API key.',
    });
  });
});
