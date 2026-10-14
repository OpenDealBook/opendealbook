import type { HostLookup } from '../public-host';
import type { SiteAccess, SiteResponse } from '../read-site';

export type Route = (
  signal: AbortSignal,
) => SiteResponse | Promise<SiteResponse>;

export const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);

export function pngOfSize(size: number): Buffer<ArrayBuffer> {
  const bytes = Buffer.alloc(size);
  PNG.copy(bytes);

  return bytes;
}

export function answer(
  status: number,
  contentType: string | undefined,
  body: string | Uint8Array,
): Route {
  return () => ({
    status,
    location: undefined,
    contentType,
    body: (async function* () {
      yield Buffer.from(body);
    })(),
  });
}

export function html(body: string): Route {
  return answer(200, 'text/html; charset=utf-8', body);
}

export function png(bytes: Uint8Array = PNG): Route {
  return answer(200, 'image/png', bytes);
}

export function redirect(location: string | undefined, status = 302): Route {
  return () => ({
    status,
    location,
    contentType: undefined,
    body: (async function* () {})(),
  });
}

export function after(milliseconds: number, route: Route): Route {
  return (signal) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(route(signal)), milliseconds);

      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(signal.reason);
      });
    });
}

export const PUBLIC_ADDRESS = '93.184.216.34';
export const PRIVATE_ADDRESS = '10.0.0.7';

export interface FakeSite extends SiteAccess {
  requests: { url: string; address: string; signal: AbortSignal }[];
}

export function fakeSite(
  routes: Record<string, Route>,
  privateHosts: string[] = [],
): FakeSite {
  const requests: FakeSite['requests'] = [];
  const lookup: HostLookup = async (hostname) => [
    {
      address: privateHosts.includes(hostname)
        ? PRIVATE_ADDRESS
        : PUBLIC_ADDRESS,
      family: 4,
    },
  ];

  return {
    requests,
    lookup,
    request: async (url, init) => {
      requests.push({
        url: url.href,
        address: init.address.address,
        signal: init.signal,
      });

      const route = routes[url.href] ?? answer(404, 'text/html', 'missing');

      return route(init.signal);
    },
  };
}

export function requestedUrls(site: FakeSite): string[] {
  return site.requests.map((request) => request.url);
}
