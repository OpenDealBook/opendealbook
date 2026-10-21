import { Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout, FallbackLink } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface SellerDocumentEmailProps {
  productName: string;
  sellerName: string;
  teamName: string;
  outsideName: string;
  dealName: string;
  documentLink: string;
}

export function renderSellerDocumentEmail(
  props: SellerDocumentEmailProps,
): Promise<RenderedEmail> {
  const subject = `${props.teamName} shared a document about ${props.outsideName} for you to review`;

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading={`${props.teamName} shared a document about ${props.dealName} for you to review`}
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">Hi {props.sellerName},</Text>
      <Text className="text-[16px] leading-[24px]">
        {props.teamName} shared a document about {props.dealName} for you to
        review. Open it online with the button below. A PDF copy is attached to
        this email.
      </Text>
      <Section className="my-[24px] text-center">
        <EmailButton href={props.documentLink}>Open the document</EmailButton>
      </Section>
      <FallbackLink href={props.documentLink} />
    </EmailLayout>,
    subject,
  );
}
