export function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });

    return true;
  } catch {
    return false;
  }
}

function offsetMs(instantMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(instantMs);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)!.value);

  const wallClockAsUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );

  return wallClockAsUtc - Math.floor(instantMs / 1000) * 1000;
}

export function endOfDayIn({
  date,
  timeZone,
}: {
  date: string;
  timeZone: string;
}): string {
  const [year, month, day] = date.split('-').map(Number);
  const endOfDayAsUtc = Date.UTC(year!, month! - 1, day!, 23, 59, 59, 999);
  const firstGuess = endOfDayAsUtc - offsetMs(endOfDayAsUtc, timeZone);

  return new Date(
    endOfDayAsUtc - offsetMs(firstGuess, timeZone),
  ).toISOString();
}
