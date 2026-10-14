import type { ActionResult } from '../refusal';

export async function unwrap<Value>(
  pending: Promise<ActionResult<Value>>,
): Promise<Value> {
  const result = await pending;

  if (!result.ok) {
    throw new Error(result.refusal);
  }

  return result.value;
}
