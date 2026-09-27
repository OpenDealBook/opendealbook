import type { Nango } from '@nangohq/node';

export interface AdapterConfig {
  nango: Nango;
  connectionId: string;
  providerConfigKey: string;
}

export interface ProxyRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string;
  params?: Record<string, string | number>;
  data?: unknown;
  headers?: Record<string, string>;
}

export interface IntegrationAdapter {
  readonly provider: string;
  proxy<T>(request: ProxyRequest): Promise<T>;
}

export interface MailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface MailAdapter extends IntegrationAdapter {
  listMessages<T>(params?: Record<string, string | number>): Promise<T>;
  sendMessage(message: MailMessage): Promise<unknown>;
}

export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  attendees?: string[];
}

export interface CalendarAdapter extends IntegrationAdapter {
  listEvents<T>(params?: Record<string, string | number>): Promise<T>;
  createEvent(event: CalendarEvent): Promise<unknown>;
}

export interface EmailPayload {
  to: string;
  from: string;
  subject: string;
  html: string;
}

export interface EmailAdapter extends IntegrationAdapter {
  sendEmail(payload: EmailPayload): Promise<unknown>;
}
