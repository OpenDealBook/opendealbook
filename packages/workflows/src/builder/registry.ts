import type { StepTypeName } from './graph';
import type { defineStep } from './step';
import { approval } from './steps/approval';
import { askAi } from './steps/askAi';
import { createTodo } from './steps/createTodo';
import { decisionModel } from './steps/decisionModel';
import { emailLookup } from './steps/emailLookup';
import { enrollSequence } from './steps/enrollSequence';
import { notifyTeam } from './steps/notifyTeam';
import { prepareFirm } from './steps/prepareFirm';
import { pullLeads } from './steps/pullLeads';
import { registryLookup } from './steps/registryLookup';
import { sendLetter } from './steps/sendLetter';

export const stepRegistry = {
  notify_team: notifyTeam,
  create_todo: createTodo,
  ask_ai: askAi,
  decision_model: decisionModel,
  approval,
  pull_leads: pullLeads,
  registry_lookup: registryLookup,
  email_lookup: emailLookup,
  prepare_firm: prepareFirm,
  enroll_sequence: enrollSequence,
  send_letter: sendLetter,
} satisfies Record<StepTypeName, ReturnType<typeof defineStep>>;
