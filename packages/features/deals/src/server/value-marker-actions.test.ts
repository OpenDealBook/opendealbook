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

import { saveDealValueMarkers } from './value-marker-actions';

it('names the deal manager to ask when the caller cannot rate value markers', async () => {
  expect(
    await saveDealValueMarkers({
      deal_id: '6221ddef-b8e9-484f-8bb8-0967d8e16a30',
      markers: [
        {
          category: 'process_maturity',
          question_key: 'process_maturity.bookkeeping',
          rating: 'looks_good',
        },
      ],
    }),
  ).toEqual({
    ok: false,
    refusal: 'Only deal managers can rate value markers. Ask Dana Owner.',
  });
});
