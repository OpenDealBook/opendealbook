import { describe, expect, it, vi } from 'vitest';

const sendMail = vi.fn().mockResolvedValue({ messageId: 'nm_123' });

vi.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail }),
}));

const { createMailer } = await import('../index');

describe('nodemailer mailer', () => {
  it('returns the transport message id', async () => {
    const mailer = createMailer();

    const result = await mailer.sendEmail({
      to: 'user@example.com',
      from: 'noreply@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
    });

    expect(result.messageId).toBe('nm_123');
  });

  it('hands the reply-to address to the transport', async () => {
    await createMailer().sendEmail({
      to: 'user@example.com',
      from: 'Harbor via OpenDealbook <noreply@example.com>',
      replyTo: 'author@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
    });

    expect(sendMail.mock.lastCall![0].replyTo).toBe('author@example.com');
  });

  it('hands attachments to the transport as buffers of the same bytes', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.4');

    await createMailer().sendEmail({
      to: 'user@example.com',
      from: 'noreply@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
      attachments: [
        { filename: 'doc.pdf', content: pdf, contentType: 'application/pdf' },
      ],
    });

    const [{ attachments }] = sendMail.mock.lastCall!;

    expect(attachments).toEqual([
      {
        filename: 'doc.pdf',
        content: Buffer.from(pdf),
        contentType: 'application/pdf',
      },
    ]);
    expect(Buffer.isBuffer(attachments[0].content)).toBe(true);
  });
});
