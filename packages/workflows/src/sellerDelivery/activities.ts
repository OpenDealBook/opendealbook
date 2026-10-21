import { ApplicationFailure } from '@temporalio/common';

import { EMAIL_TEMPLATE_RENDERERS, personalSender } from '@odb/email-templates';
import { getMailer } from '@odb/mailers';
import { sellerAttachmentName } from '@odb/seller-rooms/files/document-name.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

export interface SellerDeliveryInput {
  shareId: string;
  recipientEmail: string;
  recipientName: string;
  documentUrl: string;
  senderUserId: string;
}

export async function deliverDocumentToSeller(
  input: SellerDeliveryInput,
): Promise<void> {
  const from = process.env.SELLER_DELIVERY_FROM_EMAIL;

  if (!from) {
    throw ApplicationFailure.nonRetryable(
      'Missing required environment variable: SELLER_DELIVERY_FROM_EMAIL',
    );
  }

  const admin = getSupabaseServerAdminClient();

  const { data: share } = await admin
    .from('document_share')
    .select(
      'delivered_at, accounts(name), generated_document(pdf_path, document_template(name), deal(code_name, firm!inner(name)))',
    )
    .eq('id', input.shareId)
    .maybeSingle()
    .throwOnError();

  if (!share || share.delivered_at) {
    return;
  }

  const { data: sharer } = await admin
    .from('accounts')
    .select('name, email')
    .eq('primary_owner_user_id', input.senderUserId)
    .eq('is_personal_account', true)
    .single()
    .throwOnError();

  const { data: pdf, error } = await admin.storage
    .from('generated')
    .download(share.generated_document.pdf_path!);

  if (error) {
    throw error;
  }

  const rendered = await EMAIL_TEMPLATE_RENDERERS['seller-document']({
    productName: 'Open Deal Book',
    sellerName: input.recipientName,
    teamName: share.accounts.name,
    outsideName:
      share.generated_document.deal.code_name ??
      share.generated_document.deal.firm.name,
    dealName: share.generated_document.deal.firm.name,
    documentLink: input.documentUrl,
  });

  const mailer = await getMailer();

  await mailer.sendEmail({
    to: input.recipientEmail,
    ...personalSender(sharer, from),
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    attachments: [
      {
        filename: sellerAttachmentName(
          share.generated_document.document_template?.name ?? null,
          share.generated_document.deal.firm.name,
        ),
        content: new Uint8Array(await pdf.arrayBuffer()),
        contentType: 'application/pdf',
      },
    ],
  });

  await admin
    .from('document_share')
    .update({ delivered_at: new Date().toISOString() })
    .eq('id', input.shareId)
    .throwOnError();
}
