import { formatApiKey, hashRawKey } from './auth';

import { randomBytes } from 'node:crypto';

const PREFIX_BYTES = 6;
const SECRET_BYTES = 24;

export interface GeneratedApiKey {
  rawKey: string;
  prefix: string;
  hash: string;
}

export function generateApiKey(): GeneratedApiKey {
  const prefix = randomBytes(PREFIX_BYTES).toString('hex');
  const secret = randomBytes(SECRET_BYTES).toString('hex');
  const rawKey = formatApiKey(prefix, secret);

  return { rawKey, prefix, hash: hashRawKey(`${prefix}_${secret}`) };
}
