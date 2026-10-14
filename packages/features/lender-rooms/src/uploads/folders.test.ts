import { describe, expect, it } from 'vitest';

import { availableFolderName } from './folders';

describe('availableFolderName', () => {
  it('keeps the name when nothing else has it', () => {
    expect(availableFolderName('Forms', ['Other'])).toBe('Forms');
  });

  it('numbers the name from 2 past every taken one', () => {
    expect(availableFolderName('Forms', ['Forms'])).toBe('Forms (2)');
    expect(availableFolderName('Forms', ['Forms', 'Forms (2)'])).toBe(
      'Forms (3)',
    );
  });

  it('treats a name that differs only by case as taken', () => {
    expect(availableFolderName('tax', ['Tax', 'TAX (2)'])).toBe('tax (3)');
  });
});
