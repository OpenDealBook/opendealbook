import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

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

const TEAM_AI: Connection = { connectTo: teamAiAddressOf, timeoutMs: AI_PROVIDER_TIMEOUT_MS };

async function anyAddressOf(url: string): Promise<VettedAddress> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  const { address, family } = isIP(host) ? { address: host, family: isIP(host) } : await lookup(host);
  return { address, family: family as 4 | 6 };
}

export function privateAiUrlsAllowed(): boolean {
  const devStack = process.env.ODB_STACK === 'local' || process.env.ODB_STACK === 'e2e';
  return devStack && process.env.ODB_ALLOW_PRIVATE_AI_URL === '1';
}

export function teamAiAddressOf(url: string): Promise<VettedAddress | null> {
  return privateAiUrlsAllowed() ? anyAddressOf(url) : publicAddressOf(url);
}

export function aiJson(text: string): unknown {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, '$1'));
}

export interface AiRequest {
  system?: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

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

export async function postToAiProvider(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  overrides: Partial<Connection> = {},
): Promise<unknown> {
  const response = await pinnedPost(url, headers, body, { ...TEAM_AI, ...overrides });
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
  { system, json, temperature, maxTokens }: AiRequest = {},
): Promise<AiCompletion> {
  const messages = [{ role: 'user', content: prompt }];

  if (endpoint.provider === 'anthropic') {
    const reply = (await postToAiProvider(
      `${endpoint.baseUrl}/messages`,
      { 'x-api-key': endpoint.apiKey, 'anthropic-version': '2023-06-01' },
      { model: endpoint.model, max_tokens: maxTokens ?? ANTHROPIC_MAX_TOKENS, system, temperature, messages },
      overrides,
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

  const reply = (await postToAiProvider(
    `${endpoint.baseUrl}/chat/completions`,
    { authorization: `Bearer ${endpoint.apiKey}` },
    {
      model: endpoint.model,
      messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
      temperature,
      max_tokens: maxTokens,
      response_format: json ? { type: 'json_object' } : undefined,
    },
    overrides,
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
