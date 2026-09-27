import { createProxy } from './base';
import type { AdapterConfig, MailAdapter, MailMessage } from './types';

export function createMicrosoftMailAdapter(config: AdapterConfig): MailAdapter {
  const proxy = createProxy(config);

  return {
    provider: 'microsoft',
    proxy,
    listMessages: (params) => proxy({ endpoint: '/v1.0/me/messages', params }),
    sendMessage: (message: MailMessage) =>
      proxy({ method: 'POST', endpoint: '/v1.0/me/sendMail', data: message }),
  };
}
