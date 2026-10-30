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
const {
  decideContractReview,
  overrideContractSigning,
  requestContractReview,
  sellerConfirmContractReview,
  setDealReviewGate,
  setTeamReviewGate,
} = await import('./actions');
const {
  CANNOT_CHANGE_REVIEW_GATE,
  CANNOT_CHANGE_TEAM_REVIEW_GATE,
  CANNOT_OVERRIDE_SIGNING,
  CANNOT_REVIEW,
  SELLER_HAS_COUNSEL,
} = await import('./refusals');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let owner: Person;
let member: Person;
let dealLead: Person;
let buyerCounsel: Person;
let sellerCounsel: Person;
let seller: Person;
let stranger: Person;
let teamId: string;
let counselledDealId: string;
let counselledContractId: string;
let uncounselledContractId: string;
let uncounselledDealId: string;
let nextVersion = 1;

async function newContract(dealId: string) {
  const contractId = crypto.randomUUID();

  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'contract',
      p_aggregate_id: contractId,
      p_event_type: 'contract.created',
      p_payload: { type: 'apa', status: 'draft', current_version: 0 },
      p_actor_kind: 'service',
    })
    .throwOnError();

  return contractId;
}

async function newVersion(contractId: string, shared = true) {
  const { data } = await admin
    .from('contract_version')
    .insert({
      contract_id: contractId,
      account_id: teamId,
      version: nextVersion++,
      source: 'upload',
      party: 'buyer',
      shared_at: shared ? new Date().toISOString() : null,
    })
    .select('id')
    .single()
    .throwOnError();

  return data.id;
}

async function addSellerToRoom(dealId: string, person: Person) {
  const { data: roomId } = await owner.client
    .rpc('ensure_seller_room', { deal_id: dealId })
    .throwOnError();

  await admin
    .from('seller_room_member')
    .insert({
      room_id: roomId,
      user_id: person.userId,
      email: person.email,
      name: 'Sam Seller',
    })
    .throwOnError();
}

async function decisionsOn(versionId: string) {
  const { data } = await admin
    .from('contract_review_decision')
    .select('side, decision, note, decided_by, without_counsel')
    .eq('contract_version_id', versionId)
    .order('decided_at')
    .throwOnError();

  return data;
}

async function requestsOn(versionId: string) {
  const { data } = await admin
    .from('contract_review_request')
    .select('requested_by')
    .eq('contract_version_id', versionId)
    .throwOnError();

  return data;
}

async function signingReady(versionId: string) {
  const { data } = await admin
    .rpc('contract_version_signing_ready', { contract_version_id: versionId })
    .throwOnError();

  return data;
}

async function overridesOn(versionId: string) {
  const { data } = await admin
    .from('contract_signing_override')
    .select('reason, overridden_by')
    .eq('contract_version_id', versionId)
    .throwOnError();

  return data;
}

beforeAll(async () => {
  owner = await provisionPerson();
  member = await provisionPerson();
  dealLead = await provisionPerson();
  buyerCounsel = await provisionPerson();
  sellerCounsel = await provisionPerson();
  seller = await provisionPerson();
  stranger = await provisionPerson();
  teamId = await provisionTeam(owner, 'Review Partners');

  await admin
    .from('accounts_memberships')
    .insert([
      { account_id: teamId, user_id: member.userId, account_role: 'member' },
      {
        account_id: teamId,
        user_id: dealLead.userId,
        account_role: 'deal_lead',
      },
    ])
    .throwOnError();

  counselledDealId = await newDeal(teamId, owner);
  uncounselledDealId = await newDeal(teamId, owner);

  await admin
    .from('deal_counsel')
    .insert([
      {
        account_id: teamId,
        deal_id: counselledDealId,
        side: 'buyer',
        user_id: buyerCounsel.userId,
        email: buyerCounsel.email,
      },
      {
        account_id: teamId,
        deal_id: counselledDealId,
        side: 'seller',
        user_id: sellerCounsel.userId,
        email: sellerCounsel.email,
      },
    ])
    .throwOnError();
  await addSellerToRoom(counselledDealId, seller);
  await addSellerToRoom(uncounselledDealId, seller);

  counselledContractId = await newContract(counselledDealId);
  uncounselledContractId = await newContract(uncounselledDealId);
});

beforeEach(() => {
  world.signedInClient = owner.client;
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('requestContractReview', () => {
  it('records that a deal manager asked counsel to review the version', async () => {
    const versionId = await newVersion(counselledContractId);

    expect(
      await requestContractReview({ contractVersionId: versionId }),
    ).toEqual({ ok: true });
    expect(await requestsOn(versionId)).toEqual([
      { requested_by: owner.userId },
    ]);
  });

  it('refuses a team member who does not manage deals', async () => {
    world.signedInClient = member.client;
    const versionId = await newVersion(counselledContractId);

    expect(
      await requestContractReview({ contractVersionId: versionId }),
    ).toEqual({ ok: false, refusal: CANNOT_REVIEW });
    expect(await requestsOn(versionId)).toEqual([]);
  });
});

describe('decideContractReview', () => {
  it("records buyer's counsel's decision on the buyer side", async () => {
    world.signedInClient = buyerCounsel.client;
    const versionId = await newVersion(counselledContractId);

    expect(
      await decideContractReview({
        contractVersionId: versionId,
        decision: 'approved_with_comments',
        note: 'Cap the indemnity before closing',
      }),
    ).toEqual({ ok: true });
    expect(await decisionsOn(versionId)).toEqual([
      {
        side: 'buyer',
        decision: 'approved_with_comments',
        note: 'Cap the indemnity before closing',
        decided_by: buyerCounsel.userId,
        without_counsel: false,
      },
    ]);
  });

  it("records seller's counsel's decision on the seller side", async () => {
    world.signedInClient = sellerCounsel.client;
    const versionId = await newVersion(counselledContractId);

    await decideContractReview({
      contractVersionId: versionId,
      decision: 'changes_needed',
    });

    expect(await decisionsOn(versionId)).toEqual([
      {
        side: 'seller',
        decision: 'changes_needed',
        note: null,
        decided_by: sellerCounsel.userId,
        without_counsel: false,
      },
    ]);
  });

  it('keeps every answer when counsel changes their mind', async () => {
    world.signedInClient = buyerCounsel.client;
    const versionId = await newVersion(counselledContractId);

    await decideContractReview({
      contractVersionId: versionId,
      decision: 'changes_needed',
    });
    await decideContractReview({
      contractVersionId: versionId,
      decision: 'approved',
    });

    expect((await decisionsOn(versionId)).map((d) => d.decision)).toEqual([
      'changes_needed',
      'approved',
    ]);
  });

  it('confirms the buyer side as a deal manager when the buyer has no counsel', async () => {
    const versionId = await newVersion(uncounselledContractId);

    expect(
      await decideContractReview({
        contractVersionId: versionId,
        decision: 'approved',
      }),
    ).toEqual({ ok: true });
    expect(await decisionsOn(versionId)).toEqual([
      {
        side: 'buyer',
        decision: 'approved',
        note: null,
        decided_by: owner.userId,
        without_counsel: true,
      },
    ]);
  });

  it("refuses a deal manager when buyer's counsel is on the deal", async () => {
    const versionId = await newVersion(counselledContractId);

    expect(
      await decideContractReview({
        contractVersionId: versionId,
        decision: 'approved',
      }),
    ).toEqual({ ok: false, refusal: CANNOT_REVIEW });
    expect(await decisionsOn(versionId)).toEqual([]);
  });

  it('refuses someone who is not on the deal', async () => {
    world.signedInClient = stranger.client;
    const versionId = await newVersion(uncounselledContractId);

    expect(
      await decideContractReview({
        contractVersionId: versionId,
        decision: 'approved',
      }),
    ).toEqual({ ok: false, refusal: CANNOT_REVIEW });
    expect(await decisionsOn(versionId)).toEqual([]);
  });
});

describe('sellerConfirmContractReview', () => {
  it('confirms the seller side as the seller when the seller has no counsel', async () => {
    world.signedInClient = seller.client;
    const versionId = await newVersion(uncounselledContractId);

    expect(
      await sellerConfirmContractReview({
        contractVersionId: versionId,
        decision: 'changes_needed',
        note: 'Closing date is wrong',
      }),
    ).toEqual({ ok: true });
    expect(await decisionsOn(versionId)).toEqual([
      {
        side: 'seller',
        decision: 'changes_needed',
        note: 'Closing date is wrong',
        decided_by: seller.userId,
        without_counsel: true,
      },
    ]);
  });

  it("refuses the seller when seller's counsel is on the deal", async () => {
    world.signedInClient = seller.client;
    const versionId = await newVersion(counselledContractId);

    expect(
      await sellerConfirmContractReview({
        contractVersionId: versionId,
        decision: 'approved',
      }),
    ).toEqual({ ok: false, refusal: SELLER_HAS_COUNSEL });
    expect(await decisionsOn(versionId)).toEqual([]);
  });

  it('refuses the seller once the seller room closes, saying why, and records nothing', async () => {
    world.signedInClient = seller.client;
    const versionId = await newVersion(uncounselledContractId);
    await admin
      .from('seller_room')
      .update({ closed_at: new Date().toISOString() })
      .eq('deal_id', uncounselledDealId)
      .throwOnError();

    const confirmed = await sellerConfirmContractReview({
      contractVersionId: versionId,
      decision: 'approved',
    });

    await admin
      .from('seller_room')
      .update({ closed_at: null })
      .eq('deal_id', uncounselledDealId)
      .throwOnError();
    expect(confirmed).toEqual({
      ok: false,
      refusal: 'The seller room is closed, so this is read-only.',
    });
    expect(await decisionsOn(versionId)).toEqual([]);
  });

  it('refuses the seller on a version never shown to the seller side', async () => {
    world.signedInClient = seller.client;
    const versionId = await newVersion(uncounselledContractId, false);

    expect(
      await sellerConfirmContractReview({
        contractVersionId: versionId,
        decision: 'approved',
      }),
    ).toEqual({ ok: false, refusal: CANNOT_REVIEW });
    expect(await decisionsOn(versionId)).toEqual([]);
  });

  it("lets seller's counsel who join later supersede the seller's confirmation", async () => {
    const dealId = await newDeal(teamId, owner);
    await addSellerToRoom(dealId, seller);
    const versionId = await newVersion(await newContract(dealId));
    await decideContractReview({
      contractVersionId: versionId,
      decision: 'approved',
    });
    world.signedInClient = seller.client;
    await sellerConfirmContractReview({
      contractVersionId: versionId,
      decision: 'approved',
    });
    expect(await signingReady(versionId)).toBe(true);

    await admin
      .from('deal_counsel')
      .insert({
        account_id: teamId,
        deal_id: dealId,
        side: 'seller',
        user_id: sellerCounsel.userId,
        email: sellerCounsel.email,
      })
      .throwOnError();
    world.signedInClient = sellerCounsel.client;
    await decideContractReview({
      contractVersionId: versionId,
      decision: 'changes_needed',
    });

    expect(await signingReady(versionId)).toBe(false);
  });

  it('refuses someone who is not the seller', async () => {
    world.signedInClient = member.client;
    const versionId = await newVersion(uncounselledContractId);

    expect(
      await sellerConfirmContractReview({
        contractVersionId: versionId,
        decision: 'approved',
      }),
    ).toEqual({ ok: false, refusal: CANNOT_REVIEW });
    expect(await decisionsOn(versionId)).toEqual([]);
  });
});

describe('overrideContractSigning', () => {
  it('records the reason and makes the version ready to sign', async () => {
    const versionId = await newVersion(counselledContractId);

    expect(
      await overrideContractSigning({
        contractVersionId: versionId,
        reason: 'Counsel approved by phone',
      }),
    ).toEqual({ ok: true });
    expect(await overridesOn(versionId)).toEqual([
      { reason: 'Counsel approved by phone', overridden_by: owner.userId },
    ]);
    expect(
      (
        await admin
          .rpc('contract_version_signing_ready', {
            contract_version_id: versionId,
          })
          .throwOnError()
      ).data,
    ).toBe(true);
  });

  it('refuses a blank reason', async () => {
    const versionId = await newVersion(counselledContractId);

    await expect(
      overrideContractSigning({ contractVersionId: versionId, reason: '   ' }),
    ).rejects.toThrow();
    expect(await overridesOn(versionId)).toEqual([]);
  });

  it('refuses a team member who does not manage deals', async () => {
    world.signedInClient = member.client;
    const versionId = await newVersion(counselledContractId);

    expect(
      await overrideContractSigning({
        contractVersionId: versionId,
        reason: 'Counsel approved by phone',
      }),
    ).toEqual({ ok: false, refusal: CANNOT_OVERRIDE_SIGNING });
    expect(await overridesOn(versionId)).toEqual([]);
  });
});

async function dealRequires(dealId: string, type: 'loi' | 'apa') {
  const { data } = await admin
    .rpc('contract_review_required', { deal_id: dealId, contract_type: type })
    .throwOnError();

  return data;
}

async function teamRequires(type: 'loi' | 'apa') {
  const { data } = await admin
    .rpc('contract_review_team_required', {
      account_id: teamId,
      contract_type: type,
    })
    .throwOnError();

  return data;
}

async function dealGateChanges(dealId: string) {
  const { data } = await admin
    .from('deal_contract_review_gate_change')
    .select('id')
    .eq('deal_id', dealId)
    .throwOnError();

  return data;
}

async function teamGateChanges() {
  const { data } = await admin
    .from('contract_review_gate_default_change')
    .select('id')
    .eq('account_id', teamId)
    .throwOnError();

  return data;
}

describe('setDealReviewGate', () => {
  it("changes whether one deal's LOI needs counsel sign-off", async () => {
    const dealId = await newDeal(teamId, owner);

    expect(
      await setDealReviewGate({ dealId, type: 'loi', required: true }),
    ).toEqual({ ok: true });
    expect(await dealRequires(dealId, 'loi')).toBe(true);
    expect(await dealRequires(counselledDealId, 'loi')).toBe(false);
  });

  it('logs nothing when the deal already has that setting', async () => {
    const dealId = await newDeal(teamId, owner);

    expect(
      await setDealReviewGate({ dealId, type: 'apa', required: true }),
    ).toEqual({ ok: true });
    expect(await dealGateChanges(dealId)).toEqual([]);
    const { data: events } = await admin
      .from('deal_event')
      .select('id')
      .eq('deal_id', dealId)
      .eq('event_type', 'deal.contract_review_gate_changed')
      .throwOnError();
    expect(events).toEqual([]);
  });

  it("refuses a gate for an LOI extension, which follows the deal's LOI", async () => {
    const dealId = await newDeal(teamId, owner);

    await expect(
      setDealReviewGate({
        dealId,
        // @ts-expect-error an extension has no gate of its own
        type: 'loi_extension',
        required: false,
      }),
    ).rejects.toThrow('expected one of \\"loi\\"|\\"apa\\"');
    expect(await dealGateChanges(dealId)).toEqual([]);
  });

  it('refuses a team member who does not manage deals', async () => {
    world.signedInClient = member.client;
    const dealId = await newDeal(teamId, owner);

    expect(
      await setDealReviewGate({ dealId, type: 'apa', required: false }),
    ).toEqual({ ok: false, refusal: CANNOT_CHANGE_REVIEW_GATE });
    expect(await dealRequires(dealId, 'apa')).toBe(true);
  });
});

describe('setTeamReviewGate', () => {
  it("changes the team's default for a contract type", async () => {
    expect(
      await setTeamReviewGate({
        accountId: teamId,
        type: 'apa',
        required: false,
      }),
    ).toEqual({ ok: true });
    expect(await teamRequires('apa')).toBe(false);

    await setTeamReviewGate({ accountId: teamId, type: 'apa', required: true });
    expect(await teamRequires('apa')).toBe(true);
  });

  it('logs nothing when the team already has that default', async () => {
    const before = await teamGateChanges();

    expect(
      await setTeamReviewGate({
        accountId: teamId,
        type: 'loi',
        required: false,
      }),
    ).toEqual({ ok: true });
    expect(await teamGateChanges()).toEqual(before);
  });

  it("refuses a default for LOI extensions, which follow the team's LOI default", async () => {
    const before = await teamGateChanges();

    await expect(
      setTeamReviewGate({
        accountId: teamId,
        // @ts-expect-error an extension has no gate of its own
        type: 'loi_extension',
        required: false,
      }),
    ).rejects.toThrow('expected one of \\"loi\\"|\\"apa\\"');
    expect(await teamGateChanges()).toEqual(before);
  });

  it('refuses a deal lead, who is neither owner nor admin', async () => {
    world.signedInClient = dealLead.client;

    expect(
      await setTeamReviewGate({
        accountId: teamId,
        type: 'loi',
        required: true,
      }),
    ).toEqual({ ok: false, refusal: CANNOT_CHANGE_TEAM_REVIEW_GATE });
    expect(await teamRequires('loi')).toBe(false);
  });
});
