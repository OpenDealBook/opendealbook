import { describe, expect, it } from 'vitest';

import { fetchMyTodos } from './queries';

const deal = { id: '00000000-0000-4000-8000-0000000000d1', firm: { name: 'Acme' } };

function clientReturning(rows: Record<string, unknown[]>) {
  return {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;

      builder.select = chain;
      builder.eq = chain;
      builder.order = chain;
      builder.throwOnError = chain;
      builder.then = (resolve: (value: unknown) => void) =>
        resolve({ data: rows[table], error: null });

      return builder;
    },
  };
}

describe('fetchMyTodos', () => {
  it('orders checklist items and to-dos together by due date, undated last, marking received and reviewed items done', async () => {
    const client = clientReturning({
      checklist_item: [
        { id: 'c1', title: 'NDA', status: 'reviewed', due_at: null, deal },
        {
          id: 'c2',
          title: 'Leases',
          status: 'requested',
          due_at: '2026-10-30T00:00:00Z',
          deal,
        },
      ],
      personal_todo: [
        {
          id: 't1',
          title: 'Call broker',
          done: false,
          due_at: '2026-10-05T00:00:00Z',
          deal: null,
        },
      ],
    });

    const items = await fetchMyTodos(client as never, 'user-1', 'team-1');

    expect(
      items.map((item) => [item.kind, item.title, item.done, item.deal?.name]),
    ).toEqual([
      ['todo', 'Call broker', false, undefined],
      ['checklist', 'Leases', false, 'Acme'],
      ['checklist', 'NDA', true, 'Acme'],
    ]);
  });
});
