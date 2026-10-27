import { Context } from '@temporalio/activity';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { firstZipEntry } from './csv';
import {
  PPP_DATASET_PAGE,
  asOfFromLastModified,
  download,
  fetchSbaFiles,
  form5500Files,
  pppFiles,
} from './discover';
import {
  LEAD_SOURCE,
  type DiscoveredFile,
  type LeadFile,
  type LeadFileRef,
  type LeadSourceGroup,
} from './files';
import { loadLeadFile } from './load';
import { registryAdapter, registryFiles } from './stateRegistries';

import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';

async function withLastModified(file: LeadFileRef): Promise<LeadFile> {
  const lastModified = (await download(file.url, 'HEAD')).headers.get(
    'last-modified',
  );
  return { ...file, asOf: asOfFromLastModified(lastModified, new Date()) };
}

async function withRegistryAsOf(
  file: LeadFileRef & { kind: 'state_registry' },
): Promise<LeadFile> {
  const { published } = registryAdapter(file.state);
  if (!published) return withLastModified(file);
  return {
    ...file,
    asOf: published.date(await (await download(published.url)).json()),
  };
}

function undated(ref: LeadFileRef, reason: unknown): DiscoveredFile {
  return { ...ref, failure: (reason as Error).message };
}

async function dated<T extends LeadFileRef>(
  refs: T[],
  date: (ref: T) => Promise<LeadFile>,
): Promise<DiscoveredFile[]> {
  const results = await Promise.allSettled(refs.map(date));
  return results.map((result, index) =>
    result.status === 'fulfilled'
      ? result.value
      : undated(refs[index]!, result.reason),
  );
}

export async function discoverLeadFiles(
  group: LeadSourceGroup,
): Promise<DiscoveredFile[]> {
  switch (group) {
    case 'ppp':
      return pppFiles(await (await download(PPP_DATASET_PAGE)).text());
    case 'sba':
      return fetchSbaFiles();
    case 'form_5500':
      return dated(form5500Files(new Date()), withLastModified);
    case 'state_registry':
      return dated(registryFiles(), withRegistryAsOf);
  }
}

interface LeadImportRef {
  importId: string;
  file: LeadFile;
}

export async function startLeadImport({
  importId,
  file,
}: LeadImportRef): Promise<{ skipped: boolean }> {
  const client = getSupabaseServerAdminClient();
  const { data: latest } = await client
    .from('lead_import')
    .select('as_of')
    .eq('filename', file.url)
    .eq('status', 'succeeded')
    .neq('id', importId)
    .order('created_at', { ascending: false })
    .limit(1)
    .throwOnError();
  await client
    .from('lead_import')
    .upsert(
      {
        id: importId,
        source: LEAD_SOURCE[file.kind],
        filename: file.url,
        as_of: file.asOf,
        status: latest[0]?.as_of === file.asOf ? 'skipped' : 'running',
      },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    .throwOnError();
  const { data: started } = await client
    .from('lead_import')
    .select('status')
    .eq('id', importId)
    .single()
    .throwOnError();
  return { skipped: started.status === 'skipped' };
}

export async function importLeadFile({
  importId,
  file,
}: LeadImportRef): Promise<void> {
  const body = Readable.fromWeb(
    (await download(file.url)).body as ReadableStream,
  );
  const zipped =
    file.kind === 'state_registry'
      ? registryAdapter(file.state).zipped
      : file.kind === 'form_5500' || file.kind === 'form_5500_sf';
  await loadLeadFile(importId, file, zipped ? firstZipEntry(body) : body, () =>
    Context.current().heartbeat(),
  );
}

export async function recordUndatedFile({
  importId,
  file,
  reason,
}: {
  importId: string;
  file: LeadFileRef;
  reason: string;
}): Promise<void> {
  await getSupabaseServerAdminClient()
    .from('lead_import')
    .upsert(
      {
        id: importId,
        source: LEAD_SOURCE[file.kind],
        filename: file.url,
        status: 'failed',
        error: reason,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    .throwOnError();
}

export async function failLeadImport({
  importId,
  reason,
}: {
  importId: string;
  reason: string;
}): Promise<void> {
  await getSupabaseServerAdminClient()
    .from('lead_import')
    .update({ status: 'failed', error: reason })
    .eq('id', importId)
    .throwOnError();
}
