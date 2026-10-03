import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleDatabaseWebhook = vi.fn();
const startTrialDrip = vi.fn();

vi.mock('@odb/database-webhooks', () => ({ handleDatabaseWebhook }));
vi.mock('@odb/workflows/client', () => ({ startTrialDrip }));
vi.mock('@odb/next/routes', () => ({
  enhanceRouteHandler:
    (fn: (params: { request: Request }) => Promise<Response>) =>
    (request: Request) =>
      fn({ request }),
}));

const { POST } = await import('./route');

function accountInsert(overrides: Record<string, unknown> = {}): Request {
  return new Request('https://opendealbook.com/api/db/webhook', {
    method: 'POST',
    body: JSON.stringify({
      type: 'INSERT',
      table: 'accounts',
      schema: 'public',
      record: {
        id: 'acc_1',
        primary_owner_user_id: 'user_1',
        email: 'owner@example.com',
        is_personal_account: true,
        ...overrides,
      },
      old_record: null,
    }),
  });
}

describe('db webhook POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleDatabaseWebhook.mockResolvedValue(undefined);
    startTrialDrip.mockResolvedValue(undefined);
  });

  it('starts the trial drip on a new personal-account insert', async () => {
    const response = await POST(accountInsert());

    expect(response.status).toBe(200);
    expect(startTrialDrip).toHaveBeenCalledWith({
      accountId: 'acc_1',
      userId: 'user_1',
      email: 'owner@example.com',
      productName: 'Open Deal Book',
      upgradeLink: 'https://opendealbook.com/home/billing',
      actionLink: 'https://opendealbook.com/home',
    });
  });

  it('skips the trial drip when the account email is null', async () => {
    const response = await POST(accountInsert({ email: null }));

    expect(response.status).toBe(200);
    expect(startTrialDrip).not.toHaveBeenCalled();
  });

  it('still returns success when starting the trial drip rejects', async () => {
    startTrialDrip.mockRejectedValue(new Error('Temporal down'));

    const response = await POST(accountInsert());

    expect(response.status).toBe(200);
  });
});
