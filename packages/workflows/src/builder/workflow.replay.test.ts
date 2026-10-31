import { historyFromJSON } from '@temporalio/common/lib/proto-utils';
import { Worker } from '@temporalio/worker';
import { expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

it('replays a run recorded with the hourly recheck, waiting on the team lock, without a determinism error', async () => {
  const history = historyFromJSON(
    JSON.parse(
      readFileSync(
        new URL('./fixtures/recheck-hourly.history.json', import.meta.url),
        'utf8',
      ),
    ),
  );

  await expect(
    Worker.runReplayHistory(
      {
        workflowsPath: fileURLToPath(
          new URL('../workflows/index.ts', import.meta.url),
        ),
      },
      history,
    ),
  ).resolves.toBeUndefined();
}, 120_000);
