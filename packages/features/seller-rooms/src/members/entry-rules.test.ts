import { describe, expect, it } from 'vitest';

import {
  decideSellerConfirmPage,
  safeSellerNextPath,
  sellerPlace,
  sellerHomeDestination,
  sellerSignInConfirmUrl,
} from './entry-rules';

const SHARE = '0b6c1f2e-8a43-4c1d-9a7e-2f5d3c4b1a90';

describe('safeSellerNextPath', () => {
  it('keeps a seller room path', () => {
    expect(safeSellerNextPath(`/seller/rooms/${SHARE}`)).toBe(
      `/seller/rooms/${SHARE}`,
    );
  });

  it('keeps a seller document path', () => {
    expect(safeSellerNextPath(`/seller/documents/${SHARE}`)).toBe(
      `/seller/documents/${SHARE}`,
    );
  });

  it("keeps a seller room's contracts path", () => {
    expect(safeSellerNextPath(`/seller/rooms/${SHARE}/contracts`)).toBe(
      `/seller/rooms/${SHARE}/contracts`,
    );
  });

  it('keeps the rooms list', () => {
    expect(safeSellerNextPath('/seller')).toBe('/seller');
  });

  it('keeps the old seller portal path for a deal', () => {
    expect(safeSellerNextPath(`/seller/${SHARE}`)).toBe(`/seller/${SHARE}`);
  });

  it.each([
    null,
    `/seller/${SHARE}/rooms`,
    '/seller/not-a-deal',
    'https://evil.test/seller/documents/x',
    '//evil.test',
    '/home',
    `/seller/documents/${SHARE}/../../home`,
    `/seller/documents/${SHARE}/contracts`,
    `/seller/${SHARE}/contracts`,
    `/seller/rooms/${SHARE}/contracts/x`,
    '/seller/rooms/not-a-room/contracts',
  ])('refuses %s', (next) => {
    expect(safeSellerNextPath(next)).toBeNull();
  });
});

describe('sellerPlace', () => {
  it("places a room's contracts in that room", () => {
    expect(sellerPlace(`/seller/rooms/${SHARE}/contracts`)).toEqual({
      kind: 'rooms',
      id: SHARE,
    });
  });
});

describe('sellerSignInConfirmUrl', () => {
  it('links to the seller confirm page with the token hash and destination', () => {
    const url = new URL(
      sellerSignInConfirmUrl({
        origin: 'https://app.odb.test',
        tokenHash: 'hash-1',
        next: `/seller/documents/${SHARE}`,
        email: 'sam@seller.test',
      }),
    );

    expect(url.searchParams.get('email')).toBe('sam@seller.test');
    expect(url.origin + url.pathname).toBe(
      'https://app.odb.test/seller/confirm',
    );
    expect(url.searchParams.get('token_hash')).toBe('hash-1');
    expect(url.searchParams.get('type')).toBe('magiclink');
    expect(url.searchParams.get('next')).toBe(`/seller/documents/${SHARE}`);
  });
});

describe('decideSellerConfirmPage', () => {
  it('offers Continue for a magic link token to a seller document', () => {
    expect(
      decideSellerConfirmPage(
        new URLSearchParams({
          token_hash: 'hash-1',
          type: 'magiclink',
          next: `/seller/documents/${SHARE}`,
        }),
      ),
    ).toEqual({
      kind: 'continue',
      tokenHash: 'hash-1',
      next: `/seller/documents/${SHARE}`,
    });
  });

  it('sends a link without a token to the seller sign-in page', () => {
    expect(
      decideSellerConfirmPage(
        new URLSearchParams({ next: `/seller/documents/${SHARE}` }),
      ),
    ).toEqual({
      kind: 'sign-in',
      path: `/seller/sign-in?next=%2Fseller%2Fdocuments%2F${SHARE}`,
    });
  });

  it('treats a link to anywhere else as not found', () => {
    expect(
      decideSellerConfirmPage(
        new URLSearchParams({
          token_hash: 'hash-1',
          type: 'magiclink',
          next: '/home',
        }),
      ),
    ).toEqual({ kind: 'not-found' });
  });
});

describe('sellerHomeDestination', () => {
  const room = (id: string, isOpen = true) => ({ id, is_open: isOpen });

  it('leaves someone with no seller rooms to the lender rule', () => {
    expect(sellerHomeDestination([], [{ is_open: true }])).toBeNull();
  });

  it('takes a seller with one room straight into it', () => {
    expect(sellerHomeDestination([room(SHARE)], [])).toBe(
      `/seller/rooms/${SHARE}`,
    );
  });

  it('shows the rooms list to a seller with several rooms', () => {
    expect(sellerHomeDestination([room(SHARE), room('r-2')], [])).toBe(
      '/seller',
    );
  });

  it('shows the rooms list to someone who is both a seller and a lender', () => {
    expect(sellerHomeDestination([room(SHARE)], [{ is_open: true }])).toBe(
      '/seller',
    );
  });

  it('takes a seller whose one room is closed into it, to see it closed', () => {
    expect(
      sellerHomeDestination([room(SHARE, false)], [{ is_open: false }]),
    ).toBe(`/seller/rooms/${SHARE}`);
  });
});
