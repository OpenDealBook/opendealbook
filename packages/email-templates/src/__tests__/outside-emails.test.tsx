import { describe, expect, it } from 'vitest';

import {
  personalSender,
  renderDealDeletedEmail,
  renderLenderInviteEmail,
} from '../index';
import { EMAIL_TEMPLATE_RENDERERS } from '../registry';

const LINK = 'https://opendealbook.app/seller/rooms/r1';

describe('personal sender', () => {
  it('sends as the person, via Open Deal Book, from the configured address, with replies to them', () => {
    expect(
      personalSender(
        { name: 'Morgan Reyes', email: 'morgan@acme.test' },
        'Deals <deals@odb.test>',
      ),
    ).toEqual({
      from: '"Morgan Reyes via Open Deal Book" <deals@odb.test>',
      replyTo: 'morgan@acme.test',
    });
  });

  it('accepts a bare configured address', () => {
    expect(
      personalSender(
        { name: 'Morgan Reyes', email: 'morgan@acme.test' },
        'deals@odb.test',
      ).from,
    ).toBe('"Morgan Reyes via Open Deal Book" <deals@odb.test>');
  });

  it('sends replies to the product address when the person has no email', () => {
    expect(
      personalSender(
        { name: 'Morgan Reyes', email: null },
        'Deals <deals@odb.test>',
      ),
    ).toEqual({
      from: '"Morgan Reyes via Open Deal Book" <deals@odb.test>',
      replyTo: 'deals@odb.test',
    });
  });

  it('escapes quotes and backslashes in the name', () => {
    expect(
      personalSender(
        { name: 'Morgan "Mo" Re\\yes', email: null },
        'deals@odb.test',
      ).from,
    ).toBe('"Morgan \\"Mo\\" Re\\\\yes via Open Deal Book" <deals@odb.test>');
  });
});

describe('seller question email', () => {
  const render = () =>
    EMAIL_TEMPLATE_RENDERERS['seller-question']({
      productName: 'Open Deal Book',
      askerName: 'Morgan Reyes',
      teamName: 'Acme Partners',
      outsideName: 'Project Atlas',
      dealName: 'Brennan Tooling',
      questionTitle: 'Customer list?',
      roomLink: LINK,
    });

  it('names the deal by its outside name and the question in the subject and preview', async () => {
    const { subject, html } = await render();

    expect(subject).toBe(
      'Morgan Reyes asked about Project Atlas: Customer list?',
    );
    expect(html).toContain(
      'Morgan Reyes asked about Project Atlas: Customer list?',
    );
  });

  it('says who asked and what they need', async () => {
    const { text } = await render();

    expect(text).toContain(
      'Morgan Reyes at Acme Partners asked a question about Brennan Tooling:',
    );
    expect(text).toContain('Customer list?');
  });

  it('wraps the pasted link so it fits a phone screen', async () => {
    const { html } = await render();

    expect(
      html.match(
        /<a[^>]*style="([^"]*)"[^>]*>https:\/\/opendealbook\.app/,
      )?.[1],
    ).toContain('word-break:break-all');
  });
});

describe('pasted links in outside emails', () => {
  it.each([
    [
      'counsel invite',
      () =>
        EMAIL_TEMPLATE_RENDERERS['counsel-invite']({
          productName: 'Open Deal Book',
          side: 'buyer',
          inviterName: 'Morgan Reyes',
          teamName: 'Acme Partners',
          outsideName: 'Project Atlas',
          dealName: 'Project Atlas',
          signInLink: LINK,
        }),
    ],
    [
      'seller room invite',
      () =>
        EMAIL_TEMPLATE_RENDERERS['seller-room-invite']({
          productName: 'Open Deal Book',
          inviterName: 'Morgan Reyes',
          teamName: 'Acme Partners',
          outsideName: 'Project Atlas',
          dealName: 'Brennan Tooling',
          signInLink: LINK,
        }),
    ],
    [
      'seller document',
      () =>
        EMAIL_TEMPLATE_RENDERERS['seller-document']({
          productName: 'Open Deal Book',
          sellerName: 'Sam Seller',
          teamName: 'Acme Partners',
          outsideName: 'Project Atlas',
          dealName: 'Brennan Tooling',
          documentLink: LINK,
        }),
    ],
  ])('wraps the %s link so it fits a phone screen', async (_email, render) => {
    const { html } = await render();

    expect(
      html.match(
        /<a[^>]*style="([^"]*)"[^>]*>https:\/\/opendealbook\.app/,
      )?.[1],
    ).toContain('word-break:break-all');
  });
});

describe('seller room invite email', () => {
  const render = () =>
    EMAIL_TEMPLATE_RENDERERS['seller-room-invite']({
      productName: 'Open Deal Book',
      inviterName: 'Morgan Reyes',
      teamName: 'Acme Partners',
      outsideName: 'Project Atlas',
      dealName: 'Brennan Tooling',
      signInLink: LINK,
    });

  it('names the inviter and the outside name in the subject', async () => {
    expect((await render()).subject).toBe(
      'Morgan Reyes invited you to the room for Project Atlas',
    );
  });

  it('names the business in the body and says what the room is for', async () => {
    expect((await render()).text).toContain(
      'Morgan Reyes at Acme Partners invited you to a private room for Brennan Tooling, where you can share documents and answer their questions.',
    );
  });
});

describe('seller room removed email', () => {
  const render = () =>
    EMAIL_TEMPLATE_RENDERERS['seller-room-removed']({
      productName: 'Open Deal Book',
      removerName: 'Morgan Reyes',
      teamName: 'Acme Partners',
      outsideName: 'Project Atlas',
      dealName: 'Brennan Tooling',
    });

  it('names the outside name in the subject', async () => {
    expect((await render()).subject).toBe(
      'You were removed from the room for Project Atlas',
    );
  });

  it('says who removed them from which business, and where their files stay', async () => {
    expect((await render()).text).toContain(
      'Morgan Reyes at Acme Partners removed you from the room for Brennan Tooling. The files you uploaded stay with Acme Partners.',
    );
  });
});

describe('seller sign-in email', () => {
  it('lists outside names in the subject and business names in the body', async () => {
    const email = await EMAIL_TEMPLATE_RENDERERS['seller-sign-in']({
      productName: 'Open Deal Book',
      deals: [
        { name: 'Brennan Tooling', outsideName: 'Project Atlas' },
        { name: 'Harbor Marine', outsideName: 'Harbor Marine' },
      ],
      signInLink: LINK,
    });

    expect(email.subject).toBe(
      'Your sign-in link for Project Atlas and Harbor Marine',
    );
    expect(email.text).toContain(
      'sign in to your room for Brennan Tooling and Harbor Marine',
    );
  });
});

describe('counsel invite email', () => {
  it("names the team's inviter and the outside name for buyer's counsel", async () => {
    const email = await EMAIL_TEMPLATE_RENDERERS['counsel-invite']({
      productName: 'Open Deal Book',
      side: 'buyer',
      inviterName: 'Morgan Reyes',
      teamName: 'Acme Partners',
      outsideName: 'Project Atlas',
      dealName: 'Project Atlas',
      signInLink: LINK,
    });

    expect(email.subject).toBe(
      "Morgan Reyes invited you as buyer's counsel on Project Atlas",
    );
    expect(email.text).toContain(
      "Morgan Reyes at Acme Partners invited you to act as buyer's counsel on Project Atlas: review the deal documents and contracts, and comment for the team.",
    );
  });

  it("puts the outside name in the subject and the business in the body for seller's counsel", async () => {
    const email = await EMAIL_TEMPLATE_RENDERERS['counsel-invite']({
      productName: 'Open Deal Book',
      side: 'seller',
      inviterName: 'Sam Seller',
      teamName: 'Acme Partners',
      outsideName: 'Project Atlas',
      dealName: 'Brennan Tooling',
      signInLink: LINK,
    });

    expect(email.subject).toBe(
      'Sam Seller invited you as their counsel on Project Atlas',
    );
    expect(email.text).toContain(
      'Sam Seller invited you to act as their counsel on the sale of Brennan Tooling to Acme Partners: review the documents in the seller room and comment for the seller.',
    );
  });
});

describe('counsel sign-in email', () => {
  it('lists outside names in the subject and the given names in the body', async () => {
    const email = await EMAIL_TEMPLATE_RENDERERS['counsel-sign-in']({
      productName: 'Open Deal Book',
      deals: [{ name: 'Brennan Tooling', outsideName: 'Project Atlas' }],
      signInLink: LINK,
    });

    expect(email.subject).toBe('Your sign-in link for Project Atlas');
    expect(email.text).toContain('sign in as counsel on Brennan Tooling');
  });
});

describe('lender invite email', () => {
  const invite = {
    productName: 'Open Deal Book',
    inviterName: 'Morgan Reyes',
    buyerTeam: 'Acme Partners',
    outsideName: 'Project Atlas',
    loanAsk: '$1,200,000 SBA 7(a), 10-year term',
    closeBy: 'December 1, 2026',
    signInLink: LINK,
  };

  it('names the inviter, the borrower team, and the outside name, and says what is asked', async () => {
    expect((await renderLenderInviteEmail(invite)).subject).toBe(
      'Morgan Reyes at Acme Partners invited you to review a loan request for Project Atlas',
    );
  });

  it('carries the loan summary', async () => {
    const { text } = await renderLenderInviteEmail(invite);

    expect(text).toContain('Borrower: Acme Partners');
    expect(text).toContain('Business: Project Atlas');
    expect(text).toContain('Loan ask: $1,200,000 SBA 7(a), 10-year term');
    expect(text).toContain('Close by: December 1, 2026');
  });

  it('leaves out summary lines the team has not saved', async () => {
    const { text } = await renderLenderInviteEmail({
      ...invite,
      loanAsk: null,
      closeBy: null,
    });

    expect(text).not.toContain('Loan ask:');
    expect(text).not.toContain('Close by:');
  });

  it('wraps the pasted link so it fits a phone screen', async () => {
    const { html } = await renderLenderInviteEmail(invite);

    expect(
      html.match(
        /<a[^>]*style="([^"]*)"[^>]*>https:\/\/opendealbook\.app/,
      )?.[1],
    ).toContain('word-break:break-all');
  });
});

describe('seller document email', () => {
  const render = () =>
    EMAIL_TEMPLATE_RENDERERS['seller-document']({
      productName: 'Open Deal Book',
      sellerName: 'Sam Seller',
      teamName: 'Acme Partners',
      outsideName: 'Project Atlas',
      dealName: 'Brennan Tooling',
      documentLink: LINK,
    });

  it('names the outside name and the ask in the subject', async () => {
    expect((await render()).subject).toBe(
      'Acme Partners shared a document about Project Atlas for you to review',
    );
  });

  it('names the business in the body', async () => {
    expect((await render()).text).toContain(
      'Acme Partners shared a document about Brennan Tooling for you to review.',
    );
  });
});

describe('deal deleted email', () => {
  const render = () =>
    renderDealDeletedEmail({
      productName: 'Open Deal Book',
      teamName: 'Acme Partners',
      dealName: 'Project Atlas',
    });

  it('names the team and the deal in the subject', async () => {
    expect((await render()).subject).toBe(
      'Acme Partners deleted the deal room for Project Atlas',
    );
  });

  it('says the room and its files are gone, with nothing to open', async () => {
    const email = await render();

    expect(email.text).toContain(
      'Acme Partners deleted the deal room for Project Atlas. Its files and messages are no longer available.',
    );
    expect(email.html).not.toContain('<a ');
  });
});
