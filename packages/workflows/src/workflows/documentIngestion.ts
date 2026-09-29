import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../activities';

const {
  createEmbeddingJob,
  markEmbeddingJobRunning,
  extractDocumentMarkdown,
  embedDocumentChunks,
  completeEmbeddingJob,
  failEmbeddingJob,
  runDealVerification,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
});

export interface DocumentIngestionInput {
  drDocumentId: string;
}

export async function documentIngestion(
  input: DocumentIngestionInput,
): Promise<void> {
  const { jobId, accountId, dealId } = await createEmbeddingJob({
    drDocumentId: input.drDocumentId,
  });

  try {
    await markEmbeddingJobRunning({ jobId });

    const { markdown } = await extractDocumentMarkdown({
      drDocumentId: input.drDocumentId,
    });

    const { chunkCount, model } = await embedDocumentChunks({
      jobId,
      drDocumentId: input.drDocumentId,
      accountId,
      dealId,
      markdown,
    });

    await completeEmbeddingJob({ jobId, chunkCount, model });
  } catch (error) {
    await failEmbeddingJob({
      jobId,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }

  await runDealVerification({ dealId });
}
