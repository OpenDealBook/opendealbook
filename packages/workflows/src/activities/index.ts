import { getMailer } from '@odb/mailers';
import { createNovuClient, triggerNotification } from '@odb/notifications/server';
import type { Enums } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { runVerification } from '@odb/verification';

export {
  discoverSbaResources,
  loadDealBoxNaicsUnion,
  refreshSbaProgram,
} from '../comps/sbaLoans';
export { writeCloseComp } from '../comps/writeCloseComp';
export { fetchDealEventsSince } from '../comps/relay';
export {
  fetchDealNotificationEvents,
  notifyDealEvent,
} from '../notifications/relay';
export { recordDealActivity } from '../comps/recordDealActivity';
export { detectDuplicates } from '../comps/detectDuplicates';
export { anonymizeClose } from '../comps/anonymizeClose';
export {
  fetchDueOutreachAccounts,
  dispatchAccountOutreach,
} from '../outreach/dispatch';
export {
  sendTrialDripEmail,
  checkTrialDripEligibility,
} from '../trialDrip/activities';

import { buildBrokerCatchUpEmail, firstName } from '../brokerCatchUpEmail';
import { chunkMarkdown } from '../documentIngestion/chunk';
import type { DoclingConfig } from '../documentIngestion/docling';
import { extractMarkdown } from '../documentIngestion/docling';
import { embedTexts } from '../documentIngestion/embeddings';
import { buildDocumentExtractionChecks } from '../documentIngestion/verificationGather';
import type { BrokerCatchUpConfig } from '../workflows/brokerCatchUp';

export interface CreateNotificationInput {
  accountId: string;
  recipientUserId: string;
  type: Enums<'notification_type'>;
  body: string;
  link?: string;
}

export async function createNotification(
  input: CreateNotificationInput,
): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const { error } = await client.from('notifications').insert({
    account_id: input.accountId,
    recipient_user_id: input.recipientUserId,
    type: input.type,
    body: input.body,
    link: input.link ?? null,
  });

  if (error) {
    throw error;
  }
}

export interface BrokerContact {
  id: string;
  name: string;
  email: string;
}

export async function loadBrokerContacts(input: {
  accountId: string;
}): Promise<BrokerContact[]> {
  const client = getSupabaseServerAdminClient();

  const { data, error } = await client
    .from('contact')
    .select('id, name, email')
    .eq('account_id', input.accountId)
    .eq('kind', 'broker')
    .not('email', 'is', null);

  if (error) {
    throw error;
  }

  return data.map((row) => ({ id: row.id, name: row.name, email: row.email! }));
}

export interface ExcludedBroker {
  brokerContactId: string;
  brokerName: string;
}

export async function computeExcludedBrokers(input: {
  accountId: string;
}): Promise<ExcludedBroker[]> {
  const client = getSupabaseServerAdminClient();

  const { data: stages, error: stagesError } = await client
    .from('pipeline_stage')
    .select('key, sort_order, is_terminal')
    .eq('account_id', input.accountId);

  if (stagesError) {
    throw stagesError;
  }

  const loi = stages.find((stage) => stage.key === 'loi');

  if (!loi) {
    return [];
  }

  const activeStageKeys = stages
    .filter((stage) => !stage.is_terminal && stage.sort_order >= loi.sort_order)
    .map((stage) => stage.key);

  const { data: deals, error: dealsError } = await client
    .from('deal')
    .select('broker_contact_id')
    .eq('account_id', input.accountId)
    .in('stage', activeStageKeys)
    .not('broker_contact_id', 'is', null);

  if (dealsError) {
    throw dealsError;
  }

  const brokerIds = [...new Set(deals.map((deal) => deal.broker_contact_id!))];

  if (brokerIds.length === 0) {
    return [];
  }

  const { data: brokers, error: brokersError } = await client
    .from('contact')
    .select('id, name')
    .in('id', brokerIds);

  if (brokersError) {
    throw brokersError;
  }

  return brokers.map((broker) => ({
    brokerContactId: broker.id,
    brokerName: broker.name,
  }));
}

export async function sendBrokerBatchEmail(input: {
  accountId: string;
  config: BrokerCatchUpConfig;
  recipients: BrokerContact[];
}): Promise<{ sent: number }> {
  const client = getSupabaseServerAdminClient();

  const { data: dealBox, error } = await client
    .from('deal_box')
    .select('broker_summary')
    .eq('account_id', input.accountId)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    throw error;
  }

  const mailer = await getMailer();

  for (const recipient of input.recipients) {
    const content = buildBrokerCatchUpEmail({
      brokerFirstName: firstName(recipient.name),
      updates: input.config.updates,
      dealBoxSummary: dealBox.broker_summary ?? '',
      bookACallUrl: input.config.bookACallUrl,
    });

    await mailer.sendEmail({
      to: recipient.email,
      from: input.config.fromEmail,
      subject: input.config.subject,
      html: content.html,
      text: content.text,
    });
  }

  return { sent: input.recipients.length };
}

export async function createBrokerFollowUpTask(input: {
  accountId: string;
  recipientUserId: string;
  brokerName: string;
}): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const { error } = await client.from('notifications').insert({
    account_id: input.accountId,
    recipient_user_id: input.recipientUserId,
    type: 'info',
    body: `Send a personal catch-up note to ${input.brokerName}; they have an active deal in LOI or later`,
  });

  if (error) {
    throw error;
  }
}

export interface RecordWorkbookRunInput {
  workbookId: string;
  accountId: string;
  startedAt: string;
  finishedAt: string;
  itemsTotal: number;
  itemsDone: number;
  status: string;
}

export async function recordWorkbookRun(
  input: RecordWorkbookRunInput,
): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const { error } = await client.from('workbook_run').insert({
    workbook_id: input.workbookId,
    account_id: input.accountId,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    items_total: input.itemsTotal,
    items_done: input.itemsDone,
    status: input.status,
  });

  if (error) {
    throw error;
  }
}

const SIGNED_URL_TTL_SECONDS = 3600;
const DATA_ROOM_BUCKET = 'data-room';

function resolveDoclingConfig(): DoclingConfig | null {
  const baseUrl = process.env.DOCLING_URL;
  const apiKey = process.env.DOCLING_API_KEY;

  if (!baseUrl || !apiKey) {
    return null;
  }

  return { baseUrl, apiKey };
}

export interface CreateEmbeddingJobInput {
  drDocumentId: string;
}

export interface CreateEmbeddingJobResult {
  jobId: string;
  accountId: string;
  dealId: string;
}

export async function createEmbeddingJob(
  input: CreateEmbeddingJobInput,
): Promise<CreateEmbeddingJobResult> {
  const client = getSupabaseServerAdminClient();

  const { data: document, error: documentError } = await client
    .from('dr_document')
    .select('account_id, deal_id')
    .eq('id', input.drDocumentId)
    .single();

  if (documentError) {
    throw documentError;
  }

  const { data: job, error } = await client
    .from('embedding_job')
    .insert({
      account_id: document.account_id,
      deal_id: document.deal_id,
      dr_document_id: input.drDocumentId,
    })
    .select('id')
    .single();

  if (error) {
    throw error;
  }

  return {
    jobId: job.id,
    accountId: document.account_id,
    dealId: document.deal_id,
  };
}

export interface EmbeddingJobRef {
  jobId: string;
}

export async function markEmbeddingJobRunning(
  input: EmbeddingJobRef,
): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const { error } = await client
    .from('embedding_job')
    .update({ status: 'running' })
    .eq('id', input.jobId);

  if (error) {
    throw error;
  }
}

export interface ExtractDocumentInput {
  drDocumentId: string;
}

export async function extractDocumentMarkdown(
  input: ExtractDocumentInput,
): Promise<{ markdown: string }> {
  const docling = resolveDoclingConfig();

  if (!docling) {
    console.warn(
      '[workflows] document extraction unavailable: docling endpoint is not configured (DOCLING_URL / DOCLING_API_KEY)',
    );
    return { markdown: '' };
  }

  const client = getSupabaseServerAdminClient();

  const { data: document, error } = await client
    .from('dr_document')
    .select('storage_path')
    .eq('id', input.drDocumentId)
    .single();

  if (error) {
    throw error;
  }

  const { data: signed, error: signError } = await client.storage
    .from(DATA_ROOM_BUCKET)
    .createSignedUrl(document.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signError) {
    throw signError;
  }

  const markdown = await extractMarkdown(docling, signed.signedUrl);

  return { markdown };
}

export interface EmbedDocumentChunksInput {
  jobId: string;
  drDocumentId: string;
  accountId: string;
  dealId: string;
  markdown: string;
}

export async function embedDocumentChunks(
  input: EmbedDocumentChunksInput,
): Promise<{ chunkCount: number; model: string }> {
  const client = getSupabaseServerAdminClient();

  const { data: endpoint, error } = await client
    .from('llm_endpoint')
    .select('model, base_url, api_key_secret_ref')
    .eq('account_id', input.accountId)
    .limit(1)
    .single();

  const apiKey = endpoint?.api_key_secret_ref
    ? process.env[endpoint.api_key_secret_ref]
    : undefined;

  if (error || !endpoint?.base_url || !apiKey) {
    console.warn(
      `[workflows] embedding ingestion unavailable: no usable llm_endpoint for account ${input.accountId}`,
    );
    return { chunkCount: 0, model: '' };
  }

  const chunks = chunkMarkdown(input.markdown);
  const vectors = await embedTexts(
    {
      baseUrl: endpoint.base_url,
      model: endpoint.model,
      apiKey,
    },
    chunks,
  );

  const rows = chunks.map((content, index) => ({
    account_id: input.accountId,
    deal_id: input.dealId,
    document_id: input.drDocumentId,
    chunk_index: index,
    content,
    embedding: JSON.stringify(vectors[index]),
  }));

  const { error: insertError } = await client
    .from('document_chunk')
    .insert(rows);

  if (insertError) {
    throw insertError;
  }

  await client.from('ai_call_log').insert({
    account_id: input.accountId,
    deal_id: input.dealId,
    model: endpoint.model,
    prompt_tokens: null,
    completion_tokens: null,
  });

  return { chunkCount: rows.length, model: endpoint.model };
}

export interface CompleteEmbeddingJobInput {
  jobId: string;
  chunkCount: number;
  model: string;
}

export async function completeEmbeddingJob(
  input: CompleteEmbeddingJobInput,
): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const { error } = await client
    .from('embedding_job')
    .update({ status: 'done', chunk_count: input.chunkCount, model: input.model })
    .eq('id', input.jobId);

  if (error) {
    throw error;
  }
}

export interface RunDealVerificationInput {
  dealId: string;
}

export async function runDealVerification(
  input: RunDealVerificationInput,
): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const runnableChecks = await buildDocumentExtractionChecks({
    client,
    dealId: input.dealId,
    docling: resolveDoclingConfig(),
  });

  await runVerification({
    client,
    dealId: input.dealId,
    trigger: 'ingest',
    runnableChecks,
    notify: (notification) =>
      triggerNotification({ novu: createNovuClient(), client }, notification),
  });
}

export interface FailEmbeddingJobInput {
  jobId: string;
  error: string;
}

export async function failEmbeddingJob(
  input: FailEmbeddingJobInput,
): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const { error } = await client
    .from('embedding_job')
    .update({ status: 'failed', error: input.error })
    .eq('id', input.jobId);

  if (error) {
    throw error;
  }
}
