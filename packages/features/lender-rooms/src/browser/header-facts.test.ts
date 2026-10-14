import { describe, expect, it } from 'vitest';

import type { LenderRoomSummary } from '../members/entry-rules';
import { contactFacts, headerFacts } from './header-facts';

const room: LenderRoomSummary = {
  id: '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
  deal_id: '0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22',
  name: 'First Harbor Bank',
  welcome_note: 'Glad to have you looking at this one.',
  expires_at: '2026-12-11T00:00:00Z',
  is_open: true,
  private_folder_id: 'private',
  master_folder_id: 'master',
  brand_name: 'First Harbor Bank, N.A.',
  brand_logo_path: 'firstharbor.com/logo.png',
  deal_name: 'Dockside Cafe Group',
  deal_description: 'Three-location cafe group on the waterfront',
};

describe('headerFacts', () => {
  it('describes a fully set up room', () => {
    expect(headerFacts(room)).toEqual({
      lenderName: 'First Harbor Bank',
      initials: 'FH',
      logoPath: 'firstharbor.com/logo.png',
      dealName: 'Dockside Cafe Group',
      dealDescription: 'Three-location cafe group on the waterfront',
      welcomeNote: 'Glad to have you looking at this one.',
      accessEnds: '2026-12-11T00:00:00Z',
      packageLabel: 'Dockside Cafe Group lender package',
      recordedFor: "Dockside Cafe Group's team",
    });
  });

  it('has no logo, note, or end date when the room has none', () => {
    const facts = headerFacts({
      ...room,
      brand_logo_path: null,
      welcome_note: null,
      expires_at: null,
    });

    expect(facts.logoPath).toBeNull();
    expect(facts.welcomeNote).toBeNull();
    expect(facts.accessEnds).toBeNull();
    expect(facts.initials).toBe('FH');
  });

  it('speaks of the deal team when the deal has no name', () => {
    const facts = headerFacts({ ...room, deal_name: null });

    expect(facts.dealName).toBeNull();
    expect(facts.packageLabel).toBe('Lender package');
    expect(facts.recordedFor).toBe('the deal team');
  });

  it('uses the one initial of a one-word lender name', () => {
    expect(headerFacts({ ...room, name: 'Chase' }).initials).toBe('C');
  });
});

describe('contactFacts', () => {
  const profile = {
    display_name: 'Dana Whitfield',
    photo_path: 'account/photo.png',
    contact_json: {
      email: 'dana@dockside.test',
      phone: '555 0142',
      website: '',
    },
  };

  it('gives the name, photo, email, and phone of the contact on the deal team', () => {
    expect(contactFacts(profile)).toEqual({
      name: 'Dana Whitfield',
      photoPath: 'account/photo.png',
      email: 'dana@dockside.test',
      phone: '555 0142',
    });
  });

  it('has no photo or phone when the profile has none', () => {
    const facts = contactFacts({
      ...profile,
      photo_path: null,
      contact_json: { ...profile.contact_json, phone: '' },
    });

    expect(facts?.photoPath).toBeNull();
    expect(facts?.phone).toBeNull();
  });

  it('is absent when the account has no profile with a name and email', () => {
    expect(contactFacts(null)).toBeNull();
    expect(contactFacts({ ...profile, display_name: null })).toBeNull();
  });
});
