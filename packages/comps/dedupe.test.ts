import { describe, expect, it } from 'vitest';

import { classifyDuplicates, type DedupeSubject } from './dedupe';

const subject: DedupeSubject = {
  dealId: 'new',
  sourceUrl: 'https://broker.example/listing/42',
  description: 'Established CPA firm',
};

describe('classifyDuplicates', () => {
  it('auto-flags an exact source_url match and raises no candidates', () => {
    const decision = classifyDuplicates(subject, [
      { dealId: 'old', sourceUrl: 'https://broker.example/listing/42', description: 'Different text' },
    ]);
    expect(decision.autoFlag).toEqual({ duplicateOf: 'old', signal: 'source_url' });
    expect(decision.candidates).toEqual([]);
  });

  it('prefers the url auto-flag over a description candidate when both would match', () => {
    const decision = classifyDuplicates(subject, [
      { dealId: 'url-match', sourceUrl: 'https://broker.example/listing/42', description: 'x' },
      { dealId: 'name-match', sourceUrl: null, description: 'Established CPA firm' },
    ]);
    expect(decision.autoFlag?.duplicateOf).toBe('url-match');
    expect(decision.candidates).toEqual([]);
  });

  it('raises a description candidate when no url matches', () => {
    const decision = classifyDuplicates(subject, [
      { dealId: 'name-match', sourceUrl: 'https://broker.example/listing/99', description: '  established cpa firm ' },
    ]);
    expect(decision.autoFlag).toBeNull();
    expect(decision.candidates).toEqual([
      { candidateDealId: 'name-match', signal: 'description', score: 0.5 },
    ]);
  });

  it('does not auto-flag on a blank source_url', () => {
    const decision = classifyDuplicates(
      { dealId: 'new', sourceUrl: '   ', description: 'Established CPA firm' },
      [{ dealId: 'old', sourceUrl: '', description: 'unrelated' }],
    );
    expect(decision.autoFlag).toBeNull();
    expect(decision.candidates).toEqual([]);
  });

  it('returns an empty decision when nothing matches', () => {
    const decision = classifyDuplicates(subject, [
      { dealId: 'old', sourceUrl: 'https://other.example/1', description: 'unrelated' },
    ]);
    expect(decision).toEqual({ autoFlag: null, candidates: [] });
  });
});
