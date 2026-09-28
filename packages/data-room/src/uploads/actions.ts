'use server';
import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { assertDealPermission, resolveDealAccountId } from '../permission';
import type { UploadBody } from '../storage';
import { expandBatch } from './expand';
import type { ZipEntry } from './entries';
import { expandBatchSchema, stageUploadSchema } from './schema';
import { stageBatch } from './stage';
import { extractZipEntries } from './zip';

async function toBytes(body: UploadBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body);
  }

  return new Uint8Array(await body.arrayBuffer());
}

export const stageUpload = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    await assertDealPermission(client, input.dealId);
    const accountId = await resolveDealAccountId(client, input.dealId);

    const files: ZipEntry[] = await Promise.all(
      input.files.map(async (file) => ({
        originalPath: file.originalPath,
        contentType: file.contentType ?? null,
        bytes: await toBytes(file.body),
      })),
    );

    const entries =
      input.kind === 'zip' ? extractZipEntries(files[0]!.bytes) : files;

    return stageBatch(client, {
      accountId,
      dealId: input.dealId,
      createdBy: user.id,
      kind: input.kind,
      sourceFilename: input.sourceFilename ?? null,
      entries,
    });
  },
  { auth: true, schema: stageUploadSchema },
);

export const expandUploadBatch = enhanceAction(
  async (input) => {
    const client = getSupabaseServerClient();

    await assertDealPermission(client, input.dealId);

    return expandBatch(client, {
      dealId: input.dealId,
      batchId: input.batchId,
      targetFolderId: input.targetFolderId,
    });
  },
  { auth: true, schema: expandBatchSchema },
);
