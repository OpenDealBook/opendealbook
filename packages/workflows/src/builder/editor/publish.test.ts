import { describe, expect, it } from 'vitest';

import { labeledPublishProblems, validateForPublish } from './publish';

describe('validateForPublish', () => {
  it('groups problems under the node they belong to and keeps workflow-wide ones apart', () => {
    expect(
      validateForPublish({
        nodes: [
          { id: 'tell', type: 'notify_team', config: { message: '' } },
          { id: 'pause', type: 'wait', config: { kind: 'duration', amount: 1, unit: 'hours' } },
        ],
        edges: [{ id: 'e', sourceNodeId: 'pause', targetNodeId: 'tell' }],
      }),
    ).toEqual({
      byNode: {
        tell: ['This step is not connected to a trigger', 'The message setting is not valid'],
        pause: ['This step is not connected to a trigger'],
      },
      general: ['Add a trigger to start this workflow'],
    });
  });

  it('reports nothing for a publishable workflow', () => {
    expect(
      validateForPublish({
        nodes: [
          { id: 'start', type: 'manual_trigger', config: {} },
          { id: 'tell', type: 'notify_team', config: { message: 'hi' } },
        ],
        edges: [{ id: 'e', sourceNodeId: 'start', targetNodeId: 'tell' }],
      }),
    ).toEqual({ byNode: {}, general: [] });
  });
});

describe('labeledPublishProblems', () => {
  it('names each problem by its step, falling back to the friendly type label', () => {
    expect(
      labeledPublishProblems({
        nodes: [
          { id: 'start', type: 'manual_trigger', config: {} },
          { id: 'tell', type: 'notify_team', label: 'Tell them', config: { message: '' } },
          { id: 'pause', type: 'wait', config: { kind: 'duration', amount: 0, unit: 'hours' } },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'start', targetNodeId: 'tell' },
          { id: 'e2', sourceNodeId: 'tell', targetNodeId: 'pause' },
          { id: 'e3', sourceNodeId: 'start', targetNodeId: 'pause' },
        ],
      }),
    ).toEqual([
      { nodeId: 'pause', label: 'Wait', message: 'Only a Merge step can take two arrows' },
      { nodeId: 'pause', label: 'Wait', message: 'The amount setting is not valid' },
      { nodeId: 'tell', label: 'Tell them', message: 'The message setting is not valid' },
    ]);
  });

  it('keeps workflow-wide problems unlabeled', () => {
    expect(labeledPublishProblems({ nodes: [], edges: [] })).toEqual([
      { nodeId: null, label: null, message: 'Add a trigger to start this workflow' },
    ]);
  });
});
