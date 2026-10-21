'use server';

import { notFound, redirect } from 'next/navigation';

import { safeCounselNextPath } from '@odb/deal-counsel/entry-rules.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';

export async function confirmCounsel(
  _state: 'ready' | 'expired',
  formData: FormData,
): Promise<'expired'> {
  const next = safeCounselNextPath(String(formData.get('next')));

  if (!next) {
    notFound();
  }

  const { error } = await getSupabaseServerClient().auth.verifyOtp({
    token_hash: String(formData.get('token_hash')),
    type: 'magiclink',
  });

  if (error) {
    return 'expired';
  }

  redirect(next);
}
