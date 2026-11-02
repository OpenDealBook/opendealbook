import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../activities';

const {
  createEmbeddingJob,
  markEmbeddingJobRunning,
  embedDocumentChunks,
  completeEmbeddingJob,
  failEmbeddingJob,
  requestDealVerification,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
});

const { extractDocumentSegments } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
  heartbeatTimeout: '2 minutes',
  retry: { maximumAttempts: 3 },
});

export interface DocumentIngestionInput {
  drDocumentId: string;
  forceOcr?: boolean;
}

export async function documentIngestion(
  input: DocumentIngestionInput,
): Promise<void> {
  const job = await createEmbeddingJob({ drDocumentId: input.drDocumentId });
  if (!job) {
    return;
  }
  const { jobId, accountId, dealId } = job;

  try {
    await markEmbeddingJobRunning({ jobId });

    const extracted = await extractDocumentSegments({
      drDocumentId: input.drDocumentId,
      forceOcr: input.forceOcr ?? false,
    });
    if (!extracted) {
      return;
    }

    const embedded = await embedDocumentChunks({
      jobId,
      drDocumentId: input.drDocumentId,
      accountId,
      dealId,
    });

    if ('chunkCount' in embedded) {
      await completeEmbeddingJob({ jobId, ...embedded });
    }
  } catch (error) {
    await failEmbeddingJob({
      jobId,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }

  await requestDealVerification({ dealId });
}
