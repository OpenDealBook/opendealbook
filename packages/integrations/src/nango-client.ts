import { Nango } from '@nangohq/node';

const DEFAULT_NANGO_HOST = 'http://localhost:3003';

export function getNangoClient(): Nango {
  const secretKey = process.env.NANGO_SECRET_KEY;

  if (!secretKey) {
    throw new Error('Missing required environment variable: NANGO_SECRET_KEY');
  }

  return new Nango({
    secretKey,
    host: process.env.NANGO_HOST ?? DEFAULT_NANGO_HOST,
  });
}
