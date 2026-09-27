import { Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface WelcomeEmailProps {
  productName: string;
  userName?: string;
  actionLink?: string;
}

export function renderWelcomeEmail(
  props: WelcomeEmailProps,
): Promise<RenderedEmail> {
  const subject = `Welcome to ${props.productName}`;
  const heading = props.userName ? `Welcome, ${props.userName}` : 'Welcome';

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading={heading}
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">
        Thanks for joining {props.productName}. We are glad to have you on
        board.
      </Text>
      {props.actionLink ? (
        <Section className="my-[24px] text-center">
          <EmailButton href={props.actionLink}>Get started</EmailButton>
        </Section>
      ) : null}
    </EmailLayout>,
    subject,
  );
}
