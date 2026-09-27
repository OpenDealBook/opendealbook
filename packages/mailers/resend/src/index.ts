import { Resend } from 'resend';

import type { Mailer, MailerConfig, MailerSendResult } from '@tuckin/mailers';

export function createMailer(): Mailer {
  return new ResendMailer();
}

class ResendMailer implements Mailer {
  async sendEmail(config: MailerConfig): Promise<MailerSendResult> {
    const resend = new Resend(process.env.RESEND_API_KEY);

    const content =
      config.html !== undefined
        ? { html: config.html }
        : { text: config.text! };

    const { data, error } = await resend.emails.send({
      from: config.from,
      to: config.to,
      subject: config.subject,
      ...content,
    });

    if (error) {
      throw new Error(error.message);
    }

    return { messageId: data?.id };
  }
}
