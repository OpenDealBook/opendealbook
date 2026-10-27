import type { SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { turnTeamBillingOn } from '@odb/supabase/test-support/team-billing';

import { DATA_ROOM_BUCKET } from '@odb/data-room/storage';
import type { Database } from '@odb/supabase';

import {
  type IntegrationAccount,
  provisionAccount,
} from '../../../deals/test-support/integration-harness';
import { unwrap } from '../actions/test-support/unwrap';
import {
  provisionPerson,
  removeEverythingSeeded,
  seedFolder,
  seedRoom,
  seedTeamDeal,
} from '../asks/integration-harness';

const loggedErrors = vi.hoisted(() => [] as string[]);

vi.mock('@odb/shared/logger', () => {
  const logger = {
    error: (_context: unknown, message: string) => {
      loggedErrors.push(message);
    },
    warn: () => {},
    info: () => {},
    debug: () => {},
  };
  return { getLogger: () => logger };
});

const mockedClients = vi.hoisted(() => ({
  userScoped: null as unknown,
  serviceRole: null as unknown,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => mockedClients.userScoped,
}));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => mockedClients.serviceRole,
}));

import {
  addDataRoomFileToFaq,
  addUploadedFaqFile,
  beginFaqUpload,
  deleteFaqDraft,
  editFaqEntry,
  findSimilarFaqEntries,
  hideFaqEntryForRoom,
  removeFaqFile,
  setFaqEntryPinned,
  setFaqEntryStatus,
  unhideFaqEntryForRoom,
} from './manage';

const DEAL_TEAM_ONLY = 'Only the deal team can do that';
const BOTH_REQUIRED = 'A question and an answer are both required';
const TOO_LONG = 'A question or answer can be at most 5,000 characters';
const NOT_THIS_DEAL = "That document is not in this deal's data room";
const READ_ONLY = 'This team is read-only until billing is updated.';

let admin: SupabaseClient<Database>;
let team: IntegrationAccount;
let outsider: IntegrationAccount;

const dealId = crypto.randomUUID();
const outsiderDealId = crypto.randomUUID();
const openRoom = crypto.randomUUID();
const closedRoom = crypto.randomUUID();
const seededDealIds = [dealId];
const roomFolders = [crypto.randomUUID(), crypto.randomUUID()];
const sellerUploadsFolder = crypto.randomUUID();
const NOT_A_TEAM_FILE =
  'Only files from the lender package or your own data room folders can be added to the FAQ';

async function createEntry(
  status: Database['public']['Enums']['lender_faq_status'],
  deal: { accountId: string; dealId: string } = {
    accountId: team.accountId,
    dealId,
  },
) {
  const { data } = await admin
    .from('lender_faq_entry')
    .insert({
      account_id: deal.accountId,
      deal_id: deal.dealId,
      question: 'What is the EBITDA?',
      answer: 'About 2M.',
      status,
    })
    .select('id')
    .single()
    .throwOnError();

  return data.id;
}

async function readEntry(id: string) {
  const { data } = await admin
    .from('lender_faq_entry')
    .select('question, answer, status, pinned, version, first_published_at')
    .eq('id', id)
    .single()
    .throwOnError();

  return data;
}

async function roomFaqIds(roomId: string) {
  const { data } = await team.user
    .rpc('lender_room_faq', { room_id: roomId })
    .throwOnError();

  return data.map((entry) => entry.id);
}

function actAs(account: IntegrationAccount) {
  mockedClients.userScoped = account.user;
}

async function store(path: string, text: string) {
  const { error } = await admin.storage
    .from(DATA_ROOM_BUCKET)
    .upload(path, new TextEncoder().encode(text), {
      contentType: 'application/pdf',
    });

  expect(error).toBeNull();
}

async function storedText(path: string) {
  const { data } = await admin.storage.from(DATA_ROOM_BUCKET).download(path);

  return data ? data.text() : null;
}

async function createDeal(id: string, accountId: string) {
  const { data: firm } = await admin
    .from('firm')
    .insert({ account_id: accountId, name: 'FAQ deal' })
    .select('id')
    .single()
    .throwOnError();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: id,
      p_aggregate_type: 'deal',
      p_aggregate_id: id,
      p_event_type: 'deal.created',
      p_payload: {
        firm_id: firm.id,
        account_id: accountId,
        description: 'FAQ deal',
      },
      p_actor_kind: 'service',
    })
    .throwOnError();
}

async function seedStoredDocument(
  deal: { accountId: string; dealId: string },
  name: string,
  text: string,
  keyName = name,
  folderId?: string,
) {
  const documentId = crypto.randomUUID();
  const storagePath = `deal/${deal.dealId}/${documentId}-${keyName}`;
  await store(storagePath, text);
  await admin
    .rpc('append_deal_event', {
      p_deal_id: deal.dealId,
      p_aggregate_type: 'dr_document',
      p_aggregate_id: documentId,
      p_event_type: 'dr_document.added',
      p_payload: {
        folder_id: folderId ?? (await seedFolder(deal, 'Diligence')),
        name,
        storage_path: storagePath,
      },
      p_actor_kind: 'service',
    })
    .throwOnError();

  return { documentId, storagePath };
}

async function faqFiles(entryId: string) {
  const { data } = await admin
    .from('lender_faq_file')
    .select('name, storage_path, source_dr_document_id')
    .eq('entry_id', entryId)
    .throwOnError();

  return data;
}

async function teamDealEntry(
  status: Database['public']['Enums']['lender_faq_status'],
) {
  const [owner, colleague] = await Promise.all([
    provisionPerson(),
    provisionPerson(),
  ]);
  const deal = await seedTeamDeal(owner, colleague);
  seededDealIds.push(deal.dealId);
  const entryId = await createEntry(status, deal);
  const document = await seedStoredDocument(deal, 'locked.pdf', 'x');
  mockedClients.userScoped = owner.client;

  return {
    accountId: deal.accountId,
    dealId: deal.dealId,
    entryId,
    documentId: document.documentId,
  };
}

async function setTeamLocked(accountId: string, locked: boolean) {
  const day = locked ? -86_400_000 : 30 * 86_400_000;
  await admin
    .from('accounts')
    .update({ trial_ends_at: new Date(Date.now() + day).toISOString() })
    .eq('id', accountId)
    .throwOnError();
}

async function lockedTeamEntry(
  status: Database['public']['Enums']['lender_faq_status'],
) {
  const entry = await teamDealEntry(status);
  await turnTeamBillingOn(admin);
  await setTeamLocked(entry.accountId, true);

  return entry;
}

async function uploadFresh(entryId: string, name: string, bytes: Uint8Array) {
  const upload = await unwrap(
    beginFaqUpload({ entryId, name, size: bytes.length }),
  );
  const uploaded = await team.user.storage
    .from(DATA_ROOM_BUCKET)
    .uploadToSignedUrl(upload.path, upload.token, bytes);
  expect(uploaded.error).toBeNull();

  return upload;
}

async function storedExists(path: string) {
  const { data } = await admin.storage.from(DATA_ROOM_BUCKET).exists(path);

  return data;
}

const HEIC_SAMPLE = Uint8Array.from(
  Buffer.from(
    'AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABhm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABodmMxAAAAAOZpcHJwAAAAxWlwY28AAAATY29scm5jbHgAAgACAAaAAAAADGNsbGkAywBAAAAAFGlzcGUAAAAAAAAAEAAAABAAAAAJaXJvdAAAAAAQcGl4aQAAAAADCAgIAAAAcWh2Y0MBA3AAAACwAAAAAAAe8AD8/fj4AAALA6AAAQAXQAEMAf//A3AAAAMAsAAAAwAAAwAecCShAAEAI0IBAQNwAAADALAAAAMAAAMAHqAUIEHAkwziHuRZVNwICBgCogABAAlEAcBhcshAUyQAAAAZaXBtYQAAAAAAAAABAAEGgQIDBYaEAAAAHmlsb2MAAAAARAAAAQABAAAAAQAAAboAAAA8AAAAAW1kYXQAAAAAAAAATAAAADgoAa+jVyq0//uP//pu7LpGtUf/1Wp//ezf/2vFV3/6XT79Wvf7YA7O/7/vppoS01HCM8ULq1Lu4A==',
    'base64',
  ),
);

beforeAll(async () => {
  [team, outsider] = await Promise.all([
    provisionAccount(),
    provisionAccount(),
  ]);
  admin = team.admin;
  mockedClients.serviceRole = admin;

  await createDeal(dealId, team.accountId);
  await createDeal(outsiderDealId, outsider.accountId);

  await admin
    .from('dr_folder')
    .insert(
      [...roomFolders, sellerUploadsFolder].map((id, index) => ({
        id,
        account_id: team.accountId,
        deal_id: dealId,
        name: `Room ${index}`,
      })),
    )
    .throwOnError();

  await admin
    .from('lender_room')
    .insert([
      {
        id: openRoom,
        account_id: team.accountId,
        deal_id: dealId,
        name: 'Open lender',
        private_folder_id: roomFolders[0]!,
      },
      {
        id: closedRoom,
        account_id: team.accountId,
        deal_id: dealId,
        name: 'Closed lender',
        private_folder_id: roomFolders[1]!,
        closed_at: new Date().toISOString(),
      },
    ])
    .throwOnError();

  await admin
    .from('seller_room')
    .insert({
      account_id: team.accountId,
      deal_id: dealId,
      uploads_folder_id: sellerUploadsFolder,
    })
    .throwOnError();
});

afterAll(async () => {
  await admin.from('seller_room').delete().eq('deal_id', dealId).throwOnError();

  await admin
    .from('lender_faq_entry')
    .delete()
    .in('deal_id', seededDealIds)
    .throwOnError();

  await admin
    .from('lender_room')
    .delete()
    .in('id', [openRoom, closedRoom])
    .throwOnError();

  await team.cleanup();
  await outsider.cleanup();
  await removeEverythingSeeded();
});

describe('editFaqEntry', () => {
  it('saves the new wording and hands back the version to save against next', async () => {
    const entryId = await createEntry('published');
    actAs(team);

    const first = await unwrap(
      editFaqEntry({
        entryId,
        question: 'What was 2025 EBITDA?',
        answer: '2.1M adjusted.',
        version: 1,
      }),
    );
    await unwrap(
      editFaqEntry({
        entryId,
        question: 'What was 2025 EBITDA?',
        answer: '2.2M adjusted.',
        version: first.version,
      }),
    );

    expect(await readEntry(entryId)).toMatchObject({
      question: 'What was 2025 EBITDA?',
      answer: '2.2M adjusted.',
    });
  });

  it('refuses a save made against an older version and keeps the newer wording', async () => {
    const entryId = await createEntry('published');
    actAs(team);

    await unwrap(
      editFaqEntry({ entryId, question: 'First', answer: 'Saved', version: 1 }),
    );

    expect(
      await editFaqEntry({
        entryId,
        question: 'Second',
        answer: 'Stale',
        version: 1,
      }),
    ).toEqual({
      ok: false,
      refusal: 'Someone else changed this entry. Reload to see their changes.',
    });
    expect(await readEntry(entryId)).toMatchObject({
      question: 'First',
      answer: 'Saved',
    });
  });

  it('refuses a blank question or answer and keeps the saved wording', async () => {
    const entryId = await createEntry('published');
    actAs(team);

    expect(
      await editFaqEntry({ entryId, question: '   ', answer: 'A', version: 1 }),
    ).toEqual({ ok: false, refusal: BOTH_REQUIRED });
    expect(
      await editFaqEntry({ entryId, question: 'Q', answer: '', version: 1 }),
    ).toEqual({ ok: false, refusal: BOTH_REQUIRED });
    expect(await readEntry(entryId)).toMatchObject({
      question: 'What is the EBITDA?',
      answer: 'About 2M.',
    });
  });

  it('refuses a question or answer over 5,000 characters', async () => {
    const entryId = await createEntry('published');
    actAs(team);

    expect(
      await editFaqEntry({
        entryId,
        question: 'Q',
        answer: 'x'.repeat(5001),
        version: 1,
      }),
    ).toEqual({ ok: false, refusal: TOO_LONG });
    expect((await readEntry(entryId)).answer).toBe('About 2M.');
  });

  it('refuses someone outside the deal team and leaves the entry alone', async () => {
    const entryId = await createEntry('published');
    actAs(outsider);

    expect(
      await editFaqEntry({ entryId, question: 'X', answer: 'Y', version: 1 }),
    ).toEqual({ ok: false, refusal: 'Only the deal team can do that' });
    expect(await readEntry(entryId)).toMatchObject({
      question: 'What is the EBITDA?',
    });
  });
});

describe('setFaqEntryStatus', () => {
  it('publishes a draft, unpublishes it, and republishes it under its first publish date', async () => {
    const entryId = await createEntry('draft');
    actAs(team);

    await unwrap(setFaqEntryStatus({ entryId, status: 'published' }));
    const firstPublishedAt = (await readEntry(entryId)).first_published_at;
    expect(await roomFaqIds(openRoom)).toContain(entryId);

    await unwrap(setFaqEntryStatus({ entryId, status: 'unpublished' }));
    expect(await roomFaqIds(openRoom)).not.toContain(entryId);

    await unwrap(setFaqEntryStatus({ entryId, status: 'published' }));
    expect(await readEntry(entryId)).toMatchObject({
      status: 'published',
      first_published_at: firstPublishedAt,
    });
    expect(await roomFaqIds(openRoom)).toContain(entryId);
  });

  it('never puts a published entry back to draft', async () => {
    const entryId = await createEntry('published');
    actAs(team);

    const result = await setFaqEntryStatus({
      entryId,
      status: 'draft' as 'published',
    });

    expect(result.ok).toBe(false);
    expect((await readEntry(entryId)).status).toBe('published');
  });

  it('refuses to unpublish a draft', async () => {
    const entryId = await createEntry('draft');
    actAs(team);

    expect(await setFaqEntryStatus({ entryId, status: 'unpublished' })).toEqual(
      {
        ok: false,
        refusal: 'Only a published entry can be unpublished',
      },
    );
    expect((await readEntry(entryId)).status).toBe('draft');
  });

  it('refuses someone outside the deal team', async () => {
    const entryId = await createEntry('published');
    actAs(outsider);

    expect(await setFaqEntryStatus({ entryId, status: 'unpublished' })).toEqual(
      { ok: false, refusal: 'Only the deal team can do that' },
    );
    expect((await readEntry(entryId)).status).toBe('published');
  });
});

describe('setFaqEntryPinned', () => {
  it('pins and unpins an entry without moving its version', async () => {
    const entryId = await createEntry('published');
    actAs(team);

    await unwrap(setFaqEntryPinned({ entryId, pinned: true }));
    expect(await readEntry(entryId)).toMatchObject({
      pinned: true,
      version: 1,
    });

    await unwrap(setFaqEntryPinned({ entryId, pinned: false }));
    expect((await readEntry(entryId)).pinned).toBe(false);
  });
});

describe('removeFaqFile', () => {
  it('takes the file and its stored copy off the entry, and refuses someone outside the deal team', async () => {
    const entryId = await createEntry('published');
    const storagePath = `deal/${dealId}/${crypto.randomUUID()}-ebitda.pptx`;
    await store(storagePath, 'ebitda bridge');
    await store(`${storagePath}.preview.pdf`, 'ebitda preview');
    await store(`${storagePath}.preview.jpg`, 'ebitda image preview');
    const { data: file } = await admin
      .from('lender_faq_file')
      .insert({
        entry_id: entryId,
        deal_id: dealId,
        name: 'ebitda.pptx',
        storage_path: storagePath,
        added_by: team.userId,
      })
      .select('id')
      .single()
      .throwOnError();

    actAs(outsider);
    expect(await removeFaqFile({ fileId: file.id })).toEqual({
      ok: false,
      refusal: DEAL_TEAM_ONLY,
    });
    expect(await storedText(storagePath)).toBe('ebitda bridge');

    actAs(team);
    await unwrap(removeFaqFile({ fileId: file.id }));

    expect(await faqFiles(entryId)).toEqual([]);
    expect(await storedText(storagePath)).toBeNull();
    expect(await storedText(`${storagePath}.preview.pdf`)).toBeNull();
    expect(await storedText(`${storagePath}.preview.jpg`)).toBeNull();
  });
});

describe('findSimilarFaqEntries', () => {
  it('finds draft entries of the deal sharing a word with the question', async () => {
    const entryId = await createEntry('draft');
    actAs(team);

    const found = await unwrap(
      findSimilarFaqEntries({ dealId, query: 'EBITDA margin' }),
    );

    expect(found).toContainEqual({
      id: entryId,
      question: 'What is the EBITDA?',
    });
  });
});

describe('refusing a locked team before touching files or rooms', () => {
  it('refuses removing a file and keeps it', async () => {
    const { entryId, dealId: lockedDeal } = await lockedTeamEntry('published');
    await admin
      .from('lender_faq_file')
      .insert({
        id: crypto.randomUUID(),
        entry_id: entryId,
        deal_id: lockedDeal,
        name: 'kept.pdf',
        storage_path: `deal/${lockedDeal}/kept.pdf`,
      })
      .throwOnError();
    const [file] = (
      await admin
        .from('lender_faq_file')
        .select('id')
        .eq('entry_id', entryId)
        .throwOnError()
    ).data;

    expect(await removeFaqFile({ fileId: file!.id })).toEqual({
      ok: false,
      refusal: READ_ONLY,
    });
    expect(await faqFiles(entryId)).toHaveLength(1);
  });

  it('refuses hiding and showing an entry in a room', async () => {
    const entry = await teamDealEntry('published');
    const { roomId } = await seedRoom(entry, 'Locked lender', []);
    await setTeamLocked(entry.accountId, true);

    expect(
      await hideFaqEntryForRoom({ roomId, entryId: entry.entryId }),
    ).toEqual({ ok: false, refusal: READ_ONLY });
    expect(
      await unhideFaqEntryForRoom({ roomId, entryId: entry.entryId }),
    ).toEqual({ ok: false, refusal: READ_ONLY });
  });

  it('refuses adding a finished upload and leaves it where it was staged', async () => {
    const entry = await teamDealEntry('published');
    const upload = await unwrap(
      beginFaqUpload({ entryId: entry.entryId, name: 'late.pdf', size: 4 }),
    );
    const { data: staged } = await admin
      .from('lender_faq_upload')
      .select('storage_path')
      .eq('id', upload.uploadId)
      .single()
      .throwOnError();
    await store(staged.storage_path, 'late');
    await setTeamLocked(entry.accountId, true);

    expect(await addUploadedFaqFile({ uploadId: upload.uploadId })).toEqual({
      ok: false,
      refusal: READ_ONLY,
    });
    expect(await storedText(staged.storage_path)).toBe('late');
    expect(await faqFiles(entry.entryId)).toEqual([]);
  });
});

describe('refusing a locked team before changing an entry', () => {
  it('refuses edits, status changes, and pins with the read-only wording', async () => {
    const { entryId } = await lockedTeamEntry('published');

    expect(
      await editFaqEntry({ entryId, question: 'Q', answer: 'A', version: 1 }),
    ).toEqual({ ok: false, refusal: READ_ONLY });
    expect(await setFaqEntryStatus({ entryId, status: 'unpublished' })).toEqual(
      { ok: false, refusal: READ_ONLY },
    );
    expect(await setFaqEntryPinned({ entryId, pinned: true })).toEqual({
      ok: false,
      refusal: READ_ONLY,
    });
    expect(await readEntry(entryId)).toMatchObject({
      question: 'What is the EBITDA?',
      status: 'published',
      pinned: false,
    });
  });
});

describe('addDataRoomFileToFaq', () => {
  it('refuses a lender room upload and a seller room upload, adding nothing', async () => {
    const entryId = await createEntry('published');
    const deal = { accountId: team.accountId, dealId };
    const nested = await seedFolder(deal, 'Their docs', roomFolders[0]!);
    const fenced = await Promise.all([
      seedStoredDocument(deal, 'lender.pdf', 'x', 'lender.pdf', roomFolders[0]),
      seedStoredDocument(deal, 'deep.pdf', 'x', 'deep.pdf', nested),
      seedStoredDocument(
        deal,
        'seller.pdf',
        'x',
        'seller.pdf',
        sellerUploadsFolder,
      ),
    ]);
    actAs(team);

    for (const { documentId } of fenced) {
      expect(await addDataRoomFileToFaq({ entryId, documentId })).toEqual({
        ok: false,
        refusal: NOT_A_TEAM_FILE,
      });
    }
    expect(await faqFiles(entryId)).toEqual([]);
  });

  it('refuses a document removed from the data room', async () => {
    const entryId = await createEntry('published');
    const source = await seedStoredDocument(
      { accountId: team.accountId, dealId },
      'gone.pdf',
      'gone bytes',
    );
    await admin
      .rpc('append_deal_event', {
        p_deal_id: dealId,
        p_aggregate_type: 'dr_document',
        p_aggregate_id: source.documentId,
        p_event_type: 'dr_document.removed',
        p_actor_kind: 'service',
      })
      .throwOnError();
    actAs(team);

    expect(
      await addDataRoomFileToFaq({ entryId, documentId: source.documentId }),
    ).toEqual({ ok: false, refusal: NOT_THIS_DEAL });
    expect(await faqFiles(entryId)).toEqual([]);
  });

  it('copies a data-room document of the deal onto the entry under a fresh key', async () => {
    const entryId = await createEntry('published');
    const source = await seedStoredDocument(
      { accountId: team.accountId, dealId },
      'model.xlsx',
      'model bytes',
    );
    actAs(team);

    await unwrap(
      addDataRoomFileToFaq({ entryId, documentId: source.documentId }),
    );

    const [added, ...others] = await faqFiles(entryId);
    expect(others).toEqual([]);
    expect(added).toMatchObject({
      name: 'model.xlsx',
      source_dr_document_id: source.documentId,
    });
    expect(added!.storage_path).not.toBe(source.storagePath);
    expect(await storedText(added!.storage_path)).toBe('model bytes');
  });

  it('keys the copy by the stored file, so a renamed document still previews', async () => {
    const entryId = await createEntry('published');
    const source = await seedStoredDocument(
      { accountId: team.accountId, dealId },
      'Site photo',
      'photo bytes',
      'site.heic',
    );
    await store(`${source.storagePath}.preview.jpg`, 'photo preview');
    actAs(team);

    await unwrap(
      addDataRoomFileToFaq({ entryId, documentId: source.documentId }),
    );

    const [added] = await faqFiles(entryId);
    expect(added!.name).toBe('Site photo');
    expect(added!.storage_path).toMatch(/\.heic$/);
    expect(await storedText(`${added!.storage_path}.preview.jpg`)).toBe(
      'photo preview',
    );
  });

  it('tells a locked team it is read-only and adds nothing', async () => {
    const { entryId, documentId } = await lockedTeamEntry('published');

    expect(await addDataRoomFileToFaq({ entryId, documentId })).toEqual({
      ok: false,
      refusal: READ_ONLY,
    });
    expect(await faqFiles(entryId)).toEqual([]);
  });

  it("refuses a document from another deal's data room", async () => {
    const entryId = await createEntry('published');
    const foreign = await seedStoredDocument(
      { accountId: outsider.accountId, dealId: outsiderDealId },
      'theirs.pdf',
      'not yours',
    );
    actAs(team);

    expect(
      await addDataRoomFileToFaq({ entryId, documentId: foreign.documentId }),
    ).toEqual({ ok: false, refusal: NOT_THIS_DEAL });
    expect(await faqFiles(entryId)).toEqual([]);
  });

  it('refuses a document that has been removed from the data room', async () => {
    const entryId = await createEntry('published');
    const removed = await seedStoredDocument(
      { accountId: team.accountId, dealId },
      'old.pdf',
      'gone',
    );
    await admin
      .rpc('append_deal_event', {
        p_deal_id: dealId,
        p_aggregate_type: 'dr_document',
        p_aggregate_id: removed.documentId,
        p_event_type: 'dr_document.removed',
        p_actor_kind: 'service',
      })
      .throwOnError();
    actAs(team);

    expect(
      await addDataRoomFileToFaq({ entryId, documentId: removed.documentId }),
    ).toEqual({ ok: false, refusal: NOT_THIS_DEAL });
  });
});

describe('beginFaqUpload and addUploadedFaqFile', () => {
  it('adds a fresh upload to the entry under a fresh key', async () => {
    const entryId = await createEntry('published');
    actAs(team);

    const upload = await unwrap(
      beginFaqUpload({ entryId, name: 'rent roll.pdf', size: 9 }),
    );
    const uploaded = await team.user.storage
      .from(DATA_ROOM_BUCKET)
      .uploadToSignedUrl(
        upload.path,
        upload.token,
        new TextEncoder().encode('rent roll'),
      );
    expect(uploaded.error).toBeNull();
    await unwrap(addUploadedFaqFile({ uploadId: upload.uploadId }));

    const [added, ...others] = await faqFiles(entryId);
    expect(others).toEqual([]);
    expect(added).toMatchObject({
      name: 'rent roll.pdf',
      source_dr_document_id: null,
    });
    expect(added!.storage_path).not.toBe(upload.path);
    expect(await storedText(added!.storage_path)).toBe('rent roll');
    expect(await storedText(upload.path)).toBeNull();
  });

  it('accepts a repeat of a finished add and keeps one file', async () => {
    const entryId = await createEntry('published');
    actAs(team);
    const upload = await uploadFresh(
      entryId,
      'notes.pdf',
      new TextEncoder().encode('notes'),
    );
    const add = { uploadId: upload.uploadId };

    const first = await unwrap(addUploadedFaqFile(add));

    expect(await addUploadedFaqFile(add)).toEqual({ ok: true, value: first });
    expect(await faqFiles(entryId)).toHaveLength(1);
  });

  it('refuses to add an upload someone else was issued', async () => {
    const entryId = await createEntry('published');
    actAs(team);
    const upload = await uploadFresh(
      entryId,
      'mine.pdf',
      new TextEncoder().encode('mine'),
    );
    actAs(outsider);

    expect(await addUploadedFaqFile({ uploadId: upload.uploadId })).toEqual({
      ok: false,
      refusal: 'That upload was not found',
    });
    expect(await faqFiles(entryId)).toEqual([]);
  });

  it('finishes an add that failed after its file was moved', async () => {
    const { accountId, entryId } = await teamDealEntry('published');
    const upload = await uploadFresh(
      entryId,
      'lease.pdf',
      new TextEncoder().encode('lease'),
    );
    await setTeamLocked(accountId, true);

    expect(await addUploadedFaqFile({ uploadId: upload.uploadId })).toEqual({
      ok: false,
      refusal: READ_ONLY,
    });

    await setTeamLocked(accountId, false);
    await unwrap(addUploadedFaqFile({ uploadId: upload.uploadId }));

    const [added, ...others] = await faqFiles(entryId);
    expect(others).toEqual([]);
    expect(await storedText(added!.storage_path)).toBe('lease');
  });

  it('makes the preview rendition of a fresh HEIC upload', async () => {
    const entryId = await createEntry('published');
    actAs(team);
    const upload = await uploadFresh(entryId, 'site.heic', HEIC_SAMPLE);

    await unwrap(addUploadedFaqFile({ uploadId: upload.uploadId }));

    const [added] = await faqFiles(entryId);
    expect(await storedExists(`${added!.storage_path}.preview.jpg`)).toBe(true);
  });

  it('still adds a fresh upload whose preview cannot be made, as download only', async () => {
    const entryId = await createEntry('published');
    actAs(team);
    const upload = await uploadFresh(
      entryId,
      'broken.heic',
      new TextEncoder().encode('not an image'),
    );

    await unwrap(addUploadedFaqFile({ uploadId: upload.uploadId }));

    const [added] = await faqFiles(entryId);
    expect(await storedText(added!.storage_path)).toBe('not an image');
    expect(await storedExists(`${added!.storage_path}.preview.jpg`)).toBe(
      false,
    );
  });

  it('tells a locked team it is read-only before issuing an upload', async () => {
    const { entryId } = await lockedTeamEntry('published');

    expect(await beginFaqUpload({ entryId, name: 'x.pdf', size: 10 })).toEqual({
      ok: false,
      refusal: READ_ONLY,
    });
  });

  it('refuses a video file', async () => {
    const entryId = await createEntry('published');
    actAs(team);

    expect(
      await beginFaqUpload({ entryId, name: 'tour.mp4', size: 10 }),
    ).toEqual({
      ok: false,
      refusal:
        'tour.mp4 cannot be uploaded: video and audio files are not allowed',
    });
  });

  it('refuses someone outside the deal team', async () => {
    const entryId = await createEntry('published');
    actAs(outsider);

    expect(await beginFaqUpload({ entryId, name: 'x.pdf', size: 10 })).toEqual({
      ok: false,
      refusal: DEAL_TEAM_ONLY,
    });
  });
});

describe('deleteFaqDraft', () => {
  it('deletes a never-published draft and the stored copies of its files', async () => {
    const entryId = await createEntry('draft');
    const storagePath = `deal/${dealId}/${crypto.randomUUID()}-draft.pdf`;
    await store(storagePath, 'draft file');
    await admin
      .from('lender_faq_file')
      .insert({
        entry_id: entryId,
        deal_id: dealId,
        name: 'draft.pdf',
        storage_path: storagePath,
        added_by: team.userId,
      })
      .throwOnError();
    actAs(team);

    await unwrap(deleteFaqDraft({ entryId }));

    const { data: entry } = await admin
      .from('lender_faq_entry')
      .select('id')
      .eq('id', entryId)
      .maybeSingle()
      .throwOnError();
    expect(entry).toBeNull();
    expect(await storedText(storagePath)).toBeNull();
  });

  it('deletes a draft with no files without touching storage', async () => {
    const entryId = await createEntry('draft');
    actAs(team);
    loggedErrors.length = 0;

    await unwrap(deleteFaqDraft({ entryId }));

    expect(loggedErrors).toEqual([]);
  });

  it('removes the staging objects of uploads never added', async () => {
    const entryId = await createEntry('draft');
    actAs(team);
    const upload = await unwrap(
      beginFaqUpload({ entryId, name: 'staged.pdf', size: 6 }),
    );
    const { data: staged } = await admin
      .from('lender_faq_upload')
      .select('storage_path')
      .eq('id', upload.uploadId)
      .single()
      .throwOnError();
    await store(staged.storage_path, 'staged');

    await unwrap(deleteFaqDraft({ entryId }));

    expect(await storedText(staged.storage_path)).toBeNull();
  });

  it('still deletes the draft and logs when removing its stored files fails', async () => {
    const entryId = await createEntry('draft');
    await admin
      .from('lender_faq_file')
      .insert({
        entry_id: entryId,
        deal_id: dealId,
        name: 'stuck.pdf',
        storage_path: `deal/${dealId}/${crypto.randomUUID()}-stuck.pdf`,
      })
      .throwOnError();
    actAs(team);
    mockedClients.serviceRole = new Proxy(admin, {
      get: (target, key) =>
        key === 'storage'
          ? {
              from: () => ({
                remove: async () => ({ error: new Error('storage down') }),
              }),
            }
          : Reflect.get(target, key),
    });

    try {
      await unwrap(deleteFaqDraft({ entryId }));
    } finally {
      mockedClients.serviceRole = admin;
    }

    const { data: entry } = await admin
      .from('lender_faq_entry')
      .select('id')
      .eq('id', entryId)
      .maybeSingle()
      .throwOnError();
    expect(entry).toBeNull();
    expect(loggedErrors).toContain(
      'FAQ draft deleted but its stored files were not removed',
    );
  });

  it('refuses to delete an entry that has been published', async () => {
    const published = await createEntry('published');
    const unpublished = await createEntry('published');
    await admin
      .from('lender_faq_entry')
      .update({ status: 'unpublished' })
      .eq('id', unpublished)
      .throwOnError();
    actAs(team);

    for (const entryId of [published, unpublished]) {
      expect(await deleteFaqDraft({ entryId })).toEqual({
        ok: false,
        refusal: 'Only a draft that was never published can be deleted',
      });
      expect(await readEntry(entryId)).toBeTruthy();
    }
  });

  it('refuses someone outside the deal team', async () => {
    const entryId = await createEntry('draft');
    actAs(outsider);

    expect(await deleteFaqDraft({ entryId })).toEqual({
      ok: false,
      refusal: DEAL_TEAM_ONLY,
    });
    expect((await readEntry(entryId)).status).toBe('draft');
  });

  it('tells a locked team it is read-only and keeps the draft', async () => {
    const { entryId } = await lockedTeamEntry('draft');

    expect(await deleteFaqDraft({ entryId })).toEqual({
      ok: false,
      refusal: READ_ONLY,
    });
    expect((await readEntry(entryId)).status).toBe('draft');
  });
});

describe('hideFaqEntryForRoom and unhideFaqEntryForRoom', () => {
  it('withholds an entry from one room only, then shows it again', async () => {
    const entryId = await createEntry('published');
    actAs(team);

    await unwrap(hideFaqEntryForRoom({ roomId: openRoom, entryId }));
    await unwrap(hideFaqEntryForRoom({ roomId: openRoom, entryId }));
    expect(await roomFaqIds(openRoom)).not.toContain(entryId);
    expect(await roomFaqIds(closedRoom)).toContain(entryId);

    await unwrap(unhideFaqEntryForRoom({ roomId: openRoom, entryId }));
    expect(await roomFaqIds(openRoom)).toContain(entryId);
  });

  it('hides and unhides on a closed room', async () => {
    const entryId = await createEntry('published');
    actAs(team);

    await unwrap(hideFaqEntryForRoom({ roomId: closedRoom, entryId }));
    expect(await roomFaqIds(closedRoom)).not.toContain(entryId);

    await unwrap(unhideFaqEntryForRoom({ roomId: closedRoom, entryId }));
    expect(await roomFaqIds(closedRoom)).toContain(entryId);
  });

  it('refuses someone outside the deal team', async () => {
    const entryId = await createEntry('published');
    actAs(outsider);

    expect(await hideFaqEntryForRoom({ roomId: openRoom, entryId })).toEqual({
      ok: false,
      refusal: 'Only the deal team can do that',
    });
    expect(await roomFaqIds(openRoom)).toContain(entryId);
  });
});
