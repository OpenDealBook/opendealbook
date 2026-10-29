import { normalizeName } from '../leadMatch/matcher';

const MIN_NAME_PART_LETTERS = 3;

export function nameTerms(names: string[], minPartLetters = MIN_NAME_PART_LETTERS): string[] {
  const terms = names.flatMap((name) => [
    name,
    ...name
      .split(/\s+/)
      .filter((part) => (part.match(/\p{L}/gu) ?? []).length >= minPartLetters),
  ]);
  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
}

function comparable(word: string): string {
  return normalizeName(word.normalize('NFD').replace(/\p{M}/gu, '').replace(/[’‘`]/g, "'"));
}

function wordsOf(text: string) {
  return [...text.matchAll(/[\p{L}\p{M}\p{N}'’‘`.]+|&/gu)]
    .map((match) => ({ start: match.index, end: match.index + match[0].length, word: comparable(match[0]) }))
    .filter((token) => token.word !== '');
}

export function maskTerms(text: string, terms: { term: string; mask: string }[]): string {
  const patterns = terms
    .map(({ term, mask }) => ({ words: wordsOf(term).map((token) => token.word), mask }))
    .filter((pattern) => pattern.words.length > 0)
    .sort((a, b) => b.words.length - a.words.length);
  const tokens = wordsOf(text);
  let masked = '';
  let cursor = 0;
  for (let index = 0; index < tokens.length; ) {
    const hit = patterns.find((pattern) => pattern.words.every((word, offset) => tokens[index + offset]?.word === word));
    if (!hit) {
      index += 1;
      continue;
    }
    masked += text.slice(cursor, tokens[index]!.start) + hit.mask;
    cursor = tokens[index + hit.words.length - 1]!.end;
    index += hit.words.length;
  }
  return masked + text.slice(cursor);
}
