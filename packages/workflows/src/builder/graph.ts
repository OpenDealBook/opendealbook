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
  'pull_leads',
  'registry_lookup',
  'email_lookup',
  'prepare_firm',
  'enroll_sequence',
  'send_letter',
  'diligence_search',
  'diligence_report',
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
  pull_leads: [],
  registry_lookup: [],
  email_lookup: [],
  prepare_firm: [],
  enroll_sequence: [],
  send_letter: [],
  diligence_search: [],
  diligence_report: [],
};

const LEAD_SOURCES = [
  'ppp',
  'sba_7a',
  'sba_504',
  'form_5500',
  'state_registry',
] as const;

const US_STATE_CODES = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
  'DC',
  'PR',
  'GU',
  'VI',
  'AS',
  'MP',
] as const;

const WIDEN_RANGES = [
  ['minJobs', 'maxJobs'],
  ['minPppLoan', 'maxPppLoan'],
  ['minHeadcount', 'maxHeadcount'],
] as const;

const firmId = z.string().min(1);
const count = z.int().nonnegative();
const dollars = z.number().nonnegative();

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
  pull_leads: z.object({
    sources: z.array(z.enum(LEAD_SOURCES)).min(1),
    widen: z
      .object({
        states: z.array(z.enum(US_STATE_CODES)).optional(),
        minJobs: count.optional(),
        maxJobs: count.optional(),
        minPppLoan: dollars.optional(),
        maxPppLoan: dollars.optional(),
        minAgeYears: count.optional(),
        minHeadcount: count.optional(),
        maxHeadcount: count.optional(),
      })
      .refine(
        (widen) =>
          WIDEN_RANGES.every(
            ([min, max]) => (widen[min] ?? 0) <= (widen[max] ?? Infinity),
          ),
        'Each minimum must be at most its maximum',
      )
      .optional(),
    limit: z.int().min(1).max(500).default(500),
  }),
  registry_lookup: z.object({ firmId }),
  email_lookup: z.object({ firmId }),
  prepare_firm: z.object({ firmId }),
  enroll_sequence: z.object({ firmId, sequenceId: z.string().min(1) }),
  send_letter: z.object({ firmId, templateId: z.string().min(1) }),
  diligence_search: z.object({
    dealId: z.string().min(1),
    searchAllNames: z
      .boolean()
      .default(false)
      .meta({ title: 'Search news and reviews for every business name' }),
  }),
  diligence_report: z.object({ runId: z.string().min(1) }),
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
  nodes: z
    .array(workflowNodeSchema)
    .max(200, 'A workflow can have at most 200 steps'),
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
