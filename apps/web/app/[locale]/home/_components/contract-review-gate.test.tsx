// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { DealReviewGate, TeamReviewGate } from './contract-review-gate';
import {
  alerts,
  button,
  clearScreen,
  fakeServer,
  press,
  show,
} from './lender-test-kit';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);
vi.mock('@odb/contracts', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'setDealReviewGate',
    'setTeamReviewGate',
  ),
);

beforeEach(() => fakeServer.reset());

afterEach(clearScreen);

it("shows and changes whether this deal's contracts need counsel sign-off", async () => {
  show(<DealReviewGate dealId={'deal-1'} gates={{ loi: false, apa: true }} />);

  expect(
    button('LOI needs counsel sign-off').getAttribute('aria-checked'),
  ).toBe('false');
  expect(
    button('APA needs counsel sign-off').getAttribute('aria-checked'),
  ).toBe('true');

  await press('APA needs counsel sign-off');

  expect(fakeServer.inputsTo('setDealReviewGate')).toEqual([
    { dealId: 'deal-1', type: 'apa', required: false },
  ]);
  expect(fakeServer.refreshes).toBe(1);
});

it("changes the team's default for new deals", async () => {
  show(
    <TeamReviewGate accountId={'team-1'} gates={{ loi: false, apa: true }} />,
  );

  await press('LOI needs counsel sign-off');

  expect(fakeServer.inputsTo('setTeamReviewGate')).toEqual([
    { accountId: 'team-1', type: 'loi', required: true },
  ]);
});

it('shows a refused change', async () => {
  fakeServer.refusal =
    'Only a deal manager can change whether counsel must sign off.';
  show(<DealReviewGate dealId={'deal-1'} gates={{ loi: false, apa: true }} />);

  await press('LOI needs counsel sign-off');

  expect(alerts()).toEqual([
    'Only a deal manager can change whether counsel must sign off.',
  ]);
});
