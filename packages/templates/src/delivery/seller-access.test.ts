import type { SupabaseClient } from '@supabase/supabase-js';

import { describe, expect, it } from 'vitest';

import type { Database } from '@odb/supabase';

import { openSellerDocument } from './seller-access';

const SHARE = '0b6c1f2e-8a43-4c1d-9a7e-2f5d3c4b1a90';
const NEXT = `/seller/documents/${SHARE}`;

function queryResult(data: unknown) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => chain,
    throwOnError: () => chain,
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data, error: null }).then(resolve),
  };
  return chain;
}

function fakeClient(options: {
  signedIn?: boolean;
  openedPdfPath?: string | null;
  roomId?: string | null;
}) {
  return {
    auth: {
      getUser: async () =>
        options.signedIn
          ? { data: { user: { id: 'seller-1' } }, error: null }
          : {
              data: { user: null },
              error: Object.assign(new Error('Auth session missing!'), {
                name: 'AuthSessionMissingError',
                __isAuthError: true,
                status: 400,
              }),
            },
    },
    rpc: () => queryResult(options.openedPdfPath),
    from: () =>
      queryResult(
        options.roomId === undefined ? null : { room_id: options.roomId },
      ),
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string) => ({
          data: { signedUrl: `https://storage.test/${bucket}/${path}?signed` },
          error: null,
        }),
      }),
    },
  } as unknown as SupabaseClient<Database>;
}

describe('openSellerDocument', () => {
  it('sends a document that lives in a seller room to that room', async () => {
    const room = 'a0000000-0000-4000-8000-000000000001';
    const client = fakeClient({ signedIn: true, roomId: room });

    expect(await openSellerDocument(client, client, SHARE)).toEqual({
      kind: 'room',
      path: `/seller/rooms/${room}`,
    });
  });

  it('sends a signed-out visitor to seller sign-in and back', async () => {
    const client = fakeClient({ signedIn: false });

    expect(await openSellerDocument(client, client, SHARE)).toEqual({
      kind: 'sign-in',
      path: `/seller/sign-in?next=${encodeURIComponent(NEXT)}`,
    });
  });

  it('shows the recipient the shared PDF', async () => {
    const client = fakeClient({ signedIn: true, openedPdfPath: 'a/d/doc.pdf' });

    expect(await openSellerDocument(client, client, SHARE)).toEqual({
      kind: 'open',
      pdfUrl: 'https://storage.test/generated/a/d/doc.pdf?signed',
    });
  });

  it('shows nothing to someone the share is not for', async () => {
    const client = fakeClient({ signedIn: true, openedPdfPath: null });

    expect(await openSellerDocument(client, client, SHARE)).toEqual({
      kind: 'not-found',
    });
  });
});
