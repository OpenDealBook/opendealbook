export class Refusal extends Error {}

export type ActionResult<Value> =
  | { ok: true; value: Value }
  | { ok: false; refusal: string };
