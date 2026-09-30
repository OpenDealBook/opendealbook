import { describe, expect, it } from 'vitest';

import { buildMimeMessage, encodeBase64Url } from './mime';
import type { MailboxConnection } from './types';

const connection: MailboxConnection = {
  provider: 'gmail',
  nangoConnectionId: 'conn-1',
  providerConfigKey: 'google-mail',
  emailAddress: 'operator@firm.com',
};

describe('buildMimeMessage', () => {
  it('writes From, To, Subject and MIME-Version headers', () => {
    const raw = buildMimeMessage(connection, {
      to: 'lead@target.com',
      subject: 'Following up',
      text: 'Hi there',
    });

    expect(raw).toContain('From: operator@firm.com');
    expect(raw).toContain('To: lead@target.com');
    expect(raw).toContain('Subject: Following up');
    expect(raw).toContain('MIME-Version: 1.0');
  });

  it('uses text/plain for a text-only email', () => {
    const raw = buildMimeMessage(connection, {
      to: 'lead@target.com',
      subject: 's',
      text: 'plain body',
    });

    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(raw).toContain('plain body');
    expect(raw).not.toContain('multipart/alternative');
  });

  it('uses text/html for an html-only email', () => {
    const raw = buildMimeMessage(connection, {
      to: 'lead@target.com',
      subject: 's',
      html: '<p>rich body</p>',
    });

    expect(raw).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(raw).toContain('<p>rich body</p>');
  });

  it('builds multipart/alternative with text before html when both are given', () => {
    const raw = buildMimeMessage(connection, {
      to: 'lead@target.com',
      subject: 's',
      text: 'plain body',
      html: '<p>rich body</p>',
    });

    expect(raw).toContain('multipart/alternative; boundary=');
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(raw).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(raw.indexOf('plain body')).toBeLessThan(raw.indexOf('<p>rich body</p>'));
  });

  it('adds Reply-To only when provided', () => {
    const withReplyTo = buildMimeMessage(connection, {
      to: 'lead@target.com',
      subject: 's',
      text: 'b',
      replyTo: 'inbox@firm.com',
    });
    const withoutReplyTo = buildMimeMessage(connection, {
      to: 'lead@target.com',
      subject: 's',
      text: 'b',
    });

    expect(withReplyTo).toContain('Reply-To: inbox@firm.com');
    expect(withoutReplyTo).not.toContain('Reply-To:');
  });
});

describe('encodeBase64Url', () => {
  it('encodes to URL-safe base64 without padding', () => {
    const encoded = encodeBase64Url('subject?>>strings//with++specials');

    expect(encoded).not.toMatch(/[+/=]/);
    expect(Buffer.from(encoded, 'base64url').toString('utf-8')).toBe(
      'subject?>>strings//with++specials',
    );
  });
});
