import { beforeEach, describe, expect, it, vi } from 'vitest';

const adminClient = {
  from: vi.fn(),
};

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => adminClient,
}));

import { deleteConnection, getConnection, saveConnection } from './connections';

function queryStub(result: unknown) {
  const stub: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = (value: unknown) => vi.fn(() => value);

  stub.insert = chain(stub);
  stub.select = chain(stub);
  stub.eq = chain(stub);
  stub.is = chain(stub);
  stub.delete = chain(stub);
  stub.single = vi.fn(() => ({ throwOnError: () => result }));
  stub.maybeSingle = vi.fn(() => ({ throwOnError: () => result }));
  stub.throwOnError = vi.fn(() => result);

  return stub;
}

describe('connections', () => {
  beforeEach(() => {
    adminClient.from.mockReset();
  });

  it('saveConnection maps camel-case input to the row columns', async () => {
    const stub = queryStub({ data: { id: 'row-1' } });
    adminClient.from.mockReturnValue(stub);

    await saveConnection({
      accountId: 'acc-1',
      provider: 'gmail',
      nangoConnectionId: 'nango-1',
      scopes: ['read'],
      status: 'active',
    });

    expect(adminClient.from).toHaveBeenCalledWith('integration_connection');
    expect(stub.insert).toHaveBeenCalledWith({
      account_id: 'acc-1',
      user_id: null,
      provider: 'gmail',
      nango_connection_id: 'nango-1',
      scopes: ['read'],
      status: 'active',
    });
  });

  it('getConnection filters user_id IS NULL when no userId is given', async () => {
    const stub = queryStub({ data: null });
    adminClient.from.mockReturnValue(stub);

    await getConnection({ accountId: 'acc-1', provider: 'gmail' });

    expect(stub.is).toHaveBeenCalledWith('user_id', null);
  });

  it('getConnection filters by user_id when a userId is given', async () => {
    const stub = queryStub({ data: null });
    adminClient.from.mockReturnValue(stub);

    await getConnection({
      accountId: 'acc-1',
      provider: 'gmail',
      userId: 'user-1',
    });

    expect(stub.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('deleteConnection targets the row by id', async () => {
    const stub = queryStub({ data: null });
    adminClient.from.mockReturnValue(stub);

    await deleteConnection('row-1');

    expect(stub.delete).toHaveBeenCalled();
    expect(stub.eq).toHaveBeenCalledWith('id', 'row-1');
  });
});
