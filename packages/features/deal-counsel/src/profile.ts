'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { loadCounselGate } from './portal-gate';

// Service role: authenticated has no update grant on deal_counsel. Only the
// caller's own rows on a deal they are proven counsel on change.
async function updateMyCounselRows(
  dealId: string,
  userId: string,
  changes: Database['public']['Tables']['deal_counsel']['Update'],
): Promise<void> {
  const gate = await loadCounselGate(getSupabaseServerClient(), dealId);

  if (gate.kind !== 'open') {
    throw new Refusal('You are not counsel on this deal.');
  }

  if (gate.readOnlyReason) {
    throw new Refusal(gate.readOnlyReason);
  }

  const { sides } = gate;

  await getSupabaseServerAdminClient()
    .from('deal_counsel')
    .update(changes)
    .eq('deal_id', dealId)
    .eq('user_id', userId)
    .in('side', sides)
    .throwOnError();
}

export const setMyCounselDetails = refusableAction(
  async (input, user) => {
    await updateMyCounselRows(input.dealId, user.id, {
      name: input.name,
      phone: input.phone,
      profile_asked_at: new Date().toISOString(),
    });
  },
  {
    auth: true,
    schema: z.object({
      dealId: z.uuid(),
      name: z.string().trim().min(1).max(200),
      phone: z
        .string()
        .trim()
        .max(50)
        .transform((phone) => phone || null),
    }),
  },
);

export const skipCounselProfilePrompt = refusableAction(
  async (input, user) => {
    await updateMyCounselRows(input.dealId, user.id, {
      profile_asked_at: new Date().toISOString(),
    });
  },
  { auth: true, schema: z.object({ dealId: z.uuid() }) },
);
