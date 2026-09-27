import { describe, expect, it } from 'vitest';

import { MailerSchema } from '../config';

describe('MailerSchema', () => {
  it('accepts a config carrying html content', () => {
    const result = MailerSchema.safeParse({
      to: 'user@example.com',
      from: 'noreply@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a config with neither html nor text', () => {
    const result = MailerSchema.safeParse({
      to: 'user@example.com',
      from: 'noreply@example.com',
      subject: 'Hello',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid recipient address', () => {
    const result = MailerSchema.safeParse({
      to: 'not-an-email',
      from: 'noreply@example.com',
      subject: 'Hello',
      text: 'Hi',
    });

    expect(result.success).toBe(false);
  });
});
