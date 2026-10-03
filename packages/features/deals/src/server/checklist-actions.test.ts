import { beforeEach, describe, expect, it, vi } from 'vitest';

const GENERATED_ID = '00000000-0000-0000-0000-000000000001';

const mocks = vi.hoisted(() => {
  const appendDealEvent = vi.fn(async () => [{ deal_seq: 1, aggregate_seq: 1 }]);
  const appendDealEvents = vi.fn(async () => [
    { deal_seq: 1, aggregate_seq: 1 },
  ]);

  let templateItems: unknown[] = [];

  function setTemplateItems(next: unknown[]) {
    templateItems = next;
  }

  function dataFor(table: string): unknown {
    if (table === 'checklist_template_item') {
      return templateItems;
    }

    return { id: `${table}-1` };
  }

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = chain;
    builder.eq = chain;
    builder.order = chain;
    builder.throwOnError = chain;
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({ data: dataFor(table), error: null });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));

  return { appendDealEvent, appendDealEvents, from, setTemplateItems };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));

vi.mock('@odb/events', () => ({
  appendDealEvent: mocks.appendDealEvent,
  appendDealEvents: mocks.appendDealEvents,
}));

import { addChecklistItem, applyChecklistTemplate } from './checklist-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

const runApplyChecklistTemplate = applyChecklistTemplate as unknown as Action;
const runAddChecklistItem = addChecklistItem as unknown as Action;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setTemplateItems([]);
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(
    GENERATED_ID as ReturnType<typeof crypto.randomUUID>,
  );
});

describe('applyChecklistTemplate', () => {
  it('appends one checklist_item.added event per template item with the mapped fields', async () => {
    mocks.setTemplateItems([
      {
        title: 'Signed NDA',
        category: 'legal',
        priority: 2,
        deal_killer: true,
        due_offset_days: 5,
        owner_role: 'seller',
        importance: 'required',
        offer_term_key: null,
      },
      {
        title: 'Tax returns',
        category: 'financial',
        priority: 0,
        deal_killer: false,
        due_offset_days: null,
        owner_role: 'cpa',
        importance: 'nice_to_have',
        offer_term_key: null,
      },
    ]);

    await runApplyChecklistTemplate(
      { deal_id: 'deal-1', template_id: 'template-9' },
      { id: 'user-1' },
    );

    const [, dealId, events] = mocks.appendDealEvents.mock.calls.at(
      -1,
    ) as unknown as [
      unknown,
      string,
      Array<{
        aggregateType: string;
        eventType: string;
        payload: Record<string, unknown>;
      }>,
    ];

    expect(dealId).toBe('deal-1');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      aggregateType: 'checklist_item',
      eventType: 'checklist_item.added',
      payload: {
        title: 'Signed NDA',
        category: 'legal',
        priority: 2,
        deal_killer: true,
        due_offset_days: 5,
        owner_role: 'seller',
        importance: 'required',
      },
    });
    expect(events[1]?.payload).toMatchObject({
      title: 'Tax returns',
      category: 'financial',
      owner_role: 'cpa',
      importance: 'nice_to_have',
    });
  });

  it('appends nothing when the template has no items', async () => {
    await runApplyChecklistTemplate(
      { deal_id: 'deal-1', template_id: 'template-empty' },
      { id: 'user-1' },
    );

    expect(mocks.appendDealEvents).not.toHaveBeenCalled();
  });
});

describe('addChecklistItem', () => {
  it('appends a checklist_item.added event carrying the title', async () => {
    const result = await runAddChecklistItem(
      { deal_id: 'deal-1', title: 'Confirm lease transfer' },
      { id: 'user-1' },
    );

    expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
      dealId: 'deal-1',
      aggregateType: 'checklist_item',
      aggregateId: GENERATED_ID,
      eventType: 'checklist_item.added',
      payload: { title: 'Confirm lease transfer' },
    });
    expect(result).toBe(GENERATED_ID);
  });
});
