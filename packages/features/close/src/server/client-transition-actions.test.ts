import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const insertSpy = vi.fn();
  const updateSpy = vi.fn();

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = chain;
    builder.eq = chain;
    builder.order = chain;
    builder.single = chain;
    builder.maybeSingle = chain;
    builder.throwOnError = chain;
    builder.insert = (payload: unknown) => {
      insertSpy(table, payload);
      return builder;
    };
    builder.update = (payload: unknown) => {
      updateSpy(table, payload);
      return builder;
    };
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({ data: { id: `${table}-1` }, error: null });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));

  return { insertSpy, updateSpy, from };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));

import {
  createClientTransition,
  updateClientTransitionStep,
} from './client-transition-actions';

const runCreate = createClientTransition as unknown as (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

const runUpdateStep = updateClientTransitionStep as unknown as (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createClientTransition', () => {
  it('inserts a deal-scoped plan carrying the client name', async () => {
    await runCreate(
      { account_id: 'account-1', deal_id: 'deal-1', client_name: 'Acme LLC' },
      { id: 'user-1' },
    );

    const call = mocks.insertSpy.mock.calls.at(-1) as [
      string,
      Record<string, unknown>,
    ];

    expect(call[0]).toBe('client_transition');
    expect(call[1]).toMatchObject({
      account_id: 'account-1',
      deal_id: 'deal-1',
      client_name: 'Acme LLC',
    });
  });
});

describe('updateClientTransitionStep', () => {
  it('writes the status to the column that matches the requested step', async () => {
    await runUpdateStep(
      { id: 'ct-1', step: 'efile_auth', status: 'received' },
      { id: 'user-1' },
    );

    const [table, payload] = mocks.updateSpy.mock.calls.at(-1) as [
      string,
      Record<string, unknown>,
    ];

    expect(table).toBe('client_transition');
    expect(payload.efile_auth_status).toBe('received');
    expect(payload.engagement_letter_status).toBeUndefined();
  });

  it('maps portal_migration to portal_migration_status', async () => {
    await runUpdateStep(
      { id: 'ct-1', step: 'portal_migration', status: 'reviewed' },
      { id: 'user-1' },
    );

    const [, payload] = mocks.updateSpy.mock.calls.at(-1) as [
      string,
      Record<string, unknown>,
    ];

    expect(payload.portal_migration_status).toBe('reviewed');
  });
});
