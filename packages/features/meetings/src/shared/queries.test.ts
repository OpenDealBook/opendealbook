import { describe, expect, it } from 'vitest';

import {
  fetchMeeting,
  fetchMeetingActionItems,
  fetchMeetings,
} from './queries';

function stubClient(
  expectedTable: string,
  result: { data: unknown; error: unknown },
) {
  const filters: Array<[string, unknown]> = [];
  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.select = chain;
  builder.order = chain;
  builder.single = async () => result;
  builder.eq = (column: string, value: unknown) => {
    filters.push([column, value]);
    return builder;
  };
  builder.then = (resolve: (value: unknown) => void) => resolve(result);

  const client = {
    filters,
    from: (name: string) => {
      expect(name).toBe(expectedTable);
      return builder;
    },
  };

  return client;
}

describe('fetchMeetings', () => {
  it('returns the meetings filtered by deal id', async () => {
    const rows = [{ id: 'meeting-1', deal_id: 'deal-1' }];
    const client = stubClient('meeting', { data: rows, error: null });

    const result = await fetchMeetings(client as never, 'deal-1');

    expect(result).toBe(rows);
    expect(client.filters).toContainEqual(['deal_id', 'deal-1']);
  });

  it('throws when the query errors', async () => {
    const client = stubClient('meeting', {
      data: null,
      error: new Error('boom'),
    });

    await expect(fetchMeetings(client as never, 'deal-1')).rejects.toThrow(
      'boom',
    );
  });
});

describe('fetchMeeting', () => {
  it('returns the meeting filtered by id', async () => {
    const row = { id: 'meeting-1' };
    const client = stubClient('meeting', { data: row, error: null });

    const result = await fetchMeeting(client as never, 'meeting-1');

    expect(result).toBe(row);
    expect(client.filters).toContainEqual(['id', 'meeting-1']);
  });

  it('throws when the query errors', async () => {
    const client = stubClient('meeting', {
      data: null,
      error: new Error('boom'),
    });

    await expect(fetchMeeting(client as never, 'meeting-1')).rejects.toThrow(
      'boom',
    );
  });
});

describe('fetchMeetingActionItems', () => {
  it('returns the action items filtered by deal id', async () => {
    const rows = [{ id: 'item-1', deal_id: 'deal-1' }];
    const client = stubClient('meeting_action_item', {
      data: rows,
      error: null,
    });

    const result = await fetchMeetingActionItems(client as never, 'deal-1');

    expect(result).toBe(rows);
    expect(client.filters).toContainEqual(['deal_id', 'deal-1']);
  });

  it('throws when the query errors', async () => {
    const client = stubClient('meeting_action_item', {
      data: null,
      error: new Error('boom'),
    });

    await expect(
      fetchMeetingActionItems(client as never, 'deal-1'),
    ).rejects.toThrow('boom');
  });
});
