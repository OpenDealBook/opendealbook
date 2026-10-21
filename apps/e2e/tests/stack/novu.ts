import { NOVU_API_URL } from '../fixtures/stack';

const ACCOUNT = {
  firstName: 'Open Deal Book',
  lastName: 'E2E',
  email: 'e2e-novu@opendealbook.test',
  password: 'E2e-Novu-Pass-1!',
  organizationName: 'Open Deal Book E2E',
};

async function novu<Body>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  authorization: string,
  body?: object,
): Promise<Body> {
  const response = await fetch(`${NOVU_API_URL}${path}`, {
    method,
    headers: { authorization, 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Novu refused ${method} ${path}: ${response.status} ${text}`,
    );
  }

  return JSON.parse(text);
}

async function sessionToken(): Promise<string> {
  const login = await fetch(`${NOVU_API_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ACCOUNT.email, password: ACCOUNT.password }),
  });

  if (login.ok) {
    const { data }: { data: { token: string } } = await login.json();
    return data.token;
  }

  const { data } = await novu<{ data: { token: string } }>(
    'POST',
    '/v1/auth/register',
    '',
    ACCOUNT,
  );
  return data.token;
}

export async function novuApiKey(): Promise<string> {
  const { data: environments } = await novu<{
    data: { name: string; apiKeys: { key: string }[] }[];
  }>('GET', '/v1/environments', `Bearer ${await sessionToken()}`);
  return environments.find(({ name }) => name === 'Development')!.apiKeys[0]!
    .key;
}

// Mirrors the chart's novu-sync Job: one Custom SMTP integration, made primary.
export async function pointNovuEmailAt(
  apiKey: string,
  smtp: { host: string; port: number; from: string; senderName: string },
) {
  const authorization = `ApiKey ${apiKey}`;
  const credentials = { ...smtp, port: String(smtp.port), secure: false };
  const identifier = 'opendealbook-smtp';
  const { data: integrations } = await novu<{
    data: { _id: string; identifier: string }[];
  }>('GET', '/v1/integrations', authorization);
  const existing = integrations.find(
    (integration) => integration.identifier === identifier,
  );

  if (existing) {
    await novu('PUT', `/v1/integrations/${existing._id}`, authorization, {
      credentials,
    });
  }

  const id =
    existing?._id ??
    (
      await novu<{ data: { _id: string } }>(
        'POST',
        '/v1/integrations',
        authorization,
        { identifier, providerId: 'nodemailer', channel: 'email', credentials },
      )
    ).data._id;
  await novu('POST', `/v1/integrations/${id}/set-primary`, authorization);
}

export async function syncNovuBridge(apiKey: string, bridgeUrl: string) {
  await novu('POST', '/v1/bridge/sync?source=cli', `ApiKey ${apiKey}`, {
    bridgeUrl,
  });
}
