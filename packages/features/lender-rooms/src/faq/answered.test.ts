import { describe, expect, it } from 'vitest';

import { canAddToFaq } from './answered';

describe('which asks can be added to the FAQ', () => {
  const ourReply = [{ side: 'lender' as const }, { side: 'internal' as const }];
  const lenderOnly = [{ side: 'lender' as const }];

  it('takes an answered ask', () => {
    expect(canAddToFaq({ status: 'answered', messages: lenderOnly })).toBe(
      true,
    );
  });

  it('takes a closed ask only when we replied to it', () => {
    expect(canAddToFaq({ status: 'closed', messages: ourReply })).toBe(true);
    expect(canAddToFaq({ status: 'closed', messages: lenderOnly })).toBe(false);
  });

  it('does not take an ask still waiting on us or withdrawn', () => {
    expect(canAddToFaq({ status: 'open', messages: ourReply })).toBe(false);
    expect(canAddToFaq({ status: 'withdrawn', messages: ourReply })).toBe(
      false,
    );
  });
});
