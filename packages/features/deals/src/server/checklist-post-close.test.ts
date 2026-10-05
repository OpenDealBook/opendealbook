import { beforeEach, describe, expect, it, vi } from 'vitest';

const GENERATED_ID = '00000000-0000-0000-0000-000000000002';

const mocks = vi.hoisted(() => {
  const appendDealEvents = vi.fn(async () => [
    { deal_seq: 1, aggregate_seq: 1 },
  ]);

  let templateItems: unknown[] = [];
  let templateKind: string | null = null;
  let closeDate: string | null = null;

  function setScenario(next: {
    items: unknown[];
    kind: string | null;
    closeDate: string | null;
  }) {
    templateItems = next.items;
    templateKind = next.kind;
    closeDate = next.closeDate;
  }

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = chain;
    builder.eq = chain;
    builder.order = chain;
    builder.throwOnError = chain;
    builder.single = () => {
      const result: Record<string, unknown> = {};
      result.throwOnError = () => result;
      result.then = (resolve: (value: unknown) => void) =>
        resolve({ data: { close_date: closeDate }, error: null });
      return result;
    };
    builder.then = (resolve: (value: unknown) => void) => {
      if (table === 'checklist_template_item') {
        return resolve({ data: templateItems, error: null });
      }

      if (table === 'checklist_template') {
        return resolve({ data: [{ kind: templateKind }], error: null });
      }

      return resolve({ data: null, error: null });
    };

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));

  return { appendDealEvents, from, setScenario };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));

vi.mock('@odb/events', () => ({
  appendDealEvent: vi.fn(),
  appendDealEvents: mocks.appendDealEvents,
}));

import { applyChecklistTemplate } from './checklist-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

const runApplyChecklistTemplate = applyChecklistTemplate as unknown as Action;

function emittedPayloads() {
  const [, , events] = mocks.appendDealEvents.mock.calls.at(-1) as unknown as [
    unknown,
    string,
    Array<{ payload: Record<string, unknown> }>,
  ];

  return events.map((event) => event.payload);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(
    GENERATED_ID as ReturnType<typeof crypto.randomUUID>,
  );
});

describe('applyChecklistTemplate post_close anchoring', () => {
  it('sets due_at to close_date plus due_offset_days for a post_close template', async () => {
    mocks.setScenario({
      kind: 'post_close',
      closeDate: '2026-01-15',
      items: [
        { title: 'Takeover task', due_offset_days: 0 },
        { title: 'Week one task', due_offset_days: 7 },
      ],
    });

    await runApplyChecklistTemplate(
      { deal_id: 'deal-1', template_id: 'template-pc' },
      { id: 'user-1' },
    );

    const payloads = emittedPayloads();

    expect(payloads[0]?.due_at).toBe('2026-01-15T00:00:00.000Z');
    expect(payloads[1]?.due_at).toBe('2026-01-22T00:00:00.000Z');
  });

  it('leaves due_at null when the deal has no close_date', async () => {
    mocks.setScenario({
      kind: 'post_close',
      closeDate: null,
      items: [{ title: 'Takeover task', due_offset_days: 7 }],
    });

    await runApplyChecklistTemplate(
      { deal_id: 'deal-1', template_id: 'template-pc' },
      { id: 'user-1' },
    );

    expect(emittedPayloads()[0]?.due_at).toBeNull();
  });

  it('leaves due_at null when the item has no due_offset_days', async () => {
    mocks.setScenario({
      kind: 'post_close',
      closeDate: '2026-01-15',
      items: [{ title: 'Takeover task', due_offset_days: null }],
    });

    await runApplyChecklistTemplate(
      { deal_id: 'deal-1', template_id: 'template-pc' },
      { id: 'user-1' },
    );

    expect(emittedPayloads()[0]?.due_at).toBeNull();
  });
});
