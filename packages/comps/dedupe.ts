export interface DedupeSubject {
  dealId: string;
  sourceUrl: string | null;
  description: string | null;
}

export interface DedupeAutoFlag {
  duplicateOf: string;
  signal: 'source_url';
}

export interface DedupeCandidate {
  candidateDealId: string;
  signal: 'description';
  score: number;
}

export interface DedupeDecision {
  autoFlag: DedupeAutoFlag | null;
  candidates: DedupeCandidate[];
}

function normalize(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed === '' ? null : trimmed;
}

export function classifyDuplicates(
  subject: DedupeSubject,
  existing: DedupeSubject[],
): DedupeDecision {
  const subjectUrl = normalize(subject.sourceUrl);
  if (subjectUrl !== null) {
    const match = existing.find((deal) => normalize(deal.sourceUrl) === subjectUrl);
    if (match) {
      return {
        autoFlag: { duplicateOf: match.dealId, signal: 'source_url' },
        candidates: [],
      };
    }
  }

  const subjectName = normalize(subject.description);
  const candidates: DedupeCandidate[] = [];
  if (subjectName !== null) {
    for (const deal of existing) {
      if (normalize(deal.description) === subjectName) {
        candidates.push({ candidateDealId: deal.dealId, signal: 'description', score: 0.5 });
      }
    }
  }

  return { autoFlag: null, candidates };
}
