import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const insertSpy = vi.fn();
  const updateSpy = vi.fn();

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
      resolve({ data: { id: `${table}-1` }, error: null });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));

  return { insertSpy, updateSpy, from };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));

import {
  addMeetingActionItem,
  completeMeetingActionItem,
  createMeetingSeries,
  scheduleMeeting,
  updateMeetingSeries,
} from './meeting-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

const runCreateMeetingSeries = createMeetingSeries as unknown as Action;
const runUpdateMeetingSeries = updateMeetingSeries as unknown as Action;
const runScheduleMeeting = scheduleMeeting as unknown as Action;
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
  it('inserts a meeting carrying its type and deal', async () => {
    await runScheduleMeeting(
      {
        account_id: 'account-1',
        deal_id: 'deal-1',
        type: 'weekly',
        scheduled_at: '2026-10-01T15:00:00.000Z',
      },
      user,
    );

    expect(insertFor('meeting')).toMatchObject({
      account_id: 'account-1',
      deal_id: 'deal-1',
      type: 'weekly',
      scheduled_at: '2026-10-01T15:00:00.000Z',
    });
  });

  it('carries a valid status through to the insert', async () => {
    await runScheduleMeeting(
      {
        account_id: 'account-1',
        deal_id: 'deal-1',
        type: 'weekly',
        status: 'held',
      },
      user,
    );

    expect(insertFor('meeting')).toMatchObject({ status: 'held' });
  });
});

describe('addMeetingActionItem', () => {
  it('records the assignee and due date on the action item', async () => {
    await runAddMeetingActionItem(
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

    expect(insertFor('meeting_action_item')).toMatchObject({
      meeting_id: 'meeting-1',
      deal_id: 'deal-1',
      description: 'Send updated P&L',
      owner_user_id: 'user-2',
      due_at: '2026-10-05T00:00:00.000Z',
    });
  });
});

describe('completeMeetingActionItem', () => {
  it('marks the action item reviewed', async () => {
    await runCompleteMeetingActionItem({ id: 'item-1' }, user);

    expect(lastUpdateFor('meeting_action_item')).toMatchObject({
      status: 'reviewed',
    });
  });
});
