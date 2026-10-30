import type { SupabaseClient } from '@supabase/supabase-js';

import { SELLER_COUNSEL_THREAD_BUCKET } from '@odb/seller-rooms/counsel-thread/files.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

const UPLOAD_LEDGERS = [
  'lender_upload',
  'lender_faq_upload',
  'seller_upload',
] as const;
const RECORDS_OWNING_OBJECTS = ['dr_document', 'lender_faq_file'] as const;
const UNFINISHED_UPLOAD_LIFETIME_MS = 24 * 60 * 60 * 1000;
const DATA_ROOM_BUCKET = 'data-room';
const TEMPLATES_BUCKET = 'templates';
const TEMPLATES_PER_REQUEST = 100;
const LIST_PAGE_SIZE = 1000;
const PATHS_PER_REQUEST_MAX_URL_CHARS = 4000;

type Admin = ReturnType<typeof getSupabaseServerAdminClient>;

function batchesThatFitAUrl<Upload extends { storage_path: string }>(
  uploads: Upload[],
): Upload[][] {
  const batches: Upload[][] = [];
  let batch: Upload[] = [];
  let chars = 0;

  for (const upload of uploads) {
    const size = encodeURIComponent(upload.storage_path).length + 3;

    if (batch.length > 0 && chars + size > PATHS_PER_REQUEST_MAX_URL_CHARS) {
      batches.push(batch);
      batch = [];
      chars = 0;
    }

    batch.push(upload);
    chars += size;
  }

  if (batch.length > 0) {
    batches.push(batch);
  }

  return batches;
}

async function pathsOwnedByRecords(
  admin: Admin,
  paths: string[],
): Promise<Set<string>> {
  const owned = new Set<string>();

  for (const table of RECORDS_OWNING_OBJECTS) {
    const { data } = await admin
      .from(table)
      .select('storage_path')
      .in('storage_path', paths)
      .throwOnError();

    for (const row of data) {
      owned.add(row.storage_path);
    }
  }

  return owned;
}

async function listed(
  admin: Admin,
  prefix: string,
): Promise<{ name: string; created_at: string | null }[]> {
  const entries = [];

  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await admin.storage
      .from(SELLER_COUNSEL_THREAD_BUCKET)
      .list(prefix, { limit: LIST_PAGE_SIZE, offset });

    if (error) {
      throw error;
    }

    entries.push(...data);

    if (data.length < LIST_PAGE_SIZE) {
      return entries;
    }
  }
}

// Thread files are stored as <deal>/<upload>/<name> before their message is
// posted; one no message holds after the upload lifetime was abandoned.
async function deleteAbandonedThreadFiles(
  admin: Admin,
  issuedBefore: string,
): Promise<void> {
  const stale: { storage_path: string }[] = [];

  for (const deal of await listed(admin, '')) {
    for (const upload of await listed(admin, deal.name)) {
      const folder = `${deal.name}/${upload.name}`;

      for (const file of await listed(admin, folder)) {
        if (Date.parse(file.created_at!) < Date.parse(issuedBefore)) {
          stale.push({ storage_path: `${folder}/${file.name}` });
        }
      }
    }
  }

  for (const batch of batchesThatFitAUrl(stale)) {
    const paths = batch.map((file) => file.storage_path);
    const { data: posted } = await admin
      .from('seller_counsel_message_file')
      .select('storage_path')
      .in('storage_path', paths)
      .throwOnError();
    const held = new Set(posted.map((file) => file.storage_path));
    const abandoned = paths.filter((path) => !held.has(path));

    if (abandoned.length > 0) {
      const removed = await admin.storage
        .from(SELLER_COUNSEL_THREAD_BUCKET)
        .remove(abandoned);

      if (removed.error) {
        throw removed.error;
      }
    }
  }
}

// Template files are stored as <account>/<template>/v<n>.docx from the moment
// an upload begins. The template row, once saved, holds its whole folder; its
// docx_path may be a label rather than the object's path, so the folder's
// template id decides.
async function deleteAbandonedTemplateFiles(
  admin: Admin,
  issuedBefore: string,
): Promise<void> {
  const storage: SupabaseClient = admin;
  const stale: string[] = [];

  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data } = await storage
      .schema('storage')
      .from('objects')
      .select('name')
      .eq('bucket_id', TEMPLATES_BUCKET)
      .lt('created_at', issuedBefore)
      .order('name')
      .range(offset, offset + LIST_PAGE_SIZE - 1)
      .throwOnError();

    stale.push(...data.map((object: { name: string }) => object.name));

    if (data.length < LIST_PAGE_SIZE) {
      break;
    }
  }

  for (let start = 0; start < stale.length; start += TEMPLATES_PER_REQUEST) {
    const batch = stale.slice(start, start + TEMPLATES_PER_REQUEST);
    const { data: saved } = await admin
      .from('document_template')
      .select('id, account_id')
      .in(
        'id',
        batch.map((path) => path.split('/')[1]!),
      )
      .throwOnError();
    const held = new Set(
      saved.map((template) => `${template.account_id}/${template.id}/`),
    );
    const abandoned = batch.filter(
      (path) => !held.has(path.slice(0, path.lastIndexOf('/') + 1)),
    );

    if (abandoned.length > 0) {
      const removed = await admin.storage
        .from(TEMPLATES_BUCKET)
        .remove(abandoned);

      if (removed.error) {
        throw removed.error;
      }
    }
  }
}

// The object goes before the row: a run that dies between the two leaves a row
// naming a missing object, which the next run deletes. The reverse order would
// strand an object no ledger row points to. An object a document or FAQ file
// already uses belongs to that record, so only its ledger row goes.
export async function deleteUnfinishedUploads(): Promise<void> {
  const admin = getSupabaseServerAdminClient();
  const issuedBefore = new Date(
    Date.now() - UNFINISHED_UPLOAD_LIFETIME_MS,
  ).toISOString();

  for (const ledger of UPLOAD_LEDGERS) {
    const { data: stale } = await admin
      .from(ledger)
      .select('id, storage_path')
      .is('registered_at', null)
      .lt('created_at', issuedBefore)
      .throwOnError();

    for (const batch of batchesThatFitAUrl(stale)) {
      const owned = await pathsOwnedByRecords(
        admin,
        batch.map((upload) => upload.storage_path),
      );
      const unowned = batch
        .map((upload) => upload.storage_path)
        .filter((path) => !owned.has(path));

      if (unowned.length > 0) {
        const removed = await admin.storage
          .from(DATA_ROOM_BUCKET)
          .remove(unowned);

        if (removed.error) {
          throw removed.error;
        }
      }

      await admin
        .from(ledger)
        .delete()
        .in(
          'id',
          batch.map((upload) => upload.id),
        )
        .is('registered_at', null)
        .throwOnError();
    }
  }

  await deleteAbandonedThreadFiles(admin, issuedBefore);
  await deleteAbandonedTemplateFiles(admin, issuedBefore);
}
