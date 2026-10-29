export interface FakeTeam {
  endpoint: {
    id: string;
    provider: 'openai' | 'anthropic' | 'openai_compatible';
    model: string | null;
    chat_model: string | null;
    base_url: string;
  };
  apiKey: string | null;
  capReached: boolean;
  reserved: Record<string, unknown>[];
  usage: Record<string, unknown>[];
}

export function fakeTeam(): FakeTeam {
  return {
    endpoint: {
      id: 'endpoint-1',
      provider: 'openai_compatible',
      model: 'text-embedding-3-small',
      chat_model: 'gpt-4o-mini',
      base_url: 'https://llm.example.com/v1',
    },
    apiKey: 'sk-vault',
    capReached: false,
    reserved: [],
    usage: [],
  };
}

function settled(data: unknown) {
  return { throwOnError: async () => ({ data, error: null }) };
}

export function fakeAdminClient(team: FakeTeam) {
  return {
    from: (table: string) =>
      table === 'llm_endpoint'
        ? { select: () => ({ eq: () => ({ maybeSingle: () => settled(team.endpoint) }) }) }
        : {
            update: (row: Record<string, unknown>) => ({
              eq: (_column: string, id: string) => {
                team.usage.push({ id, ...row });
                return settled(null);
              },
            }),
          },
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === 'llm_endpoint_api_key') {
        return settled(team.apiKey);
      }
      if (team.capReached) {
        return settled(null);
      }
      team.reserved.push(args);
      return settled(`call-${team.reserved.length}`);
    },
  };
}
