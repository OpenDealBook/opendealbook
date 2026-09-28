export type DiffSegmentType = 'unchanged' | 'added' | 'removed';

export interface DiffSegment {
  type: DiffSegmentType;
  text: string;
}

interface TokenOp {
  type: DiffSegmentType;
  token: string;
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((token) => token.length > 0);
}

function diffTokens(left: string[], right: string[]): TokenOp[] {
  const m = left.length;
  const n = right.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i]![j] =
        left[i] === right[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const ops: TokenOp[] = [];
  let i = 0;
  let j = 0;

  while (i < m && j < n) {
    if (left[i] === right[j]) {
      ops.push({ type: 'unchanged', token: left[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ type: 'removed', token: left[i]! });
      i++;
    } else {
      ops.push({ type: 'added', token: right[j]! });
      j++;
    }
  }

  while (i < m) {
    ops.push({ type: 'removed', token: left[i++]! });
  }

  while (j < n) {
    ops.push({ type: 'added', token: right[j++]! });
  }

  return ops;
}

function mergeSegments(ops: TokenOp[]): DiffSegment[] {
  const segments: DiffSegment[] = [];

  for (const op of ops) {
    const last = segments[segments.length - 1];

    if (last && last.type === op.type) {
      last.text = `${last.text} ${op.token}`;
    } else {
      segments.push({ type: op.type, text: op.token });
    }
  }

  return segments;
}

export function diffVersions(
  leftText: string,
  rightText: string,
): DiffSegment[] {
  return mergeSegments(diffTokens(tokenize(leftText), tokenize(rightText)));
}

export function summarizeTurn(changeSummary: string): string {
  return changeSummary;
}
