import { expect, it, vi } from 'vitest';

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: (data: unknown) => unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'single', 'maybeSingle', 'upsert']) {
        builder[method] = () => builder;
      }
      builder.throwOnError = () =>
        table === 'deal'
          ? Promise.resolve({ data: { account_id: 'a', owner_user_id: 'o' } })
          : Promise.reject({
              code: '42501',
              message: `new row violates row-level security policy for table "${table}"`,
            });
      return builder;
    },
    rpc: () => ({
      throwOnError: async () => ({ data: [{ user_id: 'o', name: 'Dana Owner' }] }),
    }),
  }),
}));

import { saveDealDiscovery } from './discovery-actions';

it('names the deal manager to ask when the caller cannot save discovery', async () => {
  expect(
    await saveDealDiscovery({
      deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
      discovery_notes: 'Warm first call.',
    }),
  ).toEqual({
    ok: false,
    refusal: 'Only deal managers can edit discovery notes. Ask Dana Owner.',
  });
});
