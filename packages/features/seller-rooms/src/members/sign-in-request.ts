import type { SupabaseClient } from '@supabase/supabase-js';

import { EMAIL_TEMPLATE_RENDERERS } from '@odb/email-templates';
import { getMailer } from '@odb/mailers';
import type { Database } from '@odb/supabase';

import {
  SELLER_SIGN_IN_WINDOW_SECONDS,
  type SellerPlace,
  sellerPlace,
  sellerSignInConfirmUrl,
  sellerSignInRateKey,
} from './entry-rules';
import { findSeller } from './find-or-create-seller';

export interface SellerSignInSettings {
  origin: string;
  from: string;
}

type DealNames = { name: string; outsideName: string };

function namesOf(deal: { code_name: string | null; firm: { name: string } }) {
  return {
    name: deal.firm.name,
    outsideName: deal.code_name ?? deal.firm.name,
  };
}

async function dealNames(
  admin: SupabaseClient<Database>,
  place: SellerPlace,
  sellerId: string,
): Promise<DealNames[]> {
  if (place.kind === 'documents') {
    const { data: shares } = await admin
      .from('document_share')
      .select(
        'generated_document!inner(deal!inner(code_name, firm!inner(name)))',
      )
      .eq('id', place.id)
      .eq('recipient_user_id', sellerId)
      .throwOnError();

    return shares.map((share) => namesOf(share.generated_document.deal));
  }

  let rooms = admin
    .from('seller_room_member')
    .select(
      'seller_room!inner(deal_id, deal!inner(code_name, firm!inner(name)))',
    )
    .eq('user_id', sellerId);

  if (place.kind === 'rooms') {
    rooms = rooms.eq('room_id', place.id);
  }

  if (place.kind === 'deals') {
    rooms = rooms.eq('seller_room.deal_id', place.id);
  }

  const { data: memberships } = await rooms.throwOnError();

  return memberships
    .map((member) => namesOf(member.seller_room.deal))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function requestSellerSignIn(
  admin: SupabaseClient<Database>,
  input: { email: string; next: string },
  settings: SellerSignInSettings,
): Promise<void> {
  const place = sellerPlace(input.next);
  const sellerId = await findSeller(admin, input.email);

  if (!place || !sellerId) {
    return;
  }

  const deals = await dealNames(admin, place, sellerId);

  if (deals.length === 0) {
    return;
  }

  const { data: windowPassed } = await admin
    .rpc('lender_rate_limit_pass', {
      key: sellerSignInRateKey(input.email),
      window_seconds: SELLER_SIGN_IN_WINDOW_SECONDS,
    })
    .throwOnError();

  if (!windowPassed) {
    return;
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: input.email,
  });

  if (error) {
    throw error;
  }

  const rendered = await EMAIL_TEMPLATE_RENDERERS['seller-sign-in']({
    productName: 'Open Deal Book',
    deals,
    signInLink: sellerSignInConfirmUrl({
      origin: settings.origin,
      tokenHash: data.properties.hashed_token,
      next: input.next,
      email: input.email,
    }),
  });

  const mailer = await getMailer();

  await mailer.sendEmail({
    to: input.email,
    from: settings.from,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}
