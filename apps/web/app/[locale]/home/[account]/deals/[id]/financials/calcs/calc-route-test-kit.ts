const versions = {
  'deal-1': [
    { id: 'wc-1', name: 'Q3 working capital', type: 'working_capital' },
    { id: 'wc-2', name: 'Q4 working capital', type: 'working_capital' },
    { id: 'deal-a', name: 'Base case', type: 'deal' },
  ],
  'deal-2': [{ id: 'wc-other', name: 'Other deal', type: 'working_capital' }],
  'deal-x': [
    { id: 'wc-x1', name: 'Other team Q3', type: 'working_capital' },
    { id: 'wc-x2', name: 'Other team Q4', type: 'working_capital' },
  ],
} as Record<string, { id: string; name: string; type: string }[]>;

const dealTeams: Record<string, string> = {
  'deal-1': 'team-1',
  'deal-2': 'team-1',
  'deal-x': 'team-2',
};

function fakeClient() {
  const filters: Record<string, string> = {};
  const query = {
    select: () => query,
    eq: (column: string, value: string) => {
      filters[column] = value;
      return query;
    },
    maybeSingle: () => query,
    throwOnError: async () => ({
      data:
        dealTeams[filters.id!] === filters.account_id
          ? { id: filters.id }
          : null,
    }),
  };

  return { from: () => query };
}

export const routeMocks = {
  navigation: {
    notFound: () => {
      throw new Error('NEXT_NOT_FOUND');
    },
    useRouter: () => ({ refresh() {}, push() {} }),
    useParams: () => ({ account: 'acme', id: 'deal-1' }),
  },
  deals: {
    fetchDealCalcVersions: async (_client: unknown, p: { deal_id: string }) =>
      versions[p.deal_id] ?? [],
  },
  dealsShared: {
    fetchDealBox: async () => null,
    fetchCalcVersion: async (
      _client: unknown,
      p: { calc_version_id: string },
    ) => {
      const version = Object.values(versions)
        .flat()
        .find((each) => each.id === p.calc_version_id);
      if (!version) {
        throw new Error(
          'JSON object requested, multiple (or no) rows returned',
        );
      }
      return {
        version: { ...version, is_primary: false, outputs_snapshot: {} },
        periods: [],
        input: null,
        funding_sources: [],
        sources: {
          calcVersionId: version.id,
          dealId: 'deal-1',
          canEdit: true,
          citations: [],
          documents: [],
        },
      };
    },
  },
  supabase: { getSupabaseServerClient: fakeClient },
  layout: { loadTeamWorkspace: async () => ({ team: { id: 'team-1' } }) },
};
