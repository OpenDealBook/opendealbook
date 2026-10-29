import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  embedded: {} as Record<string, unknown>,
  log: [] as string[],
}));

vi.mock('@temporalio/workflow', () => ({
  proxyActivities: () => ({
    createEmbeddingJob: async () => ({ jobId: 'job1', accountId: 'acct1', dealId: 'deal1' }),
    markEmbeddingJobRunning: async () => world.log.push('running'),
    extractDocumentMarkdown: async () => ({ markdown: '# Doc' }),
    embedDocumentChunks: async () => {
      world.log.push('embed');
      return world.embedded;
    },
    completeEmbeddingJob: async () => world.log.push('complete'),
    failEmbeddingJob: async () => world.log.push('fail'),
    runDealVerification: async () => world.log.push('verify'),
  }),
}));

const { documentIngestion } = await import('./documentIngestion');

beforeEach(() => {
  world.log = [];
});

describe('documentIngestion', () => {
  it('completes the job once its chunks are embedded, then verifies the deal', async () => {
    world.embedded = { chunkCount: 3, model: 'text-embedding-3-small' };

    await documentIngestion({ drDocumentId: 'doc1' });

    expect(world.log).toEqual(['running', 'embed', 'complete', 'verify']);
  });

  it('leaves a skipped job skipped, never completing it, and still verifies the deal', async () => {
    world.embedded = { skippedReason: 'The monthly AI limit is reached' };

    await documentIngestion({ drDocumentId: 'doc1' });

    expect(world.log).toEqual(['running', 'embed', 'verify']);
  });
});
