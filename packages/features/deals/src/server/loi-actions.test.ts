import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  const checkTemplateFields = vi.fn(async () => undefined);
  const requestContractSignature = vi.fn(
    async () => 'https://sign.test/t/team/documents/envelope_doc1/edit',
  );
  const dealBoxScreenPasses = vi.fn(async () => true);
  const uploadVersion = vi.fn(async () => undefined);
  const download = vi.fn(async () => ({
    data: new Blob(['pdf']),
    error: null,
  }));
  const storageFrom = vi.fn(() => ({ download }));

  let offer: unknown = {
    deal_id: 'deal-1',
    account_id: 'acc-1',
    status: 'accepted',
    current_version_id: 'ver-1',
  };

  let template: { id: string } | null = { id: 'tmpl-loi' };

  let terms: Record<string, unknown> = {
    schema_version: 1,
    purchase_price: 900_000,
  };

  function setTerms(next: Record<string, unknown>) {
    terms = next;
  }

  function setTemplate(next: { id: string } | null) {
    template = next;
  }

  const inserted: Record<string, unknown[]> = {};
  const updated: Record<string, unknown[]> = {};

  function setOffer(next: unknown) {
    offer = next;
  }

  let existing: { signing_status: string | null }[] = [];
  const checkContractSignature = vi.fn(async () => undefined);

  function setExistingContract(signingStatus: string | null) {
    existing = [{ signing_status: signingStatus }];
  }

  function clearExistingContracts() {
    existing = [];
  }

  function listFor(table: string): unknown {
    if (table === 'offer_version') {
      return [{ id: 'ver-1' }];
    }

    return existing.map((version) => ({
      type: 'loi',
      versions: [{ id: 'cv-0', version: 1, ...version }],
    }));
  }

  function dataFor(table: string): unknown {
    if (table === 'offer') {
      return offer;
    }
    if (table === 'offer_version') {
      return {
        terms,
        purchase_price: 900_000,
        target_close_date: '2026-12-01',
        exclusivity_days: 30,
        diligence_days: 45,
        real_estate_portion: null,
      };
    }
    if (table === 'deal') {
      return { firm_id: 'firm-1' };
    }
    if (table === 'firm') {
      return { owner_names: ['Sol Seller'] };
    }
    if (table === 'accounts') {
      return { legal_entity_name: 'Buyer Holdings LLC' };
    }
    if (table === 'deal_terms_sought') {
      return { seller_note_amount: 100_000 };
    }
    if (table === 'document_template') {
      return template;
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
    let isOne = false;
    const one = () => {
      isOne = true;
      return builder;
    };

    builder.in = chain;
    builder.single = one;
    builder.maybeSingle = one;
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
      resolve({
        data:
          isOne || (table !== 'contract' && table !== 'offer_version')
            ? dataFor(table)
            : listFor(table),
        error: null,
      });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));

  return {
    appendDealEvent,
    generateFromTemplate,
    checkTemplateFields,
    requestContractSignature,
    dealBoxScreenPasses,
    uploadVersion,
    storageFrom,
    from,
    setTemplate,
    setTerms,
    setExistingContract,
    clearExistingContracts,
    checkContractSignature,
    setOffer,
    inserted,
    updated,
  };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (data: unknown, user: { id: string }) => unknown) => (data: unknown) =>
      fn(data, { id: 'user-1' }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: mocks.from,
    storage: { from: mocks.storageFrom },
  }),
  getSupabaseServerAdminClient: () => ({ marker: 'admin' }),
}));

vi.mock('@odb/events', () => ({
  appendDealEvent: mocks.appendDealEvent,
}));

vi.mock('@odb/templates/server', () => ({
  generateFromTemplate: mocks.generateFromTemplate,
  checkTemplateFields: mocks.checkTemplateFields,
  GENERATED_BUCKET: 'generated',
}));

vi.mock('@odb/contracts', () => ({
  createSupabaseContractStorage: () => ({ uploadVersion: mocks.uploadVersion }),
  contractPdfPath: (accountId: string, contractId: string, version: number) =>
    `${accountId}/${contractId}/v${version}.pdf`,
  PDF_CONTENT_TYPE: 'application/pdf',
  announceNewVersion: async () => undefined,
}));

vi.mock('@odb/contracts/esign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/contracts/esign')>()),
  requestContractSignature: mocks.requestContractSignature,
  checkContractSignature: mocks.checkContractSignature,
  createDocumensoClient: () => ({ marker: 'documenso' }),
}));

vi.mock('../shared/queries', () => ({
  dealBoxScreenPasses: mocks.dealBoxScreenPasses,
}));

import { generateLoi } from './loi-actions';

type Action = (data: Record<string, unknown>) => Promise<unknown>;

const run = generateLoi as unknown as Action;
const REQUEST = {
  offer_id: '0b0f5a0e-58a5-4a40-9d4e-6f0f3f3c8a11',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setTemplate({ id: 'tmpl-loi' });
  mocks.setTerms({ schema_version: 1, purchase_price: 900_000 });
  mocks.clearExistingContracts();
  mocks.checkContractSignature.mockImplementation(async () => undefined);
  process.env.DOCUMENSO_URL = 'https://sign.test';
  process.env.DOCUMENSO_API_KEY = 'api_test';
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
  it('refuses before writing anything when Documenso is not configured', async () => {
    delete process.env.DOCUMENSO_API_KEY;

    expect(await run(REQUEST)).toEqual({
      ok: false,
      refusal: 'E-signature is not set up yet: Documenso is not configured',
    });

    expect(mocks.appendDealEvent).not.toHaveBeenCalled();
    expect(mocks.generateFromTemplate).not.toHaveBeenCalled();
    expect(mocks.requestContractSignature).not.toHaveBeenCalled();
  });

  it.each(['draft', 'sent'])(
    'refuses before writing anything while the LOI of this offer has a %s signature request',
    async (status) => {
      mocks.setExistingContract(status);

      expect(await run(REQUEST)).toEqual({
        ok: false,
        refusal: 'A signature request for this LOI is already in progress',
      });

      expect(mocks.appendDealEvent).not.toHaveBeenCalled();
      expect(mocks.requestContractSignature).not.toHaveBeenCalled();
    },
  );

  it('refuses before writing anything once the LOI of this offer has been signed', async () => {
    mocks.setExistingContract('completed');

    expect(await run(REQUEST)).toEqual({
      ok: false,
      refusal: 'This LOI has already been signed',
    });

    expect(mocks.appendDealEvent).not.toHaveBeenCalled();
  });

  it.each(['declined', 'expired', null])(
    'generates again when the earlier LOI of this offer is %s',
    async (status) => {
      mocks.setExistingContract(status);

      expect(await run(REQUEST)).toMatchObject({ ok: true });
    },
  );

  it('asks Documenso first when our record says draft, and generates again if the draft turns out to be gone', async () => {
    mocks.setExistingContract('draft');
    mocks.checkContractSignature.mockImplementation(async () => {
      mocks.setExistingContract('declined');
    });

    expect(await run(REQUEST)).toMatchObject({ ok: true });
    expect(mocks.checkContractSignature).toHaveBeenCalledWith(
      'cv-0',
      expect.objectContaining({ admin: { marker: 'admin' } }),
    );
  });

  it('refuses the loser of two simultaneous generates, whose contract another request created first', async () => {
    mocks.appendDealEvent.mockRejectedValueOnce({
      code: '40001',
      message: 'stale aggregate',
    });

    expect(await run(REQUEST)).toEqual({
      ok: false,
      refusal: 'A signature request for this LOI is already in progress',
    });

    expect(mocks.generateFromTemplate).not.toHaveBeenCalled();
    expect(mocks.requestContractSignature).not.toHaveBeenCalled();
  });

  it('refuses when the account has no LOI template', async () => {
    mocks.setTemplate(null);

    expect(await run(REQUEST)).toEqual({
      ok: false,
      refusal: 'No LOI template is set up for this account',
    });

    expect(mocks.requestContractSignature).not.toHaveBeenCalled();
  });

  it('returns the new contract version', async () => {
    expect(await run(REQUEST)).toEqual({
      ok: true,
      value: {
        contractVersionId: 'cv-1',
      },
    });
  });

  describe('field values', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-30T15:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('fills names, dates, cash at close and the offer columns for the template', async () => {
      await run(REQUEST);

      expect(mocks.generateFromTemplate).toHaveBeenCalledWith({
        accountId: 'acc-1',
        templateId: 'tmpl-loi',
        dealId: 'deal-1',
        fieldValues: {
          schema_version: 1,
          buyer_name: 'Buyer Holdings LLC',
          seller_name: 'Sol Seller',
          effective_date: '2026-10-30',
          purchase_price: 900_000,
          cash_at_close: 800_000,
          target_close_date: '2026-12-01',
          exclusivity_days: 30,
          diligence_days: 45,
          real_estate_portion: null,
        },
      });
    });

    it('lets the offer terms override every default and column', async () => {
      mocks.setTerms({
        schema_version: 1,
        purchase_price: 950_000,
        buyer_name: 'Other Buyer Inc',
        seller_name: 'Pat Seller',
        effective_date: '2026-11-15',
        cash_at_close: 700_000,
        diligence_days: 60,
      });

      await run(REQUEST);

      expect(mocks.generateFromTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldValues: expect.objectContaining({
            buyer_name: 'Other Buyer Inc',
            seller_name: 'Pat Seller',
            effective_date: '2026-11-15',
            purchase_price: 950_000,
            cash_at_close: 700_000,
            diligence_days: 60,
            exclusivity_days: 30,
          }),
        }),
      );
    });
  });

  it('refuses with what is missing and leaves no contract behind when the template cannot be filled', async () => {
    mocks.checkTemplateFields.mockRejectedValueOnce(
      new Error('Fill in: Seller name, Effective date'),
    );

    expect(await run(REQUEST)).toEqual({
      ok: false,
      refusal: 'Fill in: Seller name, Effective date',
    });
    expect(mocks.appendDealEvent).not.toHaveBeenCalled();
    expect(mocks.generateFromTemplate).not.toHaveBeenCalled();
  });

  it('creates a generated version-one contract version from the render', async () => {
    await run(REQUEST);

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

  it('requests no signature for the new contract version', async () => {
    await run(REQUEST);

    expect(mocks.requestContractSignature).not.toHaveBeenCalled();
  });

  it('does not advance the deal stage', async () => {
    await run(REQUEST);

    const stageChanges = mocks.appendDealEvent.mock.calls.filter(
      (call) => call[1].eventType === 'deal.stage_changed',
    );
    expect(stageChanges).toHaveLength(0);
  });

  it('refuses when the deal has not passed the deal box screen', async () => {
    mocks.dealBoxScreenPasses.mockResolvedValueOnce(false);

    expect(await run(REQUEST)).toEqual({
      ok: false,
      refusal: 'This deal has not passed the deal box screen',
    });
    expect(mocks.requestContractSignature).not.toHaveBeenCalled();
  });

  it('refuses when the offer is not accepted', async () => {
    mocks.setOffer({
      deal_id: 'deal-1',
      account_id: 'acc-1',
      status: 'submitted',
      current_version_id: 'ver-1',
    });

    expect(await run(REQUEST)).toEqual({
      ok: false,
      refusal: 'This offer has not been accepted yet',
    });
    expect(mocks.requestContractSignature).not.toHaveBeenCalled();
  });
});
