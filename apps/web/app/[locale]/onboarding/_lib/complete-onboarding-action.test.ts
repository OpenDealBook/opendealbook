import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stubBootEnv } from '../../../../test-env';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  writes: [] as { table: string; op: string; row: Row }[],
  ownedTeam: null as Row | null,
  memberTeams: [] as Row[],
  createdTeams: [] as string[],
}));
const seedSampleDeals = vi.hoisted(() => vi.fn(async () => {}));
const startTrialDrip = vi.hoisted(() => vi.fn(async () => {}));
const session = vi.hoisted(() => ({
  user: { id: 'user-1', email: 'pat@example.com' as string | undefined },
}));

vi.mock('@odb/seed', () => ({ seedSampleDeals }));
vi.mock('@odb/workflows/client', () => ({ startTrialDrip }));
vi.mock('@odb/onboarding/schema', () => ({ onboardingSubmissionSchema: {} }));
vi.mock('@odb/shared/logger', () => ({ getLogger: () => ({ warn() {} }) }));
vi.mock('@odb/team-accounts/server', () => ({
  createTeamAccountAction: async ({ name }: { name: string }) => {
    db.createdTeams.push(name);
    return { id: 'team-new', slug: name.toLowerCase() };
  },
}));
vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: unknown) => Promise<unknown>) =>
    (input: unknown) =>
      fn(input, session.user),
}));

function fakeTable(table: string, read: (filters: Row) => unknown): unknown {
  const filters: Row = {};
  const builder: Row = new Proxy(
    {},
    {
      get: (_target, method) => {
        if (method === 'then') {
          return (resolve: (value: unknown) => unknown) =>
            resolve({ data: read(filters), error: null });
        }
        return (...args: unknown[]) => {
          if (method === 'eq') {
            filters[args[0] as string] = args[1];
          }
          if (
            method === 'insert' ||
            method === 'upsert' ||
            method === 'update'
          ) {
            db.writes.push({ table, op: method, row: args[0] as Row });
          }
          return builder;
        };
      },
    },
  );
  return builder;
}

function readAccounts(filters: Row): unknown {
  if (filters.is_personal_account === true) {
    return { id: 'personal-1', public_data: {} };
  }
  if ('slug' in filters) {
    return db.memberTeams.find((team) => team.slug === filters.slug) ?? null;
  }
  return filters.primary_owner_user_id === 'user-1' ? db.ownedTeam : null;
}

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) =>
      fakeTable(table, table === 'accounts' ? readAccounts : () => null),
  }),
  getSupabaseServerAdminClient: () => ({
    from: (table: string) => fakeTable(table, () => null),
  }),
}));

type Submission = Parameters<
  typeof import('./complete-onboarding-action').completeOnboardingAction
>[0];

const buyer = {
  kind: 'buyer',
  profile: { name: 'Pat Buyer' },
  workspace: { teamName: 'Acme' },
  terms: { acceptedTerms: true, compPoolOptin: true },
  dealBox: { criteria: { naics: ['541211'] } },
} as Submission;

const invitee = {
  kind: 'invitee',
  teamSlug: 'globex',
  profile: { name: 'Ivy Invitee' },
  terms: { acceptedTerms: true },
} as Submission;

const writesTo = (table: string) =>
  db.writes.filter((w) => w.table === table).map((w) => w.row);

async function complete(submission: Submission) {
  const { completeOnboardingAction } =
    await import('./complete-onboarding-action');
  return completeOnboardingAction(submission);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('completeOnboardingAction for a buyer', () => {
  beforeEach(() => {
    stubBootEnv({});
    db.writes.length = 0;
    db.createdTeams.length = 0;
    db.ownedTeam = null;
    seedSampleDeals.mockClear();
    startTrialDrip.mockReset();
    startTrialDrip.mockResolvedValue(undefined);
    session.user = { id: 'user-1', email: 'pat@example.com' };
  });

  it('starts the trial drip for the new team, addressed to the buyer and linking into the team', async () => {
    await complete(buyer);

    expect(startTrialDrip).toHaveBeenCalledWith({
      accountId: 'team-new',
      userId: 'user-1',
      email: 'pat@example.com',
      productName: 'Open Deal Book',
      upgradeLink: 'https://opendealbook.com/home/acme/billing',
      actionLink: 'https://opendealbook.com/home/acme',
    });
  });

  it('starts no trial drip when it reuses the team a failed earlier attempt created', async () => {
    db.ownedTeam = { id: 'team-old', slug: 'acme-old' };

    await complete(buyer);

    expect(startTrialDrip).not.toHaveBeenCalled();
  });

  it('starts no trial drip when billing is off', async () => {
    stubBootEnv({ ENABLE_BILLING: 'false' });

    await complete(buyer);

    expect(startTrialDrip).not.toHaveBeenCalled();
  });

  it('starts no trial drip when the buyer has no email', async () => {
    session.user = { id: 'user-1', email: undefined };

    await complete(buyer);

    expect(startTrialDrip).not.toHaveBeenCalled();
  });

  it('marks the new team once its trial drip has started', async () => {
    await complete(buyer);

    expect(writesTo('accounts')).toContainEqual({
      trial_drip_started_at: expect.any(String),
    });
  });

  it('still completes onboarding when starting the trial drip fails, leaving the team unmarked for a retry', async () => {
    startTrialDrip.mockRejectedValue(new Error('Temporal down'));

    await expect(complete(buyer)).resolves.toEqual({
      redirectTo: '/home/acme',
    });
    expect(
      writesTo('accounts').filter((row) => 'trial_drip_started_at' in row),
    ).toEqual([]);
  });

  it("leaves the sample deals to the new team's first home visit", async () => {
    await complete(buyer);

    expect(seedSampleDeals).not.toHaveBeenCalled();
  });

  it('puts the deal box and comp-pool choice in the new team', async () => {
    await complete(buyer);

    expect(writesTo('deal_box').map((row) => row.account_id)).toEqual([
      'team-new',
    ]);
    expect(writesTo('comp_pool_optin').map((row) => row.account_id)).toEqual([
      'team-new',
    ]);
  });

  it('marks the personal account onboarded', async () => {
    await complete(buyer);

    expect(writesTo('accounts')).toContainEqual(
      expect.objectContaining({ name: 'Pat Buyer', onboarded: true }),
    );
  });

  it("sends the buyer to the new team's home", async () => {
    await expect(complete(buyer)).resolves.toEqual({
      redirectTo: '/home/acme',
    });
  });

  it('sends a buyer who asked for MFA to MFA setup, carrying the team to continue to', async () => {
    await expect(
      complete({ ...buyer, mfa: { enroll: true } } as Submission),
    ).resolves.toEqual({ redirectTo: '/mfa-setup?team=acme' });
  });

  it('reuses the team a failed earlier attempt created instead of creating a second one', async () => {
    db.ownedTeam = { id: 'team-old', slug: 'acme-old' };

    await expect(complete(buyer)).resolves.toEqual({
      redirectTo: '/home/acme-old',
    });
    expect(db.createdTeams).toEqual([]);
    expect(writesTo('deal_box').map((row) => row.account_id)).toEqual([
      'team-old',
    ]);
  });
});

describe('completeOnboardingAction for an invitee', () => {
  beforeEach(() => {
    db.writes.length = 0;
    db.createdTeams.length = 0;
    db.ownedTeam = null;
    db.memberTeams = [{ id: 'team-globex', slug: 'globex' }];
    seedSampleDeals.mockClear();
    startTrialDrip.mockClear();
  });

  it('starts no trial drip for the invited team', async () => {
    await complete(invitee);

    expect(startTrialDrip).not.toHaveBeenCalled();
  });

  it("lands the invitee in the invited team's home", async () => {
    await expect(complete(invitee)).resolves.toEqual({
      redirectTo: '/home/globex',
    });
  });

  it('marks the invitee onboarded without touching any team data', async () => {
    await complete(invitee);

    expect(writesTo('accounts')).toEqual([
      expect.objectContaining({ name: 'Ivy Invitee', onboarded: true }),
    ]);
    expect(writesTo('comp_pool_optin')).toEqual([]);
    expect(writesTo('deal_box')).toEqual([]);
    expect(db.createdTeams).toEqual([]);
    expect(seedSampleDeals).not.toHaveBeenCalled();
  });

  it('sends an invitee who asked for MFA to MFA setup, carrying the team', async () => {
    await expect(
      complete({ ...invitee, mfa: { enroll: true } } as Submission),
    ).resolves.toEqual({ redirectTo: '/mfa-setup?team=globex' });
  });

  it('refuses a team the user is not a member of and leaves the account un-onboarded', async () => {
    db.memberTeams = [];

    await expect(complete(invitee)).rejects.toThrow();
    expect(writesTo('accounts')).toEqual([]);
  });
});
