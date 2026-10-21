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

  it('sends replies to the reply-to address', async () => {
    send.mockResolvedValueOnce({ data: { id: 'msg_3' }, error: null });

    await createMailer().sendEmail({
      to: 'user@example.com',
      from: 'Harbor via OpenDealbook <noreply@example.com>',
      replyTo: 'author@example.com',
      subject: 'Hello',
      text: 'Hi',
    });

    expect(send.mock.lastCall![0].replyTo).toBe('author@example.com');
  });

  it('sends attachments as buffers of the same bytes', async () => {
    send.mockResolvedValueOnce({ data: { id: 'msg_2' }, error: null });
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

    const [{ attachments }] = send.mock.lastCall!;

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
