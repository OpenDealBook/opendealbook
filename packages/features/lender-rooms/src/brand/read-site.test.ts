import { afterEach, describe, expect, it, vi } from 'vitest';

import { readSite } from './read-site';
import {
  after,
  answer,
  fakeSite,
  html,
  PNG,
  png,
  pngOfSize,
  PRIVATE_ADDRESS,
  PUBLIC_ADDRESS,
  redirect,
  requestedUrls,
  type Route,
} from './test-support/fake-site';

const MIB = 1024 * 1024;

const PAGE = `<html><head><title>First Bank</title>
  <link rel="apple-touch-icon" href="/touch.png"></head></html>`;

const TWO_ICON_PAGE = `<title>First Bank</title><link rel="icon" href="/fav.png">
  <link rel="apple-touch-icon" href="/touch.png">`;

const NOT_AN_IMAGE = answer(200, 'text/html', '<p>sign in</p>');

function chain(from: string, hops: number, last: Route): Record<string, Route> {
  const routes: Record<string, Route> = {};

  for (let hop = 0; hop < hops; hop++) {
    routes[hop === 0 ? from : `${from}-${hop}`] = redirect(
      `${from}-${hop + 1}`,
    );
  }

  routes[hops === 0 ? from : `${from}-${hops}`] = last;

  return routes;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('readSite page', () => {
  it('reads the name from the page and the bytes of its icon', async () => {
    const site = fakeSite({
      'https://firstbank.com/': html(PAGE),
      'https://firstbank.com/touch.png': png(),
    });

    expect(await readSite('firstbank.com', site)).toEqual({
      name: 'First Bank',
      icon: { bytes: PNG, contentType: 'image/png' },
    });
  });

  it('requests the host exactly as given', async () => {
    const site = fakeSite({ 'https://www.firstbank.com/': html(PAGE) });

    await readSite('www.firstbank.com', site);

    expect(requestedUrls(site)[0]).toBe('https://www.firstbank.com/');
  });

  it('follows redirects and resolves the icon against the page it landed on', async () => {
    const site = fakeSite({
      'https://firstbank.com/': redirect('https://www.firstbancorp.com/home'),
      'https://www.firstbancorp.com/home': html(
        `<title>First Bancorp</title><link rel="icon" href="img/fav.png">`,
      ),
      'https://www.firstbancorp.com/img/fav.png': png(),
    });

    expect(await readSite('firstbank.com', site)).toEqual({
      name: 'First Bancorp',
      icon: { bytes: PNG, contentType: 'image/png' },
    });
  });

  it('follows five redirects', async () => {
    const site = fakeSite(chain('https://firstbank.com/', 5, html(PAGE)));

    expect((await readSite('firstbank.com', site))?.name).toBe('First Bank');
  });

  it('gives up on a sixth redirect', async () => {
    const site = fakeSite(chain('https://firstbank.com/', 6, html(PAGE)));

    expect(await readSite('firstbank.com', site)).toBeNull();
    expect(requestedUrls(site)).not.toContain('https://firstbank.com/-6');
  });

  it('never requests a host that resolves to a private address', async () => {
    const site = fakeSite({ 'https://intranet.corp/': html(PAGE) }, [
      'intranet.corp',
    ]);

    expect(await readSite('intranet.corp', site)).toBeNull();
    expect(site.requests).toEqual([]);
  });

  it('never requests an IP literal', async () => {
    const site = fakeSite({ 'https://169.254.169.254/': html(PAGE) });

    expect(await readSite('169.254.169.254', site)).toBeNull();
    expect(site.requests).toEqual([]);
  });

  it.each([
    ['a host resolving to a private address', 'https://intranet.corp/admin'],
    ['an IP literal', 'https://169.254.169.254/latest/meta-data/'],
    ['plain http', 'http://firstbank.com/'],
    ['a port other than 443', 'https://firstbank.com:8443/'],
    ['a scheme other than https', 'ftp://firstbank.com/'],
  ])('stops at a redirect to %s without requesting it', async (_label, to) => {
    const site = fakeSite(
      { 'https://firstbank.com/': redirect(to), [to]: html(PAGE) },
      ['intranet.corp'],
    );

    expect(await readSite('firstbank.com', site)).toBeNull();
    expect(requestedUrls(site)).toEqual(['https://firstbank.com/']);
  });

  it.each([
    ['no Location', undefined],
    ['a Location that is not a URL', 'https://[not-a-host'],
  ])('has no brand for a redirect with %s', async (_label, location) => {
    const site = fakeSite({ 'https://firstbank.com/': redirect(location) });

    expect(await readSite('firstbank.com', site)).toBeNull();
  });

  it('connects to the address that passed the check, even when the name later resolves elsewhere', async () => {
    const fake = fakeSite({
      'https://firstbank.com/': html(PAGE),
      'https://firstbank.com/touch.png': png(),
      'https://firstbank.com/favicon.ico': png(),
    });
    let lookups = 0;

    const brand = await readSite('firstbank.com', {
      request: fake.request,
      lookup: async () => [
        {
          address: lookups++ === 0 ? PUBLIC_ADDRESS : PRIVATE_ADDRESS,
          family: 4,
        },
      ],
    });

    expect(brand).toEqual({ name: 'First Bank', icon: null });
    expect(fake.requests.map(({ url, address }) => ({ url, address }))).toEqual(
      [{ url: 'https://firstbank.com/', address: PUBLIC_ADDRESS }],
    );
  });

  it('has no brand for an unreachable site', async () => {
    const site = fakeSite({
      'https://firstbank.com/': () => {
        throw new Error('connect ECONNREFUSED');
      },
    });

    expect(await readSite('firstbank.com', site)).toBeNull();
  });

  it('has no brand for a site whose name does not resolve', async () => {
    const brand = await readSite('firstbank.com', {
      request: fakeSite({ 'https://firstbank.com/': html(PAGE) }).request,
      lookup: async () => {
        throw new Error('getaddrinfo ENOTFOUND firstbank.com');
      },
    });

    expect(brand).toBeNull();
  });

  it.each([
    ['is not HTML', 'application/json'],
    ['declares no content type', undefined],
  ])('has no brand for a page that %s', async (_label, contentType) => {
    const site = fakeSite({
      'https://firstbank.com/': answer(200, contentType, PAGE),
      'https://firstbank.com/touch.png': png(),
    });

    expect(await readSite('firstbank.com', site)).toBeNull();
  });

  it.each([403, 404, 500])(
    'has no brand when the page answers %i, even with HTML',
    async (status) => {
      const site = fakeSite({
        'https://firstbank.com/': answer(
          status,
          'text/html',
          '<title>Just a moment...</title>',
        ),
        'https://firstbank.com/favicon.ico': png(),
      });

      expect(await readSite('firstbank.com', site)).toBeNull();
    },
  );

  it('has no brand when the page body fails part way', async () => {
    const site = fakeSite({
      'https://firstbank.com/': () => ({
        status: 200,
        location: undefined,
        contentType: 'text/html',
        body: (async function* () {
          yield Buffer.from('<title>First Bank</title>');
          throw new Error('aborted');
        })(),
      }),
    });

    expect(await readSite('firstbank.com', site)).toBeNull();
  });

  it('stops reading a page that never ends once it has a mebibyte', async () => {
    let chunks = 0;
    const site = fakeSite({
      'https://firstbank.com/': () => ({
        status: 200,
        location: undefined,
        contentType: 'text/html',
        body: (async function* () {
          yield Buffer.from('<title>First Bank</title>');

          for (;;) {
            chunks += 1;
            yield Buffer.alloc(MIB / 4, ' ');
          }
        })(),
      }),
    });

    expect((await readSite('firstbank.com', site))?.name).toBe('First Bank');
    expect(chunks).toBeLessThanOrEqual(5);
  });

  it('has no brand for a page with neither a name nor a usable icon', async () => {
    const site = fakeSite({
      'https://firstbank.com/': html('<html><body>hello</body></html>'),
    });

    expect(await readSite('firstbank.com', site)).toBeNull();
  });

  it('keeps a page that has an icon but no name', async () => {
    const site = fakeSite({
      'https://firstbank.com/': html('<html><body>hello</body></html>'),
      'https://firstbank.com/favicon.ico': png(),
    });

    expect(await readSite('firstbank.com', site)).toEqual({
      name: null,
      icon: { bytes: PNG, contentType: 'image/png' },
    });
  });

  it('lets go of every request once it is done', async () => {
    const site = fakeSite({
      'https://firstbank.com/': redirect('/home'),
      'https://firstbank.com/home': html(PAGE),
      'https://firstbank.com/touch.png': png(),
    });

    await readSite('firstbank.com', site);

    expect(site.requests.map((request) => request.signal.aborted)).toEqual([
      true,
      true,
      true,
    ]);
  });
});

describe('readSite icon', () => {
  it('keeps an icon of exactly two mebibytes', async () => {
    const site = fakeSite({
      'https://firstbank.com/': html(PAGE),
      'https://firstbank.com/touch.png': png(pngOfSize(2 * MIB)),
    });

    expect((await readSite('firstbank.com', site))?.icon?.bytes).toHaveLength(
      2 * MIB,
    );
  });

  it.each<[string, Record<string, Route>]>([
    [
      'is larger than two mebibytes',
      { 'https://firstbank.com/touch.png': png(pngOfSize(2 * MIB + 1)) },
    ],
    ['is missing', {}],
    ['is not image bytes', { 'https://firstbank.com/touch.png': NOT_AN_IMAGE }],
    [
      'is declared an image but is not one',
      {
        'https://firstbank.com/touch.png': answer(
          200,
          'image/png',
          '<p>sign in</p>',
        ),
      },
    ],
    [
      'is an error answered with an image',
      { 'https://firstbank.com/touch.png': answer(404, 'image/png', PNG) },
    ],
    [
      'cannot be fetched',
      {
        'https://firstbank.com/touch.png': () => {
          throw new Error('socket hang up');
        },
      },
    ],
    [
      'fails part way through its body',
      {
        'https://firstbank.com/touch.png': () => ({
          status: 200,
          location: undefined,
          contentType: 'image/png',
          body: (async function* () {
            yield PNG;
            throw new Error('aborted');
          })(),
        }),
      },
    ],
    [
      'redirects to a private host',
      {
        'https://firstbank.com/touch.png': redirect(
          'https://intranet.corp/logo.png',
        ),
        'https://intranet.corp/logo.png': png(),
      },
    ],
  ])('keeps the name with no icon when the icon %s', async (_label, routes) => {
    const site = fakeSite({ 'https://firstbank.com/': html(PAGE), ...routes }, [
      'intranet.corp',
    ]);

    expect(await readSite('firstbank.com', site)).toEqual({
      name: 'First Bank',
      icon: null,
    });
    expect(requestedUrls(site)).not.toContain('https://intranet.corp/logo.png');
  });

  it('takes the type of an icon from its bytes, not from what the site declares', async () => {
    const site = fakeSite({
      'https://firstbank.com/': html(PAGE),
      'https://firstbank.com/touch.png': answer(200, 'text/plain', PNG),
    });

    expect((await readSite('firstbank.com', site))?.icon).toEqual({
      bytes: PNG,
      contentType: 'image/png',
    });
  });

  it('falls through to rel icon when the apple-touch-icon is not usable', async () => {
    const site = fakeSite({
      'https://firstbank.com/': html(TWO_ICON_PAGE),
      'https://firstbank.com/touch.png': NOT_AN_IMAGE,
      'https://firstbank.com/fav.png': png(),
    });

    expect((await readSite('firstbank.com', site))?.icon?.bytes).toEqual(PNG);
    expect(requestedUrls(site)).toEqual([
      'https://firstbank.com/',
      'https://firstbank.com/touch.png',
      'https://firstbank.com/fav.png',
    ]);
  });

  it('falls through to /favicon.ico when every linked icon fails', async () => {
    const site = fakeSite({
      'https://firstbank.com/': html(TWO_ICON_PAGE),
      'https://firstbank.com/fav.png': () => {
        throw new Error('socket hang up');
      },
      'https://firstbank.com/favicon.ico': png(),
    });

    expect((await readSite('firstbank.com', site))?.icon?.bytes).toEqual(PNG);
  });

  it.each([
    ['is not a URL', 'https://[not-a-host/icon.png'],
    ['is plain http', 'http://firstbank.com/touch.png'],
  ])('skips a linked icon whose address %s', async (_label, href) => {
    const site = fakeSite({
      'https://firstbank.com/': html(
        `<title>First Bank</title><link rel="icon" href="${href}">`,
      ),
      'http://firstbank.com/touch.png': png(),
      'https://firstbank.com/favicon.ico': png(),
    });

    expect((await readSite('firstbank.com', site))?.icon?.bytes).toEqual(PNG);
    expect(requestedUrls(site)).toEqual([
      'https://firstbank.com/',
      'https://firstbank.com/favicon.ico',
    ]);
  });
});

describe('readSite limits', () => {
  it('gives a single request five seconds', async () => {
    vi.useFakeTimers();

    const site = fakeSite({
      'https://firstbank.com/': after(60_000, html(PAGE)),
    });
    let brand: unknown = 'pending';
    const reading = readSite('firstbank.com', site).then((result) => {
      brand = result;
    });

    await vi.advanceTimersByTimeAsync(4_999);
    expect(brand).toBe('pending');

    await vi.advanceTimersByTimeAsync(1);
    await reading;
    expect(brand).toBeNull();
  });

  it('has no brand when the page and its icons together take more than fifteen seconds', async () => {
    vi.useFakeTimers();

    const site = fakeSite({
      'https://firstbank.com/': after(4_000, html(TWO_ICON_PAGE)),
      'https://firstbank.com/touch.png': after(4_000, NOT_AN_IMAGE),
      'https://firstbank.com/fav.png': after(4_000, NOT_AN_IMAGE),
      'https://firstbank.com/favicon.ico': after(4_000, png()),
    });
    let brand: unknown = 'pending';
    const reading = readSite('firstbank.com', site).then((result) => {
      brand = result;
    });

    await vi.advanceTimersByTimeAsync(14_999);
    expect(brand).toBe('pending');

    await vi.advanceTimersByTimeAsync(1);
    await reading;
    expect(brand).toBeNull();
  });

  it('allows eight requests in one lookup', async () => {
    const site = fakeSite({
      ...chain('https://firstbank.com/', 3, html(TWO_ICON_PAGE)),
      ...chain('https://firstbank.com/touch.png', 3, png()),
    });

    expect((await readSite('firstbank.com', site))?.icon?.bytes).toEqual(PNG);
    expect(site.requests).toHaveLength(8);
  });

  it('has no brand when a lookup would need a ninth request', async () => {
    const site = fakeSite({
      ...chain('https://firstbank.com/', 3, html(TWO_ICON_PAGE)),
      ...chain('https://firstbank.com/touch.png', 3, NOT_AN_IMAGE),
      'https://firstbank.com/fav.png': png(),
    });

    expect(await readSite('firstbank.com', site)).toBeNull();
    expect(site.requests).toHaveLength(8);
  });
});
