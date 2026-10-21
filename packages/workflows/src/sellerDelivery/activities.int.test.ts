import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  provisionAccount,
  seedDeal,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

const mailer = vi.hoisted(() => ({
  sendEmail: vi.fn(async () => ({ messageId: 'mock-message-id' })),
}));

vi.mock('@odb/mailers', () => ({ getMailer: async () => mailer }));

import { deliverDocumentToSeller } from './activities';

const pdf = new TextEncoder().encode('%PDF-1.4 seller copy');

let account: IntegrationAccount;
let pdfPath: string;
let shareId: string;
let senderEmail: string | null;

beforeEach(async () => {
  account = await provisionAccount();
  process.env.SELLER_DELIVERY_FROM_EMAIL = 'Deals <deals@odb.test>';

  await account.admin
    .from('accounts')
    .update({ name: 'Acme Partners' })
    .eq('id', account.accountId)
    .throwOnError();
  const { data: sender } = await account.admin
    .from('accounts')
    .update({ name: 'Morgan Reyes' })
    .eq('primary_owner_user_id', account.userId)
    .eq('is_personal_account', true)
    .select('email')
    .single()
    .throwOnError();
  senderEmail = sender.email;

  const { data: firm } = await account.admin
    .from('firm')
    .insert({ account_id: account.accountId, name: 'Acme' })
    .select('id')
    .single()
    .throwOnError();

  const dealId = await seedDeal(
    account.admin,
    account.accountId,
    account.userId,
    {
      description: 'Seller delivery deal',
      firm_id: firm.id,
    },
  );
  await account.admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.updated',
      p_payload: { code_name: 'Project Atlas' },
      p_actor_kind: 'service',
    })
    .throwOnError();

  const { data: template } = await account.admin
    .from('document_template')
    .insert({ account_id: account.accountId, name: 'LOI', type: 'loi' })
    .select('id')
    .single()
    .throwOnError();

  pdfPath = `${account.accountId}/${dealId}/${crypto.randomUUID()}.pdf`;

  await account.admin.storage
    .from('generated')
    .upload(pdfPath, pdf, { contentType: 'application/pdf' })
    .then(({ error }) => {
      if (error) throw error;
    });

  const { data: generated } = await account.admin
    .from('generated_document')
    .insert({
      account_id: account.accountId,
      deal_id: dealId,
      template_id: template.id,
      pdf_path: pdfPath,
    })
    .select('id')
    .single()
    .throwOnError();

  const { data: share } = await account.admin
    .from('document_share')
    .insert({
      account_id: account.accountId,
      generated_document_id: generated.id,
      recipient_user_id: account.userId,
      permission: 'view',
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single()
    .throwOnError();

  shareId = share.id;
  mailer.sendEmail.mockClear();
});

afterEach(async () => {
  delete process.env.SELLER_DELIVERY_FROM_EMAIL;
  await account.admin.storage.from('generated').remove([pdfPath]);
  await account.cleanup();
});

function delivery() {
  return {
    shareId,
    recipientEmail: 'seller@odb.test',
    recipientName: 'Sam Seller',
    documentUrl: `https://app.odb.test/seller/documents/${shareId}`,
    senderUserId: account.userId,
  };
}

describe('deliverDocumentToSeller (integration)', () => {
  it('emails the seller a link to the document with the PDF attached', async () => {
    await deliverDocumentToSeller(delivery());

    expect(mailer.sendEmail).toHaveBeenCalledTimes(1);

    const [message] = mailer.sendEmail.mock.calls[0] as unknown as [
      {
        to: string;
        from: string;
        replyTo: string;
        subject: string;
        html: string;
        text: string;
        attachments: {
          filename: string;
          content: Uint8Array;
          contentType: string;
        }[];
      },
    ];

    expect(message.to).toBe('seller@odb.test');
    expect(message.from).toBe(
      '"Morgan Reyes via Open Deal Book" <deals@odb.test>',
    );
    expect(message.replyTo).toBe(senderEmail);
    expect(message.subject).toBe(
      'Acme Partners shared a document about Project Atlas for you to review',
    );
    expect(message.text).toContain(
      'Acme Partners shared a document about Acme for you to review.',
    );
    expect(`${message.subject}${message.text}${message.html}`).not.toContain(
      'Seller delivery deal',
    );
    expect(message.html).toContain(delivery().documentUrl);
    expect(message.text).toContain(delivery().documentUrl);
    expect(message.attachments).toEqual([
      {
        filename: 'LOI - Acme.pdf',
        content: pdf,
        contentType: 'application/pdf',
      },
    ]);
  });

  it('sends the email once when the activity runs again after delivering', async () => {
    await deliverDocumentToSeller(delivery());
    await deliverDocumentToSeller(delivery());

    expect(mailer.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('sends nothing and fails without retrying when no sender address is configured', async () => {
    delete process.env.SELLER_DELIVERY_FROM_EMAIL;

    await expect(deliverDocumentToSeller(delivery())).rejects.toMatchObject({
      nonRetryable: true,
      message: expect.stringContaining('SELLER_DELIVERY_FROM_EMAIL'),
    });
    expect(mailer.sendEmail).not.toHaveBeenCalled();
  });

  it('ends quietly when the share was deleted before delivery', async () => {
    await account.admin
      .from('document_share')
      .delete()
      .eq('id', shareId)
      .throwOnError();

    await expect(deliverDocumentToSeller(delivery())).resolves.toBeUndefined();
    expect(mailer.sendEmail).not.toHaveBeenCalled();
  });
});
