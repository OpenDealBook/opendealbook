import { afterEach, describe, expect, it } from 'vitest';

import {
  fakeAiProvider,
  openAiReply,
} from '../../test-support/fake-ai-provider';
import {
  aiJson,
  completeWithTeamAi,
  converseWithTeamAi,
  type Conversation,
  pinnedGet,
  teamAiAddressOf,
} from './aiClient';
import { publicAddressOf } from './publicUrl';

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

let close: (() => void) | undefined;

const LOOPBACK_FAKE = {
  connectTo: async () => ({ address: '127.0.0.1', family: 4 as const }),
  timeoutMs: 5_000,
};

afterEach(() => close?.());

async function provider(reply: Parameters<typeof fakeAiProvider>[0]) {
  const fake = await fakeAiProvider(reply);
  close = fake.close;
  return fake;
}

describe('completeWithTeamAi', () => {
  it('asks an OpenAI-compatible endpoint with the bearer key and returns its answer and token counts', async () => {
    const fake = await provider(openAiReply('Looks like a fit.'));

    const completion = await completeWithTeamAi(
      {
        provider: 'openai_compatible',
        model: 'llama-3',
        baseUrl: fake.baseUrl,
        apiKey: 'sk-team',
      },
      'Is this a fit?',
      LOOPBACK_FAKE,
    );

    expect(completion).toEqual({
      text: 'Looks like a fit.',
      usage: {
        inputTokens: 12,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 5,
      },
    });
    expect(fake.received).toMatchObject([
      {
        path: '/v1/chat/completions',
        headers: { authorization: 'Bearer sk-team' },
        body: {
          model: 'llama-3',
          messages: [{ role: 'user', content: 'Is this a fit?' }],
        },
      },
    ]);
  });

  it('asks Anthropic through its messages API with the x-api-key header', async () => {
    const fake = await provider({
      status: 200,
      body: {
        content: [{ type: 'text', text: 'Not a fit.' }],
        usage: { input_tokens: 30, output_tokens: 4 },
      },
    });

    const completion = await completeWithTeamAi(
      {
        provider: 'anthropic',
        model: 'claude-x',
        baseUrl: fake.baseUrl,
        apiKey: 'sk-ant',
      },
      'Is this a fit?',
      LOOPBACK_FAKE,
    );

    expect(completion).toEqual({
      text: 'Not a fit.',
      usage: {
        inputTokens: 30,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 4,
      },
    });
    expect(fake.received).toMatchObject([
      {
        path: '/v1/messages',
        headers: { 'x-api-key': 'sk-ant', 'anthropic-version': '2023-06-01' },
        body: {
          model: 'claude-x',
          messages: [{ role: 'user', content: 'Is this a fit?' }],
        },
      },
    ]);
  });

  it('splits cached prompt tokens out of an OpenAI prompt count', async () => {
    const fake = await provider({
      status: 200,
      body: {
        choices: [{ message: { content: 'Yes.' } }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 5,
          prompt_tokens_details: { cached_tokens: 60 },
        },
      },
    });

    const completion = await completeWithTeamAi(
      {
        provider: 'openai',
        model: 'gpt-4o',
        baseUrl: fake.baseUrl,
        apiKey: 'k',
      },
      'Is this a fit?',
      LOOPBACK_FAKE,
    );

    expect(completion.usage).toEqual({
      inputTokens: 40,
      cachedInputTokens: 60,
      cacheWriteTokens: 0,
      outputTokens: 5,
    });
  });

  it('reads Anthropic cache reads and cache writes', async () => {
    const fake = await provider({
      status: 200,
      body: {
        content: [{ type: 'text', text: 'Yes.' }],
        usage: {
          input_tokens: 30,
          output_tokens: 4,
          cache_read_input_tokens: 200,
          cache_creation_input_tokens: 50,
        },
      },
    });

    const completion = await completeWithTeamAi(
      {
        provider: 'anthropic',
        model: 'claude-x',
        baseUrl: fake.baseUrl,
        apiKey: 'k',
      },
      'Is this a fit?',
      LOOPBACK_FAKE,
    );

    expect(completion.usage).toEqual({
      inputTokens: 30,
      cachedInputTokens: 200,
      cacheWriteTokens: 50,
      outputTokens: 4,
    });
  });

  it('estimates usage from the prompt and reply length when the reply has no usage block', async () => {
    const fake = await provider({
      status: 200,
      body: { choices: [{ message: { content: 'Looks like a fit.' } }] },
    });

    const completion = await completeWithTeamAi(
      {
        provider: 'openai_compatible',
        model: 'llama-3',
        baseUrl: fake.baseUrl,
        apiKey: 'k',
      },
      'Is this a fit?',
      LOOPBACK_FAKE,
      { system: 'Be brief' },
    );

    expect(completion).toEqual({
      text: 'Looks like a fit.',
      usage: {
        inputTokens: Math.ceil(('Be brief' + 'Is this a fit?').length / 4),
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: Math.ceil('Looks like a fit.'.length / 4),
      },
    });
  });

  it('sends a system prompt as a system message to an OpenAI-compatible endpoint', async () => {
    const fake = await provider(openAiReply('{}'));

    await completeWithTeamAi(
      {
        provider: 'openai',
        model: 'gpt-x',
        baseUrl: fake.baseUrl,
        apiKey: 'sk-team',
      },
      'The memo',
      LOOPBACK_FAKE,
      { system: 'Reply as JSON' },
    );

    expect(fake.received[0]!.body.messages).toEqual([
      { role: 'system', content: 'Reply as JSON' },
      { role: 'user', content: 'The memo' },
    ]);
  });

  it("sends a system prompt in Anthropic's system field", async () => {
    const fake = await provider({
      status: 200,
      body: {
        content: [{ type: 'text', text: '{}' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    });

    await completeWithTeamAi(
      {
        provider: 'anthropic',
        model: 'claude-x',
        baseUrl: fake.baseUrl,
        apiKey: 'sk-ant',
      },
      'The memo',
      LOOPBACK_FAKE,
      { system: 'Reply as JSON' },
    );

    expect(fake.received[0]!.body).toMatchObject({
      system: 'Reply as JSON',
      messages: [{ role: 'user', content: 'The memo' }],
    });
  });

  it('asks an OpenAI-compatible endpoint for JSON with the temperature and token limit given', async () => {
    const fake = await provider(openAiReply('{}'));

    await completeWithTeamAi(
      {
        provider: 'openai_compatible',
        model: 'llama-3',
        baseUrl: fake.baseUrl,
        apiKey: 'sk-team',
      },
      'The memo',
      LOOPBACK_FAKE,
      { json: true, temperature: 0, maxTokens: 256 },
    );

    expect(fake.received[0]!.body).toMatchObject({
      temperature: 0,
      max_tokens: 256,
      response_format: { type: 'json_object' },
    });
  });

  it('gives Anthropic the temperature and token limit, with no JSON mode it lacks', async () => {
    const fake = await provider({
      status: 200,
      body: {
        content: [{ type: 'text', text: '{}' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    });

    await completeWithTeamAi(
      {
        provider: 'anthropic',
        model: 'claude-x',
        baseUrl: fake.baseUrl,
        apiKey: 'sk-ant',
      },
      'The memo',
      LOOPBACK_FAKE,
      { json: true, temperature: 0.1, maxTokens: 1024 },
    );

    expect(fake.received[0]!.body).toMatchObject({
      temperature: 0.1,
      max_tokens: 1024,
    });
    expect(fake.received[0]!.body).not.toHaveProperty('response_format');
  });

  it("fails at once on a refused call, naming only the provider's status", async () => {
    const fake = await provider({
      status: 401,
      body: { error: { message: 'bad key sk-wrong' } },
    });

    const failure = await completeWithTeamAi(
      {
        provider: 'openai',
        model: 'gpt-x',
        baseUrl: fake.baseUrl,
        apiKey: 'sk-wrong',
      },
      'Hi',
      LOOPBACK_FAKE,
    ).catch((error: unknown) => error);

    expect(failure).toMatchObject({
      message: 'The AI provider answered 401',
      nonRetryable: true,
    });
  });

  it('fails retryably when the provider has a server error', async () => {
    const fake = await provider({ status: 503, body: { error: 'overloaded' } });

    const failure = await completeWithTeamAi(
      {
        provider: 'openai',
        model: 'gpt-x',
        baseUrl: fake.baseUrl,
        apiKey: 'sk-team',
      },
      'Hi',
      LOOPBACK_FAKE,
    ).catch((error: unknown) => error);

    expect(failure).toMatchObject({ message: 'The AI provider answered 503' });
    expect((failure as { nonRetryable?: boolean }).nonRetryable).not.toBe(true);
  });

  it('never follows a redirect, and fails at once', async () => {
    const fake = await provider({
      status: 302,
      body: {},
      headers: { location: 'http://169.254.169.254/latest' },
    });

    const failure = await completeWithTeamAi(
      {
        provider: 'openai',
        model: 'gpt-x',
        baseUrl: fake.baseUrl,
        apiKey: 'sk-team',
      },
      'Hi',
      LOOPBACK_FAKE,
    ).catch((error: unknown) => error);

    expect(failure).toMatchObject({
      message: 'The AI provider answered 302',
      nonRetryable: true,
    });
    expect(fake.received).toHaveLength(1);
  });

  it('connects only to the address it vetted, even when DNS answers differently a second time', async () => {
    const fake = await provider(openAiReply('internal answer'));
    const port = new URL(fake.baseUrl).port;
    const answers = [[{ address: '203.0.113.10' }], [{ address: '127.0.0.1' }]];
    let lookups = 0;
    const rebinding = async () => answers[Math.min(lookups++, 1)]!;

    const failure = await completeWithTeamAi(
      {
        provider: 'openai_compatible',
        model: 'llama-3',
        baseUrl: `https://rebind.example.com:${port}/v1`,
        apiKey: 'sk-team',
      },
      'Hi',
      { connectTo: (url) => publicAddressOf(url, rebinding), timeoutMs: 300 },
    ).catch((error: unknown) => error);

    expect(failure).toMatchObject({ name: 'AbortError' });
    expect(lookups).toBe(1);
    expect(fake.connections.count).toBe(0);
  });

  it('aborts an attempt in flight when the activity is cancelled', async () => {
    const fake = await provider({ ...openAiReply('too late'), delayMs: 2_000 });
    const cancelled = new AbortController();
    setTimeout(() => cancelled.abort(), 50);
    const started = Date.now();

    const failure = await completeWithTeamAi(
      {
        provider: 'openai',
        model: 'gpt-x',
        baseUrl: fake.baseUrl,
        apiKey: 'sk-team',
      },
      'Hi',
      { ...LOOPBACK_FAKE, signal: cancelled.signal },
    ).catch((error: unknown) => error);

    expect(failure).toMatchObject({ name: 'AbortError' });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it.each([
    ['ENOTFOUND', true],
    ['EAI_AGAIN', false],
  ])(
    'fails the call when DNS reports %s, at once only when the host does not exist',
    async (code, failsAtOnce) => {
      const failing = async () => {
        throw Object.assign(new Error(`getaddrinfo ${code}`), { code });
      };

      const failure = await completeWithTeamAi(
        {
          provider: 'openai',
          model: 'gpt-x',
          baseUrl: 'https://models.example.com/v1',
          apiKey: 'sk',
        },
        'Hi',
        { connectTo: (url) => publicAddressOf(url, failing) },
      ).catch((error: unknown) => error);

      expect(failure).toMatchObject({
        message: "We couldn't find that address. Check the base URL.",
      });
      expect(
        (failure as { nonRetryable?: boolean }).nonRetryable === true,
      ).toBe(failsAtOnce);
    },
  );

  it('fails at once when the provider answers success with something that is not JSON', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<html>gateway</html>');
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    close = () => server.close();
    const { port } = server.address() as AddressInfo;

    const failure = await completeWithTeamAi(
      {
        provider: 'openai',
        model: 'gpt-x',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        apiKey: 'sk',
      },
      'Hi',
      LOOPBACK_FAKE,
    ).catch((error: unknown) => error);

    expect(failure).toMatchObject({
      nonRetryable: true,
      message: 'The AI provider answered with something that is not JSON',
    });
  });
});

const LOOKUP_CONVERSATION: Conversation = {
  system: 'Answer from the deal file.',
  tools: [
    {
      name: 'lookup',
      description: 'Look up a deal field',
      inputSchema: {
        type: 'object',
        properties: { field: { type: 'string' } },
        required: ['field'],
      },
    },
  ],
  messages: [
    { role: 'user', text: 'What is the asking price?' },
    {
      role: 'assistant',
      text: 'Checking.',
      toolCalls: [
        { id: 'call_1', name: 'lookup', input: { field: 'price' } },
        { id: 'call_2', name: 'lookup', input: { field: 'currency' } },
      ],
    },
    { role: 'tool', toolCallId: 'call_1', content: '2400000' },
    { role: 'tool', toolCallId: 'call_2', content: 'USD' },
  ],
  maxTokens: 500,
};

describe('converseWithTeamAi', () => {
  it('sends Anthropic the conversation as tool_use and tool_result blocks and reads back its tool calls', async () => {
    const fake = await provider({
      status: 200,
      body: {
        content: [
          { type: 'text', text: 'One more.' },
          {
            type: 'tool_use',
            id: 'toolu_3',
            name: 'lookup',
            input: { field: 'seller' },
          },
        ],
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 80,
          output_tokens: 20,
          cache_read_input_tokens: 10,
          cache_creation_input_tokens: 5,
        },
      },
    });

    const turn = await converseWithTeamAi(
      {
        provider: 'anthropic',
        model: 'claude-x',
        baseUrl: fake.baseUrl,
        apiKey: 'sk-ant',
      },
      LOOKUP_CONVERSATION,
      LOOPBACK_FAKE,
    );

    expect(turn).toEqual({
      text: 'One more.',
      toolCalls: [
        { id: 'toolu_3', name: 'lookup', input: { field: 'seller' } },
      ],
      stopReason: 'tool_use',
      usage: {
        inputTokens: 80,
        cachedInputTokens: 10,
        cacheWriteTokens: 5,
        outputTokens: 20,
      },
    });
    expect(fake.received).toEqual([
      expect.objectContaining({
        path: '/v1/messages',
        headers: expect.objectContaining({
          'x-api-key': 'sk-ant',
          'anthropic-version': '2023-06-01',
        }),
        body: {
          model: 'claude-x',
          max_tokens: 500,
          system: 'Answer from the deal file.',
          tools: [
            {
              name: 'lookup',
              description: 'Look up a deal field',
              input_schema: {
                type: 'object',
                properties: { field: { type: 'string' } },
                required: ['field'],
              },
            },
          ],
          messages: [
            { role: 'user', content: 'What is the asking price?' },
            {
              role: 'assistant',
              content: [
                { type: 'text', text: 'Checking.' },
                {
                  type: 'tool_use',
                  id: 'call_1',
                  name: 'lookup',
                  input: { field: 'price' },
                },
                {
                  type: 'tool_use',
                  id: 'call_2',
                  name: 'lookup',
                  input: { field: 'currency' },
                },
              ],
            },
            {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'call_1',
                  content: '2400000',
                },
                { type: 'tool_result', tool_use_id: 'call_2', content: 'USD' },
              ],
            },
          ],
        },
      }),
    ]);
  });

  it('sends an OpenAI-compatible endpoint the conversation as tool_calls and tool messages and reads back its tool calls', async () => {
    const fake = await provider({
      status: 200,
      body: {
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_3',
                  type: 'function',
                  function: { name: 'lookup', arguments: '{"field":"seller"}' },
                },
              ],
            },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 15,
          prompt_tokens_details: { cached_tokens: 60 },
        },
      },
    });

    const turn = await converseWithTeamAi(
      {
        provider: 'openai_compatible',
        model: 'llama-3',
        baseUrl: fake.baseUrl,
        apiKey: 'sk-team',
      },
      LOOKUP_CONVERSATION,
      LOOPBACK_FAKE,
    );

    expect(turn).toEqual({
      text: '',
      toolCalls: [{ id: 'call_3', name: 'lookup', input: { field: 'seller' } }],
      stopReason: 'tool_use',
      usage: {
        inputTokens: 40,
        cachedInputTokens: 60,
        cacheWriteTokens: 0,
        outputTokens: 15,
      },
    });
    expect(fake.received).toEqual([
      expect.objectContaining({
        path: '/v1/chat/completions',
        headers: expect.objectContaining({ authorization: 'Bearer sk-team' }),
        body: {
          model: 'llama-3',
          max_tokens: 500,
          tools: [
            {
              type: 'function',
              function: {
                name: 'lookup',
                description: 'Look up a deal field',
                parameters: {
                  type: 'object',
                  properties: { field: { type: 'string' } },
                  required: ['field'],
                },
              },
            },
          ],
          messages: [
            { role: 'system', content: 'Answer from the deal file.' },
            { role: 'user', content: 'What is the asking price?' },
            {
              role: 'assistant',
              content: 'Checking.',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'lookup', arguments: '{"field":"price"}' },
                },
                {
                  id: 'call_2',
                  type: 'function',
                  function: {
                    name: 'lookup',
                    arguments: '{"field":"currency"}',
                  },
                },
              ],
            },
            { role: 'tool', tool_call_id: 'call_1', content: '2400000' },
            { role: 'tool', tool_call_id: 'call_2', content: 'USD' },
          ],
        },
      }),
    ]);
  });

  it.each([
    {
      provider: 'anthropic' as const,
      reply: {
        content: [{ type: 'text', text: 'It is $2.4M.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 90, output_tokens: 6 },
      },
      toolChoice: { tool_choice: { type: 'none' } },
    },
    {
      provider: 'openai' as const,
      reply: {
        choices: [
          { finish_reason: 'stop', message: { content: 'It is $2.4M.' } },
        ],
        usage: { prompt_tokens: 90, completion_tokens: 6 },
      },
      toolChoice: { tool_choice: 'none' },
    },
  ])(
    'forbids $provider from calling tools when a final answer is forced, and reads the answer as the end',
    async ({ provider: kind, reply, toolChoice }) => {
      const fake = await provider({ status: 200, body: reply });

      const turn = await converseWithTeamAi(
        { provider: kind, model: 'm', baseUrl: fake.baseUrl, apiKey: 'k' },
        { ...LOOKUP_CONVERSATION, toolChoice: 'none' },
        LOOPBACK_FAKE,
      );

      expect(turn).toEqual({
        text: 'It is $2.4M.',
        toolCalls: [],
        stopReason: 'end',
        usage: {
          inputTokens: 90,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 6,
        },
      });
      expect(fake.received[0]!.body).toMatchObject(toolChoice);
    },
  );

  it.each([
    {
      provider: 'anthropic' as const,
      reply: {
        content: [{ type: 'text', text: 'The asking' }],
        stop_reason: 'max_tokens',
        usage: { input_tokens: 90, output_tokens: 500 },
      },
    },
    {
      provider: 'openai' as const,
      reply: {
        choices: [
          { finish_reason: 'length', message: { content: 'The asking' } },
        ],
        usage: { prompt_tokens: 90, completion_tokens: 500 },
      },
    },
  ])(
    'reports a $provider reply cut off at the token limit',
    async ({ provider: kind, reply }) => {
      const fake = await provider({ status: 200, body: reply });

      const turn = await converseWithTeamAi(
        { provider: kind, model: 'm', baseUrl: fake.baseUrl, apiKey: 'k' },
        LOOKUP_CONVERSATION,
        LOOPBACK_FAKE,
      );

      expect(turn).toMatchObject({
        text: 'The asking',
        stopReason: 'max_tokens',
      });
    },
  );

  it('sends an earlier answer without tool calls to an OpenAI-compatible endpoint as plain assistant content', async () => {
    const fake = await provider({
      status: 200,
      body: {
        choices: [{ finish_reason: 'stop', message: { content: 'Yes.' } }],
        usage: { prompt_tokens: 9, completion_tokens: 1 },
      },
    });

    await converseWithTeamAi(
      { provider: 'openai', model: 'm', baseUrl: fake.baseUrl, apiKey: 'k' },
      {
        tools: [],
        messages: [
          { role: 'user', text: 'Price?' },
          { role: 'assistant', text: '$2.4M.', toolCalls: [] },
          { role: 'user', text: 'Sure?' },
        ],
      },
      LOOPBACK_FAKE,
    );

    expect(fake.received[0]!.body.messages).toEqual([
      { role: 'user', content: 'Price?' },
      { role: 'assistant', content: '$2.4M.' },
      { role: 'user', content: 'Sure?' },
    ]);
  });

  it('sends Anthropic a tool-calling turn that had no text as tool_use blocks alone', async () => {
    const fake = await provider({
      status: 200,
      body: {
        content: [{ type: 'text', text: 'USD.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 9, output_tokens: 1 },
      },
    });

    await converseWithTeamAi(
      { provider: 'anthropic', model: 'm', baseUrl: fake.baseUrl, apiKey: 'k' },
      {
        tools: LOOKUP_CONVERSATION.tools,
        messages: [
          { role: 'user', text: 'Currency?' },
          {
            role: 'assistant',
            text: '',
            toolCalls: [
              { id: 'c', name: 'lookup', input: { field: 'currency' } },
            ],
          },
          { role: 'tool', toolCallId: 'c', content: 'USD' },
        ],
      },
      LOOPBACK_FAKE,
    );

    expect(fake.received[0]!.body.messages[1]).toEqual({
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'c',
          name: 'lookup',
          input: { field: 'currency' },
        },
      ],
    });
  });

  it("fails at once on a refused call, naming only the provider's status", async () => {
    const fake = await provider({ status: 400, body: { error: 'bad tool' } });

    const failure = await converseWithTeamAi(
      { provider: 'anthropic', model: 'm', baseUrl: fake.baseUrl, apiKey: 'k' },
      LOOKUP_CONVERSATION,
      LOOPBACK_FAKE,
    ).catch((error: unknown) => error);

    expect(failure).toMatchObject({
      message: 'The AI provider answered 400',
      nonRetryable: true,
    });
  });

  it('fails retryably when the provider has a server error', async () => {
    const fake = await provider({ status: 503, body: { error: 'overloaded' } });

    const failure = await converseWithTeamAi(
      { provider: 'openai', model: 'm', baseUrl: fake.baseUrl, apiKey: 'k' },
      LOOKUP_CONVERSATION,
      LOOPBACK_FAKE,
    ).catch((error: unknown) => error);

    expect(failure).toMatchObject({ message: 'The AI provider answered 503' });
    expect((failure as { nonRetryable?: boolean }).nonRetryable).not.toBe(true);
  });

  const anthropicUsageBlock = { input_tokens: 9, output_tokens: 1 };
  const openAiUsageBlock = { prompt_tokens: 9, completion_tokens: 1 };

  it.each([
    ...['stop_sequence', 'pause_turn', 'refusal'].map((stopReason) => ({
      case: `Anthropic stop reason ${stopReason}`,
      provider: 'anthropic' as const,
      reply: {
        content: [{ type: 'text', text: 'Hm.' }],
        stop_reason: stopReason,
        usage: anthropicUsageBlock,
      },
    })),
    {
      case: 'an Anthropic thinking block',
      provider: 'anthropic' as const,
      reply: {
        content: [
          { type: 'thinking', thinking: 'Let me see.', signature: 's' },
          { type: 'text', text: 'Hm.' },
        ],
        stop_reason: 'end_turn',
        usage: anthropicUsageBlock,
      },
    },
    {
      case: 'OpenAI stop reason content_filter',
      provider: 'openai' as const,
      reply: {
        choices: [
          { finish_reason: 'content_filter', message: { content: '' } },
        ],
        usage: openAiUsageBlock,
      },
    },
    {
      case: 'OpenAI tool arguments that are not JSON',
      provider: 'openai' as const,
      reply: {
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_9',
                  type: 'function',
                  function: { name: 'lookup', arguments: '{"field":' },
                },
              ],
            },
          },
        ],
        usage: openAiUsageBlock,
      },
    },
  ])('fails at once on $case', async ({ provider: kind, reply }) => {
    const fake = await provider({ status: 200, body: reply });

    const failure = await converseWithTeamAi(
      { provider: kind, model: 'm', baseUrl: fake.baseUrl, apiKey: 'k' },
      LOOKUP_CONVERSATION,
      LOOPBACK_FAKE,
    ).catch((error: unknown) => error);

    expect(failure).toMatchObject({
      message: 'The AI provider answered with a reply this call cannot read',
      nonRetryable: true,
    });
  });

  it.each([
    {
      provider: 'anthropic' as const,
      reply: {
        content: [
          { type: 'text', text: 'Looking.' },
          { type: 'tool_use', id: 't', name: 'lookup', input: { field: 'x' } },
        ],
        stop_reason: 'tool_use',
      },
    },
    {
      provider: 'openai_compatible' as const,
      reply: {
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: 'Looking.',
              tool_calls: [
                {
                  id: 't',
                  type: 'function',
                  function: { name: 'lookup', arguments: '{"field":"x"}' },
                },
              ],
            },
          },
        ],
      },
    },
  ])(
    'estimates usage from the conversation and the reply when $provider sends no usage block',
    async ({ provider: kind, reply }) => {
      const fake = await provider({ status: 200, body: reply });

      const turn = await converseWithTeamAi(
        { provider: kind, model: 'm', baseUrl: fake.baseUrl, apiKey: 'k' },
        {
          system: 'Be brief.',
          tools: LOOKUP_CONVERSATION.tools,
          messages: [
            { role: 'user', text: 'Price?' },
            {
              role: 'assistant',
              text: 'Checking.',
              toolCalls: [
                { id: 'c', name: 'lookup', input: { field: 'price' } },
              ],
            },
            { role: 'tool', toolCallId: 'c', content: '2400000' },
          ],
        },
        LOOPBACK_FAKE,
      );

      expect(turn.usage).toEqual({
        inputTokens: Math.ceil(
          (
            'Be brief.' +
            'Price?' +
            'Checking.' +
            '{"field":"price"}' +
            '2400000'
          ).length / 4,
        ),
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: Math.ceil(('Looking.' + '{"field":"x"}').length / 4),
      });
    },
  );

  it('marks a failed tool result as an error for Anthropic, and sends OpenAI the error text alone', async () => {
    const conversation: Conversation = {
      tools: LOOKUP_CONVERSATION.tools,
      messages: [
        { role: 'user', text: 'Price?' },
        {
          role: 'assistant',
          text: '',
          toolCalls: [{ id: 'c', name: 'lookup', input: { field: 'price' } }],
        },
        {
          role: 'tool',
          toolCallId: 'c',
          content: 'No field named price',
          isError: true,
        },
      ],
    };
    const anthropic = await provider({
      status: 200,
      body: {
        content: [{ type: 'text', text: 'Unknown.' }],
        stop_reason: 'end_turn',
        usage: anthropicUsageBlock,
      },
    });
    await converseWithTeamAi(
      {
        provider: 'anthropic',
        model: 'm',
        baseUrl: anthropic.baseUrl,
        apiKey: 'k',
      },
      conversation,
      LOOPBACK_FAKE,
    );
    close?.();
    const openAi = await provider({
      status: 200,
      body: {
        choices: [{ finish_reason: 'stop', message: { content: 'Unknown.' } }],
        usage: openAiUsageBlock,
      },
    });
    await converseWithTeamAi(
      { provider: 'openai', model: 'm', baseUrl: openAi.baseUrl, apiKey: 'k' },
      conversation,
      LOOPBACK_FAKE,
    );

    expect(anthropic.received[0]!.body.messages[2]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'c',
          content: 'No field named price',
          is_error: true,
        },
      ],
    });
    expect(openAi.received[0]!.body.messages[2]).toEqual({
      role: 'tool',
      tool_call_id: 'c',
      content: 'No field named price',
    });
  });

  it('sends an OpenAI-compatible endpoint a tool-calling turn that had no text with null content', async () => {
    const fake = await provider({
      status: 200,
      body: {
        choices: [{ finish_reason: 'stop', message: { content: 'USD.' } }],
        usage: openAiUsageBlock,
      },
    });

    await converseWithTeamAi(
      { provider: 'openai', model: 'm', baseUrl: fake.baseUrl, apiKey: 'k' },
      {
        tools: LOOKUP_CONVERSATION.tools,
        messages: [
          { role: 'user', text: 'Currency?' },
          {
            role: 'assistant',
            text: '',
            toolCalls: [
              { id: 'c', name: 'lookup', input: { field: 'currency' } },
            ],
          },
          { role: 'tool', toolCallId: 'c', content: 'USD' },
        ],
      },
      LOOPBACK_FAKE,
    );

    expect(fake.received[0]!.body.messages[1]).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'c',
          type: 'function',
          function: { name: 'lookup', arguments: '{"field":"currency"}' },
        },
      ],
    });
  });
});

describe('pinnedGet', () => {
  it('sends a GET with the given headers to the vetted address and returns the status and body text', async () => {
    const seen: { method?: string; url?: string; token?: string } = {};
    const server = createServer((request, response) => {
      Object.assign(seen, {
        method: request.method,
        url: request.url,
        token: request.headers.authorization,
      });
      response.writeHead(418, { 'content-type': 'text/plain' });
      response.end('short and stout');
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    close = () => server.close();
    const { port } = server.address() as AddressInfo;

    const response = await pinnedGet(
      `http://127.0.0.1:${port}/api/search/?q=party`,
      { authorization: 'Token cl-key' },
      LOOPBACK_FAKE,
    );

    expect(response).toEqual({ status: 418, text: 'short and stout' });
    expect(seen).toEqual({
      method: 'GET',
      url: '/api/search/?q=party',
      token: 'Token cl-key',
    });
  });

  it('connects to a vetted public host when the request carries a query string', async () => {
    let lookups = 0;
    const publicDns = async () => {
      lookups += 1;
      return [{ address: '203.0.113.10' }];
    };

    const failure = await pinnedGet(
      'https://courts.example.com/api/rest/v4/search/?type=d&q=party%3A%22Rowan%22#results',
      {},
      { connectTo: (url) => publicAddressOf(url, publicDns), timeoutMs: 300 },
    ).catch((error: unknown) => error);

    expect(lookups).toBe(1);
    expect(failure).toMatchObject({ name: 'AbortError' });
  });

  it('refuses at once to call an address that is not public', async () => {
    await expect(
      pinnedGet('https://10.0.0.8/api', {}, { timeoutMs: 1_000 }),
    ).rejects.toMatchObject({
      nonRetryable: true,
      message: 'Use a public HTTPS base URL',
    });
  });
});

describe('aiJson', () => {
  it('reads JSON a model wrapped in a code fence', () => {
    expect(aiJson('```json\n{"amount": 7}\n```')).toEqual({ amount: 7 });
  });

  it('reads bare JSON', () => {
    expect(aiJson('{"amount": null}')).toEqual({ amount: null });
  });
});

describe('teamAiAddressOf', () => {
  afterEach(() => {
    delete process.env.ODB_ALLOW_PRIVATE_AI_URL;
    delete process.env.ODB_STACK;
  });

  it('refuses a private address', async () => {
    expect(
      await teamAiAddressOf('http://127.0.0.1:4510/v1/chat/completions'),
    ).toBeNull();
  });

  it.each(['local', 'e2e'])(
    'reaches a private address when private AI URLs are allowed on a %s stack',
    async (stack) => {
      process.env.ODB_ALLOW_PRIVATE_AI_URL = '1';
      process.env.ODB_STACK = stack;

      expect(
        await teamAiAddressOf('http://127.0.0.1:4510/v1/chat/completions'),
      ).toEqual({
        address: '127.0.0.1',
        family: 4,
      });
    },
  );

  it.each([
    ['an unmarked', {}],
    ['a production', { ODB_STACK: 'production' }],
  ])('ignores the private AI URL flag on %s stack', async (_stack, marker) => {
    Object.assign(process.env, { ODB_ALLOW_PRIVATE_AI_URL: '1' }, marker);

    expect(
      await teamAiAddressOf('http://127.0.0.1:4510/v1/chat/completions'),
    ).toBeNull();
  });
});

describe('teamAiAddressOf with operator-listed private hosts', () => {
  afterEach(() => {
    delete process.env.ODB_PRIVATE_AI_HOSTS;
  });

  it('reaches a private address the operator lists', async () => {
    process.env.ODB_PRIVATE_AI_HOSTS = 'llm.corp.example, 10.0.0.8';

    expect(
      await teamAiAddressOf('https://10.0.0.8/v1/chat/completions'),
    ).toEqual({ address: '10.0.0.8', family: 4 });
  });

  it('pins a listed host name to the address it resolves to', async () => {
    process.env.ODB_PRIVATE_AI_HOSTS = 'localhost';

    expect(
      (await teamAiAddressOf('https://localhost/v1/chat/completions'))?.address,
    ).toMatch(/^(127\.0\.0\.1|::1)$/);
  });

  it('reaches a host:port entry only on that port', async () => {
    process.env.ODB_PRIVATE_AI_HOSTS = '10.0.0.8:8443';

    expect(
      await teamAiAddressOf('https://10.0.0.8:8443/v1/chat/completions'),
    ).toEqual({ address: '10.0.0.8', family: 4 });
    expect(
      await teamAiAddressOf('https://10.0.0.8/v1/chat/completions'),
    ).toBeNull();
  });

  it('reaches a listed host over http', async () => {
    process.env.ODB_PRIVATE_AI_HOSTS = '10.0.0.8:4510';

    expect(
      await teamAiAddressOf('http://10.0.0.8:4510/v1/chat/completions'),
    ).toEqual({ address: '10.0.0.8', family: 4 });
  });

  it('matches a listed host name in any case', async () => {
    process.env.ODB_PRIVATE_AI_HOSTS = 'LocalHost';

    expect(
      (await teamAiAddressOf('https://localhost/v1/chat/completions'))?.address,
    ).toMatch(/^(127\.0\.0\.1|::1)$/);
  });

  it.each([
    ['10.0.0.8:443', 'https://10.0.0.8/v1'],
    ['10.0.0.8:80', 'http://10.0.0.8/v1'],
  ])('matches %s to %s through the scheme default port', async (entry, url) => {
    process.env.ODB_PRIVATE_AI_HOSTS = entry;

    expect(await teamAiAddressOf(url)).toEqual({
      address: '10.0.0.8',
      family: 4,
    });
  });

  it('does not match a port entry to a different scheme default', async () => {
    process.env.ODB_PRIVATE_AI_HOSTS = '10.0.0.8:80';

    expect(await teamAiAddressOf('https://10.0.0.8/v1')).toBeNull();
  });

  it('matches a bracketed IPv6 entry', async () => {
    process.env.ODB_PRIVATE_AI_HOSTS = '[fd00::1]:8443';

    expect(await teamAiAddressOf('https://[fd00::1]:8443/v1')).toEqual({
      address: 'fd00::1',
      family: 6,
    });
  });

  it('keeps refusing a private address the operator does not list', async () => {
    process.env.ODB_PRIVATE_AI_HOSTS = '10.0.0.8';

    expect(
      await teamAiAddressOf('https://10.0.0.9/v1/chat/completions'),
    ).toBeNull();
  });
});
