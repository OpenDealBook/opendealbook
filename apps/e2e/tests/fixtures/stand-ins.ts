import { expect } from '@playwright/test';

import type { SentGmail } from '../stand-ins/gmail';
import type { ProxyCall } from '../stand-ins/nango';
import type { CompleteCheckout } from '../stand-ins/stripe';
import type { TestUser } from './auth';
import { ANON_KEY, LLM_API_KEY, serviceHeaders, STAND_INS, SUPABASE_URL } from './stack';

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

async function supabase(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${SUPABASE_URL}${path}`, init);
  const text = await response.text();
  expect(response.ok, `${init.method} ${path}: ${text}`).toBe(true);
  return JSON.parse(text || 'null');
}

async function connectTeam(user: TestUser, accountId: string, model: string): Promise<void> {
  const { access_token: token } = (await supabase('/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }),
  })) as { access_token: string };
  await supabase('/rest/v1/rpc/save_llm_endpoint', {
    method: 'POST',
    headers: { apikey: ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      p_account_id: accountId,
      p_provider: 'openai_compatible',
      p_model: model,
      p_base_url: 'https://llm.e2e.test/v1',
      p_api_key: LLM_API_KEY,
    }),
  });
  await supabase(`/rest/v1/llm_endpoint?account_id=eq.${accountId}`, {
    method: 'PATCH',
    headers: serviceHeaders,
    body: JSON.stringify({ base_url: llm.baseUrl }),
  });
}

export const llm = {
  baseUrl: `${STAND_INS.llm}/v1`,
  connectTeam,
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
