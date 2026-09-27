import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const constructorSpy = vi.fn();

vi.mock('@nangohq/node', () => ({
  Nango: class {
    constructor(config: unknown) {
      constructorSpy(config);
    }
  },
}));

import { getNangoClient } from './nango-client';

describe('getNangoClient', () => {
  beforeEach(() => {
    constructorSpy.mockClear();
    delete process.env.NANGO_SECRET_KEY;
    delete process.env.NANGO_HOST;
  });

  afterEach(() => {
    delete process.env.NANGO_SECRET_KEY;
    delete process.env.NANGO_HOST;
  });

  it('defaults the host to the local compose Nango', () => {
    process.env.NANGO_SECRET_KEY = 'secret';

    getNangoClient();

    expect(constructorSpy).toHaveBeenCalledWith({
      secretKey: 'secret',
      host: 'http://localhost:3003',
    });
  });

  it('uses NANGO_HOST when set', () => {
    process.env.NANGO_SECRET_KEY = 'secret';
    process.env.NANGO_HOST = 'https://nango.example.com';

    getNangoClient();

    expect(constructorSpy).toHaveBeenCalledWith({
      secretKey: 'secret',
      host: 'https://nango.example.com',
    });
  });

  it('throws when NANGO_SECRET_KEY is missing', () => {
    expect(() => getNangoClient()).toThrow('NANGO_SECRET_KEY');
  });
});
