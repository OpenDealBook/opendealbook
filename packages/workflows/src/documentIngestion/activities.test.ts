import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  completeEmbeddingJob,
  createEmbeddingJob,
  embedDocumentChunks,
  extractDocumentMarkdown,
  failEmbeddingJob,
  markEmbeddingJobRunning,
} from '../activities';
import { fakeAiProvider } from '../../test-support/fake-ai-provider';
import { EMBEDDING_DIMENSIONS } from './embeddings';

const state = vi.hoisted(() => ({ client: null as unknown }));

const doclingState = vi.hoisted(() => ({ extractMarkdown: vi.fn() }));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => state.client,
}));

vi.mock('./docling', () => ({
  extractMarkdown: doclingState.extractMarkdown,
}));

interface FakeConfig {
  rows?: Record<string, unknown>;
  insertReturn?: Record<string, unknown>;
}

function makeClient(config: FakeConfig) {
  const capture = {
    inserts: {} as Record<string, unknown>,
    updates: {} as Record<string, unknown>,
  };

  const client = {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        limit: () => builder,
        single: async () => ({ data: config.rows?.[table] ?? null, error: null }),
        insert(rows: unknown) {
          capture.inserts[table] = rows;
          const result = { data: config.insertReturn?.[table] ?? null, error: null };
          return {
            select: () => ({ single: async () => result }),
            then: (resolve: (value: { error: null }) => unknown) =>
              resolve({ error: null }),
          };
        },
        update(payload: unknown) {
          capture.updates[table] = payload;
          return { eq: async () => ({ error: null }) };
        },
      };

      return builder;
    },
  };

  return { client, capture };
}

const chunkScope = {
  jobId: 'job1',
  drDocumentId: 'doc1',
  accountId: 'acct1',
  dealId: 'deal1',
};

let provider: Awaited<ReturnType<typeof fakeAiProvider>> | undefined;

async function serveEmbeddings(team: FakeTeam, dimension: number): Promise<void> {
  provider = await fakeAiProvider({
    status: 200,
    body: { data: [{ index: 0, embedding: Array(dimension).fill(0.1) }] },
  });
  team.endpoint!.base_url = provider.baseUrl;
  process.env.ODB_ALLOW_PRIVATE_AI_URL = '1';
  process.env.ODB_STACK = 'local';
}

afterEach(() => {
  provider?.close();
  provider = undefined;
  delete process.env.ODB_ALLOW_PRIVATE_AI_URL;
  delete process.env.ODB_STACK;
});

describe('embedding job status transitions', () => {
  it('creates a job for the document account and deal, defaulting to queued', async () => {
    const { client, capture } = makeClient({
      rows: { dr_document: { account_id: 'acct1', deal_id: 'deal1' } },
      insertReturn: { embedding_job: { id: 'job1' } },
    });
    state.client = client;

    const result = await createEmbeddingJob({ drDocumentId: 'doc1' });

    expect(result).toEqual({
      jobId: 'job1',
      accountId: 'acct1',
      dealId: 'deal1',
    });
    expect(capture.inserts.embedding_job).toEqual({
      account_id: 'acct1',
      deal_id: 'deal1',
      dr_document_id: 'doc1',
    });
  });

  it('advances a job to running', async () => {
    const { client, capture } = makeClient({});
    state.client = client;

    await markEmbeddingJobRunning({ jobId: 'job1' });

    expect(capture.updates.embedding_job).toEqual({ status: 'running' });
  });

  it('completes a job with its chunk count and model', async () => {
    const { client, capture } = makeClient({});
    state.client = client;

    await completeEmbeddingJob({
      jobId: 'job1',
      chunkCount: 7,
      model: 'text-embedding-3-small',
    });

    expect(capture.updates.embedding_job).toEqual({
      status: 'done',
      chunk_count: 7,
      model: 'text-embedding-3-small',
    });
  });

  it('fails a job with the error text', async () => {
    const { client, capture } = makeClient({});
    state.client = client;

    await failEmbeddingJob({ jobId: 'job1', error: 'boom' });

    expect(capture.updates.embedding_job).toEqual({
      status: 'failed',
      error: 'boom',
    });
  });
});

interface FakeTeam {
  endpoint: {
    id: string;
    provider: 'openai' | 'anthropic' | 'openai_compatible';
    model: string | null;
    chat_model: string;
    base_url: string;
  } | null;
  apiKey: string | null;
  capReached: boolean;
  reserved: Record<string, unknown>[];
  usage: Record<string, unknown>[];
  chunks: Array<Record<string, unknown>> | undefined;
}

function settled(data: unknown) {
  return { throwOnError: async () => ({ data, error: null }) };
}

function makeTeamClient(team: FakeTeam) {
  return {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: () => settled(team.endpoint) }) }),
      insert: async (rows: Array<Record<string, unknown>>) => {
        team.chunks = rows;
        return { error: null };
      },
      update: (row: Record<string, unknown>) => ({
        eq: (_column: string, id: string) => {
          team.usage.push({ table, id, ...row });
          return settled(null);
        },
      }),
    }),
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === 'llm_endpoint_api_key') {
        return settled(team.apiKey);
      }
      if (team.capReached) {
        return settled(null);
      }
      team.reserved.push(args);
      return settled('call-1');
    },
  };
}

function connectedTeam(): FakeTeam {
  const team: FakeTeam = {
    endpoint: {
      id: 'endpoint-1',
      provider: 'openai_compatible',
      model: 'text-embedding-3-small',
      chat_model: 'gpt-4o-mini',
      base_url: 'http://llm.test',
    },
    apiKey: 'sk-vault',
    capReached: false,
    reserved: [],
    usage: [],
    chunks: undefined,
  };
  state.client = makeTeamClient(team);
  return team;
}

describe('embedDocumentChunks', () => {
  const markdown = '# Only\n\nOne short chunk from Priya Okafor.';

  it("embeds the chunks unchanged, team people included, on the team's vault key and writes them scoped to the document account and deal", async () => {
    const team = connectedTeam();
    await serveEmbeddings(team, EMBEDDING_DIMENSIONS);

    const result = await embedDocumentChunks({ ...chunkScope, markdown });

    expect(result).toEqual({ chunkCount: 1, model: 'text-embedding-3-small' });
    expect(provider!.received).toMatchObject([
      {
        path: '/v1/embeddings',
        headers: { authorization: 'Bearer sk-vault' },
        body: { model: 'text-embedding-3-small', input: ['# Only\n\nOne short chunk from Priya Okafor.'] },
      },
    ]);
    expect(team.chunks).toHaveLength(1);
    expect(team.chunks![0]).toMatchObject({
      account_id: 'acct1',
      deal_id: 'deal1',
      document_id: 'doc1',
      chunk_index: 0,
      content: markdown,
    });
    expect(JSON.parse(team.chunks![0]!.embedding as string)).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it('counts one AI call per document against the cap, logged to the deal without token counts', async () => {
    const team = connectedTeam();
    await serveEmbeddings(team, EMBEDDING_DIMENSIONS);

    await embedDocumentChunks({ ...chunkScope, markdown });

    expect(team.reserved).toEqual([
      expect.objectContaining({
        p_account_id: 'acct1',
        p_model: 'text-embedding-3-small',
        p_endpoint_id: 'endpoint-1',
        p_deal_id: 'deal1',
      }),
    ]);
    expect(team.usage).toEqual([
      { table: 'ai_call_log', id: 'call-1', prompt_tokens: null, completion_tokens: null },
    ]);
  });

  it('fails with a dimension error and writes no chunks when the model returns the wrong size', async () => {
    const team = connectedTeam();
    await serveEmbeddings(team, 1024);

    await expect(
      embedDocumentChunks({ ...chunkScope, markdown: 'short' }),
    ).rejects.toThrow(/1024/);
    expect(team.chunks).toBeUndefined();
  });

  it.each([
    ['no key', (team: FakeTeam) => (team.apiKey = null), 'Connect an AI provider first'],
    [
      'no embedding model',
      (team: FakeTeam) => (team.endpoint!.model = null),
      'Add an embedding model to your AI provider',
    ],
  ])('skips with no provider call or chunks when the team has %s, recording why on the job', async (_case, unset, reason) => {
    const team = connectedTeam();
    unset(team);
    await serveEmbeddings(team, EMBEDDING_DIMENSIONS);

    const result = await embedDocumentChunks({ ...chunkScope, markdown });

    expect(result).toEqual({ skippedReason: reason });
    expect(provider!.received).toEqual([]);
    expect(team.chunks).toBeUndefined();
    expect(team.usage).toEqual([{ table: 'embedding_job', id: 'job1', status: 'skipped', skipped_reason: reason }]);
  });

  it.each([
    [
      'once the AI cap is reached',
      (team: FakeTeam) => (team.capReached = true),
      'The monthly AI limit is reached',
    ],
    [
      'for an Anthropic team',
      (team: FakeTeam) => (team.endpoint!.provider = 'anthropic'),
      'Anthropic has no embeddings API; leave Embedding model empty',
    ],
  ])('skips %s, writing nothing and recording why on the job', async (_case, arrange, reason) => {
    const team = connectedTeam();
    arrange(team);
    await serveEmbeddings(team, EMBEDDING_DIMENSIONS);

    expect(await embedDocumentChunks({ ...chunkScope, markdown })).toEqual({ skippedReason: reason });
    expect(provider!.received).toEqual([]);
    expect(team.chunks).toBeUndefined();
    expect(team.usage).toEqual([{ table: 'embedding_job', id: 'job1', status: 'skipped', skipped_reason: reason }]);
  });
});

function makeExtractClient() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { storage_path: 'deals/doc1.pdf' },
            error: null,
          }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: async () => ({
          data: { signedUrl: 'https://signed.example/doc1' },
          error: null,
        }),
      }),
    },
  };
}

describe('extractDocumentMarkdown', () => {
  beforeEach(() => {
    doclingState.extractMarkdown.mockReset();
  });

  afterEach(() => {
    delete process.env.DOCLING_URL;
    delete process.env.DOCLING_API_KEY;
  });

  it('returns an empty markdown result and does not call docling when the endpoint is not configured', async () => {
    delete process.env.DOCLING_URL;
    delete process.env.DOCLING_API_KEY;
    state.client = makeExtractClient();

    const result = await extractDocumentMarkdown({ drDocumentId: 'doc1' });

    expect(result).toEqual({ markdown: '' });
    expect(doclingState.extractMarkdown).not.toHaveBeenCalled();
  });

  it('extracts markdown through docling when the endpoint is configured', async () => {
    process.env.DOCLING_URL = 'http://docling.test';
    process.env.DOCLING_API_KEY = 'dk';
    doclingState.extractMarkdown.mockResolvedValue('# Extracted');
    state.client = makeExtractClient();

    const result = await extractDocumentMarkdown({ drDocumentId: 'doc1' });

    expect(result).toEqual({ markdown: '# Extracted' });
    expect(doclingState.extractMarkdown).toHaveBeenCalledWith(
      { baseUrl: 'http://docling.test', apiKey: 'dk' },
      'https://signed.example/doc1',
    );
  });
});
