import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { turnTeamBillingOn } from '@odb/supabase/test-support/team-billing';

import { DATA_ROOM_BUCKET } from '@odb/data-room/storage';

import { unwrap } from '../actions/test-support/unwrap';
import {
  type Person,
  admin,
  provisionPerson,
  removeEverythingSeeded,
  seedDocument,
  seedRoom,
  seedTeamDeal,
} from '../asks/integration-harness';

import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const session = vi.hoisted(() => ({
  client: null as unknown,
  loggedErrors: [] as string[],
}));

const converter = {
  server: null as unknown as Server,
  working: true,
};

vi.mock('@odb/shared/logger', () => {
  const logger = {
    error: (_context: unknown, message: string) => {
      session.loggedErrors.push(message);
    },
    warn: () => {},
    info: () => {},
    debug: () => {},
  };
  return { getLogger: () => logger };
});

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => session.client,
}));

vi.mock('@odb/supabase/admin', async () => {
  const harness = await import('../asks/integration-harness');
  return { getSupabaseServerAdminClient: () => harness.admin };
});

import { prefillFaqEntry } from './prefill';
import { saveNewFaqEntry } from './publish';

const DEAL_TEAM_ONLY = 'Only the deal team can do that';
const NOT_ANSWERED = 'Only an answered request can be added to the FAQ';
const NOT_OUR_FILE = 'Only our answer files can be added to the FAQ';
const TOO_LONG = 'A question or answer can be at most 5,000 characters';
const BLANK = 'A question and an answer are both required';
const FORM = 'A form cannot be added to the FAQ';
const NOT_FOUND = 'That request was not found';
const READ_ONLY = 'This team is read-only until billing is updated.';

const HEIC_SAMPLE = Uint8Array.from(
  Buffer.from(
    'AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABhm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABodmMxAAAAAOZpcHJwAAAAxWlwY28AAAATY29scm5jbHgAAgACAAaAAAAADGNsbGkAywBAAAAAFGlzcGUAAAAAAAAAEAAAABAAAAAJaXJvdAAAAAAQcGl4aQAAAAADCAgIAAAAcWh2Y0MBA3AAAACwAAAAAAAe8AD8/fj4AAALA6AAAQAXQAEMAf//A3AAAAMAsAAAAwAAAwAecCShAAEAI0IBAQNwAAADALAAAAMAAAMAHqAUIEHAkwziHuRZVNwICBgCogABAAlEAcBhcshAUyQAAAAZaXBtYQAAAAAAAAABAAEGgQIDBYaEAAAAHmlsb2MAAAAARAAAAQABAAAAAQAAAboAAAA8AAAAAW1kYXQAAAAAAAAATAAAADgoAa+jVyq0//uP//pu7LpGtUf/1Wp//ezf/2vFV3/6XT79Wvf7YA7O/7/vppoS01HCM8ULq1Lu4A==',
    'base64',
  ),
);

type Deal = { accountId: string; dealId: string };
type Room = { roomId: string; privateFolderId: string };
type AskStatus = 'open' | 'answered' | 'closed';

let owner: Person;
let lender: Person;
let outsider: Person;
let deal: Deal;
let room: Room;
let otherRoom: Room;
const seededDealIds: string[] = [];

function as(person: Person) {
  session.client = person.client;
}

async function seedAsk(
  status: AskStatus,
  wording: { title: string; body: string | null } = {
    title: 'What was 2025 EBITDA?',
    body: 'Adjusted, please.',
  },
) {
  const { data } = await admin
    .from('lender_ask')
    .insert({
      room_id: room.roomId,
      account_id: deal.accountId,
      kind: 'ask',
      status,
      created_by: lender.userId,
      ...wording,
    })
    .select('id')
    .single()
    .throwOnError();

  return data.id;
}

async function seedMessage(
  askId: string,
  side: 'lender' | 'internal',
  body: string,
) {
  await admin
    .from('lender_ask_message')
    .insert({
      ask_id: askId,
      side,
      body,
      author_user_id: side === 'internal' ? owner.userId : lender.userId,
    })
    .throwOnError();
}

async function seedAskFile(
  askId: string,
  role: 'fulfilment' | 'attachment',
  name: string,
  contents: string | Uint8Array<ArrayBuffer>,
) {
  const documentId = await seedDocument(deal, room.privateFolderId, name);
  const storagePath = `deal/${deal.dealId}/${documentId}-${name}`;
  await admin.storage
    .from(DATA_ROOM_BUCKET)
    .upload(storagePath, new Blob([contents]));

  const { data } = await admin
    .from('lender_ask_file')
    .insert({ ask_id: askId, dr_document_id: documentId, role })
    .select('id')
    .single()
    .throwOnError();

  return { askFileId: data.id, storagePath };
}

async function answeredAskWithFile() {
  const askId = await seedAsk('answered');
  await seedMessage(askId, 'internal', 'About 2.1M.');
  const file = await seedAskFile(
    askId,
    'fulfilment',
    'ebitda.pdf',
    'pdf bytes',
  );
  return { askId, ...file };
}

function newEntry(overrides: Record<string, unknown> = {}) {
  return {
    entryId: crypto.randomUUID(),
    dealId: deal.dealId,
    askIds: [] as string[],
    question: 'What was 2025 EBITDA?',
    answer: 'About 2.1M adjusted.',
    status: 'published' as const,
    files: [] as { askFileId: string; name: string }[],
    ...overrides,
  };
}

async function entryRow(entryId: string) {
  const { data } = await admin
    .from('lender_faq_entry')
    .select('question, answer, status, sources:lender_faq_source(ask_id)')
    .eq('id', entryId)
    .maybeSingle()
    .throwOnError();
  return data;
}

async function entryFiles(entryId: string) {
  const { data } = await admin
    .from('lender_faq_file')
    .select('name, storage_path, deal_id')
    .eq('entry_id', entryId)
    .throwOnError();
  return data;
}

async function storedText(path: string) {
  const { data, error } = await admin.storage
    .from(DATA_ROOM_BUCKET)
    .download(path);
  if (error) {
    throw error;
  }
  return data.text();
}

async function storedNamesEndingWith(suffix: string) {
  const { data, error } = await admin.storage
    .from(DATA_ROOM_BUCKET)
    .list(`deal/${deal.dealId}`, { limit: 1000 });
  if (error) {
    throw error;
  }
  return data.filter((object) => object.name.endsWith(suffix));
}

async function roomFaqIds(roomId: string) {
  const { data } = await owner.client
    .rpc('lender_room_faq', { room_id: roomId })
    .throwOnError();
  return data.map((entry) => entry.id);
}

beforeAll(async () => {
  [owner, lender, outsider] = await Promise.all([
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
  ]);
  deal = await seedTeamDeal(owner);
  seededDealIds.push(deal.dealId);
  room = await seedRoom(deal, 'Asking Bank', [lender]);
  otherRoom = await seedRoom(deal, 'Other Bank', []);

  converter.server = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.writeHead(converter.working ? 200 : 500);
      response.end(converter.working ? 'converted deck' : 'libreoffice down');
    });
  });
  await new Promise<void>((resolve) => converter.server.listen(0, resolve));
  process.env.GOTENBERG_URL = `http://127.0.0.1:${(converter.server.address() as AddressInfo).port}`;
}, 60_000);

afterAll(async () => {
  converter.server.close();
  await admin
    .from('lender_faq_entry')
    .delete()
    .in('deal_id', seededDealIds)
    .throwOnError();
  await removeEverythingSeeded();
}, 60_000);

describe('prefilling an FAQ entry from an ask', () => {
  it('asks the title and body and answers with our replies in order', async () => {
    const askId = await seedAsk('answered');
    await seedMessage(askId, 'internal', 'About 2.1M.');
    await seedMessage(askId, 'lender', 'Is that adjusted?');
    await seedMessage(askId, 'internal', 'Yes, adjusted.');

    expect(await prefillFaqEntry(owner.client, askId)).toMatchObject({
      question: 'What was 2025 EBITDA?\n\nAdjusted, please.',
      answer: 'About 2.1M.\n\nYes, adjusted.',
    });
  });

  it('asks the title alone when the ask has no body', async () => {
    const askId = await seedAsk('answered', {
      title: 'Rent roll?',
      body: null,
    });

    expect((await prefillFaqEntry(owner.client, askId)).question).toBe(
      'Rent roll?',
    );
  });

  it('offers our answer files and never the lender attachments', async () => {
    const askId = await seedAsk('answered');
    const ours = await seedAskFile(askId, 'fulfilment', 'ours.pdf', 'ours');
    await seedAskFile(askId, 'attachment', 'theirs.pdf', 'theirs');

    expect((await prefillFaqEntry(owner.client, askId)).files).toEqual([
      { askFileId: ours.askFileId, name: 'ours.pdf' },
    ]);
  });
});

describe('publishing an entry from an answered ask with a renamed file', () => {
  let entryId: string;
  let source: Awaited<ReturnType<typeof answeredAskWithFile>>;

  beforeAll(async () => {
    source = await answeredAskWithFile();
    const entry = newEntry({
      askIds: [source.askId],
      files: [{ askFileId: source.askFileId, name: 'EBITDA bridge.pdf' }],
    });
    entryId = entry.entryId;
    as(owner);
    await unwrap(saveNewFaqEntry(entry));
  });

  it('shows the entry in every room of the deal', async () => {
    expect(await roomFaqIds(room.roomId)).toContain(entryId);
    expect(await roomFaqIds(otherRoom.roomId)).toContain(entryId);
  });

  it('keeps the team wording and links the source ask', async () => {
    expect(await entryRow(entryId)).toEqual({
      question: 'What was 2025 EBITDA?',
      answer: 'About 2.1M adjusted.',
      status: 'published',
      sources: [{ ask_id: source.askId }],
    });
  });

  it('shows the new name and copies the file under a fresh key that keeps the original name', async () => {
    const [file] = await entryFiles(entryId);

    expect(file).toMatchObject({
      name: 'EBITDA bridge.pdf',
      deal_id: deal.dealId,
    });
    expect(file!.storage_path).toMatch(
      new RegExp(
        `^deal/${deal.dealId}/[0-9a-f-]{36}-[0-9a-f-]{36}-ebitda\\.pdf$`,
      ),
    );
    expect(file!.storage_path).not.toBe(source.storagePath);
    expect(await storedText(file!.storage_path)).toBe('pdf bytes');
  });
});

describe('saving a new entry', () => {
  it('keeps a draft out of every room', async () => {
    const { askId } = await answeredAskWithFile();
    const entry = newEntry({ askIds: [askId], status: 'draft' });
    as(owner);

    await unwrap(saveNewFaqEntry(entry));

    expect((await entryRow(entry.entryId))!.status).toBe('draft');
    expect(await roomFaqIds(room.roomId)).not.toContain(entry.entryId);
  });

  it('keys the copy by the stored file, so a renamed answer file keeps its extension', async () => {
    const askId = await seedAsk('answered');
    await seedMessage(askId, 'internal', 'Here is the site.');
    const documentId = crypto.randomUUID();
    const storagePath = `deal/${deal.dealId}/${documentId}-site photo.pdf`;
    await admin.storage
      .from(DATA_ROOM_BUCKET)
      .upload(storagePath, new Blob(['site bytes']));
    await admin
      .rpc('append_deal_event', {
        p_deal_id: deal.dealId,
        p_aggregate_type: 'dr_document',
        p_aggregate_id: documentId,
        p_event_type: 'dr_document.added',
        p_payload: {
          folder_id: room.privateFolderId,
          name: 'Site walk',
          storage_path: storagePath,
        },
        p_actor_kind: 'service',
      })
      .throwOnError();
    const { data: askFile } = await admin
      .from('lender_ask_file')
      .insert({ ask_id: askId, dr_document_id: documentId, role: 'fulfilment' })
      .select('id')
      .single()
      .throwOnError();
    const entry = newEntry({
      askIds: [askId],
      files: [{ askFileId: askFile.id, name: 'Site walk notes' }],
    });
    as(owner);

    await unwrap(saveNewFaqEntry(entry));

    const [file] = await entryFiles(entry.entryId);
    expect(file!.name).toBe('Site walk notes');
    expect(file!.storage_path).toMatch(/-site_photo\.pdf$/);
    expect(await storedText(file!.storage_path)).toBe('site bytes');
  });

  it('links several asks to one entry', async () => {
    const first = await seedAsk('answered');
    const second = await seedAsk('answered');
    const entry = newEntry({ askIds: [first, second] });
    as(owner);

    await unwrap(saveNewFaqEntry(entry));

    expect(
      (await entryRow(entry.entryId))!.sources
        .map(({ ask_id }) => ask_id)
        .sort(),
    ).toEqual([first, second].sort());
  });

  it('can be written from scratch with no source ask', async () => {
    const entry = newEntry();
    as(owner);

    await unwrap(saveNewFaqEntry(entry));

    expect(await entryRow(entry.entryId)).toMatchObject({ sources: [] });
    expect(await roomFaqIds(room.roomId)).toContain(entry.entryId);
  });

  it('accepts a closed ask we replied to', async () => {
    const askId = await seedAsk('closed');
    await seedMessage(askId, 'internal', 'Sent it over email.');
    const entry = newEntry({ askIds: [askId] });
    as(owner);

    await unwrap(saveNewFaqEntry(entry));

    expect(await entryRow(entry.entryId)).not.toBeNull();
  });

  it.each([
    ['deck.pptx', '.preview.pdf'],
    ['lease.docx', '.preview.pdf'],
    ['photo.heic', '.preview.jpg'],
    ['photo.heif', '.preview.jpg'],
  ])(
    'copies the preview of %s renamed without its extension',
    async (name, previewSuffix) => {
      const askId = await seedAsk('answered');
      const original = await seedAskFile(askId, 'fulfilment', name, 'original');
      await admin.storage
        .from(DATA_ROOM_BUCKET)
        .upload(
          `${original.storagePath}${previewSuffix}`,
          new Blob(['converted preview']),
        );
      const entry = newEntry({
        askIds: [askId],
        files: [
          { askFileId: original.askFileId, name: 'Renamed without extension' },
        ],
      });
      as(owner);

      await unwrap(saveNewFaqEntry(entry));

      const [file] = await entryFiles(entry.entryId);
      expect(await storedText(`${file!.storage_path}${previewSuffix}`)).toBe(
        'converted preview',
      );
    },
  );

  describe('when the answer file has no preview', () => {
    async function saveWithoutSourcePreview(
      name: string,
      contents: string | Uint8Array<ArrayBuffer>,
    ) {
      const askId = await seedAsk('answered');
      const original = await seedAskFile(askId, 'fulfilment', name, contents);
      const entry = newEntry({
        askIds: [askId],
        files: [{ askFileId: original.askFileId, name: 'No preview yet' }],
      });
      as(owner);
      session.loggedErrors.length = 0;

      await unwrap(saveNewFaqEntry(entry));

      const [file] = await entryFiles(entry.entryId);
      return file!.storage_path;
    }

    it('logs an error and regenerates the PowerPoint preview', async () => {
      const storagePath = await saveWithoutSourcePreview('deck.pptx', 'slides');

      expect(await storedText(`${storagePath}.preview.pdf`)).toBe(
        'converted deck',
      );
      expect(session.loggedErrors).not.toEqual([]);
    });

    it('regenerates the HEIC preview', async () => {
      const storagePath = await saveWithoutSourcePreview(
        'photo.heic',
        HEIC_SAMPLE,
      );

      const { data } = await admin.storage
        .from(DATA_ROOM_BUCKET)
        .download(`${storagePath}.preview.jpg`);
      expect(data!.type).toBe('image/jpeg');
    });

    it('still saves the file, download only, and logs when regeneration fails', async () => {
      converter.working = false;
      const storagePath = await saveWithoutSourcePreview(
        'deck.pptx',
        'slides',
      ).finally(() => {
        converter.working = true;
      });

      expect(await storedText(storagePath)).toBe('slides');
      expect(
        (
          await admin.storage
            .from(DATA_ROOM_BUCKET)
            .exists(`${storagePath}.preview.pdf`)
        ).data,
      ).toBe(false);
      expect(session.loggedErrors.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('leaves one entry and one copy when the same save is retried', async () => {
    const askId = await seedAsk('answered');
    const name = `retried-${crypto.randomUUID().slice(0, 8)}.pdf`;
    const source = await seedAskFile(askId, 'fulfilment', name, 'pdf');
    const entry = newEntry({
      askIds: [askId],
      files: [{ askFileId: source.askFileId, name: 'Retried' }],
    });
    as(owner);

    await unwrap(saveNewFaqEntry(entry));
    await unwrap(saveNewFaqEntry(entry));

    expect(await entryRow(entry.entryId)).toMatchObject({
      sources: [{ ask_id: askId }],
    });
    expect(await entryFiles(entry.entryId)).toHaveLength(1);
    expect(
      (await storedNamesEndingWith(name)).filter(
        (object) => !source.storagePath.endsWith(object.name),
      ),
    ).toHaveLength(1);
  });
});

describe('a refused save writes nothing', () => {
  it.each<[string, AskStatus]>([
    ['an open ask', 'open'],
    ['a closed ask we never replied to', 'closed'],
  ])('for %s', async (_, status) => {
    const askId = await seedAsk(status);
    await seedMessage(askId, 'lender', 'Any update?');
    const entry = newEntry({ askIds: [askId] });
    as(owner);

    expect(await saveNewFaqEntry(entry)).toEqual({
      ok: false,
      refusal: NOT_ANSWERED,
    });
    expect(await entryRow(entry.entryId)).toBeNull();
  });

  it('for a lender attachment', async () => {
    const askId = await seedAsk('answered');
    const theirs = await seedAskFile(askId, 'attachment', 'theirs.pdf', 'x');
    const entry = newEntry({
      askIds: [askId],
      files: [{ askFileId: theirs.askFileId, name: 'theirs.pdf' }],
    });
    as(owner);

    expect(await saveNewFaqEntry(entry)).toEqual({
      ok: false,
      refusal: NOT_OUR_FILE,
    });
    expect(await entryRow(entry.entryId)).toBeNull();
  });

  it('for an answer over 5,000 characters', async () => {
    const entry = newEntry({ answer: 'a'.repeat(5001) });
    as(owner);

    expect(await saveNewFaqEntry(entry)).toEqual({
      ok: false,
      refusal: TOO_LONG,
    });
    expect(await entryRow(entry.entryId)).toBeNull();
  });

  it.each([
    ['question', { question: '   ' }],
    ['answer', { answer: '' }],
  ])('for a blank %s', async (_, blank) => {
    const entry = newEntry(blank);
    as(owner);

    expect(await saveNewFaqEntry(entry)).toEqual({ ok: false, refusal: BLANK });
    expect(await entryRow(entry.entryId)).toBeNull();
  });

  it('for a form', async () => {
    const { data: form } = await admin
      .from('lender_ask')
      .insert({
        room_id: room.roomId,
        account_id: deal.accountId,
        kind: 'form',
        return_route: 'esign',
        status: 'answered',
        title: 'Credit application',
        created_by: lender.userId,
      })
      .select('id')
      .single()
      .throwOnError();
    const entry = newEntry({ askIds: [form.id] });
    as(owner);

    expect(await saveNewFaqEntry(entry)).toEqual({ ok: false, refusal: FORM });
    expect(await entryRow(entry.entryId)).toBeNull();
  });

  it('for an ask from another deal', async () => {
    const otherDeal = await seedTeamDeal(owner);
    seededDealIds.push(otherDeal.dealId);
    const elsewhere = await seedRoom(otherDeal, 'Elsewhere Bank', []);
    const { data: ask } = await admin
      .from('lender_ask')
      .insert({
        room_id: elsewhere.roomId,
        account_id: otherDeal.accountId,
        kind: 'ask',
        status: 'answered',
        title: 'Rent roll?',
        created_by: lender.userId,
      })
      .select('id')
      .single()
      .throwOnError();
    const entry = newEntry({ askIds: [ask.id] });
    as(owner);

    expect(await saveNewFaqEntry(entry)).toEqual({
      ok: false,
      refusal: NOT_FOUND,
    });
    expect(await entryRow(entry.entryId)).toBeNull();
  });

  it('for someone outside the deal team', async () => {
    const entry = newEntry();
    as(outsider);

    expect(await saveNewFaqEntry(entry)).toEqual({
      ok: false,
      refusal: DEAL_TEAM_ONLY,
    });
    expect(await entryRow(entry.entryId)).toBeNull();
  });
});

describe('a locked team', () => {
  it('is told the team is read-only and saves nothing', async () => {
    await turnTeamBillingOn(admin);
    const colleague = await provisionPerson();
    const teamDeal = await seedTeamDeal(owner, colleague);
    seededDealIds.push(teamDeal.dealId);
    await admin
      .from('accounts')
      .update({
        trial_ends_at: new Date(Date.now() - 86_400_000).toISOString(),
      })
      .eq('id', teamDeal.accountId)
      .throwOnError();
    const entry = newEntry({ dealId: teamDeal.dealId });
    as(owner);

    expect(await saveNewFaqEntry(entry)).toEqual({
      ok: false,
      refusal: READ_ONLY,
    });
    expect(await entryRow(entry.entryId)).toBeNull();
  });
});
