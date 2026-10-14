import { describe, expect, it } from 'vitest';

import {
  confirmWording,
  isWaitingOnTeam,
  offersRouteChange,
  openRequestCounts,
  replaceBlocker,
  returnRouteChoice,
  returnWording,
  signatureWording,
  signInAgainPath,
  statusWording,
  summaryWording,
  teamName,
  teamNameAtStart,
} from './wording';

describe('teamName', () => {
  it('names the team after the deal', () => {
    expect(teamName('Harbor Freight Co')).toBe("Harbor Freight Co's team");
  });

  it('says the deal team when the deal has no name', () => {
    expect(teamName(null)).toBe('the deal team');
  });

  it('starts a sentence with a capital', () => {
    expect(teamNameAtStart(null)).toBe('The deal team');
    expect(teamNameAtStart('Harbor Freight Co')).toBe(
      "Harbor Freight Co's team",
    );
  });
});

const ask = {
  status: 'open' as const,
  return_route: null,
  latest_signature_status: null,
};
const uploadForm = { ...ask, return_route: 'upload' as const };
const esignForm = { ...ask, return_route: 'esign' as const };

describe('isWaitingOnTeam', () => {
  it('is true for an open request for information', () => {
    expect(isWaitingOnTeam(ask)).toBe(true);
  });

  it('is true for an open form that comes back as a completed file', () => {
    expect(isWaitingOnTeam(uploadForm)).toBe(true);
  });

  it.each([
    null,
    'draft',
    'completed',
    'declined',
    'expired',
    'cancelled',
  ] as const)(
    'is true for an open e-sign form whose latest signature request is %s',
    (latest_signature_status) => {
      expect(isWaitingOnTeam({ ...esignForm, latest_signature_status })).toBe(
        true,
      );
    },
  );

  it('is false for an open e-sign form that has been sent out for signature', () => {
    expect(
      isWaitingOnTeam({ ...esignForm, latest_signature_status: 'sent' }),
    ).toBe(false);
  });

  it.each(['answered', 'closed', 'withdrawn'] as const)(
    'is false for a request that is %s',
    (status) => {
      expect(isWaitingOnTeam({ ...ask, status })).toBe(false);
    },
  );
});

describe('statusWording', () => {
  it('tells the lender who an open request is waiting on', () => {
    expect(statusWording(ask, 'Harbor Freight Co')).toBe(
      "Waiting on Harbor Freight Co's team",
    );
  });

  it('says an e-sign form sent to the signers is out for signature', () => {
    expect(
      statusWording({ ...esignForm, latest_signature_status: 'sent' }, null),
    ).toBe('Out for signature');
  });

  it('keeps an e-sign form whose signature request is a draft waiting on the team', () => {
    expect(
      statusWording({ ...esignForm, latest_signature_status: 'draft' }, null),
    ).toBe('Waiting on the deal team');
  });

  it('tells the lender an answered request is theirs to act on', () => {
    expect(statusWording({ ...ask, status: 'answered' }, null)).toBe(
      'Answered, your turn',
    );
  });

  it('uses one word for requests that are finished', () => {
    expect(statusWording({ ...ask, status: 'closed' }, null)).toBe('Closed');
    expect(statusWording({ ...ask, status: 'withdrawn' }, null)).toBe(
      'Withdrawn',
    );
  });
});

describe('openRequestCounts', () => {
  it('counts open requests as waiting on the team and answered ones as waiting on the lender', () => {
    expect(
      openRequestCounts([
        ask,
        uploadForm,
        { ...ask, status: 'answered' },
        { ...ask, status: 'closed' },
        { ...ask, status: 'withdrawn' },
      ]),
    ).toEqual({ waitingOnTeam: 2, waitingOnLender: 1 });
  });

  it('counts a form that is out for signature as waiting on neither side', () => {
    expect(
      openRequestCounts([
        ask,
        { ...esignForm, latest_signature_status: 'draft' },
        { ...esignForm, latest_signature_status: 'sent' },
      ]),
    ).toEqual({ waitingOnTeam: 2, waitingOnLender: 0 });
  });
});

describe('summaryWording', () => {
  it('uses the same words as the request list', () => {
    expect(
      summaryWording({ waitingOnTeam: 2, waitingOnLender: 1 }, null),
    ).toEqual(['2 waiting on the deal team', '1 answered, your turn']);
  });
});

describe('returnRouteChoice', () => {
  it('offers e-sign for a PDF or Word form', () => {
    expect(returnRouteChoice('W-9.pdf', 'upload', true)).toEqual({
      routes: ['upload', 'esign'],
      hint: null,
    });
    expect(
      returnRouteChoice('Application.DOCX', 'change', true).routes,
    ).toEqual(['upload', 'esign']);
  });

  it('tells a lender uploading another file type to upload a PDF or Word file', () => {
    expect(returnRouteChoice('rates.xlsx', 'upload', true)).toEqual({
      routes: ['upload'],
      hint: 'Upload a PDF or Word file to use e-sign',
    });
  });

  it('tells a lender changing the route to replace the file', () => {
    expect(returnRouteChoice('rates.xlsx', 'change', true).hint).toBe(
      'To use e-sign, replace the file with a PDF or Word file.',
    );
  });
});

describe('when e-signature is not set up', () => {
  it('leaves only the completed file, with no hint about e-sign', () => {
    expect(returnRouteChoice('W-9.pdf', 'upload', false)).toEqual({
      routes: ['upload'],
      hint: null,
    });
  });

  it('offers a route change only to move an earlier e-sign form off e-sign', () => {
    expect(offersRouteChange(false, 'upload')).toBe(false);
    expect(offersRouteChange(false, 'esign')).toBe(true);
    expect(offersRouteChange(true, 'upload')).toBe(true);
  });
});

describe('replaceBlocker', () => {
  it('says what to do when the new file cannot be signed and e-sign is chosen', () => {
    expect(replaceBlocker('rates.xlsx', 'esign')).toBe(
      'rates.xlsx cannot be signed electronically. Choose a PDF or Word file, or close this and change how the form is returned first.',
    );
  });

  it('lets a signable file replace an e-sign form', () => {
    expect(replaceBlocker('application.pdf', 'esign')).toBeNull();
  });

  it('lets any file replace a form that comes back as a completed file', () => {
    expect(replaceBlocker('rates.xlsx', 'upload')).toBeNull();
  });
});

describe('returnWording', () => {
  it('names the team and what it will do with the form', () => {
    expect(returnWording('upload', null)).toBe(
      'The deal team will fill it in and upload it',
    );
    expect(returnWording('esign', 'Harbor Freight Co')).toBe(
      "Harbor Freight Co's team will sign it electronically",
    );
  });
});

describe('confirmWording', () => {
  it('says what withdrawing will do before it is done', () => {
    expect(confirmWording('withdraw', 'Harbor Freight Co')).toEqual({
      title: 'Withdraw this request?',
      detail:
        "Harbor Freight Co's team will see it as withdrawn and stop working on it. A reply from either side reopens it.",
      confirm: 'Withdraw request',
    });
  });

  it('says what closing will do', () => {
    expect(confirmWording('close', null)).toEqual({
      title: 'Close this request?',
      detail:
        'It is marked closed for you and the deal team. A reply from either side reopens it.',
      confirm: 'Close request',
    });
  });
});

describe('signInAgainPath', () => {
  const ROOM = '/lender/7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11/requests';

  it('sends the lender to sign in and back to the page they were on', () => {
    expect(signInAgainPath(ROOM)).toBe(
      `/lender/sign-in?next=${encodeURIComponent(ROOM)}`,
    );
  });

  it('leaves the language prefix out of the return path', () => {
    expect(signInAgainPath(`/fr${ROOM}`)).toBe(
      `/lender/sign-in?next=${encodeURIComponent(ROOM)}`,
    );
  });
});

describe('signatureWording', () => {
  it('says a draft is being prepared, before anyone is asked to sign', () => {
    expect(signatureWording.draft).toBe('Being prepared for signature');
  });

  it('calls a request sent to the signers out for signature', () => {
    expect(signatureWording.sent).toBe('Out for signature');
  });

  it('has nothing to say about a signature request the deal team cancelled', () => {
    expect(signatureWording.cancelled).toBeNull();
  });
});
