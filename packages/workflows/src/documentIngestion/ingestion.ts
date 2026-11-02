import {
  type Client,
  WorkflowExecutionAlreadyStartedError,
} from '@temporalio/client';

import { convertWithGotenberg } from '@odb/shared/gotenberg';
import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { getTemporalClient } from '../client';
import { heartbeating } from '../heartbeating';
import {
  DOCUMENT_INGESTION_WORKFLOW_TYPE,
  documentIngestionWorkflowId,
  TASK_QUEUE,
} from '../ids';
import { convertFile, doclingConfigFromEnv } from './docling';
import {
  extractSegments,
  type IngestibleFormat,
  ingestibleFormat,
} from './segments';

import { createHash } from 'node:crypto';

const DATA_ROOM_BUCKET = 'data-room';
const PAGE_SIZE = 1000;
const DOCLING_FORMATS: ReadonlySet<IngestibleFormat> = new Set([
  'pdf',
  'office',
  'image',
]);

type SegmentContent = Pick<
  Database['public']['Tables']['document_segment']['Insert'],
  | 'kind'
  | 'page_from'
  | 'page_to'
  | 'sheet'
  | 'cell_range'
  | 'text'
  | 'formulas'
  | 'from_ocr'
>;

async function allRows<Row>(
  page: (from: number, to: number) => PromiseLike<{ data: Row[] | null }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await page(from, from + PAGE_SIZE - 1);
    rows.push(...data!);
    if (data!.length < PAGE_SIZE) {
      return rows;
    }
  }
}

export async function documentText(drDocumentId: string): Promise<string> {
  const client = getSupabaseServerAdminClient();
  const rows = await allRows((from, to) =>
    client
      .from('document_segment')
      .select('text')
      .eq('dr_document_id', drDocumentId)
      .order('segment_index')
      .range(from, to)
      .throwOnError(),
  );
  return rows.map((row) => row.text).join('\n\n');
}

export interface ExtractDocumentSegmentsInput {
  drDocumentId: string;
  forceOcr: boolean;
}

export function extractDocumentSegments(
  input: ExtractDocumentSegmentsInput,
): Promise<{ segmentCount: number } | null> {
  return heartbeating(() => extractSegmentsOf(input));
}

async function extractSegmentsOf(
  input: ExtractDocumentSegmentsInput,
): Promise<{ segmentCount: number } | null> {
  const client = getSupabaseServerAdminClient();
  const { data: document } = await client
    .from('dr_document')
    .select('account_id, deal_id, name, storage_path, version')
    .eq('id', input.drDocumentId)
    .maybeSingle()
    .throwOnError();
  if (!document) {
    return null;
  }

  const { data: file, error } = await client.storage
    .from(DATA_ROOM_BUCKET)
    .download(document.storage_path);
  if (error) {
    throw error;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentHash = createHash('sha256').update(bytes).digest('hex');

  const contents =
    (input.forceOcr
      ? null
      : await extractedInTeam(document.account_id, contentHash)) ??
    (await extract(document.name, bytes, input.forceOcr));

  const rows = contents.map((content, index) => ({
    ...content,
    account_id: document.account_id,
    deal_id: document.deal_id,
    dr_document_id: input.drDocumentId,
    document_version: document.version,
    segment_index: index,
    content_hash: contentHash,
  }));
  await client
    .from('document_segment')
    .upsert(rows, { onConflict: 'dr_document_id,segment_index' })
    .throwOnError();
  await client
    .from('document_segment')
    .delete()
    .eq('dr_document_id', input.drDocumentId)
    .gte('segment_index', rows.length)
    .throwOnError();

  return { segmentCount: rows.length };
}

async function extractedInTeam(
  accountId: string,
  contentHash: string,
): Promise<SegmentContent[] | null> {
  const client = getSupabaseServerAdminClient();
  const { data: match } = await client
    .from('document_segment')
    .select('dr_document_id')
    .eq('account_id', accountId)
    .eq('content_hash', contentHash)
    .limit(1)
    .maybeSingle()
    .throwOnError();
  if (!match) {
    return null;
  }
  return allRows((from, to) =>
    client
      .from('document_segment')
      .select(
        'kind, page_from, page_to, sheet, cell_range, text, formulas, from_ocr',
      )
      .eq('dr_document_id', match.dr_document_id)
      .eq('content_hash', contentHash)
      .order('segment_index')
      .range(from, to)
      .throwOnError(),
  );
}

function extract(
  name: string,
  bytes: Uint8Array,
  forceOcr: boolean,
): Promise<SegmentContent[]> {
  const format = ingestibleFormat(name);
  if (!format) {
    throw new Error(`ingestion does not read ${name}`);
  }
  return extractSegments(
    { name, bytes, format },
    {
      convert: (pdf, fileName, pass) => {
        const docling = doclingConfigFromEnv();
        if (!docling) {
          throw new Error(
            'docling endpoint is not configured (DOCLING_URL / DOCLING_API_KEY)',
          );
        }
        return convertFile(docling, pdf, fileName, pass);
      },
      toPdf: (word, fileName) =>
        convertWithGotenberg(
          '/forms/libreoffice/convert',
          new Blob([Uint8Array.from(word)]),
          fileName,
        ),
    },
    forceOcr,
  );
}

function awaitsDocling(format: IngestibleFormat): boolean {
  return DOCLING_FORMATS.has(format) && !doclingConfigFromEnv();
}

async function startIngestion(
  temporal: Client,
  drDocumentId: string,
): Promise<void> {
  try {
    await temporal.workflow.start(DOCUMENT_INGESTION_WORKFLOW_TYPE, {
      taskQueue: TASK_QUEUE,
      workflowId: documentIngestionWorkflowId(drDocumentId),
      workflowIdReusePolicy: 'ALLOW_DUPLICATE_FAILED_ONLY',
      args: [{ drDocumentId }],
    });
  } catch (error) {
    if (!(error instanceof WorkflowExecutionAlreadyStartedError)) {
      throw error;
    }
  }
}

export async function startDocumentIngestion(input: {
  drDocumentId: string;
}): Promise<void> {
  const client = getSupabaseServerAdminClient();
  const { data: document } = await client
    .from('dr_document')
    .select('account_id, name')
    .eq('id', input.drDocumentId)
    .maybeSingle()
    .throwOnError();
  if (!document) {
    return;
  }
  const format = ingestibleFormat(document.name);
  if (!format) {
    return;
  }
  const { data: endpoint } = await client
    .from('llm_endpoint')
    .select('id')
    .eq('account_id', document.account_id)
    .maybeSingle()
    .throwOnError();
  if (!endpoint) {
    return;
  }
  if (awaitsDocling(format)) {
    console.warn(
      `[workflows] ingestion of ${input.drDocumentId} waits for docling (DOCLING_URL / DOCLING_API_KEY); the nightly backfill starts it once configured`,
    );
    return;
  }
  await startIngestion(await getTemporalClient(), input.drDocumentId);
}

export interface AddedDocument {
  globalSeq: number;
  drDocumentId: string;
}

export async function fetchAddedDocuments(input: {
  afterGlobalSeq: number;
  limit: number;
}): Promise<AddedDocument[]> {
  const { data } = await getSupabaseServerAdminClient()
    .from('deal_event')
    .select('global_seq, aggregate_id')
    .eq('event_type', 'dr_document.added')
    .gt('global_seq', input.afterGlobalSeq)
    .order('global_seq', { ascending: true })
    .limit(input.limit)
    .throwOnError();
  return data.map((row) => ({
    globalSeq: row.global_seq,
    drDocumentId: row.aggregate_id,
  }));
}

export function startMissingDocumentIngestions(input: {
  accountId?: string;
}): Promise<void> {
  return heartbeating(() => startMissingIngestions(input));
}

async function startMissingIngestions(input: {
  accountId?: string;
}): Promise<void> {
  const client = getSupabaseServerAdminClient();
  const temporal = await getTemporalClient();
  const endpoints = await allRows((from, to) => {
    const query = client.from('llm_endpoint').select('account_id');
    return (input.accountId ? query.eq('account_id', input.accountId) : query)
      .order('account_id')
      .range(from, to)
      .throwOnError();
  });

  for (const { account_id: accountId } of endpoints) {
    const documents = await allRows((from, to) =>
      client
        .from('dr_document')
        .select('id, name')
        .eq('account_id', accountId)
        .is('removed_at', null)
        .order('id')
        .range(from, to)
        .throwOnError(),
    );
    const jobs = await allRows((from, to) =>
      client
        .from('embedding_job')
        .select('dr_document_id')
        .eq('account_id', accountId)
        .order('id')
        .range(from, to)
        .throwOnError(),
    );
    const ingested = new Set(jobs.map((job) => job.dr_document_id));

    for (const document of documents) {
      const format = ingestibleFormat(document.name);
      if (format && !awaitsDocling(format) && !ingested.has(document.id)) {
        await startIngestion(temporal, document.id);
      }
    }
  }
}
