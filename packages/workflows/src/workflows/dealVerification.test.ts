import { beforeEach, describe, expect, it, vi } from 'vitest';

type Wait = 'upload' | 'quiet';

const world = vi.hoisted(() => ({
  log: [] as string[],
  waits: [] as Wait[],
  uploadDuringVerification: false,
  onUpload: undefined as undefined | (() => void),
}));

vi.mock('@temporalio/workflow', () => ({
  defineSignal: (name: string) => name,
  setHandler: (_signal: string, handler: () => void) => {
    world.onUpload = handler;
  },
  condition: async (settled: () => boolean, timeout: string) => {
    const next = world.waits.shift();

    if (next === undefined) {
      throw new Error('waited more times than the test scripted');
    }

    world.log.push(`wait ${timeout}`);

    if (next === 'upload') {
      world.log.push('upload');
      world.onUpload!();
    }

    return settled();
  },
  proxyActivities: () => ({
    runDealVerification: async ({ dealId }: { dealId: string }) => {
      world.log.push(`verify ${dealId}`);

      if (world.uploadDuringVerification) {
        world.uploadDuringVerification = false;
        world.log.push('upload');
        world.onUpload!();
      }
    },
  }),
}));

const { dealVerification, DEAL_VERIFICATION_QUIET_PERIOD } =
  await import('./dealVerification');

beforeEach(() => {
  world.log = [];
  world.waits = [];
  world.uploadDuringVerification = false;
});

describe('dealVerification', () => {
  it('verifies the deal once a quiet period passes with no new document', async () => {
    world.waits = ['quiet'];

    await dealVerification({ dealId: 'deal1' });

    expect(world.log).toEqual([
      `wait ${DEAL_VERIFICATION_QUIET_PERIOD}`,
      'verify deal1',
    ]);
  });

  it('restarts the quiet period on each new document and verifies once after the last', async () => {
    world.waits = ['upload', 'upload', 'upload', 'quiet'];

    await dealVerification({ dealId: 'deal1' });

    expect(world.log.filter((entry) => entry.startsWith('verify'))).toEqual([
      'verify deal1',
    ]);
    expect(world.log.slice(-2)).toEqual([
      `wait ${DEAL_VERIFICATION_QUIET_PERIOD}`,
      'verify deal1',
    ]);
  });

  it('verifies again after a document that lands while verification runs', async () => {
    world.waits = ['quiet', 'quiet'];
    world.uploadDuringVerification = true;

    await dealVerification({ dealId: 'deal1' });

    expect(world.log).toEqual([
      `wait ${DEAL_VERIFICATION_QUIET_PERIOD}`,
      'verify deal1',
      'upload',
      `wait ${DEAL_VERIFICATION_QUIET_PERIOD}`,
      'verify deal1',
    ]);
  });
});
