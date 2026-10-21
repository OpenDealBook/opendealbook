// @vitest-environment jsdom
import type { ComponentProps } from 'react';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  alerts,
  clearScreen,
  dialogText,
  fakeActions,
  fakeServer,
  field,
  pageText,
  press,
  show,
  type,
} from './lender-test-kit';
import { TeamFacts } from './team-facts';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);

type Props = ComponentProps<typeof TeamFacts>;

const ACCOUNT = 'a0000000-0000-4000-8000-000000000001';
const FACT = 'f0000000-0000-4000-8000-000000000001';

function showFacts(
  facts: Props['facts'] = [{ id: FACT, body: 'We skip franchise resales' }],
) {
  show(
    <TeamFacts
      accountId={ACCOUNT}
      facts={facts}
      {...(fakeActions('addFact', 'editFact', 'deleteFact') as Pick<
        Props,
        'addFact' | 'editFact' | 'deleteFact'
      >)}
    />,
  );
}

beforeEach(() => fakeServer.reset());
afterEach(clearScreen);

it('lists the team facts', () => {
  showFacts();

  expect(pageText()).toContain('We skip franchise resales');
});

it('adds a fact and clears the field', async () => {
  showFacts([]);

  await type('New fact', 'Owners over 70 sell faster');
  await press('Add fact');

  expect(fakeServer.inputsTo('addFact')).toEqual([
    { accountId: ACCOUNT, body: 'Owners over 70 sell faster' },
  ]);
  expect(field('New fact').value).toBe('');
  expect(fakeServer.refreshes).toBe(1);
});

it('edits a fact in place', async () => {
  showFacts();

  await press('Edit');
  expect(field('Edit fact').value).toBe('We skip franchise resales');
  await type('Edit fact', 'We skip all franchises');
  await press('Save');

  expect(fakeServer.inputsTo('editFact')).toEqual([
    { factId: FACT, body: 'We skip all franchises' },
  ]);
});

it('deletes a fact only after confirming', async () => {
  showFacts();

  await press('Delete');

  expect(dialogText()).toContain('Delete this fact?');
  expect(dialogText()).toContain('We skip franchise resales');
  expect(fakeServer.inputsTo('deleteFact')).toEqual([]);

  await press('Delete fact');

  expect(fakeServer.inputsTo('deleteFact')).toEqual([{ factId: FACT }]);
});

it('keeps the fact when deleting is cancelled', async () => {
  showFacts();

  await press('Delete');
  await press('Keep it');

  expect(dialogText()).toBeNull();
  expect(fakeServer.inputsTo('deleteFact')).toEqual([]);
});

it('shows the refusal when the server refuses', async () => {
  fakeServer.refusal = 'Write the fact';
  showFacts([]);

  await press('Add fact');

  expect(alerts()).toEqual(['Write the fact']);
});

it('says when the team has no facts yet', () => {
  showFacts([]);

  expect(pageText()).toContain('No team facts yet');
});
