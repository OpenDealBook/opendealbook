import { isIP } from 'node:net';

interface BrandHost {
  host: string;
  domain: string;
}

const MAX_HOSTNAME_LENGTH = 253;

export function parseBrandHost(input: string): BrandHost | null {
  const trimmed = input.trim();
  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  if (!URL.canParse(url)) {
    return null;
  }

  const host = new URL(url).hostname;
  const domain = host.replace(/^www\./, '');

  return host.length <= MAX_HOSTNAME_LENGTH &&
    !isIP(host) &&
    /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)
    ? { host, domain }
    : null;
}

export function brandDomain(input: string): string | null {
  return parseBrandHost(input)?.domain ?? null;
}
