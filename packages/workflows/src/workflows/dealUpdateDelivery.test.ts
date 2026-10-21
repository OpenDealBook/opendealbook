import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  attemptsLeft: 0,
  log: [] as string[],
}));

vi.mock('@temporalio/workflow', async () => {
  const common = await import('@temporalio/common');

  return {
    ActivityFailure: common.ActivityFailure,
    proxyActivities: () => ({
      deliverDealUpdate: async () => {
        world.log.push('deliver');

        if (world.attemptsLeft === 0) {
          throw new common.ActivityFailure(
            'retries exhausted',
            'deliverDealUpdate',
            'a1',
            common.RetryState.MAXIMUM_ATTEMPTS_REACHED,
            'worker',
          );
        }
      },
      finishDealUpdateDelivery: async () => {
        world.log.push('finish');
      },
    }),
  };
});

const { dealUpdateDelivery } = await import('./dealUpdateDelivery');

const input = { updateId: 'u1', origin: 'https://app.odb.test' };

beforeEach(() => {
  world.log = [];
});

describe('dealUpdateDelivery', () => {
  it('delivers, then finishes the update', async () => {
    world.attemptsLeft = 1;

    await dealUpdateDelivery(input);

    expect(world.log).toEqual(['deliver', 'finish']);
  });

  it('still finishes the update once delivery runs out of retries', async () => {
    world.attemptsLeft = 0;

    await expect(dealUpdateDelivery(input)).resolves.toBeUndefined();
    expect(world.log).toEqual(['deliver', 'finish']);
  });
});
