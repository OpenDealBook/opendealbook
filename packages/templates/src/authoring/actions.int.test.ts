import { randomBytes } from 'node:crypto';

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  ANON_KEY,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
  admin,
  cleanUp,
  provisionPerson,
  provisionTeam,
  type Person,
} from '@odb/seller-rooms/test-support/world.ts';

import { templateDocument, zipDeflated } from '../test-support/docx-template';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

const session = vi.hoisted(() => ({ person: null as unknown }));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: { id: string }) => unknown) =>
    (input: unknown) =>
      fn(input, { id: (session.person as Person).userId }),
}));

const engineFault = vi.hoisted(() => ({ error: null as Error | null }));

vi.mock('../superdoc', async (importOriginal) => {
  const real = await importOriginal<typeof import('../superdoc')>();

  return {
    ...real,
    createSuperdocEngine: () => {
      const engine = real.createSuperdocEngine();

      return {
        ...engine,
        scanPlaceholders: (docx: Uint8Array) =>
          engineFault.error
            ? Promise.reject(engineFault.error)
            : engine.scanPlaceholders(docx),
      };
    },
  };
});

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => (session.person as Person).client,
}));

import { beginTemplateUpload, parseTemplateDocx, saveTemplate } from './actions';

const MEBIBYTE = 1024 * 1024;

let owner: Person;
let analyst: Person;
let teamId: string;

async function upload(bytes: Uint8Array, declaredSize = bytes.length) {
  const begun = await beginTemplateUpload({
    accountId: teamId,
    size: declaredSize,
  });

  if (!begun.ok) {
    throw new Error(begun.refusal);
  }

  const stored = await owner.client.storage
    .from('templates')
    .uploadToSignedUrl(begun.value.path, begun.value.token, new Blob([new Uint8Array(bytes)]));

  return { templateId: begun.value.templateId, stored };
}

async function parsed(templateId: string) {
  const result = await parseTemplateDocx({ accountId: teamId, templateId });

  if (!result.ok) {
    throw new Error(result.refusal);
  }

  return result.value;
}

beforeAll(async () => {
  owner = await provisionPerson();
  session.person = owner;
  teamId = await provisionTeam(owner, 'Template Uploads');
  analyst = await provisionPerson();
  await admin
    .from('accounts_memberships')
    .insert({ account_id: teamId, user_id: analyst.userId, account_role: 'analyst' })
    .throwOnError();
});

afterAll(async () => {
  await admin.storage
    .from('templates')
    .list(teamId)
    .then(({ data }) =>
      admin.storage
        .from('templates')
        .remove((data ?? []).map((entry) => `${teamId}/${entry.name}/v1.docx`)),
    );
  await cleanUp([teamId]);
});

describe('template upload through storage', () => {
  afterEach(() => {
    engineFault.error = null;
  });

  it('detects the fields of a template over 1 MB and saves it', async () => {
    const docx = templateDocument([
      'Offer for {{purchase_price}} closing on {{target_close_date}}.',
      randomBytes(1_200_000).toString('base64'),
    ]);

    expect(docx.length).toBeGreaterThan(MEBIBYTE);

    const { templateId, stored } = await upload(docx);

    expect(stored.error).toBeNull();

    const fields = await parsed(templateId);

    expect(fields.map((field) => field.key)).toEqual([
      'purchase_price',
      'target_close_date',
    ]);

    expect(
      await saveTemplate({
        accountId: teamId,
        templateId,
        name: 'Large LOI',
        type: 'loi',
        fields,
      }),
    ).toEqual({ ok: true, value: { id: templateId } });

    const { data: template } = await admin
      .from('document_template')
      .select('name, docx_path, template_field(key)')
      .eq('id', templateId)
      .single()
      .throwOnError();
    const { data: saved } = await admin.storage
      .from('templates')
      .download(template.docx_path!);

    expect(template.name).toBe('Large LOI');
    expect(template.template_field.map((field) => field.key).sort()).toEqual([
      'purchase_price',
      'target_close_date',
    ]);
    expect(saved!.size).toBe(docx.length);
  });

  it('refuses a template over 25 MB before upload', async () => {
    const begun = await beginTemplateUpload({
      accountId: teamId,
      size: 25 * MEBIBYTE + 1,
    });

    expect(begun).toEqual({
      ok: false,
      refusal: 'This template is over 25 MB',
    });
  });

  it('keeps an object over 25 MB out of storage even when its declared size was small', async () => {
    const { stored } = await upload(new Uint8Array(25 * MEBIBYTE + 1), 1000);

    expect(stored.error).not.toBeNull();
  });

  it('refuses a file that is not a Word document', async () => {
    const { templateId } = await upload(
      new TextEncoder().encode('Offer for {{purchase_price}}.'),
    );

    expect(
      await parseTemplateDocx({ accountId: teamId, templateId }),
    ).toEqual({ ok: false, refusal: 'Templates must be Word .docx files' });
  });

  it('refuses a zip that holds no Word document', async () => {
    const { templateId } = await upload(
      zipDeflated([{ name: 'xl/workbook.xml', data: Buffer.from('<workbook/>') }]),
    );

    expect(
      await parseTemplateDocx({ accountId: teamId, templateId }),
    ).toEqual({ ok: false, refusal: 'Templates must be Word .docx files' });
  });

  it('lets a fault that is not about the file surface', async () => {
    const { templateId } = await upload(
      templateDocument(['Offer for {{purchase_price}}.']),
    );
    engineFault.error = new Error('engine crashed');

    await expect(
      parseTemplateDocx({ accountId: teamId, templateId }),
    ).rejects.toThrow('engine crashed');
  });

  it('asks for the file again when nothing was uploaded', async () => {
    const begun = await beginTemplateUpload({ accountId: teamId, size: 1000 });

    if (!begun.ok) {
      throw new Error(begun.refusal);
    }

    const { templateId } = begun.value;

    expect({
      parsed: await parseTemplateDocx({ accountId: teamId, templateId }),
      saved: await saveTemplate({
        accountId: teamId,
        templateId,
        name: 'Missing LOI',
        type: 'loi',
        fields: [],
      }),
    }).toEqual({
      parsed: { ok: false, refusal: 'Upload the template file again' },
      saved: { ok: false, refusal: 'Upload the template file again' },
    });
  });

  it('refuses a Word document that cannot be read', async () => {
    const docx = templateDocument(['Offer for {{purchase_price}}.']);
    const { templateId } = await upload(docx.subarray(0, docx.length / 2));

    expect(
      await parseTemplateDocx({ accountId: teamId, templateId }),
    ).toEqual({
      ok: false,
      refusal: 'This file could not be read as a Word document',
    });
  });

  it('registers a retried save once', async () => {
    const docx = templateDocument(['Offer for {{purchase_price}}.']);
    const { templateId } = await upload(docx);
    const fields = await parsed(templateId);
    const save = () =>
      saveTemplate({
        accountId: teamId,
        templateId,
        name: 'Retried LOI',
        type: 'loi',
        fields,
      });

    await save();
    await save();

    const { data: templates } = await admin
      .from('document_template')
      .select('template_field(key)')
      .eq('account_id', teamId)
      .eq('name', 'Retried LOI')
      .throwOnError();

    expect(templates).toHaveLength(1);
    expect(templates[0]!.template_field).toEqual([{ key: 'purchase_price' }]);
  });
});

describe('a member who cannot manage deals', () => {
  beforeAll(() => {
    session.person = analyst;
  });

  afterAll(() => {
    session.person = owner;
  });

  it('is refused an upload', async () => {
    expect(
      await beginTemplateUpload({ accountId: teamId, size: 1000 }),
    ).toEqual({
      ok: false,
      refusal: 'Only deal managers can upload templates. Ask a deal manager.',
    });
  });

  it('is refused field detection', async () => {
    expect(
      await parseTemplateDocx({
        accountId: teamId,
        templateId: crypto.randomUUID(),
      }),
    ).toEqual({
      ok: false,
      refusal: 'Only deal managers can upload templates. Ask a deal manager.',
    });
  });

  it('is refused a save', async () => {
    expect(
      await saveTemplate({
        accountId: teamId,
        templateId: crypto.randomUUID(),
        name: 'Analyst LOI',
        type: 'loi',
        fields: [],
      }),
    ).toEqual({
      ok: false,
      refusal: 'Only deal managers can save templates. Ask a deal manager.',
    });
  });
});
