import { describe, expect, it } from 'vitest';

import { audienceNote } from './audience';

const people = {
  sellers: [{ userId: 'walt', name: 'Walt Brennan' }],
  counsel: [{ userId: 'owen', name: 'Owen Castillo' }],
  buyerTeam: 'Harbor Holdings',
};

describe('audienceNote', () => {
  it('tells the seller who reads the thread, who cannot, and who gets the email', () => {
    expect(audienceNote('walt', people)).toBe(
      'Private to you and Owen Castillo; Harbor Holdings cannot see this. Owen Castillo gets an email.',
    );
  });

  it('tells counsel the same about their client', () => {
    expect(audienceNote('owen', people)).toBe(
      'Private to you and Walt Brennan; Harbor Holdings cannot see this. Walt Brennan gets an email.',
    );
  });

  it('names everyone else on the seller side and emails only the other side', () => {
    expect(
      audienceNote('walt', {
        ...people,
        sellers: [
          ...people.sellers,
          { userId: 'wanda', name: 'Wanda Brennan' },
        ],
        counsel: [...people.counsel, { userId: 'ida', name: 'Ida Park' }],
      }),
    ).toBe(
      'Private to you, Wanda Brennan, Owen Castillo and Ida Park; Harbor Holdings cannot see this. Owen Castillo and Ida Park get an email.',
    );
  });
});
