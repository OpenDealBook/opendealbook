export interface WeekPlan {
  week_no: number;
  theme: string;
  starts_on: string;
}

const WEEK_THEMES = [
  'financials/returns',
  'client list/revenue',
  'staff/HR',
  'systems/leases/licenses/insurance',
  'follow-ups',
  'open items/APA schedules',
];

export function buildWeeks(startDate: string): WeekPlan[] {
  const start = new Date(startDate);

  return WEEK_THEMES.map((theme, index) => ({
    week_no: index + 1,
    theme,
    starts_on: addDays(start, index * 7),
  }));
}

function addDays(date: Date, days: number): string {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);

  return next.toISOString().slice(0, 10);
}
