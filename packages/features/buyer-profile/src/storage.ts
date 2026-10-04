import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

export const BUYER_PROFILE_BUCKET = 'buyer-profile';

type Client = SupabaseClient<Database>;

export async function uploadBuyerProfilePhoto(
  client: Client,
  accountId: string,
  file: File,
): Promise<string> {
  const path = `${accountId}/${crypto.randomUUID()}-${file.name}`;

  const { error } = await client.storage
    .from(BUYER_PROFILE_BUCKET)
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return path;
}

export async function buyerProfilePhotoSignedUrl(
  client: Client,
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await client.storage
    .from(BUYER_PROFILE_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}
