import type { SupabaseClient } from '@supabase/supabase-js';

import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { refuseAnotherSide } from '@odb/lender-rooms/members/another-side.ts';
import { findOrCreateSeller } from '@odb/seller-rooms/members/find-or-create-seller.ts';
import { requireEnv } from '@odb/shared/env';
import { getLogger } from '@odb/shared/logger';
import type { Database } from '@odb/supabase';

import {
  claimCounselSignInWindow,
  sendCounselSignInLink,
} from './sign-in-request';

type CounselLink = Parameters<typeof sendCounselSignInLink>[1];

const UNIQUE_VIOLATION = '23505';

export async function inviteCounsel(
  admin: SupabaseClient<Database>,
  invite: Omit<CounselLink, 'email'> & {
    accountId: string;
    email: string;
    name: string | undefined;
    invitedBy: string;
    from: string;
  },
): Promise<void> {
  await refuseAnotherSide(admin, invite);

  const { data: alreadyCounsel } = await admin
    .from('deal_counsel')
    .select('id')
    .eq('deal_id', invite.dealId)
    .eq('side', invite.side)
    .eq('email', invite.email)
    .maybeSingle()
    .throwOnError();

  if (!alreadyCounsel) {
    const { error } = await admin.from('deal_counsel').upsert(
      {
        account_id: invite.accountId,
        deal_id: invite.dealId,
        side: invite.side,
        user_id: await findOrCreateSeller(admin, invite.email),
        email: invite.email,
        name: invite.name,
        invited_by: invite.invitedBy,
      },
      { onConflict: 'deal_id,side,user_id', ignoreDuplicates: true },
    );

    // The same-side conflict is ignored above, so a unique violation here is
    // deal_counsel_one_side.
    if (error?.code === UNIQUE_VIOLATION) {
      throw new Refusal('This person is already counsel for the other side.');
    }

    if (error) {
      throw error;
    }
  }

  const windowPassed = await claimCounselSignInWindow(admin, invite.email);

  if (alreadyCounsel && !windowPassed) {
    throw new Refusal(
      'A sign-in link was sent to this address in the last 2 minutes. Try again shortly.',
    );
  }

  try {
    await sendCounselSignInLink(
      admin,
      {
        email: invite.email,
        dealId: invite.dealId,
        side: invite.side,
        copy: invite.copy,
      },
      { origin: requireEnv('NEXT_PUBLIC_SITE_URL'), from: invite.from },
    );
  } catch (sendError) {
    getLogger().error({ err: sendError }, 'Counsel invite email was not sent');

    throw new Refusal(
      'The invite was saved but the email could not be sent. Send it again.',
    );
  }
}
