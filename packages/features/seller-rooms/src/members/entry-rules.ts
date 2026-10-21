const SELLER_PATH =
  /^\/seller\/(?:(rooms|documents)\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export const SELLER_ROOMS_PATH = '/seller';

export type SellerPlace =
  | { kind: 'rooms' | 'documents' | 'deals'; id: string }
  | { kind: 'home' };

const ROOM_CONTRACTS_PATH = /^(\/seller\/rooms\/[^/]+)\/contracts$/;

export function sellerPlace(next: string): SellerPlace | null {
  if (next === SELLER_ROOMS_PATH) {
    return { kind: 'home' };
  }

  const match = SELLER_PATH.exec(next.replace(ROOM_CONTRACTS_PATH, '$1'));

  return match
    ? {
        kind: (match[1] ?? 'deals') as 'rooms' | 'documents' | 'deals',
        id: match[2]!,
      }
    : null;
}

export function safeSellerNextPath(next: string | null): string | null {
  return next && sellerPlace(next) ? next : null;
}

export function sellerRoomPath(roomId: string): string {
  return `/seller/rooms/${roomId}`;
}

export function sellerHomeDestination(
  sellerRooms: { id: string; is_open: boolean }[],
  lenderRooms: { is_open: boolean | null }[],
): string | null {
  if (sellerRooms.length === 0) {
    return null;
  }

  const openLenderRooms = lenderRooms.filter((room) => room.is_open);

  return sellerRooms.length === 1 && openLenderRooms.length === 0
    ? sellerRoomPath(sellerRooms[0]!.id)
    : '/seller';
}

export function sellerSignInPath(next: string): string {
  return `/seller/sign-in?${new URLSearchParams({ next })}`;
}

export function sellerSignInConfirmUrl({
  origin,
  tokenHash,
  next,
  email,
}: {
  origin: string;
  tokenHash: string;
  next: string;
  email: string;
}): string {
  const query = new URLSearchParams({
    token_hash: tokenHash,
    type: 'magiclink',
    next,
    email,
  });

  return `${origin}/seller/confirm?${query}`;
}

export type SellerConfirmPageDecision =
  | { kind: 'continue'; tokenHash: string; next: string }
  | { kind: 'sign-in'; path: string }
  | { kind: 'not-found' };

export function decideSellerConfirmPage(
  params: URLSearchParams,
): SellerConfirmPageDecision {
  const next = safeSellerNextPath(params.get('next'));
  const tokenHash = params.get('token_hash');

  if (!next) {
    return { kind: 'not-found' };
  }

  if (tokenHash && params.get('type') === 'magiclink') {
    return { kind: 'continue', tokenHash, next };
  }

  return { kind: 'sign-in', path: sellerSignInPath(next) };
}

export const SELLER_SIGN_IN_WINDOW_SECONDS = 120;

export function sellerSignInRateKey(email: string): string {
  return `seller-signin:${email}`;
}
