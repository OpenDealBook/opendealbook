import type { Mailer, MailerConfig, MailerSendResult } from '@odb/mailers';

export function createMailer(): Mailer {
  return new NodemailerMailer();
}

class NodemailerMailer implements Mailer {
  async sendEmail(config: MailerConfig): Promise<MailerSendResult> {
    const { createTransport } = await import('nodemailer');
    const transporter = createTransport(getSmtpTransport());

    const info = await transporter.sendMail(config);

    return { messageId: info.messageId };
  }
}

function getSmtpTransport() {
  return {
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_TLS !== 'false',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  };
}
