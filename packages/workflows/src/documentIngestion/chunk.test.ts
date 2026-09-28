import { describe, expect, it } from 'vitest';

import { chunkMarkdown, estimateTokens } from './chunk';

describe('estimateTokens', () => {
  it('counts roughly four characters per token', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('chunkMarkdown', () => {
  it('returns the document as a single chunk when it fits the token budget', () => {
    const markdown = '# Summary\n\nA short paragraph.';

    expect(chunkMarkdown(markdown)).toEqual([markdown]);
  });

  it('splits an oversized document into overlapping chunks that keep every heading', () => {
    const body = 'x'.repeat(120);
    const markdown = `# Alpha\n${body}\n\n# Beta\n${body}`;
    const overlapTokens = 4;

    const chunks = chunkMarkdown(markdown, { maxTokens: 20, overlapTokens });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((chunk) => chunk.includes('# Alpha'))).toBe(true);
    expect(chunks.some((chunk) => chunk.includes('# Beta'))).toBe(true);

    const overlapChars = overlapTokens * 4;
    for (let index = 1; index < chunks.length; index += 1) {
      const tail = chunks[index - 1]!.slice(-overlapChars);
      expect(chunks[index]!.startsWith(tail)).toBe(true);
    }
  });
});
