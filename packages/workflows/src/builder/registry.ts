import type { StepTypeName } from './graph';
import type { defineStep } from './step';
import { createTodo } from './steps/createTodo';
import { notifyTeam } from './steps/notifyTeam';

export const stepRegistry = {
  notify_team: notifyTeam,
  create_todo: createTodo,
} satisfies Record<StepTypeName, ReturnType<typeof defineStep>>;
