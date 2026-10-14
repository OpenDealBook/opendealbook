import { Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface LenderNoticeEmailProps {
  productName: string;
  subject: string;
  message: string;
  actionLabel: string;
  actionLink: string;
}

export function renderLenderNoticeEmail(
  props: LenderNoticeEmailProps,
): Promise<RenderedEmail> {
  return renderTemplate(
    <EmailLayout
      preview={props.subject}
      heading={props.subject}
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">{props.message}</Text>
      <Section className="my-[24px] text-center">
        <EmailButton href={props.actionLink}>{props.actionLabel}</EmailButton>
      </Section>
    </EmailLayout>,
    props.subject,
  );
}
