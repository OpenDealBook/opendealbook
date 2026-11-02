import { ApplicationFailure } from '@temporalio/common';

import { estimatedTokens, estimatedUsage, type Usage } from './modelPrices';
import { AI_PROVIDER_TIMEOUT_MS } from './nodeKinds';
import {
  AddressNotFound,
  publicAddressOf,
  type VettedAddress,
} from './publicUrl';

import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

export const DEFAULT_MAX_TOKENS = 4096;

export interface AiEndpoint {
  provider: 'openai' | 'anthropic' | 'openai_compatible';
  model: string;
  baseUrl: string;
  apiKey: string;
}

export interface AiCompletion {
  text: string;
  usage: Usage;
}

interface Connection {
  connectTo: (url: string) => Promise<VettedAddress | null>;
  timeoutMs: number;
  signal?: AbortSignal;
}

const TEAM_AI: Connection = {
  connectTo: teamAiAddressOf,
  timeoutMs: AI_PROVIDER_TIMEOUT_MS,
};

async function anyAddressOf(url: string): Promise<VettedAddress> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  const { address, family } = isIP(host)
    ? { address: host, family: isIP(host) }
    : await lookup(host);
  return { address, family: family as 4 | 6 };
}

export function privateAiUrlsAllowed(): boolean {
  const devStack =
    process.env.ODB_STACK === 'local' || process.env.ODB_STACK === 'e2e';
  return devStack && process.env.ODB_ALLOW_PRIVATE_AI_URL === '1';
}

const DEFAULT_PORTS: Record<string, string> = {
  'https:': '443',
  'http:': '80',
};

export function operatorListsPrivateAiHost(url: string): boolean {
  const { protocol, port, hostname } = new URL(url);
  const defaultPort = DEFAULT_PORTS[protocol];
  const listed = (process.env.ODB_PRIVATE_AI_HOSTS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase());
  return (
    defaultPort !== undefined &&
    (listed.includes(hostname) ||
      listed.includes(`${hostname}:${port || defaultPort}`))
  );
}

export function devOrPublicAddressOf(
  url: string,
): Promise<VettedAddress | null> {
  return privateAiUrlsAllowed() ? anyAddressOf(url) : publicAddressOf(url);
}

export function teamAiAddressOf(url: string): Promise<VettedAddress | null> {
  return operatorListsPrivateAiHost(url)
    ? anyAddressOf(url)
    : devOrPublicAddressOf(url);
}

export function aiJson(text: string): unknown {
  return JSON.parse(
    text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, '$1'),
  );
}

export interface AiRequest {
  system?: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

function pinnedLookup({ address, family }: VettedAddress): LookupFunction {
  return (_hostname, options, callback) =>
    options.all
      ? callback(null, [{ address, family }])
      : callback(null, address, family);
}

type PinnedConnection = {
  connectTo?: Connection['connectTo'];
  timeoutMs: number;
  signal?: AbortSignal;
};

export function pinnedPost(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  connection: PinnedConnection,
): Promise<{ status: number; text: string }> {
  return pinnedRequest(
    'POST',
    url,
    { 'content-type': 'application/json', ...headers },
    JSON.stringify(body),
    connection,
  );
}

export function pinnedGet(
  url: string,
  headers: Record<string, string>,
  connection: PinnedConnection,
): Promise<{ status: number; text: string }> {
  return pinnedRequest('GET', url, headers, undefined, connection);
}

async function pinnedRequest(
  method: 'GET' | 'POST',
  url: string,
  headers: Record<string, string>,
  payload: string | undefined,
  connection: PinnedConnection,
): Promise<{ status: number; text: string }> {
  const { origin, pathname } = new URL(url);
  const target = await (connection.connectTo ?? publicAddressOf)(
    `${origin}${pathname}`,
  ).catch((error: unknown) => {
    if (error instanceof AddressNotFound && !error.retryable) {
      throw ApplicationFailure.nonRetryable(error.message);
    }
    throw error;
  });
  if (!target) {
    throw ApplicationFailure.nonRetryable('Use a public HTTPS base URL');
  }
  return new Promise((resolve, reject) => {
    const request = (url.startsWith('https:') ? https : http).request(
      url,
      {
        method,
        headers,
        lookup: pinnedLookup(target),
        signal: AbortSignal.any([
          AbortSignal.timeout(connection.timeoutMs),
          ...(connection.signal ? [connection.signal] : []),
        ]),
      },
      (incoming) => {
        let text = '';
        incoming.setEncoding('utf8');
        incoming.on('data', (chunk: string) => (text += chunk));
        incoming.on('end', () =>
          resolve({ status: incoming.statusCode!, text }),
        );
        incoming.on('error', reject);
      },
    );
    request.on('error', reject);
    request.end(payload);
  });
}

export async function postToAiProvider(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  overrides: Partial<Connection> = {},
): Promise<unknown> {
  const response = await pinnedPost(url, headers, body, {
    ...TEAM_AI,
    ...overrides,
  });
  if (response.status >= 500) {
    throw new Error(`The AI provider answered ${response.status}`);
  }
  if (response.status >= 300) {
    throw ApplicationFailure.nonRetryable(
      `The AI provider answered ${response.status}`,
    );
  }
  try {
    return JSON.parse(response.text);
  } catch {
    throw ApplicationFailure.nonRetryable(
      'The AI provider answered with something that is not JSON',
    );
  }
}

export async function completeWithTeamAi(
  endpoint: AiEndpoint,
  prompt: string,
  overrides: Partial<Connection> = {},
  { system, json, temperature, maxTokens }: AiRequest = {},
): Promise<AiCompletion> {
  const messages = [{ role: 'user', content: prompt }];
  const replyUsage = (text: string): Usage =>
    estimatedUsage((system ?? '') + prompt, estimatedTokens(text));

  if (endpoint.provider === 'anthropic') {
    const reply = (await postToAiProvider(
      `${endpoint.baseUrl}/messages`,
      { 'x-api-key': endpoint.apiKey, 'anthropic-version': '2023-06-01' },
      {
        model: endpoint.model,
        max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
        system,
        temperature,
        messages,
      },
      overrides,
    )) as {
      content: { text: string }[];
      usage?: {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
    };
    const text = reply.content.map((block) => block.text).join('');
    return {
      text,
      usage: reply.usage
        ? {
            inputTokens: reply.usage.input_tokens,
            cachedInputTokens: reply.usage.cache_read_input_tokens ?? 0,
            cacheWriteTokens: reply.usage.cache_creation_input_tokens ?? 0,
            outputTokens: reply.usage.output_tokens,
          }
        : replyUsage(text),
    };
  }

  const reply = (await postToAiProvider(
    `${endpoint.baseUrl}/chat/completions`,
    { authorization: `Bearer ${endpoint.apiKey}` },
    {
      model: endpoint.model,
      messages: system
        ? [{ role: 'system', content: system }, ...messages]
        : messages,
      temperature,
      max_tokens: maxTokens,
      response_format: json ? { type: 'json_object' } : undefined,
    },
    overrides,
  )) as {
    choices: { message: { content: string } }[];
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      prompt_tokens_details?: { cached_tokens?: number };
    };
  };
  const text = reply.choices[0]!.message.content;
  if (!reply.usage) {
    return { text, usage: replyUsage(text) };
  }
  const cached = reply.usage.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    text,
    usage: {
      inputTokens: reply.usage.prompt_tokens - cached,
      cachedInputTokens: cached,
      cacheWriteTokens: 0,
      outputTokens: reply.usage.completion_tokens,
    },
  };
}
