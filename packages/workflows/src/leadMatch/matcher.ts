const LEGAL_SUFFIXES = new Set([
  'llc',
  'inc',
  'incorporated',
  'co',
  'company',
  'corp',
  'corporation',
  'ltd',
  'limited',
  'lp',
  'llp',
  'pllc',
  'pc',
  'plc',
]);

const ABBREVIATIONS: Record<string, string> = {
  mfg: 'manufacturing',
  bros: 'brothers',
  svcs: 'services',
  svc: 'service',
  mgmt: 'management',
  assoc: 'associates',
  intl: 'international',
};

export function normalizeName(name: string): string {
  const words = name
    .toLowerCase()
    .split(/[\s,]+(?:dba|d\/b\/a)\s+/)[0]!
    .replace(/&/g, ' and ')
    .replace(/[.']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => ABBREVIATIONS[word] ?? word);

  if (words[0] === 'the') {
    words.shift();
  }
  while (words.length > 0 && LEGAL_SUFFIXES.has(words.at(-1)!)) {
    words.pop();
  }
  return words.join(' ');
}

export function streetNumber(addressLine1: string | null): string | null {
  return /^\s*(\d+(?:-\d+)?)/.exec(addressLine1 ?? '')?.[1] ?? null;
}

export function postalCode(raw: string | null): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 9) {
    return digits.slice(0, 5);
  }
  if (digits.length === 4 || digits.length === 5) {
    return digits.padStart(5, '0');
  }
  return null;
}

interface AddressedName {
  name: string;
  addressLine1: string | null;
  postalCode: string | null;
}

export function matchBlock(record: Omit<AddressedName, 'name'>): string | null {
  const postal = postalCode(record.postalCode);
  const street = streetNumber(record.addressLine1);
  return postal && street ? `${postal}|${street}|` : null;
}

export function matchKey(record: AddressedName): string | null {
  const block = matchBlock(record);
  const name = normalizeName(record.name);
  return block && name ? block + name : null;
}

function bigrams(text: string): string[] {
  return Array.from({ length: Math.max(text.length - 1, 0) }, (_, i) => text.slice(i, i + 2));
}

export function nameSimilarity(a: string, b: string): number {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (left === right) {
    return 1;
  }
  const remaining = bigrams(right);
  const leftPairs = bigrams(left);
  let shared = 0;
  for (const pair of leftPairs) {
    const at = remaining.indexOf(pair);
    if (at >= 0) {
      remaining.splice(at, 1);
      shared += 1;
    }
  }
  return (2 * shared) / (leftPairs.length + bigrams(right).length);
}

type MatchOutcome = 'link' | 'review' | 'drop';

export function matchOutcome(score: number): MatchOutcome {
  if (score >= 0.9) {
    return 'link';
  }
  return score >= 0.6 ? 'review' : 'drop';
}

export function bestCandidate<Candidate extends { id: string; name: string }>(
  name: string,
  candidates: Candidate[],
): (Candidate & { score: number }) | null {
  return (
    candidates
      .map((candidate) => ({ ...candidate, score: nameSimilarity(name, candidate.name) }))
      .sort((higher, lower) => lower.score - higher.score || higher.id.localeCompare(lower.id))[0] ?? null
  );
}
