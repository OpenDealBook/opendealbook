import { ActivityFailure } from '@temporalio/workflow';

import type { RelayFailedEvent } from './activities';

export const RELAY_EVENT_ATTEMPTS = 5;

export async function relayOrSetAside(
  relayName: string,
  globalSeq: number,
  relay: () => Promise<void>,
  setAside: (failure: RelayFailedEvent) => Promise<void>,
): Promise<void> {
  try {
    await relay();
  } catch (error) {
    if (!(error instanceof ActivityFailure)) {
      throw error;
    }
    await setAside({
      relayName,
      globalSeq,
      error: (error.cause ?? error).message,
      attempts: RELAY_EVENT_ATTEMPTS,
    });
  }
}
