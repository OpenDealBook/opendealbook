import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../activities';
import type { WriteCloseCompInput, WriteCloseCompResult } from '../comps/writeCloseComp';

const { writeCloseComp } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
});

export async function writeCloseCompWorkflow(
  input: WriteCloseCompInput,
): Promise<WriteCloseCompResult> {
  return writeCloseComp(input);
}
