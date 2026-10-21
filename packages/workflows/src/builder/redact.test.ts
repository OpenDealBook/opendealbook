import { describe, expect, it } from 'vitest';

import { redactPeople } from './redact';

describe('redactPeople', () => {
  it('removes emails, phone numbers and the named people, case-insensitively', () => {
    const text =
      'Call Dana Whitfield at (555) 201-3344 or +1 555.201.9988, email dana.w@example-firm.com. dana whitfield owns it.';

    expect(redactPeople(text, ['Dana Whitfield'])).toBe(
      'Call [name] at [phone] or [phone], email [email]. [name] owns it.',
    );
  });

  it('removes each first and last name of three or more letters as whole words', () => {
    const text = 'Dana said Whitfield agreed; Danash and Whitfields are other people. Al Bo and Al left.';

    expect(redactPeople(text, ['Dana Whitfield', 'Al Bo'])).toBe(
      '[name] said [name] agreed; Danash and Whitfields are other people. [name] and Al left.',
    );
  });

  it('prefers the longest known name', () => {
    expect(redactPeople('Ann Marie Lee and Ann met', ['Ann Lee', 'Ann Marie Lee'])).toBe(
      '[name] and [name] met',
    );
  });

  it('matches names with accents and hyphens as whole words', () => {
    expect(redactPeople('Ask José Brennan-Fisk or brennan-fisk.', ['José Brennan-Fisk'])).toBe(
      'Ask [name] or [name].',
    );
  });

  it('removes unformatted, international and extension phone numbers', () => {
    const text =
      'Cell 5552013344, UK +44 20 7946 0958, desk 555-201-3344 ext. 204, office (555) 201-3344 x12, +15552013344.';

    expect(redactPeople(text, [])).toBe(
      'Cell [phone], UK [phone], desk [phone], office [phone], [phone].',
    );
  });

  it('leaves revenue figures, years, EINs and counts alone', () => {
    const text =
      'Revenue $2500000000 or $2,500,000,000, SDE 1,250,000, 4200000 in 2024, EIN 12-3456789, 42 staff, 2500000000.50 total.';

    expect(redactPeople(text, [])).toBe(text);
  });

  it('treats a name as literal text, not a pattern', () => {
    expect(redactPeople('Mr. O.K. (Jr) said hi; MrXOXK said no', ['Mr. O.K. (Jr)'])).toBe(
      '[name] said hi; MrXOXK said no',
    );
  });
});
