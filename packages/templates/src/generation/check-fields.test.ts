import { describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => ({
  document_template: { id: 't', account_id: 'a', version: 1 },
  deal: { id: 'd', account_id: 'a', firm_id: null, description: 'Acme' },
  template_field: [
    field('deal.description', 'Description', 'deal', 'description'),
    field('seller_name', 'Seller name', 'manual', null),
    field('effective_date', 'Effective date', 'manual', null),
  ],
}));

function field(
  key: string,
  label: string,
  source: string,
  source_path: string | null,
) {
  return {
    id: key,
    template_id: 't',
    key,
    label,
    type: 'text',
    source,
    source_path,
    format: null,
    required: false,
    sort_order: 0,
  };
}

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: unknown) => unknown) => (input: unknown) =>
      fn(input, { id: 'user-1' }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: (table: keyof typeof rows) => {
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.order = () => builder;
      builder.single = () => builder;
      builder.then = (resolve: (value: unknown) => void) =>
        resolve({ data: rows[table], error: null });

      return builder;
    },
  }),
}));

vi.mock('../permissions', () => ({
  assertDealsManager: async () => undefined,
}));

import { checkTemplateFields } from './actions';

const check = checkTemplateFields as unknown as (
  input: Record<string, unknown>,
) => Promise<void>;
const input = { accountId: 'a', templateId: 't', dealId: 'd' };

describe('checkTemplateFields', () => {
  it('names every template field that resolves blank', async () => {
    await expect(check({ ...input, fieldValues: {} })).rejects.toThrow(
      'Fill in: Seller name, Effective date',
    );
  });

  it('passes when every field has a value', async () => {
    await expect(
      check({
        ...input,
        fieldValues: { seller_name: 'Sol', effective_date: '2026-10-30' },
      }),
    ).resolves.toBeUndefined();
  });
});
