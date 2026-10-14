import { StorageApiError } from '@supabase/supabase-js';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { BRAND_BUCKET } from './lookup-brand';

const SIGNED_URL_SECONDS = 300;

export async function brandLogoUrl(logoPath: string): Promise<string | null> {
  const { data, error } = await getSupabaseServerAdminClient()
    .storage.from(BRAND_BUCKET)
    .createSignedUrl(logoPath, SIGNED_URL_SECONDS);

  if (error instanceof StorageApiError && error.statusCode === '404') {
    return null;
  }

  if (error) {
    throw error;
  }

  return data.signedUrl;
}
