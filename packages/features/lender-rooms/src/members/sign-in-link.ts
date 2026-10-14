import type { SupabaseClient } from '@supabase/supabase-js';

import { renderLenderSignInEmail } from '@odb/email-templates';
import { getMailer } from '@odb/mailers';
import type { Database } from '@odb/supabase';

import { signInConfirmUrl } from './entry-rules';

export async function claimSignInLinkWindow(
  admin: SupabaseClient<Database>,
  email: string,
): Promise<boolean> {
  const { data: passed } = await admin
    .rpc('lender_rate_limit_pass', {
      key: `signin:${email}`,
      window_seconds: 120,
    })
    .throwOnError();

  return passed;
}

export async function sendSignInLink(
  admin: SupabaseClient<Database>,
  { email, next }: { email: string; next: string },
): Promise<void> {
  const origin = process.env.NEXT_PUBLIC_SITE_URL;

  if (!origin) {
    throw new Error(
      'Missing required environment variable: NEXT_PUBLIC_SITE_URL',
    );
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (error) {
    throw error;
  }

  const rendered = await renderLenderSignInEmail({
    productName: 'Open Deal Book',
    signInLink: signInConfirmUrl({
      origin,
      tokenHash: data.properties.hashed_token,
      next,
    }),
  });

  const mailer = await getMailer();

  await mailer.sendEmail({
    to: email,
    from:
      process.env.LENDER_ROOMS_FROM_EMAIL ??
      'Open Deal Book <hello@opendealbook.app>',
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}
