import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEAM_ID = '00000000-0000-4000-8000-000000000001';

const world = vi.hoisted(() => ({
  saved: [] as Record<string, unknown>[],
  error: null as { code: string; message: string } | null,
  publicUrls: ['https://llm.example.test/v1'],
  backfills: [] as string[],
  temporalDown: false,
  logged: [] as string[],
}));

vi.mock('@odb/workflows/client', () => ({
  getTemporalClient: async () => {
    if (world.temporalDown) {
      throw new Error('Temporal is unreachable');
    }
    return 'temporal';
  },
  triggerDocumentIngestionBackfill: async (
    client: string,
    accountId: string,
  ) => {
    world.backfills.push(`${client} ${accountId}`);
  },
}));

vi.mock('@odb/shared/logger', () => ({
  getLogger: () => ({
    error: (context: { err: Error }, message: string) => {
      world.logged.push(`${message}: ${context.err.message}`);
    },
  }),
}));

vi.mock('@odb/workflows/builder/publicUrl', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@odb/workflows/builder/publicUrl')>();
  const { AddressNotFound } = original;
  return {
    ...original,
    isPublicHttpsUrl: async (url: string) => {
      if (url === 'https://models.example.com/v1') {
        throw new AddressNotFound(false);
      }
      return world.publicUrls.includes(url);
    },
  };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: { id: string }) => Promise<unknown>) =>
    (input: unknown) =>
      fn(input, { id: 'user-1' }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (world.error) {
        return { data: null, error: world.error };
      }
      world.saved.push({ name, ...args });
      return { data: null, error: null };
    },
  }),
}));

const { saveAiProviderAction, disconnectAiProviderAction } =
  await import('./ai-provider-actions');

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  world.saved = [];
  world.error = null;
  world.backfills = [];
  world.temporalDown = false;
  world.logged = [];
});

describe('saving the team AI provider', () => {
  it("reads the team's existing data room documents once the provider is saved", async () => {
    await saveAiProviderAction({
      accountId: TEAM_ID,
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      embeddingModel: '',
      baseUrl: '',
      apiKey: 'sk-ant-new',
    });

    expect(world.backfills).toEqual([`temporal ${TEAM_ID}`]);
  });

  it('saves the provider and logs the failure when the document backfill cannot start', async () => {
    world.temporalDown = true;

    const result = await saveAiProviderAction({
      accountId: TEAM_ID,
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      embeddingModel: '',
      baseUrl: '',
      apiKey: 'sk-ant-new',
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(world.saved).toMatchObject([{ name: 'save_llm_endpoint' }]);
    expect(world.logged).toEqual([
      'Document backfill did not start after saving the AI provider: Temporal is unreachable',
    ]);
  });

  it('starts no document backfill when the save is refused', async () => {
    world.error = { code: '23514', message: 'paste an API key' };

    await saveAiProviderAction({
      accountId: TEAM_ID,
      provider: 'openai',
      model: 'gpt-4.1',
      embeddingModel: '',
      baseUrl: '',
      apiKey: '',
    });

    expect(world.backfills).toEqual([]);
  });

  it('saves the provider, model and pasted key', async () => {
    const result = await saveAiProviderAction({
      accountId: TEAM_ID,
      provider: 'openai',
      model: 'gpt-4.1',
      embeddingModel: 'text-embedding-3-small',
      baseUrl: '',
      apiKey: 'sk-new',
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(world.saved).toEqual([
      {
        name: 'save_llm_endpoint',
        p_account_id: TEAM_ID,
        p_provider: 'openai',
        p_model: 'gpt-4.1',
        p_embedding_model: 'text-embedding-3-small',
        p_base_url: '',
        p_api_key: 'sk-new',
      },
    ]);
  });

  it("saves an OpenAI-compatible endpoint's prices per million tokens", async () => {
    await saveAiProviderAction({
      accountId: TEAM_ID,
      provider: 'openai_compatible',
      model: 'llama-3',
      embeddingModel: '',
      baseUrl: 'https://llm.example.test/v1',
      apiKey: 'sk-x',
      prices: { input: '0.5', cachedInput: '0', output: ' 1.25 ' },
    });

    expect(world.saved[0]).toMatchObject({
      p_input_price_per_mtok: 0.5,
      p_cached_input_price_per_mtok: 0,
      p_output_price_per_mtok: 1.25,
    });
  });

  it('saves no prices when all three are left empty', async () => {
    await saveAiProviderAction({
      accountId: TEAM_ID,
      provider: 'openai_compatible',
      model: 'llama-3',
      embeddingModel: '',
      baseUrl: 'https://llm.example.test/v1',
      apiKey: 'sk-x',
      prices: { input: '', cachedInput: '', output: '' },
    });

    expect(world.saved[0]).toMatchObject({
      p_input_price_per_mtok: undefined,
      p_cached_input_price_per_mtok: undefined,
      p_output_price_per_mtok: undefined,
    });
  });

  it.each([
    [
      { input: '1', cachedInput: '', output: '1' },
      'Enter all three prices, or leave them all empty',
    ],
    [
      { input: '-1', cachedInput: '0', output: '1' },
      'Prices must be numbers of 0 or more',
    ],
    [
      { input: 'cheap', cachedInput: '0', output: '1' },
      'Prices must be numbers of 0 or more',
    ],
  ])('refuses, saving nothing, prices %o', async (prices, refusal) => {
    const result = await saveAiProviderAction({
      accountId: TEAM_ID,
      provider: 'openai_compatible',
      model: 'llama-3',
      embeddingModel: '',
      baseUrl: 'https://llm.example.test/v1',
      apiKey: 'sk-x',
      prices,
    });

    expect(result).toEqual({ ok: false, refusal });
    expect(world.saved).toEqual([]);
  });

  it('refuses, saving nothing, an embedding model for Anthropic', async () => {
    const result = await saveAiProviderAction({
      accountId: TEAM_ID,
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      embeddingModel: 'voyage-3',
      baseUrl: '',
      apiKey: 'sk-new',
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'Anthropic has no embeddings API; leave Embedding model empty',
    });
    expect(world.saved).toEqual([]);
  });

  it('saves no embedding model when the field is left empty', async () => {
    await saveAiProviderAction({
      accountId: TEAM_ID,
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      embeddingModel: '',
      baseUrl: '',
      apiKey: 'sk-new',
    });

    expect(world.saved[0]).toMatchObject({ p_embedding_model: undefined });
  });

  it('refuses, saving nothing, a compatible endpoint whose address is not public', async () => {
    const result = await saveAiProviderAction({
      accountId: TEAM_ID,
      provider: 'openai_compatible',
      model: 'llama-3',
      embeddingModel: '',
      baseUrl: 'https://resolves-to-private.example.test/v1',
      apiKey: 'sk-x',
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'Use a public HTTPS base URL',
    });
    expect(world.saved).toEqual([]);
  });

  it.each([
    ['local', 'http://127.0.0.1:4510/v1'],
    ['e2e', 'http://localhost:4510/v1'],
  ])(
    'saves a private or http base URL when private AI URLs are allowed on a %s stack',
    async (stack, baseUrl) => {
      vi.stubEnv('ODB_ALLOW_PRIVATE_AI_URL', '1');
      vi.stubEnv('ODB_STACK', stack);

      const result = await saveAiProviderAction({
        accountId: TEAM_ID,
        provider: 'openai_compatible',
        model: 'llama-3',
        embeddingModel: '',
        baseUrl,
        apiKey: 'sk-x',
      });

      expect(result).toEqual({ ok: true, value: undefined });
      expect(world.saved[0]).toMatchObject({ p_base_url: baseUrl });
    },
  );

  it.each([
    ['llm.corp.example:8443', 'https://llm.corp.example:8443/v1'],
    ['LLM.Corp.Example:80', 'http://llm.corp.example/v1'],
  ])(
    'saves a private base URL whose host the operator lists as %s',
    async (listed, baseUrl) => {
      vi.stubEnv('ODB_PRIVATE_AI_HOSTS', listed);

      const result = await saveAiProviderAction({
        accountId: TEAM_ID,
        provider: 'openai_compatible',
        model: 'llama-3',
        embeddingModel: '',
        baseUrl,
        apiKey: 'sk-x',
      });

      expect(result).toEqual({ ok: true, value: undefined });
      expect(world.saved[0]).toMatchObject({ p_base_url: baseUrl });
    },
  );

  it('keeps refusing a private base URL on a production stack even with the flag set', async () => {
    vi.stubEnv('ODB_ALLOW_PRIVATE_AI_URL', '1');
    vi.stubEnv('ODB_STACK', 'production');

    const result = await saveAiProviderAction({
      accountId: TEAM_ID,
      provider: 'openai_compatible',
      model: 'llama-3',
      embeddingModel: '',
      baseUrl: 'https://resolves-to-private.example.test/v1',
      apiKey: 'sk-x',
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'Use a public HTTPS base URL',
    });
    expect(world.saved).toEqual([]);
  });

  it("refuses, saving nothing, a base URL whose host can't be found", async () => {
    const result = await saveAiProviderAction({
      accountId: TEAM_ID,
      provider: 'openai_compatible',
      model: 'llama-3',
      embeddingModel: '',
      baseUrl: 'https://models.example.com/v1',
      apiKey: 'sk-x',
    });

    expect(result).toEqual({
      ok: false,
      refusal: "We couldn't find that address. Check the base URL.",
    });
    expect(world.saved).toEqual([]);
  });

  it('shows the database refusal of a base URL', async () => {
    world.error = { code: '22023', message: 'use a public https base URL' };

    const result = await saveAiProviderAction({
      accountId: TEAM_ID,
      provider: 'openai_compatible',
      model: 'llama-3',
      embeddingModel: '',
      baseUrl: 'https://llm.example.test/v1',
      apiKey: 'sk-x',
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'Use a public HTTPS base URL',
    });
  });

  it('keeps the stored key when no new key is pasted', async () => {
    await saveAiProviderAction({
      accountId: TEAM_ID,
      provider: 'openai_compatible',
      model: 'llama-3',
      embeddingModel: '',
      baseUrl: 'https://llm.example.test/v1',
      apiKey: '',
    });

    expect(world.saved[0]).toMatchObject({
      p_base_url: 'https://llm.example.test/v1',
      p_api_key: undefined,
    });
  });

  it('refuses an OpenAI-compatible endpoint without a base URL', async () => {
    const result = await saveAiProviderAction({
      accountId: TEAM_ID,
      provider: 'openai_compatible',
      model: 'llama-3',
      embeddingModel: '',
      baseUrl: '',
      apiKey: 'sk-x',
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'Enter the base URL of your endpoint',
    });
    expect(world.saved).toEqual([]);
  });

  it('refuses with the price rule when the database rejects the prices', async () => {
    world.error = {
      code: '23514',
      message:
        'new row for relation "llm_endpoint" violates check constraint "llm_endpoint_prices"',
    };

    const result = await saveAiProviderAction({
      accountId: TEAM_ID,
      provider: 'openai_compatible',
      model: 'llama-3',
      embeddingModel: '',
      baseUrl: 'https://llm.example.test/v1',
      apiKey: 'sk-x',
      prices: { input: '1', cachedInput: '1', output: '1' },
    });

    expect(result).toEqual({
      ok: false,
      refusal:
        'Enter all three prices as numbers of 0 or more, or leave them all empty',
    });
  });

  it('asks for a key when the team has none stored', async () => {
    world.error = { code: '23514', message: 'paste an API key' };

    const result = await saveAiProviderAction({
      accountId: TEAM_ID,
      provider: 'openai',
      model: 'gpt-4.1',
      embeddingModel: '',
      baseUrl: '',
      apiKey: '',
    });

    expect(result).toEqual({ ok: false, refusal: 'Paste an API key' });
  });

  it('refuses members who cannot manage settings', async () => {
    world.error = {
      code: '42501',
      message: 'changing the AI provider needs settings.manage',
    };

    const result = await saveAiProviderAction({
      accountId: TEAM_ID,
      provider: 'openai',
      model: 'gpt-4.1',
      embeddingModel: '',
      baseUrl: '',
      apiKey: 'sk-x',
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'Changing the AI provider needs settings.manage',
    });
  });

  it("disconnects the team's provider", async () => {
    const result = await disconnectAiProviderAction({ accountId: TEAM_ID });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(world.saved).toEqual([
      { name: 'disconnect_llm_endpoint', p_account_id: TEAM_ID },
    ]);
  });

  it('refuses a disconnect from members who cannot manage settings', async () => {
    world.error = {
      code: '42501',
      message: 'changing the AI provider needs settings.manage',
    };

    expect(await disconnectAiProviderAction({ accountId: TEAM_ID })).toEqual({
      ok: false,
      refusal: 'Changing the AI provider needs settings.manage',
    });
  });
});
