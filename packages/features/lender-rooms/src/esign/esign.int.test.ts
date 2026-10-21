import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { SignatureState } from '@odb/contracts/esign';

import {
  type Person,
  admin,
  provisionPerson,
  removeEverythingSeeded,
  seedDocument,
  seedRoom,
  seedTeamDeal,
} from '../asks/integration-harness';

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

interface DraftInDocumenso {
  title: string;
  pdf: string;
  signers: { name: string; email: string }[];
}

interface SentNotification {
  eventType: string;
  email: string | undefined;
  payload: unknown;
}

const harness = vi.hoisted(() => ({
  client: null as unknown,
  documenso: {
    drafts: [] as DraftInDocumenso[],
    states: new Map<string, string>(),
    deleted: [] as string[],
    nextDocumentId: null as string | null,
    refusesToDelete: false,
    signedPdf: null as string | null,
    isDown: false,
  },
  notifications: [] as SentNotification[],
}));

const SIGNED_PDF = '%PDF-1.7 signed by everyone';

function editorUrlOf(documensoDocumentId: string) {
  return `http://documenso.test/t/our-team/documents/${documensoDocumentId}/edit`;
}

function reachDocumenso() {
  if (harness.documenso.isDown) {
    throw new Error('Documenso responded with 503');
  }
}

const documenso = {
  createDraft: async (input: {
    title: string;
    pdf: Uint8Array;
    signers: { name: string; email: string }[];
  }) => {
    reachDocumenso();
    const documentId =
      harness.documenso.nextDocumentId ??
      `envelope_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;

    harness.documenso.drafts.push({
      title: input.title,
      pdf: Buffer.from(input.pdf).toString('latin1'),
      signers: input.signers,
    });
    harness.documenso.states.set(documentId, 'draft');

    return { documentId };
  },
  deleteDraft: async (documentId: string) => {
    reachDocumenso();
    if (harness.documenso.refusesToDelete) {
      throw new Error('Documenso responded with 500');
    }
    harness.documenso.deleted.push(documentId);
    harness.documenso.states.delete(documentId);
  },
  editorUrl: async (documentId: string) => {
    reachDocumenso();
    return editorUrlOf(documentId);
  },
  signatureState: async (documentId: string) => {
    reachDocumenso();
    const state = (harness.documenso.states.get(documentId) ??
      'missing') as SignatureState;

    return state === 'completed'
      ? { state, completedOn: new Date().toISOString().slice(0, 10) }
      : { state };
  },
  downloadSignedPdf: async () => {
    reachDocumenso();
    return Buffer.from(harness.documenso.signedPdf ?? SIGNED_PDF, 'latin1');
  },
};

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => harness.client,
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (
      fn: (input: unknown) => unknown,
      config: { schema: { parse: (input: unknown) => unknown } },
    ) =>
    async (input: unknown) =>
      fn(config.schema.parse(input)),
}));

vi.mock('@odb/contracts/esign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/contracts/esign')>()),
  createDocumensoClient: () => documenso,
}));

vi.mock('@odb/notifications/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/notifications/server')>()),
  createNovuClient: () => ({
    trigger: async (
      eventType: string,
      data: { to: { email?: string }; payload: unknown },
    ) => {
      harness.notifications.push({
        eventType,
        email: data.to.email,
        payload: data.payload,
      });
    },
  }),
}));

import type { ActionResult } from '../actions/refusal';
import { unwrap } from '../actions/test-support/unwrap';
import {
  cancelFormSignature,
  checkFormSignature,
  requestFormSignature,
} from './actions';
import { listFormSignatures } from './queries';
import { handleFormSignatureEvent } from './webhook';

const IN_PROGRESS = 'This form already has a signature request in progress';
const NOT_CONFIGURED =
  'E-signature is not set up yet: Documenso is not configured';
const SIGNERS = [
  { name: 'Dana Buyer', email: 'dana@buyer.test' },
  { name: 'Sam Guarantor', email: 'sam@guarantor.test' },
];

const converter = {
  server: null as unknown as Server,
  convertedFileNames: [] as string[],
};

const bucket = admin.storage.from('data-room');

type Room = { roomId: string; privateFolderId: string };

let us: Person;
let colleague: Person;
let lender: Person;
let secondLender: Person;
let stranger: Person;
let deal: { accountId: string; dealId: string };
let room: Room;

function request(person: Person, formId: string, signers = SIGNERS) {
  harness.client = person.client;
  return unwrap(
    (
      requestFormSignature as (
        input: unknown,
      ) => Promise<ActionResult<{ editorUrl: string }>>
    )({ formId, signers }),
  );
}

function check(person: Person, signatureId: string) {
  harness.client = person.client;
  return unwrap(
    (
      checkFormSignature as (
        input: unknown,
      ) => Promise<ActionResult<{ status: string }>>
    )({ signatureId }),
  );
}

function cancel(person: Person, signatureId: string) {
  harness.client = person.client;
  return unwrap(
    (
      cancelFormSignature as (
        input: unknown,
      ) => Promise<ActionResult<{ status: string }>>
    )({ signatureId }),
  );
}

function deliver(documensoDocumentId: string, database = admin) {
  return handleFormSignatureEvent(documensoDocumentId, {
    admin: database,
    documenso,
  });
}

function report(state: SignatureState, documensoDocumentId: string) {
  harness.documenso.states.set(documensoDocumentId, state);
  return deliver(documensoDocumentId);
}

function refusingSignatureWrites(person: Person): Person {
  const writes = new Set(['insert', 'update', 'upsert', 'delete']);

  return {
    ...person,
    client: new Proxy(person.client, {
      get(target, property) {
        if (property !== 'from') {
          return Reflect.get(target, property, target);
        }

        return (name: string) => {
          const builder = target.from(name as 'lender_form_signature');

          return name !== 'lender_form_signature'
            ? builder
            : new Proxy(builder, {
                get(query, queryProperty) {
                  if (writes.has(String(queryProperty))) {
                    throw new Error(
                      'signature rows are written by the service only',
                    );
                  }

                  return Reflect.get(query, queryProperty, query);
                },
              });
        };
      },
    }),
  };
}

function notified() {
  return harness.notifications
    .map(
      (sent) =>
        `${sent.eventType} to ${(sent.payload as { audience: string }).audience} ${sent.email}`,
    )
    .sort();
}

function everyoneTold(outcome: 'completed' | 'declined' | 'expired') {
  return [
    ...[lender, secondLender].map(
      (person) => `lender_form.signature_${outcome} to lender ${person.email}`,
    ),
    ...teamTold(outcome),
  ].sort();
}

function teamTold(outcome: 'completed' | 'declined' | 'expired') {
  return [us, colleague]
    .map((person) => `lender_form.signature_${outcome} to team ${person.email}`)
    .sort();
}

function failingOnce(table: string, method: string): typeof admin {
  let hasFailed = false;

  return new Proxy(admin, {
    get(target, property) {
      if (property !== 'from') {
        return Reflect.get(target, property, target);
      }

      return (name: string) => {
        const builder = target.from(name as 'lender_form_signature');

        if (name !== table || hasFailed) {
          return builder;
        }

        return new Proxy(builder, {
          get(query, queryProperty) {
            if (queryProperty === method) {
              hasFailed = true;
              throw new Error('connection lost');
            }

            return Reflect.get(query, queryProperty, query);
          },
        });
      };
    },
  });
}

async function formWith(
  fileName: string,
  returnRoute: 'esign' | 'upload' = 'esign',
): Promise<string> {
  const documentId = await seedDocument(deal, room.privateFolderId, fileName);
  const stored = await bucket.upload(
    `deal/${deal.dealId}/${documentId}-${fileName}`,
    Buffer.from(`bytes of ${fileName}`),
  );
  if (stored.error) {
    throw stored.error;
  }

  const { data: form } = await admin
    .from('lender_ask')
    .insert({
      room_id: room.roomId,
      account_id: deal.accountId,
      kind: 'form',
      title: `Please complete ${fileName}`,
      return_route: returnRoute,
      created_by: lender.userId,
    })
    .select('id')
    .single()
    .throwOnError();

  await admin
    .from('lender_ask_file')
    .insert({
      ask_id: form.id,
      dr_document_id: documentId,
      role: 'blank_form',
      added_by: lender.userId,
    })
    .throwOnError();

  return form.id;
}

async function signaturesOf(formId: string) {
  const { data } = await admin
    .from('lender_form_signature')
    .select('id, documenso_document_id, signers, status, editor_url')
    .eq('ask_id', formId)
    .order('created_at')
    .throwOnError();
  return data;
}

async function draftedForm(fileName = 'application.pdf') {
  const formId = await formWith(fileName);
  await request(us, formId);
  const [signature] = await signaturesOf(formId);

  return {
    formId,
    signatureId: signature!.id,
    documensoDocumentId: signature!.documenso_document_id,
  };
}

async function sentForm(fileName = 'application.pdf') {
  const drafted = await draftedForm(fileName);
  await report('sent', drafted.documensoDocumentId);

  return drafted;
}

async function statusesOf(formId: string) {
  return (await signaturesOf(formId)).map((signature) => signature.status);
}

async function setFormStatus(formId: string, status: 'withdrawn' | 'closed') {
  await admin
    .from('lender_ask')
    .update({ status })
    .eq('id', formId)
    .throwOnError();
}

async function setRoomClosed(isClosed: boolean) {
  await admin
    .from('lender_room')
    .update({ closed_at: isClosed ? new Date().toISOString() : null })
    .eq('id', room.roomId)
    .throwOnError();
}

async function formRow(formId: string) {
  const { data } = await admin
    .from('lender_ask')
    .select('status, first_response_at')
    .eq('id', formId)
    .single()
    .throwOnError();
  return data;
}

async function signedFilesOf(formId: string) {
  const { data: files } = await admin
    .from('lender_ask_file')
    .select('dr_document_id')
    .eq('ask_id', formId)
    .eq('role', 'signed_form')
    .throwOnError();

  const { data: documents } = await admin
    .from('dr_document')
    .select('id, name, folder_id, storage_path')
    .in(
      'id',
      files.map((file) => file.dr_document_id),
    )
    .throwOnError();

  return documents;
}

async function documentsInRoomFolder() {
  const { data } = await admin
    .from('dr_document')
    .select('id')
    .eq('folder_id', room.privateFolderId)
    .throwOnError();
  return data.length;
}

beforeAll(async () => {
  process.env.NOVU_API_KEY = 'test-key';
  process.env.NOVU_API_URL = 'http://novu.test';

  converter.server = createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const upload = /filename="([^"]+)"[\s\S]*?\r\n\r\n([\s\S]*?)\r\n--/.exec(
        Buffer.concat(chunks).toString('latin1'),
      );
      const converts =
        request.method === 'POST' &&
        request.url === '/forms/libreoffice/convert' &&
        upload;

      if (converts) {
        converter.convertedFileNames.push(upload[1]!);
      }

      response.writeHead(converts ? 200 : 500);
      response.end(converts ? `%PDF-1.7 of ${upload[2]}` : 'libreoffice down');
    });
  });
  await new Promise<void>((resolve) => converter.server.listen(0, resolve));
  process.env.GOTENBERG_URL = `http://127.0.0.1:${(converter.server.address() as AddressInfo).port}`;

  [us, colleague, lender, secondLender, stranger] = await Promise.all([
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
  ]);

  deal = await seedTeamDeal(us, colleague);
  room = await seedRoom(deal, 'Bank A', [lender, secondLender]);
}, 60_000);

beforeEach(() => {
  process.env.DOCUMENSO_URL = 'http://documenso.test';
  process.env.DOCUMENSO_API_KEY = 'test-key';
  harness.documenso.drafts.length = 0;
  harness.documenso.deleted.length = 0;
  harness.documenso.states.clear();
  harness.documenso.nextDocumentId = null;
  harness.documenso.refusesToDelete = false;
  harness.documenso.signedPdf = null;
  harness.documenso.isDown = false;
  harness.notifications.length = 0;
  converter.convertedFileNames.length = 0;
});

afterEach(async () => {
  await setRoomClosed(false);
});

afterAll(async () => {
  await removeEverythingSeeded();
  await new Promise((resolve) => converter.server.close(resolve));
});

describe('requesting a signature for a lender form', () => {
  it('drafts a PDF form in Documenso unchanged, for exactly the signers we named', async () => {
    const formId = await formWith('application.pdf');

    await request(us, formId);

    expect(harness.documenso.drafts).toEqual([
      {
        title: 'Please complete application.pdf',
        pdf: 'bytes of application.pdf',
        signers: SIGNERS,
      },
    ]);
    expect(converter.convertedFileNames).toEqual([]);
  });

  it('returns where to place signature fields and send in Documenso', async () => {
    const formId = await formWith('application.pdf');

    const requested = await request(us, formId);

    const [signature] = await signaturesOf(formId);
    expect(requested).toEqual({
      editorUrl: editorUrlOf(signature!.documenso_document_id),
    });
  });

  it('records the request as a draft, with its Documenso id, signers and editor link', async () => {
    const formId = await formWith('application.pdf');

    await request(us, formId);

    const [signature] = await signaturesOf(formId);
    expect(signature).toEqual({
      id: expect.any(String),
      documenso_document_id: expect.stringMatching(/^envelope_[0-9a-f]{16}$/),
      signers: SIGNERS,
      status: 'draft',
      editor_url: editorUrlOf(signature!.documenso_document_id),
    });
  });

  it('converts a Word .docx form to PDF before drafting it', async () => {
    const formId = await formWith('guaranty.docx');

    await request(us, formId);

    expect(converter.convertedFileNames).toEqual(['document.docx']);
    expect(harness.documenso.drafts.map((draft) => draft.pdf)).toEqual([
      '%PDF-1.7 of bytes of guaranty.docx',
    ]);
  });

  it('converts a legacy Word .doc form to PDF before drafting it', async () => {
    const formId = await formWith('guaranty.doc');

    await request(us, formId);

    expect(converter.convertedFileNames).toEqual(['document.doc']);
    expect(harness.documenso.drafts.map((draft) => draft.pdf)).toEqual([
      '%PDF-1.7 of bytes of guaranty.doc',
    ]);
  });

  it('tells a lender that only the deal team can do that, and drafts nothing', async () => {
    const formId = await formWith('application.pdf');

    await expect(request(lender, formId)).rejects.toThrow(
      'Only the deal team can do that',
    );

    expect(harness.documenso.drafts).toEqual([]);
    expect(await signaturesOf(formId)).toEqual([]);
  });

  it('tells someone outside the room that the form was not found', async () => {
    const formId = await formWith('application.pdf');

    await expect(request(stranger, formId)).rejects.toThrow(
      'That form was not found',
    );

    expect(harness.documenso.drafts).toEqual([]);
  });

  it('refuses a form the lender wants back as an uploaded file', async () => {
    const formId = await formWith('application.pdf', 'upload');

    await expect(request(us, formId)).rejects.toThrow(
      'The lender wants this form back as an uploaded file, not by e-signature',
    );

    expect(harness.documenso.drafts).toEqual([]);
  });

  it('refuses an e-sign form whose current file is a spreadsheet', async () => {
    const formId = await formWith('rent-roll.xlsx');

    await expect(request(us, formId)).rejects.toThrow(
      'Only PDF and Word files can be signed. Request a PDF or Word file from the lender',
    );

    expect(harness.documenso.drafts).toEqual([]);
  });

  it.each(['withdrawn', 'closed'] as const)(
    'refuses a form that is %s',
    async (status) => {
      const formId = await formWith('application.pdf');
      await setFormStatus(formId, status);

      await expect(request(us, formId)).rejects.toThrow(
        `This form is ${status}, so a signature cannot be requested for it`,
      );

      expect(harness.documenso.drafts).toEqual([]);
      expect(await signaturesOf(formId)).toEqual([]);
    },
  );

  it('refuses while the lender room is closed', async () => {
    const formId = await formWith('application.pdf');
    await setRoomClosed(true);

    await expect(request(us, formId)).rejects.toThrow(
      'This lender room is closed, so a signature cannot be requested for its forms',
    );

    expect(harness.documenso.drafts).toEqual([]);
    expect(await signaturesOf(formId)).toEqual([]);
  });

  it('refuses with no signers', async () => {
    const formId = await formWith('application.pdf');

    await expect(request(us, formId, [])).rejects.toThrow(
      'Name at least one signer',
    );
  });

  it('refuses with a clear message when Documenso is not configured', async () => {
    delete process.env.DOCUMENSO_URL;
    delete process.env.DOCUMENSO_API_KEY;
    const formId = await formWith('application.pdf');

    await expect(request(us, formId)).rejects.toThrow(NOT_CONFIGURED);

    expect(await signaturesOf(formId)).toEqual([]);
  });

  it('records nothing when Documenso does not accept the document', async () => {
    const formId = await formWith('application.pdf');
    harness.documenso.isDown = true;

    await expect(request(us, formId)).rejects.toThrow(
      'Documenso responded with 503',
    );

    expect(await signaturesOf(formId)).toEqual([]);
  });

  it('refuses a second request while the first is still a draft in Documenso', async () => {
    const { formId } = await draftedForm();

    await expect(request(us, formId)).rejects.toThrow(IN_PROGRESS);

    expect(harness.documenso.drafts).toHaveLength(1);
    expect(await signaturesOf(formId)).toHaveLength(1);
  });

  it('refuses a second request while the first is out for signature', async () => {
    const { formId } = await sentForm();

    await expect(request(us, formId)).rejects.toThrow(IN_PROGRESS);

    expect(harness.documenso.drafts).toHaveLength(1);
    expect(await signaturesOf(formId)).toHaveLength(1);
  });

  it('allows a new request, as a new record, after the first was declined', async () => {
    const { formId, documensoDocumentId } = await sentForm();
    await report('rejected', documensoDocumentId);

    await request(us, formId);

    expect(await statusesOf(formId)).toEqual(['declined', 'draft']);
  });

  it('lets one of two simultaneous requests through and leaves no draft behind for the other', async () => {
    const formId = await formWith('application.pdf');

    const outcomes = await Promise.allSettled([
      request(us, formId),
      request(us, formId),
    ]);

    expect(
      outcomes
        .map((outcome) =>
          outcome.status === 'fulfilled' ? 'requested' : outcome.reason.message,
        )
        .sort(),
    ).toEqual([IN_PROGRESS, 'requested'].sort());
    const [signature] = await signaturesOf(formId);
    expect(await statusesOf(formId)).toEqual(['draft']);
    expect([...harness.documenso.states.keys()]).toEqual([
      signature!.documenso_document_id,
    ]);
    expect(harness.documenso.deleted).toHaveLength(1);
  });

  it('never writes a signature row as the signed-in person, when requesting or when checking', async () => {
    const formId = await formWith('application.pdf');
    const deskUser = refusingSignatureWrites(us);

    await request(deskUser, formId);
    const [signature] = await signaturesOf(formId);
    harness.documenso.states.set(signature!.documenso_document_id, 'sent');

    expect(await check(deskUser, signature!.id)).toEqual({ status: 'sent' });
    expect(await statusesOf(formId)).toEqual(['sent']);
  });

  it('still refuses the loser of two simultaneous requests properly when its draft cannot be removed, and logs the leftover draft', async () => {
    const formId = await formWith('application.pdf');
    harness.documenso.refusesToDelete = true;
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const outcomes = await Promise.allSettled([
      request(us, formId),
      request(us, formId),
    ]);

    expect(
      outcomes
        .map((outcome) =>
          outcome.status === 'fulfilled' ? 'requested' : outcome.reason.message,
        )
        .sort(),
    ).toEqual([IN_PROGRESS, 'requested'].sort());
    expect(logged).toHaveBeenCalledWith(
      'A Documenso draft could not be removed',
      expect.objectContaining({ documentId: expect.any(String) }),
    );
    logged.mockRestore();
  });

  it('still reports why our record could not be written when the draft cannot be removed either', async () => {
    const earlier = await draftedForm();
    const formId = await formWith('application.pdf');
    harness.documenso.nextDocumentId = earlier.documensoDocumentId;
    harness.documenso.refusesToDelete = true;
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(request(us, formId)).rejects.toThrow(
      'lender_form_signature_documenso_document_id_key',
    );

    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  it('removes the draft from Documenso when our record of it cannot be written', async () => {
    const earlier = await draftedForm();
    const formId = await formWith('application.pdf');
    harness.documenso.nextDocumentId = earlier.documensoDocumentId;

    await expect(request(us, formId)).rejects.toThrow(
      'lender_form_signature_documenso_document_id_key',
    );

    expect(await signaturesOf(formId)).toEqual([]);
    expect(harness.documenso.deleted).toEqual([earlier.documensoDocumentId]);
  });
});

describe('Documenso reporting that a lender form left draft', () => {
  it('marks the draft as sent and leaves the form as it was', async () => {
    const { formId, documensoDocumentId } = await draftedForm();

    expect(await report('sent', documensoDocumentId)).toBe(true);

    expect(await statusesOf(formId)).toEqual(['sent']);
    expect(await formRow(formId)).toEqual({
      status: 'open',
      first_response_at: null,
    });
    expect(harness.notifications).toEqual([]);
  });

  it('keeps a completed request completed when the event is delivered again', async () => {
    const { formId, documensoDocumentId } = await sentForm();
    await report('completed', documensoDocumentId);

    await deliver(documensoDocumentId);

    expect(await statusesOf(formId)).toEqual(['completed']);
  });
});

describe('Documenso reporting a lender form as completed', () => {
  it('files the signed PDF in the lender room folder under the deal', async () => {
    const { formId, documensoDocumentId } = await sentForm('term-sheet.pdf');

    await report('completed', documensoDocumentId);

    const signed = await signedFilesOf(formId);
    expect(signed).toEqual([
      {
        id: expect.any(String),
        name: 'term-sheet (signed).pdf',
        folder_id: room.privateFolderId,
        storage_path: expect.stringMatching(
          new RegExp(`^deal/${deal.dealId}/[0-9a-f-]{36}-`),
        ),
      },
    ]);

    const stored = await bucket.download(signed[0]!.storage_path);
    expect(await stored.data?.text()).toBe(SIGNED_PDF);
  });

  async function signedFormMilestones() {
    const { data: milestones } = await admin
      .from('deal_milestone')
      .select('kind, label, target_on, actual_on, shared')
      .eq('deal_id', deal.dealId)
      .like('label', '%signed (Bank A)')
      .throwOnError();
    const { count: events } = await admin
      .from('deal_event')
      .select('id', { count: 'exact', head: true })
      .eq('deal_id', deal.dealId)
      .eq('event_type', 'deal_milestone.set')
      .throwOnError();

    return { milestones, events };
  }

  it('puts the signing on the deal timeline, unshared, once however often it is reported', async () => {
    const before = (await signedFormMilestones()).events;
    const { documensoDocumentId } = await sentForm('timeline.pdf');

    await report('completed', documensoDocumentId);
    await deliver(documensoDocumentId);

    const { milestones, events } = await signedFormMilestones();
    expect(
      milestones.filter((milestone) =>
        milestone.label?.startsWith('Please complete timeline.pdf'),
      ),
    ).toEqual([
      {
        kind: 'custom',
        label: 'Please complete timeline.pdf signed (Bank A)',
        target_on: null,
        actual_on: new Date().toISOString().slice(0, 10),
        shared: false,
      },
    ]);
    expect(events! - before!).toBe(1);
  });

  it('lets the lender see the signed PDF in their room', async () => {
    const { formId, documensoDocumentId } = await sentForm('disclosure.pdf');

    await report('completed', documensoDocumentId);

    const [signed] = await signedFilesOf(formId);
    const { data: seen } = await lender.client
      .from('dr_document')
      .select('name')
      .eq('id', signed!.id)
      .throwOnError();
    expect(seen).toEqual([{ name: 'disclosure (signed).pdf' }]);
  });

  it('names the signed copy of a Word form as a PDF', async () => {
    const { formId, documensoDocumentId } = await sentForm('guaranty.docx');

    await report('completed', documensoDocumentId);

    expect((await signedFilesOf(formId)).map((file) => file.name)).toEqual([
      'guaranty (signed).pdf',
    ]);
  });

  it('gives the signed copy its own name when another file already has it, never a new version of that file', async () => {
    const { formId, documensoDocumentId } = await sentForm('w9.pdf');
    const someoneElses = await seedDocument(
      deal,
      room.privateFolderId,
      'w9 (signed).pdf',
    );

    await report('completed', documensoDocumentId);

    const { data: signed } = await admin
      .from('dr_document')
      .select('id, name, version')
      .in('name', ['w9 (signed).pdf', 'w9 (signed 2).pdf'])
      .eq('folder_id', room.privateFolderId)
      .order('name')
      .throwOnError();
    expect(signed).toEqual([
      {
        id: (await signedFilesOf(formId))[0]!.id,
        name: 'w9 (signed 2).pdf',
        version: 1,
      },
      { id: someoneElses, name: 'w9 (signed).pdf', version: 1 },
    ]);
  });

  it('marks the request completed and the form answered by us', async () => {
    const { formId, documensoDocumentId } = await sentForm();

    await report('completed', documensoDocumentId);

    expect(await statusesOf(formId)).toEqual(['completed']);
    expect(await formRow(formId)).toEqual({
      status: 'answered',
      first_response_at: expect.any(String),
    });
  });

  it('tells the lender people in the room and the deal team, once each, that the form was signed', async () => {
    const { formId, documensoDocumentId } = await sentForm();

    await report('completed', documensoDocumentId);

    expect(notified()).toEqual(everyoneTold('completed'));
    expect(harness.notifications.map((sent) => sent.payload)).toContainEqual({
      roomId: room.roomId,
      askId: formId,
      audience: 'lender',
    });
  });

  it('stores one object, one document and tells everyone once when the completion is delivered twice at the same moment', async () => {
    const { formId, signatureId, documensoDocumentId } =
      await sentForm('simultaneous.pdf');
    const documentsBefore = await documentsInRoomFolder();
    harness.documenso.states.set(documensoDocumentId, 'completed');

    await Promise.all([
      deliver(documensoDocumentId),
      deliver(documensoDocumentId),
    ]);

    const { data: stored } = await bucket.list(`deal/${deal.dealId}`, {
      search: signatureId,
    });
    expect(stored?.map((object) => object.name)).toEqual([
      `${signatureId}-signed.pdf`,
    ]);
    expect((await signedFilesOf(formId)).map((file) => file.name)).toEqual([
      'simultaneous (signed).pdf',
    ]);
    expect(await documentsInRoomFolder()).toBe(documentsBefore + 1);
    const { data: documentEvents } = await admin
      .from('deal_event')
      .select('id')
      .eq('aggregate_id', signatureId)
      .throwOnError();
    expect(documentEvents).toHaveLength(1);
    expect(notified()).toEqual(everyoneTold('completed'));
  });

  it.each([
    ['is not a PDF', '<html>Sign in to Documenso</html>'],
    ['is empty', ''],
  ])(
    'stores and files nothing when what Documenso returns as the signed PDF %s',
    async (_label, returned) => {
      const { formId, signatureId, documensoDocumentId } = await sentForm();
      harness.documenso.states.set(documensoDocumentId, 'completed');
      harness.documenso.signedPdf = returned;

      await expect(deliver(documensoDocumentId)).rejects.toThrow(
        'Documenso returned a signed file that is not a PDF',
      );

      const { data: stored } = await bucket.list(`deal/${deal.dealId}`, {
        search: signatureId,
      });
      expect(stored).toEqual([]);
      expect(await signedFilesOf(formId)).toEqual([]);
      expect(await statusesOf(formId)).toEqual(['sent']);
    },
  );

  it('files the signed PDF and marks it completed even when we never heard it was sent', async () => {
    const { formId, documensoDocumentId } = await draftedForm('consent.pdf');

    await report('completed', documensoDocumentId);

    expect(await statusesOf(formId)).toEqual(['completed']);
    expect((await signedFilesOf(formId)).map((file) => file.name)).toEqual([
      'consent (signed).pdf',
    ]);
  });

  it('files nothing while Documenso still reports the envelope out for signature, whatever the webhook claimed', async () => {
    const { formId, documensoDocumentId } = await sentForm();

    await deliver(documensoDocumentId);

    expect(await statusesOf(formId)).toEqual(['sent']);
    expect(await signedFilesOf(formId)).toEqual([]);
    expect(harness.notifications).toEqual([]);
  });

  it('files nothing more and tells nobody again when it is reported a second time', async () => {
    const { formId, documensoDocumentId } = await sentForm();
    await report('completed', documensoDocumentId);
    const documentsAfterFirst = await documentsInRoomFolder();
    harness.notifications.length = 0;

    await deliver(documensoDocumentId);

    expect(await signedFilesOf(formId)).toHaveLength(1);
    expect(await documentsInRoomFolder()).toBe(documentsAfterFirst);
    expect(harness.notifications).toEqual([]);
  });

  it('ends with one document, one attachment and one notification each when the first delivery failed before the status was recorded', async () => {
    const { formId, documensoDocumentId } = await sentForm('retried.pdf');
    const documentsBefore = await documentsInRoomFolder();
    harness.documenso.states.set(documensoDocumentId, 'completed');

    await expect(
      deliver(
        documensoDocumentId,
        failingOnce('lender_form_signature', 'update'),
      ),
    ).rejects.toThrow('connection lost');
    expect(await statusesOf(formId)).toEqual(['sent']);
    expect(await signedFilesOf(formId)).toHaveLength(1);

    await deliver(documensoDocumentId);

    expect(await statusesOf(formId)).toEqual(['completed']);
    expect((await signedFilesOf(formId)).map((file) => file.name)).toEqual([
      'retried (signed).pdf',
    ]);
    expect(await documentsInRoomFolder()).toBe(documentsBefore + 1);
    expect(notified()).toEqual(everyoneTold('completed'));
  });

  it('ends with one document and one attachment when the first delivery failed right after the signed PDF was stored', async () => {
    const { formId, documensoDocumentId } = await sentForm();
    const documentsBefore = await documentsInRoomFolder();
    harness.documenso.states.set(documensoDocumentId, 'completed');

    await expect(
      deliver(documensoDocumentId, failingOnce('lender_ask_file', 'upsert')),
    ).rejects.toThrow('connection lost');

    await deliver(documensoDocumentId);

    expect(await statusesOf(formId)).toEqual(['completed']);
    expect(await signedFilesOf(formId)).toHaveLength(1);
    expect(await documentsInRoomFolder()).toBe(documentsBefore + 1);
  });

  it.each(['withdrawn', 'closed'] as const)(
    'still files the signed PDF and marks the form answered when the form was %s meanwhile',
    async (status) => {
      const { formId, documensoDocumentId } = await sentForm();
      await setFormStatus(formId, status);

      await report('completed', documensoDocumentId);

      expect(await statusesOf(formId)).toEqual(['completed']);
      expect(await signedFilesOf(formId)).toHaveLength(1);
      expect((await formRow(formId)).status).toBe('answered');
    },
  );

  it('still files the signed PDF and marks the form answered when the room was closed meanwhile, telling only the deal team', async () => {
    const { formId, documensoDocumentId } = await sentForm();
    await setRoomClosed(true);

    await report('completed', documensoDocumentId);

    expect(notified()).toEqual(teamTold('completed'));

    expect(await statusesOf(formId)).toEqual(['completed']);
    expect(await signedFilesOf(formId)).toHaveLength(1);
    expect((await formRow(formId)).status).toBe('answered');
  });

  it.each([
    ['rejected', 'declined'],
    ['expired', 'expired'],
  ] as const)(
    'files the signed PDF and records completed when it completes after we recorded it %s',
    async (state, recorded) => {
      const { formId, documensoDocumentId } = await sentForm();
      await report(state, documensoDocumentId);
      expect(await statusesOf(formId)).toEqual([recorded]);

      await report('completed', documensoDocumentId);

      expect(await statusesOf(formId)).toEqual(['completed']);
      expect(await signedFilesOf(formId)).toHaveLength(1);
    },
  );
});

describe('Documenso reporting a lender form as declined, expired or gone', () => {
  it.each([
    ['rejected', 'declined'],
    ['cancelled', 'declined'],
    ['missing', 'declined'],
    ['expired', 'expired'],
  ] as const)(
    'records a %s document as %s and leaves the form as it was',
    async (state, status) => {
      const { formId, documensoDocumentId } = await sentForm();

      await report(state, documensoDocumentId);

      expect(await statusesOf(formId)).toEqual([status]);
      expect(await formRow(formId)).toEqual({
        status: 'open',
        first_response_at: null,
      });
      expect(await signedFilesOf(formId)).toEqual([]);
      expect(notified()).toEqual(everyoneTold(status));

      harness.notifications.length = 0;
      await deliver(documensoDocumentId);

      expect(notified()).toEqual([]);
    },
  );

  it.each([
    ['rejected', 'declined'],
    ['cancelled', 'declined'],
    ['missing', 'declined'],
    ['expired', 'expired'],
  ] as const)(
    'records a %s document as %s while it is still a draft',
    async (state, status) => {
      const { formId, documensoDocumentId } = await draftedForm();

      await report(state, documensoDocumentId);

      expect(await statusesOf(formId)).toEqual([status]);
    },
  );

  it('keeps a completed request completed when a decline is reported afterwards', async () => {
    const { formId, documensoDocumentId } = await sentForm();
    await report('completed', documensoDocumentId);

    await report('rejected', documensoDocumentId);

    expect(await statusesOf(formId)).toEqual(['completed']);
  });
});

describe('Documenso reporting the outcome of a lender form signature', () => {
  it.each([
    ['completed', 'completed', 'A form for Bank A was signed on Lender asks deal'],
    ['rejected', 'declined', 'A form signature for Bank A was declined on Lender asks deal'],
    ['expired', 'expired', 'A form signature for Bank A expired on Lender asks deal'],
  ] as const)(
    'rings our bell once per member when it is %s, linking to the form',
    async (state, status, body) => {
      const { formId, signatureId, documensoDocumentId } = await sentForm();

      await report(state, documensoDocumentId);

      const { data: team } = await admin
        .from('accounts')
        .select('slug')
        .eq('id', deal.accountId)
        .single()
        .throwOnError();
      const eventType = `lender_form.signature_${status}`;
      const eventKey = `${signatureId}:${status}`;
      const { data: rung } = await admin
        .from('notifications')
        .select('recipient_user_id, deal_id, body, link, dedupe_key')
        .eq('account_id', deal.accountId)
        .like('dedupe_key', `${eventType}:${eventKey}:%`)
        .order('recipient_user_id')
        .throwOnError();

      expect(rung).toEqual(
        [us.userId, colleague.userId].toSorted().map((userId) => ({
          recipient_user_id: userId,
          deal_id: deal.dealId,
          body,
          link: `/home/${team.slug}/deals/${deal.dealId}/lenders/${room.roomId}/requests/forms/${formId}`,
          dedupe_key: `${eventType}:${eventKey}:${userId}`,
        })),
      );
    },
  );
});

describe('a Documenso event that is not about a lender form', () => {
  it('is left for the contract path, without asking Documenso anything, when no lender form has that document id', async () => {
    const { formId } = await sentForm();
    harness.documenso.isDown = true;

    expect(await deliver('envelope_notalenderform')).toBe(false);

    expect(await statusesOf(formId)).toEqual(['sent']);
  });

  it('is claimed as a lender form event when the document id matches', async () => {
    const { documensoDocumentId } = await sentForm();

    expect(await deliver(documensoDocumentId)).toBe(true);
  });
});

describe('checking the status of a signature request with Documenso', () => {
  it('applies what Documenso reports, filing the signed PDF as a webhook would have', async () => {
    const { formId, signatureId, documensoDocumentId } =
      await sentForm('checked.pdf');
    harness.documenso.states.set(documensoDocumentId, 'completed');

    expect(await check(us, signatureId)).toEqual({ status: 'completed' });

    expect(await statusesOf(formId)).toEqual(['completed']);
    expect((await signedFilesOf(formId)).map((file) => file.name)).toEqual([
      'checked (signed).pdf',
    ]);
    expect((await formRow(formId)).status).toBe('answered');
  });

  it('records a draft that no longer exists in Documenso as declined', async () => {
    const { formId, signatureId, documensoDocumentId } = await draftedForm();
    harness.documenso.states.delete(documensoDocumentId);

    expect(await check(us, signatureId)).toEqual({ status: 'declined' });

    expect(await statusesOf(formId)).toEqual(['declined']);
  });

  it('reports the status unchanged when Documenso has nothing new', async () => {
    const { formId, signatureId } = await draftedForm();

    expect(await check(us, signatureId)).toEqual({ status: 'draft' });

    expect(await statusesOf(formId)).toEqual(['draft']);
  });

  it('tells a lender the request was not found, and changes nothing', async () => {
    const { formId, signatureId, documensoDocumentId } = await sentForm();
    harness.documenso.states.set(documensoDocumentId, 'completed');

    await expect(check(lender, signatureId)).rejects.toThrow(
      'That signature request was not found',
    );

    expect(await statusesOf(formId)).toEqual(['sent']);
  });

  it('refuses with a clear message when Documenso is not configured', async () => {
    const { signatureId } = await sentForm();
    delete process.env.DOCUMENSO_URL;
    delete process.env.DOCUMENSO_API_KEY;

    await expect(check(us, signatureId)).rejects.toThrow(NOT_CONFIGURED);
  });
});

describe('cancelling a signature request', () => {
  const ALREADY_SENT =
    'This signature request has already been sent and can no longer be cancelled here';

  it('deletes the draft in Documenso, records the request as cancelled, tells nobody, and leaves the form as it was', async () => {
    const { formId, signatureId, documensoDocumentId } = await draftedForm();

    expect(await cancel(us, signatureId)).toEqual({ status: 'cancelled' });

    expect(await statusesOf(formId)).toEqual(['cancelled']);
    expect(harness.documenso.deleted).toEqual([documensoDocumentId]);
    expect(harness.notifications).toEqual([]);
    expect(await formRow(formId)).toEqual({
      status: 'open',
      first_response_at: null,
    });
  });

  it('frees the form for a new signature request', async () => {
    const { formId, signatureId } = await draftedForm();
    await cancel(us, signatureId);

    await request(us, formId);

    expect(await statusesOf(formId)).toEqual(['cancelled', 'draft']);
  });

  it('ends in the same cancelled request when cancelled twice', async () => {
    const { formId, signatureId } = await draftedForm();
    await cancel(us, signatureId);

    expect(await cancel(us, signatureId)).toEqual({ status: 'cancelled' });

    expect(await statusesOf(formId)).toEqual(['cancelled']);
    expect(harness.documenso.deleted).toHaveLength(1);
  });

  it('ends cancelled without error when the draft is already gone from Documenso', async () => {
    const { formId, signatureId, documensoDocumentId } = await draftedForm();
    harness.documenso.states.delete(documensoDocumentId);

    expect(await cancel(us, signatureId)).toEqual({ status: 'cancelled' });

    expect(await statusesOf(formId)).toEqual(['cancelled']);
    expect(harness.documenso.deleted).toEqual([]);
  });

  it('refuses when Documenso says the request was already sent, and records it as sent', async () => {
    const { formId, signatureId, documensoDocumentId } = await draftedForm();
    harness.documenso.states.set(documensoDocumentId, 'sent');

    await expect(cancel(us, signatureId)).rejects.toThrow(ALREADY_SENT);

    expect(await statusesOf(formId)).toEqual(['sent']);
    expect(harness.documenso.deleted).toEqual([]);
  });

  it('refuses a request we already recorded as sent', async () => {
    const { formId, signatureId } = await sentForm();

    await expect(cancel(us, signatureId)).rejects.toThrow(ALREADY_SENT);

    expect(await statusesOf(formId)).toEqual(['sent']);
  });

  it('keeps a cancelled request cancelled and tells nobody when a later event or check finds the envelope gone', async () => {
    const { formId, signatureId, documensoDocumentId } = await draftedForm();
    await cancel(us, signatureId);

    expect(await deliver(documensoDocumentId)).toBe(true);
    expect(await check(us, signatureId)).toEqual({ status: 'cancelled' });

    expect(await statusesOf(formId)).toEqual(['cancelled']);
    expect(harness.notifications).toEqual([]);
  });

  it('leaves the request a draft when Documenso cannot delete it', async () => {
    const { formId, signatureId } = await draftedForm();
    harness.documenso.refusesToDelete = true;

    await expect(cancel(us, signatureId)).rejects.toThrow(
      'Documenso responded with 500',
    );

    expect(await statusesOf(formId)).toEqual(['draft']);
  });

  it('tells a lender the request was not found, and changes nothing', async () => {
    const { formId, signatureId } = await draftedForm();

    await expect(cancel(lender, signatureId)).rejects.toThrow(
      'That signature request was not found',
    );

    expect(await statusesOf(formId)).toEqual(['draft']);
    expect(harness.documenso.deleted).toEqual([]);
  });

  it('never writes the signature row as the signed-in person', async () => {
    const { formId, signatureId } = await draftedForm();

    await cancel(refusingSignatureWrites(us), signatureId);

    expect(await statusesOf(formId)).toEqual(['cancelled']);
  });
});

describe('the signature requests of a form', () => {
  it('shows our team each request, newest first, with status, signer names, and the stored editor link of a draft, without calling Documenso', async () => {
    const { formId, documensoDocumentId } = await sentForm();
    await report('expired', documensoDocumentId);
    await request(us, formId, [
      { name: 'Pat Partner', email: 'pat@buyer.test' },
    ]);
    const [, draft] = await signaturesOf(formId);
    harness.documenso.isDown = true;

    expect(await listFormSignatures(us.client, formId)).toEqual([
      {
        id: expect.any(String),
        status: 'draft',
        created_at: expect.any(String),
        signer_names: ['Pat Partner'],
        editor_url: editorUrlOf(draft!.documenso_document_id),
      },
      {
        id: expect.any(String),
        status: 'expired',
        created_at: expect.any(String),
        signer_names: ['Dana Buyer', 'Sam Guarantor'],
        editor_url: null,
      },
    ]);
  });

  it('gives no editor link once the request has been sent from Documenso', async () => {
    const { formId } = await sentForm();

    expect(await listFormSignatures(us.client, formId)).toMatchObject([
      { status: 'sent', editor_url: null },
    ]);
  });

  it('shows a lender in the room where each request stands, never who signs or a Documenso link', async () => {
    const { formId, signatureId } = await draftedForm();

    expect(await listFormSignatures(lender.client, formId)).toEqual([
      {
        id: signatureId,
        status: 'draft',
        created_at: expect.any(String),
        signer_names: null,
        editor_url: null,
      },
    ]);
  });

  it('shows nothing to someone outside the room', async () => {
    const { formId } = await sentForm();

    expect(await listFormSignatures(stranger.client, formId)).toEqual([]);
  });
});
