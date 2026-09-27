import { createProxy } from './base';
import type { AdapterConfig, EmailAdapter, EmailPayload } from './types';

export function createSendgridAdapter(config: AdapterConfig): EmailAdapter {
  const proxy = createProxy(config);

  return {
    provider: 'sendgrid',
    proxy,
    sendEmail: (payload: EmailPayload) =>
      proxy({
        method: 'POST',
        endpoint: '/v3/mail/send',
        data: {
          personalizations: [{ to: [{ email: payload.to }] }],
          from: { email: payload.from },
          subject: payload.subject,
          content: [{ type: 'text/html', value: payload.html }],
        },
      }),
  };
}
