import { Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface ContractReviewReminderEmailProps {
  productName: string;
  contractLabel: string;
  version: number;
  dealName: string;
  subjectDealName: string;
  since: string;
  actionLink: string;
}

export function renderContractReviewReminderEmail(
  props: ContractReviewReminderEmailProps,
): Promise<RenderedEmail> {
  const subject = `Your sign-off on ${props.contractLabel} version ${props.version} for ${props.subjectDealName} is waiting`;

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading={`Your sign-off on ${props.contractLabel} version ${props.version} for ${props.dealName} is waiting`}
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">
        Your review of version {props.version} of the {props.contractLabel} on{' '}
        {props.dealName} was asked for on {props.since}. It cannot go for
        signature without your sign-off.
      </Text>
      <Section className="my-[24px] text-center">
        <EmailButton href={props.actionLink}>Review the contract</EmailButton>
      </Section>
    </EmailLayout>,
    subject,
  );
}
