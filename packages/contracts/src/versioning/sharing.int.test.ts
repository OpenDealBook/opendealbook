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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

const world = vi.hoisted(() => ({ signedInClient: null as unknown }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

const { admin, cleanUp, newDeal, provisionPerson, provisionTeam } =
  await import('../../../features/seller-rooms/src/test-support/world.ts');
const { newVersionFromUpload, setContractVersionShared } =
  await import('./actions');
const { CANNOT_SHARE } = await import('../types');
const { contractVersionFile, sellerSideContracts, visibleContracts } =
  await import('./queries');
const { contractVersionViews } = await import('./version-views');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let owner: Person;
let teamMember: Person;
let buyerCounsel: Person;
let sellerCounsel: Person;
let teamId: string;
let dealId: string;
let contractId: string;
let draftId: string;
let sellerVersionId: string;

async function sharedAt(versionId: string) {
  const { data } = await admin
    .from('contract_version')
    .select('shared_at')
    .eq('id', versionId)
    .single()
    .throwOnError();

  return data.shared_at;
}

function fixture(name: string) {
  return readFileSync(
    join(import.meta.dirname, '../../../templates/fixtures', name),
  );
}

async function newVersion(
  version: number,
  party: 'buyer' | 'seller',
  docx: string,
) {
  const docxPath = `${teamId}/${contractId}/v${version}.docx`;

  const { error } = await admin.storage
    .from('contracts')
    .upload(docxPath, fixture(docx));

  if (error) {
    throw error;
  }

  const { data } = await admin
    .from('contract_version')
    .insert({
      contract_id: contractId,
      account_id: teamId,
      version,
      source: 'upload',
      party,
      change_summary: `v${version}`,
      docx_path: docxPath,
      docx_bucket: 'contracts',
    })
    .select('id')
    .single()
    .throwOnError();

  return data.id;
}

beforeAll(async () => {
  owner = await provisionPerson();
  teamMember = await provisionPerson();
  buyerCounsel = await provisionPerson();
  sellerCounsel = await provisionPerson();
  teamId = await provisionTeam(owner, 'Sharing Partners');
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

  contractId = crypto.randomUUID();
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

  sellerVersionId = await newVersion(2, 'seller', 'apa-long.docx');
  draftId = await newVersion(1, 'buyer', 'apa-short.docx');
});

beforeEach(() => {
  world.signedInClient = owner.client;
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('setContractVersionShared', () => {
  it('lets a deal manager share a version and take it back', async () => {
    expect(
      await setContractVersionShared({
        contractVersionId: draftId,
        shared: true,
      }),
    ).toEqual({ ok: true });
    expect(await sharedAt(draftId)).not.toBeNull();

    await setContractVersionShared({
      contractVersionId: draftId,
      shared: false,
    });
    expect(await sharedAt(draftId)).toBeNull();
  });

  it('keeps when a version was first shared', async () => {
    await setContractVersionShared({
      contractVersionId: draftId,
      shared: true,
    });
    const first = await sharedAt(draftId);

    await setContractVersionShared({
      contractVersionId: draftId,
      shared: true,
    });

    expect(await sharedAt(draftId)).toBe(first);
    await setContractVersionShared({
      contractVersionId: draftId,
      shared: false,
    });
  });

  it.each([
    ['a team member without deals.manage', () => teamMember],
    ["buyer's counsel", () => buyerCounsel],
  ])('refuses %s', async (_, who) => {
    world.signedInClient = who().client;

    expect(
      await setContractVersionShared({
        contractVersionId: draftId,
        shared: true,
      }),
    ).toEqual({ ok: false, refusal: CANNOT_SHARE });
    expect(await sharedAt(draftId)).toBeNull();
  });
});

describe('visibleContracts', () => {
  it("gives buyer's counsel every version with its real number, oldest first", async () => {
    expect(await visibleContracts(buyerCounsel.client, dealId)).toEqual([
      expect.objectContaining({
        id: contractId,
        type: 'apa',
        versions: [
          expect.objectContaining({ id: draftId, version: 1, party: 'buyer' }),
          expect.objectContaining({
            id: sellerVersionId,
            version: 2,
            party: 'seller',
            change_summary: 'v2',
          }),
        ],
      }),
    ]);
  });

  it("gives seller's counsel nothing from the tables", async () => {
    expect(await visibleContracts(sellerCounsel.client, dealId)).toEqual([]);
  });
});

describe('sellerSideContracts', () => {
  it('numbers what the seller side may see from 1', async () => {
    expect(await sellerSideContracts(sellerCounsel.client, dealId)).toEqual([
      {
        id: contractId,
        type: 'apa',
        versions: [
          expect.objectContaining({
            id: sellerVersionId,
            version: 1,
            party: 'seller',
          }),
        ],
      },
    ]);
  });
});

describe('contractVersionFile', () => {
  it('hands a viewer the file of a version they can see', async () => {
    expect(
      await contractVersionFile(
        sellerCounsel.client,
        admin,
        sellerVersionId,
        'docx',
      ),
    ).toEqual({
      bytes: new Uint8Array(fixture('apa-long.docx')),
      contentType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filename: 'contract.docx',
    });
  });

  it('hands nothing for a version the viewer cannot see', async () => {
    expect(
      await contractVersionFile(sellerCounsel.client, admin, draftId, 'docx'),
    ).toBeNull();
  });

  it('hands nothing when the version has no such file', async () => {
    expect(
      await contractVersionFile(buyerCounsel.client, admin, draftId, 'pdf'),
    ).toBeNull();
  });
});

describe('contractVersionViews', () => {
  it('says which files each version has', async () => {
    const [contract] = await visibleContracts(buyerCounsel.client, dealId);
    const [first] = await contractVersionViews(admin, contract!.versions);

    expect(first).toMatchObject({ hasDocx: true, hasPdf: false });
  });

  it('redlines each version against the one before it', async () => {
    const [contract] = await visibleContracts(buyerCounsel.client, dealId);
    const [first, second] = await contractVersionViews(
      admin,
      contract!.versions,
    );

    expect(first!.redline).toBeNull();
    expect(second!.redline).toContainEqual({
      type: 'added',
      text: expect.stringContaining('(the Agreement)'),
    });
  });

  it('redlines only between versions the viewer can see', async () => {
    const [contract] = await sellerSideContracts(sellerCounsel.client, dealId);
    const [only] = await contractVersionViews(admin, contract!.versions);

    expect(only!.redline).toBeNull();
  });
});

describe('contractVersionViews with a broken file', () => {
  it('gives a version whose Word file cannot be read no redline, and still shows the rest', async () => {
    const brokenDealId = await newDeal(teamId, owner);
    const brokenContractId = crypto.randomUUID();
    await admin
      .rpc('append_deal_event', {
        p_deal_id: brokenDealId,
        p_aggregate_type: 'contract',
        p_aggregate_id: brokenContractId,
        p_event_type: 'contract.created',
        p_payload: { type: 'loi', status: 'draft', current_version: 0 },
        p_actor_kind: 'service',
      })
      .throwOnError();

    const files = [
      ['v1.docx', fixture('apa-short.docx')],
      ['v2.docx', new TextEncoder().encode('not a Word document')],
      ['v3.docx', fixture('apa-long.docx')],
    ] as const;
    for (const [index, [name, bytes]] of files.entries()) {
      const docxPath = `${teamId}/${brokenContractId}/${name}`;
      const { error } = await admin.storage
        .from('contracts')
        .upload(docxPath, bytes);

      if (error) {
        throw error;
      }

      await admin
        .from('contract_version')
        .insert({
          contract_id: brokenContractId,
          account_id: teamId,
          version: index + 1,
          source: 'upload',
          party: 'buyer',
          docx_path: docxPath,
          docx_bucket: 'contracts',
        })
        .throwOnError();
    }

    const [contract] = await visibleContracts(owner.client, brokenDealId);
    const views = await contractVersionViews(admin, contract!.versions);

    expect(views.map((view) => view.redline)).toEqual([null, null, null]);
    expect(views.map((view) => view.hasDocx)).toEqual([true, true, true]);
  });
});

describe('negotiation events', () => {
  let freshContractId: string;

  async function eventsOn(contract: string) {
    const { data } = await admin
      .from('deal_event')
      .select('event_type, payload')
      .eq('aggregate_id', contract)
      .in('event_type', [
        'contract.version_added',
        'contract.version_shown_to_seller_side',
      ])
      .order('global_seq')
      .throwOnError();

    return data;
  }

  beforeAll(async () => {
    freshContractId = crypto.randomUUID();
    await admin
      .rpc('append_deal_event', {
        p_deal_id: dealId,
        p_aggregate_type: 'contract',
        p_aggregate_id: freshContractId,
        p_event_type: 'contract.created',
        p_payload: { type: 'loi', status: 'draft', current_version: 0 },
        p_actor_kind: 'service',
      })
      .throwOnError();
  });

  it('logs a team upload as added, and its first share as shown to the seller side, once', async () => {
    const added = await newVersionFromUpload({
      contractId: freshContractId,
      docxBytes: new Uint8Array(fixture('apa-short.docx')),
      party: 'buyer',
    });

    expect(await eventsOn(freshContractId)).toEqual([
      {
        event_type: 'contract.version_added',
        payload: { version_id: added.id },
      },
    ]);

    for (const shared of [true, false, true]) {
      await setContractVersionShared({
        contractVersionId: added.id,
        shared,
      });
    }

    expect(await eventsOn(freshContractId)).toEqual([
      {
        event_type: 'contract.version_added',
        payload: { version_id: added.id },
      },
      {
        event_type: 'contract.version_shown_to_seller_side',
        payload: { version_id: added.id },
      },
    ]);
  });
});
