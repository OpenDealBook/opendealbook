import type { Duration } from '@temporalio/common';
import { condition, setHandler } from '@temporalio/workflow';

import { sellerUploaded } from './signals';

export interface DataRoomProvisioningInput {
  dealId: string;
  reminderInterval: Duration;
}

export async function dataRoomProvisioning(
  input: DataRoomProvisioningInput,
): Promise<{ reminders: number }> {
  let uploaded = false;
  let reminders = 0;

  setHandler(sellerUploaded, () => {
    uploaded = true;
  });

  while (!uploaded) {
    const satisfied = await condition(() => uploaded, input.reminderInterval);

    if (!satisfied) {
      reminders += 1;
    }
  }

  return { reminders };
}
