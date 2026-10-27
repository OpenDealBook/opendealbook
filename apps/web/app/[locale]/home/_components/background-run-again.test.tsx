// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { BackgroundRunAgain } from './background-run-again';
import {
  alerts,
  button,
  clearScreen,
  fakeActions,
  fakeServer,
  press,
  show,
} from './lender-test-kit';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);

const DEAL = '0b5e7c1d-2f43-4a8e-9a51-3c7d2e6f1a22';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const { runBackgroundSearch } = fakeActions('runBackgroundSearch');

beforeEach(() => fakeServer.reset());
afterEach(clearScreen);

it('starts a search with a fresh request id each time and refreshes', async () => {
  show(
    <BackgroundRunAgain
      dealId={DEAL}
      running={false}
      runBackgroundSearch={runBackgroundSearch}
    />,
  );
  await press('Run again');
  await press('Run again');

  const inputs = fakeServer.inputsTo('runBackgroundSearch') as {
    dealId: string;
    requestId: string;
  }[];

  expect(inputs.map((input) => input.dealId)).toEqual([DEAL, DEAL]);
  expect(inputs[0]!.requestId).toMatch(UUID);
  expect(inputs[1]!.requestId).toMatch(UUID);
  expect(inputs[0]!.requestId).not.toBe(inputs[1]!.requestId);
  expect(fakeServer.refreshes).toBe(2);
});

it('is disabled and says Running while a search is unfinished', () => {
  show(
    <BackgroundRunAgain
      dealId={DEAL}
      running
      runBackgroundSearch={runBackgroundSearch}
    />,
  );

  expect(button('Running').disabled).toBe(true);
});

it('shows a refusal as an alert', async () => {
  fakeServer.refusal = 'A background search is already running for this deal';
  show(
    <BackgroundRunAgain
      dealId={DEAL}
      running={false}
      runBackgroundSearch={runBackgroundSearch}
    />,
  );
  await press('Run again');

  expect(alerts()).toEqual([
    'A background search is already running for this deal',
  ]);
});
