import { Refusal } from '@odb/next/refusal';
import { ManualRunRefused } from '@odb/workflows/builder/client';

export async function refusingManualRun<Value>(run: () => Promise<Value>): Promise<Value> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ManualRunRefused) {
      throw new Refusal(error.message);
    }
    throw error;
  }
}
