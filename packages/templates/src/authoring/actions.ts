'use server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import { refusableAction } from '@odb/next/actions/refusable-action';
import { Refusal } from '@odb/next/refusal';
import type { Database } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { assertDealsManager } from '../permissions';
import {
  createSupabaseTemplateStorage,
  templateDocxPath,
  TEMPLATES_BUCKET,
} from '../storage';
import { createSuperdocEngine, isUnreadableDocx } from '../superdoc';
import {
  fieldSourceSchema,
  fieldTypeSchema,
  templateTypeSchema,
} from '../types';
import { draftsToRows, parseTemplateFields } from './parse-fields';

const TEMPLATE_MAX_BYTES = 25 * 1024 * 1024;
const UPLOAD_DENIED = { what: 'upload templates', needs: 'deals.manage' } as const;

const fieldDraftSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: fieldTypeSchema,
  source: fieldSourceSchema,
  source_path: z.string().nullable(),
  format: z.string().nullable(),
  required: z.boolean(),
  sort_order: z.number(),
});

export const beginTemplateUpload = refusableAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    await assertDealsManager(client, input.accountId, user.id);

    if (input.size > TEMPLATE_MAX_BYTES) {
      throw new Refusal('This template is over 25 MB');
    }

    const templateId = crypto.randomUUID();
    const { data, error } = await client.storage
      .from(TEMPLATES_BUCKET)
      .createSignedUploadUrl(templateDocxPath(input.accountId, templateId, 1));

    if (error) {
      throw error;
    }

    return { templateId, path: data.path, token: data.token };
  },
  z.object({
    accountId: z.string(),
    size: z.number(),
  }),
  UPLOAD_DENIED,
);

async function requireUploaded(
  client: SupabaseClient<Database>,
  path: string,
): Promise<void> {
  const { data: uploaded } = await client.storage
    .from(TEMPLATES_BUCKET)
    .exists(path);

  if (!uploaded) {
    throw new Refusal('Upload the template file again');
  }
}

function isWordPackage(bytes: Uint8Array): boolean {
  return Buffer.from(bytes).includes('word/document.xml');
}

export const parseTemplateDocx = refusableAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    await assertDealsManager(client, input.accountId, user.id);

    const path = templateDocxPath(input.accountId, input.templateId, 1);

    await requireUploaded(client, path);

    const docx = await createSupabaseTemplateStorage(client).downloadTemplate(
      path,
    );

    if (!isWordPackage(docx)) {
      throw new Refusal('Templates must be Word .docx files');
    }

    try {
      return await parseTemplateFields(docx, createSuperdocEngine());
    } catch (error) {
      if (isUnreadableDocx(error)) {
        throw new Refusal('This file could not be read as a Word document');
      }

      throw error;
    }
  },
  z.object({ accountId: z.string(), templateId: z.uuid() }),
  UPLOAD_DENIED,
);

export const saveTemplate = refusableAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    await assertDealsManager(client, input.accountId, user.id);

    const path = templateDocxPath(input.accountId, input.templateId, 1);

    await requireUploaded(client, path);
    await client
      .from('document_template')
      .upsert(
        {
          id: input.templateId,
          account_id: input.accountId,
          name: input.name,
          type: input.type,
          version: 1,
          docx_path: path,
          created_by: user.id,
        },
        { ignoreDuplicates: true },
      )
      .throwOnError();
    await client
      .from('template_field')
      .delete()
      .eq('template_id', input.templateId)
      .throwOnError();
    await client
      .from('template_field')
      .insert(draftsToRows(input.templateId, input.fields))
      .throwOnError();

    return { id: input.templateId };
  },
  z.object({
    accountId: z.string(),
    templateId: z.uuid(),
    name: z.string().min(1),
    type: templateTypeSchema,
    fields: z.array(fieldDraftSchema),
  }),
  { what: 'save templates', needs: 'deals.manage' },
);
