import { type SupabaseClient, createClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createSupabaseContractStorage } from '@odb/contracts';
import { recordExternalSignature } from '@odb/contracts/esign';
import { appendDealEvent } from '@odb/events';
import type { Database } from '@odb/supabase';

import {
  type IntegrationAccount,
  provisionAccount,
} from '../../test-support/integration-harness';

const holder = vi.hoisted(() => ({
  client: null as unknown,
  admin: null as unknown,
  userId: '',
}));

const documenso = vi.hoisted(() => {
  const states = new Map<string, string>();

  return {
    states,
    client: {
      createDraft: async () => {
        const documentId = `envelope_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
        states.set(documentId, 'draft');
        return { documentId };
      },
      deleteDraft: async (documentId: string) => {
        states.delete(documentId);
      },
      cancelSent: async (documentId: string) => {
        states.set(documentId, 'cancelled');
      },
      editorUrl: async (documentId: string) =>
        `https://sign.test/t/team/documents/${documentId}/edit`,
      signatureState: async (documentId: string) => ({
        state: states.get(documentId) ?? 'missing',
      }),
      downloadSignedPdf: async (documentId: string) =>
        Buffer.from(`%PDF-1.7 signed ${documentId}`),
    },
  };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (data: unknown, user: { id: string }) => unknown) =>
    (data: unknown, user?: { id: string }) =>
      fn(data, user ?? { id: holder.userId }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => holder.client,
  getSupabaseServerAdminClient: () => holder.admin,
}));

vi.mock('@odb/templates/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/templates/server')>()),
  generateFromTemplate: async (input: {
    accountId: string;
    templateId: string;
    dealId: string;
    fieldValues: Record<string, unknown>;
  }) => {
    const client = holder.client as SupabaseClient<Database>;
    const path = `${input.accountId}/${input.dealId}/${crypto.randomUUID()}`;

    await client.storage
      .from('generated')
      .upload(`${path}.pdf`, new Uint8Array([37, 80, 68, 70]), {
        contentType: 'application/pdf',
      })
      .then(({ error }) => {
        if (error) {
          throw error;
        }
      });

    const { data } = await client
      .from('generated_document')
      .insert({
        account_id: input.accountId,
        deal_id: input.dealId,
        template_id: input.templateId,
        values_json: input.fieldValues as never,
        docx_path: `${path}.docx`,
        pdf_path: `${path}.pdf`,
        created_by: holder.userId,
      })
      .select('*')
      .single()
      .throwOnError();

    return data;
  },
}));

const storageOutage = vi.hoisted(() => ({ uploadsToFail: 0 }));

vi.mock('@odb/contracts', async (importOriginal) => {
  const contracts = await importOriginal<typeof import('@odb/contracts')>();

  return {
    ...contracts,
    createSupabaseContractStorage: (
      client: Parameters<typeof contracts.createSupabaseContractStorage>[0],
    ) => {
      const storage = contracts.createSupabaseContractStorage(client);

      return {
        ...storage,
        uploadVersion: async (
          ...upload: Parameters<typeof storage.uploadVersion>
        ) => {
          if (storageOutage.uploadsToFail > 0) {
            storageOutage.uploadsToFail -= 1;
            throw new Error('Storage is unavailable');
          }

          return storage.uploadVersion(...upload);
        },
      };
    },
  };
});

vi.mock('@odb/contracts/esign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/contracts/esign')>()),
  createDocumensoClient: () => documenso.client,
}));

import { sendContractForSignature } from './contract-signature-actions';
import { createContract } from './create-contract-action';
import { createDealCore } from './deal-actions';
import {
  createLoiExtensionFromTemplate,
  createNotedLoiExtension,
  noteLoiExtension,
  recordLoiExtensionSignedElsewhere,
  recordSignedCopyOfLoiExtension,
  rescheduleLoiExtension,
} from './loi-extension-actions';

type Action = (data: Record<string, unknown>) => Promise<unknown>;

function day(offset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);

  return date.toISOString().slice(0, 10);
}

function medium(isoDay: string): string {
  return new Date(`${isoDay}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const LOI_SIGNED_ON = day(-20);
const EXCLUSIVITY_ENDS_ON = day(10);
const EXTENDED_TO = day(40);

let account: IntegrationAccount;

async function newDeal(description: string): Promise<string> {
  return createDealCore(
    account.user,
    {
      account_id: account.accountId,
      business_name: description,
      industry: 'Accounting',
      description,
      source: 'manual',
      stage: 'sourcing',
    },
    account.userId,
  );
}

function storage() {
  return createSupabaseContractStorage(account.user);
}

async function paperLoi(dealId: string, signedOn: string | null) {
  const { data: deal } = await account.admin
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .single()
    .throwOnError();
  const loiId = crypto.randomUUID();

  await appendDealEvent(account.user, {
    dealId,
    aggregateType: 'contract',
    aggregateId: loiId,
    eventType: 'contract.created',
    payload: { type: 'loi', status: 'draft', current_version: 0 },
  });

  if (signedOn === null) {
    await account.user
      .from('contract_version')
      .insert({
        contract_id: loiId,
        account_id: deal.account_id,
        version: 1,
        source: 'upload',
        party: 'buyer',
      })
      .throwOnError();
    await appendDealEvent(account.user, {
      dealId,
      aggregateType: 'contract',
      aggregateId: loiId,
      eventType: 'contract.version_set',
      payload: { current_version: 1 },
    });

    return loiId;
  }

  await recordExternalSignature(
    {
      dealId,
      type: 'loi',
      contractId: loiId,
      party: 'buyer',
      signedOn,
      copy: { kind: 'pdf', bytes: new TextEncoder().encode(`%PDF ${loiId}`) },
    },
    {
      client: account.user,
      admin: account.admin,
      documenso: documenso.client as never,
      storage: storage(),
      authorUserId: account.userId,
    },
  );

  return loiId;
}

async function dealWithSignedLoi(
  description: string,
  exclusivityEndsOn: string | null = EXCLUSIVITY_ENDS_ON,
) {
  const dealId = await newDeal(description);
  const loiId = await paperLoi(dealId, LOI_SIGNED_ON);

  if (exclusivityEndsOn !== null) {
    await appendDealEvent(account.user, {
      dealId,
      aggregateType: 'deal_milestone',
      aggregateId: crypto.randomUUID(),
      eventType: 'deal_milestone.set',
      payload: {
        kind: 'exclusivity_end',
        target_on: exclusivityEndsOn,
        actual_on: null,
      },
    });
  }

  return { dealId, loiId };
}

async function exclusivityEnd(dealId: string) {
  const { data } = await account.admin
    .from('deal_milestone')
    .select('target_on')
    .eq('deal_id', dealId)
    .eq('kind', 'exclusivity_end')
    .maybeSingle()
    .throwOnError();

  return data?.target_on ?? null;
}

async function extensionsOf(dealId: string) {
  const { data } = await account.admin
    .from('contract')
    .select(
      'id, parent_contract_id, extends_to, note, noted_on, versions:contract_version(id, version, is_signed, signing_status)',
    )
    .eq('deal_id', dealId)
    .eq('type', 'loi_extension')
    .throwOnError();

  return data;
}

function signedCopy(text: string) {
  return new File([`%PDF-1.7 ${text}`], 'extension.pdf', {
    type: 'application/pdf',
  });
}

function fromTemplate(dealId: string, loiId: string, extendsTo = EXTENDED_TO) {
  return (createLoiExtensionFromTemplate as unknown as Action)({
    deal_id: dealId,
    loi_id: loiId,
    extends_to: extendsTo,
  });
}

async function draftExtension(description: string) {
  const { dealId, loiId } = await dealWithSignedLoi(description);
  const created = await fromTemplate(dealId, loiId);
  expect(created).toMatchObject({ ok: true });
  const [extension] = await extensionsOf(dealId);

  return { dealId, loiId, extension: extension! };
}

function note(dealId: string, extensionId: string, notedOn = day(-1)) {
  return (noteLoiExtension as unknown as Action)({
    deal_id: dealId,
    extension_id: extensionId,
    note: 'Seller agreed by email to thirty more days',
    noted_on: notedOn,
  });
}

async function versionlessDraft(description: string) {
  const { dealId, loiId } = await dealWithSignedLoi(description);
  storageOutage.uploadsToFail = 1;
  await expect(
    (recordLoiExtensionSignedElsewhere as unknown as Action)({
      deal_id: dealId,
      loi_id: loiId,
      extends_to: EXTENDED_TO,
      party: 'buyer',
      signed_on: day(-1),
      file: signedCopy(description),
    }),
  ).rejects.toThrow('Storage is unavailable');
  const [extension] = await extensionsOf(dealId);
  expect(extension).toMatchObject({ versions: [], note: null });

  return { dealId, loiId, extension: extension! };
}

async function newExclusivityEndsInDocuments(extensionId: string) {
  const { data } = await account.admin
    .from('generated_document')
    .select('values_json, created_at')
    .eq('contract_id', extensionId)
    .order('created_at')
    .throwOnError();

  return data.map(
    (document) =>
      (document.values_json as { new_exclusivity_end_date: string })
        .new_exclusivity_end_date,
  );
}

const SIGNERS = [
  { name: 'Bea Buyer', email: 'buyer@example.com' },
  { name: 'Sol Seller', email: 'seller@example.com' },
];

function sendForSignature(versionId: string) {
  return (sendContractForSignature as unknown as Action)({
    contract_version_id: versionId,
    signers: SIGNERS,
  });
}

let templateId: string;

async function templateFields(
  fields: { key: string; label: string }[],
): Promise<void> {
  await account.admin
    .from('template_field')
    .delete()
    .eq('template_id', templateId)
    .throwOnError();
  await account.admin
    .from('template_field')
    .insert(
      fields.map((field, sortOrder) => ({
        template_id: templateId,
        key: field.key,
        label: field.label,
        type: 'date',
        source: 'manual',
        sort_order: sortOrder,
      })),
    )
    .throwOnError();
}

const EXTENSION_FIELDS = [
  { key: 'loi_signed_date', label: 'LOI signed date' },
  { key: 'exclusivity_end_date', label: 'Current exclusivity end' },
  { key: 'new_exclusivity_end_date', label: 'New exclusivity end' },
];

beforeAll(async () => {
  account = await provisionAccount();
  holder.client = account.user;
  holder.admin = account.admin;
  holder.userId = account.userId;
  process.env.DOCUMENSO_URL = 'https://sign.test';
  process.env.DOCUMENSO_API_KEY = 'api_test';

  const { data: template } = await account.admin
    .from('document_template')
    .insert({
      account_id: account.accountId,
      name: 'LOI extension',
      type: 'loi_extension',
      docx_path: 'mock/loi-extension.docx',
      version: 1,
    })
    .select('id')
    .single()
    .throwOnError();
  templateId = template.id;
  await templateFields(EXTENSION_FIELDS);
});

afterAll(async () => {
  await account.cleanup();
});

describe('creating an LOI extension from a template', () => {
  it('drafts version 1 of an extension of the signed LOI, filling the three extension dates', async () => {
    const { dealId, loiId } = await dealWithSignedLoi('Template extension');

    expect(await fromTemplate(dealId, loiId)).toMatchObject({ ok: true });

    const extensions = await extensionsOf(dealId);
    expect(extensions).toEqual([
      expect.objectContaining({
        parent_contract_id: loiId,
        extends_to: EXTENDED_TO,
        versions: [expect.objectContaining({ version: 1, is_signed: false })],
      }),
    ]);

    const { data: documents } = await account.admin
      .from('generated_document')
      .select('values_json')
      .eq('contract_id', extensions[0]!.id)
      .throwOnError();
    expect(documents).toEqual([
      {
        values_json: expect.objectContaining({
          loi_signed_date: LOI_SIGNED_ON,
          exclusivity_end_date: EXCLUSIVITY_ENDS_ON,
          new_exclusivity_end_date: EXTENDED_TO,
        }),
      },
    ]);
    expect(await exclusivityEnd(dealId)).toBe(EXCLUSIVITY_ENDS_ON);
  });

  it('drafts onto the extension already made for that date, though it has no version yet', async () => {
    const { dealId, loiId, extension } = await versionlessDraft(
      'Versionless then generated',
    );

    expect(await fromTemplate(dealId, loiId)).toMatchObject({ ok: true });

    expect(await extensionsOf(dealId)).toEqual([
      expect.objectContaining({
        id: extension.id,
        versions: [expect.objectContaining({ version: 1 })],
      }),
    ]);
  });

  it('refuses to draft again once the extension is noted, adding no version', async () => {
    const { dealId, loiId, extension } = await draftExtension(
      'Noted then generated',
    );
    await note(dealId, extension.id);

    expect(await fromTemplate(dealId, loiId)).toEqual({
      ok: false,
      refusal: 'This LOI extension has already been noted',
    });
    expect((await extensionsOf(dealId))[0]!.versions).toHaveLength(1);
  });

  it('refuses to draft again once the extension is signed, adding no version', async () => {
    const { dealId, loiId } = await dealWithSignedLoi('Signed then generated');
    await (recordLoiExtensionSignedElsewhere as unknown as Action)({
      deal_id: dealId,
      loi_id: loiId,
      extends_to: EXTENDED_TO,
      party: 'buyer',
      signed_on: day(-1),
      file: signedCopy('signed then generated'),
    });

    expect(await fromTemplate(dealId, loiId)).toEqual({
      ok: false,
      refusal: 'This LOI extension has already been signed',
    });
    expect((await extensionsOf(dealId))[0]!.versions).toHaveLength(1);
  });

  it('names the blank fields the template uses, drafting nothing', async () => {
    const { dealId, loiId } = await dealWithSignedLoi('Blank end', null);

    expect(await fromTemplate(dealId, loiId)).toEqual({
      ok: false,
      refusal: 'Fill in: Current exclusivity end',
    });
    expect(await extensionsOf(dealId)).toEqual([]);
  });

  it('refuses a new end that is not after the current end', async () => {
    const { dealId, loiId } = await dealWithSignedLoi('Early end');

    expect(await fromTemplate(dealId, loiId, EXCLUSIVITY_ENDS_ON)).toEqual({
      ok: false,
      refusal: `The new exclusivity end must be after ${medium(EXCLUSIVITY_ENDS_ON)}`,
    });
    expect(await extensionsOf(dealId)).toEqual([]);
  });

  it('refuses to note an extension of an LOI that is not the signed one', async () => {
    const dealId = await newDeal('Unsigned LOI');
    const loiId = await paperLoi(dealId, null);

    expect(
      await (createNotedLoiExtension as unknown as Action)({
        deal_id: dealId,
        loi_id: loiId,
        extends_to: EXTENDED_TO,
        note: 'Seller agreed by email',
        noted_on: day(-1),
      }),
    ).toEqual({
      ok: false,
      refusal: "Only the deal's current signed LOI can be extended",
    });
    expect(await extensionsOf(dealId)).toEqual([]);
  });
});

describe('noting an LOI extension agreed without a document', () => {
  it('records the note and moves the end of exclusivity to the new date', async () => {
    const { dealId, extension } = await draftExtension('Noted extension');
    const notedOn = day(-1);

    expect(await note(dealId, extension.id, notedOn)).toEqual({
      ok: true,
      value: undefined,
    });

    expect(await extensionsOf(dealId)).toEqual([
      expect.objectContaining({
        note: 'Seller agreed by email to thirty more days',
        noted_on: notedOn,
      }),
    ]);
    expect(await exclusivityEnd(dealId)).toBe(EXTENDED_TO);
  });

  it('creates and notes an extension that has no document, once however often it is sent', async () => {
    const { dealId, loiId } = await dealWithSignedLoi('Noted by email');
    const noteByEmail = () =>
      (createNotedLoiExtension as unknown as Action)({
        deal_id: dealId,
        loi_id: loiId,
        extends_to: EXTENDED_TO,
        note: 'Seller agreed by email',
        noted_on: day(-1),
      });

    expect(await noteByEmail()).toEqual({ ok: true, value: undefined });
    expect(await noteByEmail()).toEqual({ ok: true, value: undefined });

    expect(await extensionsOf(dealId)).toEqual([
      expect.objectContaining({
        parent_contract_id: loiId,
        extends_to: EXTENDED_TO,
        note: 'Seller agreed by email',
        noted_on: day(-1),
        versions: [],
      }),
    ]);
    expect(await exclusivityEnd(dealId)).toBe(EXTENDED_TO);
  });

  it('leaves no extension behind when the new one is noted with a day after today', async () => {
    const { dealId, loiId } = await dealWithSignedLoi('Future noted by email');

    expect(
      await (createNotedLoiExtension as unknown as Action)({
        deal_id: dealId,
        loi_id: loiId,
        extends_to: EXTENDED_TO,
        note: 'Seller agreed by email',
        noted_on: day(5),
      }),
    ).toEqual({
      ok: false,
      refusal: 'The day the extension was agreed cannot be in the future',
    });
    expect(await extensionsOf(dealId)).toEqual([]);
  });

  it('refuses while a signature request is in flight, noting nothing', async () => {
    const { dealId, extension } = await draftExtension('Noted in flight');
    expect(await sendForSignature(extension.versions[0]!.id)).toMatchObject({
      ok: true,
    });

    expect(await note(dealId, extension.id)).toEqual({
      ok: false,
      refusal:
        'A signature request for this LOI extension is already in progress',
    });
    expect(await extensionsOf(dealId)).toEqual([
      expect.objectContaining({ note: null }),
    ]);
    expect(await exclusivityEnd(dealId)).toBe(EXCLUSIVITY_ENDS_ON);
  });

  it('refuses a blank note', async () => {
    const { dealId, extension } = await draftExtension('Blank note');

    expect(
      await (noteLoiExtension as unknown as Action)({
        deal_id: dealId,
        extension_id: extension.id,
        note: '  ',
        noted_on: day(-1),
      }),
    ).toEqual({ ok: false, refusal: 'Say how the extension was agreed' });
  });

  it('refuses a day after today', async () => {
    const { dealId, extension } = await draftExtension('Future note');

    expect(await note(dealId, extension.id, day(5))).toEqual({
      ok: false,
      refusal: 'The day the extension was agreed cannot be in the future',
    });
    expect(await exclusivityEnd(dealId)).toBe(EXCLUSIVITY_ENDS_ON);
  });

  it('refuses a day before the LOI was signed', async () => {
    const { dealId, extension } = await draftExtension('Early note');

    expect(await note(dealId, extension.id, day(-30))).toEqual({
      ok: false,
      refusal: `The day the extension was agreed cannot be before the LOI was signed on ${medium(LOI_SIGNED_ON)}`,
    });
  });

  it('refuses an extension that already has a signed copy', async () => {
    const { dealId, loiId } = await dealWithSignedLoi('Signed then noted');
    const recorded = await (
      recordLoiExtensionSignedElsewhere as unknown as Action
    )({
      deal_id: dealId,
      loi_id: loiId,
      extends_to: EXTENDED_TO,
      party: 'buyer',
      signed_on: day(-1),
      file: signedCopy('signed then noted'),
    });
    expect(recorded).toMatchObject({ ok: true });
    const [extension] = await extensionsOf(dealId);

    expect(await note(dealId, extension!.id)).toEqual({
      ok: false,
      refusal: 'This extension has a signed copy, so it cannot be noted',
    });
  });
});

describe('recording a signed copy of an LOI extension', () => {
  it('creates the signed extension from an upload once, however often it is sent', async () => {
    const { dealId, loiId } = await dealWithSignedLoi('Uploaded extension');
    const upload = () =>
      (recordLoiExtensionSignedElsewhere as unknown as Action)({
        deal_id: dealId,
        loi_id: loiId,
        extends_to: EXTENDED_TO,
        party: 'buyer',
        signed_on: day(-1),
        file: signedCopy('uploaded'),
      });

    expect(await upload()).toMatchObject({ ok: true });
    expect(await upload()).toMatchObject({ ok: true });

    expect(await extensionsOf(dealId)).toEqual([
      expect.objectContaining({
        parent_contract_id: loiId,
        extends_to: EXTENDED_TO,
        versions: [expect.objectContaining({ is_signed: true })],
      }),
    ]);
    expect(await exclusivityEnd(dealId)).toBe(EXTENDED_TO);
  });

  it('completes the same extension when an upload that failed to store is sent again', async () => {
    const { dealId, loiId } = await dealWithSignedLoi('Upload outage');
    const upload = () =>
      (recordLoiExtensionSignedElsewhere as unknown as Action)({
        deal_id: dealId,
        loi_id: loiId,
        extends_to: EXTENDED_TO,
        party: 'buyer',
        signed_on: day(-1),
        file: signedCopy('upload outage'),
      });

    storageOutage.uploadsToFail = 1;
    await expect(upload()).rejects.toThrow('Storage is unavailable');
    expect(await upload()).toMatchObject({ ok: true });

    expect(await extensionsOf(dealId)).toEqual([
      expect.objectContaining({
        parent_contract_id: loiId,
        extends_to: EXTENDED_TO,
        versions: [expect.objectContaining({ is_signed: true })],
      }),
    ]);
    expect(await exclusivityEnd(dealId)).toBe(EXTENDED_TO);
  });

  it('refuses an upload whose new end is not after the current end', async () => {
    const { dealId, loiId } = await dealWithSignedLoi('Uploaded early end');

    expect(
      await (recordLoiExtensionSignedElsewhere as unknown as Action)({
        deal_id: dealId,
        loi_id: loiId,
        extends_to: EXCLUSIVITY_ENDS_ON,
        party: 'buyer',
        signed_on: day(-1),
        file: signedCopy('early'),
      }),
    ).toEqual({
      ok: false,
      refusal: `The new exclusivity end must be after ${medium(EXCLUSIVITY_ENDS_ON)}`,
    });
    expect(await extensionsOf(dealId)).toEqual([]);
  });

  it('attaches the signed copy to an extension that was noted first', async () => {
    const { dealId, extension } = await draftExtension('Noted then signed');
    await note(dealId, extension.id);

    expect(
      await (recordSignedCopyOfLoiExtension as unknown as Action)({
        deal_id: dealId,
        extension_id: extension.id,
        party: 'seller',
        signed_on: day(-1),
        file: signedCopy('noted then signed'),
      }),
    ).toMatchObject({ ok: true });

    const extensions = await extensionsOf(dealId);
    expect(extensions).toHaveLength(1);
    expect(extensions[0]!.versions).toContainEqual(
      expect.objectContaining({ is_signed: true }),
    );
  });
});

describe('correcting the end date of an LOI extension', () => {
  it('moves the date of a generated draft and drafts a new version stating it', async () => {
    const { dealId, extension } = await draftExtension('Corrected draft');

    expect(
      await (rescheduleLoiExtension as unknown as Action)({
        deal_id: dealId,
        extension_id: extension.id,
        extends_to: day(45),
      }),
    ).toEqual({ ok: true, value: undefined });
    const [corrected] = await extensionsOf(dealId);
    expect(corrected).toMatchObject({ extends_to: day(45) });
    expect(
      corrected!.versions.map((version) => version.version).toSorted(),
    ).toEqual([1, 2]);
    expect(await newExclusivityEndsInDocuments(extension.id)).toEqual([
      EXTENDED_TO,
      day(45),
    ]);
  });

  it('drafts the new version from the template the extension was drafted from, not a newer one', async () => {
    const { dealId, extension } = await draftExtension('Corrected template');
    const { data: newer } = await account.admin
      .from('document_template')
      .insert({
        account_id: account.accountId,
        name: 'LOI extension, revised',
        type: 'loi_extension',
        docx_path: 'mock/loi-extension-revised.docx',
        version: 2,
      })
      .select('id')
      .single()
      .throwOnError();

    const corrected = await (rescheduleLoiExtension as unknown as Action)({
      deal_id: dealId,
      extension_id: extension.id,
      extends_to: day(45),
    }).finally(() =>
      account.admin
        .from('document_template')
        .delete()
        .eq('id', newer.id)
        .throwOnError(),
    );

    expect(corrected).toEqual({ ok: true, value: undefined });
    const { data: documents } = await account.admin
      .from('generated_document')
      .select('template_id')
      .eq('contract_id', extension.id)
      .throwOnError();
    expect(documents).toEqual([
      { template_id: templateId },
      { template_id: templateId },
    ]);
  });

  it('refuses a date another extension of the LOI already has, keeping its own', async () => {
    const { dealId, loiId } = await dealWithSignedLoi('Corrected onto another');
    await fromTemplate(dealId, loiId);
    await fromTemplate(dealId, loiId, day(45));
    const later = (await extensionsOf(dealId)).find(
      (extension) => extension.extends_to === day(45),
    )!;

    expect(
      await (rescheduleLoiExtension as unknown as Action)({
        deal_id: dealId,
        extension_id: later.id,
        extends_to: EXTENDED_TO,
      }),
    ).toEqual({
      ok: false,
      refusal: `This LOI already has an extension to ${medium(EXTENDED_TO)}`,
    });
    expect(
      (await extensionsOf(dealId))
        .map((extension) => extension.extends_to)
        .toSorted(),
    ).toEqual([EXTENDED_TO, day(45)].toSorted());
  });

  it('only moves the date of a draft that has no version', async () => {
    const { dealId, extension } = await versionlessDraft(
      'Corrected versionless',
    );

    expect(
      await (rescheduleLoiExtension as unknown as Action)({
        deal_id: dealId,
        extension_id: extension.id,
        extends_to: day(45),
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(await extensionsOf(dealId)).toEqual([
      expect.objectContaining({ extends_to: day(45), versions: [] }),
    ]);
  });

  it('refuses while a signature request is in flight, keeping the date', async () => {
    const { dealId, extension } = await draftExtension('Corrected in flight');
    await sendForSignature(extension.versions[0]!.id);

    expect(
      await (rescheduleLoiExtension as unknown as Action)({
        deal_id: dealId,
        extension_id: extension.id,
        extends_to: day(45),
      }),
    ).toEqual({
      ok: false,
      refusal:
        'A signature request for this LOI extension is already in progress',
    });
    expect(await extensionsOf(dealId)).toEqual([
      expect.objectContaining({ extends_to: EXTENDED_TO }),
    ]);
  });

  it('refuses once the extension is noted', async () => {
    const { dealId, extension } = await draftExtension('Corrected noted');
    await note(dealId, extension.id);

    expect(
      await (rescheduleLoiExtension as unknown as Action)({
        deal_id: dealId,
        extension_id: extension.id,
        extends_to: day(45),
      }),
    ).toEqual({
      ok: false,
      refusal:
        'This extension is signed or noted, so its end date can no longer change',
    });
  });
});

describe('sending an LOI extension for signature', () => {
  it('drafts the request in Documenso, then refuses a second while it is in flight', async () => {
    const { extension } = await draftExtension('Sent extension');
    const send = () =>
      (sendContractForSignature as unknown as Action)({
        contract_version_id: extension.versions[0]!.id,
        signers: [
          { name: 'Bea Buyer', email: 'buyer@example.com' },
          { name: 'Sol Seller', email: 'seller@example.com' },
        ],
      });

    expect(await send()).toMatchObject({
      ok: true,
      value: { editorUrl: expect.stringContaining('https://sign.test/') },
    });
    expect(await send()).toEqual({
      ok: false,
      refusal:
        'A signature request for this LOI extension is already in progress',
    });
  });
});

describe('a team member who does not manage deals', () => {
  async function signedInMember() {
    const unique = crypto.randomUUID().slice(0, 8);
    const email = `int-member-${unique}@odb.test`;
    const password = `Pw-${unique}-Aa1!`;
    const { data } = await account.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    await account.admin
      .from('accounts_memberships')
      .insert({
        account_id: account.accountId,
        user_id: data.user!.id,
        account_role: 'member',
      })
      .throwOnError();
    const member = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
      (account.user as unknown as { supabaseKey: string }).supabaseKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    await member.auth.signInWithPassword({ email, password });

    return { member, memberId: data.user!.id };
  }

  it('is told only deal managers can draft an extension from a template', async () => {
    const { dealId, loiId } = await dealWithSignedLoi('Member drafts');
    const { member, memberId } = await signedInMember();
    holder.client = member;
    holder.userId = memberId;

    const attempt = await fromTemplate(dealId, loiId).finally(() => {
      holder.client = account.user;
      holder.userId = account.userId;
    });

    expect(attempt).toEqual({
      ok: false,
      refusal: expect.stringMatching(
        /^Only deal managers can extend LOIs\. Ask /,
      ),
    });
    expect(await extensionsOf(dealId)).toEqual([]);
  });

  it('stores nothing when recording a signed copy onto an existing extension', async () => {
    const { dealId, loiId, extension } =
      await draftExtension('Member signed copy');
    holder.client = (await signedInMember()).member;

    const attempts = await Promise.all([
      (recordSignedCopyOfLoiExtension as unknown as Action)({
        deal_id: dealId,
        extension_id: extension.id,
        party: 'buyer',
        signed_on: day(-1),
        file: signedCopy('member stored copy'),
      }),
      (recordLoiExtensionSignedElsewhere as unknown as Action)({
        deal_id: dealId,
        loi_id: loiId,
        extends_to: EXTENDED_TO,
        party: 'buyer',
        signed_on: day(-1),
        file: signedCopy('member upload onto the draft'),
      }),
    ]).finally(() => {
      holder.client = account.user;
    });

    expect(attempts).toEqual([
      {
        ok: false,
        refusal: expect.stringMatching(
          /^Only deal managers can record signed LOI extensions\. Ask /,
        ),
      },
      {
        ok: false,
        refusal: expect.stringMatching(
          /^Only deal managers can record signed LOI extensions\. Ask /,
        ),
      },
    ]);
    expect((await extensionsOf(dealId))[0]!.versions).toHaveLength(1);
    const { data: stored } = await account.admin.storage
      .from('contracts')
      .list(`${account.accountId}/${extension.id}`);
    expect(stored!.map((file) => file.name)).toEqual(['v1.pdf']);
  });

  it('is told only deal managers can note, correct, record or send an extension', async () => {
    const { dealId, loiId, extension } = await draftExtension('Member asks');
    holder.client = (await signedInMember()).member;

    const attempts = await Promise.all([
      (noteLoiExtension as unknown as Action)({
        deal_id: dealId,
        extension_id: extension.id,
        note: 'Agreed by phone',
        noted_on: day(-1),
      }),
      (createNotedLoiExtension as unknown as Action)({
        deal_id: dealId,
        loi_id: loiId,
        extends_to: day(50),
        note: 'Agreed by phone',
        noted_on: day(-1),
      }),
      (rescheduleLoiExtension as unknown as Action)({
        deal_id: dealId,
        extension_id: extension.id,
        extends_to: day(45),
      }),
      (recordLoiExtensionSignedElsewhere as unknown as Action)({
        deal_id: dealId,
        loi_id: loiId,
        extends_to: day(50),
        party: 'buyer',
        signed_on: day(-1),
        file: signedCopy('member upload'),
      }),
      (recordSignedCopyOfLoiExtension as unknown as Action)({
        deal_id: dealId,
        extension_id: extension.id,
        party: 'buyer',
        signed_on: day(-1),
        file: signedCopy('member copy'),
      }),
      (sendContractForSignature as unknown as Action)({
        contract_version_id: extension.versions[0]!.id,
        signers: [{ name: 'Bea Buyer', email: 'buyer@example.com' }],
      }),
    ]);
    holder.client = account.user;

    expect(
      attempts.map((attempt) => (attempt as { refusal: string }).refusal),
    ).toEqual([
      expect.stringMatching(
        /^Only deal managers can note LOI extensions\. Ask /,
      ),
      expect.stringMatching(
        /^Only deal managers can note LOI extensions\. Ask /,
      ),
      expect.stringMatching(
        /^Only deal managers can change the end date of LOI extensions\. Ask /,
      ),
      expect.stringMatching(
        /^Only deal managers can record signed LOI extensions\. Ask /,
      ),
      expect.stringMatching(
        /^Only deal managers can record signed LOI extensions\. Ask /,
      ),
      'Only deal managers can send contracts for signature. Ask a deal manager.',
    ]);
    expect(await extensionsOf(dealId)).toEqual([
      expect.objectContaining({ extends_to: EXTENDED_TO, note: null }),
    ]);
  });
});

describe('createContract', () => {
  it('does not create an LOI extension, which needs its LOI and new end', async () => {
    const dealId = await newDeal('Bare extension');

    expect(
      await (createContract as unknown as Action)({
        dealId,
        type: 'loi_extension',
      }),
    ).toMatchObject({ ok: false });
    expect(await extensionsOf(dealId)).toEqual([]);
  });
});
