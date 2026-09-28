import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  completeEmbeddingJob,
  createEmbeddingJob,
  embedDocumentChunks,
  failEmbeddingJob,
  markEmbeddingJobRunning,
} from '../activities';
import { EMBEDDING_DIMENSIONS } from './embeddings';

const state = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => state.client,
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

function stubEmbeddingDimension(dimension: number): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      json: async () => ({
        data: [{ index: 0, embedding: Array(dimension).fill(0.1) }],
      }),
    })),
  );
}

beforeEach(() => {
  process.env.TENANT_LLM_KEY = 'sk-tenant';
});

afterEach(() => {
  vi.unstubAllGlobals();
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

describe('embedDocumentChunks', () => {
  it('writes chunks scoped to the document account and deal', async () => {
    const { client, capture } = makeClient({
      rows: {
        llm_endpoint: {
          model: 'text-embedding-3-small',
          base_url: 'http://llm.test',
          api_key_secret_ref: 'TENANT_LLM_KEY',
        },
      },
    });
    state.client = client;
    stubEmbeddingDimension(EMBEDDING_DIMENSIONS);

    const result = await embedDocumentChunks({
      ...chunkScope,
      markdown: '# Only\n\nOne short chunk.',
    });

    expect(result).toEqual({ chunkCount: 1, model: 'text-embedding-3-small' });

    const rows = capture.inserts.document_chunk as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      account_id: 'acct1',
      deal_id: 'deal1',
      document_id: 'doc1',
      chunk_index: 0,
      content: '# Only\n\nOne short chunk.',
    });
    expect(JSON.parse(rows[0]!.embedding as string)).toHaveLength(
      EMBEDDING_DIMENSIONS,
    );
  });

  it('fails with a dimension error and writes no chunks when the model returns the wrong size', async () => {
    const { client, capture } = makeClient({
      rows: {
        llm_endpoint: {
          model: 'text-embedding-3-small',
          base_url: 'http://llm.test',
          api_key_secret_ref: 'TENANT_LLM_KEY',
        },
      },
    });
    state.client = client;
    stubEmbeddingDimension(1024);

    await expect(
      embedDocumentChunks({ ...chunkScope, markdown: 'short' }),
    ).rejects.toThrow(/1024/);
    expect(capture.inserts.document_chunk).toBeUndefined();
  });
});
