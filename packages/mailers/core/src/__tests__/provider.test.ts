import { afterEach, describe, expect, it } from 'vitest';

import { getMailerProvider } from '../provider';

const originalProvider = process.env.MAILER_PROVIDER;

afterEach(() => {
  process.env.MAILER_PROVIDER = originalProvider;
});

describe('getMailerProvider', () => {
  it('defaults to nodemailer when the variable is unset', () => {
    delete process.env.MAILER_PROVIDER;

    expect(getMailerProvider()).toBe('nodemailer');
  });

  it('returns the configured provider', () => {
    process.env.MAILER_PROVIDER = 'resend';

    expect(getMailerProvider()).toBe('resend');
  });
});
