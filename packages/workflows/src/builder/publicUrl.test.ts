import { afterEach, describe, expect, it, vi } from 'vitest';

import { AddressNotFound, isPublicHttpsUrl } from './publicUrl';

function resolvingTo(...addresses: string[]) {
  return async () => addresses.map((address) => ({ address }));
}

const PUBLIC = resolvingTo('93.184.216.34');

afterEach(() => {
  vi.useRealTimers();
});

describe('isPublicHttpsUrl', () => {
  it('accepts an https URL whose host resolves only to public addresses', async () => {
    expect(await isPublicHttpsUrl('https://llm.example.com:8443/v1', PUBLIC)).toBe(true);
  });

  it.each([
    'http://llm.example.com/v1',
    'https://llm.example.com/v1?key=1',
    'https://llm.example.com/v1#frag',
    'https://user:pass@llm.example.com/v1',
    'https://localhost/v1',
    'https://api.localhost/v1',
    'https://metadata.google.internal/v1',
    'https://printer.local/v1',
    'https://intranet/v1',
    'not a url',
  ])('refuses %s', async (url) => {
    expect(await isPublicHttpsUrl(url, PUBLIC)).toBe(false);
  });

  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.1',
    '192.168.0.9',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('refuses a host that resolves to %s', async (address) => {
    expect(await isPublicHttpsUrl('https://llm.example.com/v1', resolvingTo('93.184.216.34', address))).toBe(
      false,
    );
  });

  it('refuses a literal private address without needing DNS', async () => {
    expect(await isPublicHttpsUrl('https://10.0.0.5/v1', PUBLIC)).toBe(false);
    expect(await isPublicHttpsUrl('https://[::1]/v1', PUBLIC)).toBe(false);
  });

  it.each([
    ['ENOTFOUND', false],
    ['EAI_AGAIN', true],
    ['ETIMEOUT', true],
  ])('reports a host DNS cannot find (%s) as an address it could not find', async (code, retryable) => {
    const failing = async () => {
      throw Object.assign(new Error(`getaddrinfo ${code} models.example.com`), { code });
    };

    const failure = await isPublicHttpsUrl('https://models.example.com/v1', failing).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(AddressNotFound);
    expect(failure).toMatchObject({
      message: "We couldn't find that address. Check the base URL.",
      retryable,
    });
  });

  it('gives up on a lookup that never answers after 10 seconds, as a retryable address it could not find', async () => {
    vi.useFakeTimers();
    const silent = () => new Promise<{ address: string }[]>(() => {});
    let settled = false;

    const failure = isPublicHttpsUrl('https://models.example.com/v1', silent).catch((error: unknown) => {
      settled = true;
      return error;
    });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await failure).toBeInstanceOf(AddressNotFound);
    expect(await failure).toMatchObject({
      message: "We couldn't find that address. Check the base URL.",
      retryable: true,
    });
  });
});
