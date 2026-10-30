export function teamDay(at: Date, timeZone: string | null): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone ?? 'UTC',
  }).format(at);
}
