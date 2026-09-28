import { describe, expect, it } from 'vitest';

import { fetchEmployees, fetchHrAuditEngagement } from './queries';

function stubClient(
  expectedTable: string,
  result: { data: unknown; error: unknown },
) {
  const filters: Array<[string, unknown]> = [];
  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.select = chain;
  builder.order = chain;
  builder.limit = chain;
  builder.eq = (column: string, value: unknown) => {
    filters.push([column, value]);
    return builder;
  };
  builder.maybeSingle = async () => result;
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

describe('fetchEmployees', () => {
  it('returns the employees filtered by deal id', async () => {
    const rows = [{ id: 'employee-1', deal_id: 'deal-1', name: 'Jordan Lee' }];
    const client = stubClient('employee', { data: rows, error: null });

    const result = await fetchEmployees(client as never, 'deal-1');

    expect(result).toBe(rows);
    expect(client.filters).toContainEqual(['deal_id', 'deal-1']);
  });
});

describe('fetchHrAuditEngagement', () => {
  it('returns the engagement filtered by deal id', async () => {
    const row = { id: 'engagement-1', deal_id: 'deal-1', provider: 'internal' };
    const client = stubClient('hr_audit_engagement', {
      data: row,
      error: null,
    });

    const result = await fetchHrAuditEngagement(client as never, 'deal-1');

    expect(result).toBe(row);
    expect(client.filters).toContainEqual(['deal_id', 'deal-1']);
  });

  it('returns null when the deal has no engagement', async () => {
    const client = stubClient('hr_audit_engagement', {
      data: null,
      error: null,
    });

    const result = await fetchHrAuditEngagement(client as never, 'deal-1');

    expect(result).toBeNull();
  });
});
