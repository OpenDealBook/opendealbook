// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  alerts,
  attach,
  choose,
  clearScreen,
  dialogText,
  fakeServer,
  press,
  show,
  submit,
  type,
} from './lender-test-kit';
import { RecordSignedContract } from './record-signed-contract';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);
vi.mock('@odb/deals/server', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'recordContractSignedElsewhere',
  ),
);

beforeEach(() => fakeServer.reset());

afterEach(clearScreen);

async function fillIn() {
  await press('Record signed APA');
  await attach('Signed copy', 'APA signed.pdf');
  await type('Signing date', '2026-10-02');
  await choose('Seller');
}

describe('recording a contract signed outside the platform', () => {
  it('records the signed copy, its signing date and side against the contract', async () => {
    show(
      <RecordSignedContract
        dealId={'deal-1'}
        type={'apa'}
        contractId={'contract-1'}
      />,
    );

    await fillIn();
    await submit('Signed copy');

    expect(fakeServer.inputsTo('recordContractSignedElsewhere')).toEqual([
      {
        deal_id: 'deal-1',
        type: 'apa',
        contract_id: 'contract-1',
        party: 'seller',
        signed_on: '2026-10-02',
        file: expect.objectContaining({ name: 'APA signed.pdf' }),
      },
    ]);
    expect(dialogText()).toBeNull();
    expect(fakeServer.refreshes).toBe(1);
  });

  it('records a contract the deal does not have yet', async () => {
    show(<RecordSignedContract dealId={'deal-1'} type={'apa'} contractId={null} />);

    await fillIn();
    await submit('Signed copy');

    expect(fakeServer.inputsTo('recordContractSignedElsewhere')).toMatchObject([
      { contract_id: null },
    ]);
  });

  it('says why when the record is refused and keeps the dialog open', async () => {
    fakeServer.refusal = 'The signing date cannot be in the future';
    show(
      <RecordSignedContract
        dealId={'deal-1'}
        type={'apa'}
        contractId={'contract-1'}
      />,
    );

    await fillIn();
    await submit('Signed copy');

    expect(alerts()).toEqual(['The signing date cannot be in the future']);
    expect(dialogText()).toContain('Record signed APA');
  });
});
