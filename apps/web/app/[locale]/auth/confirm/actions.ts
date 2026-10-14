'use server';

import { redirect } from 'next/navigation';

import { confirmSignIn } from '@odb/lender-rooms/members/confirm-sign-in.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';

export async function confirmLenderSignIn(
  _state: 'ready' | 'expired',
  formData: FormData,
): Promise<'expired'> {
  const result = await confirmSignIn(getSupabaseServerClient(), {
    tokenHash: String(formData.get('token_hash')),
    next: String(formData.get('next')),
  });

  if (result.kind === 'expired') {
    return 'expired';
  }

  redirect(result.next);
}
