import { describe, expect, it } from 'vitest';

import { renderInvitationEmail } from '../emails/invitation.email';
import { renderPasswordResetEmail } from '../emails/password-reset.email';
import { renderVerificationEmail } from '../emails/verification.email';
import { renderWelcomeEmail } from '../emails/welcome.email';

describe('email templates', () => {
  it('renders the invitation email with html, text and subject', async () => {
    const email = await renderInvitationEmail({
      productName: 'Tuckin',
      teamName: 'Acme',
      inviter: 'Ada',
      invitedEmail: 'user@example.com',
      invitationLink: 'https://tuckin.app/invite/abc',
    });

    expect(email.subject).toContain('Acme');
    expect(email.html).toContain('https://tuckin.app/invite/abc');
    expect(email.text).toContain('Acme');
  });

  it('renders the verification email including the otp', async () => {
    const email = await renderVerificationEmail({
      productName: 'Tuckin',
      otp: '123456',
    });

    expect(email.html).toContain('123456');
    expect(email.text).toContain('123456');
    expect(email.subject).toContain('Tuckin');
  });

  it('renders the password reset email with the reset link', async () => {
    const email = await renderPasswordResetEmail({
      productName: 'Tuckin',
      resetLink: 'https://tuckin.app/reset/xyz',
    });

    expect(email.html).toContain('https://tuckin.app/reset/xyz');
    expect(email.subject).toContain('Tuckin');
  });

  it('renders the welcome email with the recipient name', async () => {
    const email = await renderWelcomeEmail({
      productName: 'Tuckin',
      userName: 'Ada',
    });

    expect(email.html).toContain('Ada');
    expect(email.subject).toContain('Tuckin');
  });
});
