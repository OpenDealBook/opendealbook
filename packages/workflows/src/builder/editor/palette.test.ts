import { describe, expect, it } from 'vitest';

import { NODE_TYPES } from '../graph';
import { paletteNodeTypes } from './palette';

const palette = paletteNodeTypes();
const item = (type: string) => palette.find((candidate) => candidate.type === type)!;

describe('paletteNodeTypes', () => {
  it('offers every node type once, with its friendly label', () => {
    expect(palette.map((candidate) => candidate.type)).toEqual([...NODE_TYPES]);
    expect(Object.fromEntries(palette.map((candidate) => [candidate.type, candidate.label]))).toEqual({
      manual_trigger: 'Run now',
      schedule_trigger: 'Schedule',
      event_trigger: 'App event',
      notify_team: 'Notify team',
      create_todo: 'Create to-do',
      ask_ai: "Ask the team's AI",
      decision_model: 'Decision model',
      approval: 'Approval',
      wait: 'Wait',
      branch: 'Branch',
      merge: 'Merge',
      loop: 'Loop',
    });
  });

  it('generates a draft-7 form schema from the config schema, with the editor label and description fields', () => {
    expect(item('ask_ai').schema).toMatchObject({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        label: { type: 'string' },
        description: { type: 'string' },
        prompt: { type: 'string', minLength: 1 },
        output: { type: 'string', enum: ['text', 'json'] },
      },
      required: ['prompt'],
    });
    expect(item('wait').schema).toMatchObject({
      type: 'object',
      properties: { label: { type: 'string' }, description: { type: 'string' } },
      oneOf: [{ properties: { kind: { const: 'duration' } } }, { properties: { kind: { const: 'until' } } }],
    });
  });

  it('fills defaults from the config schema', () => {
    expect(item('ask_ai').defaultPropertiesData).toEqual({ output: 'text' });
    expect(item('loop').defaultPropertiesData).toEqual({ parallel: false });
    expect(item('notify_team').defaultPropertiesData).toEqual({});
  });

  it('marks free-text fields as accepting step references and leaves choice fields alone', () => {
    expect(item('ask_ai').uischema.elements).toEqual([
      { type: 'Control', scope: '#/properties/label' },
      { type: 'Control', scope: '#/properties/description' },
      { type: 'Control', scope: '#/properties/prompt', options: { expression: true } },
      { type: 'Control', scope: '#/properties/output' },
    ]);
  });

  it('describes what each step and trigger hands on, for the field picker', () => {
    expect(item('decision_model').outputSchema).toEqual({
      type: 'default',
      properties: {
        verdictId: { type: 'string', label: 'verdictId' },
        fit: { type: 'boolean', label: 'fit' },
        reasons: { type: 'array', label: 'reasons' },
        approved: { type: 'boolean', label: 'approved' },
      },
    });
    expect(item('approval').outputSchema).toEqual({
      type: 'default',
      properties: {
        prompt: { type: 'string', label: 'prompt' },
        approved: { type: 'boolean', label: 'approved' },
      },
    });
    expect(item('loop').outputSchema).toEqual({
      type: 'default',
      properties: {
        item: { type: 'object', label: 'item' },
        index: { type: 'number', label: 'index' },
      },
    });
    expect(Object.keys(item('ask_ai').outputSchema!.properties)).toEqual(['text', 'json']);
    expect(item('event_trigger').outputSchema).toEqual({
      type: 'default',
      properties: {
        eventType: { type: 'string', label: 'eventType' },
        dealId: { type: 'string', label: 'dealId' },
        accountId: { type: 'string', label: 'accountId' },
        globalSeq: { type: 'number', label: 'globalSeq' },
      },
    });
    expect(item('manual_trigger').outputSchema).toBeUndefined();
    expect(item('branch').outputSchema).toBeUndefined();
  });
});
