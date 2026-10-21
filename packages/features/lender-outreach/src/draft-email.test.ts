import { describe, expect, it } from 'vitest';

import { DEFAULT_TEMPLATE } from './default-template';
import { draftEmail, type OutreachFacts } from './draft-email';

const facts: OutreachFacts = {
  dealName: 'Acme HVAC',
  contactName: 'Dana Reed',
  lenderName: 'First Bank',
  roomLink: 'https://app.test/lender/room-1',
  ourName: 'Sam Buyer',
  teamName: 'Buyer Capital',
  terms: {
    loanAmount: 500000,
    loanType: 'sba_7a',
    termYears: 10,
    rateType: 'fixed',
    sellerNoteAmount: 50000,
  },
  targetCloseDate: '2026-10-30',
  mustCloseBy: '2026-11-30',
};

const noTerms = {
  loanAmount: null,
  loanType: null,
  termYears: null,
  rateType: null,
  sellerNoteAmount: null,
};

describe('draftEmail', () => {
  it('fills the template fields', () => {
    const email = draftEmail(
      { subject: 'Hello {{contactName}}', body: '{{lenderName}} / {{dealName}} / {{teamName}}' },
      facts,
    );

    expect(email).toEqual({
      subject: 'Hello Dana Reed',
      body: 'First Bank / Acme HVAC / Buyer Capital',
    });
  });

  it('states the terms sought as a block', () => {
    const { body } = draftEmail({ subject: 's', body: '{{termsBlock}}' }, facts);

    expect(body).toBe(
      [
        'What we are looking for:',
        '- Loan amount: $500,000',
        '- Loan type: SBA 7(a)',
        '- Term: 10 years',
        '- Rate: fixed',
        '- Seller note: $50,000',
      ].join('\n'),
    );
  });

  it('states the timeline and asks whether they can close by the deadline', () => {
    const { body } = draftEmail({ subject: 's', body: '{{timelineBlock}}' }, facts);

    expect(body).toBe(
      [
        'Timeline:',
        '- Target close: October 30, 2026',
        '- Must close by: November 30, 2026',
        'Can you close by November 30, 2026?',
      ].join('\n'),
    );
  });

  it('omits terms lines that are not saved', () => {
    const { body } = draftEmail(
      { subject: 's', body: '{{termsBlock}}' },
      { ...facts, terms: { ...noTerms, loanAmount: 500000, rateType: 'either' } },
    );

    expect(body).toBe(
      ['What we are looking for:', '- Loan amount: $500,000', '- Rate: fixed or variable'].join('\n'),
    );
  });

  it('omits the whole terms block and its line when no terms are saved', () => {
    const { body } = draftEmail(
      { subject: 's', body: 'Intro\n\n{{termsBlock}}\n\nOutro' },
      { ...facts, terms: noTerms },
    );

    expect(body).toBe('Intro\n\nOutro');
  });

  it('asks nothing when there is no must-close date', () => {
    const { body } = draftEmail(
      { subject: 's', body: '{{timelineBlock}}' },
      { ...facts, mustCloseBy: null },
    );

    expect(body).toBe('Timeline:\n- Target close: October 30, 2026');
  });

  it('omits the timeline when there are no dates', () => {
    const { body } = draftEmail(
      { subject: 's', body: 'Intro\n{{timelineBlock}}\nOutro' },
      { ...facts, targetCloseDate: null, mustCloseBy: null },
    );

    expect(body).toBe('Intro\nOutro');
  });

  it('writes the default template with all four parts and the room link', () => {
    const { subject, body } = draftEmail(DEFAULT_TEMPLATE, facts);

    expect(subject).toContain('Acme HVAC');
    expect(body).toContain('Sam Buyer');
    expect(body).toContain('Loan amount: $500,000');
    expect(body).toContain('Can you close by November 30, 2026?');
    expect(body).toContain('https://app.test/lender/room-1');
    expect(body).not.toMatch(/null|undefined|\{\{/);
  });

  it('writes the default template without blanks when nothing optional is known', () => {
    const { body } = draftEmail(DEFAULT_TEMPLATE, {
      ...facts,
      ourName: null,
      terms: noTerms,
      targetCloseDate: null,
      mustCloseBy: null,
    });

    expect(body).not.toMatch(/null|undefined|\{\{|\n\n\n/);
    expect(body).not.toContain('Loan amount');
    expect(body).not.toContain('Timeline');
  });
});
