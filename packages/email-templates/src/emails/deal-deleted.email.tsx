import { Text } from 'react-email';

import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface DealDeletedEmailProps {
  productName: string;
  teamName: string;
  dealName: string;
}

export function renderDealDeletedEmail(
  props: DealDeletedEmailProps,
): Promise<RenderedEmail> {
  const subject = `${props.teamName} deleted the deal room for ${props.dealName}`;

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading={subject}
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">
        {subject}. Its files and messages are no longer available.
      </Text>
    </EmailLayout>,
    subject,
  );
}
