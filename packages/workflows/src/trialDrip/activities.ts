import {
  EMAIL_TEMPLATE_RENDERERS,
  type RenderedEmail,
} from '@odb/email-templates';
import { getMailer } from '@odb/mailers';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import type { TrialDripEligibility } from './eligibility';
import type { TrialDripDayKey } from './schedule';

// Platform sender for trial nurture. Sourced from TRIAL_DRIP_FROM_EMAIL so the
// address is configurable per environment, falling back to this constant.
export const DEFAULT_TRIAL_DRIP_FROM = 'Open Deal Book <hello@opendealbook.app>';

export interface SendTrialDripEmailInput {
  to: string;
  dayKey: TrialDripDayKey;
  productName: string;
  userName?: string;
  link: string;
}

export async function sendTrialDripEmail(
  input: SendTrialDripEmailInput,
): Promise<void> {
  const rendered = await renderTrialDripEmail(input);
  const mailer = await getMailer();

  await mailer.sendEmail({
    to: input.to,
    from: process.env.TRIAL_DRIP_FROM_EMAIL ?? DEFAULT_TRIAL_DRIP_FROM,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}

function renderTrialDripEmail(
  input: SendTrialDripEmailInput,
): Promise<RenderedEmail> {
  const base = { productName: input.productName, userName: input.userName };

  switch (input.dayKey) {
    case 'trial-day-1':
      return EMAIL_TEMPLATE_RENDERERS['trial-day-1']({
        ...base,
        actionLink: input.link,
      });
    case 'trial-day-3':
      return EMAIL_TEMPLATE_RENDERERS['trial-day-3']({
        ...base,
        actionLink: input.link,
      });
    case 'trial-day-6':
      return EMAIL_TEMPLATE_RENDERERS['trial-day-6']({
        ...base,
        upgradeLink: input.link,
      });
  }
}

export interface CheckTrialDripEligibilityInput {
  accountId: string;
}

export async function checkTrialDripEligibility(
  input: CheckTrialDripEligibilityInput,
): Promise<TrialDripEligibility> {
  const client = getSupabaseServerAdminClient();

  const { data, error } = await client.rpc('is_trial_active', {
    p_account_id: input.accountId,
  });

  if (error) {
    throw error;
  }

  return { trialActive: data ?? false, unsubscribed: false };
}
