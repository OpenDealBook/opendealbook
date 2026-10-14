import { BlockList, isIP } from 'node:net';

export interface HostAddress {
  address: string;
  family: number;
}

export type HostLookup = (hostname: string) => Promise<HostAddress[]>;

const nonPublic = new BlockList();

nonPublic.addSubnet('0.0.0.0', 8);
nonPublic.addSubnet('10.0.0.0', 8);
nonPublic.addSubnet('100.64.0.0', 10);
nonPublic.addSubnet('127.0.0.0', 8);
nonPublic.addSubnet('169.254.0.0', 16);
nonPublic.addSubnet('172.16.0.0', 12);
nonPublic.addSubnet('192.0.0.0', 24);
nonPublic.addSubnet('192.168.0.0', 16);
nonPublic.addSubnet('198.18.0.0', 15);
nonPublic.addSubnet('224.0.0.0', 4);
nonPublic.addSubnet('240.0.0.0', 4);
nonPublic.addAddress('168.63.129.16');
nonPublic.addSubnet('::', 96, 'ipv6');
nonPublic.addSubnet('64:ff9b::', 96, 'ipv6');
nonPublic.addSubnet('64:ff9b:1::', 48, 'ipv6');
nonPublic.addSubnet('2001::', 32, 'ipv6');
nonPublic.addSubnet('2002::', 16, 'ipv6');
nonPublic.addSubnet('fc00::', 7, 'ipv6');
nonPublic.addSubnet('fe80::', 10, 'ipv6');
nonPublic.addSubnet('fec0::', 10, 'ipv6');
nonPublic.addSubnet('ff00::', 8, 'ipv6');

export async function publicAddress(
  url: URL,
  lookup: HostLookup,
): Promise<HostAddress | null> {
  if (url.protocol !== 'https:' || url.port !== '') {
    return null;
  }

  if (url.hostname.startsWith('[') || isIP(url.hostname)) {
    return null;
  }

  const addresses = await lookup(url.hostname);
  const [first] = addresses;

  return first &&
    addresses.every(
      ({ address, family }) =>
        !nonPublic.check(address, family === 6 ? 'ipv6' : 'ipv4'),
    )
    ? first
    : null;
}
