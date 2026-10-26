import type { Json } from '@odb/supabase';

import { alwaysEarlierSteps, referenceAllowed } from './editor/upstream';
import { REFERENCE, WHOLE_REFERENCE } from './expressions';
import {
  NODE_CONFIG_SCHEMAS,
  NODE_HANDLES,
  TRIGGER_TYPES,
  type NodeTypeName,
  type WorkflowEdge,
  type WorkflowNode,
} from './graph';

interface GraphError {
  nodeId?: string;
  message: string;
}

type GraphValidation = { ok: true } | { ok: false; errors: GraphError[] };

const STEP_PATH = /^steps\.[^.]+/;

const triggerTypes = new Set<NodeTypeName>(TRIGGER_TYPES);

function repeated(ids: string[]): string[] {
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}

function referencedPaths(value: Json | undefined): string[] {
  if (typeof value === 'string') {
    return [...value.matchAll(REFERENCE)].map((match) => match[1]!);
  }
  if (Array.isArray(value)) {
    return value.flatMap(referencedPaths);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) =>
      key === 'var' && typeof item === 'string'
        ? STEP_PATH.test(item)
          ? [item]
          : []
        : referencedPaths(item),
    );
  }
  return [];
}

function valueAt(value: unknown, path: PropertyKey[]): unknown {
  let current = value;
  for (const key of path) {
    current =
      typeof current === 'object' && current !== null
        ? Reflect.get(current, key)
        : undefined;
  }
  return current;
}

function configError(node: WorkflowNode): GraphError[] {
  const parsed = NODE_CONFIG_SCHEMAS[node.type].safeParse(node.config);
  const issue = parsed.error?.issues.find((candidate) => {
    const value = valueAt(node.config, candidate.path);
    return !(typeof value === 'string' && WHOLE_REFERENCE.test(value));
  });
  return issue
    ? [
        {
          nodeId: node.id,
          message: `The ${issue.path.join('.')} setting is not valid`,
        },
      ]
    : [];
}

function handleError(source: WorkflowNode, edge: WorkflowEdge): GraphError[] {
  const handles = NODE_HANDLES[source.type];
  if (handles.length === 0) {
    return edge.sourceHandle === undefined
      ? []
      : [
          {
            nodeId: source.id,
            message: `This step has one exit; remove "${edge.sourceHandle}" from its arrow`,
          },
        ];
  }
  if (edge.sourceHandle === undefined) {
    return [
      {
        nodeId: source.id,
        message: 'Choose which exit this arrow leaves from',
      },
    ];
  }
  return handles.includes(edge.sourceHandle)
    ? []
    : [
        {
          nodeId: source.id,
          message: `This step has no "${edge.sourceHandle}" exit`,
        },
      ];
}

function walk(starts: string[], next: (id: string) => string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...starts];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const neighbour of next(id)) {
      if (!seen.has(neighbour)) {
        seen.add(neighbour);
        queue.push(neighbour);
      }
    }
  }
  return seen;
}

function hasCycle(nodeIds: string[], edges: WorkflowEdge[]): boolean {
  const incoming = new Map(nodeIds.map((id) => [id, 0]));
  for (const edge of edges) {
    incoming.set(edge.targetNodeId, incoming.get(edge.targetNodeId)! + 1);
  }
  const ready = nodeIds.filter((id) => incoming.get(id) === 0);
  let settled = 0;
  for (let id = ready.pop(); id !== undefined; id = ready.pop()) {
    settled += 1;
    for (const edge of edges.filter(
      (candidate) => candidate.sourceNodeId === id,
    )) {
      const remaining = incoming.get(edge.targetNodeId)! - 1;
      incoming.set(edge.targetNodeId, remaining);
      if (remaining === 0) {
        ready.push(edge.targetNodeId);
      }
    }
  }
  return settled < nodeIds.length;
}

export function validateWorkflowGraph(graph: {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}): GraphValidation {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = graph.edges.filter(
    (edge) => nodes.has(edge.sourceNodeId) && nodes.has(edge.targetNodeId),
  );
  const triggers = graph.nodes.filter((node) => triggerTypes.has(node.type));
  const children = (id: string) =>
    edges
      .filter((edge) => edge.sourceNodeId === id)
      .map((edge) => edge.targetNodeId);
  const parents = (id: string) =>
    edges
      .filter((edge) => edge.targetNodeId === id)
      .map((edge) => edge.sourceNodeId);
  const reachable = walk(
    triggers.map((node) => node.id),
    children,
  );

  const loopBodies = graph.nodes
    .filter((node) => node.type === 'loop')
    .map((loop) => {
      const starts = edges
        .filter(
          (edge) =>
            edge.sourceNodeId === loop.id && edge.sourceHandle === 'each',
        )
        .map((edge) => edge.targetNodeId);
      return {
        loopId: loop.id,
        body: new Set([...starts, ...walk(starts, children)]),
      };
    });
  const enclosingLoops = (edge: WorkflowEdge) =>
    loopBodies
      .filter(
        ({ loopId, body }) =>
          body.has(edge.sourceNodeId) ||
          (edge.sourceNodeId === loopId && edge.sourceHandle === 'each'),
      )
      .map(({ loopId }) => loopId);
  const mergeError = (node: WorkflowNode): GraphError[] => {
    const scopes = edges
      .filter((edge) => edge.targetNodeId === node.id)
      .map(enclosingLoops);
    const within = (inner: string[], outer: string[]) =>
      inner.every((loopId) => outer.includes(loopId));
    if (
      scopes.every(
        (scope) => within(scope, scopes[0]!) && within(scopes[0]!, scope),
      )
    ) {
      return [];
    }
    const nested = scopes.every((a) =>
      scopes.every((b) => within(a, b) || within(b, a)),
    );
    return [
      {
        nodeId: node.id,
        message: nested
          ? "A Merge can't join paths inside and outside a Loop"
          : "A Merge can't join different Loop bodies",
      },
    ];
  };

  const earlier = alwaysEarlierSteps(graph);

  const errors: GraphError[] = [
    ...(triggers.length === 0
      ? [{ message: 'Add a trigger to start this workflow' }]
      : []),
    ...triggers
      .filter((node) => node.type === 'manual_trigger')
      .slice(1)
      .map((node) => ({
        nodeId: node.id,
        message: 'Add a manual trigger only once',
      })),
    ...repeated(graph.nodes.map((node) => node.id)).map((id) => ({
      nodeId: id,
      message: `Two steps share the id ${id}`,
    })),
    ...repeated(graph.edges.map((edge) => edge.id)).map((id) => ({
      message: `Two arrows share the id ${id}`,
    })),
    ...graph.edges
      .filter((edge) => !edges.includes(edge))
      .map((edge) => ({
        message: `Arrow ${edge.id} points at a step that does not exist`,
      })),
    ...(hasCycle([...nodes.keys()], edges)
      ? [{ message: 'This graph has a loop back; use a Loop step' }]
      : []),
    ...edges.flatMap((edge) =>
      handleError(nodes.get(edge.sourceNodeId)!, edge),
    ),
    ...[...nodes.values()].flatMap((node): GraphError[] => {
      const incoming = parents(node.id).length;
      if (triggerTypes.has(node.type)) {
        return incoming > 0
          ? [
              {
                nodeId: node.id,
                message: 'A trigger cannot have an arrow into it',
              },
            ]
          : [];
      }
      if (!reachable.has(node.id)) {
        return [
          {
            nodeId: node.id,
            message: 'This step is not connected to a trigger',
          },
        ];
      }
      return incoming > 1 && node.type !== 'merge'
        ? [
            {
              nodeId: node.id,
              message: 'Only a Merge step can take two arrows',
            },
          ]
        : [];
    }),
    ...graph.nodes.filter((node) => node.type === 'merge').flatMap(mergeError),
    ...graph.nodes.flatMap(configError),
    ...graph.nodes.flatMap((node) => {
      const messages = referencedPaths(node.config)
        .filter((path) => !referenceAllowed(graph, node.id, path))
        .map((path) => {
          const [, id, field] = path.split('.');
          return earlier.get(node.id)!.has(id!)
            ? `steps.${id}.${field} is only available inside its Loop`
            : `steps.${id} does not come before this step`;
        });
      return [...new Set(messages)].map((message) => ({
        nodeId: node.id,
        message,
      }));
    }),
  ];

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
