import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  ANON_KEY,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from '../../../features/seller-rooms/src/test-support/world.ts';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

const world = vi.hoisted(() => ({ signedInClient: null as unknown }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

const { admin, cleanUp, newDeal, provisionPerson, provisionTeam } =
  await import('../../../features/seller-rooms/src/test-support/world.ts');
const { adoptContractVersion } = await import('./actions');
const { sellerSideContracts, visibleContracts } = await import('./queries');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let owner: Person;
let teamMember: Person;
let buyerCounsel: Person;
let sellerCounsel: Person;
let teamId: string;
let dealId: string;

async function newContract() {
  const contractId = crypto.randomUUID();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'contract',
      p_aggregate_id: contractId,
      p_event_type: 'contract.created',
      p_payload: { type: 'loi', status: 'draft', current_version: 1 },
      p_actor_kind: 'service',
    })
    .throwOnError();

  return contractId;
}

async function seedVersion(
  contractId: string,
  version: number,
  party: 'buyer' | 'seller',
  shared = false,
) {
  const { data } = await admin
    .from('contract_version')
    .insert({
      contract_id: contractId,
      account_id: teamId,
      version,
      source: 'upload',
      party,
      shared_at: shared ? new Date().toISOString() : null,
    })
    .select('id')
    .single()
    .throwOnError();

  return data.id;
}

async function currentVersionOf(contractId: string) {
  const { data } = await admin
    .from('contract')
    .select('current_version')
    .eq('id', contractId)
    .single()
    .throwOnError();

  return data.current_version;
}

beforeAll(async () => {
  owner = await provisionPerson();
  teamMember = await provisionPerson();
  buyerCounsel = await provisionPerson();
  sellerCounsel = await provisionPerson();
  teamId = await provisionTeam(owner, 'Adopt Partners');
  dealId = await newDeal(teamId, owner);

  await admin
    .from('accounts_memberships')
    .insert({
      account_id: teamId,
      user_id: teamMember.userId,
      account_role: 'member',
    })
    .throwOnError();

  for (const [person, side] of [
    [buyerCounsel, 'buyer'],
    [sellerCounsel, 'seller'],
  ] as const) {
    await admin
      .from('deal_counsel')
      .insert({
        account_id: teamId,
        deal_id: dealId,
        side,
        user_id: person.userId,
        email: person.email,
      })
      .throwOnError();
  }
});

beforeEach(() => {
  world.signedInClient = owner.client;
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('adoptContractVersion', () => {
  it("makes seller's counsel redline the current version", async () => {
    const contractId = await newContract();
    await seedVersion(contractId, 1, 'buyer', true);
    const redlineId = await seedVersion(contractId, 2, 'seller');

    await adoptContractVersion({ contractVersionId: redlineId });

    expect(await currentVersionOf(contractId)).toBe(2);
  });

  it('shows the team which version is current', async () => {
    const contractId = await newContract();
    await seedVersion(contractId, 1, 'buyer');
    const latestId = await seedVersion(contractId, 2, 'seller');

    await adoptContractVersion({ contractVersionId: latestId });

    expect(
      (await visibleContracts(owner.client, dealId)).find(
        (contract) => contract.id === contractId,
      )!.current_version,
    ).toBe(2);
  });

  it('moves current back to an earlier version', async () => {
    const contractId = await newContract();
    const firstId = await seedVersion(contractId, 1, 'buyer');
    const latestId = await seedVersion(contractId, 2, 'buyer');
    await adoptContractVersion({ contractVersionId: latestId });

    await adoptContractVersion({ contractVersionId: firstId });

    expect(await currentVersionOf(contractId)).toBe(1);
  });

  it('shares nothing new with the seller side', async () => {
    const contractId = await newContract();
    await seedVersion(contractId, 1, 'buyer', true);
    const draftId = await seedVersion(contractId, 2, 'buyer');

    await adoptContractVersion({ contractVersionId: draftId });

    const seen = (await sellerSideContracts(sellerCounsel.client, dealId)).find(
      (contract) => contract.id === contractId,
    );
    expect(seen!.versions.map(({ id }) => id)).not.toContain(draftId);
  });

  it('lets a team member without deals.manage advance to the newest version', async () => {
    const contractId = await newContract();
    await seedVersion(contractId, 1, 'buyer', true);
    const redlineId = await seedVersion(contractId, 2, 'seller');
    world.signedInClient = teamMember.client;

    await adoptContractVersion({ contractVersionId: redlineId });

    expect(await currentVersionOf(contractId)).toBe(2);
  });

  it('refuses a team member without deals.manage an older version', async () => {
    const contractId = await newContract();
    const firstId = await seedVersion(contractId, 1, 'buyer');
    const latestId = await seedVersion(contractId, 2, 'seller');
    await adoptContractVersion({ contractVersionId: latestId });
    world.signedInClient = teamMember.client;

    expect(await adoptContractVersion({ contractVersionId: firstId })).toEqual({
      ok: false,
      refusal: expect.stringMatching(
        /^Only deal managers can change the current contract version\. Ask /,
      ),
    });
    expect(await currentVersionOf(contractId)).toBe(2);
  });

  it("refuses buyer's counsel", async () => {
    const contractId = await newContract();
    await seedVersion(contractId, 1, 'buyer', true);
    const redlineId = await seedVersion(contractId, 2, 'seller');
    world.signedInClient = buyerCounsel.client;

    expect(await adoptContractVersion({ contractVersionId: redlineId })).toEqual({
      ok: false,
      refusal: 'Only the deal team can change the current contract version.',
    });
    expect(await currentVersionOf(contractId)).toBe(1);
  });

  it.each([["seller's counsel", () => sellerCounsel]])('refuses %s', async (_, who) => {
    const contractId = await newContract();
    await seedVersion(contractId, 1, 'buyer', true);
    const redlineId = await seedVersion(contractId, 2, 'seller');
    world.signedInClient = who().client;

    await expect(
      adoptContractVersion({ contractVersionId: redlineId }),
    ).rejects.toThrow();
    expect(await currentVersionOf(contractId)).toBe(1);
  });
});
