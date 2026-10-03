'use server';

import { getNangoClient } from '@odb/integrations';
import { enhanceAction } from '@odb/next/actions';

import { createMailboxConnectSessionSchema } from '../schema/outreach.schema';

const INTEGRATION_ENV: Record<'gmail' | 'microsoft', string> = {
  gmail: 'NANGO_GMAIL_INTEGRATION_ID',
  microsoft: 'NANGO_MICROSOFT_INTEGRATION_ID',
};

export const createMailboxConnectSession = enhanceAction(
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
  { auth: true, schema: createMailboxConnectSessionSchema },
);
