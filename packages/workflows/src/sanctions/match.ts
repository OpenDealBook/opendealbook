import { z } from 'zod';

import { normalizeName } from '../leadMatch/matcher';

export const SCREENING_THRESHOLD = 0.85;

export interface ScreeningSubject {
  key: string;
  name: string;
  kind: 'business' | 'person';
}

export interface ScreeningCandidate {
  subjectKey: string;
  source: 'sanctions';
  listName: string;
  sourceEntryId: string;
  entryName: string;
  matchedName: string;
  score: number;
  programs: string[];
  url: string;
  entryType: string | null;
  countries: string[];
  altNames: string[];
  raw: unknown;
}

const SCREENED_TYPE = { person: 'individual', business: 'entity' } as const;

const FOREIGN_LEGAL_FORMS = [
  'public joint stock company',
  'open joint stock company',
  'closed joint stock company',
  'joint stock company',
  'limited liability company',
  'jsc',
  'ojsc',
  'cjsc',
  'pjsc',
  'oao',
  'ooo',
  'zao',
  'pao',
  'ao',
  'tov',
  'gmbh',
  'ag',
  'sa',
  'sarl',
  'srl',
  'spa',
  'bv',
  'nv',
  'fze',
  'fzco',
  'fzc',
  'sdn bhd',
  'bhd',
  'pte',
  'pvt',
].map((form) => form.split(' '));

function withoutLegalForms(words: string[]): string[] {
  for (const form of FOREIGN_LEGAL_FORMS) {
    if (form.every((word, i) => words[i] === word)) {
      return withoutLegalForms(words.slice(form.length));
    }
    if (form.every((word, i) => words.at(i - form.length) === word)) {
      return withoutLegalForms(words.slice(0, -form.length));
    }
  }
  return words;
}

function words(name: string): string[] {
  return normalizeName(name.normalize('NFKD').replace(/\p{M}/gu, '')).split(' ');
}

function businessName(name: string): string {
  return withoutLegalForms(words(name)).join(' ');
}

function sortedWords(name: string): string {
  return words(name).sort().join(' ');
}

function bigramCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < text.length - 1; i++) {
    const pair = text.slice(i, i + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
}

export function screeningScore(a: string, b: string): number {
  const left = sortedWords(a);
  const right = sortedWords(b);
  if (left === '' || right === '') {
    return 0;
  }
  if (left === right) {
    return 1;
  }
  const rightPairs = bigramCounts(right);
  let shared = 0;
  for (const [pair, count] of bigramCounts(left)) {
    shared += Math.min(count, rightPairs.get(pair) ?? 0);
  }
  const pairs = left.length + right.length - 2;
  return pairs === 0 ? 0 : (2 * shared) / pairs;
}

export const SCREENED_ENTRY = z.object({
  list_name: z.string(),
  source_entry_id: z.string(),
  name: z.string(),
  alt_names: z.array(z.string()),
  entry_type: z.string().nullable(),
  countries: z.array(z.string()),
  programs: z.array(z.string()),
  source_url: z.string(),
  raw: z.unknown(),
});

export type ScreenedEntry = z.infer<typeof SCREENED_ENTRY>;

export function matchSubjects(
  subjects: ScreeningSubject[],
  entries: ScreenedEntry[],
): ScreeningCandidate[] {
  return subjects.flatMap((subject) => {
    const comparable =
      subject.kind === 'business' ? businessName : (name: string) => name;
    return entries
      .filter(
        (entry) =>
          entry.entry_type === null ||
          entry.entry_type === SCREENED_TYPE[subject.kind],
      )
      .flatMap((entry) => {
      const [best] = [entry.name, ...entry.alt_names]
        .map((name) => ({
          name,
          score: screeningScore(comparable(subject.name), comparable(name)),
        }))
        .sort((higher, lower) => lower.score - higher.score);
      if (best!.score < SCREENING_THRESHOLD) {
        return [];
      }
      return [
        {
          subjectKey: subject.key,
          source: 'sanctions' as const,
          listName: entry.list_name,
          sourceEntryId: entry.source_entry_id,
          entryName: entry.name,
          matchedName: best!.name,
          score: best!.score,
          programs: entry.programs,
          url: entry.source_url,
          entryType: entry.entry_type,
          countries: entry.countries,
          altNames: entry.alt_names,
          raw: entry.raw,
        },
      ];
    });
  });
}
