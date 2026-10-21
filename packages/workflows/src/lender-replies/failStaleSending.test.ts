import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
}));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'lender_room_outreach') throw new Error(table);
      const filters: ((row: Record<string, unknown>) => boolean)[] = [];
      let patch: Record<string, unknown> = {};
      const query: any = {
        update: (values: Record<string, unknown>) => {
          patch = values;
          return query;
        },
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return query;
        },
        lt: (column: string, value: string) => {
          filters.push((row) => (row[column] as string) < value);
          return query;
        },
        throwOnError: () => {
          for (const row of state.rows) {
            if (filters.every((filter) => filter(row))) Object.assign(row, patch);
          }
          return Promise.resolve({ error: null });
        },
      };
      return query;
    },
  }),
}));

import { failStaleSendingOutreach } from './failStaleSending';

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

function statusOf(id: string) {
  return state.rows.find((row) => row.id === id)!.status;
}

beforeEach(() => {
  state.rows = [
    { id: 'stale', status: 'sending', sent_at: minutesAgo(16) },
    { id: 'fresh', status: 'sending', sent_at: minutesAgo(5) },
    { id: 'done', status: 'sent', sent_at: minutesAgo(60) },
  ];
});

describe('failStaleSendingOutreach', () => {
  it('fails only sending rows older than 15 minutes', async () => {
    await failStaleSendingOutreach();

    expect(statusOf('stale')).toBe('failed');
    expect(statusOf('fresh')).toBe('sending');
    expect(statusOf('done')).toBe('sent');
  });

  it('converges when run twice', async () => {
    await failStaleSendingOutreach();
    await failStaleSendingOutreach();

    expect(state.rows.map((row) => row.status)).toEqual(['failed', 'sending', 'sent']);
  });
});
