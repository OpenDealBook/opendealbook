import { ApplicationFailure } from '@temporalio/common';
import { z } from 'zod';

export async function teamRow<Row>(
  id: string,
  message: string,
  load: (id: string) => PromiseLike<{ data: Row | null }>,
): Promise<Row> {
  const row = z.guid().safeParse(id).success ? (await load(id)).data : null;
  if (row === null) {
    throw ApplicationFailure.nonRetryable(message);
  }
  return row;
}
