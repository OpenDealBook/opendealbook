// @vitest-environment jsdom
import { act } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type ContractReview,
  ContractReviewPanel,
} from './contract-review-panel';
import {
  alerts,
  buttonNames,
  buttons,
  clearScreen,
  dialogText,
  fakeServer,
  field,
  pageText,
  press,
  show,
  type,
} from './lender-test-kit';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);
vi.mock('@odb/contracts', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'requestContractReview',
    'decideContractReview',
    'overrideContractSigning',
  ),
);
vi.mock('@odb/deals/server', async () =>
  (await import('./lender-test-kit')).fakeActions('sendContractForSignature'),
);

const VERSION = 'v-1';

const waiting: ContractReview = {
  required: true,
  ready: false,
  sendable: true,
  counsel: { buyer: true, seller: true },
  requests: [{ requestedAt: '2026-10-02T15:00:00Z' }],
  decisions: [],
  overrides: [],
};

function showPanel(review: ContractReview, canManage = true) {
  show(
    <ContractReviewPanel
      contractVersionId={VERSION}
      review={review}
      canManage={canManage}
    />,
  );
}

function sides(): string[] {
  return [...document.querySelectorAll('[data-review-side]')].map((side) =>
    (side.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

function history(): string[] {
  return [...document.querySelectorAll('[data-review-history] li')].map(
    (entry) => (entry.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

async function confirmInDialog(name: string) {
  await act(async () => {
    buttons(name).at(-1)!.click();
  });
}

beforeEach(() => fakeServer.reset());

afterEach(clearScreen);

describe('ContractReviewPanel', () => {
  it("shows each side's latest decision and every step before it", () => {
    showPanel({
      ...waiting,
      decisions: [
        {
          side: 'buyer',
          decision: 'changes_needed',
          note: 'Fix the escrow clause',
          withoutCounsel: false,
          decidedAt: '2026-10-03T15:00:00Z',
        },
        {
          side: 'buyer',
          decision: 'approved_with_comments',
          note: 'Watch the non-compete',
          withoutCounsel: false,
          decidedAt: '2026-10-05T15:00:00Z',
        },
      ],
    });

    expect(sides()).toEqual([
      "Buyer's counsel Approved with comments: Watch the non-compete",
      "Seller's counsel Waiting since Oct 2, 2026",
    ]);
    expect(history()).toEqual([
      'Oct 2, 2026: Review requested',
      "Oct 3, 2026: Buyer's counsel: Changes needed: Fix the escrow clause",
      "Oct 5, 2026: Buyer's counsel: Approved with comments: Watch the non-compete",
    ]);
  });

  it('shows changes needed with its note', () => {
    showPanel({
      ...waiting,
      decisions: [
        {
          side: 'seller',
          decision: 'changes_needed',
          note: 'Price is firm',
          withoutCounsel: false,
          decidedAt: '2026-10-03T15:00:00Z',
        },
      ],
    });

    expect(sides()[1]).toBe("Seller's counsel Changes needed: Price is firm");
  });

  it('shows a side confirmed by its own party as approved without counsel', () => {
    showPanel({
      ...waiting,
      counsel: { buyer: false, seller: false },
      decisions: [
        {
          side: 'buyer',
          decision: 'approved',
          note: null,
          withoutCounsel: true,
          decidedAt: '2026-10-03T15:00:00Z',
        },
      ],
    });

    expect(sides()).toEqual([
      'Buyer Approved without counsel',
      'Seller Waiting since Oct 2, 2026',
    ]);
  });

  it('says when nobody has been asked yet', () => {
    showPanel({ ...waiting, requests: [] });

    expect(sides()).toEqual([
      "Buyer's counsel Not requested yet",
      "Seller's counsel Not requested yet",
    ]);
  });

  it('shows an override and its reason', () => {
    showPanel({
      ...waiting,
      ready: true,
      overrides: [
        {
          reason: 'Seller signing today',
          overriddenAt: '2026-10-04T15:00:00Z',
        },
      ],
    });

    expect(pageText()).toContain('Overridden: Seller signing today');
    expect(history()).toContain(
      'Oct 4, 2026: Sign-off overridden: Seller signing today',
    );
  });

  it('says when this contract needs no counsel sign-off', () => {
    showPanel({ ...waiting, required: false, ready: true });

    expect(pageText()).toContain('Counsel sign-off is not required.');
  });

  it('shows a team member without deals.manage the status and no actions', () => {
    showPanel(waiting, false);

    expect(sides()).toHaveLength(2);
    expect(buttonNames()).toEqual([]);
  });

  it('asks counsel to review this version', async () => {
    showPanel(waiting);

    await press('Ask counsel to review');

    expect(fakeServer.inputsTo('requestContractReview')).toEqual([
      { contractVersionId: VERSION },
    ]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('lets a manager approve for the buyer only when the buyer has no counsel', async () => {
    showPanel(waiting);
    expect(buttonNames()).not.toContain('Approve for buyer');
    clearScreen();

    showPanel({ ...waiting, counsel: { buyer: false, seller: true } });
    await press('Approve for buyer');

    expect(fakeServer.inputsTo('decideContractReview')).toEqual([
      { contractVersionId: VERSION, decision: 'approved' },
    ]);
  });

  it('sends a ready version for signature to the named signers', async () => {
    showPanel({ ...waiting, ready: true });

    expect(buttonNames()).not.toContain('Override and send');

    await press('Send for signature');
    await type('Signer 1 name', 'Zac Clifton');
    await type('Signer 1 email', 'zac@buyer.com');
    await confirmInDialog('Send for signature');

    expect(fakeServer.inputsTo('sendContractForSignature')).toEqual([
      {
        contract_version_id: VERSION,
        signers: [{ name: 'Zac Clifton', email: 'zac@buyer.com' }],
      },
    ]);
    expect(dialogText()).toBeNull();
    expect(fakeServer.refreshes).toBe(1);
  });

  it('overrides sign-off with the stated reason, then sends', async () => {
    showPanel(waiting);

    expect(buttonNames()).not.toContain('Send for signature');

    await press('Override and send');
    await type('Reason', 'Seller signing today');
    await type('Signer 1 name', 'Zac Clifton');
    await type('Signer 1 email', 'zac@buyer.com');
    await confirmInDialog('Override and send');

    expect(fakeServer.inputsTo('overrideContractSigning')).toEqual([
      { contractVersionId: VERSION, reason: 'Seller signing today' },
    ]);
    expect(fakeServer.inputsTo('sendContractForSignature')).toEqual([
      {
        contract_version_id: VERSION,
        signers: [{ name: 'Zac Clifton', email: 'zac@buyer.com' }],
      },
    ]);
  });

  it('requires a reason to override', async () => {
    showPanel(waiting);

    await press('Override and send');

    expect(field('Reason').required).toBe(true);
  });

  it('does not send when the override is refused, and says why', async () => {
    fakeServer.refusalFor.overrideContractSigning =
      'Only the team owner or a deal manager can override counsel sign-off.';
    showPanel(waiting);

    await press('Override and send');
    await type('Reason', 'Seller signing today');
    await type('Signer 1 name', 'Zac Clifton');
    await type('Signer 1 email', 'zac@buyer.com');
    await confirmInDialog('Override and send');

    expect(fakeServer.inputsTo('sendContractForSignature')).toEqual([]);
    expect(alerts()).toEqual([
      'Only the team owner or a deal manager can override counsel sign-off.',
    ]);
  });

  it('offers nothing to send once signing is under way or done', () => {
    showPanel({ ...waiting, sendable: false });

    expect(buttonNames()).toEqual([]);
  });
});
