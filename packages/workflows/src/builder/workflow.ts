import {
  condition,
  defineSignal,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';

import type * as activities from '../activities';
import type { StepOutputs } from './expressions';
import type { StepIo } from './graph';
import { TEAM_UNLOCKED_SIGNAL } from './ids';

const {
  loadWorkflowRun,
  transitionWorkflowRun,
  executeWorkflowStep,
  failWorkflowStep,
  isTeamLocked,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    maximumAttempts: 5,
    initialInterval: '10 seconds',
    backoffCoefficient: 2,
  },
});

const LOCKED_RECHECK_INTERVAL = '1 hour';

function failureMessage(error: Error): string {
  return error.cause instanceof Error ? failureMessage(error.cause) : error.message;
}

const teamUnlockedSignal = defineSignal(TEAM_UNLOCKED_SIGNAL);

export interface RunPublishedWorkflowInput {
  runId: string;
}

export async function runPublishedWorkflow({
  runId,
}: RunPublishedWorkflowInput): Promise<void> {
  const { accountId, triggerNodeId, graph } = await loadWorkflowRun({
    runId,
  });
  let unlockSignalled = false;
  let lockCheck: Promise<void> | undefined;
  let failed = false;

  setHandler(teamUnlockedSignal, () => {
    unlockSignalled = true;
  });

  async function waitUntilUnlocked(): Promise<void> {
    if (!(await isTeamLocked({ accountId }))) {
      return;
    }
    await transitionWorkflowRun({ runId, from: 'running', to: 'paused_locked' });
    do {
      unlockSignalled = false;
      await condition(() => unlockSignalled, LOCKED_RECHECK_INTERVAL);
    } while (await isTeamLocked({ accountId }));
    await transitionWorkflowRun({ runId, from: 'paused_locked', to: 'running' });
  }

  function sharedLockCheck(): Promise<void> {
    lockCheck ??= waitUntilUnlocked().finally(() => {
      lockCheck = undefined;
    });
    return lockCheck;
  }

  async function runAfter(
    nodeId: string,
    previous: StepIo,
    steps: StepOutputs,
  ): Promise<void> {
    const nextIds = graph.edges
      .filter((edge) => edge.sourceNodeId === nodeId)
      .map((edge) => edge.targetNodeId);

    await Promise.all(
      graph.steps
        .filter((node) => nextIds.includes(node.id))
        .map(async (node) => {
          const execution = { runId, accountId, node, iteration: 0 };
          await sharedLockCheck();
          const result = await executeWorkflowStep({
            ...execution,
            input: previous,
            steps,
          }).catch(async (error: Error) => {
            failed = true;
            await failWorkflowStep({ ...execution, error: failureMessage(error) });
          });
          if (result?.kind === 'succeeded') {
            await runAfter(node.id, result.output, {
              ...steps,
              [node.id]: result.output,
            });
          }
        }),
    );
  }

  await runAfter(triggerNodeId, {}, { [triggerNodeId]: {} });
  await transitionWorkflowRun({
    runId,
    from: 'running',
    to: failed ? 'failed' : 'succeeded',
  });
}
