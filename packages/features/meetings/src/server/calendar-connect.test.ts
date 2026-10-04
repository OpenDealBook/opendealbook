import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createConnectSession = vi.fn();
const insertSpy = vi.fn();

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/integrations', () => ({
  getNangoClient: () => ({ createConnectSession }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {};
      builder.insert = (payload: unknown) => {
        insertSpy(payload);
        return builder;
      };
      builder.select = () => builder;
      builder.single = () =>
        Promise.resolve({ data: { id: 'conn-1' }, error: null });
      return builder;
    },
  }),
}));

import {
  connectCalendar,
  createCalendarConnectSession,
} from './calendar-connect';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

const runSession = createCalendarConnectSession as unknown as Action;
const runConnect = connectCalendar as unknown as Action;

const ACCOUNT = '00000000-0000-4000-8000-000000000001';
const user = { id: 'user-1' };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NANGO_GOOGLE_CALENDAR_INTEGRATION_ID = 'google-calendar';
  process.env.NANGO_MICROSOFT_CALENDAR_INTEGRATION_ID = 'outlook-calendar';
});

afterEach(() => {
  delete process.env.NANGO_GOOGLE_CALENDAR_INTEGRATION_ID;
  delete process.env.NANGO_MICROSOFT_CALENDAR_INTEGRATION_ID;
});

describe('createCalendarConnectSession', () => {
  it('scopes the session to the account and the google calendar integration', async () => {
    createConnectSession.mockResolvedValue({ data: { token: 'sess' } });

    const token = await runSession(
      { accountId: ACCOUNT, provider: 'google' },
      user,
    );

    expect(createConnectSession).toHaveBeenCalledWith({
      end_user: { id: ACCOUNT },
      allowed_integrations: ['google-calendar'],
    });
    expect(token).toBe('sess');
  });

  it('scopes the session to the microsoft calendar integration for microsoft', async () => {
    createConnectSession.mockResolvedValue({ data: { token: 't' } });

    await runSession({ accountId: ACCOUNT, provider: 'microsoft' }, user);

    expect(createConnectSession).toHaveBeenCalledWith({
      end_user: { id: ACCOUNT },
      allowed_integrations: ['outlook-calendar'],
    });
  });

  it('throws naming the integration env var when it is not configured', async () => {
    delete process.env.NANGO_GOOGLE_CALENDAR_INTEGRATION_ID;

    await expect(
      runSession({ accountId: ACCOUNT, provider: 'google' }, user),
    ).rejects.toThrow('NANGO_GOOGLE_CALENDAR_INTEGRATION_ID');
  });
});

describe('connectCalendar', () => {
  it('persists the connection for the acting user scoped to the account and provider', async () => {
    const id = await runConnect(
      {
        accountId: ACCOUNT,
        provider: 'google',
        nangoConnectionId: 'nango-1',
        providerConfigKey: 'google-calendar',
        email: 'rep@example.com',
      },
      user,
    );

    expect(insertSpy).toHaveBeenCalledWith({
      account_id: ACCOUNT,
      user_id: 'user-1',
      provider: 'google',
      nango_connection_id: 'nango-1',
      provider_config_key: 'google-calendar',
      email: 'rep@example.com',
    });
    expect(id).toBe('conn-1');
  });
});
