import { localDateAndHour } from '@odb/lender-rooms/crm/nudges-surface/daily-email.ts';

const SEND_HOUR = 8;
const DAILY_BUSINESS_DAYS = 5;

export type ReviewNudge = 'remind' | 'escalate';

function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);

  return day.toISOString().slice(0, 10);
}

function isBusinessDay(date: string): boolean {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();

  return weekday !== 0 && weekday !== 6;
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 86_400_000;
}

export function reviewNudgeDue(
  requestedAt: string,
  now: Date,
  timeZone: string,
): ReviewNudge | null {
  const today = localDateAndHour(now, timeZone);
  if (today.hour !== SEND_HOUR) {
    return null;
  }

  const requestDay = localDateAndHour(new Date(requestedAt), timeZone).date;
  let escalationDay = requestDay;
  for (let businessDays = 0; businessDays <= DAILY_BUSINESS_DAYS; ) {
    escalationDay = addDays(escalationDay, 1);
    businessDays += isBusinessDay(escalationDay) ? 1 : 0;
  }

  if (today.date === escalationDay) {
    return 'escalate';
  }
  if (today.date < escalationDay) {
    return today.date > requestDay && isBusinessDay(today.date) ? 'remind' : null;
  }

  return daysBetween(escalationDay, today.date) % 7 === 0 ? 'remind' : null;
}
