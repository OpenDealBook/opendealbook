import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MainContacts } from './main-contacts';

describe('MainContacts', () => {
  it('shows each main contact with their side, role, company, phone and email', () => {
    const html = renderToStaticMarkup(
      <MainContacts
        contacts={[
          {
            side: 'buyer',
            name: 'Dana Buyer',
            role: 'analyst',
            company: 'Acme Holdings',
            phone: '555-0100',
            email: 'dana@acme.test',
          },
          {
            side: 'lender',
            name: 'Lee Lender',
            role: 'lender',
            company: 'Bank one',
            phone: null,
            email: 'lee@bank.test',
          },
        ]}
      />,
    );

    expect(html).toContain('Main contacts');
    expect(html).toContain('Buyer');
    expect(html).toContain('Dana Buyer');
    expect(html).toContain('Team member');
    expect(html).toContain('Acme Holdings');
    expect(html).toContain('555-0100');
    expect(html).toContain('href="mailto:dana@acme.test"');
    expect(html).toContain('Lee Lender');
    expect(html).toContain('Bank one');
    expect(html).not.toContain('phone');
  });

  it('shows nothing when no main contact is set', () => {
    expect(renderToStaticMarkup(<MainContacts contacts={[]} />)).toBe('');
  });
});
