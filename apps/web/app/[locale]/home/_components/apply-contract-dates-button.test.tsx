// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ApplyContractDatesButton } from './apply-contract-dates-button';
import {
  alerts,
  clearScreen,
  dialogText,
  fakeServer,
  press,
  show,
} from './lender-test-kit';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);
vi.mock('@odb/deal-timeline/apply-contract-dates.ts', async () =>
  (await import('./lender-test-kit')).fakeActions('applyContractDates'),
);

const CONTRACT = '0b5e7c1d-2f43-4a8e-9a51-3c7d2e6f1a22';

function showPreview() {
  show(
    <ApplyContractDatesButton
      contractId={CONTRACT}
      dates={[
        {
          kind: 'closing',
          label: 'Closing',
          from: '2026-11-01',
          to: '2026-12-01',
        },
        {
          kind: 'effective',
          label: 'Effective date',
          from: null,
          to: '2026-12-15',
        },
        {
          kind: 'diligence_end',
          label: 'Diligence end',
          skipped: 'needs an accepted offer',
        },
      ]}
    />,
  );
}

beforeEach(() => fakeServer.reset());
afterEach(clearScreen);

it('previews each date as old to new, and what it skips, before applying anything', async () => {
  showPreview();
  await press('Apply contract dates');

  expect(dialogText()).toContain('Closing Nov 1, 2026 → Dec 1, 2026');
  expect(dialogText()).toContain('Effective date Not set → Dec 15, 2026');
  expect(dialogText()).toContain('Diligence end needs an accepted offer');
  expect(fakeServer.calls).toEqual([]);
});

it('applies the previewed dates on confirm and refreshes', async () => {
  showPreview();
  await press('Apply contract dates');
  await press('Apply dates');

  expect(fakeServer.inputsTo('applyContractDates')).toEqual([
    {
      contractId: CONTRACT,
      previewed: [
        { kind: 'closing', from: '2026-11-01' },
        { kind: 'effective', from: null },
      ],
    },
  ]);
  expect(fakeServer.refreshes).toBe(1);
  expect(dialogText()).toBeNull();
});

it('shows a refusal and reloads the preview when the timeline changed', async () => {
  fakeServer.refusal =
    'Timeline dates changed since you opened this. Review again.';
  showPreview();
  await press('Apply contract dates');
  await press('Apply dates');

  expect(alerts()).toContain(
    'Timeline dates changed since you opened this. Review again.',
  );
  expect(fakeServer.refreshes).toBe(1);
  expect(dialogText()).not.toBeNull();
});
