import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
const appendDealEvent = vi.fn();

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: { id: string }) => unknown) =>
    (input: unknown) =>
      fn(input, { id: 'user-1' }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ rpc, from }),
}));

vi.mock('@odb/events', () => ({
  appendDealEvent: (...args: unknown[]) => appendDealEvent(...args),
}));

function resolvesTo<T>(result: T) {
  const builder: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'order', 'update', 'insert', 'single'];

  for (const method of methods) {
    builder[method] = vi.fn(() => builder);
  }

  builder.then = (resolve: (value: T) => unknown) => resolve(result);

  return builder;
}

describe('acceptBrokerIntake', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: true });
    appendDealEvent.mockResolvedValue([{ deal_seq: 1, aggregate_seq: 1 }]);
  });

  it('creates the deal through a deal.created event with the mapped payload', async () => {
    const brokerBuilders = [
      resolvesTo({ data: { firm_name: 'Acme' } }),
      resolvesTo({ data: null }),
    ];

    from.mockImplementation((table: string) => {
      if (table === 'broker_intake') {
        return brokerBuilders.shift();
      }
      if (table === 'firm') {
        return resolvesTo({ data: { id: 'firm-1' } });
      }
      return resolvesTo({ data: null });
    });

    const { acceptBrokerIntake } = await import('./actions');

    const result = await acceptBrokerIntake({
      accountId: '00000000-0000-0000-0000-000000000001',
      intakeId: '00000000-0000-0000-0000-000000000002',
      createDeal: true,
    });

    expect(appendDealEvent).toHaveBeenCalledTimes(1);

    const [, input] = appendDealEvent.mock.calls[0]!;

    expect(input.eventType).toBe('deal.created');
    expect(input.aggregateType).toBe('deal');
    expect(input.dealId).toBe(input.aggregateId);
    expect(input.payload).toEqual({
      account_id: '00000000-0000-0000-0000-000000000001',
      firm_id: 'firm-1',
      owner_user_id: 'user-1',
      description: null,
      source: 'broker',
      stage: 'sourced',
    });

    expect(from).not.toHaveBeenCalledWith('deal');
    expect(result).toEqual({ firmId: 'firm-1', dealId: input.dealId });
  });
});
