import { Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout, FallbackLink } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface SellerQuestionEmailProps {
  productName: string;
  askerName: string;
  teamName: string;
  outsideName: string;
  dealName: string;
  questionTitle: string;
  roomLink: string;
}

export function renderSellerQuestionEmail(
  props: SellerQuestionEmailProps,
): Promise<RenderedEmail> {
  const subject = `${props.askerName} asked about ${props.outsideName}: ${props.questionTitle}`;

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading={`${props.askerName} asked about ${props.dealName}`}
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">
        {props.askerName} at {props.teamName} asked a question about{' '}
        {props.dealName}:
      </Text>
      <Text className="text-[16px] leading-[24px]">{props.questionTitle}</Text>
      <Section className="my-[24px] text-center">
        <EmailButton href={props.roomLink}>Answer in the room</EmailButton>
      </Section>
      <FallbackLink href={props.roomLink} />
    </EmailLayout>,
    subject,
  );
}
