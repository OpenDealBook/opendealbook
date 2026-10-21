import type { SupabaseClient } from '@supabase/supabase-js';

import { filesUnder } from '@odb/lender-rooms/room-browser/room-places.ts';
import { loadSellerRoomListing } from '@odb/seller-rooms/files/listing.ts';
import { loadRoomQuestions } from '@odb/seller-rooms/questions/queries.ts';
import type { Database } from '@odb/supabase';

import { isNewSince } from '../../home/_lib/counsel-deals';
import { lastCounselVisits } from './counsel-visit';

export async function sellerRoomActivity(
  client: SupabaseClient<Database>,
  dealId: string,
  limit: number,
) {
  const [{ data: room }, { data: view }, visits] = await Promise.all([
    client
      .from('seller_room')
      .select('id')
      .eq('deal_id', dealId)
      .single()
      .throwOnError(),
    client.rpc('my_seller_rooms').eq('deal_id', dealId).single().throwOnError(),
    lastCounselVisits(client, 'seller_room'),
  ]);
  const since = visits.get(dealId) ?? null;
  const [listing, questions] = await Promise.all([
    loadSellerRoomListing(client, room.id),
    loadRoomQuestions(client, room.id),
  ]);

  return [
    ...[...filesUnder(listing.master!), ...filesUnder(listing.private!)].map(
      (file) => ({
        id: file.documentId,
        what: `New file: ${file.name}`,
        at: file.createdAt,
      }),
    ),
    ...questions.map((question) => ({
      id: question.id,
      what: `${view.team_name} asked: ${question.title}`,
      at: question.createdAt,
    })),
    ...questions.flatMap((question) =>
      question.messages.map((message) => ({
        id: message.id,
        what: `${message.side === 'seller' ? 'Seller' : view.team_name} on ${question.title}: ${message.body}`,
        at: message.createdAt,
      })),
    ),
  ]
    .filter((item) => isNewSince(item.at, since))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}
