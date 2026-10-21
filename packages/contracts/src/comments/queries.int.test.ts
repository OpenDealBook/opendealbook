import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@odb/supabase';

import {
  ANON_KEY,
  SUPABASE_URL,
  admin,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
} from '../../../features/seller-rooms/src/test-support/world.ts';
import { versionComments } from './queries';

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let owner: Person;
let sellerCounsel: Person;
let teamId: string;
let versionId: string;
let emptyVersionId: string;
const ids = {
  first: crypto.randomUUID(),
  second: crypto.randomUUID(),
  internal: crypto.randomUUID(),
  laterReply: crypto.randomUUID(),
  earlierReply: crypto.randomUUID(),
};

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

beforeAll(async () => {
  owner = await provisionPerson();
  sellerCounsel = await provisionPerson();
  teamId = await provisionTeam(owner, 'Comment Readers');
  const dealId = await newDeal(teamId, owner);

  await admin
    .from('accounts')
    .update({ name: 'Olive Owner' })
    .eq('primary_owner_user_id', owner.userId)
    .eq('is_personal_account', true)
    .throwOnError();
  await admin
    .from('deal_counsel')
    .insert({
      account_id: teamId,
      deal_id: dealId,
      side: 'seller',
      user_id: sellerCounsel.userId,
      email: sellerCounsel.email,
      name: 'Dana Lee',
    })
    .throwOnError();

  const contractId = crypto.randomUUID();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'contract',
      p_aggregate_id: contractId,
      p_event_type: 'contract.created',
      p_payload: { type: 'apa', status: 'draft', current_version: 0 },
      p_actor_kind: 'service',
    })
    .throwOnError();
  const newVersion = async (version: number) => {
    const { data } = await admin
      .from('contract_version')
      .insert({
        contract_id: contractId,
        account_id: teamId,
        version,
        source: 'upload',
        party: 'seller',
      })
      .select('id')
      .single()
      .throwOnError();

    return data.id;
  };
  versionId = await newVersion(1);
  emptyVersionId = await newVersion(2);

  const comment = (
    id: string,
    author: Person,
    side: 'buyer' | 'seller',
    minutes: number,
    {
      parent_id = null,
      internal = false,
      quoted_text = null,
    }: {
      parent_id?: string | null;
      internal?: boolean;
      quoted_text?: string | null;
    } = {},
  ) => ({
    id,
    parent_id,
    internal,
    quoted_text,
    account_id: teamId,
    contract_version_id: versionId,
    author_user_id: author.userId,
    author_side: side,
    body: `Body ${id}`,
    created_at: minutesAgo(minutes),
  });

  await admin
    .from('contract_comment')
    .insert([
      comment(ids.first, owner, 'buyer', 50, { quoted_text: 'Price' }),
      comment(ids.second, sellerCounsel, 'seller', 40),
      comment(ids.internal, owner, 'buyer', 30, { internal: true }),
    ])
    .throwOnError();
  await admin
    .from('contract_comment')
    .insert([
      comment(ids.laterReply, owner, 'buyer', 10, { parent_id: ids.first }),
      comment(ids.earlierReply, sellerCounsel, 'seller', 20, {
        parent_id: ids.first,
      }),
    ])
    .throwOnError();
  await admin
    .from('contract_comment')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', ids.second)
    .throwOnError();
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('versionComments', () => {
  it('threads what the viewer may read, oldest first, with each author named', async () => {
    const comments = await versionComments(sellerCounsel.client, [
      versionId,
      emptyVersionId,
    ]);

    expect(comments).toEqual({
      [versionId]: [
        {
          id: ids.first,
          author: { name: 'Olive Owner', role: 'team' },
          side: 'buyer',
          quotedText: 'Price',
          body: `Body ${ids.first}`,
          internal: false,
          resolved: false,
          replies: [
            {
              id: ids.earlierReply,
              author: { name: 'Dana Lee', role: 'seller_counsel' },
              side: 'seller',
              quotedText: null,
              body: `Body ${ids.earlierReply}`,
              internal: false,
              resolved: false,
            },
            expect.objectContaining({ id: ids.laterReply }),
          ],
        },
        expect.objectContaining({
          id: ids.second,
          resolved: true,
          replies: [],
        }),
      ],
      [emptyVersionId]: [],
    });
  });

  it('gives the team internal comments too', async () => {
    const comments = await versionComments(owner.client, [versionId]);

    expect(comments[versionId]!.map((thread) => thread.id)).toEqual([
      ids.first,
      ids.second,
      ids.internal,
    ]);
  });

  it('names every author when a comment arrives between the reads', async () => {
    const late = crypto.randomUUID();
    const { data: session } = await owner.client.auth.getSession();
    let reads = 0;
    const racingClient = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: {
          Authorization: `Bearer ${session.session!.access_token}`,
        },
        fetch: async (input, init) => {
          const url = String(input);
          const isRead =
            url.includes('/rest/v1/contract_comment?') ||
            url.includes('/rpc/contract_comment_authors');

          if (isRead && url.includes('/rest/v1/contract_comment?')) {
            await new Promise((resolve) => setImmediate(resolve));
          }

          if (isRead && ++reads === 2) {
            await admin
              .from('contract_comment')
              .insert({
                id: late,
                account_id: teamId,
                contract_version_id: versionId,
                author_user_id: owner.userId,
                author_side: 'buyer',
                body: 'Arrived late',
              })
              .throwOnError();
          }

          return fetch(input, init);
        },
      },
    });

    const comments = await versionComments(racingClient, [versionId]);

    expect(
      comments[versionId]!.map((thread) => thread.author.name),
    ).not.toContain(null);
  });
});
