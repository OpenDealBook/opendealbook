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
const { retryContractVersionPdf, uploadCounselRedline } =
  await import('./actions');
const { contractVersionViews } = await import('./version-views');
const { contractPdfPath, createSupabaseContractStorage } =
  await import('../storage');
const { SigningNotReady, requestContractSignature } =
  await import('../esign/documenso');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let owner: Person;
let buyerCounsel: Person;
let stranger: Person;
let sellerCounsel: Person;
let teamId: string;
let dealId: string;

const redline = new Uint8Array(
  readFileSync(
    join(import.meta.dirname, '../../../templates/fixtures/loi-standard.docx'),
  ),
);

async function newApa() {
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

async function uploadedVersion(contractId: string, by = buyerCounsel) {
  world.signedInClient = by.client;
  expect(
    await uploadCounselRedline({ dealId, contractId, docxBytes: redline }),
  ).toEqual({ ok: true });

  const { data: version } = await admin
    .from('contract_version')
    .select(
      'id, version, contract_id, party, change_summary, is_signed, created_at, shared_at',
    )
    .eq('contract_id', contractId)
    .order('version', { ascending: false })
    .limit(1)
    .single()
    .throwOnError();
  await admin
    .from('contract_signing_override')
    .insert({
      account_id: teamId,
      contract_version_id: version.id,
      reason: 'Counsel approved by phone',
      overridden_by: owner.userId,
    })
    .throwOnError();

  return version;
}

async function failedVersion(contractId?: string, by = buyerCounsel) {
  vi.stubEnv('GOTENBERG_URL', 'http://127.0.0.1:9');
  const version = await uploadedVersion(contractId ?? (await newApa()), by);
  vi.stubEnv('GOTENBERG_URL', 'http://localhost:3009');

  return version;
}

async function apaSharedWithSellerSide() {
  const contractId = await newApa();
  await admin
    .from('contract_version')
    .insert({
      contract_id: contractId,
      account_id: teamId,
      version: 1,
      source: 'upload',
      party: 'buyer',
      shared_at: new Date().toISOString(),
    })
    .throwOnError();

  return contractId;
}

async function storedPdfOf(versionId: string) {
  const { data: row } = await admin
    .from('contract_version')
    .select('version, pdf_bucket, pdf_path')
    .eq('id', versionId)
    .single()
    .throwOnError();

  if (row.pdf_path === null) {
    return { version: row.version, pdf: null };
  }

  const { data } = await admin.storage
    .from(row.pdf_bucket!)
    .download(row.pdf_path);

  return {
    version: row.version,
    pdf: new TextDecoder().decode(
      new Uint8Array(await data!.arrayBuffer()).slice(0, 5),
    ),
  };
}

function sendForSignature(contractVersionId: string) {
  const sent: Uint8Array[] = [];
  const documenso = {
    createDraft: async ({ pdf }: { pdf: Uint8Array }) => {
      sent.push(pdf);
      return { documentId: crypto.randomUUID() };
    },
    editorUrl: async (documentId: string) => `https://sign.test/${documentId}`,
  };

  return {
    sent,
    sending: requestContractSignature(
      { contractVersionId, dealId, signers: [] },
      {
        client: owner.client,
        storage: createSupabaseContractStorage(owner.client),
        documenso: documenso as never,
      },
    ),
  };
}

beforeAll(async () => {
  owner = await provisionPerson();
  buyerCounsel = await provisionPerson();
  stranger = await provisionPerson();
  teamId = await provisionTeam(owner, 'Upload Pdf Partners');
  dealId = await newDeal(teamId, owner);
  sellerCounsel = await provisionPerson();
  await admin
    .from('deal_counsel')
    .insert(
      [
        { side: 'buyer' as const, person: buyerCounsel },
        { side: 'seller' as const, person: sellerCounsel },
      ].map(({ side, person }) => ({
        account_id: teamId,
        deal_id: dealId,
        side,
        user_id: person.userId,
        email: person.email,
      })),
    )
    .throwOnError();
});

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);
  vi.stubEnv('GOTENBERG_URL', 'http://localhost:3009');
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('an uploaded Word contract version', () => {
  it('is sent to Documenso as a PDF', async () => {
    const version = await uploadedVersion(await newApa());

    const { sent, sending } = sendForSignature(version.id);

    expect(await sending).toMatch(/^https:\/\/sign\.test\//);
    expect(new TextDecoder().decode(sent[0]!.slice(0, 5))).toBe('%PDF-');
  });

  it('that Gotenberg cannot convert is kept, shown without a PDF, and refused for signature', async () => {
    vi.stubEnv('GOTENBERG_URL', 'http://127.0.0.1:9');
    const version = await uploadedVersion(await newApa());

    const [view] = await contractVersionViews(admin, [version as never]);
    expect(view).toMatchObject({ hasDocx: true, hasPdf: false });

    const { sent, sending } = sendForSignature(version.id);
    const refusal = await sending.then(
      () => null,
      (failure: unknown) => failure,
    );

    expect(refusal).toBeInstanceOf(SigningNotReady);
    expect((refusal as Error).message).toBe(
      `Version ${version.version} has no PDF to sign. Retry the PDF or upload the Word file again.`,
    );
    expect(sent).toEqual([]);
  });
});

describe('retrying the PDF of a version whose conversion failed', () => {
  it("converts counsel's same Word file in place, after which it can be sent", async () => {
    const version = await failedVersion();
    world.signedInClient = buyerCounsel.client;

    expect(
      await retryContractVersionPdf({ contractVersionId: version.id }),
    ).toEqual({ ok: true });

    expect(await storedPdfOf(version.id)).toEqual({
      version: version.version,
      pdf: '%PDF-',
    });
    const { sent, sending } = sendForSignature(version.id);
    expect(await sending).toMatch(/^https:\/\/sign\.test\//);
    expect(sent).toHaveLength(1);
  });

  it('lets the deal team retry, converging after a run that stored the PDF but stopped and when run again', async () => {
    const version = await failedVersion();
    await admin.storage
      .from('contracts')
      .upload(
        contractPdfPath(teamId, version.contract_id, version.version),
        new Uint8Array([1]),
        { contentType: 'application/pdf' },
      );
    world.signedInClient = owner.client;

    expect(
      await retryContractVersionPdf({ contractVersionId: version.id }),
    ).toEqual({ ok: true });
    expect(
      await retryContractVersionPdf({ contractVersionId: version.id }),
    ).toEqual({ ok: true });

    expect(await storedPdfOf(version.id)).toEqual({
      version: version.version,
      pdf: '%PDF-',
    });
  });

  it('refuses someone who may not add versions to the contract', async () => {
    const version = await failedVersion();
    world.signedInClient = stranger.client;

    expect(
      await retryContractVersionPdf({ contractVersionId: version.id }),
    ).toEqual({
      ok: false,
      refusal: 'You cannot retry the PDF of this version.',
    });
    expect((await storedPdfOf(version.id)).pdf).toBeNull();
  });

  it("lets seller's counsel retry their own redline", async () => {
    const version = await failedVersion(
      await apaSharedWithSellerSide(),
      sellerCounsel,
    );
    world.signedInClient = sellerCounsel.client;

    expect(
      await retryContractVersionPdf({ contractVersionId: version.id }),
    ).toEqual({ ok: true });
    expect((await storedPdfOf(version.id)).pdf).toBe('%PDF-');
  });

  it('refuses counsel a version not shown to their side, as it refuses anyone else', async () => {
    const version = await failedVersion(await apaSharedWithSellerSide());
    world.signedInClient = sellerCounsel.client;

    expect(
      await retryContractVersionPdf({ contractVersionId: version.id }),
    ).toEqual({
      ok: false,
      refusal: 'You cannot retry the PDF of this version.',
    });
    expect((await storedPdfOf(version.id)).pdf).toBeNull();
  });

  it('refuses while the team is read-only', async () => {
    const version = await failedVersion();
    world.signedInClient = owner.client;

    await withLockedTeam(teamId, async () => {
      expect(
        await retryContractVersionPdf({ contractVersionId: version.id }),
      ).toEqual({ ok: false, refusal: TEAM_READ_ONLY });
    });
    expect((await storedPdfOf(version.id)).pdf).toBeNull();
  });

  it('refuses and keeps the version failed when Gotenberg still cannot convert it', async () => {
    const version = await failedVersion();
    vi.stubEnv('GOTENBERG_URL', 'http://127.0.0.1:9');
    world.signedInClient = owner.client;

    expect(
      await retryContractVersionPdf({ contractVersionId: version.id }),
    ).toEqual({
      ok: false,
      refusal:
        'The PDF conversion failed again. Try again later or upload the Word file again.',
    });
    expect((await storedPdfOf(version.id)).pdf).toBeNull();
  });
});
