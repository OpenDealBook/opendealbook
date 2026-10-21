import { z } from 'zod';

import {
  CONTRACT_NEGOTIATION_WORKFLOW_ID,
  counselItemPath,
  type DealItem,
  dealPath,
  LENDER_ROOM_DOCUMENTS_WORKFLOW_ID,
  type NotifiableDealEvent,
  SELLER_COUNSEL_FOLDER_WORKFLOW_ID,
  SELLER_COUNSEL_MESSAGE_WORKFLOW_ID,
  SELLER_ROOM_SHARED_WORKFLOW_ID,
  sellerItemPath,
  teamItemPath,
} from '@odb/notifications/relay';
import {
  createNovuClient,
  type NovuClient,
  triggerNotification,
} from '@odb/notifications/server';
import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { dealManagerIds } from '../dealManagers';

const addedDocumentSchema = z.object({
  folder_id: z.uuid(),
  name: z.string(),
  version: z.preprocess((version) => version ?? 1, z.coerce.number()),
  uploaded_by: z.string().nullish(),
});

type LenderDocumentRecipient =
  Database['public']['Functions']['lender_document_recipients']['Returns'][number];

function keepFirstRoomPerPerson(
  recipients: LenderDocumentRecipient[],
): LenderDocumentRecipient[] {
  const firstByUserId = new Map<string, LenderDocumentRecipient>();
  for (const recipient of recipients) {
    const kept = firstByUserId.get(recipient.user_id);
    if (!kept || recipient.room_id < kept.room_id) {
      firstByUserId.set(recipient.user_id, recipient);
    }
  }
  return [...firstByUserId.values()];
}

export interface FetchDealNotificationEventsInput {
  afterGlobalSeq: number;
  limit: number;
}

export async function fetchDealNotificationEvents(
  input: FetchDealNotificationEventsInput,
): Promise<NotifiableDealEvent[]> {
  const client = getSupabaseServerAdminClient();

  const { data, error } = await client
    .from('deal_event')
    .select('global_seq, deal_id, account_id, actor_ref, event_type, payload')
    .gt('global_seq', input.afterGlobalSeq)
    .order('global_seq', { ascending: true })
    .limit(input.limit);

  if (error) {
    throw error;
  }

  return data.map((row) => ({
    globalSeq: row.global_seq,
    dealId: row.deal_id,
    accountId: row.account_id,
    actorRef: row.actor_ref,
    eventType: row.event_type,
    stage: (row.payload as { stage?: string } | null)?.stage ?? null,
  }));
}

export interface NotifyDealEventInput {
  globalSeq: number;
  workflowId: string;
  dealId: string;
  accountId: string;
  actorRef: string | null;
  eventType: string;
}

let loggedNovuNotConfigured = false;

export async function notifyDealEvent(
  input: NotifyDealEventInput,
): Promise<void> {
  const novuConfigured = Boolean(
    process.env.NOVU_API_KEY && process.env.NOVU_API_URL,
  );
  if (!novuConfigured && !loggedNovuNotConfigured) {
    loggedNovuNotConfigured = true;
    console.info(
      'Novu not configured (NOVU_API_KEY, NOVU_API_URL); skipping deal-event emails',
    );
  }

  if (
    !novuConfigured &&
    (input.workflowId === LENDER_ROOM_DOCUMENTS_WORKFLOW_ID ||
      input.workflowId === CONTRACT_NEGOTIATION_WORKFLOW_ID ||
      input.workflowId === SELLER_COUNSEL_MESSAGE_WORKFLOW_ID)
  ) {
    return;
  }

  if (input.workflowId === SELLER_COUNSEL_MESSAGE_WORKFLOW_ID) {
    await tellOtherSellerSideOfMessage(input);
    return;
  }

  if (input.workflowId === LENDER_ROOM_DOCUMENTS_WORKFLOW_ID) {
    await notifyRoomPeopleOfDocument(input);
    return;
  }

  if (input.workflowId === CONTRACT_NEGOTIATION_WORKFLOW_ID) {
    await notifyContractNegotiation(input);
    return;
  }

  const client = getSupabaseServerAdminClient();

  const { data: deal } = await client
    .from('deal')
    .select('firm!inner(name), accounts(slug)')
    .eq('id', input.dealId)
    .maybeSingle()
    .throwOnError();
  if (!deal) {
    console.info(
      `Deal event ${input.globalSeq} skipped; deal ${input.dealId} was deleted`,
    );
    return;
  }
  const accountSlug = z.string().parse(deal.accounts.slug);
  const firmName = deal.firm.name;
  const dealManagers = await dealManagerIds(input.accountId);

  const outcome =
    input.workflowId === 'deal.resolved'
      ? await resolutionOutcome(client, input.globalSeq)
      : undefined;
  const path = OFFER_WORKFLOW_IDS.has(input.workflowId)
    ? teamItemPath(accountSlug, input.dealId, {
        kind: 'offer',
        id: await aggregateOf(client, input.globalSeq),
      })
    : dealPath(accountSlug, input.dealId);

  await client
    .from('notifications')
    .upsert(
      dealManagers.map((recipientUserId) => ({
        account_id: input.accountId,
        recipient_user_id: recipientUserId,
        deal_id: input.dealId,
        type: 'info' as const,
        body: dealEventNotice(input.workflowId, firmName, outcome),
        link: path,
        dedupe_key: `deal_event:${input.globalSeq}:${recipientUserId}`,
      })),
      { onConflict: 'dedupe_key', ignoreDuplicates: true },
    )
    .throwOnError();

  if (!novuConfigured) {
    return;
  }

  const novu = createNovuClient();
  const payload = {
    dealId: input.dealId,
    dealName: firmName,
    firmName,
    path,
    outcome,
    actor: input.actorRef,
    event: input.eventType,
  };

  for (const userId of dealManagers) {
    try {
      await triggerNotification(
        { novu, client },
        {
          eventType: input.workflowId,
          recipientUserId: userId,
          payload,
        },
      );
    } catch (error) {
      console.warn(
        `Novu deal-event notification ${input.workflowId} failed for ${userId}`,
        error,
      );
    }
  }
}

const DEAL_EVENT_LABELS: Record<string, string> = {
  'deal.offer_submitted': 'Offer submitted',
  'deal.offer_accepted': 'Offer accepted',
  'deal.loi_accepted': 'LOI accepted',
  'deal.apa_accepted': 'APA accepted',
};

function dealEventNotice(
  workflowId: string,
  name: string,
  outcome: 'closed' | 'lost' | undefined,
): string {
  if (workflowId === 'deal.resolved') {
    return outcome === 'lost' ? `${name} was marked lost` : `${name} closed`;
  }

  return `${DEAL_EVENT_LABELS[workflowId]} on ${name}`;
}

const OFFER_WORKFLOW_IDS = new Set([
  'deal.offer_submitted',
  'deal.offer_accepted',
]);

async function aggregateOf(
  client: ReturnType<typeof getSupabaseServerAdminClient>,
  globalSeq: number,
): Promise<string> {
  const { data: event } = await client
    .from('deal_event')
    .select('aggregate_id')
    .eq('global_seq', globalSeq)
    .single()
    .throwOnError();

  return event.aggregate_id;
}

async function resolutionOutcome(
  client: ReturnType<typeof getSupabaseServerAdminClient>,
  globalSeq: number,
): Promise<'closed' | 'lost'> {
  const { data: event } = await client
    .from('deal_event')
    .select('payload')
    .eq('global_seq', globalSeq)
    .single()
    .throwOnError();
  const { resolution } = z
    .object({ resolution: z.string() })
    .parse(event.payload);

  return resolution === 'lost' ? 'lost' : 'closed';
}

async function notifyRoomPeopleOfDocument(
  input: NotifyDealEventInput,
): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const { data: event } = await client
    .from('deal_event')
    .select('aggregate_id, payload')
    .eq('global_seq', input.globalSeq)
    .maybeSingle()
    .throwOnError();

  if (!event) {
    console.error(
      `Room document notification skipped; deal event ${input.globalSeq} was not found`,
    );
    return;
  }

  const document = addedDocumentSchema.safeParse(event.payload);

  if (!document.success) {
    console.error(
      `Room document notification skipped; deal event ${input.globalSeq} has an unreadable payload`,
      document.error,
    );
    return;
  }

  const [{ data: recipients }, { data: sellers }] = await Promise.all([
    client
      .rpc('lender_document_recipients', { document_id: event.aggregate_id })
      .throwOnError(),
    client
      .rpc('seller_document_recipients', { document_id: event.aggregate_id })
      .throwOnError(),
  ]);

  const { data: sellerAccounts } = await client
    .from('accounts')
    .select('id, timezone')
    .in(
      'id',
      sellers.map((seller) => seller.user_id),
    )
    .throwOnError();
  const timezones = new Map(
    sellerAccounts.map((account) => [
      account.id,
      account.timezone ?? undefined,
    ]),
  );
  const uploaderUserId = document.data.uploaded_by ?? input.actorRef;
  const novu = createNovuClient();
  const warnOnFailure = (who: string) => ({
    subscribers: novu.subscribers,
    trigger: (workflowId: string, data: Parameters<typeof novu.trigger>[1]) =>
      novu.trigger(workflowId, data).catch((error: unknown) => {
        console.warn(
          `Novu room document notification failed for ${who}`,
          error,
        );
      }),
  });

  for (const seller of sellers) {
    if (seller.user_id === uploaderUserId) {
      continue;
    }

    await triggerNotification(
      { novu: warnOnFailure(seller.user_id), client },
      {
        eventType: SELLER_ROOM_SHARED_WORKFLOW_ID,
        recipientUserId: seller.user_id,
        email: seller.email,
        payload: {
          kind: 'document',
          roomId: seller.room_id,
          documentId: event.aggregate_id,
          isNewVersion: document.data.version > 1,
          timezone: timezones.get(seller.user_id),
        },
        transactionId: `${SELLER_ROOM_SHARED_WORKFLOW_ID}:${input.globalSeq}:${seller.room_id}:${seller.user_id}`,
      },
    );
  }

  for (const recipient of keepFirstRoomPerPerson(recipients)) {
    if (recipient.user_id === uploaderUserId) {
      continue;
    }

    await triggerNotification(
      { novu: warnOnFailure(recipient.user_id), client },
      {
        eventType: input.workflowId,
        recipientUserId: recipient.user_id,
        email: recipient.email,
        payload: {
          roomId: recipient.room_id,
          dealId: input.dealId,
          documentId: event.aggregate_id,
          isNewVersion: document.data.version > 1,
        },
        transactionId: `${input.workflowId}:${input.globalSeq}:${recipient.user_id}`,
      },
    );
  }

  if (await isInSellerCounselFolder(input.dealId, document.data.folder_id)) {
    const added = await whatWasAdded(
      input,
      document.data.name,
      storedDocumentSchema.parse(event.payload).storage_path,
    );
    if (added) {
      await tellOtherSellerSide(input, added, uploaderUserId!, warnOnFailure);
    }
  }
}

const storedDocumentSchema = z.object({ storage_path: z.string() });

// A ZIP lands as one dr_document.added per file it held. The first of them
// tells of the whole ZIP and the rest tell of nothing.
async function whatWasAdded(
  input: NotifyDealEventInput,
  name: string,
  storagePath: string,
): Promise<{ fileName: string; fileCount: number } | null> {
  const client = getSupabaseServerAdminClient();
  const { data: item } = await client
    .from('upload_item')
    .select(
      'upload_batch!inner(kind, file_count, source_filename, upload_item(storage_path))',
    )
    .eq('storage_path', storagePath)
    .maybeSingle()
    .throwOnError();
  if (item?.upload_batch.kind !== 'zip') {
    return { fileName: name, fileCount: 1 };
  }

  const { data: earlier } = await client
    .from('deal_event')
    .select('global_seq')
    .eq('deal_id', input.dealId)
    .eq('event_type', 'dr_document.added')
    .lt('global_seq', input.globalSeq)
    .in(
      'payload->>storage_path',
      item.upload_batch.upload_item.map((each) => each.storage_path),
    )
    .limit(1)
    .throwOnError();

  return earlier.length > 0
    ? null
    : {
        fileName: `${item.upload_batch.file_count} files (${item.upload_batch.source_filename})`,
        fileCount: item.upload_batch.file_count,
      };
}

async function isInSellerCounselFolder(
  dealId: string,
  folderId: string,
): Promise<boolean> {
  const client = getSupabaseServerAdminClient();
  const [{ data: counselFolder }, { data: folders }] = await Promise.all([
    client
      .from('seller_counsel_folder')
      .select('folder_id')
      .eq('deal_id', dealId)
      .maybeSingle()
      .throwOnError(),
    client
      .from('dr_folder')
      .select('id, parent_id')
      .eq('deal_id', dealId)
      .throwOnError(),
  ]);
  const parentOf = new Map(
    folders.map((folder) => [folder.id, folder.parent_id]),
  );

  for (
    let current: string | null | undefined = folderId;
    current;
    current = parentOf.get(current)
  ) {
    if (current === counselFolder?.folder_id) {
      return true;
    }
  }

  return false;
}

interface SellerSideParty {
  userId: string;
  name: string;
  email: string;
}

// A file in the Seller's counsel folder is told to the other seller-side
// party only: counsel's files to the sellers, a seller's files to counsel.
async function tellOtherSellerSide(
  input: NotifyDealEventInput,
  added: { fileName: string; fileCount: number },
  uploaderUserId: string,
  warnOnFailure: (who: string) => NovuClient,
): Promise<void> {
  const client = getSupabaseServerAdminClient();
  const [{ data: deal }, { data: room }, { data: counsel }] = await Promise.all(
    [
      client
        .from('deal')
        .select('firm!inner(name)')
        .eq('id', input.dealId)
        .single()
        .throwOnError(),
      client
        .from('seller_room')
        .select('id, seller_room_member(user_id, name, email)')
        .eq('deal_id', input.dealId)
        .single()
        .throwOnError(),
      client
        .from('deal_counsel')
        .select('user_id, name, email')
        .eq('deal_id', input.dealId)
        .eq('side', 'seller')
        .throwOnError(),
    ],
  );

  const sellers: SellerSideParty[] = room.seller_room_member.map((member) => ({
    userId: member.user_id,
    name: member.name,
    email: member.email,
  }));
  const sellerCounsel: SellerSideParty[] = counsel.map((each) => ({
    userId: each.user_id,
    name: each.name ?? each.email,
    email: each.email,
  }));
  const uploadedBySeller = sellers.some(
    (seller) => seller.userId === uploaderUserId,
  );
  const uploader = [...sellers, ...sellerCounsel].find(
    (party) => party.userId === uploaderUserId,
  );

  if (!uploader) {
    console.info(
      `Seller's counsel folder notice ${input.globalSeq} skipped; the uploader is no longer on the seller side`,
    );
    return;
  }

  for (const recipient of uploadedBySeller ? sellerCounsel : sellers) {
    await triggerNotification(
      { novu: warnOnFailure(recipient.userId), client },
      {
        eventType: SELLER_COUNSEL_FOLDER_WORKFLOW_ID,
        recipientUserId: recipient.userId,
        email: recipient.email,
        payload: {
          audience: uploadedBySeller ? 'counsel' : 'seller',
          dealId: input.dealId,
          roomId: room.id,
          uploaderName: uploader.name,
          ...added,
          businessName: deal.firm.name,
        },
        transactionId: `${SELLER_COUNSEL_FOLDER_WORKFLOW_ID}:${input.globalSeq}:${recipient.userId}`,
      },
    );
  }
}

// A thread message is emailed to the other seller-side party only: the
// seller's words to counsel, counsel's to the sellers. The team is never told.
async function tellOtherSellerSideOfMessage(
  input: NotifyDealEventInput,
): Promise<void> {
  const client = getSupabaseServerAdminClient();
  const { data: event } = await client
    .from('deal_event')
    .select('aggregate_id')
    .eq('global_seq', input.globalSeq)
    .maybeSingle()
    .throwOnError();

  if (!event) {
    console.info(
      `Seller and counsel thread notice skipped; deal event ${input.globalSeq} was not found`,
    );
    return;
  }

  const [{ data: message }, { data: deal }, { data: room }, { data: counsel }] =
    await Promise.all([
      client
        .from('seller_counsel_message')
        .select('author_side, author_name')
        .eq('id', event.aggregate_id)
        .maybeSingle()
        .throwOnError(),
      client
        .from('deal')
        .select('code_name, firm!inner(name)')
        .eq('id', input.dealId)
        .maybeSingle()
        .throwOnError(),
      client
        .from('seller_room')
        .select('id, seller_room_member(user_id, email)')
        .eq('deal_id', input.dealId)
        .maybeSingle()
        .throwOnError(),
      client
        .from('deal_counsel')
        .select('user_id, email')
        .eq('deal_id', input.dealId)
        .eq('side', 'seller')
        .throwOnError(),
    ]);

  if (!message || !deal || !room) {
    console.info(
      `Seller and counsel thread notice ${input.globalSeq} skipped; its message, deal or seller room was not found`,
    );
    return;
  }

  const audience = message.author_side === 'seller' ? 'counsel' : 'seller';
  const recipients = audience === 'counsel' ? counsel : room.seller_room_member;
  const novu = createNovuClient();

  for (const recipient of recipients) {
    await triggerNotification(
      {
        novu: {
          subscribers: novu.subscribers,
          trigger: (workflowId, data) =>
            novu.trigger(workflowId, data).catch((error: unknown) => {
              console.warn(
                `Novu seller and counsel thread notification failed for ${recipient.user_id}`,
                error,
              );
            }),
        },
        client,
      },
      {
        eventType: SELLER_COUNSEL_MESSAGE_WORKFLOW_ID,
        recipientUserId: recipient.user_id,
        email: recipient.email,
        payload: {
          audience,
          dealId: input.dealId,
          roomId: room.id,
          authorName: message.author_name,
          messageId: event.aggregate_id,
          businessName: deal.firm.name,
          outsideName: deal.code_name ?? deal.firm.name,
        },
        transactionId: `${SELLER_COUNSEL_MESSAGE_WORKFLOW_ID}:${input.globalSeq}:${recipient.user_id}`,
      },
    );
  }
}

type CounselSide = Database['public']['Enums']['counsel_side'];
type Audience = 'team' | CounselSide;

const ROLE_LABEL = {
  team: 'Buyer',
  buyer_counsel: "Buyer's counsel",
  seller_counsel: "Seller's counsel",
  seller: 'Seller',
};

const versionEventSchema = z.object({ version_id: z.uuid() });
const commentEventSchema = z.object({ comment_id: z.uuid() });
const reviewEventSchema = z.object({ id: z.uuid() });

type Verdict = Database['public']['Enums']['contract_review_verdict'];

const VERDICT_TEXT: Record<Verdict, string> = {
  approved: 'approved',
  approved_with_comments: 'approved with comments',
  changes_needed: 'asked for changes to',
};

const CONTRACT_LABEL: Record<string, string> = { loi: 'LOI', apa: 'APA' };

const ENVELOPE_OUT = new Set<string | null>(['draft', 'sent']);

interface NegotiatedVersion {
  id: string;
  version: number;
  seller_number: number | null;
  party: string;
  shared_at: string | null;
  contract: { type: string };
}

interface Negotiation {
  kind:
    | 'version'
    | 'comment'
    | 'review_requested'
    | 'review_decided'
    | 'signing_overridden';
  version: NegotiatedVersion;
  item: DealItem<'contract-version' | 'contract-review' | 'contract-comment'>;
  authorUserId: string | null;
  commentSide: CounselSide | null;
  audiences: Audience[];
  verdict?: Verdict;
  outForSignature?: boolean;
  reason?: string;
}

interface DealCounsel {
  user_id: string;
  email: string;
  side: CounselSide;
  name: string | null;
}

function shownToSellerSide(version: NegotiatedVersion): boolean {
  return version.shared_at !== null || version.party === 'seller';
}

async function negotiationOf(
  eventType: string,
  payload: unknown,
): Promise<Negotiation> {
  const client = getSupabaseServerAdminClient();
  const versionColumns =
    'id, version, seller_number, party, shared_at, contract!inner(type)';

  if (eventType === 'contract.comment_posted') {
    const { data: comment } = await client
      .from('contract_comment')
      .select(
        `id, author_user_id, author_side, internal, created_at, contract_version!inner(${versionColumns})`,
      )
      .eq('id', commentEventSchema.parse(payload).comment_id)
      .single()
      .throwOnError();
    const shown = comment.contract_version;
    const { data: threadStartedAt } = await client
      .rpc('contract_comment_thread_started_at', { comment_id: comment.id })
      .throwOnError();
    // As seller_side_reads_contract_comment: the comment and its whole thread
    // come after the team shared the version.
    const sellerSideSees =
      !comment.internal &&
      shownToSellerSide(shown) &&
      (shown.party === 'seller' ||
        (Date.parse(comment.created_at) >= Date.parse(shown.shared_at!) &&
          Date.parse(threadStartedAt) >= Date.parse(shown.shared_at!)));

    return {
      kind: 'comment',
      version: comment.contract_version,
      item: { kind: 'contract-comment', id: comment.id },
      authorUserId: comment.author_user_id,
      commentSide: comment.author_side,
      audiences: sellerSideSees
        ? ['team', 'buyer', 'seller']
        : ['team', 'buyer'],
    };
  }

  if (eventType === 'contract.review_requested') {
    const { data: request } = await client
      .from('contract_review_request')
      .select(`requested_by, contract_version!inner(${versionColumns})`)
      .eq('id', reviewEventSchema.parse(payload).id)
      .single()
      .throwOnError();

    return {
      kind: 'review_requested',
      version: request.contract_version,
      item: { kind: 'contract-review', id: request.contract_version.id },
      authorUserId: request.requested_by,
      commentSide: null,
      audiences: shownToSellerSide(request.contract_version)
        ? ['buyer', 'seller']
        : ['buyer'],
    };
  }

  if (eventType === 'contract.review_decided') {
    const { data: decision } = await client
      .from('contract_review_decision')
      .select(
        `side, decision, decided_by, contract_version!inner(signing_status, ${versionColumns})`,
      )
      .eq('id', reviewEventSchema.parse(payload).id)
      .single()
      .throwOnError();

    return {
      kind: 'review_decided',
      version: decision.contract_version,
      item: { kind: 'contract-review', id: decision.contract_version.id },
      authorUserId: decision.decided_by,
      commentSide: decision.side,
      audiences: ['team'],
      verdict: decision.decision,
      outForSignature:
        decision.decision === 'changes_needed' &&
        ENVELOPE_OUT.has(decision.contract_version.signing_status),
    };
  }

  if (eventType === 'contract.signing_overridden') {
    const { data: override } = await client
      .from('contract_signing_override')
      .select(
        `reason, overridden_by, contract_version!inner(${versionColumns})`,
      )
      .eq('id', reviewEventSchema.parse(payload).id)
      .single()
      .throwOnError();

    return {
      kind: 'signing_overridden',
      version: override.contract_version,
      item: { kind: 'contract-review', id: override.contract_version.id },
      authorUserId: override.overridden_by,
      commentSide: null,
      audiences: shownToSellerSide(override.contract_version)
        ? ['team', 'buyer', 'seller']
        : ['team', 'buyer'],
      reason: override.reason,
    };
  }

  const { data: version } = await client
    .from('contract_version')
    .select(`author_user_id, ${versionColumns}`)
    .eq('id', versionEventSchema.parse(payload).version_id)
    .single()
    .throwOnError();

  return {
    kind: 'version',
    version,
    item: { kind: 'contract-version', id: version.id },
    authorUserId: version.author_user_id,
    commentSide: null,
    audiences:
      eventType !== 'contract.version_shown_to_seller_side'
        ? ['team', 'buyer']
        : shownToSellerSide(version)
          ? ['seller']
          : [],
  };
}

// The same rules as contract_comment_authors, which a service-role caller
// cannot use: its visibility clause needs a signed-in reader.
async function actorOf(
  input: NotifyDealEventInput,
  negotiation: Negotiation,
  counsel: DealCounsel[],
): Promise<string> {
  const client = getSupabaseServerAdminClient();
  const authorIds =
    negotiation.authorUserId === null ? [] : [negotiation.authorUserId];
  const authorCounsel = counsel.find(
    (person) =>
      person.user_id === negotiation.authorUserId &&
      (negotiation.commentSide ?? person.side) === person.side,
  );
  const side = negotiation.commentSide ?? authorCounsel?.side ?? 'buyer';

  const [{ data: memberships }, { data: roomMembers }, { data: accounts }] =
    await Promise.all([
      client
        .from('accounts_memberships')
        .select('user_id')
        .eq('account_id', input.accountId)
        .in('user_id', authorIds)
        .throwOnError(),
      client
        .from('seller_room_member')
        .select('name, seller_room!inner(deal_id)')
        .eq('seller_room.deal_id', input.dealId)
        .in('user_id', authorIds)
        .throwOnError(),
      client
        .from('accounts')
        .select('name')
        .eq('is_personal_account', true)
        .in('primary_owner_user_id', authorIds)
        .throwOnError(),
    ]);

  const role =
    side === 'buyer'
      ? memberships.length > 0
        ? 'team'
        : 'buyer_counsel'
      : authorCounsel
        ? 'seller_counsel'
        : 'seller';
  const name =
    authorCounsel?.name ??
    (side === 'seller' ? roomMembers[0]?.name : undefined) ??
    accounts[0]?.name;

  return name === undefined
    ? ROLE_LABEL[role]
    : `${name} (${ROLE_LABEL[role]})`;
}

async function notifyContractNegotiation(
  input: NotifyDealEventInput,
): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const { data: event } = await client
    .from('deal_event')
    .select('payload')
    .eq('global_seq', input.globalSeq)
    .maybeSingle()
    .throwOnError();
  if (!event) {
    console.info(
      `Deal event ${input.globalSeq} skipped; deal ${input.dealId} was deleted`,
    );
    return;
  }

  const negotiation = await negotiationOf(input.eventType, event.payload);

  const [{ data: deal }, { data: counsel }] = await Promise.all([
    client
      .from('deal')
      .select(
        'owner_user_id, code_name, archived_at, resolution, firm!inner(name), accounts!deal_account_id_fkey(slug)',
      )
      .eq('id', input.dealId)
      .single()
      .throwOnError(),
    client
      .from('deal_counsel')
      .select('user_id, email, side, name')
      .eq('deal_id', input.dealId)
      .throwOnError(),
  ]);

  const teamIds = [
    ...new Set([
      ...(deal.owner_user_id ? [deal.owner_user_id] : []),
      ...(await dealManagerIds(input.accountId)),
    ]),
  ];
  const { data: teamAccounts } = await client
    .from('accounts')
    .select('primary_owner_user_id, email')
    .eq('is_personal_account', true)
    .in('primary_owner_user_id', teamIds)
    .throwOnError();

  const sellerStandsInForCounsel =
    (negotiation.kind === 'review_requested' ||
      negotiation.kind === 'signing_overridden') &&
    !counsel.some((person) => person.side === 'seller');
  const sellers = sellerStandsInForCounsel
    ? (
        await client
          .from('seller_room_member')
          .select('user_id, email, room_id, seller_room!inner(deal_id)')
          .eq('seller_room.deal_id', input.dealId)
          .throwOnError()
      ).data
    : [];

  const teamPath = teamItemPath(
    z.string().parse(deal.accounts.slug),
    input.dealId,
    negotiation.item,
  );
  const counselCanRead = deal.archived_at === null && deal.resolution === null;
  const recipients = [
    ...teamAccounts.map((account) => ({
      userId: account.primary_owner_user_id,
      email: account.email,
      audience: 'team' as Audience,
      path: teamPath,
    })),
    ...(counselCanRead ? counsel : []).map((person) => ({
      userId: person.user_id,
      email: person.email,
      audience: person.side as Audience,
      path: counselItemPath(input.dealId, negotiation.item),
    })),
    ...sellers.map((seller) => ({
      userId: seller.user_id,
      email: seller.email,
      audience: 'seller' as Audience,
      path: sellerItemPath(seller.room_id, negotiation.item),
    })),
  ].filter(
    (recipient) =>
      negotiation.audiences.includes(recipient.audience) &&
      recipient.userId !== negotiation.authorUserId,
  );

  const actor = await actorOf(input, negotiation, counsel);
  const inAppNotice = reviewNotice(negotiation, actor, deal.firm.name);

  if (inAppNotice) {
    await client
      .from('notifications')
      .upsert(
        recipients
          .filter((recipient) => recipient.audience === 'team')
          .map((recipient) => ({
            account_id: input.accountId,
            recipient_user_id: recipient.userId,
            deal_id: input.dealId,
            type: 'info' as const,
            body: inAppNotice,
            link: teamPath,
            dedupe_key: `deal_event:${input.globalSeq}:${recipient.userId}`,
          })),
        { onConflict: 'dedupe_key', ignoreDuplicates: true },
      )
      .throwOnError();
  }

  const novu = createNovuClient();

  for (const recipient of recipients) {
    try {
      await triggerNotification(
        { novu, client },
        {
          eventType: input.workflowId,
          recipientUserId: recipient.userId,
          email: recipient.email ?? undefined,
          payload: {
            kind: negotiation.kind,
            contractType: negotiation.version.contract.type,
            version:
              recipient.audience === 'seller'
                ? negotiation.version.seller_number
                : negotiation.version.version,
            actor,
            dealName:
              recipient.audience === 'buyer'
                ? (deal.code_name ?? deal.firm.name)
                : deal.firm.name,
            ...(recipient.audience === 'team'
              ? {}
              : { outsideName: deal.code_name ?? deal.firm.name }),
            verdict: negotiation.verdict,
            outForSignature: negotiation.outForSignature,
            reason: negotiation.reason,
            path: recipient.path,
          },
          transactionId: `${input.workflowId}:${input.globalSeq}:${recipient.userId}`,
        },
      );
    } catch (error) {
      console.warn(
        `Novu contract negotiation notification failed for ${recipient.userId}`,
        error,
      );
    }
  }
}

function reviewNotice(
  negotiation: Negotiation,
  actor: string,
  dealName: string,
): string | null {
  const contract = `version ${negotiation.version.version} of the ${CONTRACT_LABEL[negotiation.version.contract.type]} on ${dealName}`;

  switch (negotiation.kind) {
    case 'review_decided':
      return `${actor} ${VERDICT_TEXT[negotiation.verdict!]} ${contract}.${negotiation.outForSignature ? ' It is already out for signature and was not recalled.' : ''}`;
    case 'signing_overridden':
      return `${actor} overrode counsel sign-off on ${contract}: ${negotiation.reason}`;
    default:
      return null;
  }
}
