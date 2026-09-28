import { describe, expect, it, vi } from 'vitest';

import { listSellerQuestions } from './queries';

function stubClient(rows: unknown[]) {
  const eqSpy = vi.fn();
  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.select = chain;
  builder.throwOnError = chain;
  builder.eq = (column: string, value: unknown) => {
    eqSpy(column, value);
    return builder;
  };
  builder.then = (resolve: (value: unknown) => void) =>
    resolve({ data: rows, error: null });

  const from = vi.fn(() => builder);

  return { client: { from } as never, eqSpy };
}

describe('listSellerQuestions', () => {
  it('returns the seller questions scoped to the deal', async () => {
    const rows = [{ id: 'question-1' }, { id: 'question-2' }];
    const { client, eqSpy } = stubClient(rows);

    const result = await listSellerQuestions(client, 'deal-1');

    expect(result).toEqual(rows);
    expect(eqSpy).toHaveBeenCalledWith('deal_id', 'deal-1');
  });
});
