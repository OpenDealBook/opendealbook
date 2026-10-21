import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEAL_EVENT_NOTIFICATION_RELAY_WORKFLOW_ID } from '../ids';
import { dealEventNotificationRelay } from '../workflows/dealEventNotificationRelay';

const savedCursors = new Map<string, number>();
const notified: number[] = [];
const failing = new Set<number>();
const attempts = new Map<number, number>();
const setAside: unknown[] = [];

const events = [1, 2, 3, 4].map((globalSeq) => ({
  globalSeq,
  dealId: '00000000-0000-0000-0000-000000000001',
  accountId: '00000000-0000-0000-0000-000000000002',
  actorRef: null,
  eventType: 'deal.resolved',
  stage: null,
}));

class ContinuedAsNew {}

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
    loadRelayCursor: async (name: string) => savedCursors.get(name) ?? null,
    startRelayCursorAtLatest: async (name: string) => {
      const latest = Math.max(...events.map((event) => event.globalSeq));
      savedCursors.set(name, latest);
      return latest;
    },
    saveRelayCursor: async (input: { name: string; lastGlobalSeq: number }) => {
      savedCursors.set(input.name, input.lastGlobalSeq);
    },
    fetchDealNotificationEvents: async (input: { afterGlobalSeq: number }) =>
      events.filter((event) => event.globalSeq > input.afterGlobalSeq),
    notifyDealEvent: async (input: { globalSeq: number }) => {
      attempts.set(input.globalSeq, (attempts.get(input.globalSeq) ?? 0) + 1);
      if (failing.has(input.globalSeq)) {
        throw new Error(`Cannot coerce event ${input.globalSeq}`);
      }
      notified.push(input.globalSeq);
    },
    recordRelayFailedEvent: async (input: unknown) => {
      setAside.push(input);
    },
  }),
  sleep: async () => {},
  continueAsNew: async () => {
    throw new ContinuedAsNew();
  },
}));

beforeEach(() => {
  savedCursors.clear();
  notified.length = 0;
  failing.clear();
  attempts.clear();
  setAside.length = 0;
});

describe('deal event notification relay after a restart', () => {
  it('resumes after the saved position instead of replaying from the start', async () => {
    savedCursors.set(DEAL_EVENT_NOTIFICATION_RELAY_WORKFLOW_ID, 2);

    await expect(dealEventNotificationRelay()).rejects.toBeInstanceOf(ContinuedAsNew);

    expect(notified).toEqual([3, 4]);
  });

  it('on its first start notifies nothing already in the log', async () => {
    await expect(dealEventNotificationRelay()).rejects.toBeInstanceOf(ContinuedAsNew);

    expect(notified).toEqual([]);
  });

  it('saves the position reached by the processed batch', async () => {
    savedCursors.set(DEAL_EVENT_NOTIFICATION_RELAY_WORKFLOW_ID, 1);

    await expect(dealEventNotificationRelay()).rejects.toBeInstanceOf(ContinuedAsNew);

    expect(savedCursors.get(DEAL_EVENT_NOTIFICATION_RELAY_WORKFLOW_ID)).toBe(4);
  });

  it('sets aside an event that fails five times and relays the rest of the batch', async () => {
    savedCursors.set(DEAL_EVENT_NOTIFICATION_RELAY_WORKFLOW_ID, 1);
    failing.add(3);

    await expect(dealEventNotificationRelay()).rejects.toBeInstanceOf(ContinuedAsNew);

    expect(attempts.get(3)).toBe(5);
    expect(notified).toEqual([2, 4]);
    expect(setAside).toEqual([
      {
        relayName: DEAL_EVENT_NOTIFICATION_RELAY_WORKFLOW_ID,
        globalSeq: 3,
        error: 'Cannot coerce event 3',
        attempts: 5,
      },
    ]);
    expect(savedCursors.get(DEAL_EVENT_NOTIFICATION_RELAY_WORKFLOW_ID)).toBe(4);
  });
});
