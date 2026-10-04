import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { TEMPLATES_BUCKET, templateDocxPath } from '@odb/templates';

const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const FIXTURE_BY_TYPE: Record<string, string> = {
  loi: 'loi-standard.docx',
  apa: 'apa-short.docx',
};

function readFixture(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(
      fileURLToPath(
        new URL(`../../templates/fixtures/${name}`, import.meta.url),
      ),
    ),
  );
}

export async function uploadTemplateFixtures(): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const { data } = await client
    .from('document_template')
    .select('id, account_id, type, version');

  for (const row of data ?? []) {
    const fixture = FIXTURE_BY_TYPE[row.type];

    if (!fixture) {
      continue;
    }

    await client.storage
      .from(TEMPLATES_BUCKET)
      .upload(
        templateDocxPath(row.account_id, row.id, row.version),
        readFixture(fixture),
        { contentType: DOCX_CONTENT_TYPE, upsert: true },
      );
  }
}
