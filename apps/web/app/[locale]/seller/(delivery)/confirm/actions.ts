'use server';

import { notFound, redirect } from 'next/navigation';

import { safeSellerNextPath } from '@odb/seller-rooms/members/entry-rules.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { confirmSellerSignIn } from '@odb/templates/delivery';

export async function confirmSeller(
  _state: 'ready' | 'expired',
  formData: FormData,
): Promise<'expired'> {
  const next = safeSellerNextPath(String(formData.get('next')));

  if (!next) {
    notFound();
  }

  const result = await confirmSellerSignIn(
    getSupabaseServerClient(),
    String(formData.get('token_hash')),
  );

  if (result === 'expired') {
    return 'expired';
  }

  redirect(next);
}
