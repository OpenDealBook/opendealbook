import { z } from 'zod';

import type { Json } from '@odb/supabase';

import { ruleSchema } from './rules';

export const WORKFLOW_GRAPH_SCHEMA_VERSIONS = [1, 2] as const;

export const TRIGGER_TYPES = [
  'manual_trigger',
  'schedule_trigger',
  'event_trigger',
] as const;
export const STEP_TYPES = [
  'notify_team',
  'create_todo',
  'ask_ai',
  'decision_model',
  'approval',
] as const;
export const NODE_TYPES = [
  ...TRIGGER_TYPES,
  ...STEP_TYPES,
  'wait',
  'branch',
  'merge',
  'loop',
] as const;

export type StepTypeName = (typeof STEP_TYPES)[number];
export type NodeTypeName = (typeof NODE_TYPES)[number];

export const BRANCH_HANDLES = ['true', 'false'] as const;
export const LOOP_HANDLES = ['each', 'done'] as const;
export const DECISION_HANDLES = ['approved', 'rejected'] as const;

export const TRIGGER_EVENT_TYPES = [
  'deal.created',
  'deal.stage_changed',
  'deal.loi_signed',
  'offer.submitted',
  'offer.accepted',
  'checklist_item.status_changed',
  'dr_document.added',
  'lender_room.went_quiet',
  'firm.approved',
] as const;

export const NODE_HANDLES: Record<NodeTypeName, readonly string[]> = {
  manual_trigger: [],
  schedule_trigger: [],
  notify_team: [],
  wait: [],
  branch: BRANCH_HANDLES,
  merge: [],
  loop: LOOP_HANDLES,
  create_todo: [],
  event_trigger: [],
  approval: DECISION_HANDLES,
  ask_ai: [],
  decision_model: DECISION_HANDLES,
};

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const NODE_CONFIG_SCHEMAS = {
  manual_trigger: z.object({}),
  schedule_trigger: z.discriminatedUnion('every', [
    z.object({ every: z.literal('hours'), hours: z.int().min(1).max(24) }),
    z.object({ every: z.literal('day'), at: timeOfDay }),
    z.object({
      every: z.literal('week'),
      weekday: z.enum([
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
      ]),
      at: timeOfDay,
    }),
    z.object({
      every: z.literal('month'),
      day: z.int().min(1).max(31),
      at: timeOfDay,
    }),
  ]),
  notify_team: z.object({ message: z.string().min(1) }),
  wait: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('duration'),
      amount: z.int().positive(),
      unit: z.enum(['minutes', 'hours', 'days']),
    }),
    z.object({
      kind: z.literal('until'),
      until: z.union([z.iso.date(), z.iso.datetime({ offset: true })]),
    }),
  ]),
  branch: z.object({ rule: ruleSchema }),
  merge: z.object({}),
  loop: z.object({
    items: z.array(z.json()),
    parallel: z.boolean().default(false),
  }),
  create_todo: z.object({
    title: z.string().min(1),
    assignees: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('members'),
        userIds: z.array(z.string().min(1)).min(1),
      }),
      z.object({ kind: z.literal('deal_managers') }),
    ]),
    dueInDays: z.int().positive().optional(),
    dealId: z.string().min(1).optional(),
  }),
  event_trigger: z.object({
    eventType: z.enum(TRIGGER_EVENT_TYPES),
    filter: ruleSchema.optional(),
  }),
  approval: z.object({ prompt: z.string().min(1) }),
  ask_ai: z.object({
    prompt: z.string().min(1),
    output: z.enum(['text', 'json']).default('text'),
  }),
  decision_model: z.object({
    firmId: z.string().min(1),
    instructions: z.string().optional(),
  }),
} satisfies Record<NodeTypeName, z.ZodType>;

export type NodeConfig<Type extends NodeTypeName> = z.output<
  (typeof NODE_CONFIG_SCHEMAS)[Type]
>;

const nodeFields = {
  id: z.string().min(1),
  config: z.record(z.string(), z.json()),
  label: z.string().optional(),
};

const workflowNodeSchema = z.object({
  ...nodeFields,
  type: z.enum(NODE_TYPES),
});

const triggerNodeSchema = z.object({
  ...nodeFields,
  type: z.enum(TRIGGER_TYPES),
});

const workflowEdgeSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  sourceHandle: z.string().optional(),
});

export const workflowGraphSchema = z.object({
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),
});

export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type TriggerNode = z.infer<typeof triggerNodeSchema>;
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;
export type WorkflowGraph = z.input<typeof workflowGraphSchema>;

export interface RunnableGraph {
  nodes: WorkflowNode[];
  triggers: TriggerNode[];
  edges: WorkflowEdge[];
}

export type StepIo = { [key: string]: Json | undefined };

export function parseWorkflowGraph(input: {
  schemaVersion: number;
  graph: unknown;
}): RunnableGraph {
  z.literal(WORKFLOW_GRAPH_SCHEMA_VERSIONS).parse(input.schemaVersion);
  const { nodes, edges } = workflowGraphSchema.parse(input.graph);
  return {
    nodes,
    triggers: nodes.flatMap(
      (node) => triggerNodeSchema.safeParse(node).data ?? [],
    ),
    edges,
  };
}
