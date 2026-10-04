import { beforeEach, describe, expect, it, vi } from 'vitest';

const GENERATED_ID = '00000000-0000-0000-0000-000000000001';

const mocks = vi.hoisted(() => {
  const appendDealEvent = vi.fn(async () => [{ deal_seq: 1, aggregate_seq: 1 }]);
  const generateStructured = vi.fn();

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = chain;
    builder.eq = chain;
    builder.single = chain;
    builder.throwOnError = chain;
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({
        data: table === 'deal' ? { account_id: 'account-1' } : {},
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
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
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
  createDealFromIntake,
  createDealFromIntakePdf,
  rerunDealIntake,
  rerunDealIntakePdf,
} from './intake-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

const runCreate = createDealFromIntake as unknown as Action;
const runCreatePdf = createDealFromIntakePdf as unknown as Action;
const runRerun = rerunDealIntake as unknown as Action;
const runRerunPdf = rerunDealIntakePdf as unknown as Action;

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
  mocks.generateStructured.mockImplementation(
    async (_client: unknown, input: { parse: (raw: unknown) => unknown }) =>
      input.parse(FIXTURE),
  );
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(
    GENERATED_ID as ReturnType<typeof crypto.randomUUID>,
  );
});

describe('createDealFromIntake', () => {
  it('extracts the draft and creates a pre-filled deal.created event', async () => {
    const result = await runCreate(
      { account_id: 'account-1', text: 'a listing memo' },
      { id: 'user-1' },
    );

    expect(mocks.generateStructured).toHaveBeenCalledTimes(1);

    const [, input] = mocks.appendDealEvent.mock.calls.at(-1) as unknown as [
      unknown,
      { eventType: string; payload: Record<string, unknown> },
    ];

    expect(input.eventType).toBe('deal.created');
    expect(input.payload).toMatchObject({
      account_id: 'account-1',
      owner_user_id: 'user-1',
      source: 'manual',
      stage: 'sourcing',
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
    expect(result).toBe(GENERATED_ID);
  });
});

describe('createDealFromIntakePdf', () => {
  it('extracts text from the PDF and feeds it to the intake extractor', async () => {
    const pdf = Buffer.from('%PDF-1.4 binary listing').toString('base64');

    const result = await runCreatePdf(
      { account_id: 'account-1', pdf },
      { id: 'user-1' },
    );

    expect(mocks.extractText).toHaveBeenCalledTimes(1);
    expect(mocks.generateStructured).toHaveBeenCalledTimes(1);

    const [, input] = mocks.generateStructured.mock.calls.at(-1) as unknown as [
      unknown,
      { prompt: string },
    ];
    expect(input.prompt).toContain(mocks.pdfText);

    const [, event] = mocks.appendDealEvent.mock.calls.at(-1) as unknown as [
      unknown,
      { eventType: string; payload: Record<string, unknown> },
    ];
    expect(event.eventType).toBe('deal.created');
    expect(event.payload).toMatchObject({ account_id: 'account-1' });
    expect(result).toBe(GENERATED_ID);
  });
});

describe('rerunDealIntake', () => {
  it('re-extracts and appends a deal.updated event with the mapped fields', async () => {
    await runRerun(
      { deal_id: 'deal-1', text: 'an updated memo' },
      { id: 'user-1' },
    );

    expect(mocks.generateStructured).toHaveBeenCalledTimes(1);

    const [, input] = mocks.appendDealEvent.mock.calls.at(-1) as unknown as [
      unknown,
      {
        dealId: string;
        aggregateType: string;
        eventType: string;
        payload: Record<string, unknown>;
      },
    ];

    expect(input.dealId).toBe('deal-1');
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

describe('rerunDealIntakePdf', () => {
  it('extracts text from the PDF and appends a deal.updated event', async () => {
    const pdf = Buffer.from('%PDF-1.4 binary updated listing').toString(
      'base64',
    );

    await runRerunPdf({ deal_id: 'deal-1', pdf }, { id: 'user-1' });

    expect(mocks.extractText).toHaveBeenCalledTimes(1);
    expect(mocks.generateStructured).toHaveBeenCalledTimes(1);

    const [, prompt] = mocks.generateStructured.mock.calls.at(-1) as unknown as [
      unknown,
      { prompt: string },
    ];
    expect(prompt.prompt).toContain(mocks.pdfText);

    const [, event] = mocks.appendDealEvent.mock.calls.at(-1) as unknown as [
      unknown,
      { dealId: string; eventType: string; payload: Record<string, unknown> },
    ];
    expect(event.dealId).toBe('deal-1');
    expect(event.eventType).toBe('deal.updated');
    expect(event.payload).toMatchObject({
      asking_price: 3500000,
      revenue_ttm: 4200000,
    });
  });
});
