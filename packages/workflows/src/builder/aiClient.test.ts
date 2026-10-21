import { afterEach, describe, expect, it } from 'vitest';

import { fakeAiProvider, openAiReply } from '../../test-support/fake-ai-provider';
import { completeWithTeamAi } from './aiClient';
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
});
