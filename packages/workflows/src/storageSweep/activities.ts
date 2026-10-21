import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

const DEAL_BUCKETS = ['data-room', 'meeting-recordings'] as const;
const GRACE_MS = 24 * 60 * 60 * 1000;
const LIST_PAGE_SIZE = 1000;
const VALUES_PER_REQUEST_MAX_URL_CHARS = 4000;

type Admin = ReturnType<typeof getSupabaseServerAdminClient>;

type Entry = { kind: 'folder'; path: string } | StoredFile;

interface StoredFile {
  kind: 'file';
  path: string;
  createdAt: number;
}

function batchesThatFitAUrl(values: string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let chars = 0;

  for (const value of values) {
    const size = encodeURIComponent(value).length + 3;

    if (batch.length > 0 && chars + size > VALUES_PER_REQUEST_MAX_URL_CHARS) {
      batches.push(batch);
      batch = [];
      chars = 0;
    }

    batch.push(value);
    chars += size;
  }

  if (batch.length > 0) {
    batches.push(batch);
  }

  return batches;
}

async function list(admin: Admin, bucket: string, prefix: string): Promise<Entry[]> {
  const entries: Entry[] = [];

  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: LIST_PAGE_SIZE, offset });

    if (error) {
      throw error;
    }

    for (const item of data) {
      const path = `${prefix}/${item.name}`;

      entries.push(
        item.created_at === null
          ? { kind: 'folder', path }
          : { kind: 'file', path, createdAt: Date.parse(item.created_at) },
      );
    }

    if (data.length < LIST_PAGE_SIZE) {
      return entries;
    }
  }
}

async function filesUnder(admin: Admin, bucket: string, prefix: string): Promise<StoredFile[]> {
  const files: StoredFile[] = [];

  for (const entry of await list(admin, bucket, prefix)) {
    files.push(...(entry.kind === 'folder' ? await filesUnder(admin, bucket, entry.path) : [entry]));
  }

  return files;
}

async function missingDealIds(admin: Admin, dealIds: string[]): Promise<string[]> {
  const existing = new Set<string>();

  for (const batch of batchesThatFitAUrl(dealIds)) {
    const { data } = await admin.from('deal').select('id').in('id', batch).throwOnError();

    for (const row of data) {
      existing.add(row.id);
    }
  }

  return dealIds.filter((id) => !existing.has(id));
}

// Every deal folder is listed before any removal, since emptying a folder drops
// it from the listing and would shift the offsets of later pages.
export async function deleteOrphanedDealObjects(): Promise<void> {
  const admin = getSupabaseServerAdminClient();
  const uploadedBefore = Date.now() - GRACE_MS;

  for (const bucket of DEAL_BUCKETS) {
    const dealFolders = (await list(admin, bucket, 'deal')).filter((entry) => entry.kind === 'folder');
    const orphanedDealIds = await missingDealIds(
      admin,
      dealFolders.map((folder) => folder.path.slice('deal/'.length)),
    );

    for (const dealId of orphanedDealIds) {
      const expired = (await filesUnder(admin, bucket, `deal/${dealId}`))
        .filter((file) => file.createdAt < uploadedBefore)
        .map((file) => file.path);

      for (const batch of batchesThatFitAUrl(expired)) {
        const removed = await admin.storage.from(bucket).remove(batch);

        if (removed.error) {
          throw removed.error;
        }
      }
    }
  }
}
