const COUNSEL_PATH =
  /^\/counsel\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export const COUNSEL_DEALS_PATH = '/counsel';

export function counselPortalDealId(next: string): string | null {
  return COUNSEL_PATH.exec(next)?.[1] ?? null;
}

export function safeCounselNextPath(next: string | null): string | null {
  return next === COUNSEL_DEALS_PATH || (next && counselPortalDealId(next))
    ? next
    : null;
}

export function counselPortalPath(dealId: string): string {
  return `/counsel/${dealId}`;
}

export function counselHomeDestination(openDealIds: string[]): string | null {
  return openDealIds.length === 0 ? null : COUNSEL_DEALS_PATH;
}

export function counselSignInPath(next: string): string {
  return `/counsel/sign-in?${new URLSearchParams({ next })}`;
}

export function counselSignInConfirmUrl({
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

  return `${origin}/counsel/confirm?${query}`;
}

export type CounselConfirmPageDecision =
  | { kind: 'continue'; tokenHash: string; next: string }
  | { kind: 'sign-in'; path: string }
  | { kind: 'not-found' };

export function decideCounselConfirmPage(
  params: URLSearchParams,
): CounselConfirmPageDecision {
  const next = safeCounselNextPath(params.get('next'));
  const tokenHash = params.get('token_hash');

  if (!next) {
    return { kind: 'not-found' };
  }

  if (tokenHash && params.get('type') === 'magiclink') {
    return { kind: 'continue', tokenHash, next };
  }

  return { kind: 'sign-in', path: counselSignInPath(next) };
}
