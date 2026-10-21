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
  target_close_date: '2027-04-30',
  must_close_by: '2027-03-31',
  must_close_reason: null,
  buyer_team: 'Harbor Acquisitions',
  loan_amount: 2240000,
  loan_type: 'sba_7a',
  term_years: 10,
  seller_note_amount: 300000,
};

describe('headerFacts', () => {
  it('describes a fully set up room', () => {
    expect(headerFacts(room)).toEqual({
      lenderName: 'First Harbor Bank',
      initials: 'FH',
      logoPath: 'firstharbor.com/logo.png',
      dealName: 'Dockside Cafe Group',
      buyerTeam: 'Harbor Acquisitions',
      loanAsk: '$2,240,000 SBA 7(a) plus $300,000 seller note, 10-year term',
      closeBy: 'March 31, 2027',
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

  it('asks only for what the team saved, and closes by the target date when there is no deadline', () => {
    const facts = headerFacts({
      ...room,
      must_close_by: null,
      term_years: null,
      seller_note_amount: null,
    });

    expect(facts.loanAsk).toBe('$2,240,000 SBA 7(a)');
    expect(facts.closeBy).toBe('April 30, 2027');
  });

  it('has no loan ask or close-by date when the team saved none', () => {
    const facts = headerFacts({
      ...room,
      target_close_date: null,
      must_close_by: null,
      loan_amount: null,
      loan_type: null,
      term_years: null,
      seller_note_amount: null,
    });

    expect(facts.loanAsk).toBeNull();
    expect(facts.closeBy).toBeNull();
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
