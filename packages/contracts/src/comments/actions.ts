'use server';

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import { appendDealEvent } from '@odb/events';
import { TEAM_READ_ONLY } from '@odb/next';
import { enhanceAction } from '@odb/next/actions';
import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  COMMENT_TOO_LONG,
  INTERNAL_BUYER_ONLY,
  MAX_COMMENT_CHARACTERS,
  NOT_ALLOWED,
  REPLY_TO_TOP_LEVEL_ONLY,
} from '../types';
import { visibleVersion } from '../versioning/queries';

type CounselSide = Database['public']['Enums']['counsel_side'];

type Commenter =
  | { kind: 'team' }
  | { kind: 'counsel'; side: CounselSide }
  | { kind: 'seller' };

type Client = SupabaseClient<Database>;

type Outcome = { ok: true } | { ok: false; refusal: string };

const COUNSEL_SIDES = ['buyer', 'seller'] as const satisfies CounselSide[];

async function commenterOn(
  client: Client,
  userId: string,
  contractVersionId: string,
): Promise<{
  commenter: Commenter;
  accountId: string;
  dealId: string;
} | null> {
  const version = await visibleVersion(client, contractVersionId);

  if (!version) {
    return null;
  }

  const { accountId, dealId } = version;

  const { data: onTeam } = await client
    .rpc('has_role_on_account', { account_id: accountId })
    .throwOnError();

  if (onTeam) {
    const { data: works } = await client
      .rpc('has_permission', {
        user_id: userId,
        account_id: accountId,
        permission_name: 'deals.work',
      })
      .throwOnError();

    if (works) {
      return { commenter: { kind: 'team' }, accountId, dealId };
    }
  }

  for (const side of COUNSEL_SIDES) {
    const { data: isCounsel } = await client
      .rpc('is_deal_counsel', { deal_id: dealId, side })
      .throwOnError();

    if (isCounsel) {
      return { commenter: { kind: 'counsel', side }, accountId, dealId };
    }
  }

  if (await isSeller(client, dealId)) {
    return { commenter: { kind: 'seller' }, accountId, dealId };
  }

  return null;
}

async function isSeller(client: Client, dealId: string): Promise<boolean> {
  const { data: room } = await client
    .from('seller_room')
    .select('id')
    .eq('deal_id', dealId)
    .maybeSingle()
    .throwOnError();

  if (!room) {
    return false;
  }

  const { data: member } = await client
    .rpc('is_seller_room_member', { room_id: room.id })
    .throwOnError();

  return member;
}

// Counsel and sellers are not team members, so the lock trigger lets their
// writes through and they go through the service role once commenterOn has
// proven who they are. The team's lock still binds counsel, so it is checked
// here; sellers are never bound by it.
async function writerFor(
  commenter: Commenter,
  client: Client,
  accountId: string,
): Promise<Client | null> {
  if (commenter.kind === 'team') {
    return client;
  }

  const admin = getSupabaseServerAdminClient();

  if (commenter.kind === 'seller') {
    return admin;
  }

  const { data: locked } = await admin
    .rpc('is_account_locked', { target_account_id: accountId })
    .throwOnError();

  return locked ? null : admin;
}

function sideOf(commenter: Commenter): CounselSide {
  switch (commenter.kind) {
    case 'team':
      return 'buyer';
    case 'counsel':
      return commenter.side;
    case 'seller':
      return 'seller';
  }
}

const refused = (refusal: string): Outcome => ({ ok: false, refusal });

// The team writes as itself, so the lock trigger refuses it in the database.
function outcomeOf(error: PostgrestError | null): Outcome {
  if (error?.code === '42501' && error.message === 'team is read-only') {
    return refused(TEAM_READ_ONLY);
  }

  if (error) {
    throw error;
  }

  return { ok: true };
}

async function postComment(
  userId: string,
  comment: {
    contractVersionId: string;
    parentId: string | null;
    quotedText: string | null;
    body: string;
    internal: boolean;
  },
): Promise<Outcome> {
  if (
    comment.body.length > MAX_COMMENT_CHARACTERS ||
    (comment.quotedText?.length ?? 0) > MAX_COMMENT_CHARACTERS
  ) {
    return refused(COMMENT_TOO_LONG);
  }

  const client = getSupabaseServerClient();
  const found = await commenterOn(client, userId, comment.contractVersionId);

  if (!found) {
    return refused(NOT_ALLOWED);
  }

  const { commenter, accountId, dealId } = found;

  if (comment.internal && sideOf(commenter) !== 'buyer') {
    return refused(INTERNAL_BUYER_ONLY);
  }
  const writer = await writerFor(commenter, client, accountId);

  if (!writer) {
    return refused(TEAM_READ_ONLY);
  }

  const { data: posted, error } = await writer
    .from('contract_comment')
    .insert({
      account_id: accountId,
      contract_version_id: comment.contractVersionId,
      parent_id: comment.parentId,
      author_user_id: userId,
      author_side: sideOf(commenter),
      quoted_text: comment.quotedText,
      body: comment.body,
      internal: comment.internal,
    })
    .select('id, contract_version!inner(contract_id)')
    .single();

  if (error) {
    return outcomeOf(error);
  }

  await appendDealEvent(writer, {
    dealId,
    aggregateType: 'contract',
    aggregateId: posted.contract_version.contract_id,
    eventType: 'contract.comment_posted',
    payload: { comment_id: posted.id },
    actorKind: commenter.kind === 'team' ? undefined : 'service',
  });

  return { ok: true };
}

async function visibleComment(
  client: Client,
  commentId: string,
): Promise<{
  contract_version_id: string;
  parent_id: string | null;
  author_side: CounselSide;
  internal: boolean;
} | null> {
  const { data: comment } = await client
    .from('contract_comment')
    .select('contract_version_id, parent_id, author_side, internal')
    .eq('id', commentId)
    .maybeSingle()
    .throwOnError();

  return comment;
}

const body = z.string().trim().min(1);

export const addContractComment = enhanceAction(
  async (input, user) =>
    postComment(user.id, {
      contractVersionId: input.contractVersionId,
      parentId: null,
      quotedText: input.quotedText ?? null,
      body: input.body,
      internal: input.internal,
    }),
  {
    auth: true,
    schema: z.object({
      contractVersionId: z.uuid(),
      quotedText: z.string().trim().min(1).optional(),
      body,
      internal: z.boolean(),
    }),
  },
);

export const replyToContractComment = enhanceAction(
  async (input, user) => {
    const parent = await visibleComment(
      getSupabaseServerClient(),
      input.parentId,
    );

    if (!parent) {
      return refused(NOT_ALLOWED);
    }
    if (parent.parent_id !== null) {
      return refused(REPLY_TO_TOP_LEVEL_ONLY);
    }

    return postComment(user.id, {
      contractVersionId: parent.contract_version_id,
      parentId: input.parentId,
      quotedText: null,
      body: input.body,
      internal: parent.internal || input.internal,
    });
  },
  {
    auth: true,
    schema: z.object({ parentId: z.uuid(), body, internal: z.boolean() }),
  },
);

async function setResolvedAt(
  userId: string,
  commentId: string,
  resolvedAt: string | null,
): Promise<Outcome> {
  const client = getSupabaseServerClient();
  const comment = await visibleComment(client, commentId);

  if (!comment) {
    return refused(NOT_ALLOWED);
  }

  const found = await commenterOn(client, userId, comment.contract_version_id);

  if (!found || sideOf(found.commenter) !== comment.author_side) {
    return refused(NOT_ALLOWED);
  }

  const writer = await writerFor(found.commenter, client, found.accountId);

  if (!writer) {
    return refused(TEAM_READ_ONLY);
  }

  const { error } = await writer
    .from('contract_comment')
    .update({ resolved_at: resolvedAt })
    .eq('id', commentId);

  return outcomeOf(error);
}

export const resolveContractComment = enhanceAction(
  async (input, user) =>
    setResolvedAt(user.id, input.commentId, new Date().toISOString()),
  { auth: true, schema: z.object({ commentId: z.uuid() }) },
);

export const reopenContractComment = enhanceAction(
  async (input, user) => setResolvedAt(user.id, input.commentId, null),
  { auth: true, schema: z.object({ commentId: z.uuid() }) },
);
