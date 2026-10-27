const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface Snapshot {
  startedAt: string;
  entries: number;
}

export function isLoaded(current: Snapshot | null): current is Snapshot {
  return current !== null && current.entries > 0;
}

export function screeningListSkip(current: Snapshot | null, now: Date): string | null {
  if (!isLoaded(current)) {
    return 'The sanctions list is not loaded yet';
  }
  if (now.getTime() - new Date(current.startedAt).getTime() > MAX_AGE_MS) {
    return 'The sanctions list is out of date';
  }
  return null;
}
