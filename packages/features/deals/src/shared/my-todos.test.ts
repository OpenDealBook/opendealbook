import { describe, expect, it, vi } from 'vitest';

import { fetchMyTodos } from './queries';

function makeClient(data: Record<string, unknown[]>) {
  const eqSpy = vi.fn();

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = chain;
    builder.order = chain;
    builder.eq = (column: string, value: unknown) => {
      eqSpy(table, column, value);
      return builder;
    };
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({ data: data[table] ?? [], error: null });

    return builder;
  }

  return {
    client: { from: (table: string) => makeBuilder(table) },
    eqSpy,
  };
}

describe('fetchMyTodos', () => {
  it('groups the user assigned checklist items by deal and returns personal todos', async () => {
    const { client, eqSpy } = makeClient({
      checklist_item: [
        {
          id: 'c1',
          title: 'NDA',
          status: 'not_started',
          deal_id: 'deal-a',
          deal: { id: 'deal-a', description: 'Deal A' },
        },
        {
          id: 'c2',
          title: 'Tax returns',
          status: 'requested',
          deal_id: 'deal-a',
          deal: { id: 'deal-a', description: 'Deal A' },
        },
        {
          id: 'c3',
          title: 'Lease',
          status: 'not_started',
          deal_id: 'deal-b',
          deal: { id: 'deal-b', description: 'Deal B' },
        },
      ],
      personal_todo: [
        { id: 't1', title: 'Call broker', done: false, deal_id: 'deal-a' },
      ],
    });

    const result = await fetchMyTodos(
      client as never,
      '00000000-0000-4000-8000-000000000001',
    );

    expect(eqSpy).toHaveBeenCalledWith(
      'checklist_item',
      'owner_user_id',
      '00000000-0000-4000-8000-000000000001',
    );
    expect(eqSpy).toHaveBeenCalledWith(
      'personal_todo',
      'user_id',
      '00000000-0000-4000-8000-000000000001',
    );

    expect(result.assigned).toHaveLength(2);

    const dealA = result.assigned.find((group) => group.deal.id === 'deal-a');
    expect(dealA?.deal.description).toBe('Deal A');
    expect(dealA?.items.map((item) => item.id)).toEqual(['c1', 'c2']);

    const dealB = result.assigned.find((group) => group.deal.id === 'deal-b');
    expect(dealB?.items).toHaveLength(1);

    expect(result.personal.map((todo) => todo.id)).toEqual(['t1']);
  });
});
