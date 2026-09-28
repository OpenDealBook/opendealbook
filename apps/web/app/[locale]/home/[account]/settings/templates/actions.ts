'use server';

import { z } from 'zod';

import { enhanceAction } from '@tuckin/next/actions';
import { getSupabaseServerAdminClient } from '@tuckin/supabase/admin';
import { getSupabaseServerClient } from '@tuckin/supabase/server';
import {
  assertDealsManager,
  createSuperdocEngine,
  draftsToRows,
  fieldSourceSchema,
  fieldTypeSchema,
  GENERATED_BUCKET,
  parseTemplateFields,
  templateDocxPath,
  templateTypeSchema,
  TEMPLATES_BUCKET,
} from '@tuckin/templates';

const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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

const parseSchema = z.object({
  accountId: z.string(),
  docxBase64: z.string(),
});

const saveSchema = z.object({
  accountId: z.string(),
  name: z.string().min(1),
  type: templateTypeSchema,
  docxBase64: z.string(),
  fields: z.array(fieldDraftSchema),
});

const linksSchema = z.object({
  accountId: z.string(),
  docxPath: z.string(),
  pdfPath: z.string(),
});

function decode(docxBase64: string): Uint8Array {
  return new Uint8Array(Buffer.from(docxBase64, 'base64'));
}

export const parseTemplateDocx = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    await assertDealsManager(client, input.accountId, user.id);

    return parseTemplateFields(
      decode(input.docxBase64),
      createSuperdocEngine(),
    );
  },
  { auth: true, schema: parseSchema },
);

export const saveTemplate = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    await assertDealsManager(client, input.accountId, user.id);

    const admin = getSupabaseServerAdminClient();

    const { data: template, error } = await admin
      .from('document_template')
      .insert({
        account_id: input.accountId,
        name: input.name,
        type: input.type,
        version: 1,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    const path = templateDocxPath(input.accountId, template.id, 1);

    const { error: uploadError } = await admin.storage
      .from(TEMPLATES_BUCKET)
      .upload(path, decode(input.docxBase64), {
        contentType: DOCX_CONTENT_TYPE,
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { error: pathError } = await admin
      .from('document_template')
      .update({ docx_path: path })
      .eq('id', template.id);

    if (pathError) {
      throw pathError;
    }

    const { error: fieldsError } = await admin
      .from('template_field')
      .insert(draftsToRows(template.id, input.fields));

    if (fieldsError) {
      throw fieldsError;
    }

    return { id: template.id };
  },
  { auth: true, schema: saveSchema },
);

export const createGeneratedLinks = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    await assertDealsManager(client, input.accountId, user.id);

    const admin = getSupabaseServerAdminClient();

    const { data, error } = await admin.storage
      .from(GENERATED_BUCKET)
      .createSignedUrls([input.docxPath, input.pdfPath], 3600);

    if (error) {
      throw error;
    }

    return {
      docxUrl: data[0]?.signedUrl ?? null,
      pdfUrl: data[1]?.signedUrl ?? null,
    };
  },
  { auth: true, schema: linksSchema },
);
