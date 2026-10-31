import { ApplicationFailure } from '@temporalio/common';

import { pinnedGet, pinnedPost } from '../../builder/aiClient';
import { parsedJson } from '../../builder/teamAi';

const BROKER_TIMEOUT_MS = 60_000;

export interface BrokerCredentials {
  apiKey: string;
  baseUrl: string;
}

export interface BrokerFirm {
  name: string;
  city: string | null;
  state: string | null;
}

export interface BrokerRecord {
  source: 'baselayer' | 'middesk';
  kind: 'ucc' | 'tax_lien' | 'judgment_lien' | 'unknown' | 'litigation' | 'bankruptcy';
  title: string;
  reference: string;
  jurisdiction: string | null;
  filedOn: string | null;
  open: boolean | null;
  raw: unknown;
}

export type BrokerOutcome<Pending> =
  | Pending
  | { status: 'done'; records: BrokerRecord[] }
  | { status: 'refused' }
  | { status: 'not_checked' };

export class BrokerRefused extends Error {}

export async function brokerJson(
  broker: string,
  request: { url: string; headers: Record<string, string>; body?: unknown; signal?: AbortSignal },
): Promise<unknown> {
  const connection = { timeoutMs: BROKER_TIMEOUT_MS, signal: request.signal };
  const response =
    request.body === undefined
      ? await pinnedGet(request.url, request.headers, connection)
      : await pinnedPost(request.url, request.headers, request.body, connection);
  if (response.status === 401 || response.status === 403) {
    throw new BrokerRefused(`${broker} refused the key`);
  }
  if (response.status === 429 || response.status >= 500) {
    throw new Error(`${broker} answered ${response.status}`);
  }
  if (response.status >= 300) {
    throw ApplicationFailure.nonRetryable(`${broker} answered ${response.status}`);
  }
  const body = parsedJson(response.text);
  if (body === undefined) {
    throw ApplicationFailure.nonRetryable(`${broker} answered with something that is not JSON`);
  }
  return body;
}
