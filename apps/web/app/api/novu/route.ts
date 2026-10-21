import { z } from 'zod';

import {
  createLenderBridge,
  type SellerDigestItem,
} from '@odb/notifications/lender-bridge';
import { meetingLabel } from '@odb/seller-rooms/meetings/meeting-label.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import appConfig from '../../../config/app.config';
import { env } from '../../../env';

async function withOutsideNames<Row extends { room_id: string }>(
  rows: Row[],
): Promise<(Row & { outside_name: string })[]> {
  const { data: rooms } = await getSupabaseServerAdminClient()
    .from('lender_room')
    .select('id, deal(code_name, firm!inner(name))')
    .in('id', [...new Set(rows.map((row) => row.room_id))])
    .throwOnError();
  const outsideNameOf = new Map(
    rooms.map((room) => [room.id, room.deal.code_name ?? room.deal.firm.name]),
  );

  return rows.map((row) => ({
    ...row,
    outside_name: outsideNameOf.get(row.room_id)!,
  }));
}

const bridge = createLenderBridge({
  secretKey: process.env.NOVU_API_KEY,
  siteUrl: appConfig.url,
  digestIntervalMinutes: env.LENDER_DIGEST_INTERVAL_MINUTES,
  loadRoom: async ({ roomId }) => {
    const { data } = await getSupabaseServerAdminClient()
      .from('lender_room')
      .select(
        'name, deal_id, deal(code_name, firm!inner(name)), accounts(name, slug)',
      )
      .eq('id', roomId)
      .single()
      .throwOnError();

    return {
      name: data.name,
      dealName: data.deal.firm.name,
      outsideName: data.deal.code_name ?? data.deal.firm.name,
      buyerTeam: data.accounts.name,
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

    return withOutsideNames(data);
  },
  loadVisibleFaqEntries: async ({ userId, entryIds }) => {
    const { data } = await getSupabaseServerAdminClient()
      .rpc('lender_visible_faq_entries', {
        user_id: userId,
        entry_ids: entryIds,
      })
      .throwOnError();

    return withOutsideNames(data);
  },
  loadSellerDigestItems: async ({
    userId,
    documentIds,
    folderIds,
    meetingIds,
  }) => {
    const admin = getSupabaseServerAdminClient();
    const { data } = await admin
      .rpc('seller_digest_items', {
        user_id: userId,
        document_ids: documentIds,
        folder_ids: folderIds,
        meeting_ids: meetingIds,
      })
      .throwOnError();
    const { data: rooms } = await admin
      .from('seller_room')
      .select('id, deal(code_name, firm!inner(name))')
      .in('id', [...new Set(data.map((item) => item.room_id))])
      .throwOnError();
    const dealOf = new Map(rooms.map((room) => [room.id, room.deal]));

    return data.map((item) => {
      const deal = dealOf.get(item.room_id)!;

      return {
        kind: item.kind as SellerDigestItem['kind'],
        itemId: item.item_id,
        name:
          item.kind === 'meeting'
            ? meetingLabel({ type: item.name, scheduled_at: item.scheduled_at })
            : item.name,
        folderId: item.folder_id,
        roomId: item.room_id,
        teamName: item.team_name,
        dealName: deal.firm.name,
        outsideName: deal.code_name ?? deal.firm.name,
      };
    });
  },
  loadManagedSellerRooms: async ({ userId, roomIds }) => {
    const admin = getSupabaseServerAdminClient();
    const { data: rooms } = await admin
      .from('seller_room')
      .select('id, deal_id, account_id, deal(firm!inner(name)), accounts(slug)')
      .in('id', roomIds)
      .throwOnError();

    const managed = await Promise.all(
      rooms.map(async (room) => {
        const { data: manages } = await admin
          .rpc('has_permission', {
            user_id: userId,
            account_id: room.account_id,
            permission_name: 'deals.manage',
          })
          .throwOnError();

        return manages ? [room] : [];
      }),
    );

    return managed.flat().map((room) => ({
      roomId: room.id,
      title: room.deal.firm.name,
      path: `/home/${z.string().parse(room.accounts.slug)}/deals/${room.deal_id}`,
    }));
  },
  loadManagedCounselDeals: async ({ userId, dealIds }) => {
    const admin = getSupabaseServerAdminClient();
    const { data: deals } = await admin
      .from('deal')
      .select('id, account_id, firm!inner(name), accounts(slug)')
      .in('id', dealIds)
      .throwOnError();

    const managed = await Promise.all(
      deals.map(async (deal) => {
        const { data: manages } = await admin
          .rpc('has_permission', {
            user_id: userId,
            account_id: deal.account_id,
            permission_name: 'deals.manage',
          })
          .throwOnError();

        return manages ? [deal] : [];
      }),
    );

    return managed.flat().map((deal) => ({
      dealId: deal.id,
      title: deal.firm.name,
      path: `/home/${z.string().parse(deal.accounts.slug)}/deals/${deal.id}`,
    }));
  },
  loadCounselMessage: async ({ messageId, audience }) => {
    const admin = getSupabaseServerAdminClient();
    const { data: message } = await admin
      .from('counsel_message')
      .select(
        'deal_id, side, author_user_id, deal(code_name, firm!inner(name)), accounts(slug)',
      )
      .eq('id', messageId)
      .single()
      .throwOnError();

    // A team author has no counsel row, and only counsel authors are named.
    const { data: counsel } = await admin
      .from('deal_counsel')
      .select('name, email')
      .eq('deal_id', message.deal_id)
      .eq('user_id', z.string().parse(message.author_user_id))
      .limit(1)
      .maybeSingle()
      .throwOnError();

    return {
      dealId: message.deal_id,
      dealName:
        audience === 'counsel' && message.side === 'buyer'
          ? (message.deal.code_name ?? message.deal.firm.name)
          : message.deal.firm.name,
      outsideName: message.deal.code_name ?? message.deal.firm.name,
      teamAccountSlug: z.string().parse(message.accounts.slug),
      side: message.side,
      authorName: counsel ? (counsel.name ?? counsel.email) : null,
    };
  },
  loadSubmittedDealUpdate: async ({ updateId }) => {
    const admin = getSupabaseServerAdminClient();
    const { data: update } = await admin
      .from('deal_update')
      .select(
        'subject, author_id, deal_id, deal(firm!inner(name)), accounts(slug)',
      )
      .eq('id', updateId)
      .single()
      .throwOnError();
    const { data: author } = await admin
      .from('accounts')
      .select('name')
      .eq('id', z.string().parse(update.author_id))
      .single()
      .throwOnError();

    return {
      subject: update.subject,
      authorName: author.name,
      dealName: update.deal.firm.name,
      dealId: update.deal_id,
      teamAccountSlug: z.string().parse(update.accounts.slug),
    };
  },
});

export { bridge as GET, bridge as POST };
