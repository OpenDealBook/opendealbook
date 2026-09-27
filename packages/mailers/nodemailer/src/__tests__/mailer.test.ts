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
});
