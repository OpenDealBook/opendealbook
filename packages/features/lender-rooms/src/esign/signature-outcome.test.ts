import { describe, expect, it } from 'vitest';

import { signatureTransition } from './signature-outcome';

const statusAfter = (...args: Parameters<typeof signatureTransition>) =>
  signatureTransition(...args)?.to ?? null;

describe('what the state Documenso reports does to a lender form signature', () => {
  it('moves a draft to sent once the document has left draft', () => {
    expect(statusAfter('draft', 'sent')).toBe('sent');
  });

  it.each(['draft', 'sent'] as const)(
    'settles a %s signature when the document is completed, rejected, cancelled, expired or gone',
    (current) => {
      expect(statusAfter(current, 'completed')).toBe('completed');
      expect(statusAfter(current, 'rejected')).toBe('declined');
      expect(statusAfter(current, 'cancelled')).toBe('declined');
      expect(statusAfter(current, 'missing')).toBe('declined');
      expect(statusAfter(current, 'expired')).toBe('expired');
    },
  );

  it.each(['declined', 'expired'] as const)(
    'records a completion that arrives after we recorded %s',
    (current) => {
      expect(statusAfter(current, 'completed')).toBe('completed');
    },
  );

  it.each([
    ['draft', 'draft'],
    ['sent', 'sent'],
    ['sent', 'draft'],
    ['declined', 'sent'],
    ['declined', 'rejected'],
    ['declined', 'missing'],
    ['expired', 'expired'],
    ['expired', 'cancelled'],
    ['completed', 'sent'],
    ['completed', 'completed'],
    ['completed', 'rejected'],
    ['completed', 'cancelled'],
    ['completed', 'expired'],
    ['completed', 'missing'],
  ] as const)(
    'leaves a %s signature alone when the document is %s',
    (current, state) => {
      expect(statusAfter(current, state)).toBeNull();
    },
  );

  it.each(['missing', 'sent', 'completed', 'rejected', 'expired'] as const)(
    'leaves a request we cancelled alone when the document is %s',
    (state) => {
      expect(statusAfter('cancelled', state)).toBeNull();
    },
  );

  it('only lets a completion overwrite a settled status when it is written', () => {
    expect(signatureTransition('sent', 'completed')?.from).toEqual([
      'draft',
      'sent',
      'declined',
      'expired',
    ]);
    expect(signatureTransition('draft', 'sent')?.from).toEqual(['draft']);
    expect(signatureTransition('sent', 'rejected')?.from).toEqual([
      'draft',
      'sent',
    ]);
  });
});
