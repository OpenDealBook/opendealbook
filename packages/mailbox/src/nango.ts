import { getNangoClient } from '@odb/integrations';

import type { MailboxConnection } from './types';

export async function resolveAccessToken(
  connection: MailboxConnection,
): Promise<string> {
  const token = await getNangoClient().getToken(
    connection.providerConfigKey,
    connection.nangoConnectionId,
  );
  return token as string;
}
