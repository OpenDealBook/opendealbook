import { z } from 'zod';

process.env.TZ = 'UTC';

export const tables: Record<string, unknown> = {};

export const workspace = { permissions: [] as string[] };

function fakeClient() {
  const query = {
    table: '',
    ids: [] as string[],
    select: () => query,
    order: () => query,
    in: () => query,
    maybeSingle: () => query,
    eq: (column: string, value: unknown) => {
      if (column === 'id' || column.endsWith('_id')) {
        query.ids.push(value as string);
      }
      return query;
    },
    throwOnError: async () => {
      const malformed = query.ids.find((id) => !z.uuid().safeParse(id).success);

      if (malformed) {
        throw new Error(`invalid input syntax for type uuid: "${malformed}"`);
      }

      return { data: tables[query.table] ?? null };
    },
  };

  return {
    from: (table: string) => {
      query.table = table;
      query.ids = [];
      return query;
    },
  };
}

export const routeMocks = {
  navigation: {
    notFound: () => {
      throw new Error('NEXT_NOT_FOUND');
    },
    useRouter: () => ({ refresh() {} }),
  },
  supabase: { getSupabaseServerClient: fakeClient },
  admin: { getSupabaseServerAdminClient: fakeClient },
  layout: {
    loadTeamWorkspace: async () => ({
      team: { id: '00000000-0000-4000-8000-0000000000a1' },
      permissions: workspace.permissions,
    }),
  },
};
