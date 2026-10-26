import { describe, expect, it } from 'vitest';

import type { WorkflowGraph } from '../graph';
import { fromEditorData, toEditorData, type EditorData, type EditorLayout } from './format';

const graph: WorkflowGraph = {
  nodes: [
    { id: 'start', type: 'manual_trigger', config: {} },
    { id: 'check', type: 'branch', label: 'Big deal?', config: { rule: { '>': [{ var: 'steps.start.amount' }, 5] } } },
    { id: 'tell', type: 'notify_team', label: 'Tell the team', config: { message: 'Big one: {{steps.start.amount}}' } },
  ],
  edges: [
    { id: 'e1', sourceNodeId: 'start', targetNodeId: 'check' },
    { id: 'e2', sourceNodeId: 'check', targetNodeId: 'tell', sourceHandle: 'true' },
  ],
};

const layout: EditorLayout = {
  direction: 'DOWN',
  positions: { start: { x: 0, y: 0 }, check: { x: 0, y: 120 }, tell: { x: 40, y: 240 } },
};

describe('toEditorData', () => {
  it('puts label and config into node properties and keeps ids, positions and handles', () => {
    const data = toEditorData(graph, layout);

    expect(data.layoutDirection).toBe('DOWN');
    expect(data.nodes[2]).toMatchObject({
      id: 'tell',
      position: { x: 40, y: 240 },
      data: {
        type: 'notify_team',
        icon: 'Bell',
        properties: { label: 'Tell the team', message: 'Big one: {{steps.start.amount}}' },
      },
    });
    expect(data.edges[1]).toMatchObject({ id: 'e2', source: 'check', target: 'tell', sourceHandle: 'true' });
  });
});

describe('fromEditorData', () => {
  it('round trips the stored graph and layout without loss', () => {
    expect(fromEditorData(toEditorData(graph, layout))).toEqual({ graph, layout });
  });

  it('lifts label out of properties, drops vendor description, validation state and empty handles', () => {
    const saved: EditorData = {
      name: 'Draft',
      globalVariables: {},
      layoutDirection: 'RIGHT',
      nodes: [
        {
          id: 'n1',
          type: 'node',
          position: { x: 10, y: 20 },
          data: {
            type: 'ask_ai',
            icon: 'Sparkle',
            properties: {
              label: 'Summarise',
              description: 'Short summary',
              prompt: 'Summarise {{steps.t.dealId}}',
              output: 'text',
              errors: [{ keyword: 'required', instancePath: '', schemaPath: '#/required', schema: undefined }],
              customErrors: [],
            },
          },
        },
        {
          id: 't',
          type: 'node',
          position: { x: 0, y: 0 },
          data: { type: 'event_trigger', icon: 'Lightning', properties: { eventType: 'deal.created' } },
        },
      ],
      edges: [{ id: 'e', source: 't', target: 'n1', sourceHandle: null, type: 'labelEdge' }],
    };

    expect(fromEditorData(saved)).toEqual({
      graph: {
        nodes: [
          {
            id: 'n1',
            type: 'ask_ai',
            label: 'Summarise',
            config: { prompt: 'Summarise {{steps.t.dealId}}', output: 'text' },
          },
          { id: 't', type: 'event_trigger', config: { eventType: 'deal.created' } },
        ],
        edges: [{ id: 'e', sourceNodeId: 't', targetNodeId: 'n1' }],
      },
      layout: { direction: 'RIGHT', positions: { n1: { x: 10, y: 20 }, t: { x: 0, y: 0 } } },
    });
  });

  it('leaves a node without a stored position unplaced and keeps it unplaced on save', () => {
    const unplaced: EditorLayout = { direction: 'RIGHT', positions: { start: { x: 0, y: 0 } } };
    const data = toEditorData(graph, unplaced);

    expect(data.nodes[1]).not.toHaveProperty('position');
    expect(fromEditorData(data).layout).toEqual(unplaced);
  });

  it('removes a setting the person cleared', () => {
    const saved: EditorData = {
      name: '',
      globalVariables: {},
      layoutDirection: 'RIGHT',
      nodes: [
        {
          id: 'todo',
          data: {
            type: 'create_todo',
            icon: 'ListChecks',
            properties: { title: 'Call', assignees: { kind: 'deal_managers' }, dueInDays: undefined, dealId: null },
          },
        },
      ],
      edges: [],
    };

    expect(fromEditorData(saved).graph.nodes[0]!.config).toEqual({ title: 'Call', assignees: { kind: 'deal_managers' } });
  });

  it('drops cleared values at every depth and keeps real nulls below the top level', () => {
    const saved: EditorData = {
      name: '',
      globalVariables: {},
      layoutDirection: 'RIGHT',
      nodes: [
        {
          id: 'todo',
          data: {
            type: 'create_todo',
            icon: 'ListChecks',
            properties: { title: 'Call', assignees: { kind: 'members', userIds: ['u1', undefined], note: undefined } },
          },
        },
        {
          id: 'check',
          data: {
            type: 'branch',
            icon: 'ArrowsSplit',
            properties: { rule: { and: [{ '==': [{ var: 'steps.t.x' }, null] }, undefined] } },
          },
        },
      ],
      edges: [],
    };

    expect(fromEditorData(saved).graph.nodes.map((node) => node.config)).toEqual([
      { title: 'Call', assignees: { kind: 'members', userIds: ['u1'] } },
      { rule: { and: [{ '==': [{ var: 'steps.t.x' }, null] }] } },
    ]);
  });

  it('refuses a node type the runner does not know', () => {
    const saved: EditorData = {
      name: '',
      globalVariables: {},
      layoutDirection: 'RIGHT',
      nodes: [{ id: 'x', position: { x: 0, y: 0 }, data: { type: 'http_request', icon: 'Globe', properties: {} } }],
      edges: [],
    };

    expect(() => fromEditorData(saved)).toThrow();
  });
});
