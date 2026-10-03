import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleDocumensoWebhook = vi.fn();
const adminClient = { from: vi.fn() };

vi.mock('@odb/contracts/esign', () => ({ handleDocumensoWebhook }));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerAdminClient: () => adminClient,
}));
vi.mock('@odb/next/routes', () => ({
  enhanceRouteHandler:
    (fn: (params: { request: Request }) => Promise<Response>) =>
    (request: Request) =>
      fn({ request }),
}));

const { POST } = await import('./route');

function webhookRequest(body: unknown): Request {
  return new Request('https://opendealbook.com/api/webhooks/documenso', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('documenso webhook POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleDocumensoWebhook.mockResolvedValue(undefined);
  });

  it('forwards the webhook payload to the handler and returns 200', async () => {
    const payload = {
      event: 'document.completed',
      payload: { externalId: 'ver-2', documentHash: 'sha256:abc' },
    };

    const response = await POST(webhookRequest(payload));

    expect(response.status).toBe(200);
    expect(handleDocumensoWebhook).toHaveBeenCalledWith(payload, {
      client: adminClient,
    });
  });
});
