import { describe, expect, it } from 'vitest';

import { fetchClientTransitions } from './queries';

function stubClient(
  expectedTable: string,
  result: { data: unknown; error: unknown },
) {
  const filters: Array<[string, unknown]> = [];
  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.select = chain;
  builder.order = chain;
  builder.eq = (column: string, value: unknown) => {
    filters.push([column, value]);
    return builder;
  };
  builder.then = (resolve: (value: unknown) => void) => resolve(result);

  const client = {
    filters,
    from: (name: string) => {
      expect(name).toBe(expectedTable);
      return builder;
    },
  };

  return client;
}

describe('fetchClientTransitions', () => {
  it('returns the transitions filtered by deal id', async () => {
    const rows = [{ id: 'transition-1', deal_id: 'deal-1', status: 'pending' }];
    const client = stubClient('client_transition', { data: rows, error: null });

    const result = await fetchClientTransitions(client as never, 'deal-1');

    expect(result).toBe(rows);
    expect(client.filters).toContainEqual(['deal_id', 'deal-1']);
  });

  it('throws when the query returns an error', async () => {
    const error = new Error('query failed');
    const client = stubClient('client_transition', { data: null, error });

    await expect(
      fetchClientTransitions(client as never, 'deal-1'),
    ).rejects.toBe(error);
  });
});
