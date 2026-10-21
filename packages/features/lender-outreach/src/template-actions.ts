'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { TEMPLATE_FIELDS } from './draft-email';
import { refuseUnlessDealTeam } from './refuse-unless-deal-team';

function templateText(missing: string) {
  return z
    .string()
    .trim()
    .min(1, missing)
    .superRefine((text, context) => {
      const unknown = [...text.matchAll(/\{\{[^}]*\}\}/g)].find(
        ([token]) => !TEMPLATE_FIELDS.some((field) => token === `{{${field}}}`),
      );

      if (unknown) {
        context.addIssue({
          code: 'custom',
          message: `Unknown field ${unknown[0]}`,
        });
      }
    });
}

export const saveOutreachTemplate = refusableAction(
  async (input, user) => {
    await refuseUnlessDealTeam(input.accountId, user.id);

    await getSupabaseServerClient()
      .from('lender_outreach_template')
      .upsert({
        account_id: input.accountId,
        subject: input.subject,
        body: input.body,
      })
      .throwOnError();
  },
  {
    auth: true,
    schema: z.object({
      accountId: z.uuid(),
      subject: templateText('Add a subject'),
      body: templateText('Add a body'),
    }),
  },
);

export const resetOutreachTemplate = refusableAction(
  async (input, user) => {
    await refuseUnlessDealTeam(input.accountId, user.id);

    await getSupabaseServerClient()
      .from('lender_outreach_template')
      .delete()
      .eq('account_id', input.accountId)
      .throwOnError();
  },
  { auth: true, schema: z.object({ accountId: z.uuid() }) },
);
