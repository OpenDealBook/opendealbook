import { beforeEach, describe, expect, it, vi } from 'vitest';

const uuid = (n: number) =>
  `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

const mocks = vi.hoisted(() => {
  const appendDealEvent = vi.fn(
    async (_client: unknown, _event: { eventType: string }) => undefined,
  );
  const generateFromTemplate = vi.fn(async () => ({
    id: 'gen-1',
    docx_path: 'gen/apa.docx',
    pdf_path: 'gen/apa.pdf',
  }));
  const sendForSignature = vi.fn(async () => ({
    documentId: 'doc-1',
    status: 'PENDING',
  }));
  const uploadVersion = vi.fn(async () => undefined);
  const download = vi.fn(async () => ({ data: new Blob(['pdf']), error: null }));
  const storageFrom = vi.fn(() => ({ download }));

  let stage = 'loi_accepted';

  const inserted: Record<string, unknown[]> = {};

  function setStage(next: string) {
    stage = next;
  }

  function dataFor(table: string): unknown {
    if (table === 'offer') {
      return {
        deal_id: 'deal-1',
        account_id: 'acc-1',
        current_version_id: 'ver-1',
      };
    }
    if (table === 'deal') {
      return { stage };
    }
    if (table === 'offer_version') {
      return { terms: { schema_version: 1, purchase_price: 1_200_000 } };
    }
    if (table === 'document_template') {
      return { id: 'tmpl-apa' };
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
    builder.update = chain;
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({ data: dataFor(table), error: null });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));

  return {
    appendDealEvent,
    generateFromTemplate,
    sendForSignature,
    uploadVersion,
    storageFrom,
    from,
    setStage,
    inserted,
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

import { generateApa } from './apa-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string; email?: string },
) => Promise<unknown>;

const run = generateApa as unknown as Action;
const user = { id: 'user-1', email: 'buyer@example.com' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setStage('loi_accepted');
  for (const key of Object.keys(mocks.inserted)) {
    delete mocks.inserted[key];
  }
  let counter = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(
    () => uuid(++counter) as ReturnType<typeof crypto.randomUUID>,
  );
});

describe('generateApa', () => {
  it('renders an apa contract version and sends it for signature', async () => {
    await run({ offer_id: 'offer-1' }, user);

    expect(mocks.generateFromTemplate).toHaveBeenCalledWith({
      accountId: 'acc-1',
      templateId: 'tmpl-apa',
      dealId: 'deal-1',
      fieldValues: { schema_version: 1, purchase_price: 1_200_000 },
    });
    const version = mocks.inserted.contract_version?.[0] as Record<
      string,
      unknown
    >;
    expect(version).toMatchObject({
      version: 1,
      source: 'generated',
      party: 'buyer',
    });
    expect(version.pdf_path).toBe(`acc-1/${version.contract_id}/v1.pdf`);
    expect(mocks.uploadVersion).toHaveBeenCalledWith(
      version.pdf_path,
      expect.any(Uint8Array),
      'application/pdf',
    );
    expect(mocks.sendForSignature).toHaveBeenCalledWith(
      expect.objectContaining({ contractVersionId: 'cv-1' }),
      expect.objectContaining({ documenso: { marker: 'documenso' } }),
    );
  });

  it('advances the deal to pa_submitted', async () => {
    await run({ offer_id: 'offer-1' }, user);

    const stageChange = mocks.appendDealEvent.mock.calls.find(
      (call) => call[1].eventType === 'deal.stage_changed',
    );
    expect(stageChange?.[1]).toMatchObject({
      eventType: 'deal.stage_changed',
      payload: { stage: 'pa_submitted' },
    });
  });

  it('rejects when the deal has not reached loi_accepted', async () => {
    mocks.setStage('loi_submitted');

    await expect(run({ offer_id: 'offer-1' }, user)).rejects.toThrow(
      'loi_accepted',
    );
    expect(mocks.sendForSignature).not.toHaveBeenCalled();
  });
});
