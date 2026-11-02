import { historyFromJSON } from '@temporalio/common/lib/proto-utils';
import { Worker } from '@temporalio/worker';
import { expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

it('replays a run that debounced three uploads into one verification without a determinism error', async () => {
  const history = historyFromJSON(
    JSON.parse(
      readFileSync(
        new URL(
          './fixtures/deal-verification-debounce.history.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );

  await expect(
    Worker.runReplayHistory(
      {
        workflowsPath: fileURLToPath(new URL('./index.ts', import.meta.url)),
      },
      history,
    ),
  ).resolves.toBeUndefined();
}, 120_000);
