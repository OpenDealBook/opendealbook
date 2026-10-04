export function summarizeBuckets(
  rows: { n: number | null }[],
): { buckets: number; contributions: number } {
  return {
    buckets: rows.length,
    contributions: rows.reduce((total, row) => total + (row.n ?? 0), 0),
  };
}
