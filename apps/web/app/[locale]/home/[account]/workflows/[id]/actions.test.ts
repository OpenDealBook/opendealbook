import { beforeEach, expect, it, vi } from 'vitest';

const ACCOUNT = '00000000-0000-4000-8000-0000000000a1';
const RUN = '00000000-0000-4000-8000-0000000000b1';
const WORKFLOW = '00000000-0000-4000-8000-0000000000c1';

const world = vi.hoisted(() => ({
  canManage: true,
  refuse: null as null | (() => never),
  calls: [] as { runner: string; input: unknown }[],
}));

const { RunActionRefused } = vi.hoisted(() => ({
  RunActionRefused: class extends Error {
    constructor(readonly reason: string) {
      super(
        {
          runner_unreachable: "Couldn't reach the runner, try again",
          step_data_removed:
            'Step data was removed after 90 days. Run the workflow again instead.',
          run_changed: 'This run already changed. Refresh to see its status.',
        }[reason],
      );
    }
  },
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: { id: string }) => Promise<unknown>) =>
    (input: unknown) =>
      fn(input, { id: 'user-1' }),
}));

vi.mock('@odb/workflows/builder/client', () => ({
  RunActionRefused,
  cancelWorkflowRun: async (input: unknown) => {
    world.calls.push({ runner: 'cancelWorkflowRun', input });
    world.refuse?.();
  },
  retryWorkflowRun: async (input: unknown) => {
    world.calls.push({ runner: 'retryWorkflowRun', input });
    world.refuse?.();
  },
  cancelWaitingRuns: async (input: unknown) => {
    world.calls.push({ runner: 'cancelWaitingRuns', input });

    return { cancelled: 2, unreached: 1 };
  },
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    rpc: (
      name: string,
      args: { user_id: string; account_id: string; permission_name: string },
    ) => ({
      throwOnError: async () => ({
        data:
          name === 'has_permission' &&
          args.user_id === 'user-1' &&
          args.account_id === ACCOUNT &&
          args.permission_name === 'workflows.manage' &&
          world.canManage,
      }),
    }),
  }),
}));

import {
  cancelRunAction,
  cancelWaitingRunsAction,
  retryRunAction,
} from './actions';

beforeEach(() => {
  world.canManage = true;
  world.refuse = null;
  world.calls = [];
});

it('cancels a run for a workflows manager', async () => {
  await expect(
    cancelRunAction({ accountId: ACCOUNT, runId: RUN }),
  ).resolves.toEqual({ ok: true, value: undefined });
  expect(world.calls).toEqual([
    { runner: 'cancelWorkflowRun', input: { accountId: ACCOUNT, runId: RUN } },
  ]);
});

it('retries a run for a workflows manager', async () => {
  await expect(
    retryRunAction({ accountId: ACCOUNT, runId: RUN }),
  ).resolves.toEqual({ ok: true, value: undefined });
  expect(world.calls).toEqual([
    { runner: 'retryWorkflowRun', input: { accountId: ACCOUNT, runId: RUN } },
  ]);
});

it('cancels waiting runs and returns how many', async () => {
  await expect(
    cancelWaitingRunsAction({ accountId: ACCOUNT, workflowId: WORKFLOW }),
  ).resolves.toEqual({ ok: true, value: { cancelled: 2, unreached: 1 } });
  expect(world.calls).toEqual([
    {
      runner: 'cancelWaitingRuns',
      input: { accountId: ACCOUNT, workflowId: WORKFLOW },
    },
  ]);
});

it('refuses every action without workflows.manage and touches no run', async () => {
  world.canManage = false;
  const refused = {
    ok: false,
    refusal: 'Cancelling or retrying runs needs workflows.manage',
  };

  await expect(
    cancelRunAction({ accountId: ACCOUNT, runId: RUN }),
  ).resolves.toEqual(refused);
  await expect(
    retryRunAction({ accountId: ACCOUNT, runId: RUN }),
  ).resolves.toEqual(refused);
  await expect(
    cancelWaitingRunsAction({ accountId: ACCOUNT, workflowId: WORKFLOW }),
  ).resolves.toEqual(refused);
  expect(world.calls).toEqual([]);
});

it('refuses a retry the runner cannot reach, with the runner message', async () => {
  world.refuse = () => {
    throw new RunActionRefused('runner_unreachable');
  };

  await expect(
    retryRunAction({ accountId: ACCOUNT, runId: RUN }),
  ).resolves.toEqual({
    ok: false,
    refusal: "Couldn't reach the runner, try again",
  });
  await expect(
    cancelRunAction({ accountId: ACCOUNT, runId: RUN }),
  ).resolves.toEqual({
    ok: false,
    refusal: "Couldn't reach the runner, try again",
  });
});

it('refuses a retry whose step data was removed, with the runner message', async () => {
  world.refuse = () => {
    throw new RunActionRefused('step_data_removed');
  };

  await expect(
    retryRunAction({ accountId: ACCOUNT, runId: RUN }),
  ).resolves.toEqual({
    ok: false,
    refusal:
      'Step data was removed after 90 days. Run the workflow again instead.',
  });
});

it('still fails loudly on an unexpected runner error', async () => {
  world.refuse = () => {
    throw new Error('connection reset');
  };

  await expect(
    retryRunAction({ accountId: ACCOUNT, runId: RUN }),
  ).rejects.toThrow('connection reset');
});

it('refuses a retry or cancel on a run that already changed, with the runner message', async () => {
  world.refuse = () => {
    throw new RunActionRefused('run_changed');
  };
  const changed = {
    ok: false,
    refusal: 'This run already changed. Refresh to see its status.',
  };

  await expect(
    retryRunAction({ accountId: ACCOUNT, runId: RUN }),
  ).resolves.toEqual(changed);
  await expect(
    cancelRunAction({ accountId: ACCOUNT, runId: RUN }),
  ).resolves.toEqual(changed);
});
