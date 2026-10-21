import { describe, expect, it } from 'vitest';

import { draftNudge } from './draft-nudge';

describe('draftNudge', () => {
  it("greets the primary contact, lists every quiet deal with its days quiet, and signs off as the sender", () => {
    const body = draftNudge({
      contactName: 'Dana Reed',
      ourName: 'Sam Buyer',
      deals: [
        { dealName: 'Acme HVAC', daysSilent: 7 },
        { dealName: 'Beta Plumbing', daysSilent: 12 },
      ],
    });

    expect(body).toBe(
      [
        'Hi Dana Reed,',
        '',
        "Checking in on these deals. Here is how long it's been since we last heard from you:",
        'Acme HVAC, 7 days; Beta Plumbing, 12 days',
        '',
        'Any update you can share would help us plan.',
        '',
        'Thanks,',
        'Sam Buyer',
      ].join('\n'),
    );
  });

  it('says 1 day, not 1 days', () => {
    const body = draftNudge({
      contactName: 'Dana Reed',
      ourName: 'Sam Buyer',
      deals: [{ dealName: 'Acme HVAC', daysSilent: 1 }],
    });

    expect(body).toContain('\nAcme HVAC, 1 day\n');
  });
});
