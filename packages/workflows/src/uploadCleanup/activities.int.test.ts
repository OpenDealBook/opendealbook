import { createClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@odb/supabase';

import '../../test-support/integration-harness';
import { deleteUnfinishedUploads } from './activities';

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const BUCKET = 'data-room';
const HOUR = 3_600_000;

type Ledger = 'lender_upload' | 'lender_faq_upload' | 'seller_upload';

const LEDGERS: Ledger[] = [
  'lender_upload',
  'lender_faq_upload',
  'seller_upload',
];

interface Upload {
  ledger: Ledger;
  id: string;
  storagePath: string;
}

let ownerId: string;
let teamId: string;
let dealId: string;
let folderId: string;
let entryId: string;
let sellerRoomId: string;

async function stage(
  ledger: Ledger,
  {
    ageHours,
    registered = false,
    stored = true,
  }: { ageHours: number; registered?: boolean; stored?: boolean },
): Promise<Upload> {
  const id = crypto.randomUUID();
  const storagePath = `deal/${dealId}/cleanup-test/${id}.pdf`;
  const at = new Date(Date.now() - ageHours * HOUR).toISOString();
  const common = {
    id,
    deal_id: dealId,
    name: 'staged.pdf',
    storage_path: storagePath,
    uploaded_by: ownerId,
    created_at: at,
    registered_at: registered ? at : null,
  };

  if (stored) {
    await admin.storage
      .from(BUCKET)
      .upload(storagePath, new TextEncoder().encode('%PDF-1.4'), {
        contentType: 'application/pdf',
      })
      .then(({ error }) => {
        if (error) throw error;
      });
  }

  if (ledger === 'lender_upload') {
    await admin
      .from('lender_upload')
      .insert({ ...common, folder_id: folderId })
      .throwOnError();
  } else if (ledger === 'lender_faq_upload') {
    await admin
      .from('lender_faq_upload')
      .insert({ ...common, entry_id: entryId })
      .throwOnError();
  } else {
    await admin
      .from('seller_upload')
      .insert({ ...common, room_id: sellerRoomId, folder_id: folderId })
      .throwOnError();
  }

  return { ledger, id, storagePath };
}

async function rowExists(upload: Upload): Promise<boolean> {
  const { data } = await admin
    .from(upload.ledger)
    .select('id')
    .eq('id', upload.id)
    .throwOnError();

  return data.length === 1;
}

async function objectExists(upload: Upload): Promise<boolean> {
  const { data } = await admin.storage.from(BUCKET).exists(upload.storagePath);

  return data;
}

async function lockTeam(): Promise<() => Promise<void>> {
  const { data: config } = await admin
    .from('config')
    .select('enable_team_account_billing')
    .single()
    .throwOnError();

  await admin.rpc('set_team_account_billing', { enabled: true }).throwOnError();
  await admin
    .from('accounts')
    .update({ trial_ends_at: new Date(Date.now() - 24 * HOUR).toISOString() })
    .eq('id', teamId)
    .throwOnError();

  const { data: locked } = await admin
    .rpc('is_account_locked', { target_account_id: teamId })
    .throwOnError();
  expect(locked).toBe(true);

  return async () => {
    await admin
      .from('accounts')
      .update({ trial_ends_at: new Date(Date.now() + 24 * HOUR).toISOString() })
      .eq('id', teamId)
      .throwOnError();
    await admin
      .rpc('set_team_account_billing', {
        enabled: config.enable_team_account_billing,
      })
      .throwOnError();
  };
}

beforeAll(async () => {
  const unique = crypto.randomUUID().slice(0, 8);
  const { data: created, error } = await admin.auth.admin.createUser({
    email: `int-cleanup-${unique}@odb.test`,
    password: `Pw-${unique}-Aa1!`,
    email_confirm: true,
  });

  if (error) {
    throw error;
  }

  ownerId = created.user.id;

  const { data: team } = await admin
    .rpc('create_team_account', {
      account_name: `Cleanup ${unique}`,
      user_id: ownerId,
      account_slug: `cleanup-${unique}`,
    })
    .throwOnError();
  teamId = team.id;

  dealId = crypto.randomUUID();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.created',
      p_payload: {
        account_id: teamId,
        owner_user_id: ownerId,
        description: 'Cleanup deal',
      },
      p_actor_kind: 'service',
    })
    .throwOnError();

  const { data: folder } = await admin
    .from('dr_folder')
    .insert({ account_id: teamId, deal_id: dealId, name: 'Uploads' })
    .select('id')
    .single()
    .throwOnError();
  folderId = folder.id;

  const { data: entry } = await admin
    .from('lender_faq_entry')
    .insert({
      account_id: teamId,
      deal_id: dealId,
      question: 'Q?',
      answer: 'A.',
    })
    .select('id')
    .single()
    .throwOnError();
  entryId = entry.id;

  const { data: room } = await admin
    .from('seller_room')
    .insert({
      account_id: teamId,
      deal_id: dealId,
      uploads_folder_id: folderId,
    })
    .select('id')
    .single()
    .throwOnError();
  sellerRoomId = room.id;
}, 60_000);

afterAll(async () => {
  await admin.storage
    .from(BUCKET)
    .list(`deal/${dealId}/cleanup-test`)
    .then(({ data }) =>
      data && data.length > 0
        ? admin.storage
            .from(BUCKET)
            .remove(
              data.map((file) => `deal/${dealId}/cleanup-test/${file.name}`),
            )
        : null,
    );
  await admin.from('accounts').delete().eq('id', teamId).throwOnError();
  await admin.auth.admin.deleteUser(ownerId);
});

describe('deleteUnfinishedUploads', () => {
  it.each(LEDGERS)(
    'deletes the object and row of a %s issued over 24 hours ago and never registered',
    async (ledger) => {
      const stale = await stage(ledger, { ageHours: 25 });

      await deleteUnfinishedUploads();

      expect(await objectExists(stale)).toBe(false);
      expect(await rowExists(stale)).toBe(false);
    },
  );

  it.each(LEDGERS)('keeps a %s issued under 24 hours ago', async (ledger) => {
    const fresh = await stage(ledger, { ageHours: 23 });

    await deleteUnfinishedUploads();

    expect(await objectExists(fresh)).toBe(true);
    expect(await rowExists(fresh)).toBe(true);
  });

  it.each(LEDGERS)('keeps a registered %s however old', async (ledger) => {
    const registered = await stage(ledger, { ageHours: 72, registered: true });

    await deleteUnfinishedUploads();

    expect(await objectExists(registered)).toBe(true);
    expect(await rowExists(registered)).toBe(true);
  });

  it.each(LEDGERS)(
    'deletes the row of a stale %s whose object is already gone',
    async (ledger) => {
      const halfDeleted = await stage(ledger, { ageHours: 25, stored: false });

      await deleteUnfinishedUploads();

      expect(await rowExists(halfDeleted)).toBe(false);
    },
  );

  it.each(LEDGERS)(
    'deletes the row but keeps the object of a stale %s whose path a data room document uses',
    async (ledger) => {
      const crashed = await stage(ledger, { ageHours: 25 });
      await admin
        .rpc('append_deal_event', {
          p_deal_id: dealId,
          p_aggregate_type: 'dr_document',
          p_aggregate_id: crypto.randomUUID(),
          p_event_type: 'dr_document.added',
          p_payload: {
            folder_id: folderId,
            name: 'staged.pdf',
            storage_path: crashed.storagePath,
            version: 1,
          },
          p_actor_kind: 'service',
        })
        .throwOnError();

      await deleteUnfinishedUploads();

      expect(await objectExists(crashed)).toBe(true);
      expect(await rowExists(crashed)).toBe(false);
    },
  );

  it.each(LEDGERS)(
    'deletes the row but keeps the object of a stale %s whose path an FAQ file uses',
    async (ledger) => {
      const crashed = await stage(ledger, { ageHours: 25 });
      await admin
        .from('lender_faq_file')
        .insert({
          entry_id: entryId,
          deal_id: dealId,
          name: 'staged.pdf',
          storage_path: crashed.storagePath,
        })
        .throwOnError();

      await deleteUnfinishedUploads();

      expect(await objectExists(crashed)).toBe(true);
      expect(await rowExists(crashed)).toBe(false);
    },
  );

  it('deletes a backlog of a thousand stale rows in one run', async () => {
    const at = new Date(Date.now() - 25 * HOUR).toISOString();
    const backlog = Array.from({ length: 1000 }, () => {
      const id = crypto.randomUUID();

      return {
        id,
        deal_id: dealId,
        folder_id: folderId,
        name: 'staged.pdf',
        storage_path: `deal/${dealId}/cleanup-test/backlog/${id}-a-reasonably-long-original-file-name.pdf`,
        uploaded_by: ownerId,
        created_at: at,
      };
    });
    await admin.from('lender_upload').insert(backlog).throwOnError();

    await deleteUnfinishedUploads();

    const { count } = await admin
      .from('lender_upload')
      .select('id', { count: 'exact', head: true })
      .in(
        'id',
        backlog.slice(0, 200).map((row) => row.id),
      )
      .throwOnError();
    expect(count).toBe(0);
  });

  it('cleans up for a team that is locked', async () => {
    const unlock = await lockTeam();

    try {
      const stale = await Promise.all(
        LEDGERS.map((ledger) => stage(ledger, { ageHours: 25 })),
      );

      await deleteUnfinishedUploads();

      for (const upload of stale) {
        expect(await objectExists(upload)).toBe(false);
        expect(await rowExists(upload)).toBe(false);
      }
    } finally {
      await unlock();
    }
  });
});

describe('deleteUnfinishedUploads in the seller and counsel thread', () => {
  const THREAD_BUCKET = 'seller-counsel-thread';
  const storageAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: 'storage' },
    },
  );

  async function storeThreadFile(ageHours: number): Promise<string> {
    const path = `${dealId}/${crypto.randomUUID()}/note.pdf`;
    const uploaded = await admin.storage
      .from(THREAD_BUCKET)
      .upload(path, new TextEncoder().encode('%PDF-1.4'), {
        contentType: 'application/pdf',
      });

    if (uploaded.error) {
      throw uploaded.error;
    }

    await storageAdmin
      .from('objects')
      .update({
        created_at: new Date(Date.now() - ageHours * HOUR).toISOString(),
      })
      .eq('bucket_id', THREAD_BUCKET)
      .eq('name', path)
      .throwOnError();

    return path;
  }

  async function threadFileExists(path: string): Promise<boolean> {
    const { data } = await admin.storage.from(THREAD_BUCKET).exists(path);

    return data;
  }

  it('deletes a thread file uploaded over 24 hours ago that no message holds, and keeps the rest', async () => {
    const abandoned = await storeThreadFile(25);
    const recent = await storeThreadFile(1);
    const posted = await storeThreadFile(25);
    const { data: message } = await admin
      .from('seller_counsel_message')
      .insert({
        account_id: teamId,
        deal_id: dealId,
        author_user_id: ownerId,
        author_side: 'seller',
        author_name: 'Walt Brennan',
        body: '',
      })
      .select('id')
      .single()
      .throwOnError();
    await admin
      .from('seller_counsel_message_file')
      .insert({
        account_id: teamId,
        deal_id: dealId,
        message_id: message.id,
        name: 'note.pdf',
        storage_path: posted,
      })
      .throwOnError();

    await deleteUnfinishedUploads();

    expect({
      abandoned: await threadFileExists(abandoned),
      recent: await threadFileExists(recent),
      posted: await threadFileExists(posted),
    }).toEqual({ abandoned: false, recent: true, posted: true });

    await admin.storage.from(THREAD_BUCKET).remove([recent, posted]);
  });

  it('runs again without failing once the abandoned file is gone', async () => {
    const abandoned = await storeThreadFile(25);

    await deleteUnfinishedUploads();
    await deleteUnfinishedUploads();

    expect(await threadFileExists(abandoned)).toBe(false);
  });
});
