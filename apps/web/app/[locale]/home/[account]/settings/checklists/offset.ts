export type ChecklistKind = 'offer' | 'diligence' | 'closing' | 'post_close';

export const DIRECTION = { closing: -1, diligence: 1, post_close: 1 } as const;

type OffsetKind = keyof typeof DIRECTION;

const LABELS: Record<OffsetKind, string> = {
  diligence: 'days after LOI signed',
  closing: 'days before close',
  post_close: 'days after close',
};

export function hasOffset(kind: ChecklistKind): kind is OffsetKind {
  return kind !== 'offer';
}

export function storedOffset(kind: OffsetKind, shown: number): number {
  return shown * DIRECTION[kind];
}

export function shownOffset(kind: OffsetKind, stored: number): number {
  return stored * DIRECTION[kind];
}

export function offsetLabel(kind: OffsetKind): string {
  return LABELS[kind];
}
