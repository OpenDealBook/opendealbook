import { describe, expect, it } from 'vitest';

import { renderInvitationEmail } from '../emails/invitation.email';
import { renderLenderDocumentsDigestEmail } from '../emails/lender-documents-digest.email';
import { renderLenderNoticeEmail } from '../emails/lender-notice.email';
import { renderLenderSignInEmail } from '../emails/lender-sign-in.email';
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

  it('renders the lender sign-in email with the sign-in link', async () => {
    const email = await renderLenderSignInEmail({
      productName: 'Open Deal Book',
      signInLink: 'https://opendealbook.app/auth/confirm?token_hash=abc',
    });

    expect(email.subject).toContain('Open Deal Book');
    expect(email.html).toContain(
      'https://opendealbook.app/auth/confirm?token_hash=abc',
    );
    expect(email.text).toContain(
      'https://opendealbook.app/auth/confirm?token_hash=abc',
    );
  });

  it('renders a lender notice with its message and action link', async () => {
    const email = await renderLenderNoticeEmail({
      productName: 'Open Deal Book',
      subject: 'The deal team answered your request',
      message: 'The deal team has replied to a request you made.',
      actionLabel: 'View the request',
      actionLink: 'https://opendealbook.app/lender/room-1/requests/asks/ask-1',
    });

    expect(email.subject).toBe('The deal team answered your request');
    expect(email.html).toContain(
      'The deal team has replied to a request you made.',
    );
    expect(email.html).toContain(
      'href="https://opendealbook.app/lender/room-1/requests/asks/ask-1"',
    );
    expect(email.text).toContain('View the request');
  });

  it('renders the lender documents digest grouped by room with new and updated files', async () => {
    const email = await renderLenderDocumentsDigestEmail({
      productName: 'Open Deal Book',
      rooms: [
        {
          name: 'First Harbor Bank',
          link: 'https://opendealbook.app/lender/room-1',
          documents: [
            { name: 'Balance sheet.xlsx', status: 'new' },
            { name: 'Tax return 2025.pdf', status: 'updated' },
          ],
          moreCount: 0,
        },
        {
          name: 'Second Harbor Bank',
          link: 'https://opendealbook.app/lender/room-2',
          documents: [{ name: 'Lease.pdf', status: 'new' }],
          moreCount: 0,
        },
      ],
    });

    expect(email.subject).toBe('3 new or updated documents in your lender rooms');
    expect(email.html).toMatch(
      /First Harbor Bank[\s\S]*Balance sheet\.xlsx \(new\)[\s\S]*Tax return 2025\.pdf \(updated\)[\s\S]*Second Harbor Bank[\s\S]*Lease\.pdf \(new\)/,
    );
    expect(email.html).toContain('href="https://opendealbook.app/lender/room-1"');
    expect(email.html).toContain('href="https://opendealbook.app/lender/room-2"');
  });

  it('words the digest subject for a single document in a single room', async () => {
    const email = await renderLenderDocumentsDigestEmail({
      productName: 'Open Deal Book',
      rooms: [
        {
          name: 'First Harbor Bank',
          link: 'https://opendealbook.app/lender/room-1',
          documents: [{ name: 'Lease.pdf', status: 'updated' }],
          moreCount: 0,
        },
      ],
    });

    expect(email.subject).toBe('1 new or updated document in your lender room');
  });

  it('ends a long room with a linked count of the documents it left out', async () => {
    const email = await renderLenderDocumentsDigestEmail({
      productName: 'Open Deal Book',
      rooms: [
        {
          name: 'First Harbor Bank',
          link: 'https://opendealbook.app/lender/room-1',
          documents: [{ name: 'Lease.pdf', status: 'new' }],
          moreCount: 3,
        },
      ],
    });

    expect(email.subject).toBe('4 new or updated documents in your lender room');
    expect(email.html).toMatch(
      /Lease\.pdf \(new\)[\s\S]*<a[^>]*href="https:\/\/opendealbook\.app\/lender\/room-1"[^>]*>and 3 more<\/a>/,
    );
  });

  it('adds no count to a room that lists everything', async () => {
    const email = await renderLenderDocumentsDigestEmail({
      productName: 'Open Deal Book',
      rooms: [
        {
          name: 'First Harbor Bank',
          link: 'https://opendealbook.app/lender/room-1',
          documents: [{ name: 'Lease.pdf', status: 'new' }],
          moreCount: 0,
        },
      ],
    });

    expect(email.html).not.toContain(' more<');
  });
});
