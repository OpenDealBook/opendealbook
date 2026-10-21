import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const order: string[] = [];
  const rows: Record<string, unknown> = {};

  return {
    order,
    rows,
    counselReady: true,
    recordError: null as unknown,
    checkTemplateFields: vi.fn(async (_input: unknown) => {
      order.push('check');
    }),
    generateFromTemplate: vi.fn(async (_input: unknown) => ({
      id: 'gen-1',
      docx_path: 'gen/a.docx',
      pdf_path: 'gen/a.pdf',
    })),
  };
});

function builder(table: string) {
  const chain: Record<string, unknown> = {};

  for (const method of [
    'select',
    'eq',
    'in',
    'order',
    'limit',
    'throwOnError',
  ]) {
    chain[method] = () => chain;
  }
  chain.single = () => chain;
  chain.maybeSingle = () => chain;
  chain.then = (resolve: (value: unknown) => void) =>
    resolve({ data: mocks.rows[table] ?? null, error: null });

  return chain;
}

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: { id: string }) => unknown) =>
    (input: unknown) =>
      fn(input, { id: 'user-1' }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: builder,
    rpc: () => ({
      throwOnError: async () => ({ data: mocks.counselReady }),
    }),
  }),
}));

vi.mock('@odb/templates/server', () => ({
  checkTemplateFields: mocks.checkTemplateFields,
  generateFromTemplate: mocks.generateFromTemplate,
}));

vi.mock('@odb/contracts', async () => ({
  APA_NEEDS_COUNSEL: 'counsel',
  contractTypeSchema: (await import('zod')).z.enum(['loi', 'apa', 'nda']),
  createContractRecord: async (
    _input: unknown,
    deps: {
      generateVersionOne: (ids: Record<string, string>) => Promise<unknown>;
    },
  ) => {
    if (mocks.recordError) {
      throw mocks.recordError;
    }
    mocks.order.push('record');
    await deps.generateVersionOne({
      accountId: 'acc-1',
      dealId: 'deal-1',
      templateId: 'tmpl-1',
    });

    return 'contract-1';
  },
}));

import { createContract } from './create-contract-action';

const run = createContract as unknown as (
  input: Record<string, unknown>,
) => Promise<unknown>;
const REQUEST = { dealId: 'deal-1', type: 'loi', fromTemplateId: 'tmpl-1' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.order.length = 0;
  mocks.counselReady = true;
  mocks.recordError = null;
  for (const key of Object.keys(mocks.rows)) {
    delete mocks.rows[key];
  }
  mocks.rows.deal = { account_id: 'acc-1', firm_id: 'firm-1' };
  mocks.rows.firm = { owner_names: ['Sol Seller', 'Ray Seller'] };
  mocks.rows.accounts = { legal_entity_name: 'Buyer Holdings LLC' };
});

describe('createContract', () => {
  it('fills the template from the live offer version and the defaults', async () => {
    mocks.rows.offer = { current_version_id: 'ver-1' };
    mocks.rows.offer_version = {
      terms: { purchase_price: 900_000, seller_name: 'Pat Seller' },
      purchase_price: 900_000,
      target_close_date: '2026-12-01',
      exclusivity_days: 30,
      diligence_days: 45,
      real_estate_portion: null,
    };

    await run(REQUEST);

    expect(mocks.generateFromTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldValues: expect.objectContaining({
          buyer_name: 'Buyer Holdings LLC',
          seller_name: 'Pat Seller',
          purchase_price: 900_000,
          cash_at_close: 900_000,
          target_close_date: '2026-12-01',
          diligence_days: 45,
        }),
      }),
    );
  });

  it('still offers the defaults when the deal has no offer', async () => {
    await run(REQUEST);

    expect(mocks.generateFromTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldValues: expect.objectContaining({
          buyer_name: 'Buyer Holdings LLC',
          seller_name: 'Sol Seller and Ray Seller',
        }),
      }),
    );
  });

  it('lists what is missing before it creates the contract record', async () => {
    mocks.checkTemplateFields.mockRejectedValueOnce(
      new Error('Fill in: Purchase price'),
    );

    await expect(run(REQUEST)).rejects.toThrow('Fill in: Purchase price');
    expect(mocks.order).not.toContain('record');
  });

  it('refuses an APA until counsel are on the deal and records nothing', async () => {
    mocks.counselReady = false;

    expect(await run({ dealId: 'deal-1', type: 'apa' })).toEqual({
      ok: false,
      refusal: 'counsel',
    });
    expect(mocks.order).not.toContain('record');
  });

  it('tells a read-only member they cannot draft contracts', async () => {
    mocks.recordError = {
      code: '42501',
      message: 'not authorized to append contract.created on deal: needs deals.work',
    };

    expect(await run({ dealId: 'deal-1', type: 'loi' })).toEqual({
      ok: false,
      refusal: "Read-only members can't draft contracts. Ask a deal manager.",
    });
  });
});
