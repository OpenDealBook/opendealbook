import { describe, expect, it } from 'vitest';

import { EMAIL_TEMPLATE_RENDERERS } from '../registry';

const update = {
  productName: 'Open Deal Book',
  teamName: 'Harbor Capital',
  dealName: 'Project Atlas',
  subject: 'Closing moves to December',
  body: 'The lender needs two more weeks for the appraisal.',
};

describe('deal update email', () => {
  it('carries the update subject and body, with one link per place the person can open', async () => {
    const email = await EMAIL_TEMPLATE_RENDERERS['deal-update']({
      ...update,
      links: [
        { label: 'First Bank lender room', href: 'https://odb.test/lender/r1' },
        { label: 'Counsel portal', href: 'https://odb.test/counsel/d1' },
      ],
    });

    expect(email.subject).toBe('Closing moves to December');
    expect(email.text).toContain(
      'The lender needs two more weeks for the appraisal.',
    );
    expect(email.html).toContain('href="https://odb.test/lender/r1"');
    expect(email.html).toContain('href="https://odb.test/counsel/d1"');
    expect(email.text).toContain('First Bank lender room');
    expect(email.text).toContain('Counsel portal');
  });

  it('sends the body alone to someone with no place to open', async () => {
    const email = await EMAIL_TEMPLATE_RENDERERS['deal-update']({
      ...update,
      links: [],
    });

    expect(email.text).toContain(
      'The lender needs two more weeks for the appraisal.',
    );
    expect(email.html).not.toContain('href=');
  });

  it('tells the person why they got it, whatever their notification settings', async () => {
    const email = await EMAIL_TEMPLATE_RENDERERS['deal-update']({
      ...update,
      links: [],
    });

    expect(email.text).toContain(
      'Harbor Capital sent you this update about Project Atlas. Deal updates are sent regardless of notification settings.',
    );
  });
});
