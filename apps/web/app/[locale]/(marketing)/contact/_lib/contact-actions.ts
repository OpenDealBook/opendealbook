'use server';

import { z } from 'zod';

import { getMailer } from '@odb/mailers';
import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerAdminClient } from '@odb/supabase/server';

// FLAG: placeholder inbox and sender. Set CONTACT_LEAD_NOTIFY_EMAIL per
// environment; the user owns the final notify address and from identity.
const DEFAULT_CONTACT_NOTIFY_EMAIL = 'hello@opendealbook.app';
const CONTACT_LEAD_FROM = 'Open Deal Book <hello@opendealbook.app>';

const ContactLeadSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  company: z.string().optional(),
  message: z.string().min(1),
});

export const submitContactLead = enhanceAction(
  async (input: z.infer<typeof ContactLeadSchema>) => {
    const client = getSupabaseServerAdminClient();

    const { error } = await client.from('lead').insert({
      name: input.name,
      email: input.email,
      company: input.company ?? null,
      message: input.message,
      source: 'contact_form',
    });

    if (error) {
      throw error;
    }

    const mailer = await getMailer();

    await mailer.sendEmail({
      to: process.env.CONTACT_LEAD_NOTIFY_EMAIL ?? DEFAULT_CONTACT_NOTIFY_EMAIL,
      from: CONTACT_LEAD_FROM,
      subject: `New contact lead from ${input.name}`,
      text: [
        `Name: ${input.name}`,
        `Email: ${input.email}`,
        `Company: ${input.company ?? 'Not provided'}`,
        '',
        input.message,
      ].join('\n'),
    });
  },
  { auth: false, schema: ContactLeadSchema },
);
