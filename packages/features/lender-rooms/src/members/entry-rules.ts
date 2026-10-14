import type { Database } from '@odb/supabase';

export type LenderRoomSummary =
  Database['public']['CompositeTypes']['lender_room_summary'];

export type RoomGateDecision =
  | { kind: 'sign-in'; path: string }
  | { kind: 'not-found' }
  | { kind: 'closed'; room: LenderRoomSummary }
  | { kind: 'open'; room: LenderRoomSummary };

export function notOnboardedDestination(
  rooms: Pick<LenderRoomSummary, 'is_open'>[],
): '/lender' | '/onboarding' {
  return rooms.some((room) => room.is_open) ? '/lender' : '/onboarding';
}

export function signInConfirmUrl({
  origin,
  tokenHash,
  next,
}: {
  origin: string;
  tokenHash: string;
  next: string;
}): string {
  const query = new URLSearchParams({
    token_hash: tokenHash,
    type: 'magiclink',
    next,
  });

  return `${origin}/auth/confirm?${query}`;
}

const ROOMS_LIST_PATH = '/lender';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

const RETURN_PATH = new RegExp(
  `^/lender(/${UUID}(/requests(/(asks|forms)/${UUID})?)?)?$`,
);

export function safeNextPath(next: string | null): string {
  return next && RETURN_PATH.test(next) ? next : ROOMS_LIST_PATH;
}

type ConfirmPageDecision =
  | {
      kind: 'continue';
      tokenHash: string;
      next: string;
      destination: 'your lender room' | 'your lender rooms';
    }
  | { kind: 'sign-in'; path: string };

export function decideConfirmPage(
  params: URLSearchParams,
): ConfirmPageDecision {
  const next = safeNextPath(params.get('next'));
  const tokenHash = params.get('token_hash');

  if (tokenHash && params.get('type') === 'magiclink') {
    return {
      kind: 'continue',
      tokenHash,
      next,
      destination:
        next === ROOMS_LIST_PATH ? 'your lender rooms' : 'your lender room',
    };
  }

  return {
    kind: 'sign-in',
    path: `/lender/sign-in?${new URLSearchParams({ next })}`,
  };
}
