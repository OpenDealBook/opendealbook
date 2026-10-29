import { describe, expect, it, vi } from 'vitest';

import { structuredInputChecks } from './gather';
import { runVerification, VERIFICATION_EVENT_TYPE } from './runner';

interface FakeConfig {
  rows?: Record<string, unknown>;
  insertReturn?: Record<string, unknown>;
  gatherThrows?: boolean;
}

function makeClient(config: FakeConfig) {
  const capture = {
    inserts: {} as Record<string, unknown>,
    updates: {} as Record<string, unknown>,
    updatedIds: {} as Record<string, string>,
  };

  const client = {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        limit: () => builder,
        single: async () => ({ data: config.rows?.[table] ?? null, error: null }),
        insert(rows: unknown) {
          capture.inserts[table] = rows;
          const result = {
            data: config.insertReturn?.[table] ?? null,
            error: null,
          };
          return {
            select: () => ({ single: async () => result }),
            then: (resolve: (value: { error: null }) => unknown) =>
              resolve({ error: null }),
          };
        },
        update(payload: unknown) {
          capture.updates[table] = payload;
          return {
            eq: async (_column: string, id: string) => {
              capture.updatedIds[table] = id;
              return { error: null };
            },
          };
        },
      };

      return builder;
    },
  };

  return { client, capture };
}

function baseClient(config: FakeConfig = {}) {
  return makeClient({
    rows: { deal: { account_id: 'acct1', owner_user_id: 'owner1' } },
    insertReturn: { verification_run: { id: 'run1' } },
    ...config,
  });
}

describe('runVerification', () => {
  it('opens a running run, persists findings, closes it done, and notifies on error findings', async () => {
    const { client, capture } = baseClient();
    const notify = vi.fn().mockResolvedValue(undefined);

    const result = await runVerification({
      client: client as never,
      dealId: 'deal1',
      trigger: 'ingest',
      runnableChecks: structuredInputChecks({
        payroll_tax_vs_w2: {
          period: '2025',
          w2WagesTotal: 100,
          payrollTaxWagesTotal: 200,
        },
      }),
      notify,
    });

    expect(capture.inserts.verification_run).toMatchObject({
      account_id: 'acct1',
      deal_id: 'deal1',
      status: 'running',
      trigger: 'ingest',
    });

    const findings = capture.inserts.verification_finding as Array<
      Record<string, unknown>
    >;
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      run_id: 'run1',
      account_id: 'acct1',
      deal_id: 'deal1',
      check_key: 'payroll_tax_vs_w2',
      severity: 'error',
    });
    expect((findings[0]!.detail as { message?: unknown }).message).toBeTypeOf(
      'string',
    );

    expect(capture.updates.verification_run).toMatchObject({ status: 'done' });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: VERIFICATION_EVENT_TYPE,
        recipientUserId: 'owner1',
      }),
    );

    expect(result).toMatchObject({ runId: 'run1', status: 'done' });
  });

  it('does not notify when every finding is info', async () => {
    const { client, capture } = baseClient();
    const notify = vi.fn().mockResolvedValue(undefined);

    await runVerification({
      client: client as never,
      dealId: 'deal1',
      trigger: 'ingest',
      runnableChecks: structuredInputChecks({
        payroll_tax_vs_w2: {
          period: '2025',
          w2WagesTotal: 100,
          payrollTaxWagesTotal: 100,
        },
      }),
      notify,
    });

    expect(capture.updates.verification_run).toMatchObject({ status: 'done' });
    expect(notify).not.toHaveBeenCalled();
  });

  it('marks the run failed and rethrows when a gather step throws', async () => {
    const { client, capture } = baseClient();
    const notify = vi.fn().mockResolvedValue(undefined);

    await expect(
      runVerification({
        client: client as never,
        dealId: 'deal1',
        trigger: 'ingest',
        runnableChecks: [
          {
            check: { key: 'boom', evaluate: () => [] },
            gather: async () => {
              throw new Error('gather exploded');
            },
          },
        ],
        notify,
      }),
    ).rejects.toThrow('gather exploded');

    expect(capture.updates.verification_run).toMatchObject({
      status: 'failed',
    });
    expect(
      (capture.updates.verification_run as { finished_at?: unknown })
        .finished_at,
    ).toBeTypeOf('string');
    expect(notify).not.toHaveBeenCalled();
  });

  it('marks its own run skipped with the reason when a gather step hits a skippable error', async () => {
    const { client, capture } = baseClient();
    const notify = vi.fn().mockResolvedValue(undefined);
    class Skip extends Error {}

    const result = await runVerification({
      client: client as never,
      dealId: 'deal1',
      trigger: 'ingest',
      runnableChecks: [
        {
          check: { key: 'capped', evaluate: () => [] },
          gather: async () => {
            throw new Skip('The monthly AI limit is reached');
          },
        },
      ],
      notify,
      skipReason: (error) => (error instanceof Skip ? error.message : null),
    });

    expect(result).toEqual({ runId: 'run1', status: 'skipped', reason: 'The monthly AI limit is reached' });
    expect(capture.updatedIds.verification_run).toBe('run1');
    expect(capture.updates.verification_run).toMatchObject({
      status: 'skipped',
      skipped_reason: 'The monthly AI limit is reached',
    });
    expect(
      (capture.updates.verification_run as { finished_at?: unknown }).finished_at,
    ).toBeTypeOf('string');
    expect(notify).not.toHaveBeenCalled();
  });

  it('still fails the run on an error the caller does not skip', async () => {
    const { client, capture } = baseClient();

    await expect(
      runVerification({
        client: client as never,
        dealId: 'deal1',
        trigger: 'ingest',
        runnableChecks: [
          {
            check: { key: 'boom', evaluate: () => [] },
            gather: async () => {
              throw new Error('gather exploded');
            },
          },
        ],
        notify: vi.fn(),
        skipReason: () => null,
      }),
    ).rejects.toThrow('gather exploded');
    expect(capture.updates.verification_run).toMatchObject({ status: 'failed' });
  });
});
