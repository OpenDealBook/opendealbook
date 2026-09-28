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

  return new Novu(secretKey, { backendUrl }) as unknown as NovuClient;
}
