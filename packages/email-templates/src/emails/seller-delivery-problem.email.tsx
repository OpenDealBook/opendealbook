import { Text } from 'react-email';

import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface SellerDeliveryProblemEmailProps {
  productName: string;
  message: string;
}

export function renderSellerDeliveryProblemEmail(
  props: SellerDeliveryProblemEmailProps,
): Promise<RenderedEmail> {
  const subject = 'A document was not delivered to a seller';

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading={subject}
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">{props.message}</Text>
    </EmailLayout>,
    subject,
  );
}
