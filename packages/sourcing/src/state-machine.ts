export type FirmStatus =
  | 'imported'
  | 'enriched'
  | 'scored'
  | 'contacted'
  | 'responded'
  | 'deal_created'
  | 'disqualified';

const TRANSITIONS: Record<FirmStatus, readonly FirmStatus[]> = {
  imported: ['enriched'],
  enriched: ['scored'],
  scored: ['contacted'],
  contacted: ['responded'],
  responded: ['deal_created', 'disqualified'],
  deal_created: [],
  disqualified: [],
};

export function nextStates(from: FirmStatus): readonly FirmStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: FirmStatus, to: FirmStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
