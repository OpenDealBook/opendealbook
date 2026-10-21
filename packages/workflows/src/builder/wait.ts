import type { NodeConfig } from './graph';
import { wallClockParts } from './wallClock';

const UNIT_MS = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };
const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

function offsetMs(at: number, timeZone: string): number {
  const parts = wallClockParts(new Date(at), timeZone);
  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - at
  );
}

function nineInTheMorning(date: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const nineUtc = Date.UTC(year!, month! - 1, day!, 9);
  const guess = nineUtc - offsetMs(nineUtc, timeZone);
  return new Date(nineUtc - offsetMs(guess, timeZone));
}

export function wakeAt(config: NodeConfig<'wait'>, startedAt: Date, timeZone: string): Date {
  if (config.kind === 'duration') {
    return new Date(startedAt.getTime() + config.amount * UNIT_MS[config.unit]);
  }
  return PLAIN_DATE.test(config.until)
    ? nineInTheMorning(config.until, timeZone)
    : new Date(config.until);
}
