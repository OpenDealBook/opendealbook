import { describe, expect, it } from 'vitest';

import { brandDomain, parseBrandHost } from './domain';

describe('parseBrandHost', () => {
  it.each([
    ['an https scheme', 'https://firstbank.com'],
    ['an http scheme', 'http://firstbank.com'],
    ['a path', 'firstbank.com/about/us'],
    ['capital letters', 'FirstBank.COM'],
    ['a port', 'https://firstbank.com:8443/login'],
    ['userinfo', 'https://user:secret@firstbank.com/'],
    ['a query with no path', 'firstbank.com?utm_source=mail'],
    ['a fragment with no path', 'https://firstbank.com#rates'],
    ['all of them at once', 'HTTPS://user@FirstBank.com:443/a?b=1#top'],
    ['leading and trailing spaces', '  firstbank.com \n'],
    ['a backslash', 'firstbank.com\\1'],
    ['percent-encoding', '%66irstbank.com'],
    ['a tab inside the host', 'first\tbank.com'],
    ['fullwidth letters', 'ｆｉｒｓｔbank.com'],
  ])('reads firstbank.com through %s', (_label, input) => {
    expect(parseBrandHost(input)).toEqual({
      host: 'firstbank.com',
      domain: 'firstbank.com',
    });
  });

  it('keeps a leading www in the host and leaves it out of the cache key', () => {
    expect(parseBrandHost('https://WWW.FirstBank.com/')).toEqual({
      host: 'www.firstbank.com',
      domain: 'firstbank.com',
    });
  });

  it.each(['www2.firstbank.com', 'wwwbank.com'])(
    'keeps %s whole, since it only starts with the letters www',
    (host) => {
      expect(parseBrandHost(host)).toEqual({ host, domain: host });
    },
  );

  it.each([
    ['the empty string', ''],
    ['only spaces', '   '],
    ['only dots', '..'],
    ['a name with no dot', 'localhost'],
    ['www and a single label', 'www.com'],
    ['an empty label', 'firstbank..com'],
    ['a trailing dot', 'firstbank.com.'],
    ['an underscore', 'first_bank.com'],
    ['a space inside the host', 'first bank.com'],
    ['an IPv6 literal', 'https://[2606:2800:220:1::1]/'],
    ['an IPv4 literal', 'https://93.184.216.34/'],
    ['an IPv4 literal written as one number', '1572395042'],
    ['an IPv4 literal written in hex', '0x5d.0xb8.0xd8.0x22'],
    ['more than 253 characters', `${'a.'.repeat(126)}com`],
  ])('refuses %s', (_label, input) => {
    expect(parseBrandHost(input)).toBeNull();
  });

  it('accepts a name of exactly 253 characters', () => {
    const host = `${'a.'.repeat(125)}com`;

    expect(host).toHaveLength(253);
    expect(parseBrandHost(host)?.domain).toBe(host);
  });
});

describe('brandDomain', () => {
  it('gives the cache key of an address', () => {
    expect(brandDomain('https://www.FirstBank.com/loans')).toBe(
      'firstbank.com',
    );
  });

  it('gives nothing for something that is not a domain', () => {
    expect(brandDomain('localhost')).toBeNull();
  });
});
