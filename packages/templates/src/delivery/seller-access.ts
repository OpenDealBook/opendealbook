import type { SupabaseClient } from '@supabase/supabase-js';

import { signedInUser } from '@odb/lender-rooms/activity/signed-in-user.ts';
import {
  safeSellerNextPath,
  sellerRoomPath,
  sellerSignInPath,
} from '@odb/seller-rooms/members/entry-rules.ts';
import type { Database } from '@odb/supabase';

import { GENERATED_BUCKET, SIGNED_URL_SECONDS } from '../storage';
import { sellerDocumentPath } from './send-to-seller';

export type SellerDocumentDecision =
  | { kind: 'sign-in'; path: string }
  | { kind: 'not-found' }
  | { kind: 'room'; path: string }
  | { kind: 'open'; pdfUrl: string };

export async function openSellerDocument(
  client: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  shareId: string,
): Promise<SellerDocumentDecision> {
  const path = safeSellerNextPath(sellerDocumentPath(shareId));

  if (!path) {
    return { kind: 'not-found' };
  }

  if (!(await signedInUser(client))) {
    return { kind: 'sign-in', path: sellerSignInPath(path) };
  }

  const { data: share } = await client
    .from('document_share')
    .select('room_id')
    .eq('id', shareId)
    .maybeSingle()
    .throwOnError();

  if (share?.room_id) {
    return { kind: 'room', path: sellerRoomPath(share.room_id) };
  }

  const { data: pdfPath } = await client
    .rpc('open_document_share', { share_id: shareId })
    .throwOnError();

  if (!pdfPath) {
    return { kind: 'not-found' };
  }

  const { data, error } = await admin.storage
    .from(GENERATED_BUCKET)
    .createSignedUrl(pdfPath, SIGNED_URL_SECONDS);

  if (error) {
    throw error;
  }

  return { kind: 'open', pdfUrl: data.signedUrl };
}

export async function confirmSellerSignIn(
  client: SupabaseClient<Database>,
  tokenHash: string,
): Promise<'signed-in' | 'expired'> {
  const { error } = await client.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });

  return error ? 'expired' : 'signed-in';
}
