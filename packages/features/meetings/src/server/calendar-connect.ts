'use server';

import { getNangoClient } from '@odb/integrations';
import { enhanceAction } from '@odb/next/actions';
import type { TablesInsert } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  connectCalendarSchema,
  createCalendarConnectSessionSchema,
} from '../schema/calendar-connection.schema';

const INTEGRATION_ENV: Record<'google' | 'microsoft', string> = {
  google: 'NANGO_GOOGLE_CALENDAR_INTEGRATION_ID',
  microsoft: 'NANGO_MICROSOFT_CALENDAR_INTEGRATION_ID',
};

export const createCalendarConnectSession = enhanceAction(
  async (data) => {
    const envKey = INTEGRATION_ENV[data.provider];
    const integrationId = process.env[envKey];

    if (!integrationId) {
      throw new Error(`Missing required environment variable: ${envKey}`);
    }

    const session = await getNangoClient().createConnectSession({
      end_user: { id: data.accountId },
      allowed_integrations: [integrationId],
    });

    return session.data.token;
  },
  { auth: true, schema: createCalendarConnectSessionSchema },
);

export const connectCalendar = enhanceAction(
  async (data, user) => {
    const insert: TablesInsert<'calendar_connection'> = {
      account_id: data.accountId,
      user_id: user.id,
      provider: data.provider,
      nango_connection_id: data.nangoConnectionId,
      provider_config_key: data.providerConfigKey,
      email: data.email ?? null,
    };

    const { data: row, error } = await getSupabaseServerClient()
      .from('calendar_connection')
      .insert(insert)
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    return row.id;
  },
  { auth: true, schema: connectCalendarSchema },
);
