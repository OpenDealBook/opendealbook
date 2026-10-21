import { Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface ContractReviewUnansweredEmailProps {
  productName: string;
  counselLabel: string;
  contractLabel: string;
  version: number;
  dealName: string;
  since: string;
  actionLink: string;
}

export function renderContractReviewUnansweredEmail(
  props: ContractReviewUnansweredEmailProps,
): Promise<RenderedEmail> {
  const subject = `${props.counselLabel} hasn't answered on ${props.contractLabel} version ${props.version}`;

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading={subject}
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">
        {props.counselLabel} hasn't answered the review of version{' '}
        {props.version} of the {props.contractLabel} on {props.dealName} asked
        for on {props.since}.
      </Text>
      <Section className="my-[24px] text-center">
        <EmailButton href={props.actionLink}>Open the deal</EmailButton>
      </Section>
    </EmailLayout>,
    subject,
  );
}
