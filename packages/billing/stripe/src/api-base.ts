export interface StripeApiBase {
  host: string;
  port: string;
  protocol: 'http' | 'https';
}

const apiBaseProtocols = new Map<string, StripeApiBase['protocol']>([
  ['http:', 'http'],
  ['https:', 'https'],
]);

const writtenPort = /^[^:]+:\/\/[^/?#]*:(\d+)(?=[/?#]|$)/;

export function parseStripeApiBase(value: string): StripeApiBase | undefined {
  if (value === '') {
    return undefined;
  }
  if (!URL.canParse(value)) {
    throw new Error('STRIPE_API_BASE must be a valid URL');
  }

  const url = new URL(value);
  const protocol = apiBaseProtocols.get(url.protocol);
  const port = writtenPort.exec(value)?.[1];

  if (protocol === undefined) {
    throw new Error('STRIPE_API_BASE must use http or https');
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('STRIPE_API_BASE must not include a username or password');
  }
  if (port === undefined) {
    throw new Error('STRIPE_API_BASE must include an explicit port');
  }
  if (url.pathname !== '/') {
    throw new Error('STRIPE_API_BASE must not include a path');
  }
  if (url.search !== '') {
    throw new Error('STRIPE_API_BASE must not include a query string');
  }
  if (url.hash !== '') {
    throw new Error('STRIPE_API_BASE must not include a fragment');
  }

  return { host: url.hostname, port, protocol };
}
