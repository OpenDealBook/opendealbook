export const TEAM_UNLOCKED_SIGNAL = 'teamUnlocked';
export const APPROVAL_DECIDED_SIGNAL = 'approvalDecided';
export const CAP_RAISED_SIGNAL = 'capRaised';

export function workflowRunWorkflowId(runId: string): string {
  return `workflow-run-${runId}`;
}
