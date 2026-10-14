import type { Enums } from '@odb/supabase';

import { allowedReturnRoutes } from '../forms/return-routes';

type Status = Enums<'lender_ask_status'>;
type ReturnRoute = Enums<'lender_return_route'>;

export function teamName(dealName: string | null): string {
  return dealName ? `${dealName}'s team` : 'the deal team';
}

export function teamNameAtStart(dealName: string | null): string {
  return dealName ? teamName(dealName) : 'The deal team';
}

export interface RequestProgress {
  status: Status;
  return_route: ReturnRoute | null;
  latest_signature_status: Enums<'lender_signature_status'> | null;
}

export function isWaitingOnTeam(request: RequestProgress): boolean {
  return (
    request.status === 'open' &&
    !(
      request.return_route === 'esign' &&
      request.latest_signature_status === 'sent'
    )
  );
}

export function statusWording(
  request: RequestProgress,
  dealName: string | null,
): string {
  switch (request.status) {
    case 'open':
      return isWaitingOnTeam(request)
        ? `Waiting on ${teamName(dealName)}`
        : 'Out for signature';
    case 'answered':
      return 'Answered, your turn';
    case 'closed':
      return 'Closed';
    case 'withdrawn':
      return 'Withdrawn';
  }
}

export const signatureWording = {
  draft: 'Being prepared for signature',
  sent: 'Out for signature',
  completed: 'Signed',
  declined: 'A signer declined',
  expired: 'The signature request expired',
  cancelled: null,
} satisfies Record<Enums<'lender_signature_status'>, string | null>;

export function openRequestCounts(requests: RequestProgress[]) {
  return {
    waitingOnTeam: requests.filter(isWaitingOnTeam).length,
    waitingOnLender: requests.filter((request) => request.status === 'answered')
      .length,
  };
}

export function summaryWording(
  counts: ReturnType<typeof openRequestCounts>,
  dealName: string | null,
): string[] {
  return [
    `${counts.waitingOnTeam} waiting on ${teamName(dealName)}`,
    `${counts.waitingOnLender} answered, your turn`,
  ];
}

const esignHint = {
  upload: 'Upload a PDF or Word file to use e-sign',
  change: 'To use e-sign, replace the file with a PDF or Word file.',
};

export function returnRouteChoice(
  fileName: string,
  screen: keyof typeof esignHint,
  isEsignAvailable: boolean,
): { routes: ReturnRoute[]; hint: string | null } {
  if (!isEsignAvailable) {
    return { routes: ['upload'], hint: null };
  }

  const routes = allowedReturnRoutes(fileName);

  return { routes, hint: routes.includes('esign') ? null : esignHint[screen] };
}

export function replaceBlocker(
  fileName: string,
  returnRoute: ReturnRoute,
): string | null {
  return allowedReturnRoutes(fileName).includes(returnRoute)
    ? null
    : `${fileName} cannot be signed electronically. Choose a PDF or Word file, or close this and change how the form is returned first.`;
}

export const returnRouteAction = {
  upload: 'fill it in and upload it',
  esign: 'sign it electronically',
} satisfies Record<ReturnRoute, string>;

export function returnWording(
  route: ReturnRoute,
  dealName: string | null,
): string {
  return `${teamNameAtStart(dealName)} will ${returnRouteAction[route]}`;
}

export function confirmWording(
  move: 'withdraw' | 'close',
  dealName: string | null,
) {
  return move === 'withdraw'
    ? {
        title: 'Withdraw this request?',
        detail: `${teamNameAtStart(dealName)} will see it as withdrawn and stop working on it. A reply from either side reopens it.`,
        confirm: 'Withdraw request',
      }
    : {
        title: 'Close this request?',
        detail: `It is marked closed for you and ${teamName(dealName)}. A reply from either side reopens it.`,
        confirm: 'Close request',
      };
}

export function signInAgainPath(currentPath: string): string {
  const withoutLanguage = currentPath.slice(currentPath.indexOf('/lender'));

  return `/lender/sign-in?next=${encodeURIComponent(withoutLanguage)}`;
}

export function offersRouteChange(
  isEsignAvailable: boolean,
  currentRoute: ReturnRoute,
): boolean {
  return isEsignAvailable || currentRoute === 'esign';
}
