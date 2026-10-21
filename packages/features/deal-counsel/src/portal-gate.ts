import 'server-only';
import { notFound, redirect } from 'next/navigation';

import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import { DEAL_ENDED_READ_ONLY } from '@odb/lender-rooms/actions/refusal.ts';
import { isSignedIn } from '@odb/lender-rooms/members/room-gate.ts';
import type { Database } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { counselPortalPath, counselSignInPath } from './entry-rules';

export type CounselSide = Database['public']['Enums']['counsel_side'];

export type CounselGate =
  | { kind: 'sign-in'; path: string }
  | { kind: 'not-found' }
  | { kind: 'open'; sides: CounselSide[]; readOnlyReason: string | null };

const SIDES = ['buyer', 'seller'] as const satisfies CounselSide[];

export async function counselSides(
  client: SupabaseClient<Database>,
  dealId: string,
): Promise<CounselSide[]> {
  const answers = await Promise.all(
    SIDES.map((side) =>
      client.rpc('is_deal_counsel', { deal_id: dealId, side }).throwOnError(),
    ),
  );

  return SIDES.filter((_, index) => answers[index]!.data);
}

export async function shouldAskCounselProfile(
  client: SupabaseClient<Database>,
  dealId: string,
): Promise<boolean> {
  const {
    data: { user },
  } = await client.auth.getUser();

  const { data: counsel } = await client
    .from('deal_counsel')
    .select('profile_asked_at')
    .eq('deal_id', dealId)
    .eq('user_id', user!.id)
    .single()
    .throwOnError();

  return counsel.profile_asked_at === null;
}

export async function loadCounselGate(
  client: SupabaseClient<Database>,
  dealId: string,
): Promise<CounselGate> {
  if (!(await isSignedIn(client))) {
    return {
      kind: 'sign-in',
      path: counselSignInPath(counselPortalPath(dealId)),
    };
  }

  if (!z.uuid().safeParse(dealId).success) {
    return { kind: 'not-found' };
  }

  const sides = await counselSides(client, dealId);

  if (sides.length > 0) {
    return { kind: 'open', sides, readOnlyReason: null };
  }

  const { data: endedSellerCounsel } = await client
    .rpc('is_deal_seller_counsel_reader', { deal_id: dealId })
    .throwOnError();

  return endedSellerCounsel
    ? { kind: 'open', sides: ['seller'], readOnlyReason: DEAL_ENDED_READ_ONLY }
    : { kind: 'not-found' };
}

export async function enterCounselPortalToRead(
  dealId: string,
): Promise<{ sides: CounselSide[]; readOnlyReason: string | null }> {
  const gate = await loadCounselGate(getSupabaseServerClient(), dealId);

  switch (gate.kind) {
    case 'sign-in':
      redirect(gate.path);
    case 'not-found':
      notFound();
    case 'open':
      return gate;
  }
}

// Pages that change anything send read-only counsel to what they can still
// read: their client thread and their documents.
export async function enterCounselPortal(
  dealId: string,
): Promise<CounselSide[]> {
  const { sides, readOnlyReason } = await enterCounselPortalToRead(dealId);

  if (readOnlyReason) {
    redirect(`${counselPortalPath(dealId)}/client`);
  }

  return sides;
}
