import { describe, expect, it } from 'vitest';

import { renderInvitationEmail } from '../emails/invitation.email';
import { renderPasswordResetEmail } from '../emails/password-reset.email';
import { renderTrialDayOneEmail } from '../emails/trial-day-1.email';
import { renderTrialDayThreeEmail } from '../emails/trial-day-3.email';
import { renderTrialDaySixEmail } from '../emails/trial-day-6.email';
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

  it('renders the welcome email with an optional import link', async () => {
    const email = await renderWelcomeEmail({
      productName: 'Open Deal Book',
      actionLink: 'https://opendealbook.app/deals/new',
      importLink: 'https://opendealbook.app/import',
    });

    expect(email.html).toContain('https://opendealbook.app/deals/new');
    expect(email.html).toContain('https://opendealbook.app/import');
  });

  it('renders the trial day-1 email with the activation cta', async () => {
    const email = await renderTrialDayOneEmail({
      productName: 'Open Deal Book',
      userName: 'Ada',
      actionLink: 'https://opendealbook.app/deals/new',
    });

    expect(email.subject).toContain('Open Deal Book');
    expect(email.html).toContain('https://opendealbook.app/deals/new');
    expect(email.text).toContain('Create your first deal');
  });

  it('renders the trial day-3 email with the workspace cta', async () => {
    const email = await renderTrialDayThreeEmail({
      productName: 'Open Deal Book',
      actionLink: 'https://opendealbook.app/workspace',
    });

    expect(email.subject).toContain('Open Deal Book');
    expect(email.html).toContain('https://opendealbook.app/workspace');
    expect(email.text).toContain('comparables');
  });

  it('renders the trial day-6 email with the upgrade cta', async () => {
    const email = await renderTrialDaySixEmail({
      productName: 'Open Deal Book',
      upgradeLink: 'https://opendealbook.app/billing/plans',
    });

    expect(email.subject).toContain('trial ends soon');
    expect(email.html).toContain('https://opendealbook.app/billing/plans');
    expect(email.text).toContain('Choose your plan');
  });
});
