import { beforeEach, describe, expect, it, vi } from 'vitest';

import documentCompleted from '../../../../../../packages/contracts/src/esign/fixtures/webhook-document-completed.json';
import documentSigned from '../../../../../../packages/contracts/src/esign/fixtures/webhook-document-signed.json';

const handleContractSignatureEvent = vi.fn();
const handleFormSignatureEvent = vi.fn();
const adminClient = { from: vi.fn() };
const documenso = { marker: 'documenso' };
const logged: { level: string; message: string }[] = [];

vi.mock('@odb/contracts/esign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/contracts/esign')>()),
  createDocumensoClient: () => documenso,
  handleContractSignatureEvent,
}));
vi.mock('@odb/lender-rooms/esign/webhook.ts', () => ({
  handleFormSignatureEvent,
}));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerAdminClient: () => adminClient,
}));
vi.mock('@odb/shared/logger', () => ({
  getLogger: () => ({
    warn: (message: string) => logged.push({ level: 'warn', message }),
    error: (_context: unknown, message: string) =>
      logged.push({ level: 'error', message }),
  }),
}));
vi.mock('@odb/next/routes', () => ({
  enhanceRouteHandler:
    (fn: (params: { request: Request }) => Promise<Response>) =>
    (request: Request) =>
      fn({ request }),
}));

const SECRET = 'whsec-local-test-0123456789abcdef';
const ENVELOPE_ID = documentCompleted.payload.envelopeId;
const REFUSING =
  'DOCUMENSO_WEBHOOK_SECRET must be set to at least 32 characters; refusing every Documenso webhook';

function webhookRequest(
  body: unknown,
  headers: Record<string, string> = { 'X-Documenso-Secret': SECRET },
): Request {
  return new Request('https://opendealbook.com/api/webhooks/documenso', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function post(request: Request): Promise<Response> {
  const { POST } = await import('./route');

  return POST(request);
}

function expectNothingHandled() {
  expect(handleFormSignatureEvent).not.toHaveBeenCalled();
  expect(handleContractSignatureEvent).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  logged.length = 0;
  process.env.DOCUMENSO_WEBHOOK_SECRET = SECRET;
  process.env.DOCUMENSO_URL = 'https://sign.test';
  process.env.DOCUMENSO_API_KEY = 'api_test';
  handleContractSignatureEvent.mockResolvedValue(undefined);
  handleFormSignatureEvent.mockResolvedValue(false);
});

describe('who the documenso webhook listens to', () => {
  it('refuses a request without the secret header and acts on nothing', async () => {
    const response = await post(webhookRequest(documentCompleted, {}));

    expect(response.status).toBe(401);
    expectNothingHandled();
  });

  it('refuses a request with the wrong secret and acts on nothing', async () => {
    const response = await post(
      webhookRequest(documentCompleted, {
        'X-Documenso-Secret': `${SECRET.slice(0, -1)}x`,
      }),
    );

    expect(response.status).toBe(401);
    expectNothingHandled();
  });

  it('accepts the right secret', async () => {
    const response = await post(webhookRequest(documentCompleted));

    expect(response.status).toBe(200);
  });

  it('accepts the right secret under a lower-case header name', async () => {
    const response = await post(
      webhookRequest(documentCompleted, { 'x-documenso-secret': SECRET }),
    );

    expect(response.status).toBe(200);
  });

  it('refuses every request when no secret is configured, and says so once', async () => {
    delete process.env.DOCUMENSO_WEBHOOK_SECRET;

    const responses = [
      await post(webhookRequest(documentCompleted, {})),
      await post(webhookRequest(documentCompleted)),
    ];

    expect(responses.map((response) => response.status)).toEqual([401, 401]);
    expectNothingHandled();
    expect(logged).toEqual([{ level: 'warn', message: REFUSING }]);
  });

  it('refuses an empty header when the configured secret is an empty string', async () => {
    process.env.DOCUMENSO_WEBHOOK_SECRET = '';

    const response = await post(
      webhookRequest(documentCompleted, { 'X-Documenso-Secret': '' }),
    );

    expect(response.status).toBe(401);
    expectNothingHandled();
    expect(logged).toEqual([{ level: 'warn', message: REFUSING }]);
  });

  it('refuses every request when the configured secret is shorter than 32 characters, and says so once', async () => {
    const short = SECRET.slice(0, 31);
    process.env.DOCUMENSO_WEBHOOK_SECRET = short;

    const responses = [
      await post(
        webhookRequest(documentCompleted, { 'X-Documenso-Secret': short }),
      ),
      await post(
        webhookRequest(documentCompleted, { 'X-Documenso-Secret': short }),
      ),
    ];

    expect(responses.map((response) => response.status)).toEqual([401, 401]);
    expectNothingHandled();
    expect(logged).toEqual([{ level: 'warn', message: REFUSING }]);
  });
});

describe('what the documenso webhook does with an event', () => {
  it('offers the envelope to lender forms first, then to contracts', async () => {
    const response = await post(webhookRequest(documentCompleted));

    expect(response.status).toBe(200);
    expect(handleFormSignatureEvent).toHaveBeenCalledWith(ENVELOPE_ID, {
      admin: adminClient,
      documenso,
    });
    expect(handleContractSignatureEvent).toHaveBeenCalledWith(ENVELOPE_ID, {
      client: adminClient,
      admin: adminClient,
      documenso,
    });
  });

  it('keeps an envelope that belongs to a lender form away from contracts', async () => {
    handleFormSignatureEvent.mockResolvedValue(true);

    const response = await post(webhookRequest(documentCompleted));

    expect(response.status).toBe(200);
    expect(handleContractSignatureEvent).not.toHaveBeenCalled();
  });

  it('acknowledges a progress event without acting on it', async () => {
    const response = await post(webhookRequest(documentSigned));

    expect(response.status).toBe(200);
    expectNothingHandled();
  });

  it.each([
    ['is not JSON', '{"event": "DOCUMENT_COMPL'],
    ['is not a Documenso webhook', { hello: 'world' }],
    ['names no envelope', { event: 'DOCUMENT_COMPLETED', payload: {} }],
  ])('answers 400 to a body that %s', async (_label, body) => {
    const response = await post(webhookRequest(body));

    expect(response.status).toBe(400);
    expectNothingHandled();
  });

  it('acknowledges and does nothing, saying so once, when the secret is set but Documenso is not otherwise configured', async () => {
    delete process.env.DOCUMENSO_API_KEY;

    const responses = [
      await post(webhookRequest(documentCompleted)),
      await post(webhookRequest(documentCompleted)),
    ];

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expectNothingHandled();
    expect(logged).toEqual([
      {
        level: 'warn',
        message:
          'Documenso is not configured; acknowledging its webhooks without acting on them',
      },
    ]);
  });

  it('answers 500 when handling fails, so Documenso delivers it again', async () => {
    handleFormSignatureEvent.mockRejectedValue(new Error('storage is down'));

    const response = await post(webhookRequest(documentCompleted));

    expect(response.status).toBe(500);
    expect(logged).toEqual([
      { level: 'error', message: 'Documenso webhook could not be handled' },
    ]);
  });
});
