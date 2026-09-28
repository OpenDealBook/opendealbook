import { describe, expect, it } from 'vitest';

import type { BuyerProfile } from './render-buyer-profile-html';
import { renderBuyerProfileHtml } from './render-buyer-profile-html';

function sampleProfile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    about: 'Second generation operator.',
    account_id: 'account-1',
    contact_json: null,
    created_at: null,
    created_by: null,
    display_name: 'Jordan Buyer',
    experience: 'Ran two regional firms.',
    expertise_json: null,
    financing_json: null,
    headline: 'Acquiring tax and accounting practices',
    id: 'profile-1',
    include_sensitive: false,
    interested_json: null,
    motivation: 'Long term stewardship.',
    not_interested_json: null,
    photo_path: null,
    sensitive_json: null,
    target_statement: 'Firms with 300k to 1M revenue.',
    updated_at: null,
    updated_by: null,
    value_proposition: 'Continuity for staff and clients.',
    version: 1,
    ...overrides,
  };
}

describe('renderBuyerProfileHtml', () => {
  it('renders the identity header and each populated text section', () => {
    const html = renderBuyerProfileHtml(sampleProfile());

    expect(html).toContain('Jordan Buyer');
    expect(html).toContain('Acquiring tax and accounting practices');
    expect(html).toContain('About');
    expect(html).toContain('Second generation operator.');
    expect(html).toContain('Experience');
    expect(html).toContain('Motivation');
    expect(html).toContain('Target');
    expect(html).toContain('Value Proposition');
    expect(html).toContain('Continuity for staff and clients.');
  });

  it('omits a section whose field is null', () => {
    const html = renderBuyerProfileHtml(sampleProfile({ motivation: null }));

    expect(html).not.toContain('Motivation');
  });

  it('escapes html-significant characters in field values', () => {
    const html = renderBuyerProfileHtml(
      sampleProfile({ about: 'buy & hold <fast>' }),
    );

    expect(html).toContain('buy &amp; hold &lt;fast&gt;');
    expect(html).not.toContain('<fast>');
  });

  it('renders the previously dropped json sections when populated', () => {
    const html = renderBuyerProfileHtml(
      sampleProfile({
        expertise_json: { areas: ['tax'] },
        financing_json: { sba: true },
        contact_json: { email: 'jordan@example.com' },
        interested_json: ['retiring owners'],
        not_interested_json: ['distressed'],
      }),
    );

    expect(html).toContain('Expertise');
    expect(html).toContain('tax');
    expect(html).toContain('Financing');
    expect(html).toContain('Contact');
    expect(html).toContain('jordan@example.com');
    expect(html).toContain('Interested');
    expect(html).toContain('Not Interested');
  });

  it('omits json sections whose column is null', () => {
    const html = renderBuyerProfileHtml(sampleProfile());

    expect(html).not.toContain('Expertise');
    expect(html).not.toContain('Financing');
    expect(html).not.toContain('Contact');
  });

  it('renders the photo path section when present', () => {
    const html = renderBuyerProfileHtml(
      sampleProfile({ photo_path: 'photos/jordan.png' }),
    );

    expect(html).toContain('Photo');
    expect(html).toContain('photos/jordan.png');
  });

  it('omits sensitive data by default', () => {
    const html = renderBuyerProfileHtml(
      sampleProfile({ include_sensitive: true, sensitive_json: { ssn: '123' } }),
    );

    expect(html).not.toContain('Sensitive');
    expect(html).not.toContain('123');
  });

  it('omits sensitive data when the profile allows it but the caller does not opt in', () => {
    const html = renderBuyerProfileHtml(
      sampleProfile({ include_sensitive: true, sensitive_json: { ssn: '123' } }),
      { includeSensitive: false },
    );

    expect(html).not.toContain('123');
  });

  it('omits sensitive data when the caller opts in but the profile disallows it', () => {
    const html = renderBuyerProfileHtml(
      sampleProfile({
        include_sensitive: false,
        sensitive_json: { ssn: '123' },
      }),
      { includeSensitive: true },
    );

    expect(html).not.toContain('123');
  });

  it('renders sensitive data only when the profile allows it and the caller opts in', () => {
    const html = renderBuyerProfileHtml(
      sampleProfile({ include_sensitive: true, sensitive_json: { ssn: '123' } }),
      { includeSensitive: true },
    );

    expect(html).toContain('Sensitive');
    expect(html).toContain('123');
  });

  it('throws when display_name is null', () => {
    expect(() =>
      renderBuyerProfileHtml(sampleProfile({ display_name: null })),
    ).toThrow(/display_name/);
  });
});
