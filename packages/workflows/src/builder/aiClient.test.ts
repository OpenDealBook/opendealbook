import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { fakeAiProvider, openAiReply } from '../../test-support/fake-ai-provider';
import { aiJson, completeWithTeamAi, pinnedGet, teamAiAddressOf } from './aiClient';
import { publicAddressOf } from './publicUrl';

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
      { provider: 'openai_compatible', model: 'llama-3', baseUrl: fake.baseUrl, apiKey: 'sk-team' },
      'Is this a fit?',
      LOOPBACK_FAKE,
    );

    expect(completion).toEqual({ text: 'Looks like a fit.', promptTokens: 12, completionTokens: 5 });
    expect(fake.received).toMatchObject([
      {
        path: '/v1/chat/completions',
        headers: { authorization: 'Bearer sk-team' },
        body: { model: 'llama-3', messages: [{ role: 'user', content: 'Is this a fit?' }] },
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
      { provider: 'anthropic', model: 'claude-x', baseUrl: fake.baseUrl, apiKey: 'sk-ant' },
      'Is this a fit?',
      LOOPBACK_FAKE,
    );

    expect(completion).toEqual({ text: 'Not a fit.', promptTokens: 30, completionTokens: 4 });
    expect(fake.received).toMatchObject([
      {
        path: '/v1/messages',
        headers: { 'x-api-key': 'sk-ant', 'anthropic-version': '2023-06-01' },
        body: { model: 'claude-x', messages: [{ role: 'user', content: 'Is this a fit?' }] },
      },
    ]);
  });

  it('sends a system prompt as a system message to an OpenAI-compatible endpoint', async () => {
    const fake = await provider(openAiReply('{}'));

    await completeWithTeamAi(
      { provider: 'openai', model: 'gpt-x', baseUrl: fake.baseUrl, apiKey: 'sk-team' },
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
      body: { content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 1, output_tokens: 1 } },
    });

    await completeWithTeamAi(
      { provider: 'anthropic', model: 'claude-x', baseUrl: fake.baseUrl, apiKey: 'sk-ant' },
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
      { provider: 'openai_compatible', model: 'llama-3', baseUrl: fake.baseUrl, apiKey: 'sk-team' },
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
      body: { content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 1, output_tokens: 1 } },
    });

    await completeWithTeamAi(
      { provider: 'anthropic', model: 'claude-x', baseUrl: fake.baseUrl, apiKey: 'sk-ant' },
      'The memo',
      LOOPBACK_FAKE,
      { json: true, temperature: 0.1, maxTokens: 1024 },
    );

    expect(fake.received[0]!.body).toMatchObject({ temperature: 0.1, max_tokens: 1024 });
    expect(fake.received[0]!.body).not.toHaveProperty('response_format');
  });

  it("fails at once on a refused call, naming only the provider's status", async () => {
    const fake = await provider({ status: 401, body: { error: { message: 'bad key sk-wrong' } } });

    const failure = await completeWithTeamAi(
      { provider: 'openai', model: 'gpt-x', baseUrl: fake.baseUrl, apiKey: 'sk-wrong' },
      'Hi',
      LOOPBACK_FAKE,
    ).catch((error: unknown) => error);

    expect(failure).toMatchObject({ message: 'The AI provider answered 401', nonRetryable: true });
  });

  it('fails retryably when the provider has a server error', async () => {
    const fake = await provider({ status: 503, body: { error: 'overloaded' } });

    const failure = await completeWithTeamAi(
      { provider: 'openai', model: 'gpt-x', baseUrl: fake.baseUrl, apiKey: 'sk-team' },
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
      { provider: 'openai', model: 'gpt-x', baseUrl: fake.baseUrl, apiKey: 'sk-team' },
      'Hi',
      LOOPBACK_FAKE,
    ).catch((error: unknown) => error);

    expect(failure).toMatchObject({ message: 'The AI provider answered 302', nonRetryable: true });
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
      { provider: 'openai', model: 'gpt-x', baseUrl: fake.baseUrl, apiKey: 'sk-team' },
      'Hi',
      { ...LOOPBACK_FAKE, signal: cancelled.signal },
    ).catch((error: unknown) => error);

    expect(failure).toMatchObject({ name: 'AbortError' });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it.each([
    ['ENOTFOUND', true],
    ['EAI_AGAIN', false],
  ])('fails the call when DNS reports %s, at once only when the host does not exist', async (code, failsAtOnce) => {
    const failing = async () => {
      throw Object.assign(new Error(`getaddrinfo ${code}`), { code });
    };

    const failure = await completeWithTeamAi(
      { provider: 'openai', model: 'gpt-x', baseUrl: 'https://models.example.com/v1', apiKey: 'sk' },
      'Hi',
      { connectTo: (url) => publicAddressOf(url, failing) },
    ).catch((error: unknown) => error);

    expect(failure).toMatchObject({ message: "We couldn't find that address. Check the base URL." });
    expect((failure as { nonRetryable?: boolean }).nonRetryable === true).toBe(failsAtOnce);
  });

  it('fails at once when the provider answers success with something that is not JSON', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<html>gateway</html>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    close = () => server.close();
    const { port } = server.address() as AddressInfo;

    const failure = await completeWithTeamAi(
      { provider: 'openai', model: 'gpt-x', baseUrl: `http://127.0.0.1:${port}/v1`, apiKey: 'sk' },
      'Hi',
      LOOPBACK_FAKE,
    ).catch((error: unknown) => error);

    expect(failure).toMatchObject({
      nonRetryable: true,
      message: 'The AI provider answered with something that is not JSON',
    });
  });
});

describe('pinnedGet', () => {
  it('sends a GET with the given headers to the vetted address and returns the status and body text', async () => {
    const seen: { method?: string; url?: string; token?: string } = {};
    const server = createServer((request, response) => {
      Object.assign(seen, { method: request.method, url: request.url, token: request.headers.authorization });
      response.writeHead(418, { 'content-type': 'text/plain' });
      response.end('short and stout');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    close = () => server.close();
    const { port } = server.address() as AddressInfo;

    const response = await pinnedGet(
      `http://127.0.0.1:${port}/api/search/?q=party`,
      { authorization: 'Token cl-key' },
      LOOPBACK_FAKE,
    );

    expect(response).toEqual({ status: 418, text: 'short and stout' });
    expect(seen).toEqual({ method: 'GET', url: '/api/search/?q=party', token: 'Token cl-key' });
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
    await expect(pinnedGet('https://10.0.0.8/api', {}, { timeoutMs: 1_000 })).rejects.toMatchObject({
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
    expect(await teamAiAddressOf('http://127.0.0.1:4510/v1/chat/completions')).toBeNull();
  });

  it.each(['local', 'e2e'])('reaches a private address when private AI URLs are allowed on a %s stack', async (stack) => {
    process.env.ODB_ALLOW_PRIVATE_AI_URL = '1';
    process.env.ODB_STACK = stack;

    expect(await teamAiAddressOf('http://127.0.0.1:4510/v1/chat/completions')).toEqual({
      address: '127.0.0.1',
      family: 4,
    });
  });

  it.each([
    ['an unmarked', {}],
    ['a production', { ODB_STACK: 'production' }],
  ])('ignores the private AI URL flag on %s stack', async (_stack, marker) => {
    Object.assign(process.env, { ODB_ALLOW_PRIVATE_AI_URL: '1' }, marker);

    expect(await teamAiAddressOf('http://127.0.0.1:4510/v1/chat/completions')).toBeNull();
  });
});
