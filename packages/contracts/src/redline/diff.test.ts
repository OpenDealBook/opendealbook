import { describe, expect, it } from 'vitest';

import { diffVersions, summarizeTurn } from './diff';

describe('diffVersions', () => {
  it('marks every token unchanged when both sides match', () => {
    expect(diffVersions('the purchase price', 'the purchase price')).toEqual([
      { type: 'unchanged', text: 'the purchase price' },
    ]);
  });

  it('emits removed and added segments around an edit', () => {
    expect(diffVersions('the quick fox', 'the slow fox')).toEqual([
      { type: 'unchanged', text: 'the' },
      { type: 'removed', text: 'quick' },
      { type: 'added', text: 'slow' },
      { type: 'unchanged', text: 'fox' },
    ]);
  });

  it('treats an empty left side as fully added', () => {
    expect(diffVersions('', 'brand new clause')).toEqual([
      { type: 'added', text: 'brand new clause' },
    ]);
  });
});

describe('summarizeTurn', () => {
  it('passes the manual change summary through unchanged', () => {
    expect(summarizeTurn('Raised the earnest deposit')).toBe(
      'Raised the earnest deposit',
    );
  });
});
