import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: { id: string }) => unknown) =>
    (input: unknown) =>
      fn(input, { id: 'user-1' }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ rpc, from }),
}));

function resolvesTo<T>(result: T) {
  const builder: Record<string, unknown> = {};
  const methods = [
    'select',
    'eq',
    'order',
    'limit',
    'in',
    'update',
    'insert',
    'single',
  ];

  for (const method of methods) {
    builder[method] = vi.fn(() => builder);
  }

  builder.then = (resolve: (value: T) => unknown) => resolve(result);

  return builder;
}

describe('importFirmsFromCsv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: true });
  });

  it('parses, dedupes against existing firms, and reports the inserted count', async () => {
    const firmInsert = resolvesTo({ data: [{ id: 'firm-new' }] });
    const firmBuilders = [
      resolvesTo({ data: [{ website: 'acme.com' }] }),
      firmInsert,
    ];

    from.mockImplementation((table: string) =>
      table === 'firm' ? firmBuilders.shift() : resolvesTo({ data: null }),
    );

    const { importFirmsFromCsv } = await import('./import-firms.action');

    const result = await importFirmsFromCsv({
      accountId: '00000000-0000-0000-0000-000000000001',
      csvText: 'Company,Site\nAcme,acme.com\nBeta,beta.com',
      mapping: { name: 'Company', website: 'Site' },
    });

    expect(rpc).toHaveBeenCalledWith('has_permission', {
      account_id: '00000000-0000-0000-0000-000000000001',
      user_id: 'user-1',
      permission_name: 'deals.manage',
    });
    expect(from).toHaveBeenCalledWith('data_source');
    expect(result).toEqual({ imported: 1 });
  });
});
