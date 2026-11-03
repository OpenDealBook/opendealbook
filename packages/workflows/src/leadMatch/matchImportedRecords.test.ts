import { afterEach, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
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

vi.mock('@odb/supabase/admin', () => {
  const emptyPage = () =>
    new Promise((resolve) => {
      fakes.finish = () => resolve({ data: [] });
    });
  const query: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_, method) => (method === 'throwOnError' ? emptyPage : () => query),
    },
  );
  return { getSupabaseServerAdminClient: () => query };
});

const { matchImportedRecords } = await import('./matchImportedRecords');

afterEach(() => {
  vi.useRealTimers();
});

it('heartbeats while imported records are matched and stops once matching is done', async () => {
  vi.useFakeTimers();

  const running = matchImportedRecords({ source: 'ppp', importId: 'import-1' });
  await vi.advanceTimersByTimeAsync(25_000);
  const whileRunning = fakes.heartbeats;
  fakes.finish();
  await running;
  await vi.advanceTimersByTimeAsync(60_000);

  expect(whileRunning).toBe(3);
  expect(fakes.heartbeats).toBe(whileRunning);
});
