import { describe, expect, it, vi } from 'vitest';

const send = vi.fn();

vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

const { createMailer } = await import('../index');

describe('resend mailer', () => {
  it('returns the resend message id on success', async () => {
    send.mockResolvedValueOnce({ data: { id: 'msg_1' }, error: null });

    const mailer = createMailer();

    const result = await mailer.sendEmail({
      to: 'user@example.com',
      from: 'noreply@example.com',
      subject: 'Hello',
      text: 'Hi',
    });

    expect(result.messageId).toBe('msg_1');
  });

  it('throws when resend returns an error', async () => {
    send.mockResolvedValueOnce({
      data: null,
      error: { name: 'validation_error', message: 'invalid recipient' },
    });

    const mailer = createMailer();

    await expect(
      mailer.sendEmail({
        to: 'user@example.com',
        from: 'noreply@example.com',
        subject: 'Hello',
        text: 'Hi',
      }),
    ).rejects.toThrow('invalid recipient');
  });
});
