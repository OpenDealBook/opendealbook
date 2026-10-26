import { TRIGGER_TYPES, type NodeTypeName, type WorkflowGraph } from '../graph';
import { stepLabel } from './nodeTypes';
import type { PaletteItem } from './palette';

export interface UpstreamNode {
  nodeId: string;
  label: string;
  fields: { name: string; expression: string }[];
}

const triggerTypes = new Set<NodeTypeName>(TRIGGER_TYPES);

function reachableFrom(graph: WorkflowGraph, starts: string[]): Set<string> {
  const seen = new Set(starts);
  const queue = [...starts];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const edge of graph.edges.filter((candidate) => candidate.sourceNodeId === id)) {
      if (!seen.has(edge.targetNodeId)) {
        seen.add(edge.targetNodeId);
        queue.push(edge.targetNodeId);
      }
    }
  }
  return seen;
}

export function alwaysEarlierSteps(graph: WorkflowGraph): Map<string, Set<string>> {
  const triggers = new Set(graph.nodes.filter((node) => triggerTypes.has(node.type)).map((node) => node.id));
  const reachable = reachableFrom(graph, [...triggers]);
  const ids = graph.nodes.map((node) => node.id).filter((id) => reachable.has(id));
  const parents = (id: string) =>
    graph.edges.filter((edge) => edge.targetNodeId === id && reachable.has(edge.sourceNodeId)).map((edge) => edge.sourceNodeId);
  const dominators = new Map(ids.map((id) => [id, new Set(triggers.has(id) ? [id] : ids)]));
  for (let changed = true; changed; ) {
    changed = false;
    for (const id of ids.filter((candidate) => !triggers.has(candidate))) {
      const shared = parents(id)
        .map((parent) => dominators.get(parent)!)
        .reduce((left, right) => new Set([...left].filter((each) => right.has(each))));
      const next = new Set([...shared, id]);
      if (next.size !== dominators.get(id)!.size) {
        dominators.set(id, next);
        changed = true;
      }
    }
  }
  return new Map(
    graph.nodes.map((node) => [node.id, new Set([...(dominators.get(node.id) ?? [])].filter((id) => id !== node.id))]),
  );
}

function loopBody(graph: WorkflowGraph, loopId: string): Set<string> {
  return reachableFrom(
    graph,
    graph.edges
      .filter((edge) => edge.sourceNodeId === loopId && edge.sourceHandle === 'each')
      .map((edge) => edge.targetNodeId),
  );
}

const LOOP_ITERATION_FIELDS = new Set<string | undefined>(['item', 'index']);

export function referenceAllowed(graph: WorkflowGraph, fromNodeId: string, reference: string): boolean {
  const [, nodeId, field] = reference.split('.');
  const target = graph.nodes.find((node) => node.id === nodeId);
  return (
    target !== undefined &&
    alwaysEarlierSteps(graph).get(fromNodeId)!.has(target.id) &&
    !(target.type === 'loop' && LOOP_ITERATION_FIELDS.has(field) && !loopBody(graph, target.id).has(fromNodeId))
  );
}

export function upstreamFields(graph: WorkflowGraph, nodeId: string, palette: PaletteItem[]): UpstreamNode[] {
  const earlier = alwaysEarlierSteps(graph).get(nodeId)!;
  return graph.nodes
    .filter((node) => earlier.has(node.id))
    .map((node) => ({
      nodeId: node.id,
      label: stepLabel(node),
      fields: Object.keys(palette.find((item) => item.type === node.type)?.outputSchema?.properties ?? {})
        .map((name) => ({ name, expression: `{{steps.${node.id}.${name}}}` }))
        .filter(({ name }) => referenceAllowed(graph, nodeId, `steps.${node.id}.${name}`)),
    }));
}
