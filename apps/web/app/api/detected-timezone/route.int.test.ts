import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  admin,
  ANON_KEY,
  cleanUp,
  provisionPerson,
  type Person,
  SUPABASE_URL,
} from '@odb/seller-rooms/test-support/world.ts';

const world = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
}));

vi.mock('@odb/supabase/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/supabase/server')>()),
  getSupabaseServerClient: () => world.client,
}));

import { POST } from './route';

let person: Person;

async function personalZone() {
  const { data } = await admin
    .from('accounts')
    .select('timezone')
    .eq('primary_owner_user_id', person.userId)
    .eq('is_personal_account', true)
    .single()
    .throwOnError();

  return data.timezone;
}

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/detected-timezone', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

function offer(timezone: string) {
  return post({ timezone });
}

describe('POST /api/detected-timezone', () => {
  beforeEach(async () => {
    person = await provisionPerson();
    world.client = person.client;
  });

  afterAll(() => cleanUp([]));

  it("stores the browser's zone when the person has none", async () => {
    await offer('Pacific/Auckland');

    expect(await personalZone()).toBe('Pacific/Auckland');
  });

  it('keeps a zone the person already has', async () => {
    await admin
      .from('accounts')
      .update({ timezone: 'Europe/Lisbon' })
      .eq('primary_owner_user_id', person.userId)
      .eq('is_personal_account', true)
      .throwOnError();

    await offer('Pacific/Auckland');

    expect(await personalZone()).toBe('Europe/Lisbon');
  });

  it('remembers in a cookie that the zone is unsupported', async () => {
    const response = await offer('Mars/Olympus_Mons');

    expect(await personalZone()).toBeNull();
    expect(response.headers.get('set-cookie')).toContain(
      `unsupported_timezone=${encodeURIComponent('Mars/Olympus_Mons')}`,
    );
  });

  it('refuses a signed-out request', async () => {
    world.client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const response = await offer('Pacific/Auckland');

    expect(response.status).toBe(401);
  });

  it.each([{ timezone: '' }, {}, { timezone: 5 }])(
    'refuses %j without remembering it',
    async (body) => {
      const response = await post(body);

      expect(response.status).toBe(400);
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(await personalZone()).toBeNull();
    },
  );
});
