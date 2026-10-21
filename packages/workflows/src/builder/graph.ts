import { z } from 'zod';

import type { Json } from '@odb/supabase';

export const WORKFLOW_GRAPH_SCHEMA_VERSION = 1;

export const TRIGGER_TYPES = ['manual_trigger'] as const;
export const STEP_TYPES = ['notify_team'] as const;

export type StepTypeName = (typeof STEP_TYPES)[number];

const nodeFields = {
  id: z.string().min(1),
  config: z.record(z.string(), z.json()),
  label: z.string().optional(),
};

const triggerNodeSchema = z.object({
  ...nodeFields,
  type: z.enum(TRIGGER_TYPES),
});

const stepNodeSchema = z.object({ ...nodeFields, type: z.enum(STEP_TYPES) });

const workflowEdgeSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  sourceHandle: z.string().optional(),
});

export const workflowGraphSchema = z.object({
  nodes: z.array(z.union([triggerNodeSchema, stepNodeSchema])),
  edges: z.array(workflowEdgeSchema),
});

export type TriggerNode = z.infer<typeof triggerNodeSchema>;
export type StepNode = z.infer<typeof stepNodeSchema>;
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;
export type WorkflowGraph = z.input<typeof workflowGraphSchema>;

export interface RunnableGraph {
  triggers: TriggerNode[];
  steps: StepNode[];
  edges: WorkflowEdge[];
}

export type StepIo = { [key: string]: Json | undefined };

export function parseWorkflowGraph(input: {
  schemaVersion: number;
  graph: unknown;
}): RunnableGraph {
  z.literal(WORKFLOW_GRAPH_SCHEMA_VERSION).parse(input.schemaVersion);
  const { nodes, edges } = workflowGraphSchema.parse(input.graph);
  return {
    triggers: nodes.flatMap((node) => triggerNodeSchema.safeParse(node).data ?? []),
    steps: nodes.flatMap((node) => stepNodeSchema.safeParse(node).data ?? []),
    edges,
  };
}

export function stepIdempotencyKey(input: {
  runId: string;
  nodeId: string;
  iteration: number;
}): string {
  return `${input.runId}:${input.nodeId}:${input.iteration}`;
}
