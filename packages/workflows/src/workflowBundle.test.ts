import { bundleWorkflowCode } from '@temporalio/worker';

import { describe, expect, it } from 'vitest';

import { fileURLToPath } from 'node:url';

describe('workflows entry', () => {
  it('bundles under the Temporal workflow sandbox rules', async () => {
    const bundle = await bundleWorkflowCode({
      workflowsPath: fileURLToPath(
        new URL('./workflows/index.ts', import.meta.url),
      ),
      logger: { trace() {}, debug() {}, info() {}, warn() {}, error() {}, log() {} },
    });

    expect(bundle.code).toContain('notifyOverdueMilestonesDaily');
  }, 120_000);
});
