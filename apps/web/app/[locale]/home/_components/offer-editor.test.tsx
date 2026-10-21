// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  clearScreen,
  dialogText,
  fakeServer,
  field,
  press,
  show,
  type,
} from './lender-test-kit';
import { CreateOfferButton } from './offer-editor';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);
vi.mock('@odb/deals/server', async () =>
  (await import('./lender-test-kit')).fakeActions('createOffer'),
);

beforeEach(() => fakeServer.reset());
afterEach(clearScreen);

it('saves the stated effective date with the offer terms', async () => {
  show(<CreateOfferButton dealId={'deal-1'} />);
  await press('Create offer');
  await type('Purchase price (required)', '1000000');
  await type('Effective date', '2026-12-15');
  await press('Save version');

  expect(fakeServer.inputsTo('createOffer')).toMatchObject([
    { first_version: { terms: { effective_date: '2026-12-15' } } },
  ]);
});

it('saves the stated buyer and seller names with the offer terms', async () => {
  show(<CreateOfferButton dealId={'deal-1'} />);
  await press('Create offer');
  await type('Purchase price (required)', '1000000');
  await type('Buyer name', 'Buyer Holdings LLC');
  await type('Seller name', 'Sol Seller');
  await press('Save version');

  expect(fakeServer.inputsTo('createOffer')).toMatchObject([
    {
      first_version: {
        terms: { buyer_name: 'Buyer Holdings LLC', seller_name: 'Sol Seller' },
      },
    },
  ]);
});

it('shows a refused new offer in the dialog and keeps the typed price', async () => {
  fakeServer.refusal =
    "Read-only members can't draft offers. Ask a deal manager.";
  show(<CreateOfferButton dealId={'deal-1'} />);
  await press('Create offer');
  await type('Purchase price (required)', '1000000');
  await press('Save version');

  expect(dialogText()).toContain(
    "Read-only members can't draft offers. Ask a deal manager.",
  );
  expect(field('Purchase price (required)').value).toBe('1000000');
});
