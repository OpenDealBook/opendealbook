import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums } from '@odb/supabase';

import { resolveNovuChannels } from './preferences';

export interface NovuClient {
  trigger(
    workflowId: string,
    data: { to: { subscriberId: string }; payload: Record<string, unknown> },
  ): Promise<unknown>;
  subscribers: {
    identify(
      subscriberId: string,
      data: { email: string; firstName?: string; lastName?: string },
    ): Promise<unknown>;
  };
}

export interface TriggerNotificationInput {
  eventType: string;
  recipientUserId: string;
  payload: Record<string, unknown>;
}

export interface NovuSubscriber {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export async function triggerNotification(
  deps: { novu: NovuClient; client: SupabaseClient<Database> },
  input: TriggerNotificationInput,
): Promise<Enums<'notification_channel'>[]> {
  const channels = await resolveNovuChannels(
    deps.client,
    input.recipientUserId,
    input.eventType,
  );

  if (channels.length === 0) {
    return channels;
  }

  await deps.novu.trigger(input.eventType, {
    to: { subscriberId: input.recipientUserId },
    payload: input.payload,
  });

  return channels;
}

export async function syncNovuSubscriber(
  novu: NovuClient,
  user: NovuSubscriber,
): Promise<void> {
  await novu.subscribers.identify(user.id, {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  });
}
