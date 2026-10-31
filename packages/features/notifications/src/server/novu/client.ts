import { Novu } from '@novu/node';

import type { NovuClient } from './adapter';

export function createNovuClient(): NovuClient {
  const secretKey = process.env.NOVU_API_KEY;
  const backendUrl = process.env.NOVU_API_URL;

  if (!secretKey) {
    throw new Error('Missing required environment variable: NOVU_API_KEY');
  }

  if (!backendUrl) {
    throw new Error('Missing required environment variable: NOVU_API_URL');
  }

  const novu = new Novu(secretKey, { backendUrl });
  (
    novu as unknown as { http: { defaults: { timeout: number } } }
  ).http.defaults.timeout = 15_000;

  return novu as unknown as NovuClient;
}
