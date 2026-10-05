export function trendBarHeights(values: (number | null)[]): (number | null)[] {
  const maxMagnitude = values.reduce<number>(
    (max, value) => (value === null ? max : Math.max(max, Math.abs(value))),
    0,
  );

  return values.map((value) => {
    if (value === null) {
      return null;
    }

    return maxMagnitude === 0 ? 0 : (Math.abs(value) / maxMagnitude) * 100;
  });
}
