import { describe, expect, it } from 'vitest';

import { renderCounselSignInEmail } from '../emails/counsel-sign-in.email';
import { renderLenderSignInEmail } from '../emails/lender-sign-in.email';
import { renderSellerSignInEmail } from '../emails/seller-sign-in.email';

const LINK =
  'https://opendealbook.app/seller/confirm?token_hash=abc&type=magiclink&next=%2Fseller';

describe('sign-in emails', () => {
  it('names the deal in the seller sign-in subject and speaks of the room', async () => {
    const email = await renderSellerSignInEmail({
      productName: 'Open Deal Book',
      deals: [
        {
          name: 'Brennan Climate Services',
          outsideName: 'Brennan Climate Services',
        },
      ],
      signInLink: LINK,
    });

    expect(email.subject).toBe(
      'Your sign-in link for Brennan Climate Services',
    );
    expect(email.text).toContain('room');
    expect(email.text).not.toMatch(/document/i);
  });

  it('names the deal in the counsel sign-in subject and never says invited', async () => {
    const email = await renderCounselSignInEmail({
      productName: 'Open Deal Book',
      deals: [
        {
          name: 'Brennan Climate Services',
          outsideName: 'Brennan Climate Services',
        },
      ],
      signInLink: LINK,
    });

    expect(email.subject).toBe(
      'Your sign-in link for Brennan Climate Services',
    );
    expect(email.text).not.toMatch(/invited/i);
    expect(email.text).toContain(LINK);
  });

  it('names every deal when a sign-in link opens several', async () => {
    const email = await renderCounselSignInEmail({
      productName: 'Open Deal Book',
      deals: [
        {
          name: 'Brennan Climate Services',
          outsideName: 'Brennan Climate Services',
        },
        { name: 'Harbor Marine', outsideName: 'Harbor Marine' },
      ],
      signInLink: LINK,
    });

    expect(email.subject).toBe(
      'Your sign-in link for Brennan Climate Services and Harbor Marine',
    );
  });

  it.each([
    [
      'seller',
      () =>
        renderSellerSignInEmail({
          productName: 'Open Deal Book',
          deals: [
            {
              name: 'Brennan Climate Services',
              outsideName: 'Brennan Climate Services',
            },
          ],
          signInLink: LINK,
        }),
    ],
    [
      'counsel',
      () =>
        renderCounselSignInEmail({
          productName: 'Open Deal Book',
          deals: [
            {
              name: 'Brennan Climate Services',
              outsideName: 'Brennan Climate Services',
            },
          ],
          signInLink: LINK,
        }),
    ],
    [
      'lender',
      () =>
        renderLenderSignInEmail({
          productName: 'Open Deal Book',
          signInLink: LINK,
        }),
    ],
  ])(
    'wraps the %s fallback link so it fits a phone screen',
    async (_who, render) => {
      const { html } = await render();
      const fallback = html.match(
        /<a[^>]*style="([^"]*)"[^>]*>https:\/\/opendealbook\.app/,
      );

      expect(fallback?.[1]).toContain('word-break:break-all');
    },
  );
});
