import { describe, expect, it } from 'vitest';

import { NODE_CONFIG_SCHEMAS, parseWorkflowGraph } from './graph';

const v1Graph = {
  nodes: [
    { id: 'start', type: 'manual_trigger', config: {} },
    { id: 'first', type: 'notify_team', config: { message: 'Review due' } },
  ],
  edges: [{ id: 'e1', sourceNodeId: 'start', targetNodeId: 'first' }],
};

describe('parseWorkflowGraph', () => {
  it('keeps reading version 1 graphs unchanged', () => {
    const parsed = parseWorkflowGraph({ schemaVersion: 1, graph: v1Graph });

    expect(parsed.triggers.map((node) => node.id)).toEqual(['start']);
    expect(parsed.nodes.map((node) => node.id)).toEqual(['start', 'first']);
    expect(parsed.edges).toEqual(v1Graph.edges);
  });

  it('reads version 2 graphs with the W3 node types', () => {
    const graph = {
      nodes: [
        {
          id: 'weekly',
          type: 'schedule_trigger',
          config: { every: 'week', weekday: 'monday', at: '08:00' },
        },
        {
          id: 'pause',
          type: 'wait',
          config: { kind: 'duration', amount: 2, unit: 'days' },
        },
        {
          id: 'check',
          type: 'branch',
          config: { rule: { '==': [{ var: 'fit' }, true] } },
        },
        { id: 'join', type: 'merge', config: {} },
        { id: 'each', type: 'loop', config: { items: '{{steps.pause.ids}}' } },
        {
          id: 'todo',
          type: 'create_todo',
          config: { title: 'Call', assignees: { kind: 'deal_managers' } },
        },
      ],
      edges: [],
    };

    expect(
      parseWorkflowGraph({ schemaVersion: 2, graph }).nodes.map(
        (node) => node.type,
      ),
    ).toEqual([
      'schedule_trigger',
      'wait',
      'branch',
      'merge',
      'loop',
      'create_todo',
    ]);
  });

  it('allows at most 200 nodes', () => {
    const graphOf = (count: number) => ({
      nodes: Array.from({ length: count }, (_, index) => ({
        id: `n${index}`,
        type: 'merge',
        config: {},
      })),
      edges: [],
    });

    expect(
      parseWorkflowGraph({ schemaVersion: 2, graph: graphOf(200) }).nodes,
    ).toHaveLength(200);
    expect(() =>
      parseWorkflowGraph({ schemaVersion: 2, graph: graphOf(201) }),
    ).toThrow('A workflow can have at most 200 steps');
  });

  it('refuses an unknown schema version', () => {
    expect(() =>
      parseWorkflowGraph({ schemaVersion: 3, graph: v1Graph }),
    ).toThrow();
  });
});

describe('node config schemas', () => {
  it('pull_leads needs a source, caps the limit at 500 and defaults to it', () => {
    const schema = NODE_CONFIG_SCHEMAS.pull_leads;

    expect(schema.parse({ sources: ['ppp', 'state_registry'] })).toEqual({
      sources: ['ppp', 'state_registry'],
      limit: 500,
    });
    expect(
      schema.safeParse({
        sources: ['sba_7a'],
        widen: {
          states: ['TX', 'OK'],
          minJobs: 5,
          maxPppLoan: 2000000,
          minAgeYears: 10,
        },
        limit: 50,
      }).success,
    ).toBe(true);
    expect(schema.safeParse({ sources: [] }).success).toBe(false);
    const widen = (widen: object) =>
      schema.safeParse({ sources: ['ppp'], widen }).success;
    expect(widen({ states: ['PR', 'DC', 'GU'] })).toBe(true);
    expect(widen({ states: ['tx'] })).toBe(false);
    expect(widen({ states: ['ZZ'] })).toBe(false);
    expect(
      widen({ minJobs: 5, maxJobs: 5, minPppLoan: 1, maxPppLoan: 2 }),
    ).toBe(true);
    expect(widen({ minJobs: 6, maxJobs: 5 })).toBe(false);
    expect(widen({ minPppLoan: 3, maxPppLoan: 2 })).toBe(false);
    expect(widen({ minHeadcount: 10, maxHeadcount: 9 })).toBe(false);
    expect(widen({ minHeadcount: 10 })).toBe(true);
    expect(schema.safeParse({ sources: ['yelp'] }).success).toBe(false);
    expect(schema.safeParse({ sources: ['ppp'], limit: 501 }).success).toBe(
      false,
    );
  });

  it('firm steps take a firm and, for outreach, what to send', () => {
    const firmId = '{{steps.each.item}}';

    for (const type of [
      'registry_lookup',
      'email_lookup',
      'prepare_firm',
    ] as const) {
      expect(NODE_CONFIG_SCHEMAS[type].safeParse({ firmId }).success).toBe(
        true,
      );
      expect(NODE_CONFIG_SCHEMAS[type].safeParse({}).success).toBe(false);
    }
    expect(
      NODE_CONFIG_SCHEMAS.enroll_sequence.safeParse({
        firmId,
        sequenceId: 'seq-1',
      }).success,
    ).toBe(true);
    expect(
      NODE_CONFIG_SCHEMAS.enroll_sequence.safeParse({ firmId }).success,
    ).toBe(false);
    expect(
      NODE_CONFIG_SCHEMAS.send_letter.safeParse({ firmId, templateId: 'intro' })
        .success,
    ).toBe(true);
    expect(NODE_CONFIG_SCHEMAS.send_letter.safeParse({ firmId }).success).toBe(
      false,
    );
  });

  it('event_trigger takes a known event type and an optional rule filter', () => {
    const schema = NODE_CONFIG_SCHEMAS.event_trigger;

    expect(schema.safeParse({ eventType: 'deal.loi_signed' }).success).toBe(
      true,
    );
    expect(
      schema.safeParse({
        eventType: 'deal.stage_changed',
        filter: { '==': [{ var: 'stage' }, 'loi'] },
      }).success,
    ).toBe(true);
    expect(schema.safeParse({ eventType: 'deal.deleted' }).success).toBe(false);
    expect(
      schema.safeParse({
        eventType: 'firm.approved',
        filter: { in: ['x', []] },
      }).success,
    ).toBe(false);
  });

  it('approval and decision_model need their text; ask_ai defaults to text output', () => {
    expect(NODE_CONFIG_SCHEMAS.approval.safeParse({ prompt: '' }).success).toBe(
      false,
    );
    expect(
      NODE_CONFIG_SCHEMAS.ask_ai.parse({ prompt: 'Summarize {{steps.a.b}}' }),
    ).toEqual({
      prompt: 'Summarize {{steps.a.b}}',
      output: 'text',
    });
    expect(
      NODE_CONFIG_SCHEMAS.ask_ai.safeParse({ prompt: 'x', output: 'xml' })
        .success,
    ).toBe(false);
    expect(
      NODE_CONFIG_SCHEMAS.decision_model.safeParse({
        firmId: '{{steps.each.item}}',
        instructions: 'Prefer Texas firms',
      }).success,
    ).toBe(true);
    expect(NODE_CONFIG_SCHEMAS.decision_model.safeParse({}).success).toBe(
      false,
    );
  });

  it('schedule_trigger takes the four presets', () => {
    const schema = NODE_CONFIG_SCHEMAS.schedule_trigger;

    expect(schema.safeParse({ every: 'hours', hours: 6 }).success).toBe(true);
    expect(schema.safeParse({ every: 'day', at: '07:30' }).success).toBe(true);
    expect(
      schema.safeParse({ every: 'week', weekday: 'friday', at: '16:00' })
        .success,
    ).toBe(true);
    expect(
      schema.safeParse({ every: 'month', day: 1, at: '09:00' }).success,
    ).toBe(true);
    expect(schema.safeParse({ every: 'day', at: '24:00' }).success).toBe(false);
    expect(schema.safeParse({ every: 'hours', hours: 0 }).success).toBe(false);
    expect(schema.safeParse({ every: 'hours', hours: 24 }).success).toBe(true);
    expect(schema.safeParse({ every: 'hours', hours: 25 }).success).toBe(false);
  });

  it('wait takes a duration or an until date', () => {
    const schema = NODE_CONFIG_SCHEMAS.wait;

    expect(
      schema.safeParse({ kind: 'duration', amount: 30, unit: 'minutes' })
        .success,
    ).toBe(true);
    expect(
      schema.safeParse({ kind: 'until', until: '2026-11-01T09:00:00Z' })
        .success,
    ).toBe(true);
    expect(
      schema.safeParse({ kind: 'until', until: '2026-11-01' }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ kind: 'until', until: '2026-11-01T09:00:00' }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ kind: 'duration', amount: 3, unit: 'weeks' }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ kind: 'until', until: 'next tuesday' }).success,
    ).toBe(false);
  });

  it('loop defaults to running items one at a time', () => {
    expect(NODE_CONFIG_SCHEMAS.loop.parse({ items: [1, 2] })).toEqual({
      items: [1, 2],
      parallel: false,
    });
  });

  it('create_todo assigns to named members or the deal managers', () => {
    const schema = NODE_CONFIG_SCHEMAS.create_todo;

    expect(
      schema.safeParse({
        title: 'Follow up',
        assignees: { kind: 'members', userIds: ['u1'] },
        dueInDays: 3,
        dealId: 'deal-1',
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ title: 'Follow up', assignees: { kind: 'everyone' } })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({
        title: 'Follow up',
        assignees: { kind: 'deal_managers' },
        dueInDays: 0,
      }).success,
    ).toBe(false);
  });
});
