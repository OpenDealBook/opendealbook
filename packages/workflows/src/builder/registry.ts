import type { StepTypeName } from './graph';
import type { defineStep } from './step';
import { notifyTeam } from './steps/notifyTeam';

export const stepRegistry = {
  notify_team: notifyTeam,
} satisfies Record<StepTypeName, ReturnType<typeof defineStep>>;
