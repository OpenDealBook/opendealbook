export type {
  AdapterConfig,
  ProxyRequest,
  IntegrationAdapter,
  MailMessage,
  MailAdapter,
  CalendarEvent,
  CalendarAdapter,
  EmailPayload,
  EmailAdapter,
} from './types';
export { createGmailAdapter } from './gmail';
export { createMicrosoftMailAdapter } from './microsoft';
export { createGoogleCalendarAdapter } from './google-calendar';
export { createOutlookCalendarAdapter } from './outlook-calendar';
export { createSendgridAdapter } from './sendgrid';
