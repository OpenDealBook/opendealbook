import { Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout, FallbackLink } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface LenderInviteEmailProps {
  productName: string;
  inviterName: string;
  buyerTeam: string;
  outsideName: string;
  loanAsk: string | null;
  closeBy: string | null;
  signInLink: string;
}

export function renderLenderInviteEmail(
  props: LenderInviteEmailProps,
): Promise<RenderedEmail> {
  const subject = `${props.inviterName} at ${props.buyerTeam} invited you to review a loan request for ${props.outsideName}`;
  const summary = [
    `Borrower: ${props.buyerTeam}`,
    `Business: ${props.outsideName}`,
    props.loanAsk && `Loan ask: ${props.loanAsk}`,
    props.closeBy && `Close by: ${props.closeBy}`,
  ].filter((line) => line !== null);

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading={subject}
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">
        {props.inviterName} at {props.buyerTeam} invited you to a private lender
        room to review their loan request.
      </Text>
      <Section className="my-[16px]">
        {summary.map((line) => (
          <Text key={line} className="m-0 text-[16px] leading-[24px]">
            {line}
          </Text>
        ))}
      </Section>
      <Text className="text-[16px] leading-[24px]">
        Use the button below to sign in and open the room. The link can be used
        once.
      </Text>
      <Section className="my-[24px] text-center">
        <EmailButton href={props.signInLink}>Open the room</EmailButton>
      </Section>
      <FallbackLink href={props.signInLink} />
    </EmailLayout>,
    subject,
  );
}
