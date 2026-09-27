import { z } from 'zod';

export const nangoWebhookSchema = z.object({
  type: z.string(),
  connectionId: z.string(),
  providerConfigKey: z.string(),
  provider: z.string().optional(),
  syncName: z.string().optional(),
  model: z.string().optional(),
  responseResults: z.record(z.string(), z.unknown()).optional(),
});

export type NangoWebhook = z.infer<typeof nangoWebhookSchema>;

export type IntegrationEventKind =
  | 'connection.created'
  | 'sync.completed'
  | 'unknown';

export interface NormalizedIntegrationEvent {
  kind: IntegrationEventKind;
  provider: string | null;
  connectionId: string;
  providerConfigKey: string;
  raw: NangoWebhook;
}

export type IntegrationEventHandler = (
  event: NormalizedIntegrationEvent,
) => Promise<void>;

export function parseNangoWebhook(body: unknown): NormalizedIntegrationEvent {
  const webhook = nangoWebhookSchema.parse(body);

  return {
    kind: toEventKind(webhook.type),
    provider: webhook.provider ?? null,
    connectionId: webhook.connectionId,
    providerConfigKey: webhook.providerConfigKey,
    raw: webhook,
  };
}

export function createWebhookHandler(onEvent: IntegrationEventHandler) {
  return (body: unknown): Promise<void> => onEvent(parseNangoWebhook(body));
}

function toEventKind(type: string): IntegrationEventKind {
  if (type === 'auth') {
    return 'connection.created';
  }

  if (type === 'sync') {
    return 'sync.completed';
  }

  return 'unknown';
}
