import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

type Lookup = (hostname: string) => Promise<{ address: string }[]>;

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

function isPublicAddress(address: string): boolean {
  return !blocked.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4');
}

function isInternalHostname(hostname: string): boolean {
  return (
    !hostname.includes('.') ||
    hostname === 'localhost' ||
    /\.(localhost|local|internal)\.?$/.test(hostname)
  );
}

export class AddressNotFound extends Error {
  constructor(readonly retryable: boolean) {
    super("We couldn't find that address. Check the base URL.");
  }
}

const LOOKUP_TIMEOUT_MS = 10_000;

function withinLookupTimeout<T>(lookup: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error('DNS lookup timed out'), { code: 'ETIMEOUT' })),
      LOOKUP_TIMEOUT_MS,
    );
  });
  return Promise.race([lookup, timeout]).finally(() => clearTimeout(timer));
}

const resolveAll: Lookup = (hostname) => lookup(hostname, { all: true });

export interface VettedAddress {
  address: string;
  family: 4 | 6;
}

function vetted(address: string): VettedAddress | null {
  return isPublicAddress(address) ? { address, family: isIP(address) as 4 | 6 } : null;
}

export async function publicAddressOf(
  raw: string,
  resolve: Lookup = resolveAll,
): Promise<VettedAddress | null> {
  if (!URL.canParse(raw) || /[?#@]/.test(raw)) {
    return null;
  }
  const url = new URL(raw);
  if (url.protocol !== 'https:') {
    return null;
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    return vetted(host);
  }
  if (isInternalHostname(host)) {
    return null;
  }
  const addresses = await withinLookupTimeout(resolve(host)).catch((error: { code?: string }) => {
    throw new AddressNotFound(error.code !== 'ENOTFOUND');
  });
  return addresses.every(({ address }) => isPublicAddress(address)) ? vetted(addresses[0]!.address) : null;
}

export async function isPublicHttpsUrl(raw: string, resolve: Lookup = resolveAll): Promise<boolean> {
  return (await publicAddressOf(raw, resolve)) !== null;
}
