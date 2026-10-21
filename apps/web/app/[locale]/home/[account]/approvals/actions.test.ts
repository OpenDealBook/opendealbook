import { beforeEach, describe, expect, it, vi } from 'vitest';

const ACCOUNT = '00000000-0000-4000-8000-0000000000a1';
const RUN = '00000000-0000-4000-8000-0000000000b1';
const STEP = '00000000-0000-4000-8000-0000000000c1';
const VERDICT = '00000000-0000-4000-8000-0000000000d1';
const FACT = '00000000-0000-4000-8000-0000000000e1';

const world = vi.hoisted(() => ({
  writes: [] as { table: string; op: string; row?: unknown; id?: unknown }[],
  signals: [] as unknown[],
  writeError: null as { code: string; message: string } | null,
  signalError: null as Error | null,
  runChanged: null as Error | null,
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: { id: string }) => Promise<unknown>) =>
    (input: unknown) =>
      fn(input, { id: 'user-1' }),
}));

vi.mock('@odb/workflows/builder/client', async (importOriginal) => {
  const { RunActionRefused } =
    await importOriginal<typeof import('@odb/workflows/builder/client')>();
  world.runChanged = new RunActionRefused('run_changed');

  return {
    signalApprovalDecided: async (input: unknown) => {
      if (world.signalError) {
        throw world.signalError;
      }
      world.signals.push(input);
    },
  };
});

function settle(write: (typeof world.writes)[number]) {
  return {
    throwOnError: async () => {
      if (world.writeError) {
        throw Object.assign(
          new Error(world.writeError.message),
          world.writeError,
        );
      }
      world.writes.push(write);
      return { data: null };
    },
  };
}

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    rpc: (name: string, row: unknown) =>
      settle({ table: name, op: 'rpc', row }),
    from: (table: string) => ({
      insert: (row: unknown) => settle({ table, op: 'insert', row }),
      update: (row: unknown) => ({
        eq: (_: string, id: unknown) =>
          settle({ table, op: 'update', row, id }),
      }),
      delete: () => ({
        eq: (_: string, id: unknown) => settle({ table, op: 'delete', id }),
      }),
    }),
  }),
}));

const {
  decideApprovalAction,
  decideVerdictAction,
  revokeVerdictAction,
  addFactAction,
  editFactAction,
  deleteFactAction,
} = await import('./actions');

beforeEach(() => {
  world.writes = [];
  world.signals = [];
  world.writeError = null;
  world.signalError = null;
});

const signalFailures = () =>
  [
    ['the runner is unreachable', new Error('connect ECONNREFUSED')],
    ['the run already changed', world.runChanged!],
  ] as const;

const ALREADY_DECIDED = {
  ok: false,
  refusal: 'This was already decided. Refresh to see it.',
};

const stepRefusals = [
  [
    'a second decision on the step',
    '23505',
    'duplicate key value violates unique constraint',
  ],
  [
    'a decision after the step moved on',
    '42501',
    'new row violates row-level security policy',
  ],
] as const;

describe('deciding a plain approval', () => {
  it('records the decision for the waiting step, then wakes the run', async () => {
    expect(
      await decideApprovalAction({
        accountId: ACCOUNT,
        runId: RUN,
        stepRunId: STEP,
        approved: false,
      }),
    ).toEqual({ ok: true, value: undefined });

    expect(world.writes).toEqual([
      {
        table: 'workflow_approval',
        op: 'insert',
        row: { step_run_id: STEP, account_id: ACCOUNT, approved: false },
      },
    ]);
    expect(world.signals).toEqual([
      { accountId: ACCOUNT, runId: RUN, stepRunId: STEP },
    ]);
  });

  it.each(stepRefusals)(
    'says %s was already decided, without waking the run',
    async (_, code, message) => {
      world.writeError = { code, message };

      expect(
        await decideApprovalAction({
          accountId: ACCOUNT,
          runId: RUN,
          stepRunId: STEP,
          approved: true,
        }),
      ).toEqual(ALREADY_DECIDED);
      expect(world.signals).toEqual([]);
    },
  );

  it('reports the decision saved when waking the run fails, for the hourly recheck to pick up', async () => {
    for (const [, error] of signalFailures()) {
      world.writes = [];
      world.signalError = error;

      expect(
        await decideApprovalAction({
          accountId: ACCOUNT,
          runId: RUN,
          stepRunId: STEP,
          approved: true,
        }),
      ).toEqual({ ok: true, value: undefined });
      expect(world.writes).toHaveLength(1);
    }
  });
});

describe('deciding a verdict', () => {
  const verdictDecision = {
    accountId: ACCOUNT,
    runId: RUN,
    stepRunId: STEP,
    verdictId: VERDICT,
    approved: false,
  };

  it.each(stepRefusals)(
    'says %s was already decided, without waking the run',
    async (_, code, message) => {
      world.writeError = { code, message };

      expect(await decideVerdictAction(verdictDecision)).toEqual(
        ALREADY_DECIDED,
      );
      expect(world.signals).toEqual([]);
    },
  );

  it('reports the decision saved when waking the run fails', async () => {
    for (const [, error] of signalFailures()) {
      world.signalError = error;

      expect(await decideVerdictAction(verdictDecision)).toEqual({
        ok: true,
        value: undefined,
      });
    }
  });

  it('keeps other database errors as errors', async () => {
    world.writeError = {
      code: '23514',
      message: 'overriding a not-fit verdict needs a reason',
    };

    await expect(
      decideVerdictAction({ ...verdictDecision, approved: true }),
    ).rejects.toThrow('overriding a not-fit verdict needs a reason');
  });

  it('approves the verdict with its override reason and decides its step, then wakes the run', async () => {
    await decideVerdictAction({
      accountId: ACCOUNT,
      runId: RUN,
      stepRunId: STEP,
      verdictId: VERDICT,
      approved: true,
      reason: 'Owner is retiring this year',
    });

    expect(world.writes).toEqual([
      {
        table: 'decide_firm_verdict',
        op: 'rpc',
        row: {
          p_step_run_id: STEP,
          p_verdict_id: VERDICT,
          p_approved: true,
          p_reason: 'Owner is retiring this year',
        },
      },
    ]);
    expect(world.signals).toEqual([
      { accountId: ACCOUNT, runId: RUN, stepRunId: STEP },
    ]);
  });

  it('refuses a blank override reason before writing anything', async () => {
    expect(
      await decideVerdictAction({
        accountId: ACCOUNT,
        runId: RUN,
        stepRunId: STEP,
        verdictId: VERDICT,
        approved: true,
        reason: '   ',
      }),
    ).toMatchObject({ ok: false });
    expect(world.writes).toEqual([]);
    expect(world.signals).toEqual([]);
  });
});

describe('revoking an approval', () => {
  it('records the revocation with its reason and leaves the run alone', async () => {
    await revokeVerdictAction({
      accountId: ACCOUNT,
      verdictId: VERDICT,
      reason: 'Owner sold to a competitor',
    });

    expect(world.writes).toEqual([
      {
        table: 'firm_verdict_revocation',
        op: 'insert',
        row: {
          verdict_id: VERDICT,
          account_id: ACCOUNT,
          reason: 'Owner sold to a competitor',
        },
      },
    ]);
    expect(world.signals).toEqual([]);
  });

  it('refuses a revocation without a reason', async () => {
    expect(
      await revokeVerdictAction({
        accountId: ACCOUNT,
        verdictId: VERDICT,
        reason: '',
      }),
    ).toMatchObject({ ok: false });
    expect(world.writes).toEqual([]);
  });
});

describe('team facts', () => {
  it('adds, edits and deletes a fact', async () => {
    await addFactAction({
      accountId: ACCOUNT,
      body: 'We skip franchise resales',
    });
    await editFactAction({ factId: FACT, body: 'We skip all franchises' });
    await deleteFactAction({ factId: FACT });

    expect(world.writes).toEqual([
      {
        table: 'decision_fact',
        op: 'insert',
        row: { account_id: ACCOUNT, body: 'We skip franchise resales' },
      },
      {
        table: 'decision_fact',
        op: 'update',
        row: { body: 'We skip all franchises' },
        id: FACT,
      },
      { table: 'decision_fact', op: 'delete', id: FACT },
    ]);
  });

  it('refuses a blank fact', async () => {
    expect(
      await addFactAction({ accountId: ACCOUNT, body: ' ' }),
    ).toMatchObject({ ok: false });
    expect(await editFactAction({ factId: FACT, body: '' })).toMatchObject({
      ok: false,
    });
    expect(world.writes).toEqual([]);
  });
});
