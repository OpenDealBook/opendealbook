import 'server-only';
import { deterministicUuid } from '@odb/contracts/esign';
import { nextVersion } from '@odb/data-room';
import { appendDealEvent } from '@odb/events';
import { getLogger } from '@odb/shared/logger';
import type { Tables } from '@odb/supabase';

import { Refusal } from '../actions/refusal';
import { type DealScope, levelBelowContainer, type Space } from './access';
import { storageKeyName, uploadRefusal } from './allowed';
import { contentTypeFor } from './content-type';
import { countFoldersInSpace, createFolderPaths } from './folders';
import {
  type Admin,
  downloadObject,
  removeObject,
  storedSize,
  storeOnce,
} from './objects';
import { MAX_FOLDERS_IN_SPACE } from './paths';
import { type ExpansionPlan, isZip, planExpansion } from './plan';
import { ensurePreviewRendition } from './renditions';

type Upload = Tables<'lender_upload'>;

interface NewDocument {
  id: string;
  folderId: string;
  name: string;
  path: string;
  uploadedBy: string;
}

export async function registerStoredUpload(
  admin: Admin,
  space: Space,
  upload: Upload,
  keepAsZip: boolean,
): Promise<string[]> {
  const size = await storedSize(admin, upload.storage_path);

  if (size === null) {
    throw new Refusal(`${upload.name} was not found in storage`);
  }

  const refusal = uploadRefusal({ name: upload.name, size });

  if (refusal) {
    await removeObject(admin, upload.storage_path);
    throw new Refusal(refusal);
  }

  const expansion =
    isZip(upload.name) && !keepAsZip
      ? await expansionThatFits(admin, space, upload)
      : null;

  const documentIds = expansion
    ? await applyExpansion(admin, space, upload, expansion)
    : [
        await registerDocument(admin, space, {
          id: upload.id,
          folderId: upload.folder_id,
          name: upload.name,
          path: upload.storage_path,
          uploadedBy: upload.uploaded_by,
        }),
      ];

  await admin
    .from('lender_upload')
    .update({
      registered_at: new Date().toISOString(),
      keep_as_zip: keepAsZip,
      document_ids: documentIds,
    })
    .eq('id', upload.id)
    .throwOnError();

  if (expansion) {
    await removeObject(admin, upload.storage_path);
  }

  return documentIds;
}

async function expansionThatFits(
  admin: Admin,
  space: Space,
  upload: Upload,
): Promise<ExpansionPlan | null> {
  const parentLevel = await levelBelowContainer(space, upload.folder_id);

  if (parentLevel === null) {
    return null;
  }

  const plan = planExpansion(
    upload.name,
    await downloadObject(admin, upload.storage_path),
    parentLevel,
  );

  if (!plan) {
    return null;
  }

  const foldersInSpace = await countFoldersInSpace(admin, space);

  return foldersInSpace + plan.folders.length > MAX_FOLDERS_IN_SPACE
    ? null
    : plan;
}

async function applyExpansion(
  admin: Admin,
  space: DealScope,
  upload: Upload,
  plan: ExpansionPlan,
): Promise<string[]> {
  const folderIdAt = (path: string) =>
    deterministicUuid(`${upload.id}\nfolder:${path.toLowerCase()}`);
  const [rootPath, ...descendantPaths] = plan.folders;

  await createFolderPaths(admin, space, {
    parentFolderId: upload.folder_id,
    rootPath,
    descendantPaths,
    idAt: folderIdAt,
  });

  await admin
    .from('lender_oversize_file')
    .upsert(
      plan.oversize.map((file) => ({
        id: deterministicUuid(
          `${upload.id}\noversize:${file.folder}/${file.name}`,
        ),
        account_id: space.account_id,
        dr_folder_id: folderIdAt(file.folder),
        name: file.name,
        size_bytes: file.sizeBytes,
      })),
      { onConflict: 'id', ignoreDuplicates: true },
    )
    .throwOnError();

  const documentIds: string[] = [];

  for (const [index, document] of plan.documents.entries()) {
    const path = `${upload.storage_path}/${index}-${storageKeyName(document.name)}`;

    await storeOnce(admin, path, document.bytes, {
      contentType: contentTypeFor(document.name),
    });

    documentIds.push(
      await registerDocument(admin, space, {
        id: deterministicUuid(`${upload.id}\ndocument:${index}`),
        folderId: folderIdAt(document.folder),
        name: document.name,
        path,
        uploadedBy: upload.uploaded_by,
      }),
    );
  }

  return documentIds;
}

async function registerDocument(
  admin: Admin,
  space: DealScope,
  document: NewDocument,
): Promise<string> {
  const registered = await admin
    .from('dr_document')
    .select('id')
    .eq('id', document.id)
    .maybeSingle()
    .throwOnError();

  if (registered.data) {
    return document.id;
  }

  try {
    await ensurePreviewRendition(admin, {
      storagePath: document.path,
      name: document.name,
    });
  } catch (error) {
    getLogger().error(
      { err: error, storagePath: document.path },
      'Document registered without a preview rendition',
    );
  }

  const sameName = await admin
    .from('dr_document')
    .select('version')
    .eq('folder_id', document.folderId)
    .eq('name', document.name)
    .throwOnError();

  await appendDealEvent(admin, {
    dealId: space.deal_id,
    aggregateType: 'dr_document',
    aggregateId: document.id,
    eventType: 'dr_document.added',
    actorKind: 'service',
    payload: {
      folder_id: document.folderId,
      name: document.name,
      storage_path: document.path,
      version: nextVersion(sameName.data.map((row) => row.version)),
      checklist_item_id: null,
      uploaded_by: document.uploadedBy,
    },
  });

  return document.id;
}
