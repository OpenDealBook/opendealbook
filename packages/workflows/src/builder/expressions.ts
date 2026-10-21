import { ApplicationFailure } from '@temporalio/common';

import type { Json } from '@odb/supabase';

import type { StepIo } from './graph';

export type StepOutputs = Record<string, StepIo>;

export const WHOLE_REFERENCE = /^\{\{\s*(steps(?:\.[^.\s{}]+)+)\s*\}\}$/;
export const REFERENCE = /\{\{\s*(steps(?:\.[^.\s{}]+)+)\s*\}\}/g;

function lookup(reference: string, steps: StepOutputs): Json {
  const [, ...path] = reference.split('.');
  let value: Json | undefined = steps;
  for (const key of path) {
    value =
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value[key]
        : undefined;
  }
  if (value === undefined) {
    throw ApplicationFailure.nonRetryable(
      `${reference} does not name an earlier step output`,
    );
  }
  return value;
}

function asText(value: Json): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function resolveExpressions(value: Json, steps: StepOutputs): Json {
  if (typeof value === 'string') {
    const wholeReference = WHOLE_REFERENCE.exec(value)?.[1];
    return wholeReference === undefined
      ? value.replace(REFERENCE, (_, reference: string) =>
          asText(lookup(reference, steps)),
        )
      : lookup(wholeReference, steps);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveExpressions(item, steps));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) =>
        item === undefined ? [] : [[key, resolveExpressions(item, steps)]],
      ),
    );
  }
  return value;
}
