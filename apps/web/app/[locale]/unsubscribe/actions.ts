'use server';

import { redirect } from 'next/navigation';

import { getLocale } from 'next-intl/server';

import { getSupabaseServerAdminClient } from '@odb/supabase/server';

export async function unsubscribe(token: string): Promise<never> {
  const { data: unsubscribed } = await getSupabaseServerAdminClient()
    .rpc('unsubscribe_outreach', { p_token: token })
    .throwOnError();

  redirect(`/${await getLocale()}/unsubscribe?status=${unsubscribed ? 'done' : 'invalid'}`);
}
