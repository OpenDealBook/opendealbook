import { describe, expect, it } from 'vitest';

import { buildBrokerCatchUpEmail, firstName } from './brokerCatchUpEmail';

describe('firstName', () => {
  it('takes the first whitespace-delimited token', () => {
    expect(firstName('Dana  Reyes')).toBe('Dana');
  });
});

describe('buildBrokerCatchUpEmail', () => {
  it('merges the broker name, updates, deal box summary and call link', () => {
    const { html, text } = buildBrokerCatchUpEmail({
      brokerFirstName: 'Dana',
      updates: 'We closed two deals this quarter.',
      dealBoxSummary: 'SaaS, 1-5M EBITDA.',
      bookACallUrl: 'https://cal.example/dana',
    });

    expect(text).toContain('Hi Dana,');
    expect(text).toContain('We closed two deals this quarter.');
    expect(text).toContain('SaaS, 1-5M EBITDA.');
    expect(text).toContain('https://cal.example/dana');
    expect(html).toContain('href="https://cal.example/dana"');
  });
});
