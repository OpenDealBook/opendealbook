import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const appendSpy = vi.fn();
  const generateSpy = vi.fn();

  function makeBuilder() {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = chain;
    builder.eq = chain;
    builder.single = chain;
    builder.throwOnError = chain;
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({
        data: {
          deal_id: 'deal-1',
          account_id: 'acct-1',
          artifact_id: 'tpl-1',
        },
        error: null,
      });

    return builder;
  }

  const from = vi.fn(() => makeBuilder());
  const client = { from };

  return { appendSpy, generateSpy, from, client };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => mocks.client,
}));

vi.mock('@odb/templates/server', () => ({
  generateFromTemplate: (input: unknown) => {
    mocks.generateSpy(input);
    return Promise.resolve({ id: 'artifact-1' });
  },
}));

vi.mock('@odb/events', () => ({
  appendDealEvent: (client: unknown, input: unknown) => {
    mocks.appendSpy(client, input);
    return Promise.resolve([{ deal_seq: 1, aggregate_seq: 1 }]);
  },
  appendDealEvents: vi.fn(),
}));

import { sendRequest } from './actions';

const runSendRequest = sendRequest as unknown as (
  data: Record<string, unknown>,
) => Promise<unknown>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sendRequest', () => {
  it('marks the checklist item requested via a status_changed deal event', async () => {
    await runSendRequest({ checklistItemId: 'item-1' });

    expect(mocks.appendSpy).toHaveBeenCalledTimes(1);

    const [client, input] = mocks.appendSpy.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];

    expect(client).toBe(mocks.client);
    expect(input).toMatchObject({
      dealId: 'deal-1',
      aggregateType: 'checklist_item',
      aggregateId: 'item-1',
      eventType: 'checklist_item.status_changed',
      payload: { status: 'requested' },
    });
    expect((input.payload as { requested_at: string }).requested_at).toEqual(
      expect.any(String),
    );
  });
});
