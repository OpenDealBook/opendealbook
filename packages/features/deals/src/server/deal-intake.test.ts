import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateStructured: vi.fn(),
}));

vi.mock('@odb/ai/server', () => ({
  generateStructured: mocks.generateStructured,
}));

import { dealIntakeDraftSchema } from '../schema/deal-intake.schema';
import {
  dealFromIntakeDraft,
  dealUpdateFromIntakeDraft,
  extractDealIntake,
} from './deal-intake';

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
});

describe('extractDealIntake', () => {
  it('asks @odb/ai for the intake schema from the source text and returns the parsed draft', async () => {
    mocks.generateStructured.mockImplementation(
      async (_client: unknown, input: { parse: (raw: unknown) => unknown }) =>
        input.parse(FIXTURE),
    );

    const draft = await extractDealIntake(
      {} as never,
      'acct-1',
      'Revenue was $4.2M with SDE of $900k. Asking $3.5M.',
    );

    expect(mocks.generateStructured).toHaveBeenCalledTimes(1);
    const [client, input] = mocks.generateStructured.mock.calls[0] as [
      unknown,
      { accountId: string; system: string; prompt: string; parse: unknown },
    ];

    expect(input.accountId).toBe('acct-1');
    expect(input.prompt).toContain(
      'Revenue was $4.2M with SDE of $900k. Asking $3.5M.',
    );
    for (const field of [
      'revenue',
      'sde',
      'ebitda',
      'asking_price',
      'industry',
      'location',
      'description',
      'employees',
      'business_model',
      'reason_for_sale',
    ]) {
      expect(input.prompt).toContain(field);
    }

    expect(draft).toEqual(dealIntakeDraftSchema.parse(FIXTURE));
    expect(client).toBeDefined();
  });

  it('rejects a draft whose shape does not match the intake schema', async () => {
    mocks.generateStructured.mockImplementation(
      async (_client: unknown, input: { parse: (raw: unknown) => unknown }) =>
        input.parse({ revenue: 'not a number' }),
    );

    await expect(
      extractDealIntake({} as never, 'acct-1', 'garbage'),
    ).rejects.toThrow();
  });
});

describe('dealFromIntakeDraft', () => {
  it('maps screening numbers and profile text to a create payload, dropping null fields', () => {
    const draft = dealIntakeDraftSchema.parse({
      ...FIXTURE,
      ebitda: null,
      location: null,
    });

    const payload = dealFromIntakeDraft('acct-1', draft);

    expect(payload).toMatchObject({
      account_id: 'acct-1',
      description: 'Established HVAC contractor',
      asking_price: 3500000,
      revenue_ttm: 4200000,
      sde_ttm: 900000,
      employee_band: '25-50',
      reason_for_sale: 'retirement',
    });
    expect(payload).not.toHaveProperty('ebitda_ttm');
    expect(payload).not.toHaveProperty('location_raw');
  });
});

describe('dealUpdateFromIntakeDraft', () => {
  it('maps the draft to a deal.updated payload with only the fields present', () => {
    const draft = dealIntakeDraftSchema.parse({
      ...FIXTURE,
      sde: null,
      reason_for_sale: null,
    });

    const payload = dealUpdateFromIntakeDraft(draft);

    expect(payload).toMatchObject({
      description: 'Established HVAC contractor',
      asking_price: 3500000,
      revenue_ttm: 4200000,
      ebitda_ttm: 750000,
      location_raw: 'Austin, TX',
      employee_band: '25-50',
    });
    expect(payload).not.toHaveProperty('sde_ttm');
    expect(payload).not.toHaveProperty('reason_for_sale');
  });
});
