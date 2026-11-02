import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  embedded: {} as Record<string, unknown>,
  documentGone: { atJob: false, atExtraction: false },
  extractionError: null as Error | null,
  log: [] as string[],
}));

const UNLIMITED_STAND_IN = 10;

vi.mock('@temporalio/workflow', () => ({
  proxyActivities: (options: { retry?: { maximumAttempts?: number } }) =>
    retrying(options.retry?.maximumAttempts ?? UNLIMITED_STAND_IN, {
      createEmbeddingJob: async () =>
        world.documentGone.atJob
          ? null
          : { jobId: 'job1', accountId: 'acct1', dealId: 'deal1' },
      markEmbeddingJobRunning: async () => world.log.push('running'),
      extractDocumentSegments: async (input: {
        drDocumentId: string;
        forceOcr: boolean;
      }) => {
        world.log.push(
          `extract ${input.drDocumentId}${input.forceOcr ? ' with OCR' : ''}`,
        );
        if (world.extractionError) {
          throw world.extractionError;
        }
        return world.documentGone.atExtraction ? null : { segmentCount: 2 };
      },
      embedDocumentChunks: async (input: Record<string, unknown>) => {
        world.log.push(`embed ${JSON.stringify(input)}`);
        return world.embedded;
      },
      completeEmbeddingJob: async () => world.log.push('complete'),
      failEmbeddingJob: async (input: { error: string }) =>
        world.log.push(`fail ${input.error}`),
      requestDealVerification: async ({ dealId }: { dealId: string }) =>
        world.log.push(`request verification ${dealId}`),
    }),
}));

function retrying<T extends Record<string, (input: never) => unknown>>(
  maximumAttempts: number,
  activities: T,
): T {
  return Object.fromEntries(
    Object.entries(activities).map(([name, activity]) => [
      name,
      async (input: never) => {
        for (let attempt = 1; ; attempt++) {
          try {
            return await activity(input);
          } catch (error) {
            if (attempt >= maximumAttempts) {
              throw error;
            }
          }
        }
      },
    ]),
  ) as T;
}

const { documentIngestion } = await import('./documentIngestion');

const embedScope = JSON.stringify({
  jobId: 'job1',
  drDocumentId: 'doc1',
  accountId: 'acct1',
  dealId: 'deal1',
});

beforeEach(() => {
  world.log = [];
  world.extractionError = null;
  world.documentGone = { atJob: false, atExtraction: false };
});

describe('documentIngestion', () => {
  it('extracts the segments, embeds them, completes the job, then asks for deal verification', async () => {
    world.embedded = { chunkCount: 3, model: 'text-embedding-3-small' };

    await documentIngestion({ drDocumentId: 'doc1' });

    expect(world.log).toEqual([
      'running',
      'extract doc1',
      `embed ${embedScope}`,
      'complete',
      'request verification deal1',
    ]);
  });

  it('forces full-page OCR when the run asks for it', async () => {
    world.embedded = { chunkCount: 3, model: 'text-embedding-3-small' };

    await documentIngestion({ drDocumentId: 'doc1', forceOcr: true });

    expect(world.log).toContain('extract doc1 with OCR');
  });

  it('leaves a skipped job skipped, never completing it, and still asks for deal verification', async () => {
    world.embedded = { skippedReason: 'The monthly AI limit is reached' };

    await documentIngestion({ drDocumentId: 'doc1' });

    expect(world.log).toEqual([
      'running',
      'extract doc1',
      `embed ${embedScope}`,
      'request verification deal1',
    ]);
  });

  it('gives up on a file that fails extraction three times, failing the job with the error and not asking for verification', async () => {
    world.extractionError = new Error('docling conversion t1 failed');

    await expect(documentIngestion({ drDocumentId: 'doc1' })).rejects.toThrow(
      'docling conversion t1 failed',
    );

    expect(world.log).toEqual([
      'running',
      'extract doc1',
      'extract doc1',
      'extract doc1',
      'fail docling conversion t1 failed',
    ]);
  });

  it('ends quietly without a job when the document is gone before the job is created', async () => {
    world.documentGone.atJob = true;

    await documentIngestion({ drDocumentId: 'doc1' });

    expect(world.log).toEqual([]);
  });

  it('ends quietly after extraction finds the document gone, neither embedding, failing the job, nor asking for verification', async () => {
    world.documentGone.atExtraction = true;

    await documentIngestion({ drDocumentId: 'doc1' });

    expect(world.log).toEqual(['running', 'extract doc1']);
  });
});
