import { Context } from '@temporalio/activity';

import { Readable } from 'node:stream';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { loadFloridaLicenseSnapshot } from './load';
import { FLORIDA_FILES, type FloridaLicense, floridaLicenses } from './parse';

const DBPR_EXTRACTS = 'https://www2.myfloridalicense.com/sto/file_download/extracts';
const DOWNLOAD_STALL_MS = 10 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

export async function startFloridaLicenseImport({ importId }: { importId: string }): Promise<void> {
  await getSupabaseServerAdminClient()
    .from('florida_license_import')
    .upsert({ id: importId }, { onConflict: 'id', ignoreDuplicates: true })
    .throwOnError();
}

export async function failFloridaLicenseImport({ importId, reason }: { importId: string; reason: string }): Promise<void> {
  const client = getSupabaseServerAdminClient();
  const { data: failed } = await client
    .from('florida_license_import')
    .update({ status: 'failed', error: reason })
    .eq('id', importId)
    .neq('status', 'succeeded')
    .select('id')
    .throwOnError();
  if (failed.length > 0) {
    await client.from('florida_license').delete().eq('import_id', importId).throwOnError();
  }
}

async function* bytesUntilStalled(url: string, stallMs: number, signal: AbortSignal | undefined): AsyncGenerator<Uint8Array> {
  const stalled = new AbortController();
  const watch = () => setTimeout(() => stalled.abort(new Error(`GET ${url} stalled: no data for ${stallMs} ms`)), stallMs);
  let timer = watch();
  const response = await fetch(url, { signal: AbortSignal.any([stalled.signal, ...(signal ? [signal] : [])]) }).finally(() =>
    clearTimeout(timer),
  );
  if (!response.ok) {
    throw new Error(`GET ${url} answered ${response.status}`);
  }
  const reader = response.body!.getReader();
  let finished = false;
  try {
    for (;;) {
      timer = watch();
      const chunk = await reader.read();
      clearTimeout(timer);
      if (chunk.done) {
        finished = true;
        return;
      }
      yield chunk.value;
    }
  } finally {
    clearTimeout(timer);
    if (!finished) {
      await reader.cancel();
    }
  }
}

export async function* downloadedLicenses({
  origin,
  stallMs = DOWNLOAD_STALL_MS,
  signal,
}: {
  origin: string;
  stallMs?: number;
  signal?: AbortSignal;
}): AsyncGenerator<FloridaLicense> {
  for (const file of FLORIDA_FILES) {
    let licenses = 0;
    const bytes = Readable.from(bytesUntilStalled(`${origin}/${file}`, stallMs, signal));
    try {
      for await (const license of floridaLicenses(file, bytes)) {
        licenses += 1;
        yield license;
      }
    } finally {
      bytes.destroy();
    }
    if (licenses === 0) {
      throw new Error(`The Florida file ${file} had no licenses`);
    }
  }
}

export async function loadFloridaLicenses({ importId }: { importId: string }): Promise<void> {
  const context = Context.current();
  const beating = setInterval(() => context.heartbeat(), HEARTBEAT_INTERVAL_MS);
  try {
    await loadFloridaLicenseSnapshot({
      importId,
      licenses: downloadedLicenses({ origin: DBPR_EXTRACTS, signal: context.cancellationSignal }),
      signal: context.cancellationSignal,
      heartbeat: (inserted) => context.heartbeat(inserted),
    });
  } finally {
    clearInterval(beating);
  }
}
