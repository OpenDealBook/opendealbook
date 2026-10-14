import { z } from 'zod';

import { createLenderBridge } from '@odb/notifications/lender-bridge';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import appConfig from '../../../config/app.config';

const bridge = createLenderBridge({
  secretKey: process.env.NOVU_API_KEY,
  siteUrl: appConfig.url,
  loadRoom: async ({ roomId }) => {
    const { data } = await getSupabaseServerAdminClient()
      .from('lender_room')
      .select(
        'name, deal_id, deal(firm(name)), accounts(slug)',
      )
      .eq('id', roomId)
      .single()
      .throwOnError();

    return {
      name: data.name,
      dealName: data.deal.firm?.name ?? null,
      dealId: data.deal_id,
      teamAccountSlug: z.string().parse(data.accounts.slug),
    };
  },
  loadRequestTitle: async ({ roomId, askId }) => {
    const { data } = await getSupabaseServerAdminClient()
      .from('lender_ask')
      .select('title')
      .eq('id', askId)
      .eq('room_id', roomId)
      .single()
      .throwOnError();

    return data.title;
  },
  loadVisibleDocuments: async ({ userId, documentIds }) => {
    const { data } = await getSupabaseServerAdminClient()
      .rpc('lender_visible_documents', {
        user_id: userId,
        document_ids: documentIds,
      })
      .throwOnError();

    return data;
  },
});

export { bridge as GET, bridge as POST };
