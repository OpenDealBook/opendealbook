// @vitest-environment jsdom
import { act } from 'react';

import { afterEach, expect, it } from 'vitest';

import { clearScreen, pageText, show, type } from './lender-test-kit';
import {
  RuleFields,
  type Schema,
  UnionFields,
  withRootUnions,
} from './workflow-editor-forms';

afterEach(clearScreen);

const waitVariants: Schema[] = [
  {
    type: 'object',
    properties: {
      kind: { type: 'string', const: 'duration' },
      amount: { type: 'integer' },
      unit: { type: 'string', enum: ['minutes', 'hours', 'days'] },
    },
  },
  {
    type: 'object',
    properties: {
      kind: { type: 'string', const: 'until' },
      until: { type: 'string' },
    },
  },
];

function select(name: string): HTMLSelectElement {
  return document.querySelector(`select[aria-label="${name}"]`)!;
}

function pick(name: string, value: string) {
  act(() => {
    select(name).value = value;
    select(name).dispatchEvent(new Event('change', { bubbles: true }));
  });
}

it('switches a union config to another kind, dropping the old fields', () => {
  const changes: unknown[] = [];
  show(
    <UnionFields
      variants={waitVariants}
      value={{ label: 'Pause', kind: 'duration', amount: 2, unit: 'days' }}
      enabled
      onChange={(next) => changes.push(next)}
    />,
  );

  expect([...select('kind').options].map((option) => option.value)).toEqual([
    'duration',
    'until',
  ]);

  pick('kind', 'until');

  expect(changes).toEqual([{ label: 'Pause', kind: 'until' }]);
});

it('edits the fields of the chosen kind by their types', async () => {
  const changes: unknown[] = [];
  show(
    <UnionFields
      variants={waitVariants}
      value={{ kind: 'duration', amount: 2, unit: 'days' }}
      enabled
      onChange={(next) => changes.push(next)}
    />,
  );

  await type('amount', '5');
  pick('unit', 'hours');

  expect(changes).toEqual([
    { kind: 'duration', amount: 5, unit: 'days' },
    { kind: 'duration', amount: 2, unit: 'hours' },
  ]);
});

it('edits a list of text as comma separated values', async () => {
  const changes: unknown[] = [];
  show(
    <UnionFields
      variants={[
        {
          type: 'object',
          properties: {
            kind: { type: 'string', const: 'members' },
            userIds: { type: 'array' },
          },
        },
      ]}
      value={{ kind: 'members', userIds: ['u1'] }}
      enabled
      onChange={(next) => changes.push(next)}
    />,
  );

  await type('userIds', 'u1, u2');

  expect(changes).toEqual([{ kind: 'members', userIds: ['u1', 'u2'] }]);
});

const upstream = [
  { label: 'Ask AI: score', reference: 'steps.ai_1.score' },
  { label: 'Ask AI: answer', reference: 'steps.ai_1.answer' },
];

it('builds a one-comparison rule from an earlier field, an operator and a value', async () => {
  const changes: unknown[] = [];
  show(
    <RuleFields
      value={{ '>': [{ var: 'steps.ai_1.score' }, 3] }}
      fields={upstream}
      enabled
      onChange={(next) => changes.push(next)}
    />,
  );

  expect(select('Field').value).toBe('steps.ai_1.score');
  expect(select('Operator').value).toBe('>');

  pick('Operator', '==');
  pick('Field', 'steps.ai_1.answer');
  await type('Value', 'yes');
  await type('Value', '7');

  expect(changes).toEqual([
    { '==': [{ var: 'steps.ai_1.score' }, 3] },
    { '>': [{ var: 'steps.ai_1.answer' }, 3] },
    { '>': [{ var: 'steps.ai_1.score' }, 'yes'] },
    { '>': [{ var: 'steps.ai_1.score' }, 7] },
  ]);
});

it('shows a grouped rule as read only text', () => {
  show(
    <RuleFields
      value={{ and: [{ '==': [1, 1] }] }}
      fields={upstream}
      enabled
      onChange={() => {}}
    />,
  );

  expect(select('Operator')).toBeNull();
  expect(pageText()).toContain('This rule combines conditions');
});

it('adds a whole-config control to node types whose config is a union', () => {
  const [wait, notify] = withRootUnions([
    {
      type: 'wait',
      schema: { oneOf: waitVariants, type: 'object', properties: {} },
      uischema: { type: 'VerticalLayout', elements: [] },
    },
    {
      type: 'notify_team',
      schema: { type: 'object', properties: {} },
      uischema: { type: 'VerticalLayout', elements: [] },
    },
  ]);

  expect(wait!.uischema.elements).toEqual([
    { type: 'Control', scope: '#' },
  ]);
  expect(notify!.uischema.elements).toEqual([]);
});
