import { workflowGraphSchema, type WorkflowGraph } from '../graph';
import { NODE_TYPE_DISPLAY } from './nodeTypes';

export type LayoutDirection = 'DOWN' | 'RIGHT';

interface Position {
  x: number;
  y: number;
}

export interface EditorLayout {
  direction: LayoutDirection;
  positions: Record<string, Position>;
}

export interface EditorNode {
  id: string;
  type?: string;
  position?: Position;
  data: {
    type: string;
    icon: string;
    properties: { label?: string } & Record<string, unknown>;
  };
}

export interface EditorEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  type?: string;
}

export interface EditorData {
  name: string;
  globalVariables: Record<string, unknown>;
  layoutDirection: LayoutDirection;
  nodes: EditorNode[];
  edges: EditorEdge[];
}

function withoutCleared(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined).map(withoutCleared);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) => (item === undefined ? [] : [[key, withoutCleared(item)]])),
    );
  }
  return value;
}

export function toEditorData(graph: WorkflowGraph, layout: EditorLayout) {
  return {
    name: '',
    globalVariables: {},
    layoutDirection: layout.direction,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: 'node',
      ...(layout.positions[node.id] && { position: layout.positions[node.id] }),
      data: {
        type: node.type,
        icon: NODE_TYPE_DISPLAY[node.type].icon,
        properties: { ...node.config, ...(node.label !== undefined && { label: node.label }) },
      },
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      type: 'labelEdge',
      ...(edge.sourceHandle !== undefined && { sourceHandle: edge.sourceHandle }),
    })),
  } satisfies EditorData;
}

export function fromEditorData(data: EditorData): { graph: WorkflowGraph; layout: EditorLayout } {
  return {
    graph: workflowGraphSchema.parse({
      nodes: data.nodes.map(({ id, data: { type, properties } }) => {
        const { label, description: _description, errors: _errors, customErrors: _customErrors, ...settings } = properties;
        const config = Object.fromEntries(
          Object.entries(settings).flatMap(([key, value]) => (value == null ? [] : [[key, withoutCleared(value)]])),
        );
        return { id, type, config, ...(label !== undefined && { label }) };
      }),
      edges: data.edges.map((edge) => ({
        id: edge.id,
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
        ...(edge.sourceHandle != null && { sourceHandle: edge.sourceHandle }),
      })),
    }),
    layout: {
      direction: data.layoutDirection,
      positions: Object.fromEntries(data.nodes.flatMap((node) => (node.position ? [[node.id, node.position]] : []))),
    },
  };
}
