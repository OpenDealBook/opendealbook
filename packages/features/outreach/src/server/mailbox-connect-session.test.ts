import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createConnectSession = vi.fn();

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/integrations', () => ({
  getNangoClient: () => ({ createConnectSession }),
}));

import { createMailboxConnectSession } from './mailbox-connect-session';

const run = (action: unknown) =>
  action as unknown as (
    data: Record<string, unknown>,
    user: { id: string },
  ) => Promise<string>;

const ACCOUNT = '00000000-0000-4000-8000-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NANGO_GMAIL_INTEGRATION_ID = 'google-mail';
  process.env.NANGO_MICROSOFT_INTEGRATION_ID = 'outlook-mail';
});

afterEach(() => {
  delete process.env.NANGO_GMAIL_INTEGRATION_ID;
  delete process.env.NANGO_MICROSOFT_INTEGRATION_ID;
});

describe('createMailboxConnectSession', () => {
  it('opens a connect session scoped to the account and the gmail integration and returns its token', async () => {
    createConnectSession.mockResolvedValue({
      data: { token: 'sess-token', connect_link: '', expires_at: '' },
    });

    const token = await run(createMailboxConnectSession)(
      { accountId: ACCOUNT, provider: 'gmail' },
      { id: 'user-1' },
    );

    expect(createConnectSession).toHaveBeenCalledWith({
      end_user: { id: ACCOUNT },
      allowed_integrations: ['google-mail'],
    });
    expect(token).toBe('sess-token');
  });

  it('scopes the session to the microsoft integration for a microsoft mailbox', async () => {
    createConnectSession.mockResolvedValue({
      data: { token: 't', connect_link: '', expires_at: '' },
    });

    await run(createMailboxConnectSession)(
      { accountId: ACCOUNT, provider: 'microsoft' },
      { id: 'user-1' },
    );

    expect(createConnectSession).toHaveBeenCalledWith({
      end_user: { id: ACCOUNT },
      allowed_integrations: ['outlook-mail'],
    });
  });

  it('throws naming the integration env var when it is not configured', async () => {
    delete process.env.NANGO_GMAIL_INTEGRATION_ID;

    await expect(
      run(createMailboxConnectSession)(
        { accountId: ACCOUNT, provider: 'gmail' },
        { id: 'user-1' },
      ),
    ).rejects.toThrow('NANGO_GMAIL_INTEGRATION_ID');
  });
});
