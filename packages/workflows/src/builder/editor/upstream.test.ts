import { describe, expect, it } from 'vitest';

import type { WorkflowGraph } from '../graph';
import { paletteNodeTypes } from './palette';
import { referenceAllowed, upstreamFields } from './upstream';

const graph: WorkflowGraph = {
  nodes: [
    { id: 'evt', type: 'event_trigger', config: { eventType: 'deal.created' } },
    { id: 'ask', type: 'ask_ai', label: 'Summarise deal', config: { prompt: 'Sum up' } },
    { id: 'side', type: 'decision_model', config: { firmId: 'f' } },
    { id: 'pause', type: 'wait', config: { kind: 'duration', amount: 1, unit: 'hours' } },
    { id: 'tell', type: 'notify_team', config: { message: 'x' } },
    { id: 'after', type: 'create_todo', config: { title: 't', assignees: { kind: 'deal_managers' } } },
  ],
  edges: [
    { id: 'e1', sourceNodeId: 'evt', targetNodeId: 'ask' },
    { id: 'e2', sourceNodeId: 'evt', targetNodeId: 'side' },
    { id: 'e3', sourceNodeId: 'ask', targetNodeId: 'pause' },
    { id: 'e4', sourceNodeId: 'pause', targetNodeId: 'tell' },
    { id: 'e5', sourceNodeId: 'tell', targetNodeId: 'after' },
  ],
};

describe('upstreamFields', () => {
  it('offers every earlier step on the path, by friendly name, with the reference to insert', () => {
    expect(upstreamFields(graph, 'tell', paletteNodeTypes())).toEqual([
      {
        nodeId: 'evt',
        label: 'App event',
        fields: [
          { name: 'eventType', expression: '{{steps.evt.eventType}}' },
          { name: 'dealId', expression: '{{steps.evt.dealId}}' },
          { name: 'accountId', expression: '{{steps.evt.accountId}}' },
          { name: 'globalSeq', expression: '{{steps.evt.globalSeq}}' },
        ],
      },
      {
        nodeId: 'ask',
        label: 'Summarise deal',
        fields: [
          { name: 'text', expression: '{{steps.ask.text}}' },
          { name: 'json', expression: '{{steps.ask.json}}' },
        ],
      },
      { nodeId: 'pause', label: 'Wait', fields: [] },
    ]);
  });

  it('offers nothing before a trigger', () => {
    expect(upstreamFields(graph, 'evt', paletteNodeTypes())).toEqual([]);
  });
});

describe('upstreamFields offers only steps that always run earlier', () => {
  const offered = (graph: WorkflowGraph, nodeId: string) =>
    upstreamFields(graph, nodeId, paletteNodeTypes()).map(({ nodeId: id, fields }) => [id, fields.map((field) => field.name)]);

  it('leaves out either side of a branch or approval once the paths join', () => {
    const joined: WorkflowGraph = {
      nodes: [
        { id: 't', type: 'manual_trigger', config: {} },
        { id: 'ok', type: 'approval', config: { prompt: 'Go?' } },
        { id: 'yes', type: 'ask_ai', config: { prompt: 'a' } },
        { id: 'no', type: 'ask_ai', config: { prompt: 'b' } },
        { id: 'm', type: 'merge', config: {} },
        { id: 'end', type: 'notify_team', config: { message: 'x' } },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 't', targetNodeId: 'ok' },
        { id: 'e2', sourceNodeId: 'ok', targetNodeId: 'yes', sourceHandle: 'approved' },
        { id: 'e3', sourceNodeId: 'ok', targetNodeId: 'no', sourceHandle: 'rejected' },
        { id: 'e4', sourceNodeId: 'yes', targetNodeId: 'm' },
        { id: 'e5', sourceNodeId: 'no', targetNodeId: 'm' },
        { id: 'e6', sourceNodeId: 'm', targetNodeId: 'end' },
      ],
    };

    expect(offered(joined, 'end')).toEqual([
      ['t', []],
      ['ok', ['prompt', 'approved']],
      ['m', []],
    ]);
    expect(offered(joined, 'no')).toEqual([
      ['t', []],
      ['ok', ['prompt', 'approved']],
    ]);
  });

  it("offers a loop's item and index only inside its each path, and none of its body after done", () => {
    const looped: WorkflowGraph = {
      nodes: [
        { id: 't', type: 'manual_trigger', config: {} },
        { id: 'L', type: 'loop', config: { items: [1, 2] } },
        { id: 'b1', type: 'ask_ai', config: { prompt: 'a' } },
        { id: 'b2', type: 'notify_team', config: { message: 'x' } },
        { id: 'after', type: 'notify_team', config: { message: 'y' } },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 't', targetNodeId: 'L' },
        { id: 'e2', sourceNodeId: 'L', targetNodeId: 'b1', sourceHandle: 'each' },
        { id: 'e3', sourceNodeId: 'b1', targetNodeId: 'b2' },
        { id: 'e4', sourceNodeId: 'L', targetNodeId: 'after', sourceHandle: 'done' },
      ],
    };

    expect(offered(looped, 'b2')).toEqual([
      ['t', []],
      ['L', ['item', 'index']],
      ['b1', ['text', 'json']],
    ]);
    expect(offered(looped, 'after')).toEqual([
      ['t', []],
      ['L', []],
    ]);
  });

  it('applies the same rule to a typed reference', () => {
    const looped: WorkflowGraph = {
      nodes: [
        { id: 't', type: 'manual_trigger', config: {} },
        { id: 'L', type: 'loop', config: { items: [1] } },
        { id: 'b1', type: 'ask_ai', config: { prompt: 'a' } },
        { id: 'b2', type: 'notify_team', config: { message: 'x' } },
        { id: 'after', type: 'notify_team', config: { message: 'y' } },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 't', targetNodeId: 'L' },
        { id: 'e2', sourceNodeId: 'L', targetNodeId: 'b1', sourceHandle: 'each' },
        { id: 'e3', sourceNodeId: 'b1', targetNodeId: 'b2' },
        { id: 'e4', sourceNodeId: 'L', targetNodeId: 'after', sourceHandle: 'done' },
      ],
    };

    expect(referenceAllowed(looped, 'b2', 'steps.L.item')).toBe(true);
    expect(referenceAllowed(looped, 'b2', 'steps.b1.text')).toBe(true);
    expect(referenceAllowed(looped, 'after', 'steps.L.index')).toBe(false);
    expect(referenceAllowed(looped, 'after', 'steps.L')).toBe(true);
    expect(referenceAllowed(looped, 'after', 'steps.b1.text')).toBe(false);
    expect(referenceAllowed(looped, 'L', 'steps.L.item')).toBe(false);
  });

  it('offers nothing to a step not yet connected to a trigger', () => {
    expect(
      offered(
        {
          nodes: [
            { id: 'a', type: 'ask_ai', config: { prompt: 'a' } },
            { id: 'b', type: 'notify_team', config: { message: 'x' } },
          ],
          edges: [{ id: 'e', sourceNodeId: 'a', targetNodeId: 'b' }],
        },
        'b',
      ),
    ).toEqual([]);
  });
});
