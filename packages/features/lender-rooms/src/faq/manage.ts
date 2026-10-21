'use server';

import { z } from 'zod';

import { deterministicUuid } from '@odb/contracts/esign';
import { basename, DATA_ROOM_BUCKET } from '@odb/data-room/storage';
import { getLogger } from '@odb/shared/logger';
import type { TablesInsert, TablesUpdate } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { storageKeyName } from '@odb/supabase/storage-key';

import { refusableAction } from '../actions/refusable-action';
import { Refusal } from '../actions/refusal';
import { refuseWhileTeamLocked } from '../actions/team-lock';
import { uploadRefusal } from '../uploads/allowed';
import { storedSize } from '../uploads/objects';
import { ensurePreviewRendition } from '../uploads/renditions';
import { DEAL_TEAM_ONLY, entryText, faqFileKey } from './entry-rules';
import { notifyFaqEntryPublished } from './notify';
import { PREVIEW_RENDITIONS, copyAnswerFile } from './storage-copy';
import { fencedFolderIds, searchDealFaq } from './team-queries';

const NOT_THIS_DEAL = "That document is not in this deal's data room";
const NOT_A_TEAM_FILE =
  'Only files from the lender package or your own data room folders can be added to the FAQ';
const SERIALIZATION_FAILURE = '40001';

const entryIdInput = z.object({ entryId: z.uuid() });

async function readEntry(entryId: string) {
  const { data: entry } = await getSupabaseServerClient()
    .from('lender_faq_entry')
    .select('account_id, deal_id, status')
    .eq('id', entryId)
    .maybeSingle()
    .throwOnError();

  if (!entry) {
    throw new Refusal(DEAL_TEAM_ONLY);
  }

  return entry;
}

async function updateEntry(
  entryId: string,
  changes: TablesUpdate<'lender_faq_entry'>,
) {
  const updated = await getSupabaseServerClient()
    .from('lender_faq_entry')
    .update(changes)
    .eq('id', entryId)
    .select('version')
    .maybeSingle();

  if (updated.error?.code === SERIALIZATION_FAILURE) {
    throw new Refusal(
      'Someone else changed this entry. Reload to see their changes.',
    );
  }

  if (updated.error) {
    throw updated.error;
  }

  if (!updated.data) {
    throw new Refusal(DEAL_TEAM_ONLY);
  }

  return updated.data;
}

async function removeStoredCopies(storagePaths: string[]) {
  return getSupabaseServerAdminClient()
    .storage.from(DATA_ROOM_BUCKET)
    .remove(
      storagePaths.flatMap((path) => [
        path,
        ...PREVIEW_RENDITIONS.map(({ suffix }) => `${path}${suffix}`),
      ]),
    );
}

async function addFaqFile(file: TablesInsert<'lender_faq_file'>) {
  await getSupabaseServerAdminClient()
    .from('lender_faq_file')
    .upsert(file, { onConflict: 'id', ignoreDuplicates: true })
    .throwOnError();
}

export const findSimilarFaqEntries = refusableAction(
  ({ dealId, query }) =>
    searchDealFaq(getSupabaseServerClient(), dealId, query),
  { auth: true, schema: z.object({ dealId: z.uuid(), query: z.string() }) },
);

export const editFaqEntry = refusableAction(
  async ({ entryId, question, answer, version }) => {
    await refuseWhileTeamLocked((await readEntry(entryId)).account_id);

    return updateEntry(entryId, { question, answer, version });
  },
  {
    auth: true,
    schema: entryIdInput.extend({
      question: entryText,
      answer: entryText,
      version: z.int(),
    }),
  },
);

export const setFaqEntryStatus = refusableAction(
  async ({ entryId, status }) => {
    const entry = await readEntry(entryId);
    await refuseWhileTeamLocked(entry.account_id);

    if (status === 'published') {
      await getSupabaseServerAdminClient()
        .from('lender_faq_entry')
        .update({ status: 'published' })
        .eq('id', entryId)
        .throwOnError();

      if (entry.status !== 'published') {
        await notifyFaqEntryPublished(entryId);
      }
      return;
    }

    if (entry.status === 'draft') {
      throw new Refusal('Only a published entry can be unpublished');
    }

    await updateEntry(entryId, { status: 'unpublished' });
  },
  {
    auth: true,
    schema: entryIdInput.extend({
      status: z.enum(['published', 'unpublished']),
    }),
  },
);

export const setFaqEntryPinned = refusableAction(
  async ({ entryId, pinned }) => {
    await refuseWhileTeamLocked((await readEntry(entryId)).account_id);
    await updateEntry(entryId, { pinned });
  },
  { auth: true, schema: entryIdInput.extend({ pinned: z.boolean() }) },
);

export const deleteFaqDraft = refusableAction(
  async ({ entryId }) => {
    const entry = await readEntry(entryId);
    await refuseWhileTeamLocked(entry.account_id);

    const client = getSupabaseServerClient();
    const [{ data: files }, { data: uploads }] = await Promise.all([
      client
        .from('lender_faq_file')
        .select('storage_path')
        .eq('entry_id', entryId)
        .throwOnError(),
      client
        .from('lender_faq_upload')
        .select('storage_path')
        .eq('entry_id', entryId)
        .throwOnError(),
    ]);
    const storagePaths = [...files, ...uploads].map(
      (file) => file.storage_path,
    );

    const { data: deleted } = await getSupabaseServerAdminClient()
      .from('lender_faq_entry')
      .delete()
      .eq('id', entryId)
      .eq('status', 'draft')
      .select('id')
      .throwOnError();

    if (deleted.length === 0) {
      throw new Refusal('Only a draft that was never published can be deleted');
    }

    if (storagePaths.length === 0) {
      return;
    }

    const { error } = await removeStoredCopies(storagePaths);

    if (error) {
      getLogger().error(
        { err: error, entryId },
        'FAQ draft deleted but its stored files were not removed',
      );
    }
  },
  { auth: true, schema: entryIdInput },
);

export const addDataRoomFileToFaq = refusableAction(
  async ({ entryId, documentId }) => {
    const client = getSupabaseServerClient();
    const entry = await readEntry(entryId);
    await refuseWhileTeamLocked(entry.account_id);

    const { data: document } = await client
      .from('dr_document')
      .select('id, name, storage_path, folder_id')
      .eq('id', documentId)
      .eq('deal_id', entry.deal_id)
      .maybeSingle()
      .throwOnError();

    if (!document) {
      throw new Refusal(NOT_THIS_DEAL);
    }

    if (
      (await fencedFolderIds(client, entry.deal_id)).has(document.folder_id)
    ) {
      throw new Refusal(NOT_A_TEAM_FILE);
    }

    const fileId = deterministicUuid(`faq-file:${entryId}:${documentId}`);
    const storagePath = faqFileKey(
      entry.deal_id,
      fileId,
      basename(document.storage_path),
    );

    await copyAnswerFile(getSupabaseServerAdminClient(), document, storagePath);

    await addFaqFile({
      id: fileId,
      entry_id: entryId,
      deal_id: entry.deal_id,
      name: document.name,
      storage_path: storagePath,
      source_dr_document_id: document.id,
    });
  },
  { auth: true, schema: entryIdInput.extend({ documentId: z.uuid() }) },
);

export const beginFaqUpload = refusableAction(
  async ({ entryId, name, size }, user) => {
    const refusal = uploadRefusal({ name, size });

    if (refusal) {
      throw new Refusal(refusal);
    }

    const entry = await readEntry(entryId);
    await refuseWhileTeamLocked(entry.account_id);

    const admin = getSupabaseServerAdminClient();
    const uploadId = crypto.randomUUID();
    const { data: upload } = await admin
      .from('lender_faq_upload')
      .insert({
        id: uploadId,
        entry_id: entryId,
        deal_id: entry.deal_id,
        name,
        storage_path: `deal/${entry.deal_id}/faq-upload/${uploadId}-${storageKeyName(name)}`,
        uploaded_by: user.id,
      })
      .select('storage_path')
      .single()
      .throwOnError();
    const signed = await admin.storage
      .from(DATA_ROOM_BUCKET)
      .createSignedUploadUrl(upload.storage_path);

    if (signed.error) {
      throw signed.error;
    }

    return { uploadId, ...signed.data };
  },
  {
    auth: true,
    schema: entryIdInput.extend({
      name: z.string().trim(),
      size: z.number().int().nonnegative(),
    }),
  },
);

export const addUploadedFaqFile = refusableAction(
  async ({ uploadId }, user) => {
    const admin = getSupabaseServerAdminClient();
    const { data: upload } = await admin
      .from('lender_faq_upload')
      .select('*')
      .eq('id', uploadId)
      .maybeSingle()
      .throwOnError();

    if (upload?.uploaded_by !== user.id) {
      throw new Refusal('That upload was not found');
    }

    await refuseWhileTeamLocked((await readEntry(upload.entry_id)).account_id);

    const fileId = deterministicUuid(`faq-upload:${upload.id}`);

    if (upload.registered_at) {
      return fileId;
    }

    const storagePath = faqFileKey(upload.deal_id, fileId, upload.name);

    if ((await storedSize(admin, storagePath)) === null) {
      const moved = await admin.storage
        .from(DATA_ROOM_BUCKET)
        .move(upload.storage_path, storagePath);

      if (moved.error) {
        throw moved.error;
      }
    }

    try {
      await ensurePreviewRendition(admin, { storagePath, name: upload.name });
    } catch (error) {
      getLogger().error(
        { err: error, storagePath },
        'FAQ file added without a preview rendition',
      );
    }

    await addFaqFile({
      id: fileId,
      entry_id: upload.entry_id,
      deal_id: upload.deal_id,
      name: upload.name,
      storage_path: storagePath,
    });

    await admin
      .from('lender_faq_upload')
      .update({ registered_at: new Date().toISOString() })
      .eq('id', upload.id)
      .throwOnError();

    return fileId;
  },
  { auth: true, schema: z.object({ uploadId: z.uuid() }) },
);

export const removeFaqFile = refusableAction(
  async ({ fileId }) => {
    const client = getSupabaseServerClient();
    const { data: file } = await client
      .from('lender_faq_file')
      .select('entry_id')
      .eq('id', fileId)
      .maybeSingle()
      .throwOnError();

    if (!file) {
      throw new Refusal(DEAL_TEAM_ONLY);
    }

    await refuseWhileTeamLocked((await readEntry(file.entry_id)).account_id);

    const { data: removed } = await client
      .from('lender_faq_file')
      .delete()
      .eq('id', fileId)
      .select('storage_path')
      .throwOnError();

    if (removed.length === 0) {
      throw new Refusal(DEAL_TEAM_ONLY);
    }

    const { error } = await removeStoredCopies(
      removed.map((removedFile) => removedFile.storage_path),
    );

    if (error) {
      throw error;
    }
  },
  { auth: true, schema: z.object({ fileId: z.uuid() }) },
);

const roomEntryInput = z.object({ roomId: z.uuid(), entryId: z.uuid() });

async function refuseUnlessRoomTeam(roomId: string) {
  const { data: isDealTeam } = await getSupabaseServerClient()
    .rpc('can_manage_lender_room', { room_id: roomId })
    .throwOnError();

  if (!isDealTeam) {
    throw new Refusal(DEAL_TEAM_ONLY);
  }
}

export const hideFaqEntryForRoom = refusableAction(
  async ({ roomId, entryId }) => {
    await refuseUnlessRoomTeam(roomId);
    const entry = await readEntry(entryId);
    await refuseWhileTeamLocked(entry.account_id);

    await getSupabaseServerClient()
      .from('lender_faq_hidden')
      .upsert(
        { room_id: roomId, deal_id: entry.deal_id, entry_id: entryId },
        { onConflict: 'room_id,entry_id', ignoreDuplicates: true },
      )
      .throwOnError();
  },
  { auth: true, schema: roomEntryInput },
);

export const unhideFaqEntryForRoom = refusableAction(
  async ({ roomId, entryId }) => {
    await refuseUnlessRoomTeam(roomId);
    await refuseWhileTeamLocked((await readEntry(entryId)).account_id);

    await getSupabaseServerClient()
      .from('lender_faq_hidden')
      .delete()
      .eq('room_id', roomId)
      .eq('entry_id', entryId)
      .throwOnError();
  },
  { auth: true, schema: roomEntryInput },
);
