import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { uploadTemplateFixtures } from './upload-template-fixtures';

type Upload = {
  bucket: string;
  path: string;
  bytes: Uint8Array;
  options: { contentType: string; upsert: boolean };
};

const uploads: Upload[] = [];
let templateRows: Record<string, unknown>[] = [];

const client = {
  from: (table: string) => ({
    select: () =>
      Promise.resolve({
        data: table === 'document_template' ? templateRows : [],
        error: null,
      }),
  }),
  storage: {
    from: (bucket: string) => ({
      upload: (
        path: string,
        bytes: Uint8Array,
        options: { contentType: string; upsert: boolean },
      ) => {
        uploads.push({ bucket, path, bytes, options });
        return Promise.resolve({ error: null });
      },
    }),
  },
};

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => client,
}));

vi.mock('@odb/templates', () => ({
  TEMPLATES_BUCKET: 'templates',
  templateDocxPath: (accountId: string, templateId: string, version: number) =>
    `${accountId}/${templateId}/v${version}.docx`,
}));

function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(
      fileURLToPath(
        new URL(`../../templates/fixtures/${name}`, import.meta.url),
      ),
    ),
  );
}

const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('uploadTemplateFixtures', () => {
  beforeEach(() => {
    uploads.length = 0;
    templateRows = [];
  });

  it('uploads the fixture matching each template type to its storage key', async () => {
    templateRows = [
      { id: 'tmpl-loi', account_id: 'acct-1', type: 'loi', version: 1 },
      { id: 'tmpl-apa', account_id: 'acct-2', type: 'apa', version: 3 },
    ];

    await uploadTemplateFixtures();

    const loi = uploads.find((upload) => upload.path === 'acct-1/tmpl-loi/v1.docx');
    expect(loi?.bucket).toBe('templates');
    expect(loi?.options).toEqual({
      contentType: DOCX_CONTENT_TYPE,
      upsert: true,
    });
    expect(loi?.bytes).toEqual(fixtureBytes('loi-standard.docx'));

    const apa = uploads.find((upload) => upload.path === 'acct-2/tmpl-apa/v3.docx');
    expect(apa?.bytes).toEqual(fixtureBytes('apa-short.docx'));
  });

  it('skips rows whose type has no committed fixture', async () => {
    templateRows = [
      { id: 'tmpl-letter', account_id: 'acct-1', type: 'letter', version: 1 },
    ];

    await uploadTemplateFixtures();

    expect(uploads).toHaveLength(0);
  });
});
