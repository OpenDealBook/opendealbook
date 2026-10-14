import { describe, expect, it } from 'vitest';

import { type HostLookup, publicAddress } from './public-host';

function resolvingTo(...addresses: string[]): HostLookup {
  return async () =>
    addresses.map((address) => ({
      address,
      family: address.includes(':') ? 6 : 4,
    }));
}

const publicLookup = resolvingTo('93.184.216.34');

describe('publicAddress', () => {
  it('gives the address of an https host that resolves to a public one', async () => {
    expect(
      await publicAddress(new URL('https://firstbank.com/'), publicLookup),
    ).toEqual({ address: '93.184.216.34', family: 4 });
  });

  it('treats an explicit port 443 as the default port', async () => {
    expect(
      await publicAddress(new URL('https://firstbank.com:443/'), publicLookup),
    ).toEqual({ address: '93.184.216.34', family: 4 });
  });

  it('gives the first address when a host has several public ones', async () => {
    expect(
      await publicAddress(
        new URL('https://firstbank.com/'),
        resolvingTo('2606:2800:220:1:248:1893:25c8:1946', '93.184.216.34'),
      ),
    ).toEqual({ address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 });
  });

  it('has no address for a host that resolves to nothing', async () => {
    expect(
      await publicAddress(new URL('https://firstbank.com/'), resolvingTo()),
    ).toBeNull();
  });

  it.each([
    'http://firstbank.com/',
    'ftp://firstbank.com/',
    'file:///etc/passwd',
    'data:text/html,hi',
  ])('rejects the scheme of %s', async (url) => {
    expect(await publicAddress(new URL(url), publicLookup)).toBeNull();
  });

  it.each(['https://firstbank.com:8443/', 'https://firstbank.com:80/'])(
    'rejects the port of %s',
    async (url) => {
      expect(await publicAddress(new URL(url), publicLookup)).toBeNull();
    },
  );

  it.each([
    'https://93.184.216.34/',
    'https://127.0.0.1/',
    'https://2130706433/',
    'https://0x7f.1/',
    'https://[::1]/',
    'https://[2606:2800:220:1:248:1893:25c8:1946]/',
  ])('rejects the IP literal in %s', async (url) => {
    expect(await publicAddress(new URL(url), publicLookup)).toBeNull();
  });

  it.each([
    ['loopback', '127.0.0.1'],
    ['loopback outside 127.0.0', '127.200.3.4'],
    ['private 10/8', '10.1.2.3'],
    ['private 172.16/12 low edge', '172.16.0.1'],
    ['private 172.16/12 high edge', '172.31.255.254'],
    ['private 192.168/16', '192.168.1.10'],
    ['link-local', '169.254.10.10'],
    ['the cloud metadata address', '169.254.169.254'],
    ['CGNAT low edge', '100.64.0.1'],
    ['CGNAT high edge', '100.127.255.254'],
    ['IPv6 loopback', '::1'],
    ['IPv6 unique local fc00', 'fc00::1'],
    ['IPv6 unique local fd00', 'fd12:3456:789a::1'],
    ['IPv6 link-local', 'fe80::1'],
    ['IPv6 link-local high edge', 'febf::1'],
    ['an IPv4-mapped private address', '::ffff:10.0.0.1'],
    ['the unspecified IPv4 address', '0.0.0.0'],
    ['anything in 0/8', '0.1.2.3'],
    ['the unspecified IPv6 address', '::'],
    ['IPv4 multicast low edge', '224.0.0.1'],
    ['IPv4 multicast high edge', '239.255.255.250'],
    ['IPv6 multicast', 'ff02::1'],
    ['the IETF protocol block 192.0.0/24', '192.0.0.8'],
    ['benchmarking 198.18/15 low edge', '198.18.0.1'],
    ['benchmarking 198.18/15 high edge', '198.19.255.254'],
    ['NAT64', '64:ff9b::a00:1'],
    ['local-use NAT64', '64:ff9b:1::a00:1'],
    ['IPv6 site-local', 'fec0::1'],
    ['IPv6 site-local high edge', 'feff::1'],
    ['6to4', '2002:a00:1::1'],
    ['Teredo', '2001:0:a00:1::1'],
    ['an IPv4-compatible address', '::a00:1'],
    ['reserved 240/4', '240.0.0.1'],
    ['limited broadcast', '255.255.255.255'],
    ['the Azure host address', '168.63.129.16'],
  ])('rejects a host resolving to %s', async (_label, address) => {
    expect(
      await publicAddress(
        new URL('https://firstbank.com/'),
        resolvingTo(address),
      ),
    ).toBeNull();
  });

  it('rejects a host when any one of its addresses is not public', async () => {
    expect(
      await publicAddress(
        new URL('https://firstbank.com/'),
        resolvingTo('93.184.216.34', '10.0.0.5'),
      ),
    ).toBeNull();
  });

  it.each([
    ['just below 172.16/12', '172.15.255.255'],
    ['just above 172.16/12', '172.32.0.1'],
    ['just below CGNAT', '100.63.255.255'],
    ['just above CGNAT', '100.128.0.1'],
    ['just above 6to4', '2003::1'],
    ['just above Teredo', '2001:1::1'],
    ['a public address in 2001::/16', '2001:4860:4860::8888'],
    ['just above local-use NAT64', '64:ff9b:2::1'],
    ['beside the Azure host address', '168.63.129.17'],
    ['just above 0/8', '1.1.1.1'],
    ['just below IPv4 multicast', '223.255.255.254'],
    ['just above 192.0.0/24', '192.0.1.1'],
    ['just below 198.18/15', '198.17.255.255'],
    ['just above 198.18/15', '198.20.0.1'],
    ['just above NAT64', '64:ff9b:0:0:0:1::1'],
  ])('allows a host resolving %s', async (_label, address) => {
    expect(
      await publicAddress(
        new URL('https://firstbank.com/'),
        resolvingTo(address),
      ),
    ).toEqual({ address, family: address.includes(':') ? 6 : 4 });
  });
});
