import { beforeEach, expect, it, vi } from 'vitest';

const DEAL_ID = '00000000-0000-4000-8000-000000000001';
const REQUEST_ID = '00000000-0000-4000-8000-0000000000aa';

const world = vi.hoisted(() => ({ startBackgroundSearchRun: vi.fn() }));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: { id: string }) => Promise<unknown>) =>
    (input: unknown) =>
      fn(input, { id: 'user-1' }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({}),
}));

vi.mock('@odb/workflows/builder/client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  startBackgroundSearchRun: world.startBackgroundSearchRun,
}));

import { ManualRunRefused } from '@odb/workflows/builder/client';

import { runBackgroundSearch } from './actions';

beforeEach(() => {
  world.startBackgroundSearchRun.mockReset();
});

it('starts the background search for the deal under the request id', async () => {
  world.startBackgroundSearchRun.mockResolvedValue({ runId: 'run-1' });

  expect(await runBackgroundSearch({ dealId: DEAL_ID, requestId: REQUEST_ID })).toEqual({
    ok: true,
    value: { runId: 'run-1' },
  });
  expect(world.startBackgroundSearchRun).toHaveBeenCalledWith(
    expect.objectContaining({ dealId: DEAL_ID, requestId: REQUEST_ID }),
  );
});

it.each([
  ['search_running', 'A background search is already running for this deal'],
  ['search_not_permitted', 'Only deal managers can run a background search. Ask a deal manager.'],
  ['search_changed', 'This workflow was changed, so running it needs workflows.manage'],
] as const)('passes on the %s refusal', async (reason, message) => {
  world.startBackgroundSearchRun.mockRejectedValue(new ManualRunRefused(reason));

  expect(await runBackgroundSearch({ dealId: DEAL_ID, requestId: REQUEST_ID })).toEqual({
    ok: false,
    refusal: message,
  });
});
