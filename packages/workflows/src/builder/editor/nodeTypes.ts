import type { NodeTypeName, WorkflowGraph } from '../graph';

export const NODE_TYPE_DISPLAY = {
  manual_trigger: { label: 'Run now', icon: 'Play', description: 'Start when someone presses Run now' },
  schedule_trigger: { label: 'Schedule', icon: 'CalendarBlank', description: 'Start on a repeating schedule' },
  event_trigger: { label: 'App event', icon: 'Lightning', description: 'Start when something happens in the app' },
  notify_team: { label: 'Notify team', icon: 'Bell', description: 'Send the deal managers a notice' },
  create_todo: { label: 'Create to-do', icon: 'ListChecks', description: 'Add a to-do for the team' },
  ask_ai: { label: "Ask the team's AI", icon: 'Sparkle', description: "Send a prompt to the team's AI" },
  decision_model: { label: 'Decision model', icon: 'Scales', description: 'Check a firm against the decision model' },
  approval: { label: 'Approval', icon: 'SealCheck', description: 'Wait for a person to approve or reject' },
  wait: { label: 'Wait', icon: 'Hourglass', description: 'Pause for a while or until a date' },
  branch: { label: 'Branch', icon: 'ArrowsSplit', description: 'Go one way or the other on a rule' },
  merge: { label: 'Merge', icon: 'ArrowsMerge', description: 'Wait for both paths and combine them' },
  loop: { label: 'Loop', icon: 'Repeat', description: 'Run the steps after it once per item' },
} as const satisfies Record<NodeTypeName, { label: string; icon: string; description: string }>;

export type NodeIcon = (typeof NODE_TYPE_DISPLAY)[NodeTypeName]['icon'];

export function stepLabel(node: WorkflowGraph['nodes'][number]): string {
  return node.label ?? NODE_TYPE_DISPLAY[node.type].label;
}
