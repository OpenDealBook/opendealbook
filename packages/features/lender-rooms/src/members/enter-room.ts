import 'server-only';

import { notFound, redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@odb/supabase/server';

import type { RoomGateDecision } from './entry-rules';
import { loadRoomGate } from './room-gate';

export async function enterLenderRoom(
  roomId: string,
): Promise<Extract<RoomGateDecision, { kind: 'open' | 'closed' }>> {
  const decision = await loadRoomGate(getSupabaseServerClient(), roomId);

  switch (decision.kind) {
    case 'sign-in':
      redirect(decision.path);
    case 'not-found':
      notFound();
    default:
      return decision;
  }
}
