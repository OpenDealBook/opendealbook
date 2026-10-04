import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const insertSpy = vi.fn();
  const updateSpy = vi.fn();
  const appendSpy = vi.fn();

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = chain;
    builder.eq = chain;
    builder.order = chain;
    builder.single = chain;
    builder.maybeSingle = chain;
    builder.throwOnError = chain;
    builder.insert = (payload: unknown) => {
      insertSpy(table, payload);
      return builder;
    };
    builder.update = (payload: unknown) => {
      updateSpy(table, payload);
      return builder;
    };
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({ data: { id: `${table}-1`, deal_id: 'deal-1' }, error: null });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));

  return { insertSpy, updateSpy, appendSpy, from };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));

vi.mock('@odb/events', () => ({
  appendDealEvent: (_client: unknown, input: unknown) => {
    mocks.appendSpy(input);
    return Promise.resolve([{ deal_seq: 1, aggregate_seq: 1 }]);
  },
}));

import {
  addMeetingActionItem,
  completeMeetingActionItem,
  createMeetingSeries,
  scheduleMeeting,
  updateMeeting,
  updateMeetingSeries,
} from './meeting-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

const runCreateMeetingSeries = createMeetingSeries as unknown as Action;
const runUpdateMeetingSeries = updateMeetingSeries as unknown as Action;
const runScheduleMeeting = scheduleMeeting as unknown as Action;
const runUpdateMeeting = updateMeeting as unknown as Action;
const runAddMeetingActionItem = addMeetingActionItem as unknown as Action;
const runCompleteMeetingActionItem =
  completeMeetingActionItem as unknown as Action;

const user = { id: 'user-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

function insertFor(table: string) {
  return mocks.insertSpy.mock.calls.find(([name]) => name === table)?.[1];
}

function lastUpdateFor(table: string) {
  return mocks.updateSpy.mock.calls
    .filter(([name]) => name === table)
    .at(-1)?.[1];
}

function lastAppend() {
  return mocks.appendSpy.mock.calls.at(-1)?.[0] as {
    dealId: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
  };
}

describe('createMeetingSeries', () => {
  it('inserts the series scoped to its deal and account', async () => {
    await runCreateMeetingSeries(
      {
        account_id: 'account-1',
        deal_id: 'deal-1',
        weekday: 2,
        duration_mins: 30,
      },
      user,
    );

    expect(insertFor('meeting_series')).toMatchObject({
      account_id: 'account-1',
      deal_id: 'deal-1',
      weekday: 2,
      duration_mins: 30,
    });
  });
});

describe('updateMeetingSeries', () => {
  it('updates only the fields supplied and never the id', async () => {
    await runUpdateMeetingSeries({ id: 'series-1', status: 'paused' }, user);

    const payload = lastUpdateFor('meeting_series') as Record<string, unknown>;

    expect(payload.status).toBe('paused');
    expect(payload.id).toBeUndefined();
    expect(payload.weekday).toBeUndefined();
  });
});

describe('scheduleMeeting', () => {
  it('appends meeting.scheduled with a generated aggregate id on its deal', async () => {
    const result = await runScheduleMeeting(
      {
        account_id: 'account-1',
        deal_id: 'deal-1',
        series_id: 'series-1',
        type: 'weekly',
        scheduled_at: '2026-10-01T15:00:00.000Z',
      },
      user,
    );

    const append = lastAppend();

    expect(append.eventType).toBe('meeting.scheduled');
    expect(append.aggregateType).toBe('meeting');
    expect(append.dealId).toBe('deal-1');
    expect(typeof append.aggregateId).toBe('string');
    expect(append.aggregateId.length).toBeGreaterThan(0);
    expect(result).toBe(append.aggregateId);
    expect(append.payload).toMatchObject({
      series_id: 'series-1',
      type: 'weekly',
      scheduled_at: '2026-10-01T15:00:00.000Z',
    });
    expect(mocks.insertSpy).not.toHaveBeenCalledWith('meeting', expect.anything());
  });

  it('carries a valid status through in the event payload', async () => {
    await runScheduleMeeting(
      {
        account_id: 'account-1',
        deal_id: 'deal-1',
        type: 'weekly',
        status: 'held',
      },
      user,
    );

    expect(lastAppend().payload).toMatchObject({ status: 'held' });
  });
});

describe('updateMeeting', () => {
  it('appends meeting.updated carrying the changed fields against the meeting', async () => {
    const result = await runUpdateMeeting(
      {
        id: 'meeting-1',
        deal_id: 'deal-1',
        status: 'held',
        decisions: 'Proceed to LOI',
      },
      user,
    );

    const append = lastAppend();

    expect(append.eventType).toBe('meeting.updated');
    expect(append.aggregateType).toBe('meeting');
    expect(append.aggregateId).toBe('meeting-1');
    expect(append.dealId).toBe('deal-1');
    expect(append.payload).toMatchObject({
      status: 'held',
      decisions: 'Proceed to LOI',
    });
    expect(result).toBe('meeting-1');
    expect(mocks.updateSpy).not.toHaveBeenCalledWith(
      'meeting',
      expect.anything(),
    );
  });
});

describe('addMeetingActionItem', () => {
  it('appends meeting_action_item.added carrying the assignee and due date', async () => {
    const result = await runAddMeetingActionItem(
      {
        account_id: 'account-1',
        deal_id: 'deal-1',
        meeting_id: 'meeting-1',
        description: 'Send updated P&L',
        owner_user_id: 'user-2',
        due_at: '2026-10-05T00:00:00.000Z',
      },
      user,
    );

    const append = lastAppend();

    expect(append.eventType).toBe('meeting_action_item.added');
    expect(append.aggregateType).toBe('meeting_action_item');
    expect(append.dealId).toBe('deal-1');
    expect(typeof append.aggregateId).toBe('string');
    expect(result).toBe(append.aggregateId);
    expect(append.payload).toMatchObject({
      meeting_id: 'meeting-1',
      description: 'Send updated P&L',
      owner_user_id: 'user-2',
      owner_is_seller: false,
      due_at: '2026-10-05T00:00:00.000Z',
      status: null,
    });
    expect(mocks.insertSpy).not.toHaveBeenCalledWith(
      'meeting_action_item',
      expect.anything(),
    );
  });
});

describe('completeMeetingActionItem', () => {
  it('appends meeting_action_item.updated to reviewed against the item', async () => {
    await runCompleteMeetingActionItem({ id: 'item-1' }, user);

    const append = lastAppend();

    expect(append.eventType).toBe('meeting_action_item.updated');
    expect(append.aggregateType).toBe('meeting_action_item');
    expect(append.aggregateId).toBe('item-1');
    expect(append.dealId).toBe('deal-1');
    expect(append.payload).toMatchObject({ status: 'reviewed' });
    expect(mocks.updateSpy).not.toHaveBeenCalledWith(
      'meeting_action_item',
      expect.anything(),
    );
  });
});
