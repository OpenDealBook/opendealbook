import { afterEach, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  calls: [] as string[],
  heartbeats: 0,
  finish: () => {},
}));

vi.mock('@temporalio/activity', () => ({
  Context: {
    current: () => ({
      heartbeat: () => {
        fakes.heartbeats += 1;
      },
    }),
  },
}));

vi.mock('@odb/deal-timeline/overdue.ts', () => ({
  notifyOverdueMilestones: (at: string) =>
    new Promise<void>((resolve) => {
      fakes.calls.push(at);
      fakes.finish = resolve;
    }),
}));

const { notifyOverdueMilestones } = await import('./milestoneOverdueActivity');

afterEach(() => {
  vi.useRealTimers();
});

it('heartbeats while the overdue notices are sent and stops once they are done', async () => {
  vi.useFakeTimers();

  const running = notifyOverdueMilestones('2026-11-02T13:00:00.000Z');
  await vi.advanceTimersByTimeAsync(25_000);
  const whileRunning = fakes.heartbeats;
  fakes.finish();
  await running;
  await vi.advanceTimersByTimeAsync(60_000);

  expect(fakes.calls).toEqual(['2026-11-02T13:00:00.000Z']);
  expect(whileRunning).toBe(3);
  expect(fakes.heartbeats).toBe(whileRunning);
});
