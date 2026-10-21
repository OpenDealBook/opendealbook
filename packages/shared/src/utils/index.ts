export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function plainDate(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    dateStyle: 'medium',
  });
}
