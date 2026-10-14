import { Link, Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface LenderSignInEmailProps {
  productName: string;
  signInLink: string;
}

export function renderLenderSignInEmail(
  props: LenderSignInEmailProps,
): Promise<RenderedEmail> {
  const subject = `Your ${props.productName} lender room sign-in link`;

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading="Open your lender room"
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">
        Use the button below to sign in to your lender room. The link can be
        used once.
      </Text>
      <Section className="my-[24px] text-center">
        <EmailButton href={props.signInLink}>Sign in</EmailButton>
      </Section>
      <Text className="text-[14px] leading-[24px]">
        Or paste this link into your browser:{' '}
        <Link href={props.signInLink} className="text-blue-600">
          {props.signInLink}
        </Link>
      </Text>
    </EmailLayout>,
    subject,
  );
}
