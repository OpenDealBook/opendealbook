import { beforeEach, describe, expect, it, vi } from 'vitest';

import { COMP_EVENT_RELAY_WORKFLOW_ID } from '../ids';
import { compEventRelay } from '../workflows/compEventRelay';

const savedCursors = new Map<string, number>();
const recorded: number[] = [];
const failing = new Set<number>();
const attempts = new Map<number, number>();
const setAside: unknown[] = [];

const events = [1, 2, 3, 4].map((globalSeq) => ({
  globalSeq,
  dealId: '00000000-0000-0000-0000-000000000001',
  dealSeq: globalSeq,
  aggregateType: 'deal',
  eventType: 'deal.note_added',
  resolution: null,
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
    saveRelayCursor: async (input: { name: string; lastGlobalSeq: number }) => {
      savedCursors.set(input.name, input.lastGlobalSeq);
    },
    fetchDealEventsSince: async (input: { afterGlobalSeq: number }) =>
      events.filter((event) => event.globalSeq > input.afterGlobalSeq),
    recordDealActivity: async (input: { dealSeq: number }) => {
      attempts.set(input.dealSeq, (attempts.get(input.dealSeq) ?? 0) + 1);
      if (failing.has(input.dealSeq)) {
        throw new Error(`Cannot record deal seq ${input.dealSeq}`);
      }
      recorded.push(input.dealSeq);
    },
    detectDuplicates: async () => {},
    anonymizeClose: async () => {},
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
  recorded.length = 0;
  failing.clear();
  attempts.clear();
  setAside.length = 0;
});

describe('comp event relay after a restart', () => {
  it('resumes after the saved position instead of replaying from the start', async () => {
    savedCursors.set(COMP_EVENT_RELAY_WORKFLOW_ID, 2);

    await expect(compEventRelay()).rejects.toBeInstanceOf(ContinuedAsNew);

    expect(recorded).toEqual([3, 4]);
  });

  it('saves the position reached by the processed batch', async () => {
    savedCursors.set(COMP_EVENT_RELAY_WORKFLOW_ID, 1);

    await expect(compEventRelay()).rejects.toBeInstanceOf(ContinuedAsNew);

    expect(savedCursors.get(COMP_EVENT_RELAY_WORKFLOW_ID)).toBe(4);
  });

  it('sets aside an event that fails five times and relays the rest of the batch', async () => {
    savedCursors.set(COMP_EVENT_RELAY_WORKFLOW_ID, 1);
    failing.add(3);

    await expect(compEventRelay()).rejects.toBeInstanceOf(ContinuedAsNew);

    expect(attempts.get(3)).toBe(5);
    expect(recorded).toEqual([2, 4]);
    expect(setAside).toEqual([
      {
        relayName: COMP_EVENT_RELAY_WORKFLOW_ID,
        globalSeq: 3,
        error: 'Cannot record deal seq 3',
        attempts: 5,
      },
    ]);
    expect(savedCursors.get(COMP_EVENT_RELAY_WORKFLOW_ID)).toBe(4);
  });
});
