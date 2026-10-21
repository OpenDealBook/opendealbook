// @vitest-environment jsdom
import type { ComponentProps } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  alerts,
  button,
  buttonNames,
  clearScreen,
  dialogText,
  fakeServer,
  linkTo,
  links,
  pageText,
  press,
  show,
} from './lender-test-kit';
import { OfferLifecycleActions } from './offer-editor';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);
vi.mock('@odb/deals/server', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'generateLoi',
    'generateApa',
    'checkContractSignatureStatus',
  ),
);

const both = { loi: true, apa: true };
const OFFER = '5d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';

type Signatures = ComponentProps<typeof OfferLifecycleActions>['signatures'];

function showOffer(signatures: Signatures) {
  show(
    <OfferLifecycleActions
      offerId={OFFER}
      status={'accepted'}
      dealId={'deal-1'}
      nextNumber={2}
      loiGatePassed
      loiAccepted
      signatures={signatures}
    />,
  );
}

beforeEach(() => fakeServer.reset());

afterEach(clearScreen);

describe('LOI and APA signature requests on an accepted offer', () => {
  it('offers no revision, submit, accept, reject, or withdraw on an accepted offer', () => {
    showOffer({ loi: null, apa: null, canGenerate: both });

    expect(buttonNames()).toEqual(['Generate LOI', 'Generate APA']);
  });

  it('generates the LOI as a new version without asking who signs it', async () => {
    showOffer({ loi: null, apa: null, canGenerate: both });

    await press('Generate LOI');

    expect(dialogText()).toBeNull();
    expect(fakeServer.inputsTo('generateLoi')).toEqual([{ offer_id: OFFER }]);
    expect(fakeServer.refreshes).toBe(1);
    expect(pageText()).toContain(
      'Review and send it for signature under Contracts.',
    );
  });

  it('does the same for the APA', async () => {
    showOffer({ loi: null, apa: null, canGenerate: both });

    await press('Generate APA');

    expect(fakeServer.inputsTo('generateApa')).toEqual([{ offer_id: OFFER }]);
  });

  it('shows a refusal as given', async () => {
    fakeServer.refusal = 'whatever the server says';
    showOffer({ loi: null, apa: null, canGenerate: both });

    await press('Generate LOI');

    expect(alerts()).toEqual(['whatever the server says']);
    expect(fakeServer.refreshes).toBe(0);
  });

  it('shows the Documenso link and status of a draft request and checks it', async () => {
    showOffer({
      loi: {
        contractVersionId: 'loi-version',
        signingStatus: 'draft',
        editorUrl: 'https://documenso.test/documents/5/edit',
      },
      apa: null,
      canGenerate: both,
    });

    expect(linkTo('Open in Documenso to place signature fields')).toBe(
      'https://documenso.test/documents/5/edit',
    );
    expect(pageText()).toContain(
      'LOI: Draft in Documenso, not yet out for signature',
    );

    await press('Check LOI signature status');

    expect(fakeServer.inputsTo('checkContractSignatureStatus')).toEqual([
      { contract_version_id: 'loi-version' },
    ]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('shows why the status could not be checked', async () => {
    fakeServer.refusal = 'whatever the server says';
    showOffer({
      loi: {
        contractVersionId: 'loi-version',
        signingStatus: 'sent',
        editorUrl: null,
      },
      apa: null,
      canGenerate: both,
    });

    await press('Check LOI signature status');

    expect(alerts()).toEqual(['whatever the server says']);
    expect(fakeServer.refreshes).toBe(0);
  });

  it('shows a finished request in the same words as a lender form, with nothing left to check or cancel', () => {
    showOffer({
      loi: {
        contractVersionId: 'loi-version',
        signingStatus: 'completed',
        editorUrl: null,
      },
      apa: {
        contractVersionId: 'apa-version',
        signingStatus: 'sent',
        editorUrl: null,
      },
      canGenerate: { loi: false, apa: false },
    });

    expect(button('Generate LOI').disabled).toBe(true);
    expect(button('Generate APA').disabled).toBe(true);
    expect(pageText()).toContain('LOI: Signed');
    expect(pageText()).toContain('APA: Out for signature');
    expect(links()).toEqual([]);
    expect(buttonNames()).not.toContain('Check LOI signature status');
    expect(buttonNames()).toContain('Check APA signature status');
    expect(buttonNames()).not.toContain('Cancel signature request');
  });
});
