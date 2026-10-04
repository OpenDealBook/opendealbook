import { beforeEach, describe, expect, it, vi } from 'vitest';

const uuid = (n: number) =>
  `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

const mocks = vi.hoisted(() => {
  const appendDealEvent = vi.fn(
    async (_client: unknown, _event: { eventType: string }) => undefined,
  );
  const generateFromTemplate = vi.fn(async () => ({
    id: 'gen-1',
    docx_path: 'gen/loi.docx',
    pdf_path: 'gen/loi.pdf',
  }));
  const sendForSignature = vi.fn(async () => ({
    documentId: 'doc-1',
    status: 'PENDING',
  }));
  const dealBoxScreenPasses = vi.fn(async () => true);
  const uploadVersion = vi.fn(async () => undefined);
  const download = vi.fn(async () => ({ data: new Blob(['pdf']), error: null }));
  const storageFrom = vi.fn(() => ({ download }));

  let offer: unknown = {
    deal_id: 'deal-1',
    account_id: 'acc-1',
    status: 'accepted',
    current_version_id: 'ver-1',
  };

  const inserted: Record<string, unknown[]> = {};
  const updated: Record<string, unknown[]> = {};

  function setOffer(next: unknown) {
    offer = next;
  }

  function dataFor(table: string): unknown {
    if (table === 'offer') {
      return offer;
    }
    if (table === 'offer_version') {
      return { terms: { schema_version: 1, purchase_price: 900_000 } };
    }
    if (table === 'document_template') {
      return { id: 'tmpl-loi' };
    }
    if (table === 'contract_version') {
      return { id: 'cv-1' };
    }

    return {};
  }

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = chain;
    builder.eq = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.single = chain;
    builder.maybeSingle = chain;
    builder.throwOnError = chain;
    builder.insert = (row: unknown) => {
      (inserted[table] ??= []).push(row);
      return builder;
    };
    builder.update = (row: unknown) => {
      (updated[table] ??= []).push(row);
      return builder;
    };
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({ data: dataFor(table), error: null });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));

  return {
    appendDealEvent,
    generateFromTemplate,
    sendForSignature,
    dealBoxScreenPasses,
    uploadVersion,
    storageFrom,
    from,
    setOffer,
    inserted,
    updated,
  };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: mocks.from,
    storage: { from: mocks.storageFrom },
  }),
}));

vi.mock('@odb/events', () => ({
  appendDealEvent: mocks.appendDealEvent,
}));

vi.mock('@odb/templates/server', () => ({
  generateFromTemplate: mocks.generateFromTemplate,
  GENERATED_BUCKET: 'generated',
}));

vi.mock('@odb/contracts', () => ({
  createSupabaseContractStorage: () => ({ uploadVersion: mocks.uploadVersion }),
  contractPdfPath: (accountId: string, contractId: string, version: number) =>
    `${accountId}/${contractId}/v${version}.pdf`,
  PDF_CONTENT_TYPE: 'application/pdf',
}));

vi.mock('@odb/contracts/esign', () => ({
  sendForSignature: mocks.sendForSignature,
  createDocumensoClient: () => ({ marker: 'documenso' }),
}));

vi.mock('../shared/queries', () => ({
  dealBoxScreenPasses: mocks.dealBoxScreenPasses,
}));

import { generateLoi } from './loi-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string; email?: string },
) => Promise<unknown>;

const run = generateLoi as unknown as Action;
const user = { id: 'user-1', email: 'buyer@example.com' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setOffer({
    deal_id: 'deal-1',
    account_id: 'acc-1',
    status: 'accepted',
    current_version_id: 'ver-1',
  });
  for (const key of Object.keys(mocks.inserted)) {
    delete mocks.inserted[key];
  }
  for (const key of Object.keys(mocks.updated)) {
    delete mocks.updated[key];
  }
  let counter = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(
    () => uuid(++counter) as ReturnType<typeof crypto.randomUUID>,
  );
});

describe('generateLoi', () => {
  it('renders the loi template with the accepted offer terms', async () => {
    await run({ offer_id: 'offer-1' }, user);

    expect(mocks.generateFromTemplate).toHaveBeenCalledWith({
      accountId: 'acc-1',
      templateId: 'tmpl-loi',
      dealId: 'deal-1',
      fieldValues: { schema_version: 1, purchase_price: 900_000 },
    });
  });

  it('creates a generated version-one contract version from the render', async () => {
    await run({ offer_id: 'offer-1' }, user);

    const version = mocks.inserted.contract_version?.[0] as Record<
      string,
      unknown
    >;
    expect(version).toMatchObject({
      account_id: 'acc-1',
      version: 1,
      source: 'generated',
      party: 'buyer',
      docx_path: 'gen/loi.docx',
      author_user_id: 'user-1',
    });
    expect(version.pdf_path).toBe(`acc-1/${version.contract_id}/v1.pdf`);
    expect(mocks.uploadVersion).toHaveBeenCalledWith(
      version.pdf_path,
      expect.any(Uint8Array),
      'application/pdf',
    );
    expect(mocks.updated.generated_document?.[0]).toMatchObject({
      contract_id: expect.any(String),
    });
  });

  it('sends the new contract version for signature', async () => {
    await run({ offer_id: 'offer-1' }, user);

    expect(mocks.sendForSignature).toHaveBeenCalledWith(
      {
        contractVersionId: 'cv-1',
        signers: [{ email: 'buyer@example.com', name: 'buyer@example.com' }],
      },
      expect.objectContaining({ documenso: { marker: 'documenso' } }),
    );
  });

  it('does not advance the deal stage', async () => {
    await run({ offer_id: 'offer-1' }, user);

    const stageChanges = mocks.appendDealEvent.mock.calls.filter(
      (call) => call[1].eventType === 'deal.stage_changed',
    );
    expect(stageChanges).toHaveLength(0);
  });

  it('rejects when the offer is not accepted', async () => {
    mocks.setOffer({
      deal_id: 'deal-1',
      account_id: 'acc-1',
      status: 'submitted',
      current_version_id: 'ver-1',
    });

    await expect(run({ offer_id: 'offer-1' }, user)).rejects.toThrow(
      'not accepted',
    );
    expect(mocks.sendForSignature).not.toHaveBeenCalled();
  });
});
