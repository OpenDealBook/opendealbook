import { expect } from '@playwright/test';

import type { SentGmail } from '../stand-ins/gmail';
import type { ProxyCall } from '../stand-ins/nango';
import type { CompleteCheckout } from '../stand-ins/stripe';
import { LLM_API_KEY_ENV, STAND_INS } from './stack';

async function call<Body>(
  base: string,
  method: 'GET' | 'PUT' | 'POST',
  path: string,
  body?: object,
): Promise<Body> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const text = await response.text();
  expect(response.ok, `${method} ${base}${path}: ${text}`).toBe(true);
  return JSON.parse(text || 'null');
}

export const llm = {
  baseUrl: `${STAND_INS.llm}/v1`,
  apiKeySecretRef: LLM_API_KEY_ENV,
  reply: (model: string, content: string) =>
    call<void>(
      STAND_INS.llm,
      'PUT',
      `/__e2e/replies/${encodeURIComponent(model)}`,
      { content },
    ),
  requests: (model: string) =>
    call<{ model: string; messages: { role: string; content: string }[] }[]>(
      STAND_INS.llm,
      'GET',
      `/__e2e/requests?${new URLSearchParams({ model })}`,
    ),
};

export const nango = {
  setProxyReply: (reply: {
    connectionId: string;
    method: string;
    endpoint: string;
    status: number;
    body: unknown;
  }) => call<void>(STAND_INS.nango, 'PUT', '/__e2e/proxy-replies', reply),
  proxyCalls: (connectionId: string) =>
    call<ProxyCall[]>(
      STAND_INS.nango,
      'GET',
      `/__e2e/proxy-calls?${new URLSearchParams({ connectionId })}`,
    ),
  connectSessions: () =>
    call<unknown[]>(STAND_INS.nango, 'GET', '/__e2e/connect-sessions'),
};

export const gmail = {
  sent: () => call<SentGmail[]>(STAND_INS.gmail, 'GET', '/__e2e/sent'),
};

interface WebhookDelivery {
  status: number;
  body: string;
}

export const stripe = {
  checkoutSessions: () =>
    call<{ id: string; client_reference_id: string | null; status: string }[]>(
      STAND_INS.stripe,
      'GET',
      '/__e2e/checkout-sessions',
    ),
  completeCheckout: (sessionId: string, checkout: CompleteCheckout) =>
    call<{ subscription: { id: string }; webhooks: WebhookDelivery[] }>(
      STAND_INS.stripe,
      'POST',
      `/__e2e/checkout-sessions/${sessionId}/complete`,
      checkout,
    ),
  sendWebhook: (type: string, object: unknown) =>
    call<WebhookDelivery>(STAND_INS.stripe, 'POST', '/__e2e/webhooks', {
      type,
      object,
    }),
  requests: () =>
    call<{ method: string; path: string; params: unknown }[]>(
      STAND_INS.stripe,
      'GET',
      '/__e2e/requests',
    ),
};
