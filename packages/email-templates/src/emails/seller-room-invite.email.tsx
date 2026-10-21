import { Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout, FallbackLink } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface SellerRoomInviteEmailProps {
  productName: string;
  inviterName: string;
  teamName: string;
  outsideName: string;
  dealName: string;
  signInLink: string;
}

export function renderSellerRoomInviteEmail(
  props: SellerRoomInviteEmailProps,
): Promise<RenderedEmail> {
  const subject = `${props.inviterName} invited you to the room for ${props.outsideName}`;

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading={`${props.inviterName} invited you to the room for ${props.dealName}`}
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">
        {props.inviterName} at {props.teamName} invited you to a private room
        for {props.dealName}, where you can share documents and answer their
        questions.
      </Text>
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
