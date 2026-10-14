import { describe, expect, it } from 'vitest';

import { interceptsLink } from './leave-guard';

const here = 'https://app.example/lender/room/requests';

const link = {
  href: 'https://app.example/lender/room',
  target: '',
  isDownload: false,
  withModifier: false,
};

describe('interceptsLink', () => {
  it('asks before following a link to another page of the app', () => {
    expect(interceptsLink(link, here)).toBe(true);
  });

  it('lets a link to another site go to the browser prompt', () => {
    expect(
      interceptsLink({ ...link, href: 'https://elsewhere.example/' }, here),
    ).toBe(false);
  });

  it('does not ask for a link that opens in a new tab', () => {
    expect(interceptsLink({ ...link, target: '_blank' }, here)).toBe(false);
    expect(interceptsLink({ ...link, withModifier: true }, here)).toBe(false);
  });

  it('does not ask for a file download', () => {
    expect(interceptsLink({ ...link, isDownload: true }, here)).toBe(false);
  });

  it('does not ask for a link to the page the person is already on', () => {
    expect(interceptsLink({ ...link, href: `${here}#files` }, here)).toBe(
      false,
    );
  });
});
