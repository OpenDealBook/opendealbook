import 'server-only';
import { StorageApiError, type SupabaseClient } from '@supabase/supabase-js';

import { DATA_ROOM_BUCKET } from '@odb/data-room/storage';
import type { Database } from '@odb/supabase';

export type Admin = SupabaseClient<Database>;

const OBJECT_NOT_FOUND = '404';
const OBJECT_ALREADY_EXISTS = '409';

export async function storedSize(
  admin: Admin,
  path: string,
): Promise<number | null> {
  const object = await admin.storage.from(DATA_ROOM_BUCKET).info(path);

  if (object.error) {
    if (hasStatus(object.error, OBJECT_NOT_FOUND)) {
      return null;
    }

    throw object.error;
  }

  return object.data.size ?? Number.POSITIVE_INFINITY;
}

export async function downloadObject(
  admin: Admin,
  path: string,
): Promise<Uint8Array> {
  const object = await admin.storage.from(DATA_ROOM_BUCKET).download(path);

  if (object.error) {
    throw object.error;
  }

  return new Uint8Array(await object.data.arrayBuffer());
}

export async function storeOnce(
  admin: Admin,
  path: string,
  bytes: Uint8Array,
  options: { contentType: string },
) {
  const stored = await admin.storage
    .from(DATA_ROOM_BUCKET)
    .upload(path, bytes, options);

  if (stored.error && !hasStatus(stored.error, OBJECT_ALREADY_EXISTS)) {
    throw stored.error;
  }
}

export async function removeObject(admin: Admin, path: string) {
  const removed = await admin.storage.from(DATA_ROOM_BUCKET).remove([path]);

  if (removed.error) {
    throw removed.error;
  }
}

function hasStatus(error: Error, statusCode: string): boolean {
  return error instanceof StorageApiError && error.statusCode === statusCode;
}
