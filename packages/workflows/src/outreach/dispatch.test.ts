import { describe, expect, it, vi } from 'vitest';

import { dispatchAccountOutreach } from './dispatch';

const state = vi.hoisted(() => ({
  client: null as unknown,
  sendAs: null as unknown as (...args: unknown[]) => Promise<unknown>,
}));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => state.client,
}));

vi.mock('@odb/mailbox', () => ({
  sendAs: (...args: unknown[]) => state.sendAs(...args),
}));

interface Seed {
  tables?: Record<string, Record<string, unknown>[]>;
  singles?: Record<string, Record<string, unknown> | null>;
}

function makeClient(seed: Seed) {
  const captures = {
    inserts: {} as Record<string, Record<string, unknown>[]>,
    updates: {} as Record<string, Record<string, unknown>[]>,
  };

  function record(bag: Record<string, Record<string, unknown>[]>, table: string, value: unknown) {
    (bag[table] ??= []).push(value as Record<string, unknown>);
  }

  function builder(table: string): any {
    const rows = seed.tables?.[table] ?? [];
    const single =
      table in (seed.singles ?? {})
        ? seed.singles![table]
        : rows.length > 0
          ? rows[0]!
          : null;

    const b: any = {
      select: () => b,
      eq: () => b,
      lte: () => b,
      gte: () => b,
      in: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: single, error: null }),
      single: async () => ({ data: single, error: null }),
      insert: (payload: unknown) => {
        record(captures.inserts, table, payload);
        return { then: (resolve: (value: { error: null }) => unknown) => resolve({ error: null }) };
      },
      update: (payload: unknown) => {
        record(captures.updates, table, payload);
        return b;
      },
      then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
        resolve({ data: rows, error: null }),
    };

    return b;
  }

  return { client: { from: (table: string) => builder(table) }, captures };
}

const connectionRow = {
  provider: 'gmail',
  nango_connection_id: 'nango-1',
  provider_config_key: 'google-mail',
  email_address: 'operator@acme.com',
  status: 'active',
};

const commonSingles = {
  mailbox_connection: connectionRow,
  accounts: { name: 'Acme Buyers' },
  deal_box: { criteria_json: { industries: ['Accounting'], min_revenue: 1_000_000 } },
  contact: { name: 'Pat Owner', email: 'pat@firm.com' },
  firm: {
    name: 'Firm LLC',
    industry: 'Accounting',
    city: 'Austin',
    state: 'TX',
    website: 'firm.com',
  },
};

function enrollment(id: string, targetEmail: string) {
  return {
    id,
    account_id: 'acct-1',
    sequence_id: 'cold-deal-box-match',
    firm_id: `firm-${id}`,
    contact_id: `contact-${id}`,
    target_email: targetEmail,
    status: 'queued',
    current_step: 1,
    sent_count: 0,
  };
}

describe('dispatchAccountOutreach throttle', () => {
  it('sends only daily_cap minus messages already sent today', async () => {
    const { client, captures } = makeClient({
      singles: { ...commonSingles, outreach_setting: { daily_cap: 2, max_touches: 1 } },
      tables: {
        outreach_enrollment: [
          enrollment('e1', 'a@firm.com'),
          enrollment('e2', 'b@firm.com'),
          enrollment('e3', 'c@firm.com'),
        ],
        outreach_message: [
          { to_email: 'prior@firm.com', status: 'sent', sent_at: new Date().toISOString() },
        ],
        outreach_suppression: [],
      },
    });
    state.client = client;
    state.sendAs = vi.fn(async () => ({ providerMessageId: 'pm' }));

    const result = await dispatchAccountOutreach({ accountId: 'acct-1' });

    expect(result.sent).toBe(1);
    expect((state.sendAs as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect(captures.inserts.outreach_message).toHaveLength(1);
    expect(captures.inserts.outreach_message![0]!.status).toBe('sent');
  });

  it('sends nothing when the cap is already spent', async () => {
    const { client } = makeClient({
      singles: { ...commonSingles, outreach_setting: { daily_cap: 1, max_touches: 1 } },
      tables: {
        outreach_enrollment: [enrollment('e1', 'a@firm.com')],
        outreach_message: [
          { to_email: 'prior@firm.com', status: 'sent', sent_at: new Date().toISOString() },
        ],
        outreach_suppression: [],
      },
    });
    state.client = client;
    state.sendAs = vi.fn(async () => ({ providerMessageId: 'pm' }));

    const result = await dispatchAccountOutreach({ accountId: 'acct-1' });

    expect(result.sent).toBe(0);
    expect((state.sendAs as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

describe('dispatchAccountOutreach failure isolation', () => {
  it('logs the failed recipient and still sends the rest of the batch', async () => {
    const { client, captures } = makeClient({
      singles: { ...commonSingles, outreach_setting: { daily_cap: 10, max_touches: 1 } },
      tables: {
        outreach_enrollment: [
          enrollment('e1', 'a@firm.com'),
          enrollment('e2', 'b@firm.com'),
        ],
        outreach_message: [],
        outreach_suppression: [],
      },
    });
    state.client = client;
    state.sendAs = vi
      .fn()
      .mockRejectedValueOnce(new Error('smtp down'))
      .mockResolvedValue({ providerMessageId: 'pm2' });

    const result = await dispatchAccountOutreach({ accountId: 'acct-1' });

    expect((state.sendAs as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
    expect(result.sent).toBe(1);

    const logged = captures.inserts.outreach_message!;
    expect(logged).toHaveLength(2);
    expect(logged.map((row) => row.status)).toEqual(['failed', 'sent']);
    expect(logged[0]!.error).toBe('smtp down');

    const enrollmentUpdates = captures.updates.outreach_enrollment!;
    expect(enrollmentUpdates.map((row) => row.status)).toEqual(['failed', 'sent']);
  });

  it('skips a recipient already at max_touches', async () => {
    const { client } = makeClient({
      singles: { ...commonSingles, outreach_setting: { daily_cap: 10, max_touches: 1 } },
      tables: {
        outreach_enrollment: [enrollment('e1', 'a@firm.com')],
        outreach_message: [{ to_email: 'a@firm.com', status: 'sent', sent_at: '2020-01-01T00:00:00.000Z' }],
        outreach_suppression: [],
      },
    });
    state.client = client;
    state.sendAs = vi.fn(async () => ({ providerMessageId: 'pm' }));

    const result = await dispatchAccountOutreach({ accountId: 'acct-1' });

    expect(result.sent).toBe(0);
    expect((state.sendAs as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it('skips a suppressed recipient', async () => {
    const { client } = makeClient({
      singles: { ...commonSingles, outreach_setting: { daily_cap: 10, max_touches: 1 } },
      tables: {
        outreach_enrollment: [enrollment('e1', 'a@firm.com')],
        outreach_message: [],
        outreach_suppression: [{ email: 'a@firm.com' }],
      },
    });
    state.client = client;
    state.sendAs = vi.fn(async () => ({ providerMessageId: 'pm' }));

    const result = await dispatchAccountOutreach({ accountId: 'acct-1' });

    expect(result.sent).toBe(0);
    expect((state.sendAs as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});
