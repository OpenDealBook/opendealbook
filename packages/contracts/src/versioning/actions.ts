'use server';

import { z } from 'zod';

import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { generateFromTemplate } from '@odb/templates/server';

import { createSupabaseContractStorage } from '../storage';
import { contractPartySchema, contractTypeSchema } from '../types';
import { appendContractVersion, createContractRecord } from './versioning';

const createContractSchema = z.object({
  dealId: z.string(),
  type: contractTypeSchema,
  fromTemplateId: z.string().optional(),
});

const newVersionSchema = z.object({
  contractId: z.string(),
  docxBytes: z.instanceof(Uint8Array),
  party: contractPartySchema,
  changeSummary: z.string().optional(),
});

export const createContract = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    return createContractRecord(input, {
      client,
      createdByUserId: user.id,
      async generateVersionOne({ accountId, dealId, templateId }) {
        const generated = await generateFromTemplate({
          accountId,
          templateId,
          dealId,
          fieldValues: {},
        });

        return {
          generatedDocumentId: generated.id,
          docxPath: generated.docx_path,
          pdfPath: generated.pdf_path,
        };
      },
    });
  },
  { auth: true, schema: createContractSchema },
);

export const newVersionFromUpload = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    return appendContractVersion(
      input,
      {
        client,
        storage: createSupabaseContractStorage(client),
        authorUserId: user.id,
      },
      'upload',
    );
  },
  { auth: true, schema: newVersionSchema },
);

export const newVersionFromEditorSave = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    return appendContractVersion(
      input,
      {
        client,
        storage: createSupabaseContractStorage(client),
        authorUserId: user.id,
      },
      'editor_save',
    );
  },
  { auth: true, schema: newVersionSchema },
);
