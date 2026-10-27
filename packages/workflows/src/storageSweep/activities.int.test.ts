import { createClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '../../test-support/integration-harness';

import { deleteOrphanedDealObjects } from './activities';

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const HOUR = 3_600_000;

type Bucket = 'data-room' | 'meeting-recordings';

interface StoredObject {
  bucket: Bucket;
  path: string;
}

let ownerId: string;
let teamId: string;
let dealId: string;
const staged: StoredObject[] = [];

async function store(bucket: Bucket, path: string, ageHours: number): Promise<StoredObject> {
  const uploaded = await admin.storage
    .from(bucket)
    .upload(path, new TextEncoder().encode('%PDF-1.4'), { contentType: 'application/pdf' });

  if (uploaded.error) {
    throw uploaded.error;
  }

  await admin
    .schema('storage')
    .from('objects')
    .update({ created_at: new Date(Date.now() - ageHours * HOUR).toISOString() })
    .eq('bucket_id', bucket)
    .eq('name', path)
    .throwOnError();

  const object = { bucket, path };
  staged.push(object);

  return object;
}

async function exists(object: StoredObject): Promise<boolean> {
  const { data } = await admin.storage.from(object.bucket).exists(object.path);

  return data;
}

beforeAll(async () => {
  const unique = crypto.randomUUID().slice(0, 8);
  const { data: created, error } = await admin.auth.admin.createUser({
    email: `int-sweep-${unique}@odb.test`,
    password: `Pw-${unique}-Aa1!`,
    email_confirm: true,
  });

  if (error) {
    throw error;
  }

  ownerId = created.user.id;

  const { data: team } = await admin
    .rpc('create_team_account', {
      account_name: `Sweep ${unique}`,
      user_id: ownerId,
      account_slug: `sweep-${unique}`,
    })
    .throwOnError();
  teamId = team.id;

  dealId = crypto.randomUUID();
  const { data: firm } = await admin
    .from('firm')
    .insert({ account_id: teamId, name: 'Sweep deal' })
    .select('id')
    .single()
    .throwOnError();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.created',
      p_payload: {
        account_id: teamId,
        owner_user_id: ownerId,
        firm_id: firm.id,
        description: 'Sweep deal',
      },
      p_actor_kind: 'service',
    })
    .throwOnError();
}, 60_000);

afterAll(async () => {
  for (const object of staged) {
    await admin.storage.from(object.bucket).remove([object.path]);
  }
  await admin.from('accounts').delete().eq('id', teamId).throwOnError();
  await admin.auth.admin.deleteUser(ownerId);
});

describe('deleteOrphanedDealObjects', () => {
  it('deletes a data room object over 24 hours old whose deal does not exist', async () => {
    const orphan = await store('data-room', `deal/${crypto.randomUUID()}/${crypto.randomUUID()}-cim.pdf`, 25);

    await deleteOrphanedDealObjects();

    expect(await exists(orphan)).toBe(false);
  });

  it('deletes a nested meeting recording over 24 hours old whose deal does not exist', async () => {
    const orphan = await store(
      'meeting-recordings',
      `deal/${crypto.randomUUID()}/${crypto.randomUUID()}/recording.pdf`,
      25,
    );

    await deleteOrphanedDealObjects();

    expect(await exists(orphan)).toBe(false);
  });

  it.each<Bucket>(['data-room', 'meeting-recordings'])(
    'keeps a %s object over 24 hours old whose deal exists',
    async (bucket) => {
      const owned = await store(bucket, `deal/${dealId}/${crypto.randomUUID()}/kept.pdf`, 72);

      await deleteOrphanedDealObjects();

      expect(await exists(owned)).toBe(true);
    },
  );

  it('keeps an object under 24 hours old whose deal does not exist yet', async () => {
    const fresh = await store('data-room', `deal/${crypto.randomUUID()}/${crypto.randomUUID()}-fresh.pdf`, 23);

    await deleteOrphanedDealObjects();

    expect(await exists(fresh)).toBe(true);
  });
});
