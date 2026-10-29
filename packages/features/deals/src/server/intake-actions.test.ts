import { beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => ({
  deal: { account_id: 'account-1' } as { account_id: string } | null,
  allowed: true,
}));

const mocks = vi.hoisted(() => {
  const appendDealEvent = vi.fn(async () => [{ deal_seq: 1, aggregate_seq: 1 }]);
  const generateStructured = vi.fn();

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = chain;
    builder.eq = chain;
    builder.single = chain;
    builder.maybeSingle = chain;
    builder.throwOnError = chain;
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({
        data: table === 'deal' ? access.deal : {},
        error: null,
      });

    return builder;
  }

  const pdfText = 'EXTRACTED PDF LISTING TEXT';
  const extractText = vi.fn(async () => ({ totalPages: 1, text: pdfText }));
  const getDocumentProxy = vi.fn(async () => ({ numPages: 1 }));

  return {
    appendDealEvent,
    generateStructured,
    extractText,
    getDocumentProxy,
    pdfText,
    from: vi.fn((table: string) => makeBuilder(table)),
  };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: { id: string }) => unknown) => (input: unknown) =>
      fn(input, { id: 'user-1' }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: mocks.from,
    rpc: () => ({ throwOnError: async () => ({ data: access.allowed, error: null }) }),
  }),
}));

vi.mock('@odb/events', () => ({
  appendDealEvent: mocks.appendDealEvent,
  appendDealEvents: vi.fn(),
}));

vi.mock('@odb/ai/server', () => ({
  generateStructured: mocks.generateStructured,
}));

vi.mock('unpdf', () => ({
  extractText: mocks.extractText,
  getDocumentProxy: mocks.getDocumentProxy,
}));

import {
  extractDealIntakeFromText,
  rerunDealIntake,
  rerunDealIntakePdf,
} from './intake-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

const runRerun = rerunDealIntake as unknown as Action;
const runRerunPdf = rerunDealIntakePdf as unknown as Action;
const runExtract = extractDealIntakeFromText as unknown as Action;

const DEAL = '6221ddef-b8e9-484f-8bb8-0967d8e16a30';
const ACCOUNT = '7c1f0a52-4b8e-4f0e-9d5a-2f8f1d6b9a10';

const FIXTURE = {
  revenue: 4200000,
  sde: 900000,
  ebitda: 750000,
  asking_price: 3500000,
  industry: 'HVAC services',
  location: 'Austin, TX',
  description: 'Established HVAC contractor',
  employees: '25-50',
  business_model: 'Recurring service contracts',
  reason_for_sale: 'retirement',
};

beforeEach(() => {
  vi.clearAllMocks();
  access.deal = { account_id: 'account-1' };
  access.allowed = true;
  mocks.generateStructured.mockImplementation(
    async (input: { parse: (raw: unknown) => unknown }) => ({
      ok: true,
      value: input.parse(FIXTURE),
    }),
  );
});

describe('extractDealIntakeFromText', () => {
  it('refuses with the reason AI was skipped, so the deal is created by hand', async () => {
    mocks.generateStructured.mockResolvedValueOnce({
      ok: false,
      reason: 'Connect an AI provider first',
    });

    expect(await runExtract({ account_id: ACCOUNT, text: 'a memo' }, { id: 'user-1' })).toEqual({
      ok: false,
      refusal: 'Connect an AI provider first',
    });
  });
});

describe('rerunDealIntake', () => {
  it('re-extracts and appends a deal.updated event with the mapped fields', async () => {
    await runRerun(
      { deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30', text: 'an updated memo' },
      { id: 'user-1' },
    );

    expect(mocks.generateStructured).toHaveBeenCalledTimes(1);
    expect(mocks.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { accountId: 'account-1', dealId: DEAL } }),
    );

    const [, input] = mocks.appendDealEvent.mock.calls.at(-1) as unknown as [
      unknown,
      {
        dealId: string;
        aggregateType: string;
        eventType: string;
        payload: Record<string, unknown>;
      },
    ];

    expect(input.dealId).toBe('6221ddef-b8e9-484f-8bb8-0967d8e16a30');
    expect(input.aggregateType).toBe('deal');
    expect(input.eventType).toBe('deal.updated');
    expect(input.payload).toMatchObject({
      description: 'Established HVAC contractor',
      asking_price: 3500000,
      revenue_ttm: 4200000,
      sde_ttm: 900000,
      ebitda_ttm: 750000,
      employee_band: '25-50',
      location_raw: 'Austin, TX',
      reason_for_sale: 'retirement',
      industry: 'HVAC services',
      business_model: 'Recurring service contracts',
    });
  });
});

describe('a caller without access', () => {
  it('may not extract a new deal for a team they cannot create deals in, and no AI is called', async () => {
    access.allowed = false;

    expect(await runExtract({ account_id: ACCOUNT, text: 'a memo' }, { id: 'user-1' })).toEqual({
      ok: false,
      refusal: "Read-only members can't create deals. Ask a deal manager.",
    });
    expect(mocks.generateStructured).not.toHaveBeenCalled();
  });

  it.each([
    ["can't see", () => (access.deal = null)],
    ["can't manage", () => (access.allowed = false)],
  ])('may not rerun intake on a deal they %s, and no AI is called', async (_case, deny) => {
    deny();

    expect(await runRerun({ deal_id: DEAL, text: 'an updated memo' }, { id: 'user-1' })).toEqual({
      ok: false,
      refusal: 'Only deal managers can rerun intake.',
    });
    expect(mocks.generateStructured).not.toHaveBeenCalled();
    expect(mocks.appendDealEvent).not.toHaveBeenCalled();
  });
});

describe('rerunDealIntake when AI is skipped', () => {
  it('refuses with the reason and leaves the deal unchanged', async () => {
    mocks.generateStructured.mockResolvedValueOnce({
      ok: false,
      reason: 'The monthly AI limit is reached',
    });

    expect(await runRerun({ deal_id: DEAL, text: 'an updated memo' }, { id: 'user-1' })).toEqual({
      ok: false,
      refusal: 'The monthly AI limit is reached',
    });
    expect(mocks.appendDealEvent).not.toHaveBeenCalled();
  });
});

describe('rerunDealIntakePdf', () => {
  it('extracts text from the PDF and appends a deal.updated event', async () => {
    const pdf = Buffer.from('%PDF-1.4 binary updated listing').toString(
      'base64',
    );

    await runRerunPdf({ deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30', pdf }, { id: 'user-1' });

    expect(mocks.extractText).toHaveBeenCalledTimes(1);
    expect(mocks.generateStructured).toHaveBeenCalledTimes(1);

    const [prompt] = mocks.generateStructured.mock.calls.at(-1) as unknown as [
      { prompt: string },
    ];
    expect(prompt.prompt).toContain(mocks.pdfText);

    const [, event] = mocks.appendDealEvent.mock.calls.at(-1) as unknown as [
      unknown,
      { dealId: string; eventType: string; payload: Record<string, unknown> },
    ];
    expect(event.dealId).toBe('6221ddef-b8e9-484f-8bb8-0967d8e16a30');
    expect(event.eventType).toBe('deal.updated');
    expect(event.payload).toMatchObject({
      asking_price: 3500000,
      revenue_ttm: 4200000,
    });
  });
});
