import { ApplicationFailure } from '@temporalio/common';
import { z } from 'zod';

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
      usage?: AnthropicUsage;
    };
    const text = reply.content.map((block) => block.text).join('');
    return {
      text,
      usage: reply.usage ? anthropicUsage(reply.usage) : replyUsage(text),
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
    usage?: OpenAiUsage;
  };
  const text = reply.choices[0]!.message.content;
  return {
    text,
    usage: reply.usage ? openAiUsage(reply.usage) : replyUsage(text),
  };
}

type OpenAiUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number };
};

function openAiUsage(usage: OpenAiUsage): Usage {
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    inputTokens: usage.prompt_tokens - cached,
    cachedInputTokens: cached,
    cacheWriteTokens: 0,
    outputTokens: usage.completion_tokens,
  };
}

type AnthropicUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

function anthropicUsage(usage: AnthropicUsage): Usage {
  return {
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    outputTokens: usage.output_tokens,
  };
}

export type ToolCall = { id: string; name: string; input: unknown };

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ConversationMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string; isError?: true };

export type Conversation = {
  system?: string;
  messages: ConversationMessage[];
  tools: ToolDefinition[];
  maxTokens?: number;
  toolChoice?: 'none';
};

export type ConversationTurn = {
  text: string;
  toolCalls: ToolCall[];
  stopReason: 'tool_use' | 'end' | 'max_tokens';
  usage: Usage;
};

const anthropicTurn = z.object({
  content: z.array(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('text'), text: z.string() }),
      z.object({
        type: z.literal('tool_use'),
        id: z.string(),
        name: z.string(),
        input: z.unknown(),
      }),
    ]),
  ),
  stop_reason: z
    .enum(['end_turn', 'tool_use', 'max_tokens'])
    .transform((reason) => (reason === 'end_turn' ? 'end' : reason)),
  usage: z
    .object({
      input_tokens: z.number(),
      output_tokens: z.number(),
      cache_read_input_tokens: z.number().optional(),
      cache_creation_input_tokens: z.number().optional(),
    })
    .optional(),
});

type AnthropicContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | {
      type: 'tool_result';
      tool_use_id: string;
      content: string;
      is_error?: true;
    };

function anthropicMessages(messages: ConversationMessage[]) {
  const sent: {
    role: 'user' | 'assistant';
    content: string | AnthropicContent[];
  }[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      sent.push({ role: 'user', content: message.text });
    } else if (message.role === 'assistant') {
      sent.push({
        role: 'assistant',
        content: [
          ...(message.text
            ? [{ type: 'text' as const, text: message.text }]
            : []),
          ...message.toolCalls.map(({ id, name, input }) => ({
            type: 'tool_use' as const,
            id,
            name,
            input,
          })),
        ],
      });
    } else {
      const result = {
        type: 'tool_result' as const,
        tool_use_id: message.toolCallId,
        content: message.content,
        is_error: message.isError,
      };
      const last = sent.at(-1);
      if (last?.role === 'user' && Array.isArray(last.content)) {
        last.content.push(result);
      } else {
        sent.push({ role: 'user', content: [result] });
      }
    }
  }
  return sent;
}

function readReply<T>(schema: z.ZodType<T>, reply: unknown): T {
  const parsed = schema.safeParse(reply);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(
      'The AI provider answered with a reply this call cannot read',
    );
  }
  return parsed.data;
}

function conversationText(
  system: string | undefined,
  messages: ConversationMessage[],
): string {
  return (
    (system ?? '') +
    messages
      .map((message) =>
        message.role === 'user'
          ? message.text
          : message.role === 'assistant'
            ? message.text + toolCallText(message.toolCalls)
            : message.content,
      )
      .join('')
  );
}

function toolCallText(toolCalls: ToolCall[]): string {
  return toolCalls.map((call) => JSON.stringify(call.input)).join('');
}

function estimatedTurnUsage(
  { system, messages }: Conversation,
  text: string,
  toolCalls: ToolCall[],
): Usage {
  return estimatedUsage(
    conversationText(system, messages),
    estimatedTokens(text + toolCallText(toolCalls)),
  );
}

export function converseWithTeamAi(
  endpoint: AiEndpoint,
  conversation: Conversation,
  overrides: Partial<Connection> = {},
): Promise<ConversationTurn> {
  return endpoint.provider === 'anthropic'
    ? converseWithAnthropic(endpoint, conversation, overrides)
    : converseWithOpenAi(endpoint, conversation, overrides);
}

async function converseWithAnthropic(
  endpoint: AiEndpoint,
  conversation: Conversation,
  overrides: Partial<Connection>,
): Promise<ConversationTurn> {
  const { system, messages, tools, maxTokens, toolChoice } = conversation;
  const reply = readReply(
    anthropicTurn,
    await postToAiProvider(
      `${endpoint.baseUrl}/messages`,
      { 'x-api-key': endpoint.apiKey, 'anthropic-version': '2023-06-01' },
      {
        model: endpoint.model,
        max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
        system,
        tools: tools.map(({ name, description, inputSchema }) => ({
          name,
          description,
          input_schema: inputSchema,
        })),
        tool_choice: toolChoice && { type: toolChoice },
        messages: anthropicMessages(messages),
      },
      overrides,
    ),
  );
  const text = reply.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('');
  const toolCalls = reply.content.flatMap((block) =>
    block.type === 'tool_use'
      ? [{ id: block.id, name: block.name, input: block.input }]
      : [],
  );
  return {
    text,
    toolCalls,
    stopReason: reply.stop_reason,
    usage: reply.usage
      ? anthropicUsage(reply.usage)
      : estimatedTurnUsage(conversation, text, toolCalls),
  };
}

const OPENAI_STOP_REASONS = {
  stop: 'end',
  tool_calls: 'tool_use',
  length: 'max_tokens',
} as const;

const openAiChoice = z.object({
  finish_reason: z
    .enum(['stop', 'tool_calls', 'length'])
    .transform((reason) => OPENAI_STOP_REASONS[reason]),
  message: z.object({
    content: z.string().nullable(),
    tool_calls: z
      .array(
        z.object({
          id: z.string(),
          function: z.object({
            name: z.string(),
            arguments: z.string().transform((raw, context) => {
              try {
                return JSON.parse(raw) as unknown;
              } catch {
                context.addIssue({ code: 'custom', message: 'not JSON' });
                return z.NEVER;
              }
            }),
          }),
        }),
      )
      .optional(),
  }),
});

const openAiTurn = z.object({
  choices: z.tuple([openAiChoice], z.unknown()),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      prompt_tokens_details: z
        .object({ cached_tokens: z.number().optional() })
        .optional(),
    })
    .optional(),
});

function openAiMessages(messages: ConversationMessage[]) {
  return messages.map((message) =>
    message.role === 'user'
      ? { role: 'user', content: message.text }
      : message.role === 'assistant'
        ? {
            role: 'assistant',
            content:
              message.text === '' && message.toolCalls.length > 0
                ? null
                : message.text,
            ...(message.toolCalls.length > 0 && {
              tool_calls: message.toolCalls.map(({ id, name, input }) => ({
                id,
                type: 'function',
                function: { name, arguments: JSON.stringify(input) },
              })),
            }),
          }
        : {
            role: 'tool',
            tool_call_id: message.toolCallId,
            content: message.content,
          },
  );
}

async function converseWithOpenAi(
  endpoint: AiEndpoint,
  conversation: Conversation,
  overrides: Partial<Connection>,
): Promise<ConversationTurn> {
  const { system, messages, tools, maxTokens, toolChoice } = conversation;
  const reply = readReply(
    openAiTurn,
    await postToAiProvider(
      `${endpoint.baseUrl}/chat/completions`,
      { authorization: `Bearer ${endpoint.apiKey}` },
      {
        model: endpoint.model,
        max_tokens: maxTokens,
        tools: tools.map(({ name, description, inputSchema }) => ({
          type: 'function',
          function: { name, description, parameters: inputSchema },
        })),
        tool_choice: toolChoice,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...openAiMessages(messages),
        ],
      },
      overrides,
    ),
  );
  const [{ message, finish_reason }] = reply.choices;
  const text = message.content ?? '';
  const toolCalls = (message.tool_calls ?? []).map((call) => ({
    id: call.id,
    name: call.function.name,
    input: call.function.arguments,
  }));
  return {
    text,
    toolCalls,
    stopReason: finish_reason,
    usage: reply.usage
      ? openAiUsage(reply.usage)
      : estimatedTurnUsage(conversation, text, toolCalls),
  };
}
