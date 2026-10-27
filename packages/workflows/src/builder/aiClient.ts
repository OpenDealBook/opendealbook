import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';

import { ApplicationFailure } from '@temporalio/common';

import { AI_PROVIDER_TIMEOUT_MS } from './nodeKinds';
import { AddressNotFound, publicAddressOf, type VettedAddress } from './publicUrl';

const ANTHROPIC_MAX_TOKENS = 4096;

export interface AiEndpoint {
  provider: 'openai' | 'anthropic' | 'openai_compatible';
  model: string;
  baseUrl: string;
  apiKey: string;
}

export interface AiCompletion {
  text: string;
  promptTokens: number;
  completionTokens: number;
}

interface Connection {
  connectTo: (url: string) => Promise<VettedAddress | null>;
  timeoutMs: number;
  signal?: AbortSignal;
}

const PUBLIC_ONLY: Connection = { connectTo: publicAddressOf, timeoutMs: AI_PROVIDER_TIMEOUT_MS };

function pinnedLookup({ address, family }: VettedAddress): LookupFunction {
  return (_hostname, options, callback) =>
    options.all ? callback(null, [{ address, family }]) : callback(null, address, family);
}

type PinnedConnection = { connectTo?: Connection['connectTo']; timeoutMs: number; signal?: AbortSignal };

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
  const target = await (connection.connectTo ?? publicAddressOf)(`${origin}${pathname}`).catch((error: unknown) => {
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
        incoming.on('end', () => resolve({ status: incoming.statusCode!, text }));
        incoming.on('error', reject);
      },
    );
    request.on('error', reject);
    request.end(payload);
  });
}

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  connection: Connection,
): Promise<unknown> {
  const response = await pinnedPost(url, headers, body, connection);
  if (response.status >= 500) {
    throw new Error(`The AI provider answered ${response.status}`);
  }
  if (response.status >= 300) {
    throw ApplicationFailure.nonRetryable(`The AI provider answered ${response.status}`);
  }
  try {
    return JSON.parse(response.text);
  } catch {
    throw ApplicationFailure.nonRetryable('The AI provider answered with something that is not JSON');
  }
}

export async function completeWithTeamAi(
  endpoint: AiEndpoint,
  prompt: string,
  overrides: Partial<Connection> = {},
): Promise<AiCompletion> {
  const connection = { ...PUBLIC_ONLY, ...overrides };
  const messages = [{ role: 'user', content: prompt }];

  if (endpoint.provider === 'anthropic') {
    const reply = (await post(
      `${endpoint.baseUrl}/messages`,
      { 'x-api-key': endpoint.apiKey, 'anthropic-version': '2023-06-01' },
      { model: endpoint.model, max_tokens: ANTHROPIC_MAX_TOKENS, messages },
      connection,
    )) as {
      content: { text: string }[];
      usage: { input_tokens: number; output_tokens: number };
    };
    return {
      text: reply.content.map((block) => block.text).join(''),
      promptTokens: reply.usage.input_tokens,
      completionTokens: reply.usage.output_tokens,
    };
  }

  const reply = (await post(
    `${endpoint.baseUrl}/chat/completions`,
    { authorization: `Bearer ${endpoint.apiKey}` },
    { model: endpoint.model, messages },
    connection,
  )) as {
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number };
  };
  return {
    text: reply.choices[0]!.message.content,
    promptTokens: reply.usage.prompt_tokens,
    completionTokens: reply.usage.completion_tokens,
  };
}
