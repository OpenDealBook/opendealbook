import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const insertSpy = vi.fn();
  const upsertSpy = vi.fn();
  const updateSpy = vi.fn();
  const deleteSpy = vi.fn();

  let singles: Record<string, unknown> = {};
  let rows: Record<string, unknown[]> = {};
  let insertId = 'generated-id';
  let unapprovedFirms: string[] = [];

  function configure(next: {
    singles?: Record<string, unknown>;
    rows?: Record<string, unknown[]>;
    insertId?: string;
    unapprovedFirms?: string[];
  }) {
    singles = next.singles ?? {};
    rows = next.rows ?? {};
    insertId = next.insertId ?? 'generated-id';
    unapprovedFirms = next.unapprovedFirms ?? [];
  }

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = chain;
    builder.eq = chain;
    builder.in = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.throwOnError = chain;
    builder.single = async () => ({ data: { id: insertId }, error: null });
    builder.maybeSingle = async () => ({
      data: table in singles ? singles[table] : null,
      error: null,
    });
    builder.insert = (payload: unknown) => {
      insertSpy(table, payload);
      return builder;
    };
    builder.upsert = (payload: unknown, options: unknown) => {
      upsertSpy(table, payload, options);
      return builder;
    };
    builder.update = (payload: unknown) => {
      updateSpy(table, payload);
      return builder;
    };
    builder.delete = () => {
      deleteSpy(table);
      return builder;
    };
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({ data: rows[table] ?? [], error: null });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));

  const rpcSpy = vi.fn();
  const rpc = (fn: string, args: { p_firm_id: string }) => ({
    then: (resolve: (value: unknown) => void) => {
      rpcSpy(fn, args);
      return resolve({ data: null, error: null });
    },
    throwOnError: async () => ({
      data:
        fn === 'firm_outreach_approved' &&
        !unapprovedFirms.includes(args.p_firm_id),
      error: null,
    }),
  });

  return { insertSpy, upsertSpy, updateSpy, deleteSpy, rpcSpy, from, rpc, configure };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

import {
  connectMailbox,
  createLetterTemplate,
  createSequence,
  enrollTargets,
  seedDefaultSequences,
  setOutreachSetting,
  suppressEmail,
  updateLetterTemplate,
  updateSequence,
} from './outreach-actions';

const run = <T = unknown>(action: unknown) =>
  action as unknown as (
    data: Record<string, unknown>,
    user: { id: string },
  ) => Promise<T>;

const ACCOUNT = '00000000-0000-4000-8000-000000000001';
const SEQUENCE = '00000000-0000-4000-8000-000000000002';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configure({});
});

describe('connectMailbox', () => {
  it('records a mailbox_connection row scoped to the user', async () => {
    await run(connectMailbox)(
      {
        accountId: ACCOUNT,
        provider: 'gmail',
        nangoConnectionId: 'nango-1',
        providerConfigKey: 'google-mail',
        emailAddress: 'operator@acme.com',
        status: 'active',
      },
      { id: 'user-1' },
    );

    const [table, payload] = mocks.insertSpy.mock.calls.at(-1) as [
      string,
      Record<string, unknown>,
    ];

    expect(table).toBe('mailbox_connection');
    expect(payload).toEqual({
      account_id: ACCOUNT,
      user_id: 'user-1',
      provider: 'gmail',
      nango_connection_id: 'nango-1',
      provider_config_key: 'google-mail',
      email_address: 'operator@acme.com',
      status: 'active',
    });
  });
});

describe('seedDefaultSequences', () => {
  it('inserts a sequence and its steps for an account with no sequences', async () => {
    const result = await run<{ seeded: number }>(seedDefaultSequences)(
      { accountId: ACCOUNT },
      { id: 'user-1' },
    );

    const sequenceInserts = mocks.insertSpy.mock.calls.filter(
      ([table]) => table === 'outreach_sequence',
    );
    const stepInserts = mocks.insertSpy.mock.calls.filter(
      ([table]) => table === 'outreach_step',
    );

    expect(result.seeded).toBe(3);
    expect(sequenceInserts).toHaveLength(3);
    expect(stepInserts).toHaveLength(3);

    const firstStep = (stepInserts[0]![1] as Record<string, unknown>[])[0]!;
    expect(firstStep.sequence_id).toBe('generated-id');
    expect(firstStep.ordinal).toBe(1);
    expect(firstStep.delay_days).toBe(0);
    expect(typeof firstStep.subject).toBe('string');
  });

  it('seeds the letter starter turned off, with each step on its channel', async () => {
    await run(seedDefaultSequences)({ accountId: ACCOUNT }, { id: 'user-1' });

    const sequenceInserts = mocks.insertSpy.mock.calls.filter(([table]) => table === 'outreach_sequence');
    const stepInserts = mocks.insertSpy.mock.calls.filter(([table]) => table === 'outreach_step');

    expect(sequenceInserts.map(([, row]) => (row as { enabled: boolean }).enabled)).toEqual([true, true, false]);
    expect(
      (stepInserts[2]![1] as Record<string, unknown>[]).map((step) => [step.channel, step.delay_days, step.subject === null]),
    ).toEqual([
      ['letter', 0, true],
      ['email', 7, false],
      ['email', 7, false],
    ]);
  });

  it('skips seeding when the account already has sequences', async () => {
    mocks.configure({ singles: { outreach_sequence: { id: 'existing' } } });

    const result = await run<{ seeded: number }>(seedDefaultSequences)(
      { accountId: ACCOUNT },
      { id: 'user-1' },
    );

    expect(result.seeded).toBe(0);
    expect(mocks.insertSpy).not.toHaveBeenCalled();
  });
});

describe('createSequence', () => {
  it('inserts the sequence then its steps bound to the new sequence id', async () => {
    await run(createSequence)(
      {
        accountId: ACCOUNT,
        name: 'Custom',
        description: 'A custom template',
        steps: [{ ordinal: 1, delayDays: 2, channel: 'email', subject: 'Hi', body: 'Body' }],
      },
      { id: 'user-1' },
    );

    const [seqTable, seqPayload] = mocks.insertSpy.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    const [stepTable, stepPayload] = mocks.insertSpy.mock.calls[1] as [
      string,
      Record<string, unknown>[],
    ];

    expect(seqTable).toBe('outreach_sequence');
    expect(seqPayload.name).toBe('Custom');
    expect(stepTable).toBe('outreach_step');
    expect(stepPayload[0]!.sequence_id).toBe('generated-id');
    expect(stepPayload[0]!.delay_days).toBe(2);
  });
});

describe('sequence steps', () => {
  it('saves every step with its channel, and a letter step without a subject', async () => {
    await run(createSequence)(
      {
        accountId: ACCOUNT,
        name: 'Letter first',
        steps: [
          { ordinal: 1, delayDays: 0, channel: 'letter', body: 'Dear owner' },
          { ordinal: 2, delayDays: 7, channel: 'email', subject: 'Following up', body: 'Hi' },
        ],
      },
      { id: 'user-1' },
    );

    const [, steps] = mocks.insertSpy.mock.calls[1] as [string, Record<string, unknown>[]];
    expect(steps).toEqual([
      {
        account_id: ACCOUNT,
        sequence_id: 'generated-id',
        ordinal: 1,
        delay_days: 0,
        channel: 'letter',
        subject: null,
        body: 'Dear owner',
      },
      {
        account_id: ACCOUNT,
        sequence_id: 'generated-id',
        ordinal: 2,
        delay_days: 7,
        channel: 'email',
        subject: 'Following up',
        body: 'Hi',
      },
    ]);
  });

  it('refuses an email step without a subject', async () => {
    const { createSequenceSchema } = await import('../schema/outreach.schema');

    expect(
      createSequenceSchema.safeParse({
        accountId: ACCOUNT,
        name: 'No subject',
        steps: [{ ordinal: 1, delayDays: 0, channel: 'email', body: 'Hi' }],
      }).success,
    ).toBe(false);
  });
});

describe('letter templates', () => {
  it('adds a team letter template', async () => {
    await run(createLetterTemplate)(
      { accountId: ACCOUNT, name: 'Intro', body: 'Dear {{ firm.name }}' },
      { id: 'user-1' },
    );

    expect(mocks.insertSpy).toHaveBeenCalledWith('letter_template', {
      account_id: ACCOUNT,
      name: 'Intro',
      body: 'Dear {{ firm.name }}',
    });
  });

  it('edits a letter template', async () => {
    mocks.configure({ singles: { letter_template: { id: SEQUENCE } } });

    const result = await run(updateLetterTemplate)(
      { accountId: ACCOUNT, templateId: SEQUENCE, name: 'Intro v2', body: 'Hello' },
      { id: 'user-1' },
    );

    expect(result).toEqual({ ok: true, value: undefined });
    expect(mocks.updateSpy).toHaveBeenCalledWith('letter_template', { name: 'Intro v2', body: 'Hello' });
  });

  it('refuses an edit that changes no template', async () => {
    const result = await run(updateLetterTemplate)(
      { accountId: ACCOUNT, templateId: SEQUENCE, name: 'Intro v2', body: 'Hello' },
      { id: 'user-1' },
    );

    expect(result).toEqual({
      ok: false,
      refusal: 'Only deal managers can edit letter templates. Ask a deal manager.',
    });
  });
});

describe('updateSequence', () => {
  it('updates the sequence and replaces its steps when steps are given', async () => {
    await run(updateSequence)(
      {
        accountId: ACCOUNT,
        sequenceId: SEQUENCE,
        name: 'Renamed',
        steps: [{ ordinal: 1, delayDays: 0, channel: 'email', subject: 'S', body: 'B' }],
      },
      { id: 'user-1' },
    );

    const [updateTable, updatePayload] = mocks.updateSpy.mock.calls.at(-1) as [
      string,
      Record<string, unknown>,
    ];

    expect(updateTable).toBe('outreach_sequence');
    expect(updatePayload).toEqual({ name: 'Renamed' });
    expect(mocks.rpcSpy).toHaveBeenCalledWith('replace_outreach_steps', {
      p_account_id: ACCOUNT,
      p_sequence_id: SEQUENCE,
      p_steps: [{ ordinal: 1, delay_days: 0, channel: 'email', subject: 'S', body: 'B' }],
    });
    expect(mocks.deleteSpy).not.toHaveBeenCalled();
    expect(mocks.insertSpy).not.toHaveBeenCalled();
  });

  it('leaves steps untouched when no steps are given', async () => {
    await run(updateSequence)(
      { accountId: ACCOUNT, sequenceId: SEQUENCE, enabled: false },
      { id: 'user-1' },
    );

    expect(mocks.rpcSpy).not.toHaveBeenCalled();
    expect(mocks.deleteSpy).not.toHaveBeenCalled();
    expect(mocks.insertSpy).not.toHaveBeenCalled();
  });
});

describe('enrollTargets', () => {
  it('enrolls a contact with an email and reports a contact without one', async () => {
    mocks.configure({
      rows: { outreach_enrollment: [{ id: 'enr-1' }] },
      singles: {},
    });
    const contactById: Record<string, unknown> = {
      'c-ok': { id: 'c-ok', email: 'owner@firm.com', firm_id: 'f-1' },
      'c-bad': { id: 'c-bad', email: null, firm_id: null },
    };
    const fromImpl = mocks.from.getMockImplementation()!;
    mocks.from.mockImplementation((table: string) => {
      const builder = fromImpl(table) as Record<string, unknown>;
      if (table === 'contact') {
        let lookupId: string | undefined;
        builder.eq = (column: string, value: string) => {
          if (column === 'id') {
            lookupId = value;
          }
          return builder;
        };
        builder.maybeSingle = async () => ({
          data: lookupId ? contactById[lookupId] : null,
          error: null,
        });
      }
      return builder;
    });

    const result = await run<{
      enrolled: string[];
      skipped: Array<{ type: string; id: string; reason: string }>;
    }>(enrollTargets)(
      {
        accountId: ACCOUNT,
        sequenceId: SEQUENCE,
        contactIds: ['c-ok', 'c-bad'],
      },
      { id: 'user-1' },
    );

    const enrollmentInsert = mocks.insertSpy.mock.calls.find(
      ([table]) => table === 'outreach_enrollment',
    )!;
    const payloads = enrollmentInsert[1] as Record<string, unknown>[];

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      account_id: ACCOUNT,
      sequence_id: SEQUENCE,
      contact_id: 'c-ok',
      firm_id: 'f-1',
      target_email: 'owner@firm.com',
      status: 'queued',
      current_step: 1,
    });
    expect(payloads[0]!.next_send_at).toBeTruthy();
    expect(result.enrolled).toEqual(['enr-1']);
    expect(result.skipped).toEqual([
      { type: 'contact', id: 'c-bad', reason: 'no_email' },
    ]);
  });

  it('resolves a firm target through its first emailable contact', async () => {
    mocks.configure({
      rows: {
        outreach_enrollment: [{ id: 'enr-2' }],
        contact: [
          { id: 'c-1', email: null },
          { id: 'c-2', email: 'reachable@firm.com' },
        ],
      },
    });

    const result = await run<{
      enrolled: string[];
      skipped: Array<{ type: string; id: string; reason: string }>;
    }>(enrollTargets)(
      { accountId: ACCOUNT, sequenceId: SEQUENCE, firmIds: ['f-9'] },
      { id: 'user-1' },
    );

    const enrollmentInsert = mocks.insertSpy.mock.calls.find(
      ([table]) => table === 'outreach_enrollment',
    )!;
    const payloads = enrollmentInsert[1] as Record<string, unknown>[];

    expect(payloads[0]).toMatchObject({
      firm_id: 'f-9',
      contact_id: 'c-2',
      target_email: 'reachable@firm.com',
    });
    expect(result.skipped).toEqual([]);
  });

  it('skips a contact whose firm outreach is not approved', async () => {
    mocks.configure({
      rows: { outreach_enrollment: [{ id: 'enr-4' }] },
      unapprovedFirms: ['f-unapproved'],
    });
    const contactById: Record<string, unknown> = {
      'c-gated': {
        id: 'c-gated',
        email: 'gated@firm.com',
        firm_id: 'f-unapproved',
      },
      'c-free': { id: 'c-free', email: 'free@person.com', firm_id: null },
    };
    const fromImpl = mocks.from.getMockImplementation()!;
    mocks.from.mockImplementation((table: string) => {
      const builder = fromImpl(table) as Record<string, unknown>;
      if (table === 'contact') {
        let lookupId: string | undefined;
        builder.eq = (column: string, value: string) => {
          if (column === 'id') {
            lookupId = value;
          }
          return builder;
        };
        builder.maybeSingle = async () => ({
          data: lookupId ? contactById[lookupId] : null,
          error: null,
        });
      }
      return builder;
    });

    const result = await run<{
      enrolled: string[];
      skipped: Array<{ type: string; id: string; reason: string }>;
    }>(enrollTargets)(
      {
        accountId: ACCOUNT,
        sequenceId: SEQUENCE,
        contactIds: ['c-gated', 'c-free'],
      },
      { id: 'user-1' },
    );

    const enrollmentInsert = mocks.insertSpy.mock.calls.find(
      ([table]) => table === 'outreach_enrollment',
    )!;
    const payloads = enrollmentInsert[1] as Record<string, unknown>[];

    expect(payloads.map((payload) => payload.contact_id)).toEqual(['c-free']);
    expect(result.skipped).toEqual([
      { type: 'contact', id: 'c-gated', reason: 'not_approved' },
    ]);
  });

  it('skips a firm whose outreach is not approved', async () => {
    mocks.configure({
      rows: {
        outreach_enrollment: [{ id: 'enr-3' }],
        contact: [{ id: 'c-2', email: 'reachable@firm.com' }],
      },
      unapprovedFirms: ['f-unapproved'],
    });

    const result = await run<{
      enrolled: string[];
      skipped: Array<{ type: string; id: string; reason: string }>;
    }>(enrollTargets)(
      {
        accountId: ACCOUNT,
        sequenceId: SEQUENCE,
        firmIds: ['f-unapproved', 'f-approved'],
      },
      { id: 'user-1' },
    );

    const enrollmentInsert = mocks.insertSpy.mock.calls.find(
      ([table]) => table === 'outreach_enrollment',
    )!;
    const payloads = enrollmentInsert[1] as Record<string, unknown>[];

    expect(payloads.map((payload) => payload.firm_id)).toEqual(['f-approved']);
    expect(result.skipped).toEqual([
      { type: 'firm', id: 'f-unapproved', reason: 'not_approved' },
    ]);
  });

  it('reports a firm with no emailable contact and inserts nothing', async () => {
    mocks.configure({ rows: { contact: [{ id: 'c-1', email: null }] } });

    const result = await run<{
      enrolled: string[];
      skipped: Array<{ type: string; id: string; reason: string }>;
    }>(enrollTargets)(
      { accountId: ACCOUNT, sequenceId: SEQUENCE, firmIds: ['f-9'] },
      { id: 'user-1' },
    );

    expect(
      mocks.insertSpy.mock.calls.some(
        ([table]) => table === 'outreach_enrollment',
      ),
    ).toBe(false);
    expect(result.enrolled).toEqual([]);
    expect(result.skipped).toEqual([
      { type: 'firm', id: 'f-9', reason: 'no_email' },
    ]);
  });
});

describe('setOutreachSetting', () => {
  it('upserts the outreach_setting row on the account primary key', async () => {
    await run(setOutreachSetting)(
      { accountId: ACCOUNT, dailyCap: 25, maxTouches: 3 },
      { id: 'user-1' },
    );

    const [table, payload, options] = mocks.upsertSpy.mock.calls.at(-1) as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ];

    expect(table).toBe('outreach_setting');
    expect(payload).toEqual({
      account_id: ACCOUNT,
      daily_cap: 25,
      max_touches: 3,
    });
    expect(options).toMatchObject({ onConflict: 'account_id' });
  });

  it('needs max touches; the form sends the default', async () => {
    const { setOutreachSettingSchema } = await import('../schema/outreach.schema');

    expect(setOutreachSettingSchema.safeParse({ accountId: ACCOUNT, dailyCap: 25 }).success).toBe(false);
  });
});

describe('suppressEmail', () => {
  it('inserts an outreach_suppression row', async () => {
    await run(suppressEmail)(
      { accountId: ACCOUNT, email: 'no@firm.com', reason: 'bounced' },
      { id: 'user-1' },
    );

    const [table, payload] = mocks.insertSpy.mock.calls.at(-1) as [
      string,
      Record<string, unknown>,
    ];

    expect(table).toBe('outreach_suppression');
    expect(payload).toEqual({
      account_id: ACCOUNT,
      email: 'no@firm.com',
      reason: 'bounced',
    });
  });
});
