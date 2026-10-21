import { describe, expect, it } from 'vitest';

import type { NodeTypeName, WorkflowEdge, WorkflowNode } from './graph';
import { validateWorkflowGraph } from './validate';

function node(
  id: string,
  type: NodeTypeName,
  config: WorkflowNode['config'] = {},
): WorkflowNode {
  return { id, type, config };
}

function edge(
  sourceNodeId: string,
  targetNodeId: string,
  sourceHandle?: string,
): WorkflowEdge {
  return {
    id: `${sourceNodeId}-${targetNodeId}`,
    sourceNodeId,
    targetNodeId,
    sourceHandle,
  };
}

const validNodes = [
  node('start', 'manual_trigger'),
  node('weekly', 'schedule_trigger', { every: 'day', at: '08:00' }),
  node('pause', 'wait', { kind: 'until', until: '{{steps.weekly.firedAt}}' }),
  node('check', 'branch', { rule: { '>': [{ var: 'steps.start.count' }, 3] } }),
  node('yes', 'notify_team', { message: 'Fit' }),
  node('no', 'notify_team', { message: 'Not fit' }),
  node('join', 'merge'),
  node('each', 'loop', { items: '{{steps.yes.ids}}', parallel: true }),
  node('todo', 'create_todo', {
    title: 'Call {{steps.each.item}}',
    assignees: { kind: 'members', userIds: ['u1'] },
    dueInDays: '{{steps.yes.days}}',
  }),
  node('done', 'notify_team', { message: '{{steps.yes.notified}} notified' }),
];

const validEdges = [
  edge('weekly', 'pause'),
  edge('start', 'check'),
  edge('check', 'yes', 'true'),
  edge('check', 'no', 'false'),
  edge('yes', 'join'),
  edge('no', 'join'),
  edge('join', 'each'),
  edge('each', 'todo', 'each'),
  edge('each', 'done', 'done'),
];

function errorsOf(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  const result = validateWorkflowGraph({ nodes, edges });
  return result.ok ? [] : result.errors;
}

describe('validateWorkflowGraph', () => {
  it('accepts a graph using every W3 node type', () => {
    expect(
      validateWorkflowGraph({ nodes: validNodes, edges: validEdges }),
    ).toEqual({ ok: true });
  });

  it('needs at least one trigger', () => {
    expect(
      errorsOf([node('only', 'notify_team', { message: 'Hi' })], []),
    ).toContainEqual({
      message: 'Add a trigger to start this workflow',
    });
  });

  it('allows one manual trigger only', () => {
    expect(
      errorsOf([node('a', 'manual_trigger'), node('b', 'manual_trigger')], []),
    ).toEqual([{ nodeId: 'b', message: 'Add a manual trigger only once' }]);
  });

  it('refuses an arrow into a trigger', () => {
    expect(
      errorsOf(
        [
          node('a', 'manual_trigger'),
          node('b', 'schedule_trigger', { every: 'hours', hours: 2 }),
        ],
        [edge('a', 'b')],
      ),
    ).toEqual([
      { nodeId: 'b', message: 'A trigger cannot have an arrow into it' },
    ]);
  });

  it('refuses repeated node and edge ids', () => {
    const errors = errorsOf(
      [node('start', 'manual_trigger'), node('x', 'merge'), node('x', 'merge')],
      [edge('start', 'x'), edge('start', 'x')],
    );

    expect(errors).toContainEqual({
      nodeId: 'x',
      message: 'Two steps share the id x',
    });
    expect(errors).toContainEqual({
      message: 'Two arrows share the id start-x',
    });
  });

  it('refuses an arrow to or from a missing step', () => {
    expect(
      errorsOf([node('start', 'manual_trigger')], [edge('start', 'ghost')]),
    ).toEqual([
      { message: 'Arrow start-ghost points at a step that does not exist' },
    ]);
  });

  it('lets only a merge take two arrows', () => {
    const errors = errorsOf(
      [
        node('start', 'manual_trigger'),
        node('a', 'notify_team', { message: 'A' }),
        node('b', 'notify_team', { message: 'B' }),
        node('c', 'notify_team', { message: 'C' }),
      ],
      [edge('start', 'a'), edge('start', 'b'), edge('a', 'c'), edge('b', 'c')],
    );

    expect(errors).toEqual([
      { nodeId: 'c', message: 'Only a Merge step can take two arrows' },
    ]);
  });

  it('refuses a cycle, including a loop body that returns to its loop', () => {
    const loopBack = errorsOf(
      [
        node('start', 'manual_trigger'),
        node('each', 'loop', { items: [1] }),
        node('join', 'merge'),
      ],
      [
        edge('start', 'join'),
        edge('join', 'each'),
        edge('each', 'join', 'each'),
      ],
    );

    expect(loopBack).toContainEqual({
      message: 'This graph has a loop back; use a Loop step',
    });
  });

  it('checks each arrow leaves through an exit its step declares', () => {
    const errors = errorsOf(
      [
        node('start', 'manual_trigger'),
        node('check', 'branch', { rule: { '==': [1, 1] } }),
        node('a', 'merge'),
        node('b', 'merge'),
        node('c', 'merge'),
      ],
      [
        edge('start', 'check', 'true'),
        edge('check', 'a', 'maybe'),
        edge('check', 'b'),
      ],
    );

    expect(errors).toContainEqual({
      nodeId: 'start',
      message: 'This step has one exit; remove "true" from its arrow',
    });
    expect(errors).toContainEqual({
      nodeId: 'check',
      message: 'This step has no "maybe" exit',
    });
    expect(errors).toContainEqual({
      nodeId: 'check',
      message: 'Choose which exit this arrow leaves from',
    });
  });

  it('checks config against its schema, letting a whole expression stand in for a typed value', () => {
    const errors = errorsOf(
      [
        node('start', 'manual_trigger'),
        node('empty', 'notify_team', { message: '' }),
        node('todo', 'create_todo', {
          title: 'Call',
          assignees: { kind: 'deal_managers' },
          dueInDays: 'in {{steps.start.days}} days',
        }),
      ],
      [edge('start', 'empty'), edge('start', 'todo')],
    );

    expect(errors.map((error) => error.nodeId)).toEqual(['empty', 'todo']);
    expect(errors[1]!.message).toBe('The dueInDays setting is not valid');
  });

  it('refuses a reference to a step that is not upstream', () => {
    const errors = errorsOf(
      [
        node('start', 'manual_trigger'),
        node('a', 'notify_team', { message: 'A' }),
        node('b', 'notify_team', { message: 'Saw {{ steps.a.notified }}' }),
        node('check', 'branch', {
          rule: { '==': [{ var: 'steps.b.notified' }, 1] },
        }),
      ],
      [edge('start', 'a'), edge('start', 'b'), edge('start', 'check')],
    );

    expect(errors).toEqual([
      { nodeId: 'b', message: 'steps.a does not come before this step' },
      { nodeId: 'check', message: 'steps.b does not come before this step' },
    ]);
  });

  it('lets a Merge join branches that stay inside one Loop body', () => {
    expect(
      errorsOf(
        [
          node('start', 'manual_trigger'),
          node('each', 'loop', { items: [1] }),
          node('check', 'branch', { rule: { '==': [1, 1] } }),
          node('join', 'merge'),
        ],
        [
          edge('start', 'each'),
          edge('each', 'check', 'each'),
          edge('check', 'join', 'true'),
          {
            id: 'false-join',
            sourceNodeId: 'check',
            targetNodeId: 'join',
            sourceHandle: 'false',
          },
        ],
      ),
    ).toEqual([]);
  });

  it('refuses a Merge fed from inside and outside a Loop body', () => {
    expect(
      errorsOf(
        [
          node('start', 'manual_trigger'),
          node('each', 'loop', { items: [1] }),
          node('inside', 'notify_team', { message: 'In' }),
          node('join', 'merge'),
        ],
        [
          edge('start', 'each'),
          edge('each', 'inside', 'each'),
          edge('inside', 'join'),
          edge('each', 'join', 'done'),
        ],
      ),
    ).toEqual([
      {
        nodeId: 'join',
        message: "A Merge can't join paths inside and outside a Loop",
      },
    ]);
  });

  it('refuses a Merge joining two different Loop bodies', () => {
    expect(
      errorsOf(
        [
          node('start', 'manual_trigger'),
          node('first', 'loop', { items: [1] }),
          node('second', 'loop', { items: [2] }),
          node('join', 'merge'),
        ],
        [
          edge('start', 'first'),
          edge('start', 'second'),
          edge('first', 'join', 'each'),
          edge('second', 'join', 'each'),
        ],
      ),
    ).toEqual([
      { nodeId: 'join', message: "A Merge can't join different Loop bodies" },
    ]);
  });

  it('refuses steps no trigger reaches', () => {
    expect(
      errorsOf([node('start', 'manual_trigger'), node('lost', 'merge')], []),
    ).toEqual([
      { nodeId: 'lost', message: 'This step is not connected to a trigger' },
    ]);
  });
});
