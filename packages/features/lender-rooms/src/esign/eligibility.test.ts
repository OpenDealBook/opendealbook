import { describe, expect, it } from 'vitest';

import { signatureRequestRefusal, signableKind } from './eligibility';

const requestable = {
  returnRoute: 'esign',
  blankFormName: 'application.pdf',
  signatureStatuses: [],
  formStatus: 'open',
  isRoomOpen: true,
} as const;

describe('which files can be signed electronically', () => {
  it('takes a PDF as it is', () => {
    expect(signableKind('Application.PDF')).toBe('pdf');
  });

  it('treats .docx and legacy .doc as Word files to convert', () => {
    expect(signableKind('guaranty.docx')).toBe('word');
    expect(signableKind('guaranty.DOC')).toBe('word');
  });

  it('has no way to sign a spreadsheet', () => {
    expect(signableKind('rent-roll.xlsx')).toBeNull();
  });
});

describe('whether a signature can be requested for a form', () => {
  it('allows a request for a PDF form on the e-sign route', () => {
    expect(signatureRequestRefusal(requestable)).toBeNull();
  });

  it('refuses a form the lender wants back by upload', () => {
    expect(
      signatureRequestRefusal({ ...requestable, returnRoute: 'upload' }),
    ).toBe(
      'The lender wants this form back as an uploaded file, not by e-signature',
    );
  });

  it('refuses when the current blank form is not a PDF or Word file', () => {
    expect(
      signatureRequestRefusal({
        ...requestable,
        blankFormName: 'rent-roll.xlsx',
      }),
    ).toBe(
      'Only PDF and Word files can be signed. Request a PDF or Word file from the lender',
    );
  });

  it.each(['draft', 'sent'] as const)(
    'refuses while an earlier signature request is still %s',
    (status) => {
      expect(
        signatureRequestRefusal({
          ...requestable,
          signatureStatuses: ['declined', status],
        }),
      ).toBe('This form already has a signature request in progress');
    },
  );

  it.each(['open', 'answered'] as const)(
    'allows a request while the form is %s',
    (formStatus) => {
      expect(
        signatureRequestRefusal({ ...requestable, formStatus }),
      ).toBeNull();
    },
  );

  it.each(['withdrawn', 'closed'] as const)(
    'refuses when the form is %s',
    (formStatus) => {
      expect(signatureRequestRefusal({ ...requestable, formStatus })).toBe(
        `This form is ${formStatus}, so a signature cannot be requested for it`,
      );
    },
  );

  it('refuses when the lender room is not open', () => {
    expect(signatureRequestRefusal({ ...requestable, isRoomOpen: false })).toBe(
      'This lender room is closed, so a signature cannot be requested for its forms',
    );
  });

  it('allows a new request once every earlier one was declined, expired or completed', () => {
    expect(
      signatureRequestRefusal({
        ...requestable,
        signatureStatuses: ['declined', 'expired', 'completed'],
      }),
    ).toBeNull();
  });
});
