import { z } from 'zod';

import type { StepOutputs } from './expressions';
import type { StepIo } from './graph';

type Operand = string | number | boolean | null | { var: string };
type OperandPair = [Operand, Operand];

export type Rule =
  | { '==': OperandPair }
  | { '!=': OperandPair }
  | { '<': OperandPair }
  | { '<=': OperandPair }
  | { '>': OperandPair }
  | { '>=': OperandPair }
  | { and: Rule[] }
  | { or: Rule[] }
  | { not: Rule };

const operandSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.strictObject({ var: z.string().min(1) }),
]);
const pairSchema = z.tuple([operandSchema, operandSchema]);

export const ruleSchema: z.ZodType<Rule> = z.lazy(() =>
  z.union([
    z.strictObject({ '==': pairSchema }),
    z.strictObject({ '!=': pairSchema }),
    z.strictObject({ '<': pairSchema }),
    z.strictObject({ '<=': pairSchema }),
    z.strictObject({ '>': pairSchema }),
    z.strictObject({ '>=': pairSchema }),
    z.strictObject({ and: z.array(ruleSchema) }),
    z.strictObject({ or: z.array(ruleSchema) }),
    z.strictObject({ not: ruleSchema }),
  ]),
);

interface RuleScope {
  input: StepIo;
  steps: StepOutputs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolve(operand: Operand, scope: RuleScope): unknown {
  if (operand === null || typeof operand !== 'object') {
    return operand;
  }
  const path = operand.var.split('.');
  const fromSteps = path[0] === 'steps';
  let value: unknown = fromSteps ? scope.steps : scope.input;
  for (const key of fromSteps ? path.slice(1) : path) {
    value = isRecord(value) ? value[key] : undefined;
  }
  if (value === undefined) {
    throw new Error(`${operand.var} does not name a value`);
  }
  return value;
}

function order([left, right]: OperandPair, scope: RuleScope): number {
  const a = resolve(left, scope);
  const b = resolve(right, scope);
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  throw new Error(`Cannot order ${JSON.stringify(a)} and ${JSON.stringify(b)}`);
}

function equal([left, right]: OperandPair, scope: RuleScope): boolean {
  return resolve(left, scope) === resolve(right, scope);
}

export function evaluateRule(rule: Rule, scope: RuleScope): boolean {
  if ('and' in rule)
    return rule.and.every((inner) => evaluateRule(inner, scope));
  if ('or' in rule) return rule.or.some((inner) => evaluateRule(inner, scope));
  if ('not' in rule) return !evaluateRule(rule.not, scope);
  if ('==' in rule) return equal(rule['=='], scope);
  if ('!=' in rule) return !equal(rule['!='], scope);
  if ('<' in rule) return order(rule['<'], scope) < 0;
  if ('<=' in rule) return order(rule['<='], scope) <= 0;
  if ('>' in rule) return order(rule['>'], scope) > 0;
  return order(rule['>='], scope) >= 0;
}
