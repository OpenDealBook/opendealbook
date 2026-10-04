import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createEvent = vi.fn();
const createGoogleCalendarAdapter = vi.fn((_config: unknown) => ({
  createEvent,
}));
const createOutlookCalendarAdapter = vi.fn((_config: unknown) => ({
  createEvent,
}));
const getNangoClient = vi.fn(() => ({}));

let connections: Array<Record<string, unknown>> = [];

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/integrations', () => ({
  getNangoClient: () => getNangoClient(),
}));

vi.mock('@odb/integrations/adapters', () => ({
  createGoogleCalendarAdapter: (config: unknown) =>
    createGoogleCalendarAdapter(config),
  createOutlookCalendarAdapter: (config: unknown) =>
    createOutlookCalendarAdapter(config),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: connections, error: null }),
      }),
    }),
  }),
}));

import { pushMeetingToCalendars } from './calendar-push';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<{ pushed: number; skipped: number }>;

const run = pushMeetingToCalendars as unknown as Action;

const ACCOUNT = '00000000-0000-4000-8000-000000000001';
const DEAL = '00000000-0000-4000-8000-000000000002';
const user = { id: 'user-1' };
const event = {
  accountId: ACCOUNT,
  dealId: DEAL,
  title: 'Weekly sync',
  start: '2026-10-05T15:00:00.000Z',
  end: '2026-10-05T15:30:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  connections = [];
  process.env.NANGO_GOOGLE_CALENDAR_INTEGRATION_ID = 'google-calendar';
  process.env.NANGO_MICROSOFT_CALENDAR_INTEGRATION_ID = 'outlook-calendar';
});

afterEach(() => {
  delete process.env.NANGO_GOOGLE_CALENDAR_INTEGRATION_ID;
  delete process.env.NANGO_MICROSOFT_CALENDAR_INTEGRATION_ID;
});

describe('pushMeetingToCalendars', () => {
  it('creates a calendar event through each connected participant adapter', async () => {
    connections = [
      {
        provider: 'google',
        nango_connection_id: 'g-1',
        provider_config_key: 'google-calendar',
      },
      {
        provider: 'microsoft',
        nango_connection_id: 'm-1',
        provider_config_key: 'outlook-calendar',
      },
    ];
    createEvent.mockResolvedValue({ id: 'evt' });

    const result = await run(event, user);

    expect(createGoogleCalendarAdapter).toHaveBeenCalledWith({
      nango: expect.anything(),
      connectionId: 'g-1',
      providerConfigKey: 'google-calendar',
    });
    expect(createOutlookCalendarAdapter).toHaveBeenCalledWith({
      nango: expect.anything(),
      connectionId: 'm-1',
      providerConfigKey: 'outlook-calendar',
    });
    expect(createEvent).toHaveBeenCalledWith({
      title: 'Weekly sync',
      start: event.start,
      end: event.end,
    });
    expect(result).toEqual({ pushed: 2, skipped: 0 });
  });

  it('is a logged no-op when the calendar integration is not configured', async () => {
    delete process.env.NANGO_GOOGLE_CALENDAR_INTEGRATION_ID;
    delete process.env.NANGO_MICROSOFT_CALENDAR_INTEGRATION_ID;
    connections = [
      {
        provider: 'google',
        nango_connection_id: 'g-1',
        provider_config_key: 'google-calendar',
      },
    ];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await run(event, user);

    expect(createEvent).not.toHaveBeenCalled();
    expect(getNangoClient).not.toHaveBeenCalled();
    expect(result).toEqual({ pushed: 0, skipped: 1 });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
