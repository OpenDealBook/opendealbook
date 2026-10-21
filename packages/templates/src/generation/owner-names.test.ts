import { describe, expect, it } from 'vitest';

import { formatOwnerNames } from './owner-names';

describe('formatOwnerNames', () => {
  it('joins owner names the way a letter names people', () => {
    expect(formatOwnerNames([])).toBe('');
    expect(formatOwnerNames(['Pat Owner'])).toBe('Pat Owner');
    expect(formatOwnerNames(['Pat Owner', 'Sam Owner'])).toBe(
      'Pat Owner and Sam Owner',
    );
    expect(formatOwnerNames(['Pat Owner', 'Sam Owner', 'Lee Owner'])).toBe(
      'Pat Owner, Sam Owner and Lee Owner',
    );
  });
});
