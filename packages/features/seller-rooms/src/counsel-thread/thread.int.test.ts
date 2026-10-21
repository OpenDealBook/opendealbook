import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ANON_KEY,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
  admin,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
  type Person,
} from '../test-support/world';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

const world = vi.hoisted(() => ({ signedInClient: null as unknown }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

const { postSellerCounselMessage } = await import('./thread');
const { loadSellerCounselThread, loadSellerSide, sellerCounselThreadFileUrl } =
  await import('./queries');
const { SELLER_COUNSEL_THREAD_BUCKET, threadFilePath } =
  await import('./files');

let owner: Person;
let seller: Person;
let counsel: Person;
let teamId: string;
let dealId: string;

beforeAll(async () => {
  [owner, seller, counsel] = await Promise.all([
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
  ]);
  teamId = await provisionTeam(owner, 'Harbor Holdings');
  dealId = await newDeal(teamId, owner);

  const { data: roomId } = await owner.client
    .rpc('ensure_seller_room', { deal_id: dealId })
    .throwOnError();

  await admin
    .from('seller_room_member')
    .insert({
      room_id: roomId,
      user_id: seller.userId,
      email: seller.email,
      name: 'Walt Brennan',
    })
    .throwOnError();
  await admin
    .from('deal_counsel')
    .insert({
      account_id: teamId,
      deal_id: dealId,
      side: 'seller',
      user_id: counsel.userId,
      email: counsel.email,
      name: 'Owen Castillo',
      invited_by: seller.userId,
    })
    .throwOnError();
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('the seller and counsel thread', () => {
  it('carries a message and its file from the seller to their counsel', async () => {
    const path = threadFilePath(dealId, 'earnout memo.pdf');
    await seller.client.storage
      .from(SELLER_COUNSEL_THREAD_BUCKET)
      .upload(path, new Blob(['memo bytes']));

    world.signedInClient = seller.client;
    const posted = await postSellerCounselMessage({
      dealId,
      body: 'Should I accept the earnout?',
      files: [{ path, size: 10 }],
    });

    const thread = await loadSellerCounselThread(counsel.client, dealId);
    const fileUrl = await sellerCounselThreadFileUrl(
      counsel.client,
      thread[0]!.files[0]!.id,
    );

    expect(posted).toEqual({ ok: true, value: undefined });
    expect(
      thread.map(({ author_name, author_side, body, files }) => ({
        author_name,
        author_side,
        body,
        files: files.map((file) => file.name),
      })),
    ).toEqual([
      {
        author_name: 'Walt Brennan',
        author_side: 'seller',
        body: 'Should I accept the earnout?',
        files: ['earnout memo.pdf'],
      },
    ]);
    expect(await (await fetch(fileUrl!)).text()).toBe('memo bytes');
  });

  it('sends a file with no words', async () => {
    const path = threadFilePath(dealId, 'redline.docx');
    await counsel.client.storage
      .from(SELLER_COUNSEL_THREAD_BUCKET)
      .upload(path, new Blob(['redline']));

    world.signedInClient = counsel.client;
    const posted = await postSellerCounselMessage({
      dealId,
      body: '',
      files: [{ path, size: 7 }],
    });
    const thread = await loadSellerCounselThread(seller.client, dealId);

    expect(posted).toEqual({ ok: true, value: undefined });
    expect(
      thread.map(({ author_name, body, files }) => ({
        author_name,
        body,
        files: files.map((file) => file.name),
      })),
    ).toContainEqual({
      author_name: 'Owen Castillo',
      body: '',
      files: ['redline.docx'],
    });
  });

  it('records each post in the deal history for the email relay', async () => {
    const [{ data: messages }, { data: events }] = await Promise.all([
      admin
        .from('seller_counsel_message')
        .select('id')
        .eq('deal_id', dealId)
        .throwOnError(),
      admin
        .from('deal_event')
        .select('aggregate_id, event_type')
        .eq('deal_id', dealId)
        .eq('aggregate_type', 'seller_counsel_message')
        .throwOnError(),
    ]);

    expect(events).toHaveLength(2);
    expect(events).toEqual(
      expect.arrayContaining(
        messages.map((message) => ({
          aggregate_id: message.id,
          event_type: 'seller_counsel_message.posted',
        })),
      ),
    );
  });

  it('asks for words or a file before sending', async () => {
    world.signedInClient = counsel.client;

    expect(
      await postSellerCounselMessage({ dealId, body: '  ', files: [] }),
    ).toEqual({
      ok: false,
      refusal: 'Write a message or attach a file first.',
    });
  });

  it('refuses the files the data room refuses', async () => {
    world.signedInClient = seller.client;
    const path = threadFilePath(dealId, 'call.mp4');

    expect(
      await postSellerCounselMessage({
        dealId,
        body: 'Recording attached',
        files: [{ path, size: 10 }],
      }),
    ).toEqual({
      ok: false,
      refusal:
        'call.mp4 cannot be uploaded: video and audio files are not allowed',
    });
    expect(
      await postSellerCounselMessage({
        dealId,
        body: 'Scans attached',
        files: [
          {
            path: threadFilePath(dealId, 'scans.pdf'),
            size: 301 * 1024 * 1024,
          },
        ],
      }),
    ).toEqual({
      ok: false,
      refusal: 'scans.pdf is larger than the 300 MiB limit',
    });
  });

  it('refuses a message over 10,000 characters or with more than 20 files', async () => {
    world.signedInClient = seller.client;

    expect(
      await postSellerCounselMessage({
        dealId,
        body: 'x'.repeat(10_001),
        files: [],
      }),
    ).toEqual({
      ok: false,
      refusal: 'A message can be at most 10,000 characters.',
    });
    expect(
      await postSellerCounselMessage({
        dealId,
        body: 'Files',
        files: Array.from({ length: 21 }, (_, index) => ({
          path: threadFilePath(dealId, `page-${index}.pdf`),
          size: 1,
        })),
      }),
    ).toEqual({
      ok: false,
      refusal: 'Attach at most 20 files to one message.',
    });
  });

  it('names the seller side and the buyer team they keep the thread from', async () => {
    expect(await loadSellerSide(admin, dealId)).toEqual({
      sellers: [{ userId: seller.userId, name: 'Walt Brennan' }],
      counsel: [{ userId: counsel.userId, name: 'Owen Castillo' }],
      buyerTeam: 'Harbor Holdings',
    });
  });

  it('opens no file for the buyer team', async () => {
    const { data: file } = await admin
      .from('seller_counsel_message_file')
      .select('id')
      .eq('deal_id', dealId)
      .limit(1)
      .single()
      .throwOnError();

    expect(await sellerCounselThreadFileUrl(owner.client, file.id)).toBeNull();
  });

  it('downloads a file under its own name, symbols and all', async () => {
    const path = threadFilePath(dealId, 'P&L.xlsx');
    await seller.client.storage
      .from(SELLER_COUNSEL_THREAD_BUCKET)
      .upload(path, new Blob(['figures']));
    world.signedInClient = seller.client;
    await postSellerCounselMessage({
      dealId,
      body: 'Figures',
      files: [{ path, size: 7 }],
    });
    const { data: file } = await admin
      .from('seller_counsel_message_file')
      .select('id')
      .eq('storage_path', path)
      .single()
      .throwOnError();

    const response = await fetch(
      (await sellerCounselThreadFileUrl(counsel.client, file.id))!,
    );

    const [, encodedName] = /filename\*=UTF-8''(.+)$/.exec(
      response.headers.get('content-disposition')!,
    )!;

    expect(decodeURIComponent(encodedName!)).toBe('P&L.xlsx');
  });

  it('says why nobody posts once the seller room closes', async () => {
    await admin
      .from('seller_room')
      .update({ closed_at: new Date().toISOString() })
      .eq('deal_id', dealId)
      .throwOnError();
    world.signedInClient = seller.client;

    const posted = await postSellerCounselMessage({
      dealId,
      body: 'One more thing',
      files: [],
    });

    await admin
      .from('seller_room')
      .update({ closed_at: null })
      .eq('deal_id', dealId)
      .throwOnError();
    expect(posted).toEqual({
      ok: false,
      refusal: 'The seller room is closed, so this is read-only.',
    });
    const { data: reopened } = await seller.client
      .rpc('seller_side_read_only_reason', { deal_id: dealId })
      .throwOnError();

    expect(reopened).toBeNull();
  });
});
