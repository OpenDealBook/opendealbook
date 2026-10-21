import type { StepTypeName } from './graph';
import type { defineStep } from './step';
import { approval } from './steps/approval';
import { askAi } from './steps/askAi';
import { createTodo } from './steps/createTodo';
import { decisionModel } from './steps/decisionModel';
import { notifyTeam } from './steps/notifyTeam';

export const stepRegistry = {
  notify_team: notifyTeam,
  create_todo: createTodo,
  ask_ai: askAi,
  decision_model: decisionModel,
  approval,
} satisfies Record<StepTypeName, ReturnType<typeof defineStep>>;
