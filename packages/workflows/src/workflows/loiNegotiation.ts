import type { Duration } from '@temporalio/common';
import { condition, setHandler } from '@temporalio/workflow';

import { counselAcceptedTurn } from './signals';

export interface LoiNegotiationInput {
  dealId: string;
  exclusivityWindow: Duration;
}

export async function loiNegotiation(
  input: LoiNegotiationInput,
): Promise<{ accepted: boolean }> {
  let accepted = false;

  setHandler(counselAcceptedTurn, () => {
    accepted = true;
  });

  await condition(() => accepted, input.exclusivityWindow);

  return { accepted };
}
