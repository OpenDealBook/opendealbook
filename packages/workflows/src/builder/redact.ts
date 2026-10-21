const EMAIL = /[\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi;
const PHONE = new RegExp(
  String.raw`(?:\+\d{1,3}(?:[\s.-]?\(?\d{1,4}\)?){2,5}` +
    String.raw`|(?:\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b` +
    String.raw`|(?<![\d$.,])\b1?\d{10}\b(?![.,]\d))` +
    String.raw`(?:\s*(?:ext\.?|x)\s*\d{1,6}\b)?`,
  'gi',
);
const MIN_NAME_PART_LETTERS = 3;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nameTerms(names: string[]): string[] {
  const terms = names.flatMap((name) => [
    name,
    ...name
      .split(/\s+/)
      .filter((part) => (part.match(/\p{L}/gu) ?? []).length >= MIN_NAME_PART_LETTERS),
  ]);
  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
}

export function redactPeople(text: string, names: string[]): string {
  const redacted = text.replace(EMAIL, '[email]').replace(PHONE, '[phone]');
  const terms = nameTerms(names);
  if (terms.length === 0) {
    return redacted;
  }
  const people = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${terms.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`,
    'giu',
  );
  return redacted.replace(people, '[name]');
}
