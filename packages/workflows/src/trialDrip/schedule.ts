export type TrialDripDayKey = 'trial-day-1' | 'trial-day-3' | 'trial-day-6';

export interface TrialDripStep {
  dayKey: TrialDripDayKey;
  afterDays: number;
}

export interface TrialDripSend {
  dayKey: TrialDripDayKey;
  sleepMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const TRIAL_DRIP_SEQUENCE: readonly TrialDripStep[] = [
  { dayKey: 'trial-day-1', afterDays: 1 },
  { dayKey: 'trial-day-3', afterDays: 3 },
  { dayKey: 'trial-day-6', afterDays: 6 },
];

export function trialDripSends(
  sequence: readonly TrialDripStep[] = TRIAL_DRIP_SEQUENCE,
): TrialDripSend[] {
  let previousDay = 0;

  return sequence.map((step) => {
    const sleepMs = (step.afterDays - previousDay) * DAY_MS;
    previousDay = step.afterDays;

    return { dayKey: step.dayKey, sleepMs };
  });
}
