import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventLogName } from './client';
import type { LoggedEvent, RelayCursor } from './eventRelayActivities';
import { workflowEventRelay } from './eventRelay';
import { eventRelayCursorName } from './eventRelayStart';

const savedCursors = new Map<string, RelayCursor>();
const started: string[] = [];
const failing = new Set<string>();
const attempts = new Map<string, number>();
const setAside: unknown[] = [];
const horizon = { xid: '20', seq: 0 };

function eventsOf(log: EventLogName, events: [xid: string, seq: number][]): LoggedEvent[] {
  return events.map(([xid, globalSeq]) => ({
    log,
    xid,
    globalSeq,
    accountId: '00000000-0000-0000-0000-000000000002',
    eventType: log === 'deal' ? 'deal.created' : 'firm.approved',
    payload: {},
  }));
}

let logs: Record<EventLogName, LoggedEvent[]>;

const key = (event: LoggedEvent) => `${event.log}#${event.globalSeq}`;
const after = (event: LoggedEvent, cursor: RelayCursor) =>
  BigInt(event.xid) > BigInt(cursor.xid) ||
  (event.xid === cursor.xid && event.globalSeq > cursor.seq);

class ContinuedAsNew {
  constructor(readonly input: unknown) {}
}

const temporal = vi.hoisted(() => {
  class ActivityFailure extends Error {
    constructor(readonly cause: Error) {
      super('Activity task failed');
    }
  }
  const retrying =
    (maximumAttempts: number) =>
    <T extends Record<string, (input: never) => Promise<unknown>>>(activities: T) =>
      Object.fromEntries(
        Object.entries(activities).map(([name, activity]) => [
          name,
          async (input: never) => {
            for (let attempt = 1; ; attempt++) {
              try {
                return await activity(input);
              } catch (error) {
                if (attempt >= maximumAttempts) {
                  throw new ActivityFailure(error as Error);
                }
              }
            }
          },
        ]),
      ) as T;
  return { ActivityFailure, retrying };
});

vi.mock('@temporalio/workflow', () => ({
  ActivityFailure: temporal.ActivityFailure,
  proxyActivities: (options: { retry?: { maximumAttempts?: number } }) =>
    temporal.retrying(options.retry?.maximumAttempts ?? 100)({
      loadEventRelayCursor: async (name: string) => savedCursors.get(name) ?? null,
      startEventRelayCursorAtLatest: async (input: { name: string }) => {
        savedCursors.set(input.name, horizon);
        return horizon;
      },
      saveEventRelayCursor: async (input: { name: string; cursor: RelayCursor }) => {
        savedCursors.set(input.name, input.cursor);
      },
      fetchTriggerEvents: async (input: { log: EventLogName; after: RelayCursor }) =>
        logs[input.log].filter((event) => after(event, input.after)),
      startWorkflowRunsForEvent: async (event: LoggedEvent) => {
        attempts.set(key(event), (attempts.get(key(event)) ?? 0) + 1);
        if (failing.has(key(event))) {
          throw new Error(`Cannot match ${key(event)}`);
        }
        started.push(key(event));
      },
      recordRelayFailedEvent: async (input: unknown) => {
        setAside.push(input);
      },
    }),
  sleep: async () => {},
  continueAsNew: async (input: unknown) => {
    throw new ContinuedAsNew(input);
  },
}));

const dealCursor = eventRelayCursorName('deal');
const accountCursor = eventRelayCursorName('account');
const start = { xid: '0', seq: 0 };

beforeEach(() => {
  logs = {
    deal: eventsOf('deal', [['10', 1], ['10', 2], ['11', 3], ['12', 4]]),
    account: eventsOf('account', [['10', 1], ['13', 2]]),
  };
  savedCursors.clear();
  started.length = 0;
  failing.clear();
  attempts.clear();
  setAside.length = 0;
});

describe('workflow event relay', () => {
  it('on its first start begins at the settled horizon of both logs', async () => {
    await expect(workflowEventRelay()).rejects.toEqual(
      new ContinuedAsNew({ deal: horizon, account: horizon }),
    );

    expect(started).toEqual([]);
    expect(savedCursors.get(dealCursor)).toEqual(horizon);
    expect(savedCursors.get(accountCursor)).toEqual(horizon);
  });

  it('resumes each log after its saved position, deal log first', async () => {
    savedCursors.set(dealCursor, { xid: '10', seq: 2 });
    savedCursors.set(accountCursor, start);

    await expect(workflowEventRelay()).rejects.toBeInstanceOf(ContinuedAsNew);

    expect(started).toEqual(['deal#3', 'deal#4', 'account#1', 'account#2']);
  });

  it('saves the transaction and sequence each log reached', async () => {
    savedCursors.set(dealCursor, start);
    savedCursors.set(accountCursor, start);

    await expect(workflowEventRelay()).rejects.toEqual(
      new ContinuedAsNew({ deal: { xid: '12', seq: 4 }, account: { xid: '13', seq: 2 } }),
    );

    expect(savedCursors.get(dealCursor)).toEqual({ xid: '12', seq: 4 });
  });

  it('still relays a lower sequence that settles after a higher one', async () => {
    savedCursors.set(dealCursor, start);
    savedCursors.set(accountCursor, { xid: '13', seq: 2 });
    logs.deal = eventsOf('deal', [['10', 1], ['11', 3]]);
    await expect(workflowEventRelay()).rejects.toBeInstanceOf(ContinuedAsNew);

    logs.deal = eventsOf('deal', [['10', 1], ['11', 3], ['12', 2]]);
    await expect(workflowEventRelay()).rejects.toBeInstanceOf(ContinuedAsNew);

    expect(started).toEqual(['deal#1', 'deal#3', 'deal#2']);
  });

  it('sets aside an event that fails five times under its log and relays the rest', async () => {
    savedCursors.set(dealCursor, { xid: '10', seq: 1 });
    savedCursors.set(accountCursor, { xid: '13', seq: 2 });
    failing.add('deal#3');

    await expect(workflowEventRelay()).rejects.toBeInstanceOf(ContinuedAsNew);

    expect(attempts.get('deal#3')).toBe(5);
    expect(started).toEqual(['deal#2', 'deal#4']);
    expect(setAside).toEqual([
      { relayName: dealCursor, globalSeq: 3, error: 'Cannot match deal#3', attempts: 5 },
    ]);
    expect(savedCursors.get(dealCursor)).toEqual({ xid: '12', seq: 4 });
  });
});
