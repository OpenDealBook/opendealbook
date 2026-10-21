import type { CalendarSpec, ScheduleSpec } from '@temporalio/client';

import { describe, expect, it } from 'vitest';

import { scheduleSpec } from './schedule';
import { localWallTime } from './scheduleWorkflow';

const MONTHS = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
];
const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

type Field = CalendarSpec['hour'] | CalendarSpec['month'] | CalendarSpec['dayOfWeek'];

function fieldMatches(field: Field, value: number, names: string[] = []): boolean {
  if (field === undefined || field === '*') {
    return true;
  }
  const index = (bound: string | number) =>
    typeof bound === 'number' ? bound : names.indexOf(bound) + (names === MONTHS ? 1 : 0);
  return (Array.isArray(field) ? field : [field]).some((range) => {
    if (typeof range !== 'object') {
      return index(range) === value;
    }
    const start = index(range.start);
    const end = range.end === undefined ? start : index(range.end);
    return value >= start && value <= end && (value - start) % (range.step ?? 1) === 0;
  });
}

function calendarMatches(calendar: CalendarSpec, at: Date): boolean {
  return (
    fieldMatches(calendar.year, at.getUTCFullYear()) &&
    fieldMatches(calendar.month, at.getUTCMonth() + 1, MONTHS) &&
    fieldMatches(calendar.dayOfMonth, at.getUTCDate()) &&
    fieldMatches(calendar.dayOfWeek, at.getUTCDay(), WEEKDAYS) &&
    fieldMatches(calendar.hour ?? 0, at.getUTCHours()) &&
    fieldMatches(calendar.minute ?? 0, at.getUTCMinutes())
  );
}

function localFireTimes(spec: ScheduleSpec, from: string, to: string): string[] {
  const fires: string[] = [];
  for (let at = new Date(`${from}T00:00Z`); at < new Date(`${to}T00:00Z`); at = new Date(at.getTime() + 60_000)) {
    if (
      spec.calendars!.some((calendar) => calendarMatches(calendar, at)) &&
      !(spec.skip ?? []).some((calendar) => calendarMatches(calendar, at))
    ) {
      fires.push(at.toISOString().slice(0, 16).replace('T', ' '));
    }
  }
  return fires;
}

const monthly = (day: number) =>
  scheduleSpec({ every: 'month', day, at: '09:15' }, 'America/Chicago');

describe('scheduleSpec', () => {
  it('reads every calendar time in the team timezone', () => {
    expect(scheduleSpec({ every: 'day', at: '17:45' }, 'America/Chicago').timezone).toBe(
      'America/Chicago',
    );
  });

  it('fires every day at the given time', () => {
    expect(
      localFireTimes(scheduleSpec({ every: 'day', at: '17:45' }, 'UTC'), '2027-03-01', '2027-03-04'),
    ).toEqual(['2027-03-01 17:45', '2027-03-02 17:45', '2027-03-03 17:45']);
  });

  it('fires on the given weekday at the given time', () => {
    expect(
      localFireTimes(
        scheduleSpec({ every: 'week', weekday: 'monday', at: '08:30' }, 'UTC'),
        '2027-03-01',
        '2027-03-22',
      ),
    ).toEqual(['2027-03-01 08:30', '2027-03-08 08:30', '2027-03-15 08:30']);
  });

  it('fires every few hours from midnight on the hour', () => {
    expect(
      localFireTimes(scheduleSpec({ every: 'hours', hours: 6 }, 'UTC'), '2027-03-01', '2027-03-02'),
    ).toEqual(['2027-03-01 00:00', '2027-03-01 06:00', '2027-03-01 12:00', '2027-03-01 18:00']);
  });

  it('fires every 24 hours at midnight', () => {
    expect(
      localFireTimes(scheduleSpec({ every: 'hours', hours: 24 }, 'UTC'), '2027-03-01', '2027-03-03'),
    ).toEqual(['2027-03-01 00:00', '2027-03-02 00:00']);
  });

  it('fires on the given day of every month', () => {
    expect(localFireTimes(monthly(15), '2027-01-01', '2027-04-01')).toEqual([
      '2027-01-15 09:15',
      '2027-02-15 09:15',
      '2027-03-15 09:15',
    ]);
  });

  it('fires on the 31st, or on the last day of a shorter month', () => {
    expect(localFireTimes(monthly(31), '2027-01-01', '2027-07-01')).toEqual([
      '2027-01-31 09:15',
      '2027-02-28 09:15',
      '2027-03-31 09:15',
      '2027-04-30 09:15',
      '2027-05-31 09:15',
      '2027-06-30 09:15',
    ]);
  });

  it('fires on the 30th, or on the last day of February', () => {
    expect(localFireTimes(monthly(30), '2027-01-01', '2027-05-01')).toEqual([
      '2027-01-30 09:15',
      '2027-02-28 09:15',
      '2027-03-30 09:15',
      '2027-04-30 09:15',
    ]);
  });

  it.each([29, 30, 31])('fires once on February 29 in a leap year for day %i', (day) => {
    expect(localFireTimes(monthly(day), '2028-02-01', '2028-03-01')).toEqual(['2028-02-29 09:15']);
  });

  it('fires on February 28 in a year that is not a leap year for day 29', () => {
    expect(localFireTimes(monthly(29), '2027-02-01', '2027-04-01')).toEqual([
      '2027-02-28 09:15',
      '2027-03-29 09:15',
    ]);
  });

  it('fires on February 28 in 2100, which is not a leap year', () => {
    expect(localFireTimes(monthly(31), '2100-02-01', '2100-03-01')).toEqual(['2100-02-28 09:15']);
  });
});

describe('localWallTime', () => {
  it('names both fires of a repeated fall-back hour by the same local time', () => {
    expect(localWallTime(new Date('2027-11-07T06:30:00Z'), 'America/Chicago')).toBe('2027-11-07T01:30');
    expect(localWallTime(new Date('2027-11-07T07:30:00Z'), 'America/Chicago')).toBe('2027-11-07T01:30');
  });

  it('names local midnight as hour 00 of the new day', () => {
    expect(localWallTime(new Date('2027-03-02T06:00:00Z'), 'America/Chicago')).toBe('2027-03-02T00:00');
  });
});
