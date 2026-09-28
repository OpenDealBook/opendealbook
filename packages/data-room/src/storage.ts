import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

export const DATA_ROOM_BUCKET = 'data-room';

type Client = SupabaseClient<Database>;

export type UploadBody = Blob | File | ArrayBuffer | Uint8Array;

export function dataRoomObjectPath(dealId: string, name: string): string {
  return `deal/${dealId}/${crypto.randomUUID()}-${name}`;
}

export async function uploadToDataRoom(
  client: Client,
  dealId: string,
  name: string,
  body: UploadBody,
): Promise<string> {
  const path = dataRoomObjectPath(dealId, name);

  const { error } = await client.storage
    .from(DATA_ROOM_BUCKET)
    .upload(path, body, { upsert: false });

  if (error) {
    throw error;
  }

  return path;
}

export async function downloadFromDataRoom(
  client: Client,
  storagePath: string,
): Promise<Blob> {
  const { data, error } = await client.storage
    .from(DATA_ROOM_BUCKET)
    .download(storagePath);

  if (error) {
    throw error;
  }

  return data;
}

export async function dataRoomSignedUrl(
  client: Client,
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await client.storage
    .from(DATA_ROOM_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}
