import { isCancellation } from '@temporalio/workflow';

interface ImportRef {
  importId: string;
}

interface ImportSteps {
  newId: () => string;
  startScreeningImport: (start: ImportRef) => Promise<void>;
  loadLatestScreeningList: (load: ImportRef) => Promise<void>;
  failScreeningImport: (failure: ImportRef & { reason: string }) => Promise<void>;
}

export async function runScreeningImport(steps: ImportSteps): Promise<void> {
  const importId = steps.newId();
  await steps.startScreeningImport({ importId });
  try {
    await steps.loadLatestScreeningList({ importId });
  } catch (error) {
    if (isCancellation(error)) {
      throw error;
    }
    const failure = error as Error;
    await steps.failScreeningImport({
      importId,
      reason: (failure.cause as Error | undefined)?.message ?? failure.message,
    });
  }
}
