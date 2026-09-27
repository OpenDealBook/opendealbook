import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  let verifyResult: string | null = 'account-1';
  let scopes: string[] = ['read'];

  const rpc = vi.fn(async () => ({ data: verifyResult }));

  const from = vi.fn(() => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.eq = chain;
    builder.is = chain;
    builder.single = async () => ({ data: { scopes } });
    return builder;
  });

  return {
    rpc,
    from,
    setVerifyResult: (value: string | null) => {
      verifyResult = value;
    },
    setScopes: (value: string[]) => {
      scopes = value;
    },
  };
});

vi.mock('@tuckin/supabase/server', () => ({
  getSupabaseServerAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));

import { authenticateApiKey, authenticateReadRequest } from './auth';
import { generateApiKey } from './issuance';

describe('authenticateApiKey', () => {
  beforeEach(() => {
    mocks.setVerifyResult('account-1');
    mocks.setScopes(['read']);
    mocks.rpc.mockClear();
  });

  it('accepts a valid key and returns account and scopes', async () => {
    const { rawKey, prefix } = generateApiKey();

    const result = await authenticateApiKey(`Bearer ${rawKey}`);

    expect(result).toEqual({ accountId: 'account-1', scopes: ['read'] });
    expect(mocks.rpc).toHaveBeenCalledWith('verify_api_key', {
      prefix,
      raw: rawKey.slice('odb_'.length),
    });
  });

  it('rejects a missing header', async () => {
    expect(await authenticateApiKey(null)).toEqual({
      error: 'Missing bearer token',
      status: 401,
    });
  });

  it('rejects a malformed key', async () => {
    expect(await authenticateApiKey('Bearer not-a-key')).toEqual({
      error: 'Malformed API key',
      status: 401,
    });
  });

  it('rejects a bad or revoked key when verify returns null', async () => {
    mocks.setVerifyResult(null);
    const { rawKey } = generateApiKey();

    expect(await authenticateApiKey(`Bearer ${rawKey}`)).toEqual({
      error: 'Invalid API key',
      status: 401,
    });
  });
});

describe('authenticateReadRequest', () => {
  beforeEach(() => {
    mocks.setVerifyResult('account-1');
    mocks.setScopes(['read']);
  });

  it('rejects a key without the read scope', async () => {
    mocks.setScopes(['write']);
    const { rawKey } = generateApiKey();

    expect(await authenticateReadRequest(`Bearer ${rawKey}`)).toEqual({
      error: 'API key is missing the read scope',
      status: 403,
    });
  });

  it('returns the account when the read scope is present', async () => {
    const { rawKey } = generateApiKey();

    expect(await authenticateReadRequest(`Bearer ${rawKey}`)).toEqual({
      accountId: 'account-1',
    });
  });
});
