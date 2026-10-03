import { getLogger } from '@odb/shared/logger';

import type { Mailer } from '@odb/mailer-types';
import { getMailerProvider, type MailerProvider } from './provider.ts';

interface ProviderModule {
  createMailer: () => Mailer;
}

export async function getMailer(): Promise<Mailer> {
  const provider = getMailerProvider();

  getLogger().info({ provider }, 'Resolving mailer provider');

  const providerModule = (await loadProvider(provider)) as ProviderModule;

  return providerModule.createMailer();
}

function loadProvider(provider: MailerProvider) {
  return provider === 'nodemailer'
    ? import('@odb/nodemailer')
    : import('@odb/resend');
}
