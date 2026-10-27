import { describe, expect, it } from 'vitest';

import { dealBoxMergeFields, renderTemplate } from './merge';
import { DEFAULT_OUTREACH_SEQUENCES } from './sequences';

describe('DEFAULT_OUTREACH_SEQUENCES', () => {
  it('offers a disabled letter, then email +7 days, then email +7 days starter', () => {
    const starter = DEFAULT_OUTREACH_SEQUENCES.find((sequence) =>
      sequence.steps.some((step) => step.channel === 'letter'),
    );

    expect(starter?.enabled).toBe(false);
    expect(
      starter?.steps.map(({ ordinal, delayDays, channel }) => ({ ordinal, delayDays, channel })),
    ).toEqual([
      { ordinal: 1, delayDays: 0, channel: 'letter' },
      { ordinal: 2, delayDays: 7, channel: 'email' },
      { ordinal: 3, delayDays: 7, channel: 'email' },
    ]);
  });

  it('keeps the existing email starters enabled', () => {
    const emailOnly = DEFAULT_OUTREACH_SEQUENCES.filter((sequence) =>
      sequence.steps.every((step) => step.channel === 'email'),
    );

    expect(emailOnly.map((sequence) => sequence.enabled)).toEqual([true, true]);
  });

  it('reads naturally when the recipient has no name', () => {
    const rendered = DEFAULT_OUTREACH_SEQUENCES.flatMap((sequence) => sequence.steps).map((step) =>
      renderTemplate(step.body, {
        recipient: { email: 'owner@firm.test' },
        firm: { name: 'Acme HVAC' },
        dealBox: dealBoxMergeFields({ industries: 'HVAC', revenueRange: '$1,000,000' }),
        sender: { name: 'Jordan Buyer', company: 'Beacon Partners' },
      }),
    );

    for (const body of rendered) {
      expect(body.split('\n')[0]).toMatch(/^(Hi there,|Dear owner of Acme HVAC,)$/);
      expect(body).not.toMatch(/ ,|  /);
    }
  });

  it('reads naturally for an empty deal box and keeps the details when it is full', () => {
    const render = (dealBox: Parameters<typeof dealBoxMergeFields>[0]) =>
      DEFAULT_OUTREACH_SEQUENCES.flatMap((sequence) => sequence.steps)
        .map((step) =>
          renderTemplate(step.body, {
            firm: { name: 'Acme HVAC' },
            dealBox: dealBoxMergeFields(dealBox),
            sender: { name: 'Jordan Buyer', company: 'Beacon Partners' },
          }),
        )
        .join('\n');

    const empty = render({});
    expect(empty).toContain('acquire a business, and Acme HVAC keeps coming up');
    expect(empty).toContain('acquire a business.');
    expect(empty).not.toMatch(/  |around|in revenue/);

    const full = render({ industries: 'HVAC', revenueRange: '$1,000,000' });
    expect(full).toContain('acquire a HVAC business around $1,000,000 in revenue, and Acme HVAC');
    expect(full).toContain('acquire a HVAC business around $1,000,000 in revenue.');
  });

  it('never fakes a reply in a subject, since follow-ups thread under the first email', () => {
    const subjects = DEFAULT_OUTREACH_SEQUENCES.flatMap((sequence) => sequence.steps).flatMap((step) =>
      step.channel === 'email' ? [step.subject] : [],
    );

    expect(subjects.filter((subject) => /^re:/i.test(subject))).toEqual([]);
  });
});
