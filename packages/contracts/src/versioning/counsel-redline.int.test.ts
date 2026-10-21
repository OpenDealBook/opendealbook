import { zipSync } from 'fflate';
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

const {
  admin,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
  withLockedTeam,
} = await import('../../../features/seller-rooms/src/test-support/world.ts');
const { TEAM_READ_ONLY } = await import('@odb/next');
const { uploadCounselRedline } = await import('./actions');
const { APA_NEEDS_COUNSEL } = await import('../types');

const NOT_COUNSEL_ON_CONTRACT = 'You cannot add a version to this contract.';
const NOT_DOCX = 'Upload the redline as a Word (.docx) file.';
const TOO_LARGE = 'The redline is larger than the 300 MiB limit.';
const { sellerSideContracts } = await import('./queries');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let owner: Person;
let buyerCounsel: Person;
let sellerCounsel: Person;
let stranger: Person;
let teamId: string;
let dealId: string;

const redline = new Uint8Array(
  readFileSync(
    join(import.meta.dirname, '../../../templates/fixtures/loi-standard.docx'),
  ),
);

async function newContract(deal = dealId, type: 'loi' | 'apa' = 'loi') {
  const contractId = crypto.randomUUID();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: deal,
      p_aggregate_type: 'contract',
      p_aggregate_id: contractId,
      p_event_type: 'contract.created',
      p_payload: { type, status: 'draft', current_version: 1 },
      p_actor_kind: 'service',
    })
    .throwOnError();

  return contractId;
}

async function seedVersion(
  contractId: string,
  version: number,
  party: 'buyer' | 'seller',
  shared: boolean,
) {
  await admin
    .from('contract_version')
    .insert({
      contract_id: contractId,
      account_id: teamId,
      version,
      source: 'upload',
      party,
      shared_at: shared ? new Date().toISOString() : null,
    })
    .throwOnError();
}

async function versionsOf(contractId: string) {
  const { data } = await admin
    .from('contract_version')
    .select('version, party, source, author_user_id, change_summary, docx_path')
    .eq('contract_id', contractId)
    .order('version')
    .throwOnError();

  return data;
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

async function storedBytes(path: string) {
  const { data, error } = await admin.storage.from('contracts').download(path);

  if (error) {
    throw error;
  }

  return new Uint8Array(await data.arrayBuffer());
}

async function makeCounsel(
  person: Person,
  side: 'buyer' | 'seller',
  deal = dealId,
) {
  await admin
    .from('deal_counsel')
    .insert({
      account_id: teamId,
      deal_id: deal,
      side,
      user_id: person.userId,
      email: person.email,
    })
    .throwOnError();
}

beforeAll(async () => {
  owner = await provisionPerson();
  buyerCounsel = await provisionPerson();
  sellerCounsel = await provisionPerson();
  stranger = await provisionPerson();
  teamId = await provisionTeam(owner, 'Redline Partners');
  dealId = await newDeal(teamId, owner);
  await makeCounsel(buyerCounsel, 'buyer');
  await makeCounsel(sellerCounsel, 'seller');
});

beforeEach(() => {
  world.signedInClient = buyerCounsel.client;
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('uploadCounselRedline', () => {
  it("adds buyer's counsel redline as a buyer version that does not become current", async () => {
    const contractId = await newContract();
    await seedVersion(contractId, 1, 'buyer', false);

    await uploadCounselRedline({
      dealId,
      contractId,
      docxBytes: redline,
      changeSummary: 'Tightened indemnity',
    });

    const versions = await versionsOf(contractId);
    expect(versions.map(({ docx_path: _, ...rest }) => rest)).toEqual([
      expect.objectContaining({ version: 1 }),
      {
        version: 2,
        party: 'buyer',
        source: 'upload',
        author_user_id: buyerCounsel.userId,
        change_summary: 'Tightened indemnity',
      },
    ]);
    expect(await storedBytes(versions[1]!.docx_path!)).toEqual(redline);
    expect(await currentVersionOf(contractId)).toBe(1);
  });

  it("keeps buyer's counsel redline hidden from the seller side until shared", async () => {
    const contractId = await newContract();
    await seedVersion(contractId, 1, 'buyer', true);

    await uploadCounselRedline({ dealId, contractId, docxBytes: redline });

    world.signedInClient = sellerCounsel.client;
    const seen = (await sellerSideContracts(sellerCounsel.client, dealId)).find(
      (contract) => contract.id === contractId,
    );
    expect(seen!.versions.map((version) => version.version)).toEqual([1]);
  });

  it("adds seller's counsel redline as a seller version numbered after what the seller side sees", async () => {
    const contractId = await newContract();
    await seedVersion(contractId, 1, 'buyer', true);
    await seedVersion(contractId, 2, 'buyer', false);
    await seedVersion(contractId, 3, 'buyer', false);
    world.signedInClient = sellerCounsel.client;

    const result = await uploadCounselRedline({
      dealId,
      contractId,
      docxBytes: redline,
    });

    expect(result).toEqual({ ok: true });
    expect((await versionsOf(contractId)).at(-1)).toMatchObject({
      version: 4,
      party: 'seller',
      author_user_id: sellerCounsel.userId,
    });
    expect(await currentVersionOf(contractId)).toBe(1);
    const seen = (await sellerSideContracts(sellerCounsel.client, dealId)).find(
      (contract) => contract.id === contractId,
    );
    expect(
      seen!.versions.map(({ version, party }) => ({ version, party })),
    ).toEqual([
      { version: 1, party: 'buyer' },
      { version: 2, party: 'seller' },
    ]);
  });

  it("refuses seller's counsel a contract the seller side cannot see", async () => {
    const contractId = await newContract();
    await seedVersion(contractId, 1, 'buyer', false);
    world.signedInClient = sellerCounsel.client;

    await expect(
      uploadCounselRedline({ dealId, contractId, docxBytes: redline }),
    ).rejects.toThrow(NOT_COUNSEL_ON_CONTRACT);
    expect(await versionsOf(contractId)).toHaveLength(1);
  });

  it('refuses someone who is not counsel on the deal', async () => {
    const contractId = await newContract();
    await seedVersion(contractId, 1, 'buyer', true);
    world.signedInClient = stranger.client;

    await expect(
      uploadCounselRedline({ dealId, contractId, docxBytes: redline }),
    ).rejects.toThrow(NOT_COUNSEL_ON_CONTRACT);
    expect(await versionsOf(contractId)).toHaveLength(1);
  });

  it('refuses counsel once the deal is closed', async () => {
    const closedDeal = await newDeal(teamId, owner);
    await makeCounsel(buyerCounsel, 'buyer', closedDeal);
    const contractId = await newContract(closedDeal);
    await seedVersion(contractId, 1, 'buyer', true);
    await admin
      .rpc('append_deal_event', {
        p_deal_id: closedDeal,
        p_aggregate_type: 'deal',
        p_aggregate_id: closedDeal,
        p_event_type: 'deal.archived',
        p_payload: {},
        p_actor_kind: 'service',
      })
      .throwOnError();

    await expect(
      uploadCounselRedline({
        dealId: closedDeal,
        contractId,
        docxBytes: redline,
      }),
    ).rejects.toThrow(NOT_COUNSEL_ON_CONTRACT);
    expect(await versionsOf(contractId)).toHaveLength(1);
  });

  it('refuses counsel while the team is billing-locked', async () => {
    const contractId = await newContract();
    await seedVersion(contractId, 1, 'buyer', true);

    await withLockedTeam(teamId, async () => {
      expect(
        await uploadCounselRedline({ dealId, contractId, docxBytes: redline }),
      ).toEqual({ ok: false, refusal: TEAM_READ_ONLY });
    });
    expect(await versionsOf(contractId)).toHaveLength(1);
  });

  it("refuses an APA redline while the deal lacks seller's counsel", async () => {
    const apaDeal = await newDeal(teamId, owner);
    await makeCounsel(buyerCounsel, 'buyer', apaDeal);
    const contractId = await newContract(apaDeal, 'apa');
    await seedVersion(contractId, 1, 'buyer', true);

    expect(
      await uploadCounselRedline({
        dealId: apaDeal,
        contractId,
        docxBytes: redline,
      }),
    ).toEqual({ ok: false, refusal: APA_NEEDS_COUNSEL });
    expect(await versionsOf(contractId)).toHaveLength(1);
  });

  it.each([
    ['a PDF', new TextEncoder().encode('%PDF-1.7 not a Word file')],
    [
      'a zip that is not a Word file',
      zipSync({ 'sheet.xml': new Uint8Array(10) }),
    ],
    [
      'a Word file that inflates past the limit',
      zipSync({ 'word/document.xml': new Uint8Array(201 * 1024 * 1024) }),
    ],
  ])('refuses %s', async (_, docxBytes) => {
    const contractId = await newContract();
    await seedVersion(contractId, 1, 'buyer', true);

    expect(
      await uploadCounselRedline({
        dealId,
        contractId,
        docxBytes: new Uint8Array(docxBytes),
      }),
    ).toEqual({ ok: false, refusal: NOT_DOCX });
    expect(await versionsOf(contractId)).toHaveLength(1);
  });

  it('fails on a Word file whose text cannot be read and adds no version', async () => {
    const contractId = await newContract();
    await seedVersion(contractId, 1, 'buyer', true);

    await expect(
      uploadCounselRedline({
        dealId,
        contractId,
        docxBytes: new Uint8Array(
          zipSync({
            'word/document.xml': new TextEncoder().encode('<w:document'),
            '[Content_Types].xml': new Uint8Array(0),
          }),
        ),
      }),
    ).rejects.toThrow();
    expect(await versionsOf(contractId)).toHaveLength(1);
  });

  it('refuses a redline larger than 300 MiB', async () => {
    const contractId = await newContract();
    await seedVersion(contractId, 1, 'buyer', true);

    expect(
      await uploadCounselRedline({
        dealId,
        contractId,
        docxBytes: new Uint8Array(300 * 1024 * 1024 + 1),
      }),
    ).toEqual({ ok: false, refusal: TOO_LARGE });
    expect(await versionsOf(contractId)).toHaveLength(1);
  }, 60_000);

  it.each([
    ['buyer', () => buyerCounsel, []],
    ['seller', () => sellerCounsel, ['contract.version_shown_to_seller_side']],
  ] as const)(
    "logs %s's counsel redline as added, and as shown only when the seller side sees it",
    async (_, who, shown) => {
      world.signedInClient = who().client;
      const contractId = await newContract();
      await seedVersion(contractId, 1, 'buyer', true);

      await uploadCounselRedline({ dealId, contractId, docxBytes: redline });

      const { data: added } = await admin
        .from('contract_version')
        .select('id')
        .eq('contract_id', contractId)
        .eq('version', 2)
        .single()
        .throwOnError();
      const { data: events } = await admin
        .from('deal_event')
        .select('event_type, payload')
        .eq('aggregate_id', contractId)
        .eq('payload->>version_id', added.id)
        .in('event_type', [
          'contract.version_added',
          'contract.version_shown_to_seller_side',
        ])
        .order('event_type')
        .throwOnError();
      expect(events).toEqual(
        ['contract.version_added', ...shown].map((event_type) => ({
          event_type,
          payload: { version_id: added.id },
        })),
      );
    },
  );

  it('logs the added version on the deal', async () => {
    const contractId = await newContract();
    await seedVersion(contractId, 1, 'buyer', true);

    await uploadCounselRedline({ dealId, contractId, docxBytes: redline });

    const { data: added } = await admin
      .from('contract_version')
      .select('id')
      .eq('contract_id', contractId)
      .eq('version', 2)
      .single()
      .throwOnError();
    const { data: events } = await admin
      .from('deal_event')
      .select('event_type, payload')
      .eq('aggregate_id', contractId)
      .eq('event_type', 'contract.version_added')
      .throwOnError();
    expect(events).toEqual([
      {
        event_type: 'contract.version_added',
        payload: { version_id: added.id },
      },
    ]);
  });
});
