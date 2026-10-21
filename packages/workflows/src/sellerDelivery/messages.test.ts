import { describe, expect, it } from 'vitest';

import { sellerDeliveryFailedMessage } from './messages';

describe('sellerDeliveryFailedMessage', () => {
  it('names the seller and says delivery gave up after five attempts', () => {
    expect(
      sellerDeliveryFailedMessage({
        recipientName: 'Sam Seller',
        recipientEmail: 'sam@seller.test',
      }),
    ).toBe(
      'Sam Seller (sam@seller.test) did not get the document you sent. Delivery failed after 5 attempts.',
    );
  });
});
