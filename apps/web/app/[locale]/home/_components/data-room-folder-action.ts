'use server';

import { createFolder } from '@odb/data-room/server';

export async function createDataRoomFolder(
  input: Parameters<typeof createFolder>[0],
) {
  return createFolder(input);
}
