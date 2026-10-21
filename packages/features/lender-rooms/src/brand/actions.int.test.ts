import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';

import { unwrap } from '../actions/test-support/unwrap';
import { fakeSite, html, PNG, png, pngOfSize } from './test-support/fake-site';

const signedIn = vi.hoisted(() => ({
  client: null as unknown,
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => signedIn.client,
}));

import { lookupLenderBrand, setManualLenderLogo } from './actions';
import { brandLogoUrl } from './logo-url';
import { lookupBrand } from './lookup-brand';

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
process.env.SUPABASE_SERVICE_ROLE_KEY ??=
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
};

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  clientOptions,
);

interface Person {
  client: SupabaseClient<Database>;
  userId: string;
  accountId: string;
}

const OTHER_PNG = pngOfSize(64);

const people: Person[] = [];
const domains: string[] = [];
const roomIds: string[] = [];

let owner: Person;
let outsider: Person;
let lender: Person;
let lenderRoomId: string;
let dealId: string;

function newDomain(): string {
  const domain = `manual-${crypto.randomUUID().slice(0, 8)}.test`;
  domains.push(domain);

  return domain;
}

function logoFile(bytes: Uint8Array<ArrayBuffer> = PNG): File {
  return new File([bytes], 'logo.png', { type: 'image/png' });
}

async function provisionPerson(): Promise<Person> {
  const unique = crypto.randomUUID().slice(0, 8);
  const email = `int-${unique}@odb.test`;
  const password = `Pw-${unique}-Aa1!`;

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    throw error;
  }

  const { data: account } = await admin
    .rpc('create_team_account', {
      account_name: `Int ${crypto.randomUUID().slice(0, 8)}`,
      user_id: created.user.id,
    })
    .throwOnError();

  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    clientOptions,
  );
  const signedIn = await client.auth.signInWithPassword({ email, password });

  if (signedIn.error) {
    throw signedIn.error;
  }

  const person = { client, userId: created.user.id, accountId: account.id };
  people.push(person);

  return person;
}

async function newDeal(person: Person): Promise<string> {
  const id = crypto.randomUUID();

  await admin
    .rpc('append_deal_event', {
      p_deal_id: id,
      p_aggregate_type: 'deal',
      p_aggregate_id: id,
      p_event_type: 'deal.created',
      p_payload: {
        account_id: person.accountId,
        owner_user_id: person.userId,
        description: 'Manual logo deal',
      },
      p_actor_kind: 'service',
    })
    .throwOnError();

  return id;
}

async function newRoom({
  person = owner,
  roomDealId = dealId,
  website = null,
}: {
  person?: Person;
  roomDealId?: string;
  website?: string | null;
} = {}): Promise<string> {
  const { data: folder } = await admin
    .from('dr_folder')
    .insert({ account_id: person.accountId, deal_id: roomDealId, name: 'Room' })
    .select('id')
    .single()
    .throwOnError();

  const { data: room } = await admin
    .from('lender_room')
    .insert({
      account_id: person.accountId,
      deal_id: roomDealId,
      name: 'First Bank',
      brand_domain: website,
      private_folder_id: folder.id,
    })
    .select('id')
    .single()
    .throwOnError();

  roomIds.push(room.id);

  return room.id;
}

async function readBrand(domain: string) {
  const { data } = await admin
    .from('lender_brand')
    .select('name, logo_path')
    .eq('domain', domain)
    .maybeSingle()
    .throwOnError();

  return data;
}

async function readRoomBrandDomain(roomId: string) {
  const { data } = await admin
    .from('lender_room')
    .select('brand_domain')
    .eq('id', roomId)
    .single()
    .throwOnError();

  return data.brand_domain;
}

async function listStoredLogos(domain: string) {
  const { data } = await admin.storage.from('lender-brand').list(domain);

  return data;
}

async function readStoredLogo(domain: string): Promise<Buffer> {
  const { data, error } = await admin.storage
    .from('lender-brand')
    .download(`${domain}/logo`);

  if (error) {
    throw error;
  }

  return Buffer.from(await data.arrayBuffer());
}

beforeAll(async () => {
  owner = await provisionPerson();
  outsider = await provisionPerson();
  lender = await provisionPerson();
  dealId = await newDeal(owner);
  lenderRoomId = await newRoom();

  await admin
    .from('lender_room_member')
    .insert({
      room_id: lenderRoomId,
      user_id: lender.userId,
      email: 'lender@odb.test',
      invited_by: owner.userId,
    })
    .throwOnError();
});

afterAll(async () => {
  await admin.from('lender_room').delete().in('id', roomIds).throwOnError();
  await admin.storage
    .from('lender-brand')
    .remove(domains.map((domain) => `${domain}/logo`));
  await admin
    .from('lender_brand')
    .delete()
    .in('domain', domains)
    .throwOnError();

  for (const person of people) {
    await admin.auth.admin.deleteUser(person.userId);
  }
});

async function lookUp(domain: string, page: string | null) {
  return lookupBrand(
    domain,
    page === null
      ? fakeSite({}, [domain])
      : fakeSite({ [`https://${domain}/`]: html(page) }),
  );
}

async function roomWithWebsite(page: string | null) {
  const domain = newDomain();

  await lookUp(domain, page);

  return { domain, roomId: await newRoom({ website: domain }) };
}

describe('setManualLenderLogo after a lookup that found a name but no logo (integration)', () => {
  let domain: string;
  let roomId: string;

  beforeAll(async () => {
    ({ domain, roomId } = await roomWithWebsite(
      '<title>Iconless Bank</title>',
    ));
    signedIn.client = owner.client;

    await unwrap(setManualLenderLogo({ dealId, roomId, file: logoFile() }));
  });

  it('caches the logo path and leaves the name as the site gave it', async () => {
    expect(await readBrand(domain)).toEqual({
      name: 'Iconless Bank',
      logo_path: `${domain}/logo`,
    });
  });

  it('stores the logo', async () => {
    expect(await readStoredLogo(domain)).toEqual(PNG);
  });

  it('leaves the room on the website it was created with', async () => {
    expect(await readRoomBrandDomain(roomId)).toBe(domain);
  });
});

describe('setManualLenderLogo after a failed lookup (integration)', () => {
  let domain: string;

  beforeAll(async () => {
    const room = await roomWithWebsite(null);

    domain = room.domain;
    signedIn.client = owner.client;

    await unwrap(
      setManualLenderLogo({ dealId, roomId: room.roomId, file: logoFile() }),
    );
  });

  it('caches the logo path and leaves the name empty', async () => {
    expect(await readBrand(domain)).toEqual({
      name: null,
      logo_path: `${domain}/logo`,
    });
  });

  it('stores the logo', async () => {
    expect(await readStoredLogo(domain)).toEqual(PNG);
  });

  it('makes later lookups return the logo', async () => {
    expect(await lookUp(domain, null)).toEqual({
      domain,
      name: null,
      logoPath: `${domain}/logo`,
    });
  });
});

describe('setManualLenderLogo for a website that already has a logo (integration)', () => {
  let domain: string;

  beforeAll(async () => {
    const first = await roomWithWebsite('<title>First Bank</title>');
    const secondDealId = await newDeal(owner);

    domain = first.domain;
    signedIn.client = owner.client;

    await unwrap(
      setManualLenderLogo({ dealId, roomId: first.roomId, file: logoFile() }),
    );
    await unwrap(
      setManualLenderLogo({
        dealId: secondDealId,
        roomId: await newRoom({ roomDealId: secondDealId, website: domain }),
        file: logoFile(OTHER_PNG),
      }),
    );
  });

  it('keeps the cached name and logo path', async () => {
    expect(await readBrand(domain)).toEqual({
      name: 'First Bank',
      logo_path: `${domain}/logo`,
    });
  });

  it('keeps the stored logo', async () => {
    expect(await readStoredLogo(domain)).toEqual(PNG);
  });
});

describe('setManualLenderLogo (integration)', () => {
  it('serves the logo with the type of its bytes, not the type the upload declared', async () => {
    const { domain, roomId } = await roomWithWebsite(
      '<title>First Bank</title>',
    );
    signedIn.client = owner.client;

    await unwrap(
      setManualLenderLogo({
        dealId,
        roomId,
        file: new File([PNG], 'logo.bin', { type: 'text/html' }),
      }),
    );

    const logo = await fetch((await brandLogoUrl(`${domain}/logo`))!);

    expect(logo.headers.get('content-type')).toBe('image/png');
  });

  it.each([
    [
      'is not an image, whatever it declares',
      () => new File(['<p>hello</p>'], 'logo.png', { type: 'image/png' }),
    ],
    ['is one byte over 512 KiB', () => logoFile(pngOfSize(512 * 1024 + 1))],
  ])('refuses a file that %s and changes nothing', async (_label, file) => {
    const { domain, roomId } = await roomWithWebsite(
      '<title>First Bank</title>',
    );
    signedIn.client = owner.client;

    await expect(
      unwrap(setManualLenderLogo({ dealId, roomId, file: file() })),
    ).rejects.toThrow('The logo must be an image of at most 512 KiB');

    expect(await readBrand(domain)).toEqual({
      name: 'First Bank',
      logo_path: null,
    });
    expect(await listStoredLogos(domain)).toEqual([]);
  });

  it('accepts a logo of exactly 512 KiB', async () => {
    const { domain, roomId } = await roomWithWebsite(
      '<title>First Bank</title>',
    );
    signedIn.client = owner.client;

    await unwrap(
      setManualLenderLogo({
        dealId,
        roomId,
        file: logoFile(pngOfSize(512 * 1024)),
      }),
    );

    expect(await readStoredLogo(domain)).toHaveLength(512 * 1024);
  });

  it('refuses a room that was created without a website, and leaves it without one', async () => {
    const roomId = await newRoom();
    signedIn.client = owner.client;

    await expect(
      unwrap(setManualLenderLogo({ dealId, roomId, file: logoFile() })),
    ).rejects.toThrow('This room has no website, so a logo cannot be added');

    expect(await readRoomBrandDomain(roomId)).toBeNull();
  });

  it('refuses a room of a deal the caller does not manage, and changes nothing', async () => {
    const domain = newDomain();

    await lookUp(domain, '<title>First Bank</title>');

    const theirRoomId = await newRoom({
      person: outsider,
      roomDealId: await newDeal(outsider),
      website: domain,
    });
    signedIn.client = owner.client;

    await expect(
      unwrap(
        setManualLenderLogo({ dealId, roomId: theirRoomId, file: logoFile() }),
      ),
    ).rejects.toThrow('Not allowed to manage this lender room');

    expect((await readBrand(domain))?.logo_path).toBeNull();
    expect(await listStoredLogos(domain)).toEqual([]);
  });
});

describe.each([
  ['a member of a lender room on the deal', () => lender],
  ['a signed-in user with no relation to the deal', () => outsider],
])('the brand actions called by %s (integration)', (_label, caller) => {
  it('refuse a lookup and leave no trace of the domain in the cache', async () => {
    const domain = newDomain();
    signedIn.client = caller().client;

    await expect(
      unwrap(lookupLenderBrand({ dealId, url: domain })),
    ).rejects.toThrow('Only the deal team can do that');

    expect(await readBrand(domain)).toBeNull();
  });

  it('refuse a lookup of a cached domain', async () => {
    const domain = newDomain();

    await lookUp(domain, '<title>First Bank</title>');
    signedIn.client = caller().client;

    await expect(
      unwrap(lookupLenderBrand({ dealId, url: domain })),
    ).rejects.toThrow('Only the deal team can do that');
  });

  it('refuse a manual logo and change nothing', async () => {
    const { domain, roomId } = await roomWithWebsite(
      '<title>First Bank</title>',
    );

    await admin
      .from('lender_room_member')
      .insert({
        room_id: roomId,
        user_id: lender.userId,
        email: 'lender@odb.test',
        invited_by: owner.userId,
      })
      .throwOnError();
    signedIn.client = caller().client;

    await expect(
      unwrap(setManualLenderLogo({ dealId, roomId, file: logoFile() })),
    ).rejects.toThrow('Only the deal team can do that');

    expect(await readBrand(domain)).toEqual({
      name: 'First Bank',
      logo_path: null,
    });
    expect(await listStoredLogos(domain)).toEqual([]);
  });
});

describe('the brand actions for a deal that does not exist (integration)', () => {
  it('refuse a lookup', async () => {
    signedIn.client = owner.client;

    await expect(
      unwrap(
        lookupLenderBrand({ dealId: crypto.randomUUID(), url: newDomain() }),
      ),
    ).rejects.toThrow('Only the deal team can do that');
  });
});

function secondsUntilExpiry(signedUrl: string): number {
  const token = new URL(signedUrl).searchParams.get('token')!;
  const claims = JSON.parse(
    Buffer.from(token.split('.')[1]!, 'base64url').toString(),
  );

  return claims.exp - Date.now() / 1000;
}

describe('lookupLenderBrand for a domain whose logo is cached (integration)', () => {
  let domain: string;

  beforeAll(async () => {
    domain = newDomain();
    signedIn.client = owner.client;

    await lookupBrand(
      domain,
      fakeSite({
        [`https://${domain}/`]: html('<title>First Bank</title>'),
        [`https://${domain}/favicon.ico`]: png(),
      }),
    );
  });

  it('returns the cached brand for any spelling of its address', async () => {
    expect(
      await unwrap(
        lookupLenderBrand({ dealId, url: ` https://www.${domain}/loans?x=1 ` }),
      ),
    ).toMatchObject({ domain, name: 'First Bank', logoPath: `${domain}/logo` });
  });

  it('returns a URL that serves the stored logo', async () => {
    const brand = await unwrap(lookupLenderBrand({ dealId, url: domain }));
    const logo = await fetch(brand!.logoUrl!);

    expect(logo.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await logo.arrayBuffer())).toEqual(PNG);
  });

  it('signs a fresh URL on every call, good for the five minutes the room header uses', async () => {
    await unwrap(lookupLenderBrand({ dealId, url: domain }));

    const again = await unwrap(lookupLenderBrand({ dealId, url: domain }));
    const remaining = secondsUntilExpiry(again!.logoUrl!);

    expect(remaining).toBeGreaterThan(290);
    expect(remaining).toBeLessThanOrEqual(301);
    expect(
      secondsUntilExpiry((await brandLogoUrl(`${domain}/logo`))!),
    ).toBeCloseTo(remaining, -1);
  });
});

describe('lookupLenderBrand (integration)', () => {
  it('returns a null logo URL for a brand with no logo', async () => {
    const domain = newDomain();
    signedIn.client = owner.client;

    await lookUp(domain, '<title>Iconless Bank</title>');

    expect(await unwrap(lookupLenderBrand({ dealId, url: domain }))).toEqual({
      domain,
      name: 'Iconless Bank',
      logoPath: null,
      logoUrl: null,
    });
  });

  it('returns no brand for something that is not a domain', async () => {
    signedIn.client = owner.client;

    expect(
      await unwrap(lookupLenderBrand({ dealId, url: 'not a domain' })),
    ).toBeNull();
  });

  it('refuses a caller who is not signed in', async () => {
    signedIn.client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      clientOptions,
    );

    expect(
      await lookupLenderBrand({ dealId, url: 'firstbank.com' }),
    ).toMatchObject({ ok: false });
  });
});
