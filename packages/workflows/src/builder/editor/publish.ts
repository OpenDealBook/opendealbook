import type { WorkflowGraph } from '../graph';
import { validateWorkflowGraph } from '../validate';
import { stepLabel } from './nodeTypes';

export interface PublishProblems {
  byNode: Record<string, string[]>;
  general: string[];
}

export function validateForPublish(graph: WorkflowGraph): PublishProblems {
  const result = validateWorkflowGraph(graph);
  const problems: PublishProblems = { byNode: {}, general: [] };
  for (const { nodeId, message } of result.ok ? [] : result.errors) {
    if (nodeId === undefined) {
      problems.general.push(message);
    } else {
      (problems.byNode[nodeId] ??= []).push(message);
    }
  }
  return problems;
}

export function labeledPublishProblems(
  graph: WorkflowGraph,
): { nodeId: string | null; label: string | null; message: string }[] {
  const { byNode, general } = validateForPublish(graph);
  return [
    ...general.map((message) => ({ nodeId: null, label: null, message })),
    ...Object.entries(byNode).flatMap(([nodeId, messages]) => {
      const label = stepLabel(graph.nodes.find((node) => node.id === nodeId)!);
      return messages.map((message) => ({ nodeId, label, message }));
    }),
  ];
}
