import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const insertSpy = vi.fn();
  const updateSpy = vi.fn();
  const eqSpy = vi.fn();

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.single = chain;
    builder.maybeSingle = chain;
    builder.eq = (column: string, value: unknown) => {
      eqSpy(table, column, value);
      return builder;
    };
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

  return { insertSpy, updateSpy, eqSpy, from };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));

import {
  addEmployee,
  createHrAuditEngagement,
  updateEmployee,
  updateHrAuditEngagement,
} from './hr-audit-actions';

type Runner = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

const runCreateEngagement = createHrAuditEngagement as unknown as Runner;
const runUpdateEngagement = updateHrAuditEngagement as unknown as Runner;
const runAddEmployee = addEmployee as unknown as Runner;
const runUpdateEmployee = updateEmployee as unknown as Runner;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createHrAuditEngagement', () => {
  it('inserts the engagement payload into hr_audit_engagement', async () => {
    await runCreateEngagement(
      {
        deal_id: 'deal-1',
        account_id: 'account-1',
        provider: 'third_party',
        vendor_name: 'Acme HR',
      },
      { id: 'user-1' },
    );

    const insert = mocks.insertSpy.mock.calls.find(
      ([table]) => table === 'hr_audit_engagement',
    );

    expect(insert?.[1]).toMatchObject({
      deal_id: 'deal-1',
      account_id: 'account-1',
      provider: 'third_party',
      vendor_name: 'Acme HR',
    });
  });
});

describe('updateHrAuditEngagement', () => {
  it('updates only the provided fields, not the id', async () => {
    await runUpdateEngagement(
      { id: 'engagement-1', status: 'received', scope: 'comp review' },
      { id: 'user-1' },
    );

    const [table, payload] = mocks.updateSpy.mock.calls.at(-1) as [
      string,
      Record<string, unknown>,
    ];

    expect(table).toBe('hr_audit_engagement');
    expect(payload).toEqual({ status: 'received', scope: 'comp review' });
  });

  it('targets the row named by id', async () => {
    await runUpdateEngagement(
      { id: 'engagement-1', status: 'reviewed' },
      { id: 'user-1' },
    );

    const eqCall = mocks.eqSpy.mock.calls.find(
      ([table]) => table === 'hr_audit_engagement',
    );

    expect(eqCall).toEqual(['hr_audit_engagement', 'id', 'engagement-1']);
  });
});

describe('addEmployee', () => {
  it('inserts the employee payload into employee', async () => {
    await runAddEmployee(
      {
        deal_id: 'deal-1',
        account_id: 'account-1',
        name: 'Jordan Lee',
        key_person: true,
      },
      { id: 'user-1' },
    );

    const insert = mocks.insertSpy.mock.calls.find(
      ([table]) => table === 'employee',
    );

    expect(insert?.[1]).toMatchObject({
      deal_id: 'deal-1',
      account_id: 'account-1',
      name: 'Jordan Lee',
      key_person: true,
    });
  });
});

describe('updateEmployee', () => {
  it('updates only the provided fields, not the id', async () => {
    await runUpdateEmployee(
      { id: 'employee-1', comp: 120000, non_compete: true },
      { id: 'user-1' },
    );

    const [table, payload] = mocks.updateSpy.mock.calls.at(-1) as [
      string,
      Record<string, unknown>,
    ];

    expect(table).toBe('employee');
    expect(payload).toEqual({ comp: 120000, non_compete: true });
  });
});
