import { Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface SellerCounselMessageEmailProps {
  productName: string;
  authorName: string;
  businessName: string;
  subjectDealName: string;
  actionLink: string;
}

export function renderSellerCounselMessageEmail(
  props: SellerCounselMessageEmailProps,
): Promise<RenderedEmail> {
  const subject = `New private message from ${props.authorName} on ${props.subjectDealName}`;

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading={`New private message from ${props.authorName}`}
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">
        {`${props.authorName} sent you a private message about ${props.businessName}.`}
      </Text>
      <Section className="my-[24px] text-center">
        <EmailButton href={props.actionLink}>Read the message</EmailButton>
      </Section>
    </EmailLayout>,
    subject,
  );
}
