'use server';

import { z } from 'zod';

import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { assertDealsManager, GENERATED_BUCKET } from '@odb/templates';

const linksSchema = z.object({
  accountId: z.string(),
  docxPath: z.string(),
  pdfPath: z.string(),
});

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
