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
  const requestContractSignature = vi.fn(
    async () => 'https://sign.test/t/team/documents/envelope_doc1/edit',
  );
  const uploadVersion = vi.fn(async () => undefined);
  const download = vi.fn(async () => ({ data: new Blob(['pdf']), error: null }));
  const storageFrom = vi.fn(() => ({ download }));

  let stage = 'loi_accepted';

  let template: { id: string } | null = { id: 'tmpl-apa' };

  function setTemplate(next: { id: string } | null) {
    template = next;
  }

  const inserted: Record<string, unknown[]> = {};

  function setStage(next: string) {
    stage = next;
  }

  let existing: { signing_status: string | null }[] = [];
  const checkContractSignature = vi.fn(async () => undefined);

  function setExistingContract(signingStatus: string | null) {
    existing = [{ signing_status: signingStatus }];
  }

  function listFor(table: string): unknown {
    if (table === 'offer_version') {
      return [{ id: 'ver-1' }];
    }

    return existing.map((version) => ({
      type: 'apa',
      versions: [{ id: 'cv-0', version: 1, ...version }],
    }));
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
    builder.update = chain;
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
    requestContractSignature,
    uploadVersion,
    storageFrom,
    from,
    setTemplate,
    setExistingContract,
    checkContractSignature,
    setStage,
    inserted,
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
  GENERATED_BUCKET: 'generated',
}));

vi.mock('@odb/contracts', () => ({
  createSupabaseContractStorage: () => ({ uploadVersion: mocks.uploadVersion }),
  contractPdfPath: (accountId: string, contractId: string, version: number) =>
    `${accountId}/${contractId}/v${version}.pdf`,
  PDF_CONTENT_TYPE: 'application/pdf',
}));

vi.mock('@odb/contracts/esign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/contracts/esign')>()),
  requestContractSignature: mocks.requestContractSignature,
  checkContractSignature: mocks.checkContractSignature,
  createDocumensoClient: () => ({ marker: 'documenso' }),
}));

import { DocumensoRejected } from '@odb/contracts/esign';

import { generateApa } from './apa-actions';

type Action = (data: Record<string, unknown>) => Promise<unknown>;

const run = generateApa as unknown as Action;
const SIGNERS = [
  { name: 'Bea Buyer', email: 'buyer@example.com' },
  { name: 'Sol Seller', email: 'seller@example.com' },
];
const REQUEST = {
  offer_id: '0b0f5a0e-58a5-4a40-9d4e-6f0f3f3c8a11',
  signers: SIGNERS,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setTemplate({ id: 'tmpl-apa' });
  mocks.setExistingContract(null);
  mocks.checkContractSignature.mockImplementation(async () => undefined);
  process.env.DOCUMENSO_URL = 'https://sign.test';
  process.env.DOCUMENSO_API_KEY = 'api_test';
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

  it.each([
    ['no signers', [], 'Name at least one signer'],
    [
      'a signer without a name',
      [{ name: ' ', email: 'buyer@example.com' }],
      'Each signer needs a name',
    ],
    [
      'a signer without a valid email address',
      [{ name: 'Bea Buyer', email: 'buyer' }],
      'Each signer needs a valid email address',
    ],
  ])('refuses %s before writing anything', async (_label, signers, refusal) => {
    expect(await run({ ...REQUEST, signers })).toEqual({ ok: false, refusal });

    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.appendDealEvent).not.toHaveBeenCalled();
  });

  it.each(['draft', 'sent'])(
    'refuses before writing anything while the APA of this offer has a %s signature request',
    async (status) => {
      mocks.setExistingContract(status);

      expect(await run(REQUEST)).toEqual({
        ok: false,
        refusal: 'A signature request for this APA is already in progress',
      });

      expect(mocks.appendDealEvent).not.toHaveBeenCalled();
      expect(mocks.requestContractSignature).not.toHaveBeenCalled();
    },
  );

  it('refuses before writing anything once the APA of this offer has been signed', async () => {
    mocks.setExistingContract('completed');

    expect(await run(REQUEST)).toEqual({
      ok: false,
      refusal: 'This APA has already been signed',
    });

    expect(mocks.appendDealEvent).not.toHaveBeenCalled();
  });

  it.each(['declined', 'expired', null])(
    'generates again when the earlier APA of this offer is %s',
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
      refusal: 'A signature request for this APA is already in progress',
    });

    expect(mocks.generateFromTemplate).not.toHaveBeenCalled();
    expect(mocks.requestContractSignature).not.toHaveBeenCalled();
  });

  it('refuses when the account has no APA template', async () => {
    mocks.setTemplate(null);

    expect(await run(REQUEST)).toEqual({
      ok: false,
      refusal: 'No APA template is set up for this account',
    });

    expect(mocks.requestContractSignature).not.toHaveBeenCalled();
  });

  it('says so when Documenso does not accept the signature request', async () => {
    mocks.requestContractSignature.mockRejectedValueOnce(
      new DocumensoRejected('Documenso responded with 400'),
    );

    expect(await run(REQUEST)).toEqual({
      ok: false,
      refusal:
        'Documenso did not accept the signature request. Check the signers and try again',
    });
  });

  it('still throws when Documenso fails for a reason no person caused', async () => {
    mocks.requestContractSignature.mockRejectedValueOnce(
      new Error('Documenso responded with 500'),
    );

    await expect(run(REQUEST)).rejects.toThrow('Documenso responded with 500');
  });

  it('returns the contract version and where to place signature fields and send in Documenso', async () => {
    expect(await run(REQUEST)).toEqual({
      ok: true,
      value: {
        contractVersionId: 'cv-1',
        editorUrl: 'https://sign.test/t/team/documents/envelope_doc1/edit',
      },
    });
  });

  it('renders an apa contract version and requests its signature from the signers named', async () => {
    await run(REQUEST);

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
    expect(mocks.requestContractSignature).toHaveBeenCalledWith(
      expect.objectContaining({ contractVersionId: 'cv-1', signers: SIGNERS }),
      expect.objectContaining({ documenso: { marker: 'documenso' } }),
    );
  });

  it('does not change the deal stage; that waits for Documenso to report the envelope sent', async () => {
    await run(REQUEST);

    const stageChanges = mocks.appendDealEvent.mock.calls.filter(
      (call) => call[1].eventType === 'deal.stage_changed',
    );
    expect(stageChanges).toHaveLength(0);
  });

  it('refuses when the deal has not reached loi_accepted', async () => {
    mocks.setStage('loi_submitted');

    expect(await run(REQUEST)).toEqual({
      ok: false,
      refusal: 'An APA can be generated once the LOI is accepted',
    });
    expect(mocks.requestContractSignature).not.toHaveBeenCalled();
  });
});
