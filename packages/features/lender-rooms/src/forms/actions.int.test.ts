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

import type { ActionResult } from '../actions/refusal';
import { unwrap } from '../actions/test-support/unwrap';
import {
  type Person,
  admin,
  provisionPerson,
  removeEverythingSeeded,
  seedDocument,
  seedFolder,
  seedRoom,
  seedTeamDeal,
} from '../asks/integration-harness';

interface SentNotification {
  eventType: string;
  recipientUserId: string;
  email: string | undefined;
  payload: unknown;
}

type AroundAdminWrite = (
  write: { table: string; method: string },
  run: () => Promise<unknown>,
) => Promise<unknown>;

const harness = vi.hoisted(() => ({
  client: null as unknown,
  user: null as unknown,
  sent: [] as SentNotification[],
  aroundAdminWrite: null as null | AroundAdminWrite,
}));

type Chain = Record<string | symbol, unknown> & PromiseLike<unknown>;

function wrapped(
  chain: Chain,
  around: (run: () => Promise<unknown>) => Promise<unknown>,
): Chain {
  return new Proxy(chain, {
    get(target, property) {
      if (property === 'then') {
        return (
          resolve: (value: unknown) => unknown,
          reject: (reason: unknown) => unknown,
        ) => around(() => Promise.resolve(target)).then(resolve, reject);
      }

      const member = Reflect.get(target, property, target);

      return typeof member === 'function'
        ? (...args: unknown[]) => wrapped(member.apply(target, args), around)
        : member;
    },
  });
}

vi.mock('@odb/supabase/admin', async (importOriginal) => {
  const original = await importOriginal<typeof import('@odb/supabase/admin')>();

  return {
    ...original,
    getSupabaseServerAdminClient: () =>
      new Proxy(original.getSupabaseServerAdminClient(), {
        get(target, property) {
          if (property !== 'from') {
            return Reflect.get(target, property, target);
          }

          return (table: never) =>
            new Proxy(target.from(table), {
              get(query, method) {
                const around = harness.aroundAdminWrite;
                const member = Reflect.get(query, method, query);

                if (
                  !around ||
                  !['insert', 'update', 'delete'].includes(String(method))
                ) {
                  return member;
                }

                return (...args: unknown[]) =>
                  wrapped(
                    (member as (...args: unknown[]) => Chain).apply(
                      query,
                      args,
                    ),
                    (run) => around({ table, method: String(method) }, run),
                  );
              },
            });
        },
      }),
  };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (
      fn: (input: unknown, user: unknown) => unknown,
      config: { schema: { parse: (input: unknown) => unknown } },
    ) =>
    async (input: unknown) =>
      fn(config.schema.parse(input), harness.user),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => harness.client,
}));

vi.mock('@odb/notifications/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/notifications/server')>()),
  createNovuClient: () => {
    if (!process.env.NOVU_API_KEY || !process.env.NOVU_API_URL) {
      throw new Error('Missing required environment variable: NOVU_API_KEY');
    }

    return {
      trigger: async (
        eventType: string,
        data: {
          to: { subscriberId: string; email?: string };
          payload: unknown;
        },
      ) => {
        harness.sent.push({
          eventType,
          recipientUserId: data.to.subscriberId,
          email: data.to.email,
          payload: data.payload,
        });
      },
    };
  },
}));

import {
  closeFormAsInternal,
  replyToFormAsInternal,
  returnCompletedForm,
} from './internal-actions';
import {
  changeReturnRoute,
  closeFormAsLender,
  editForm,
  openForm,
  replaceBlankForm,
  replyToFormAsLender,
  withdrawForm,
} from './lender-actions';
import { getForm, listForms } from './queries';

const NOT_A_MEMBER = 'You are not a member of this lender room';
const FORM_NOT_FOUND = 'That form was not found';
const DEAL_TEAM_ONLY = 'Only the deal team can do that';
const UPLOAD_FIRST = 'Upload the form to your room first';
const NOT_SHOWN = 'That document is not in this lender room';
const NOT_SIGNABLE = 'Only PDF and Word forms can come back by e-sign';
const NOT_IN_ROOM_FOLDER = "That file is not in the lender room's own folder";
const CHANGED_UNDERNEATH =
  'This changed while you were working. Reload and try again.';
const TOO_LATE_TO_REPLACE =
  'You can no longer replace this form because the deal team has responded';
const TOO_LATE_TO_CHANGE_ROUTE =
  'You can no longer change how this form comes back because the deal team has responded';
const EMPTY_REPLY = 'A reply needs a message or a file';

type Action<Output> = (
  data: Record<string, unknown>,
) => Promise<ActionResult<Output>>;

function actingAs<Output = void>(person: Person, action: unknown) {
  return (data: Record<string, unknown>) => {
    harness.client = person.client;
    harness.user = { id: person.userId };
    return unwrap((action as Action<Output>)(data));
  };
}

async function sentDuring(run: () => Promise<unknown>) {
  harness.sent.length = 0;
  await run();
  return [...harness.sent];
}

async function formRow(formId: string) {
  const { data } = await admin
    .from('lender_ask')
    .select('*')
    .eq('id', formId)
    .single()
    .throwOnError();
  return data;
}

async function messagesOf(formId: string) {
  const { data } = await admin
    .from('lender_ask_message')
    .select('author_user_id, side, body')
    .eq('ask_id', formId)
    .order('created_at')
    .throwOnError();
  return data;
}

async function filesOf(formId: string) {
  const { data } = await admin
    .from('lender_ask_file')
    .select('dr_document_id, role, added_by')
    .eq('ask_id', formId)
    .order('created_at')
    .throwOnError();
  return data;
}

async function blankFormsOf(formId: string) {
  return (await filesOf(formId))
    .filter((file) => file.role === 'blank_form')
    .map((file) => file.dr_document_id);
}

async function formsIn(roomId: string) {
  const { data } = await admin
    .from('lender_ask')
    .select('id')
    .eq('room_id', roomId)
    .throwOnError();
  return data.map((form) => form.id);
}

function weRespond(formId: string, status: 'answered' | 'open' = 'answered') {
  return admin
    .from('lender_ask')
    .update({ status, first_response_at: RESPONSE_STAMP })
    .eq('id', formId)
    .throwOnError();
}

function configureNovu() {
  process.env.NOVU_API_KEY = 'test-key';
  process.env.NOVU_API_URL = 'http://novu.test';
}

const RESPONSE_STAMP = '2026-10-01T09:00:00+00:00';

type Room = { roomId: string; privateFolderId: string };

let us: Person;
let colleague: Person;
let lenderA: Person;
let lenderA2: Person;
let lenderB: Person;
let outsider: Person;

let deal: { accountId: string; dealId: string };
let roomA: Room;
let roomB: Room;
let pdfId: string;
let secondPdfId: string;
let nestedPdfId: string;
let docxId: string;
let xlsxId: string;
let completedId: string;
let masterDocumentId: string;
let roomBDocumentId: string;
let unsharedDocumentId: string;

beforeAll(async () => {
  configureNovu();

  [us, colleague, lenderA, lenderA2, lenderB, outsider] = await Promise.all([
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
  ]);

  deal = await seedTeamDeal(us, colleague);

  const masterFolderId = await seedFolder(deal, 'Lender package');
  await admin
    .from('lender_package')
    .insert({
      deal_id: deal.dealId,
      account_id: deal.accountId,
      master_folder_id: masterFolderId,
    })
    .throwOnError();

  roomA = await seedRoom(deal, 'Bank A', [lenderA, lenderA2]);
  roomB = await seedRoom(deal, 'Bank B', [lenderB]);

  const unsharedFolderId = await seedFolder(deal, 'Diligence');
  const nestedFolderId = await seedFolder(
    deal,
    'Forms',
    await seedFolder(deal, 'Uploads', roomA.privateFolderId),
  );

  pdfId = await seedDocument(deal, roomA.privateFolderId, 'application.pdf');
  secondPdfId = await seedDocument(
    deal,
    roomA.privateFolderId,
    'application-v2.pdf',
  );
  nestedPdfId = await seedDocument(deal, nestedFolderId, 'nested.pdf');
  docxId = await seedDocument(deal, roomA.privateFolderId, 'guaranty.docx');
  xlsxId = await seedDocument(deal, roomA.privateFolderId, 'rent-roll.xlsx');
  completedId = await seedDocument(
    deal,
    roomA.privateFolderId,
    'application-completed.pdf',
  );
  masterDocumentId = await seedDocument(deal, masterFolderId, 'teaser.pdf');
  roomBDocumentId = await seedDocument(
    deal,
    roomB.privateFolderId,
    'bank-b-application.pdf',
  );
  unsharedDocumentId = await seedDocument(deal, unsharedFolderId, 'qoe.pdf');
}, 60_000);

function configureEsign() {
  process.env.DOCUMENSO_URL = 'http://documenso.test';
  process.env.DOCUMENSO_API_KEY = 'test-key';
}

function unconfigureEsign() {
  delete process.env.DOCUMENSO_URL;
  delete process.env.DOCUMENSO_API_KEY;
}

configureEsign();

beforeEach(() => {
  harness.sent.length = 0;
  configureEsign();
});

afterEach(() => {
  harness.aroundAdminWrite = null;
});

afterAll(removeEverythingSeeded);

function openIn(
  room: Room,
  lender: Person,
  documentId: string,
  returnRoute = 'upload',
) {
  return actingAs<string>(
    lender,
    openForm,
  )({
    roomId: room.roomId,
    title: 'Loan application',
    note: 'Please complete sections 2 and 3.',
    documentId,
    returnRoute,
  });
}

function openInRoomA(documentId = pdfId, returnRoute = 'upload') {
  return openIn(roomA, lenderA, documentId, returnRoute);
}

function returnCompleted(formId: string, documentIds = [completedId]) {
  return actingAs(us, returnCompletedForm)({ formId, documentIds });
}

function toldAbout(
  eventType: string,
  formId: string,
  recipients: Person[],
): SentNotification[] {
  return recipients.map((recipient) => ({
    eventType,
    recipientUserId: recipient.userId,
    email: recipient.email,
    payload: { roomId: roomA.roomId, askId: formId, kind: 'form' },
  }));
}

describe('a lender opening a form with the e-sign route', () => {
  let formId: string;
  let sent: SentNotification[];

  beforeAll(async () => {
    sent = await sentDuring(async () => {
      formId = await openInRoomA(pdfId, 'esign');
    });
  });

  it('records an open form from that lender with the route they chose', async () => {
    expect(await formRow(formId)).toMatchObject({
      room_id: roomA.roomId,
      account_id: deal.accountId,
      kind: 'form',
      status: 'open',
      return_route: 'esign',
      title: 'Loan application',
      body: 'Please complete sections 2 and 3.',
      first_response_at: null,
      created_by: lenderA.userId,
    });
  });

  it('files the document as the blank form added by that lender', async () => {
    expect(await filesOf(formId)).toEqual([
      { dr_document_id: pdfId, role: 'blank_form', added_by: lenderA.userId },
    ]);
  });

  it('tells every member of our account once, owner included', () => {
    expect(sent).toHaveLength(2);
    expect(sent).toEqual(
      expect.arrayContaining(
        toldAbout('lender_form.uploaded', formId, [us, colleague]),
      ),
    );
  });
});

describe('opening a form', () => {
  function openWith(overrides: Record<string, unknown>) {
    return actingAs<string>(
      lenderA,
      openForm,
    )({
      roomId: roomA.roomId,
      title: 'Loan application',
      documentId: pdfId,
      returnRoute: 'upload',
      ...overrides,
    });
  }

  it('needs no note', async () => {
    expect((await formRow(await openWith({}))).body).toBeNull();
  });

  it('keeps a note of only spaces as no note', async () => {
    expect((await formRow(await openWith({ note: '   ' }))).body).toBeNull();
  });

  it('trims the note', async () => {
    const formId = await openWith({ note: '  Sections 2 and 3.  ' });

    expect((await formRow(formId)).body).toBe('Sections 2 and 3.');
  });

  it('trims the title', async () => {
    const formId = await openWith({ title: '  Loan application  ' });

    expect((await formRow(formId)).title).toBe('Loan application');
  });

  it('refuses a title that is only spaces', async () => {
    await expect(openWith({ title: '   ' })).rejects.toThrow(
      'A form needs a title',
    );
  });

  it('lets a lender choose e-sign for a Word blank form', async () => {
    const formId = await openInRoomA(docxId, 'esign');

    expect((await formRow(formId)).return_route).toBe('esign');
  });

  it('lets a lender choose completed-file upload for a spreadsheet blank form', async () => {
    const formId = await openInRoomA(xlsxId, 'upload');

    expect((await formRow(formId)).return_route).toBe('upload');
  });

  it('refuses e-sign for an .xlsx blank form', async () => {
    await expect(openInRoomA(xlsxId, 'esign')).rejects.toThrow(NOT_SIGNABLE);
  });

  it('opens nothing when e-sign is refused', async () => {
    const before = await formsIn(roomA.roomId);

    await openInRoomA(xlsxId, 'esign').catch(() => undefined);

    expect(await formsIn(roomA.roomId)).toEqual(before);
  });

  it.each([
    ['a master package document', () => masterDocumentId],
    ['a document from another room', () => roomBDocumentId],
    ['a document outside the lender package', () => unsharedDocumentId],
    ['a document that does not exist', () => crypto.randomUUID()],
  ])('refuses %s as the blank form', async (_name, documentId) => {
    await expect(openInRoomA(documentId())).rejects.toThrow(UPLOAD_FIRST);
  });

  it('accepts a blank form from a folder nested inside the room folder', async () => {
    const formId = await openInRoomA(nestedPdfId);

    expect(await blankFormsOf(formId)).toEqual([nestedPdfId]);
  });

  it('refuses a blank form that was removed from the room', async () => {
    const removedId = await seedDocument(
      deal,
      roomA.privateFolderId,
      'removed.pdf',
    );
    await admin
      .rpc('append_deal_event', {
        p_deal_id: deal.dealId,
        p_aggregate_type: 'dr_document',
        p_aggregate_id: removedId,
        p_event_type: 'dr_document.removed',
        p_payload: {},
        p_actor_kind: 'service',
        p_actor_via: 'integration-test',
      })
      .throwOnError();

    await expect(openInRoomA(removedId)).rejects.toThrow(NOT_SHOWN);
  });

  it('opens nothing when the blank form is refused', async () => {
    const before = await formsIn(roomA.roomId);

    await openInRoomA(masterDocumentId).catch(() => undefined);

    expect(await formsIn(roomA.roomId)).toEqual(before);
  });

  it('tells nobody when the blank form is refused', async () => {
    const sent = await sentDuring(() =>
      openInRoomA(masterDocumentId).catch(() => undefined),
    );

    expect(sent).toEqual([]);
  });

  describe('when filing the blank form fails', () => {
    function failTheFiling() {
      harness.aroundAdminWrite = async (write, run) => {
        if (write.table === 'lender_ask_file') {
          throw new Error('The file could not be attached');
        }

        return run();
      };
    }

    it('passes the failure on', async () => {
      failTheFiling();

      await expect(openInRoomA()).rejects.toThrow(
        'The file could not be attached',
      );
    });

    it('leaves no form without a blank file behind', async () => {
      const before = await formsIn(roomA.roomId);
      failTheFiling();

      await openInRoomA().catch(() => undefined);

      expect(await formsIn(roomA.roomId)).toEqual(before);
    });
  });
});

describe('a lender in room A', () => {
  let theirFormId: string;

  beforeAll(async () => {
    theirFormId = await openIn(roomB, lenderB, roomBDocumentId);
  });

  it('cannot open a form in room B', async () => {
    await expect(openIn(roomB, lenderA, pdfId)).rejects.toThrow(NOT_A_MEMBER);
  });

  it('is told room B’s form was not found when replacing its blank form', async () => {
    await expect(
      actingAs(
        lenderA,
        replaceBlankForm,
      )({
        formId: theirFormId,
        documentId: pdfId,
      }),
    ).rejects.toThrow(FORM_NOT_FOUND);
  });

  it('is told the same for a form that does not exist', async () => {
    await expect(
      actingAs(
        lenderA,
        replaceBlankForm,
      )({
        formId: crypto.randomUUID(),
        documentId: pdfId,
      }),
    ).rejects.toThrow(FORM_NOT_FOUND);
  });

  it('leaves room B with its one form and one blank file after those attempts', async () => {
    expect(await formsIn(roomB.roomId)).toEqual([theirFormId]);
    expect(await blankFormsOf(theirFormId)).toEqual([roomBDocumentId]);
  });

  it('sees no forms when listing room B', async () => {
    expect(await listForms(lenderA.client, roomB.roomId)).toEqual([]);
  });

  it('is told room B’s form was not found when reading it', async () => {
    await expect(getForm(lenderA.client, theirFormId)).rejects.toThrow(
      FORM_NOT_FOUND,
    );
  });
});

describe('before we respond, a lender', () => {
  it('can replace the blank form, keeping the old one as history', async () => {
    const formId = await openInRoomA();

    await actingAs(
      lenderA2,
      replaceBlankForm,
    )({
      formId,
      documentId: secondPdfId,
    });

    expect(await filesOf(formId)).toEqual([
      { dr_document_id: pdfId, role: 'blank_form', added_by: lenderA.userId },
      {
        dr_document_id: secondPdfId,
        role: 'blank_form',
        added_by: lenderA2.userId,
      },
    ]);
  });

  it('sees the replacement as the current blank form', async () => {
    const formId = await openInRoomA();
    await actingAs(
      lenderA,
      replaceBlankForm,
    )({
      formId,
      documentId: secondPdfId,
    });

    const listed = await listForms(lenderA.client, roomA.roomId);

    expect(
      listed.find((form) => form.id === formId)?.current_blank_form,
    ).toEqual({ document_id: secondPdfId, name: 'application-v2.pdf' });
  });

  it.each([
    ['a master package document', () => masterDocumentId],
    ['a document from another room', () => roomBDocumentId],
  ])('cannot replace the blank form with %s', async (_name, documentId) => {
    const formId = await openInRoomA();

    await expect(
      actingAs(lenderA, replaceBlankForm)({ formId, documentId: documentId() }),
    ).rejects.toThrow(UPLOAD_FIRST);
  });

  it('cannot replace the blank form of an e-sign form with an .xlsx', async () => {
    const formId = await openInRoomA(pdfId, 'esign');

    await expect(
      actingAs(lenderA, replaceBlankForm)({ formId, documentId: xlsxId }),
    ).rejects.toThrow(NOT_SIGNABLE);
  });

  it('can change the return route to e-sign for a PDF blank form', async () => {
    const formId = await openInRoomA(pdfId, 'upload');

    await actingAs(
      lenderA,
      changeReturnRoute,
    )({
      formId,
      returnRoute: 'esign',
    });

    expect((await formRow(formId)).return_route).toBe('esign');
  });

  it('can change the return route back to completed-file upload', async () => {
    const formId = await openInRoomA(pdfId, 'esign');

    await actingAs(
      lenderA,
      changeReturnRoute,
    )({
      formId,
      returnRoute: 'upload',
    });

    expect((await formRow(formId)).return_route).toBe('upload');
  });

  it('cannot change the return route to e-sign when the current blank form is an .xlsx', async () => {
    const formId = await openInRoomA(pdfId, 'upload');
    await actingAs(lenderA, replaceBlankForm)({ formId, documentId: xlsxId });

    await expect(
      actingAs(lenderA, changeReturnRoute)({ formId, returnRoute: 'esign' }),
    ).rejects.toThrow(NOT_SIGNABLE);
  });

  it('can change the return route to e-sign once an .xlsx blank form is replaced by a PDF', async () => {
    const formId = await openInRoomA(xlsxId, 'upload');
    await actingAs(lenderA, replaceBlankForm)({ formId, documentId: pdfId });

    await actingAs(
      lenderA,
      changeReturnRoute,
    )({
      formId,
      returnRoute: 'esign',
    });

    expect((await formRow(formId)).return_route).toBe('esign');
  });

  it('can edit the title and note', async () => {
    const formId = await openInRoomA();

    await actingAs(
      lenderA2,
      editForm,
    )({
      formId,
      title: 'Loan application 2026',
      note: 'Section 4 too.',
    });

    expect(await formRow(formId)).toMatchObject({
      title: 'Loan application 2026',
      body: 'Section 4 too.',
    });
  });

  it('has an edited title trimmed', async () => {
    const formId = await openInRoomA();

    await actingAs(lenderA, editForm)({ formId, title: '  Guaranty  ' });

    expect((await formRow(formId)).title).toBe('Guaranty');
  });

  it('cannot edit the title down to only spaces', async () => {
    const formId = await openInRoomA();

    await expect(
      actingAs(lenderA, editForm)({ formId, title: '   ' }),
    ).rejects.toThrow('A form needs a title');
  });

  it('clears the note by leaving it out of an edit', async () => {
    const formId = await openInRoomA();

    await actingAs(lenderA, editForm)({ formId, title: 'Loan application' });

    expect((await formRow(formId)).body).toBeNull();
  });

  it('clears the note by editing it to only spaces', async () => {
    const formId = await openInRoomA();

    await actingAs(
      lenderA,
      editForm,
    )({
      formId,
      title: 'Loan application',
      note: '   ',
    });

    expect((await formRow(formId)).body).toBeNull();
  });

  it('can withdraw the form', async () => {
    const formId = await openInRoomA();

    await actingAs(lenderA, withdrawForm)({ formId });

    expect((await formRow(formId)).status).toBe('withdrawn');
  });
});

describe('after we returned the completed form', () => {
  let formId: string;

  beforeAll(async () => {
    formId = await openInRoomA();
    await returnCompleted(formId);
  });

  it('a lender is told it is too late to replace the blank form', async () => {
    await expect(
      actingAs(lenderA, replaceBlankForm)({ formId, documentId: secondPdfId }),
    ).rejects.toThrow(TOO_LATE_TO_REPLACE);
  });

  it('a lender is told it is too late to change the return route', async () => {
    await expect(
      actingAs(lenderA, changeReturnRoute)({ formId, returnRoute: 'esign' }),
    ).rejects.toThrow(TOO_LATE_TO_CHANGE_ROUTE);
  });

  it('the form keeps its route', async () => {
    expect((await formRow(formId)).return_route).toBe('upload');
  });

  it('the form keeps its one blank form', async () => {
    expect(await blankFormsOf(formId)).toEqual([pdfId]);
  });

  describe('and the lender reopened the form with a reply', () => {
    beforeAll(async () => {
      await actingAs(
        lenderA,
        replyToFormAsLender,
      )({
        formId,
        body: 'One more.',
      });
    });

    it('a lender is still told it is too late to replace the blank form', async () => {
      await expect(
        actingAs(
          lenderA,
          replaceBlankForm,
        )({
          formId,
          documentId: secondPdfId,
        }),
      ).rejects.toThrow(TOO_LATE_TO_REPLACE);
    });

    it('a lender is still told it is too late to change the return route', async () => {
      await expect(
        actingAs(lenderA, changeReturnRoute)({ formId, returnRoute: 'esign' }),
      ).rejects.toThrow(TOO_LATE_TO_CHANGE_ROUTE);
    });
  });
});

describe('our response landing between a lender reading the form and saving', () => {
  function racing(
    person: Person,
    formId: string,
    statusAfterwards: 'answered' | 'open' = 'answered',
  ): Person {
    const client = new Proxy(person.client, {
      get(target, property) {
        if (property !== 'rpc') {
          return Reflect.get(target, property, target);
        }

        return (name: never, args: never) =>
          wrapped(target.rpc(name, args) as unknown as Chain, async (run) => {
            await weRespond(formId, statusAfterwards);
            return run();
          });
      },
    });

    return { ...person, client };
  }

  const moves = [
    [
      'blank form replacement',
      replaceBlankForm,
      () => ({ documentId: secondPdfId }),
    ],
    [
      'return route change',
      changeReturnRoute,
      () => ({ returnRoute: 'esign' }),
    ],
  ] as const;

  it.each(moves)('refuses the %s', async (_name, action, input) => {
    const formId = await openInRoomA();

    await expect(
      actingAs(racing(lenderA, formId), action)({ formId, ...input() }),
    ).rejects.toThrow(CHANGED_UNDERNEATH);
  });

  it.each(moves)(
    'refuses the %s when the form was also reopened in between',
    async (_name, action, input) => {
      const formId = await openInRoomA();

      await expect(
        actingAs(
          racing(lenderA, formId, 'open'),
          action,
        )({
          formId,
          ...input(),
        }),
      ).rejects.toThrow(CHANGED_UNDERNEATH);
    },
  );

  it('leaves the one blank form after a refused replacement', async () => {
    const formId = await openInRoomA();

    await actingAs(
      racing(lenderA, formId),
      replaceBlankForm,
    )({
      formId,
      documentId: secondPdfId,
    }).catch(() => undefined);

    expect(await blankFormsOf(formId)).toEqual([pdfId]);
  });

  it('leaves the route after a refused route change', async () => {
    const formId = await openInRoomA();

    await actingAs(
      racing(lenderA, formId),
      changeReturnRoute,
    )({
      formId,
      returnRoute: 'esign',
    }).catch(() => undefined);

    expect((await formRow(formId)).return_route).toBe('upload');
  });
});

describe('our response landing right after a lender’s replacement is saved', () => {
  function replaceWhileWeRespond(formId: string) {
    harness.aroundAdminWrite = async (write, run) => {
      if (write.table === 'lender_ask_file') {
        await weRespond(formId);
      }

      return run();
    };

    return actingAs(
      lenderA,
      replaceBlankForm,
    )({
      formId,
      documentId: secondPdfId,
    });
  }

  it('refuses the replacement', async () => {
    const formId = await openInRoomA();

    await expect(replaceWhileWeRespond(formId)).rejects.toThrow(
      CHANGED_UNDERNEATH,
    );
  });

  it('leaves the blank form we answered as the only one', async () => {
    const formId = await openInRoomA();

    await replaceWhileWeRespond(formId).catch(() => undefined);

    expect(await blankFormsOf(formId)).toEqual([pdfId]);
  });
});

describe('our response landing right after a lender’s route change is saved', () => {
  it('finds the route the form then keeps', async () => {
    const formId = await openInRoomA(pdfId, 'upload');
    let routeWhenWeResponded: string | null = null;

    harness.aroundAdminWrite = async (write, run) => {
      const saved = await run();

      if (write.table === 'lender_ask' && !routeWhenWeResponded) {
        routeWhenWeResponded = (await formRow(formId)).return_route;
        await weRespond(formId);
      }

      return saved;
    };

    await actingAs(
      lenderA,
      changeReturnRoute,
    )({
      formId,
      returnRoute: 'esign',
    }).catch(() => undefined);

    expect((await formRow(formId)).return_route).toBe(routeWhenWeResponded);
  });
});

describe('our team returning two completed documents', () => {
  let formId: string;
  let sent: SentNotification[];

  beforeAll(async () => {
    formId = await openInRoomA();
    sent = await sentDuring(() =>
      returnCompleted(formId, [completedId, docxId]),
    );
  });

  it('answers the form', async () => {
    expect((await formRow(formId)).status).toBe('answered');
  });

  it('files each document as a completed form added by us', async () => {
    expect((await filesOf(formId)).slice(1)).toEqual([
      {
        dr_document_id: completedId,
        role: 'completed_form',
        added_by: us.userId,
      },
      { dr_document_id: docxId, role: 'completed_form', added_by: us.userId },
    ]);
  });

  it('tells every member of the room', () => {
    expect(sent).toHaveLength(2);
    expect(sent).toEqual(
      expect.arrayContaining(
        toldAbout('lender_form.returned', formId, [lenderA, lenderA2]),
      ),
    );
  });
});

describe('returning a completed form', () => {
  it('answers a form that is waiting on the e-sign route', async () => {
    const formId = await openInRoomA(pdfId, 'esign');

    await returnCompleted(formId);

    expect((await formRow(formId)).status).toBe('answered');
  });

  it('leaves the e-sign route as the lender chose it', async () => {
    const formId = await openInRoomA(pdfId, 'esign');

    await returnCompleted(formId);

    expect((await formRow(formId)).return_route).toBe('esign');
  });

  it('accepts a document from a folder nested inside the room folder', async () => {
    const formId = await openInRoomA();

    await returnCompleted(formId, [nestedPdfId]);

    expect((await filesOf(formId)).at(-1)).toMatchObject({
      dr_document_id: nestedPdfId,
      role: 'completed_form',
    });
  });

  it.each([
    ['a master package document', () => masterDocumentId],
    ['a document from another room', () => roomBDocumentId],
    ['a document outside the lender package', () => unsharedDocumentId],
  ])('is refused for %s', async (_name, documentId) => {
    const formId = await openInRoomA();

    await expect(returnCompleted(formId, [documentId()])).rejects.toThrow(
      NOT_IN_ROOM_FOLDER,
    );
  });

  it('files nothing when one of the documents is refused', async () => {
    const formId = await openInRoomA();

    await returnCompleted(formId, [completedId, masterDocumentId]).catch(
      () => undefined,
    );

    expect(await filesOf(formId)).toHaveLength(1);
  });

  it('is refused with no documents', async () => {
    const formId = await openInRoomA();

    await expect(returnCompleted(formId, [])).rejects.toThrow(
      'Choose the completed form to return',
    );
  });
});

describe.each([
  ['a lender member of the room', () => lenderA],
  ['a signed-in user from an unrelated account', () => outsider],
])('%s', (_who, person) => {
  let formId: string;

  beforeAll(async () => {
    formId = await openInRoomA();
  });

  it.each([
    [
      'return a completed form',
      returnCompletedForm,
      () => ({ documentIds: [completedId] }),
    ],
    [
      'reply as the deal team',
      replyToFormAsInternal,
      () => ({ body: 'Done.' }),
    ],
    ['close the form as the deal team', closeFormAsInternal, () => ({})],
  ])('cannot %s', async (_name, action, input) => {
    await expect(
      actingAs(person(), action)({ formId, ...input() }),
    ).rejects.toThrow(DEAL_TEAM_ONLY);
  });

  it('leaves the form open and unanswered after those attempts', async () => {
    expect(await formRow(formId)).toMatchObject({
      status: 'open',
      first_response_at: null,
    });
  });

  it('leaves the form with no new files or messages after those attempts', async () => {
    expect(await filesOf(formId)).toHaveLength(1);
    expect(await messagesOf(formId)).toEqual([]);
  });
});

describe('a lender reply with an attachment on an answered form', () => {
  let formId: string;
  let sent: SentNotification[];

  beforeAll(async () => {
    formId = await openInRoomA();
    await returnCompleted(formId);
    sent = await sentDuring(() =>
      actingAs(
        lenderA2,
        replyToFormAsLender,
      )({
        formId,
        body: '  Signature page is missing.  ',
        documentIds: [docxId],
      }),
    );
  });

  it('reopens the form', async () => {
    expect((await formRow(formId)).status).toBe('open');
  });

  it('records the lender’s message, trimmed', async () => {
    expect(await messagesOf(formId)).toEqual([
      {
        author_user_id: lenderA2.userId,
        side: 'lender',
        body: 'Signature page is missing.',
      },
    ]);
  });

  it('files the document as an attachment added by the lender', async () => {
    expect((await filesOf(formId)).at(-1)).toEqual({
      dr_document_id: docxId,
      role: 'attachment',
      added_by: lenderA2.userId,
    });
  });

  it('tells our team', () => {
    expect(sent).toHaveLength(2);
    expect(sent).toEqual(
      expect.arrayContaining(
        toldAbout('lender_ask.replied', formId, [us, colleague]),
      ),
    );
  });
});

describe('the form thread', () => {
  it('lets a lender reply with a file alone, recording no message', async () => {
    const formId = await openInRoomA();

    await actingAs(
      lenderA,
      replyToFormAsLender,
    )({
      formId,
      documentIds: [docxId],
    });

    expect(await messagesOf(formId)).toEqual([]);
  });

  it('records no message for a lender reply of only spaces with a file', async () => {
    const formId = await openInRoomA();

    await actingAs(
      lenderA,
      replyToFormAsLender,
    )({
      formId,
      body: '   ',
      documentIds: [docxId],
    });

    expect(await messagesOf(formId)).toEqual([]);
  });

  it('refuses a lender reply with neither a message nor a file', async () => {
    const formId = await openInRoomA();

    await expect(
      actingAs(lenderA, replyToFormAsLender)({ formId }),
    ).rejects.toThrow(EMPTY_REPLY);
  });

  it('refuses a lender reply of only spaces and no file', async () => {
    const formId = await openInRoomA();

    await expect(
      actingAs(lenderA, replyToFormAsLender)({ formId, body: '   ' }),
    ).rejects.toThrow(EMPTY_REPLY);
  });

  it('refuses a lender reply attaching a document from another room', async () => {
    const formId = await openInRoomA();

    await expect(
      actingAs(
        lenderA,
        replyToFormAsLender,
      )({
        formId,
        body: 'See attached.',
        documentIds: [roomBDocumentId],
      }),
    ).rejects.toThrow(NOT_SHOWN);
  });

  it('answers the form when we reply with a message', async () => {
    const formId = await openInRoomA();

    await actingAs(
      us,
      replyToFormAsInternal,
    )({
      formId,
      body: 'Working on it.',
    });

    expect((await formRow(formId)).status).toBe('answered');
  });

  it('records our message, trimmed', async () => {
    const formId = await openInRoomA();

    await actingAs(
      us,
      replyToFormAsInternal,
    )({
      formId,
      body: '  Working on it.  ',
    });

    expect(await messagesOf(formId)).toEqual([
      { author_user_id: us.userId, side: 'internal', body: 'Working on it.' },
    ]);
  });

  it('refuses our reply with neither a message nor a file', async () => {
    const formId = await openInRoomA();

    await expect(
      actingAs(us, replyToFormAsInternal)({ formId }),
    ).rejects.toThrow(EMPTY_REPLY);
  });

  it('answers the form when we reply with a file alone', async () => {
    const formId = await openInRoomA();

    await actingAs(
      us,
      replyToFormAsInternal,
    )({
      formId,
      documentIds: [nestedPdfId],
    });

    expect((await formRow(formId)).status).toBe('answered');
  });

  it('files a document on our reply as an attachment added by us', async () => {
    const formId = await openInRoomA();

    await actingAs(
      us,
      replyToFormAsInternal,
    )({
      formId,
      body: 'Instructions attached.',
      documentIds: [completedId],
    });

    expect((await filesOf(formId)).at(-1)).toEqual({
      dr_document_id: completedId,
      role: 'attachment',
      added_by: us.userId,
    });
  });

  it.each([
    ['a master package document', () => masterDocumentId],
    ['a document from another room', () => roomBDocumentId],
  ])('refuses our reply attaching %s', async (_name, documentId) => {
    const formId = await openInRoomA();

    await expect(
      actingAs(
        us,
        replyToFormAsInternal,
      )({
        formId,
        body: 'See attached.',
        documentIds: [documentId()],
      }),
    ).rejects.toThrow(NOT_IN_ROOM_FOLDER);
  });

  it('records no message when our attachment is refused', async () => {
    const formId = await openInRoomA();

    await actingAs(
      us,
      replyToFormAsInternal,
    )({
      formId,
      body: 'See attached.',
      documentIds: [masterDocumentId],
    }).catch(() => undefined);

    expect(await messagesOf(formId)).toEqual([]);
  });

  it('tells every member of the room when we reply', async () => {
    const formId = await openInRoomA();

    const sent = await sentDuring(() =>
      actingAs(us, replyToFormAsInternal)({ formId, body: 'Working on it.' }),
    );

    expect(sent).toHaveLength(2);
    expect(sent).toEqual(
      expect.arrayContaining(
        toldAbout('lender_ask.answered', formId, [lenderA, lenderA2]),
      ),
    );
  });

  it('lets us close a form', async () => {
    const formId = await openInRoomA();

    await actingAs(us, closeFormAsInternal)({ formId });

    expect((await formRow(formId)).status).toBe('closed');
  });

  it('lets the lender close a form', async () => {
    const formId = await openInRoomA();

    await actingAs(lenderA, closeFormAsLender)({ formId });

    expect((await formRow(formId)).status).toBe('closed');
  });

  it('tells a lender closing a closed form that the form is already closed', async () => {
    const formId = await openInRoomA();
    await actingAs(lenderA, closeFormAsLender)({ formId });

    await expect(
      actingAs(lenderA, closeFormAsLender)({ formId }),
    ).rejects.toThrow('This form is already closed');
  });

  it('tells us the same when we close a closed form', async () => {
    const formId = await openInRoomA();
    await actingAs(lenderA, closeFormAsLender)({ formId });

    await expect(actingAs(us, closeFormAsInternal)({ formId })).rejects.toThrow(
      'This form is already closed',
    );
  });
});

describe('the forms of a room', () => {
  let room: Room;
  let blankId: string;
  let returnedId: string;
  let signedId: string;
  let olderFormId: string;
  let newerFormId: string;
  let plainAskId: string;

  async function listedIds(person: Person) {
    return (await listForms(person.client, room.roomId)).map((form) => form.id);
  }

  beforeAll(async () => {
    room = await seedRoom(deal, 'Bank Reader', [lenderA]);
    blankId = await seedDocument(deal, room.privateFolderId, 'w9.pdf');
    returnedId = await seedDocument(deal, room.privateFolderId, 'w9-done.pdf');
    signedId = await seedDocument(deal, room.privateFolderId, 'w9-signed.pdf');

    olderFormId = await openIn(room, lenderA, blankId, 'upload');
    newerFormId = await openIn(room, lenderA, blankId, 'esign');

    const { data: ask } = await admin
      .from('lender_ask')
      .insert({
        room_id: room.roomId,
        account_id: deal.accountId,
        kind: 'ask',
        title: 'Trailing twelve months',
        created_by: lenderA.userId,
      })
      .select('id')
      .single()
      .throwOnError();
    plainAskId = ask.id;
  });

  it('leave out requests that are not forms', async () => {
    expect((await listedIds(us)).sort()).toEqual(
      [olderFormId, newerFormId].sort(),
    );
  });

  it('are listed with the most recently opened first', async () => {
    expect(await listedIds(us)).toEqual([newerFormId, olderFormId]);
  });

  it('are listed with a form that just received a message first', async () => {
    await actingAs(
      lenderA,
      replyToFormAsLender,
    )({
      formId: olderFormId,
      body: 'Any update?',
    });

    expect(await listedIds(us)).toEqual([olderFormId, newerFormId]);
  });

  describe('once we returned the newer form and a signed copy was filed', () => {
    let signedFiledAt: string;

    async function newerAsListedFor(person: Person) {
      const [form] = await listForms(person.client, room.roomId);
      return form;
    }

    beforeAll(async () => {
      await actingAs(
        us,
        returnCompletedForm,
      )({
        formId: newerFormId,
        documentIds: [returnedId],
      });

      const { data: signed } = await admin
        .from('lender_ask_file')
        .insert({
          ask_id: newerFormId,
          dr_document_id: signedId,
          role: 'signed_form',
          added_by: us.userId,
        })
        .select('created_at')
        .single()
        .throwOnError();
      signedFiledAt = signed.created_at;
    });

    it('are listed with that form first', async () => {
      expect(await listedIds(us)).toEqual([newerFormId, olderFormId]);
    });

    it('show a lender the status', async () => {
      expect((await newerAsListedFor(lenderA))?.status).toBe('answered');
    });

    it('show a lender the return route', async () => {
      expect((await newerAsListedFor(lenderA))?.return_route).toBe('esign');
    });

    it('show a lender the current blank form by document and name', async () => {
      expect((await newerAsListedFor(lenderA))?.current_blank_form).toEqual({
        document_id: blankId,
        name: 'w9.pdf',
      });
    });

    it('show a lender the completed document', async () => {
      expect((await newerAsListedFor(lenderA))?.completed_document_ids).toEqual(
        [returnedId],
      );
    });

    it('show a lender the signed document', async () => {
      expect((await newerAsListedFor(lenderA))?.signed_document_ids).toEqual([
        signedId,
      ]);
    });

    it('report the newest file time as the last activity', async () => {
      const form = await newerAsListedFor(us);

      expect(Date.parse(form!.last_activity_at)).toBe(
        Date.parse(signedFiledAt),
      );
    });

    it('show no returned documents for a form still waiting', async () => {
      const [, waiting] = await listForms(us.client, room.roomId);

      expect(waiting).toMatchObject({
        id: olderFormId,
        completed_document_ids: [],
        signed_document_ids: [],
      });
    });

    it('a form is read with its files oldest first', async () => {
      const form = await getForm(lenderA.client, newerFormId);

      expect(form.files.map((file) => file.role)).toEqual([
        'blank_form',
        'completed_form',
        'signed_form',
      ]);
    });

    it('a form is read with its thread oldest first', async () => {
      await actingAs(
        lenderA,
        replyToFormAsLender,
      )({
        formId: newerFormId,
        body: 'First.',
      });
      await actingAs(
        us,
        replyToFormAsInternal,
      )({
        formId: newerFormId,
        body: 'Second.',
      });

      const form = await getForm(us.client, newerFormId);

      expect(form.messages.map((message) => message.body)).toEqual([
        'First.',
        'Second.',
      ]);
    });
  });

  describe('a request that is not a form', () => {
    it.each([
      [
        'a lender replying to it as a form',
        () =>
          actingAs(
            lenderA,
            replyToFormAsLender,
          )({ formId: plainAskId, body: 'Hello' }),
      ],
      [
        'us returning a completed form on it',
        () =>
          actingAs(
            us,
            returnCompletedForm,
          )({ formId: plainAskId, documentIds: [returnedId] }),
      ],
      ['reading it as a form', () => getForm(us.client, plainAskId)],
    ])('is not found by %s', async (_name, attempt) => {
      await expect(attempt()).rejects.toThrow(FORM_NOT_FOUND);
    });

    it('has no messages or files after those attempts', async () => {
      expect(await messagesOf(plainAskId)).toEqual([]);
      expect(await filesOf(plainAskId)).toEqual([]);
    });
  });
});

describe('a lender in a closed room', () => {
  let room: Room;
  let documentId: string;
  let formId: string;

  beforeAll(async () => {
    room = await seedRoom(deal, 'Bank Shut', [lenderA]);
    documentId = await seedDocument(deal, room.privateFolderId, 'form.pdf');
    formId = await openIn(room, lenderA, documentId);
    await admin
      .from('lender_room')
      .update({ closed_at: new Date().toISOString() })
      .eq('id', room.roomId)
      .throwOnError();
  });

  it('cannot open a form', async () => {
    await expect(openIn(room, lenderA, documentId)).rejects.toThrow(
      NOT_A_MEMBER,
    );
  });

  it.each([
    ['replace the blank form', replaceBlankForm, () => ({ documentId })],
    [
      'change the return route',
      changeReturnRoute,
      () => ({ returnRoute: 'esign' }),
    ],
    ['edit the form', editForm, () => ({ title: 'Late', note: 'Late' })],
    ['withdraw the form', withdrawForm, () => ({})],
    ['reply on the form', replyToFormAsLender, () => ({ body: 'Late' })],
    ['close the form', closeFormAsLender, () => ({})],
  ])('cannot %s', async (_name, action, input) => {
    await expect(
      actingAs(lenderA, action)({ formId, ...input() }),
    ).rejects.toThrow(FORM_NOT_FOUND);
  });

  it('leaves the form as it was after those attempts', async () => {
    expect(await formRow(formId)).toMatchObject({
      title: 'Loan application',
      status: 'open',
      return_route: 'upload',
    });
  });
});

const OUT_FOR_SIGNATURE =
  'This form is out for signature. Reply here if something needs to change.';

const movesBesidesReplying = [
  [
    'replace the blank form',
    replaceBlankForm,
    () => ({ documentId: secondPdfId }),
  ],
  [
    'change the return route',
    changeReturnRoute,
    () => ({ returnRoute: 'upload' }),
  ],
  ['edit the form', editForm, () => ({ title: 'New', note: 'New' })],
  ['withdraw the form', withdrawForm, () => ({})],
  ['close the form', closeFormAsLender, () => ({})],
] as const;

async function formWithSignatureRequest(
  status: 'draft' | 'sent' | 'declined' | 'expired' | 'completed',
) {
  const formId = await openInRoomA(pdfId, 'esign');
  await admin
    .from('lender_form_signature')
    .insert({
      ask_id: formId,
      documenso_document_id: crypto.randomUUID(),
      signers: [],
      status,
    })
    .throwOnError();

  return formId;
}

describe.each(['draft', 'sent'] as const)(
  'while a form has a %s signature request, a lender',
  (status) => {
    it.each(movesBesidesReplying)('cannot %s', async (_name, action, input) => {
      const formId = await formWithSignatureRequest(status);

      await expect(
        actingAs(lenderA, action)({ formId, ...input() }),
      ).rejects.toThrow(OUT_FOR_SIGNATURE);
    });

    it('can still reply on its thread', async () => {
      const formId = await formWithSignatureRequest(status);

      await actingAs(
        lenderA,
        replyToFormAsLender,
      )({
        formId,
        body: 'Page 2 has the wrong entity name.',
      });

      expect(await messagesOf(formId)).toMatchObject([
        { side: 'lender', body: 'Page 2 has the wrong entity name.' },
      ]);
    });
  },
);

describe.each(['declined', 'expired', 'completed'] as const)(
  'once a form’s signature request is %s, a lender',
  (status) => {
    it.each(movesBesidesReplying)(
      'can %s again',
      async (_name, action, input) => {
        const formId = await formWithSignatureRequest(status);

        await expect(
          actingAs(lenderA, action)({ formId, ...input() }),
        ).resolves.toBeUndefined();
      },
    );
  },
);

describe('when e-signature is not set up', () => {
  const ESIGN_UNAVAILABLE =
    'E-signature is not available for this room. Choose to get the completed file back instead';

  let earlierEsignFormId: string;

  beforeAll(async () => {
    earlierEsignFormId = await openInRoomA(pdfId, 'esign');
  });

  beforeEach(unconfigureEsign);

  it('refuses a form uploaded with the e-sign route and records nothing', async () => {
    const before = await admin
      .from('lender_ask')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', roomA.roomId)
      .throwOnError();

    await expect(openInRoomA(pdfId, 'esign')).rejects.toThrow(
      ESIGN_UNAVAILABLE,
    );

    const after = await admin
      .from('lender_ask')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', roomA.roomId)
      .throwOnError();

    expect(after.count).toBe(before.count);
  });

  it('still takes a form that comes back as a completed file', async () => {
    const formId = await openInRoomA(pdfId, 'upload');

    expect((await formRow(formId)).return_route).toBe('upload');
  });

  it('refuses changing a form to the e-sign route', async () => {
    const formId = await openInRoomA(pdfId, 'upload');

    await expect(
      actingAs(lenderA, changeReturnRoute)({ formId, returnRoute: 'esign' }),
    ).rejects.toThrow(ESIGN_UNAVAILABLE);
  });

  it('leaves a form opened with the e-sign route earlier as it is', async () => {
    await actingAs(
      lenderA,
      replaceBlankForm,
    )({
      formId: earlierEsignFormId,
      documentId: pdfId,
    });

    expect((await formRow(earlierEsignFormId)).return_route).toBe('esign');
  });

  it('lets an earlier e-sign form be switched to a completed file', async () => {
    await actingAs(
      lenderA,
      changeReturnRoute,
    )({ formId: earlierEsignFormId, returnRoute: 'upload' });

    expect((await formRow(earlierEsignFormId)).return_route).toBe('upload');
  });
});
