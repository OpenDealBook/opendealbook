import { createProxy } from './base';
import type { AdapterConfig, MailAdapter, MailMessage } from './types';

export function createGmailAdapter(config: AdapterConfig): MailAdapter {
  const proxy = createProxy(config);

  return {
    provider: 'gmail',
    proxy,
    listMessages: (params) =>
      proxy({ endpoint: '/gmail/v1/users/me/messages', params }),
    sendMessage: (message: MailMessage) =>
      proxy({
        method: 'POST',
        endpoint: '/gmail/v1/users/me/messages/send',
        data: message,
      }),
  };
}
