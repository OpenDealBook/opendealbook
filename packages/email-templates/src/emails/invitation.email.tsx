import { Link, Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface InvitationEmailProps {
  productName: string;
  teamName: string;
  inviter?: string;
  invitedEmail: string;
  invitationLink: string;
}

export function renderInvitationEmail(
  props: InvitationEmailProps,
): Promise<RenderedEmail> {
  const subject = `You are invited to join ${props.teamName} on ${props.productName}`;
  const invitedBy = props.inviter
    ? `${props.inviter} has invited you`
    : 'You have been invited';

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading={`Join ${props.teamName}`}
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">
        {invitedBy} to join the {props.teamName} team on {props.productName}.
      </Text>
      <Section className="my-[24px] text-center">
        <EmailButton href={props.invitationLink}>Accept invitation</EmailButton>
      </Section>
      <Text className="text-[14px] leading-[24px]">
        Or paste this link into your browser:{' '}
        <Link href={props.invitationLink} className="text-blue-600">
          {props.invitationLink}
        </Link>
      </Text>
      <Text className="text-[12px] text-[#8898aa]">
        This invitation was intended for {props.invitedEmail}.
      </Text>
    </EmailLayout>,
    subject,
  );
}
