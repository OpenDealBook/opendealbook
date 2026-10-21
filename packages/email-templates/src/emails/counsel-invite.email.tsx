import { Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout, FallbackLink } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface CounselInviteEmailProps {
  productName: string;
  side: 'buyer' | 'seller';
  inviterName: string;
  teamName: string;
  outsideName: string;
  dealName: string;
  signInLink: string;
}

function copy({
  side,
  inviterName,
  teamName,
  outsideName,
  dealName,
}: CounselInviteEmailProps) {
  if (side === 'seller') {
    return {
      subject: `${inviterName} invited you as their counsel on ${outsideName}`,
      heading: `${inviterName} invited you as their counsel on ${dealName}`,
      lead: `${inviterName} invited you to act as their counsel on the sale of ${dealName} to ${teamName}: review the documents in the seller room and comment for the seller.`,
    };
  }

  return {
    subject: `${inviterName} invited you as buyer's counsel on ${outsideName}`,
    heading: `${inviterName} invited you as buyer's counsel on ${dealName}`,
    lead: `${inviterName} at ${teamName} invited you to act as buyer's counsel on ${dealName}: review the deal documents and contracts, and comment for the team.`,
  };
}

export function renderCounselInviteEmail(
  props: CounselInviteEmailProps,
): Promise<RenderedEmail> {
  const { subject, heading, lead } = copy(props);

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading={heading}
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">
        {lead} Use the button below to sign in. The link can be used once.
      </Text>
      <Section className="my-[24px] text-center">
        <EmailButton href={props.signInLink}>Open the deal</EmailButton>
      </Section>
      <FallbackLink href={props.signInLink} />
    </EmailLayout>,
    subject,
  );
}
