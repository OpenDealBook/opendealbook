import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEAM_ID = '00000000-0000-4000-8000-000000000001';

const world = vi.hoisted(() => ({
  saved: [] as Record<string, unknown>[],
  error: null as { code: string; message: string } | null,
  publicUrls: ['https://llm.example.test/v1'],
}));

vi.mock('@odb/workflows/builder/publicUrl', async (importOriginal) => {
  const original = await importOriginal<typeof import('@odb/workflows/builder/publicUrl')>();
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

const { saveAiProviderAction, disconnectAiProviderAction } = await import('./ai-provider-actions');

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  world.saved = [];
  world.error = null;
});

describe('saving the team AI provider', () => {
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

    expect(result).toEqual({ ok: false, refusal: 'Use a public HTTPS base URL' });
    expect(world.saved).toEqual([]);
  });

  it.each([
    ['local', 'http://127.0.0.1:4510/v1'],
    ['e2e', 'http://localhost:4510/v1'],
  ])('saves a private or http base URL when private AI URLs are allowed on a %s stack', async (stack, baseUrl) => {
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
  });

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

    expect(result).toEqual({ ok: false, refusal: 'Use a public HTTPS base URL' });
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

    expect(result).toEqual({ ok: false, refusal: 'Use a public HTTPS base URL' });
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

    expect(result).toEqual({ ok: false, refusal: 'Enter the base URL of your endpoint' });
    expect(world.saved).toEqual([]);
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
    world.error = { code: '42501', message: 'changing the AI provider needs settings.manage' };

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
    expect(world.saved).toEqual([{ name: 'disconnect_llm_endpoint', p_account_id: TEAM_ID }]);
  });

  it('refuses a disconnect from members who cannot manage settings', async () => {
    world.error = { code: '42501', message: 'changing the AI provider needs settings.manage' };

    expect(await disconnectAiProviderAction({ accountId: TEAM_ID })).toEqual({
      ok: false,
      refusal: 'Changing the AI provider needs settings.manage',
    });
  });
});
