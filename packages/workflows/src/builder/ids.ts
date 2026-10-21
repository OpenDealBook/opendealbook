export const TEAM_UNLOCKED_SIGNAL = 'teamUnlocked';

export function workflowRunWorkflowId(runId: string): string {
  return `workflow-run-${runId}`;
}
