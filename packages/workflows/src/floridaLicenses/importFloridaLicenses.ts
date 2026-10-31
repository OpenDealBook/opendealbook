import { isCancellation } from '@temporalio/workflow';

interface ImportRef {
  importId: string;
}

interface ImportSteps {
  newId: () => string;
  startFloridaLicenseImport: (start: ImportRef) => Promise<void>;
  loadFloridaLicenses: (load: ImportRef) => Promise<void>;
  failFloridaLicenseImport: (failure: ImportRef & { reason: string }) => Promise<void>;
}

export async function runFloridaLicenseImport(steps: ImportSteps): Promise<void> {
  const importId = steps.newId();
  await steps.startFloridaLicenseImport({ importId });
  try {
    await steps.loadFloridaLicenses({ importId });
  } catch (error) {
    if (isCancellation(error)) {
      throw error;
    }
    const failure = error as Error;
    await steps.failFloridaLicenseImport({
      importId,
      reason: (failure.cause as Error | undefined)?.message ?? failure.message,
    });
  }
}
