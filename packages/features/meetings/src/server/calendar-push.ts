'use server';

import { getNangoClient } from '@odb/integrations';
import {
  createGoogleCalendarAdapter,
  createOutlookCalendarAdapter,
} from '@odb/integrations/adapters';
import type { CalendarAdapter } from '@odb/integrations/adapters';
import { enhanceAction } from '@odb/next/actions';
import type { Tables } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { pushMeetingToCalendarsSchema } from '../schema/calendar-connection.schema';

const INTEGRATION_ENV: Record<string, string> = {
  google: 'NANGO_GOOGLE_CALENDAR_INTEGRATION_ID',
  microsoft: 'NANGO_MICROSOFT_CALENDAR_INTEGRATION_ID',
};

function isConfigured(provider: string): boolean {
  const envKey = INTEGRATION_ENV[provider];
  return Boolean(envKey && process.env[envKey]);
}

export const pushMeetingToCalendars = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: connections, error } = await client
      .from('calendar_connection')
      .select('*')
      .eq('account_id', data.accountId);

    if (error) {
      throw error;
    }

    const rows = (connections ?? []) as Tables<'calendar_connection'>[];
    const pushable = rows.filter((row) => isConfigured(row.provider));

    if (pushable.length === 0) {
      if (rows.length > 0) {
        console.warn(
          '[meetings] calendar integration not configured; skipping event push',
        );
      }

      return { pushed: 0, skipped: rows.length };
    }

    const nango = getNangoClient();

    for (const row of pushable) {
      const config = {
        nango,
        connectionId: row.nango_connection_id,
        providerConfigKey: row.provider_config_key,
      };

      const adapter: CalendarAdapter =
        row.provider === 'microsoft'
          ? createOutlookCalendarAdapter(config)
          : createGoogleCalendarAdapter(config);

      await adapter.createEvent({
        title: data.title,
        start: data.start,
        end: data.end,
      });
    }

    return { pushed: pushable.length, skipped: rows.length - pushable.length };
  },
  { auth: true, schema: pushMeetingToCalendarsSchema },
);
