import { describe, expect, it } from 'vitest';

import {
  counselHomeDestination,
  counselPortalPath,
  counselSignInConfirmUrl,
  counselSignInPath,
  decideCounselConfirmPage,
  safeCounselNextPath,
} from './entry-rules';

const DEAL = '0b6c1f2e-8a43-4c1d-9a7e-2f5d3c4b1a90';

describe('safeCounselNextPath', () => {
  it('keeps a counsel portal path', () => {
    expect(safeCounselNextPath(counselPortalPath(DEAL))).toBe(
      `/counsel/${DEAL}`,
    );
  });

  it('keeps the counsel deals list', () => {
    expect(safeCounselNextPath('/counsel')).toBe('/counsel');
  });

  it.each([
    null,
    'https://evil.test/counsel/x',
    '//evil.test',
    '/home',
    `/counsel/${DEAL}/../../home`,
    '/counsel/not-a-deal',
  ])('refuses %s', (next) => {
    expect(safeCounselNextPath(next)).toBeNull();
  });
});

describe('counselSignInConfirmUrl', () => {
  it('links to the counsel confirm page with the token hash and destination', () => {
    const url = new URL(
      counselSignInConfirmUrl({
        origin: 'https://app.odb.test',
        tokenHash: 'hash-1',
        next: `/counsel/${DEAL}`,
        email: 'olu@counsel.test',
      }),
    );

    expect(url.searchParams.get('email')).toBe('olu@counsel.test');
    expect(url.origin + url.pathname).toBe(
      'https://app.odb.test/counsel/confirm',
    );
    expect(url.searchParams.get('token_hash')).toBe('hash-1');
    expect(url.searchParams.get('type')).toBe('magiclink');
    expect(url.searchParams.get('next')).toBe(`/counsel/${DEAL}`);
  });
});

describe('decideCounselConfirmPage', () => {
  it('offers Continue for a magic link token to a counsel portal', () => {
    expect(
      decideCounselConfirmPage(
        new URLSearchParams({
          token_hash: 'hash-1',
          type: 'magiclink',
          next: `/counsel/${DEAL}`,
        }),
      ),
    ).toEqual({
      kind: 'continue',
      tokenHash: 'hash-1',
      next: `/counsel/${DEAL}`,
    });
  });

  it('sends a link without a token to the counsel sign-in page', () => {
    expect(
      decideCounselConfirmPage(
        new URLSearchParams({ next: `/counsel/${DEAL}` }),
      ),
    ).toEqual({
      kind: 'sign-in',
      path: `/counsel/sign-in?next=%2Fcounsel%2F${DEAL}`,
    });
  });

  it('treats a link to anywhere else as not found', () => {
    expect(
      decideCounselConfirmPage(
        new URLSearchParams({
          token_hash: 'hash-1',
          type: 'magiclink',
          next: '/home',
        }),
      ),
    ).toEqual({ kind: 'not-found' });
  });
});

describe('counselSignInPath', () => {
  it('carries the destination', () => {
    expect(counselSignInPath(`/counsel/${DEAL}`)).toBe(
      `/counsel/sign-in?next=%2Fcounsel%2F${DEAL}`,
    );
  });
});

describe('counselHomeDestination', () => {
  it('leaves someone with no open counsel deal to the next rule', () => {
    expect(counselHomeDestination([])).toBeNull();
  });

  it('sends counsel on one open deal to the counsel deals list', () => {
    expect(counselHomeDestination([DEAL])).toBe('/counsel');
  });

  it('sends counsel on several open deals to the counsel deals list', () => {
    expect(
      counselHomeDestination([DEAL, '1c7d2a3f-9b54-4d2e-8b8f-3a6e4d5c2b01']),
    ).toBe('/counsel');
  });
});
