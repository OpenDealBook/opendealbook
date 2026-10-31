import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import type { FloridaLicense } from './parse';

const BATCH_SIZE = 1000;

export async function loadFloridaLicenseSnapshot({
  importId,
  licenses,
  signal,
  heartbeat,
}: {
  importId: string;
  licenses: AsyncIterable<FloridaLicense>;
  signal: AbortSignal;
  heartbeat: (inserted: number) => void;
}): Promise<void> {
  const client = getSupabaseServerAdminClient();
  const { data: current } = await client
    .from('florida_license_import')
    .select('status, created_at')
    .eq('id', importId)
    .single()
    .throwOnError();
  if (current.status === 'succeeded') {
    return;
  }
  await client.from('florida_license').delete().eq('import_id', importId).throwOnError();
  let batch: FloridaLicense[] = [];
  let licenseCount = 0;
  const insert = async () => {
    await client
      .from('florida_license')
      .insert(batch.map((license) => ({ ...license, import_id: importId })))
      .throwOnError();
    licenseCount += batch.length;
    batch = [];
    heartbeat(licenseCount);
  };
  for await (const license of licenses) {
    signal.throwIfAborted();
    batch.push(license);
    if (batch.length === BATCH_SIZE) {
      await insert();
    }
  }
  if (batch.length > 0) {
    await insert();
  }
  await client
    .from('florida_license_import')
    .update({ status: 'succeeded', license_count: licenseCount })
    .eq('id', importId)
    .throwOnError();
  const { data: superseded } = await client
    .from('florida_license_import')
    .select('id')
    .or(`status.eq.failed,and(status.eq.succeeded,created_at.lt.${current.created_at})`)
    .throwOnError();
  await client
    .from('florida_license')
    .delete()
    .in(
      'import_id',
      superseded.map((snapshot) => snapshot.id),
    )
    .throwOnError();
}
